{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity']
  )
}}

/*
  int_sales_team__person_keys_pairs  (helper 1 de 3)
  --------------------------------------------------------------------------
  Pares distintos (email, phone_key) normalizados das 4 fontes. E o unico
  modelo que escaneia as fontes cruas -> isola o custo. Grao = par distinto.

  Normalizacao via macros (macros/person_identity.sql) -> mesma regra usada
  nos modelos *_with_person_id, garantindo que a chave de join nunca diverge.

  AJUSTE OS 4 INPUTS conforme o seu projeto (ref vs source / nomes de coluna).
*/

with raw as (

    select contact_email as email_raw, contact_phone as phone_raw
    from {{ ref('int_sales_team__clint_deals_cleaned') }}

    union all

    -- leads: lead_phone_number (NAO existe lead_phone)
    select lead_email, lead_phone_number
    from {{ source('mart_grupo', 'mrt_grupo__leads') }}

    union all

    select email, phone
    from {{ source('mart_lancamentos', 'mrt_lancamentos__pesquisas_compiladas') }}

    union all

    select user_email, user_phone
    from {{ ref('int_sales_team__transactions_with_sales_request') }}

),

keys as (
    select distinct
        {{ email_norm('email_raw') }} as email,
        {{ phone_key('phone_raw') }}  as phone_key
    from raw
)

select
    email,
    phone_key,
    concat(coalesce(email, ''), '|', coalesce(phone_key, '')) as match_key
from keys
where email is not null or phone_key is not null
