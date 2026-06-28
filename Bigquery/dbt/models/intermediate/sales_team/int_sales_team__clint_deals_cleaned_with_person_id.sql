{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity']
  )
}}

/*
  int_sales_team__clint_deals_cleaned_with_person_id
  --------------------------------------------------------------------------
  Deals + person_id + flag de dedup (NAO filtra). Grao 1:1 (1 linha por deal_id).
  is_primary_person_origin = primeiro deal de cada (person_id, origin_name),
  por created_at (desempate por deal_id).
  person_id NULL -> is_primary = true. Impacto medido: ~8,3% nao-primaria.
*/

with j as (
    select
        s.*,
        pk.person_id
    from {{ ref('int_sales_team__clint_deals_cleaned') }} s
    left join {{ ref('int_sales_team__person_keys') }} pk
        on {{ person_match_key('s.contact_email', 's.contact_phone') }} = pk.match_key
)

select
    j.*,
    case
        when person_id is null then true
        when row_number() over (
                 partition by person_id, origin_name
                 order by created_at, deal_id
             ) = 1 then true
        else false
    end as is_primary_person_origin
from j
