{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'activation']
  )
}}

/*
  int_sales_team__deal_activation
  --------------------------------------------------------------------------
  Data de ativacao e vendedor-na-ativacao por deal, a partir do historico de
  etapas (snapshot de 30 min). Grao = 1 linha por deal_id.

  Regua de ativacao (por EXCLUSAO, validada na ordem das fases do Legado, onde
  `Base` e a unica fase real antes de `Ativado` e `Ativado` e a 2a fase):
    ATIVADO = atingiu qualquer fase que NAO seja
      - pre-ativacao : Base, Novo, Engajado
      - saida/lateral: Perdido, Contato invalido, Geladeira, Fechamento, Resgate*
  Como o snapshot e de 30 min, o deal pode "pular" a fase Ativado; por isso
  pegamos a 1a fase de ativacao alcancada (MIN(entered_stage_at)) -- e nao a
  fase 'Ativado' literal. O vendedor da ativacao e quem estava no deal nessa
  1a fase de ativacao.

  Fonte: int_sales_team__clint_deals_history_cleaned (entered_stage_at + user_pmp
  ja limpos), modelo intermediario que encapsula o history limpo.
  Resgate* fica fora da ativacao na v1 (re-engajamento) -- revisar.
*/

with hist as (
    select
        deal_id,
        deal_stage,
        entered_stage_at,
        user_pmp,
        user_name
    from {{ ref('int_sales_team__clint_deals_history_cleaned') }}
    where deal_id is not null
      and entered_stage_at is not null
      and lower(trim(deal_stage)) not in (
            'base', 'novo', 'engajado',
            'perdido', 'contato invalido', 'contato inválido',
            'geladeira', 'fechamento'
      )
      and lower(trim(deal_stage)) not like 'resgate%'
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
    from hist
)

select
    deal_id,
    min(entered_stage_at)                  as activated_at,
    max(if(rn = 1, user_pmp,  null))       as seller_ativado_pmp,
    max(if(rn = 1, user_name, null))       as seller_ativado_nome
from ranked
group by deal_id
