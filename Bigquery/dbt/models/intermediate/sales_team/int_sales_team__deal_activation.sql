{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'activation']
  )
}}

/*
  int_sales_team__deal_activation
  --------------------------------------------------------------------------
  Data + vendedor de dois marcos do deal -- ATIVACAO e ENGAJAMENTO -- a partir
  do historico de etapas (snapshot de 30 min). Grao = 1 linha por deal_id.

  Regua de ATIVACAO (por EXCLUSAO). As UNICAS fases pre-ativacao sao `Base` e
  `Novo` (e suas variantes, ex. `Base carrinho abandonado`, `Novo - engajado`);
  TODO o resto conta como ativacao -- inclusive `Engajado` e ate as fases de
  saida/lateral (`Perdido`, `Contato invalido`, `Geladeira`, `Fechamento`,
  `Resgate*`), pois um deal so chega nelas depois de ter sido trabalhado.
    ATIVADO = atingiu qualquer fase que NAO seja `Base*` nem `Novo*`.

  Regua de ENGAJAMENTO (por EXCLUSAO, marco mais profundo que ativacao). As
  fases pre-engajamento sao `Base*`, `Novo*`, `Ativado*` e `Aquece*`; TODO o
  resto (incl. `Engajado`, `Fup*`, `Venda`, `Perdido`, `Geladeira`, etc.) conta
  como engajamento.
    ENGAJADO = atingiu qualquer fase que NAO seja `Base*`, `Novo*`, `Ativado*`
    nem `Aquece*`.
  Como o conjunto de engajamento e subconjunto do de ativacao, todo deal
  engajado e necessariamente ativado (engaged_at >= activated_at).

  Em ambos os marcos, como o snapshot e de 30 min, o deal pode "pular" a fase
  marco; por isso pegamos a 1a fase qualificante alcancada (MIN(entered_stage_at))
  -- nao a fase literal. O vendedor do marco e quem estava no deal nessa 1a fase.

  Tambem expoe `first_stage_at` = MIN(entered_stage_at) sobre TODAS as etapas
  (incl. Base/Novo). Serve de "primeiro toque" real do deal -- util porque o
  `created_at` da clint_deals_cleaned pode ser um timestamp de re-import em lote
  (visto no FPF: ~4,2k deals com created_at posterior ao historico inteiro).

  Fonte: int_sales_team__clint_deals_history_cleaned (entered_stage_at + user_pmp
  ja limpos), modelo intermediario que encapsula o history limpo.
  Resgate* fica fora da ativacao na v1 (re-engajamento) -- revisar.
*/

with hist_full as (
    select
        deal_id,
        deal_stage,
        entered_stage_at,
        user_pmp,
        user_name
    from {{ ref('int_sales_team__clint_deals_history_cleaned') }}
    where deal_id is not null
      and entered_stage_at is not null
),

-- primeiro toque do deal (qualquer etapa, incl. Base/Novo)
primeiro_toque as (
    select
        deal_id,
        min(entered_stage_at) as first_stage_at
    from hist_full
    group by deal_id
),

-- so as fases que contam como ativacao (exclusao):
-- pre-ativacao = apenas a familia Base* e Novo*; todo o resto ativa.
ativacao_hist as (
    select *
    from hist_full
    where lower(trim(deal_stage)) not like 'base%'
      and lower(trim(deal_stage)) not like 'novo%'
),

ranked as (
    select
        deal_id,
        entered_stage_at,
        user_pmp,
        user_name,
        row_number() over (
            partition by deal_id
            order by entered_stage_at asc, deal_stage asc
        ) as rn
    from ativacao_hist
),

ativacao as (
    select
        deal_id,
        min(entered_stage_at)              as activated_at,
        max(if(rn = 1, user_pmp,  null))   as seller_ativado_pmp,
        max(if(rn = 1, user_name, null))   as seller_ativado_nome
    from ranked
    group by deal_id
),

-- so as fases que contam como engajamento (exclusao):
-- pre-engajamento = Base*, Novo*, Ativado* e Aquece*; todo o resto engaja.
engajamento_hist as (
    select *
    from hist_full
    where lower(trim(deal_stage)) not like 'base%'
      and lower(trim(deal_stage)) not like 'novo%'
      and lower(trim(deal_stage)) not like 'ativado%'
      and lower(trim(deal_stage)) not like 'aquece%'
),

ranked_eng as (
    select
        deal_id,
        entered_stage_at,
        user_pmp,
        user_name,
        row_number() over (
            partition by deal_id
            order by entered_stage_at asc, deal_stage asc
        ) as rn
    from engajamento_hist
),

engajamento as (
    select
        deal_id,
        min(entered_stage_at)              as engaged_at,
        max(if(rn = 1, user_pmp,  null))   as seller_engajado_pmp,
        max(if(rn = 1, user_name, null))   as seller_engajado_nome
    from ranked_eng
    group by deal_id
)

select
    pt.deal_id,
    pt.first_stage_at,
    a.activated_at,
    a.seller_ativado_pmp,
    a.seller_ativado_nome,
    e.engaged_at,
    e.seller_engajado_pmp,
    e.seller_engajado_nome
from primeiro_toque pt
left join ativacao   a using (deal_id)
left join engajamento e using (deal_id)
