{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity', 'product']
  )
}}

/*
  int_sales_team__leads_with_person_id
  --------------------------------------------------------------------------
  Leads enriquecido com as DUAS chaves canonicas + flag de dedup (NAO filtra).
  Grao 1:1 com a fonte.

  - person_id : left join em person_keys pela match_key (email/telefone norm.).
  - product_id: join exato campanha -> map_campanha_produto (mesmo seed da
                pesquisa). NULL quando a campanha nao tem mapeamento.
  - is_primary_person_campaign: primeiro lead de cada (person_id, campanha) por
                lead_created_at (desempate por uid). Por PESSOA (o nativo
                is_first_lead_campaign e por EMAIL). person_id NULL -> true.
                Impacto medido: ~28,8% nao-primaria.
*/

with base as (
    select
        s.*,
        pk.person_id
    from {{ source('mart_grupo', 'mrt_grupo__leads') }} s
    left join {{ ref('int_sales_team__person_keys') }} pk
        on {{ person_match_key('s.lead_email', 's.lead_phone_number') }} = pk.match_key
),

mapa as (
    select
        nullif(trim(campaign), '')   as campaign,
        nullif(trim(product_id), '') as product_id
    from {{ ref('map_campanha_produto') }}
    where nullif(trim(product_id), '') is not null
),

resolved as (
    select
        b.*,
        mp.product_id
    from base b
    left join mapa mp
        on b.campanha = mp.campaign
)

select
    r.*,
    case
        when person_id is null then true
        when row_number() over (
                 partition by person_id, campanha
                 order by lead_created_at, uid
             ) = 1 then true
        else false
    end as is_primary_person_campaign
from resolved r
