{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'gold', 'funil']
  )
}}

/*
  fct_funil  (GOLD)
  --------------------------------------------------------------------------
  Funil de vendas no grao de DEAL enriquecido: 1 linha por deal_id
  + linhas de venda TVD orfas (deal_id NULL) -- FULL nas vendas do time de
  vendas para nao perder nenhuma (colabs, venda sem deal casavel).

  Decisoes (ver Bigquery/arquitetura.md e o plano):
  - Topo de funil = DEAL (robusto a colabs). Leads so enriquecem (midia).
  - Fonte de verdade da VENDA = transactions com sales_channel='TVD'
    (NAO usa deal_status='WON'); a venda conta para o seller_pmp da transactions.
  - Ativacao (data + vendedor) vem de int_sales_team__deal_activation.
  - Atribuicao dupla: seller_ativado (dono na ativacao) x seller_venda (PMO da
    transactions) carregados lado a lado -- quem consome escolhe.
  - Atribuicao venda->deal: a venda (agregada por person x product) vai para o
    deal do mesmo person x product com maior activated_at <= data_venda (fallback
    maior created_at). Evita duplicar GMV quando a pessoa tem >1 deal do produto.
  - Pesquisa e midia entram por person_id x product_id (pesquisa nao obrigatoria
    -> has_pesquisa pode ser falso).
*/

with deals as (
    select
        d.deal_id,
        d.person_id,
        d.product_id,
        d.created_at                                    as created_at_raw,
        d.group_name                                    as grupo_origem,
        d.origin_name                                   as origem,
        d.tier_final                                    as tier,
        d.tier_origem,
        json_value(d.fields, '$.origem_do_lead')        as origem_do_lead,
        json_value(d.fields, '$.segmentacao_ativado')   as segmentacao_ativado,
        d.especialista,
        d.carrinho_abandonado
    from {{ ref('int_sales_team__clint_deals_cleaned_with_person_id') }} d
),

deals_com_ativacao as (
    select
        d.*,
        a.first_stage_at,
        a.activated_at,
        a.seller_ativado_pmp,
        a.seller_ativado_nome,
        a.engaged_at,
        a.seller_engajado_pmp,
        a.seller_engajado_nome,
        -- data_criacao corrigida: usa o 1o toque do historico quando anterior ao
        -- created_at (re-import em lote tem created_at posterior ao historico real).
        least(d.created_at_raw, ifnull(a.first_stage_at, d.created_at_raw)) as data_criacao,
        case
            when a.first_stage_at is not null and a.first_stage_at < d.created_at_raw
                then 'historico'
            else 'created_at'
        end as data_criacao_origem
    from deals d
    left join {{ ref('int_sales_team__deal_activation') }} a using (deal_id)
),

vendas as (
    select
        person_id,
        product_id,
        transaction_created_at as data_venda,
        gmv,
        -- remap de vendedor (HC) conforme arquitetura.md
        case
            when seller_pmp like 'BPS_UPSELLVALE%' then 'BPS'
            when seller_pmp = 'VBP'                then 'VPB'
            when seller_pmp = 'JCK'                then 'JKC'
            else seller_pmp
        end                     as seller_venda_pmp,
        seller_name             as seller_venda_nome
    from {{ ref('int_sales_team__transactions_with_sales_request_with_person_id') }}
    where sales_channel = 'TVD'
      and not coalesce(is_refunded, false)         -- venda liquida (exclui reembolso), igual a int net
      and not coalesce(is_venda_duplicada, false)  -- exclui 'Consultor de Elite #FINCLASS' (dup do mrt)
      and person_id is not null
      and product_id is not null
),

vendas_agg as (
    select
        person_id,
        product_id,
        count(*)        as n_vendas,
        sum(gmv)        as gmv,
        min(data_venda) as data_venda,
        array_agg(seller_venda_pmp  order by data_venda desc, gmv desc)[safe_offset(0)] as seller_venda_pmp,
        array_agg(seller_venda_nome order by data_venda desc, gmv desc)[safe_offset(0)] as seller_venda_nome
    from vendas
    group by person_id, product_id
),

