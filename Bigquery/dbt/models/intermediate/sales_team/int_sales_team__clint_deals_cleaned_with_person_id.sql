{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity', 'product']
  )
}}

/*
  int_sales_team__clint_deals_cleaned_with_person_id
  --------------------------------------------------------------------------
  Deals enriquecido com as DUAS chaves canonicas + flag de dedup. Grao 1:1
  (1 linha por deal_id; NAO filtra).

  - person_id : left join em person_keys pela match_key (email/telefone norm.).
  - product_id: de-para regra+excecao do seed map_clint_produto -- a regra de
                ORIGEM (group_name+origin_name) vence a de GRUPO (group_name)
                via COALESCE. product_id NULL = grupo nao mapeado (ex. "Nao usar").
  - is_primary_person_origin: primeiro deal de cada (person_id, origin_name) por
                created_at (desempate por deal_id). person_id NULL -> true.
                Impacto medido: ~8,3% nao-primaria.
  - tier_final / tier_origem: tier do deal com fallback nas tags. Usa deal_tier;
                quando vazio, deriva de tags "Tier [1-4]" do contato, casando o
                produto do prefixo da tag (via map_campanha_produto; "Tier N" puro
                e agnostico) com o product_id do deal, e pega o PIOR tier (maior
                numero) em caso de conflito. tier_origem = 'deal' | 'tag' | NULL.
                (deal_history nao tem timestamp por tag, entao "mais recente" nao
                e possivel -- regra de desempate = pior numero.) Cobertura FPF: 27%->~91%.
*/

with deals as (
    select
        s.*,
        pk.person_id
    from {{ ref('int_sales_team__clint_deals_cleaned') }} s
    left join {{ ref('int_sales_team__person_keys') }} pk
        on {{ person_match_key('s.contact_email', 's.contact_phone') }} = pk.match_key
),

mapa as (
    select
        trim(group_name)              as group_name,
        nullif(trim(origin_name), '') as origin_name,
        nullif(trim(product_id), '')  as product_id
    from {{ ref('map_clint_produto') }}
    where nullif(trim(product_id), '') is not null
),

map_origem as (
    select group_name, origin_name, product_id from mapa where origin_name is not null
),

map_grupo as (
    select group_name, product_id from mapa where origin_name is null
),

resolved as (
    select
        d.*,
        coalesce(mo.product_id, mg.product_id) as product_id
    from deals d
    left join map_origem mo
        on d.group_name = mo.group_name
       and d.origin_name = mo.origin_name
    left join map_grupo mg
        on d.group_name = mg.group_name
),

-- de-para campanha->produto (reusado p/ casar o produto do prefixo da tag de tier)
mapa_camp as (
    select distinct
        upper(trim(campaign)) as campaign,
        product_id
    from {{ ref('map_campanha_produto') }}
    where nullif(trim(product_id), '') is not null
),

-- explode tags de tier: numero do tier + produto do prefixo (NULL = "Tier N" puro, agnostico)
tag_tiers as (
    select
        r.deal_id,
        r.product_id,
        cast(regexp_extract(lower(tag), r'tier\s*([1-4])') as int64) as tier_num,
        case
            when regexp_contains(lower(trim(tag)), r'^tier\s*[1-4]') then null
            else upper(trim(split(tag, ':')[offset(0)]))
        end as prefixo
    from resolved r,
         unnest(r.tag_names) as tag
    where regexp_contains(lower(tag), r'tier\s*[1-4]')
),

-- mantem so tags de tier do produto do deal (bare = agnostico); pior tier (maior numero)
tag_tier_por_deal as (
    select
        t.deal_id,
        max(t.tier_num) as tag_tier_num
    from tag_tiers t
    left join mapa_camp m on t.prefixo = m.campaign
    where t.prefixo is null            -- "Tier N" puro: aplica ao produto do deal
       or m.product_id = t.product_id  -- prefixo resolve ao mesmo produto do deal
    group by t.deal_id
)

select
    r.*,
    json_value(fields, '$.falar_com_especialis') as especialista,
    json_value(fields, '$.carrinho_abandonado')  as carrinho_abandonado,
    -- tier_final: deal_tier; senao tier derivado das tags (product-aware, pior tier)
    coalesce(
        nullif(trim(r.deal_tier), ''),
        case when tt.tag_tier_num is not null then concat('Tier ', cast(tt.tag_tier_num as string)) end
    ) as tier_final,
    case
        when nullif(trim(r.deal_tier), '') is not null then 'deal'
        when tt.tag_tier_num is not null               then 'tag'
        else null
    end as tier_origem,
    case
        when person_id is null then true
        when row_number() over (
                 partition by person_id, origin_name
                 order by created_at, deal_id
             ) = 1 then true
        else false
    end as is_primary_person_origin
from resolved r
left join tag_tier_por_deal tt using (deal_id)
