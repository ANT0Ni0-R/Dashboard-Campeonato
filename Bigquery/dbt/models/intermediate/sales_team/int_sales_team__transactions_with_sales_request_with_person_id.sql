{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity']
  )
}}

/*
  int_sales_team__transactions_with_sales_request_with_person_id
  --------------------------------------------------------------------------
  Transactions (fonte de verdade de GMV) + person_id. SO anexa a coluna:
  grao 1:1 com int_sales_team__transactions_with_sales_request (nao deduplica
  -- multiplas compras da mesma pessoa sao legitimas). O ganho aqui e o join:
  agregar/cruzar por person_id em vez de "ON email OR telefone".

  O left join e 1:1 porque match_key e unico em int_sales_team__person_keys.
  person_id fica NULL apenas nas linhas sem email e sem telefone usavel.
*/

with tx as (
    select
        *,
        {{ person_match_key('user_email', 'user_phone') }} as match_key
    from {{ ref('int_sales_team__transactions_with_sales_request') }}
)

select
    tx.* except (match_key),
    pk.person_id
from tx
left join {{ ref('int_sales_team__person_keys') }} pk
    using (match_key)
