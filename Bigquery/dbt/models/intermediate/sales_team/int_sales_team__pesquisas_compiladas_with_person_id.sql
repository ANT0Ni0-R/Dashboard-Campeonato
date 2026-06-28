{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity', 'product']
  )
}}

/*
  int_sales_team__pesquisas_compiladas_with_person_id
  --------------------------------------------------------------------------
  Pesquisas enriquecida com as DUAS chaves canonicas + flag de dedup (NAO filtra).
  Grao 1:1 com a fonte.

  - person_id : left join em person_keys pela match_key (email/telefone norm.).
  - product_id: join exato campaign -> map_pesquisa_produto (codigo enumerado).
                NULL quando a campanha nao tem mapeamento (revisar pendente).
  - is_primary_person_campaign: primeira resposta de cada (person_id, campaign)
                por createddate (desempate por email). person_id NULL -> true.
                Impacto medido: ~0,88% nao-primaria.
*/

with base as (
    select
        s.*,
        pk.person_id
    from {{ source('mart_lancamentos', 'mrt_lancamentos__pesquisas_compiladas') }} s
    left join {{ ref('int_sales_team__person_keys') }} pk
        on {{ person_match_key('s.email', 's.phone') }} = pk.match_key
),

mapa as (
    select
        nullif(trim(campaign), '')   as campaign,
        nullif(trim(product_id), '') as product_id
    from {{ ref('map_pesquisa_produto') }}
    where nullif(trim(product_id), '') is not null
),

resolved as (
    select
        b.*,
        mp.product_id
    from base b
    left join mapa mp
        on b.campaign = mp.campaign
)

select
    r.*,
    case
        when person_id is null then true
        when row_number() over (
                 partition by person_id, campaign
                 order by createddate, email
             ) = 1 then true
        else false
    end as is_primary_person_campaign
from resolved r
