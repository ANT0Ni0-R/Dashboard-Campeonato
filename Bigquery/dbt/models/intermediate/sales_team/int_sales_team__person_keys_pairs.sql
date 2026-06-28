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

  AJUSTE OS 4 INPUTS conforme o seu projeto (ref vs source / nomes de coluna).
*/

with raw_keys as (

    -- deals (Clint): contact_email / contact_phone
    select
        nullif(lower(trim(contact_email)), '')        as email,
        regexp_replace(contact_phone, r'[^0-9]', '')   as phone_digits
    from {{ ref('int_sales_team__clint_deals_cleaned') }}

    union all

    -- leads (grupo): lead_email / lead_phone_number  (NAO existe lead_phone)
    select
        nullif(lower(trim(lead_email)), ''),
        regexp_replace(lead_phone_number, r'[^0-9]', '')
    from {{ source('mart_grupo', 'mrt_grupo__leads') }}

    union all

    -- pesquisas (lancamentos): email / phone
    select
        nullif(lower(trim(email)), ''),
        regexp_replace(phone, r'[^0-9]', '')
    from {{ source('mart_lancamentos', 'mrt_lancamentos__pesquisas_compiladas') }}

    union all

    -- transactions (CRM): user_email / user_phone
    select
        nullif(lower(trim(user_email)), ''),
        regexp_replace(user_phone, r'[^0-9]', '')
    from {{ ref('int_sales_team__transactions_with_sales_request') }}

),

normalized as (
    select
        case when email like '%@%' then email end as email,
        case
            when starts_with(phone_digits, '55') and length(phone_digits) >= 12
                then substr(phone_digits, 3)
            else phone_digits
        end as national
    from raw_keys
),

keys as (
    select distinct
        email,
        -- so aceita nacional de 10 ou 11 digitos; chave = DDD + ultimos 8
        -- (robusta ao 9o digito opcional do celular). Lixo de tamanho vira NULL.
        case
            when length(national) in (10, 11)
                then concat(substr(national, 1, 2), substr(national, -8))
            else null
        end as phone_key
    from normalized
)

select
    email,
    phone_key,
    concat(coalesce(email, ''), '|', coalesce(phone_key, '')) as match_key
from keys
where email is not null or phone_key is not null