venda_para_deal as (
    select
        v.person_id,
        v.product_id,
        v.n_vendas,
        v.gmv,
        v.data_venda,
        v.seller_venda_pmp,
        v.seller_venda_nome,
        dk.deal_id as deal_id
    from vendas_agg v
    left join deals_com_ativacao dk
        on  v.person_id  = dk.person_id
        and v.product_id = dk.product_id
    qualify row_number() over (
        partition by v.person_id, v.product_id
        order by
            case when dk.activated_at is not null and dk.activated_at <= v.data_venda then 0 else 1 end,
            dk.activated_at desc,
            dk.data_criacao desc,
            dk.deal_id
    ) = 1
),

leads_midia as (
    select
        person_id,
        product_id,
        medium                                                                   as lead_medium,
        case when medium = 'PAG' then true when medium = 'ORG' then false end     as lead_is_pago,
        canal1                                                                    as lead_canal1,
        origem_description                                                        as lead_origem_description,
        campanha                                                                  as lead_campanha
    from {{ ref('int_sales_team__leads_with_person_id') }}
    where person_id is not null and product_id is not null
    qualify row_number() over (
        partition by person_id, product_id
        order by case when is_primary_person_campaign then 0 else 1 end, lead_created_at asc, uid asc
    ) = 1
),

pesquisa as (
    select
        person_id,
        product_id,
        true                          as has_pesquisa,
        survey_type,
        tier                          as tier_pesquisa,
        career_moment,
        education                     as education_pesquisa,
        wealth                        as wealth_pesquisa,
        invests                       as invests_pesquisa,
        consultant_interest,
        financial_market_knowledge
    from {{ ref('int_sales_team__pesquisas_compiladas_with_person_id') }}
    where person_id is not null and product_id is not null
    qualify row_number() over (
        partition by person_id, product_id order by createddate desc
    ) = 1
),

-- 1 linha por deal + vendas TVD orfas (sem deal casavel)
base_rows as (
    select
        d.deal_id,
        d.person_id,
        d.product_id,
        vp.n_vendas,
        vp.gmv,
        vp.data_venda,
        vp.seller_venda_pmp,
        vp.seller_venda_nome,
        vp.deal_id is not null as has_venda
    from deals_com_ativacao d
    left join venda_para_deal vp on vp.deal_id = d.deal_id

    union all

    select
        cast(null as string) as deal_id,
        v.person_id,
        v.product_id,
        v.n_vendas,
        v.gmv,
        v.data_venda,
        v.seller_venda_pmp,
        v.seller_venda_nome,
        true as has_venda
    from venda_para_deal v
    where v.deal_id is null
)

select
    b.deal_id,
    b.person_id,
    b.product_id,
    prod.nome                               as produto,
    pa.melhor_email,
    pa.melhor_telefone,
    d.data_criacao,
    d.data_criacao_origem,
    d.activated_at                          as data_ativado,
    d.engaged_at                            as data_engajado,
    b.data_venda,
    d.seller_ativado_pmp,
    d.seller_ativado_nome,
    d.seller_engajado_pmp,
    d.seller_engajado_nome,
    b.seller_venda_pmp,
    b.seller_venda_nome,
    (d.activated_at is not null)            as is_ativado,
    (d.engaged_at is not null)              as has_engajado,
    b.has_venda,
    coalesce(b.n_vendas, 0)                 as n_vendas,
    coalesce(b.gmv, 0)                      as gmv,
    'TVD'                                   as sales_channel,
    coalesce(s.has_pesquisa, false)         as has_pesquisa,
    s.survey_type,
    s.tier_pesquisa,
    s.career_moment,
    s.education_pesquisa,
    s.wealth_pesquisa,
    s.invests_pesquisa,
    s.consultant_interest,
    s.financial_market_knowledge,
    m.lead_medium,
    m.lead_is_pago,
    m.lead_canal1,
    m.lead_origem_description,
    m.lead_campanha,
    d.grupo_origem,
    d.origem,
    d.origem_do_lead,
    d.tier,
    d.tier_origem,
    d.segmentacao_ativado,
    d.especialista,
    d.carrinho_abandonado
from base_rows b
left join deals_com_ativacao                  d    on d.deal_id    = b.deal_id
left join {{ ref('int_sales_team__person_attributes') }} pa on pa.person_id = b.person_id
left join {{ ref('dim_produto') }}            prod on prod.product_id = b.product_id
left join leads_midia                         m    on m.person_id  = b.person_id and m.product_id = b.product_id
left join pesquisa                            s    on s.person_id  = b.person_id and s.product_id = b.product_id
