{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity']
  )
}}

/*
  int_sales_team__leads_with_person_id
  --------------------------------------------------------------------------
  Leads + person_id + flag de dedup (NAO filtra). Grao 1:1 com a fonte.
  is_primary_person_campaign = primeiro lead de cada (person_id, campanha),
  por lead_created_at (desempate por uid). Diferente do is_first_lead_campaign
  nativo, que e por EMAIL; este e por PESSOA.
  person_id NULL -> is_primary = true. Impacto medido: ~28,8% nao-primaria.
*/

with j as (
    select
        s.*,
        pk.person_id
    from {{ source('mart_grupo', 'mrt_grupo__leads') }} s
    left join {{ ref('int_sales_team__person_keys') }} pk
        on {{ person_match_key('s.lead_email', 's.lead_phone_number') }} = pk.match_key
)

select
    j.*,
    case
        when person_id is null then true
        when row_number() over (
                 partition by person_id, campanha
                 order by lead_created_at, uid
             ) = 1 then true
        else false
    end as is_primary_person_campaign
from j
