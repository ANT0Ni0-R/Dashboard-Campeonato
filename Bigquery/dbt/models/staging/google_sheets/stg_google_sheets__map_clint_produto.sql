{{
  config(
    materialized = 'view',
    tags = ['sales_team', 'product']
  )
}}

/*
  stg_google_sheets__map_clint_produto
  --------------------------------------------------------------------------
  Limpeza 1:1 do de-para Clint -> produto, mantido a mao numa planilha.
  Grao = regra de mapeamento. Duas formas de regra:
    - origin_name PREENCHIDO  -> regra de ORIGEM (excecao; vence o grupo).
    - origin_name VAZIO       -> regra de GRUPO  (default p/ todas as origens
                                  daquele group_name).
  A resolucao (origem vence grupo) acontece no
  int_sales_team__clint_deals_with_product_id.

  IMPORTANTE: o nome da source ('google_sheets') tem que bater com o usado pelos
  outros stg_google_sheets__map_* no sources.yml -- espelhe a declaracao da
  map_clint_deal_entry. Linhas sem product_id sao descartadas (so documentam).
*/

with raw as (
    select * from {{ source('google_sheets', 'map_clint_produto') }}
)

select
    trim(group_name)                        as group_name,
    nullif(trim(origin_name), '')           as origin_name,
    nullif(trim(product_id), '')            as product_id,
    nullif(trim(match_level), '')           as match_level,
    coalesce(lower(trim(cast(revisar as string))) in ('true', '1', 'sim', 'x'), false) as revisar
from raw
where nullif(trim(product_id), '') is not null
