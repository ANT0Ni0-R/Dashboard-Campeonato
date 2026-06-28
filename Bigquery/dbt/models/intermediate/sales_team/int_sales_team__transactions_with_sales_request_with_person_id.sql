{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity', 'product']
  )
}}

/*
  int_sales_team__transactions_with_sales_request_with_person_id
  --------------------------------------------------------------------------
  Transactions (fonte de verdade de GMV) enriquecida com as DUAS chaves
  canonicas. Grao 1:1 com a fonte (NAO deduplica -- multiplas compras da mesma
  pessoa sao legitimas).

  Base = mrt_sales_team__transactions_with_sales_request (projeto CRM). E a fonte
  com GMV correto e que carrega `sales_channel` (TVD = canal do time de vendas),
  `seller_pmp`/`seller_name` (vendedor da venda) e `canal1`. A mrt NAO tem coluna
  escalar product_id (so o array `products`), entao nao ha colisao -- o product_id
  canonico vem unicamente do de-para.

  - person_id : left join 1:1 em person_keys pela match_key (unica).
  - product_id: join exato product_name -> map_transactions_produto. NULL quando
                o titulo nao esta mapeado (outras BUs/promos, ou a decidir).
*/

with tx as (
    select
        *,
        {{ person_match_key('user_email', 'user_phone') }} as match_key
    from {{ ref('mrt_sales_team__transactions_with_sales_request') }}
),

with_person as (
    select
        tx.* except (match_key),
        pk.person_id
    from tx
    left join {{ ref('int_sales_team__person_keys') }} pk
        using (match_key)
),

mapa as (
    select
        nullif(trim(product_name), '') as product_name,
        nullif(trim(product_id), '')   as product_id
    from {{ ref('map_transactions_produto') }}
    where nullif(trim(product_id), '') is not null
)

select
    w.*,
    mp.product_id
from with_person w
left join mapa mp
    on w.product_name = mp.product_name
