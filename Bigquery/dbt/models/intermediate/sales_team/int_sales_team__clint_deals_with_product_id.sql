{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'product']
  )
}}

/*
  int_sales_team__clint_deals_with_product_id
  --------------------------------------------------------------------------
  Deals (ja com person_id + flag de dedup) + product_id canonico. Grao 1:1
  com o ..._with_person_id (so anexa product_id; nao filtra, nao deduplica).

  De-para vem do seed sales_team/map_clint_produto.csv (mantido a mao).
  RESOLUCAO regra+excecao (a mais especifica vence):
    1. tenta casar a regra de ORIGEM  -> (group_name, origin_name)
    2. cai pra regra de GRUPO (default) -> (group_name)
  via COALESCE(origem, grupo). Deal de grupo nao mapeado (ex. "Nao usar")
  fica com product_id NULL -- intencional (o relationships test ignora NULL).
*/

with deals as (
    select * from {{ ref('int_sales_team__clint_deals_cleaned_with_person_id') }}
),

mapa as (
    select
        trim(group_name)              as group_name,
        nullif(trim(origin_name), '') as origin_name,   -- vazio = regra de grupo
        nullif(trim(product_id), '')  as product_id
    from {{ ref('map_clint_produto') }}
    where nullif(trim(product_id), '') is not null
),

map_origem as (
    select group_name, origin_name, product_id from mapa where origin_name is not null
),

map_grupo as (
    select group_name, product_id from mapa where origin_name is null
)

select
    d.*,
    coalesce(mo.product_id, mg.product_id) as product_id
from deals d
left join map_origem mo
    on d.group_name = mo.group_name
   and d.origin_name = mo.origin_name
left join map_grupo mg
    on d.group_name = mg.group_name
