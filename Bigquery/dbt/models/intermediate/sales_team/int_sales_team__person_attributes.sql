{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity']
  )
}}

/*
  int_sales_team__person_attributes
  --------------------------------------------------------------------------
  Atributos de contato por pessoa canonica. Grao = 1 linha por person_id.
  Util como de-para de person_id em qualquer analise (nao so no funil).

  - melhor_email / melhor_telefone: o valor mais FREQUENTE nas 4 fontes; empate
    desempatado por RECENCIA (padrao validado em identidade.md), depois lexico.
  - Normalizacao via macros email_norm / phone_key (mesma do person_keys).

  PII (email/telefone) permanece interna ao BigQuery.
*/

with fontes as (
    select
        person_id,
        {{ email_norm('contact_email') }} as email,
        {{ phone_key('contact_phone') }}  as phone,
        created_at                        as ts
    from {{ ref('int_sales_team__clint_deals_cleaned_with_person_id') }}

    union all

    select
        person_id,
        {{ email_norm('lead_email') }},
        {{ phone_key('lead_phone_number') }},
        lead_created_at
    from {{ ref('int_sales_team__leads_with_person_id') }}

    union all

    select
        person_id,
        {{ email_norm('email') }},
        {{ phone_key('phone') }},
        cast(createddate as datetime)
    from {{ ref('int_sales_team__pesquisas_compiladas_with_person_id') }}

    union all

    select
        person_id,
        {{ email_norm('user_email') }},
        {{ phone_key('user_phone') }},
        transaction_created_at
    from {{ ref('int_sales_team__transactions_with_sales_request_with_person_id') }}
),

base as (
    select * from fontes where person_id is not null
),

email_freq as (
    select person_id, email, count(*) as freq, max(ts) as ult
    from base
    where email is not null
    group by person_id, email
),

melhor_email as (
    select person_id, email as melhor_email
    from email_freq
    qualify row_number() over (
        partition by person_id order by freq desc, ult desc, email asc
    ) = 1
),

phone_freq as (
    select person_id, phone, count(*) as freq, max(ts) as ult
    from base
    where phone is not null
    group by person_id, phone
),

melhor_telefone as (
    select person_id, phone as melhor_telefone
    from phone_freq
    qualify row_number() over (
        partition by person_id order by freq desc, ult desc, phone asc
    ) = 1
),

resumo as (
    select
        person_id,
        count(distinct email) as n_emails,
        count(distinct phone) as n_telefones,
        max(ts)               as ultimo_contato
    from base
    group by person_id
)

select
    r.person_id,
    me.melhor_email,
    mt.melhor_telefone,
    r.n_emails,
    r.n_telefones,
    r.ultimo_contato
from resumo r
left join melhor_email    me using (person_id)
left join melhor_telefone mt using (person_id)
