{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity']
  )
}}

/*
  int_sales_team__pesquisas_compiladas_with_person_id
  --------------------------------------------------------------------------
  Pesquisas + person_id + flag de dedup (NAO filtra; quem consome decide).
  Grao 1:1 com a fonte. is_primary_person_campaign = primeira resposta de
  cada (person_id, campaign), por createddate (desempate por email).
  person_id NULL -> is_primary = true (nao da pra agrupar; mantem).
  Impacto medido: ~0,88% das linhas viram nao-primaria.
*/

with j as (
    select
        s.*,
        pk.person_id
    from {{ source('mart_lancamentos', 'mrt_lancamentos__pesquisas_compiladas') }} s
    left join {{ ref('int_sales_team__person_keys') }} pk
        on {{ person_match_key('s.email', 's.phone') }} = pk.match_key
)

select
    j.*,
    case
        when person_id is null then true
        when row_number() over (
                 partition by person_id, campaign
                 order by createddate, email
             ) = 1 then true
        else false
    end as is_primary_person_campaign
from j
