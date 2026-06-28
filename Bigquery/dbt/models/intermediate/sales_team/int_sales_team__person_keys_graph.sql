{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity']
  )
}}

/*
  int_sales_team__person_keys_graph  (helper 2 de 3)
  --------------------------------------------------------------------------
  Grafo de identidade materializado: adjacencia nao-direcionada (src, dst)
  entre nos de email ('e:<email>') e telefone ('p:<phone_key>'), com self-loop
  por no (mantem no isolado com rotulo proprio). Arestas de identificadores na
  blocklist NAO entram -> nao propagam.

  Blocklist (validada no BQ):
    - telefone que liga >= N emails distintos (var person_keys_phone_block_degree);
    - telefone repdigit (0000000000, ...) ou padrao 99999999/12345678-like;
    - email com >= N telefones (var person_keys_email_block_degree) ou test@/sac@/...
*/

{% set phone_block_deg = var('person_keys_phone_block_degree', 6) %}
{% set email_block_deg = var('person_keys_email_block_degree', 6) %}

with pairs as (
    select email, phone_key
    from {{ ref('int_sales_team__person_keys_pairs') }}
),

edges_all as (
    select email, phone_key
    from pairs
    where email is not null and phone_key is not null
),

phone_degree as (
    select phone_key, count(distinct email) as n_emails
    from edges_all
    group by phone_key
),

email_degree as (
    select email, count(distinct phone_key) as n_phones
    from edges_all
    group by email
),

blocked_phone as (
    select phone_key from phone_degree where n_emails >= {{ phone_block_deg }}
    union distinct
    select phone_key
    from pairs
    where phone_key is not null
      and (
          phone_key = repeat(substr(phone_key, 1, 1), 10)
          or regexp_contains(phone_key, r'(99999999|00000000|11111111|12345678|87654321)$')
      )
),

blocked_email as (
    select email from email_degree where n_phones >= {{ email_block_deg }}
    union distinct
    select email
    from pairs
    where email is not null
      and regexp_contains(email, r'^(test|teste|no-?reply|exemplo|example|sac|contato|atendimento)@')
),

cc_edges as (
    select e.email, e.phone_key
    from edges_all e
    left join blocked_phone bp using (phone_key)
    left join blocked_email be using (email)
    where bp.phone_key is null
      and be.email is null
),

all_nodes as (
    select distinct node from (
        select concat('e:', email)     as node from pairs where email is not null
        union all
        select concat('p:', phone_key)         from pairs where phone_key is not null
    )
)

select concat('e:', email) as src, concat('p:', phone_key) as dst from cc_edges
union all
select concat('p:', phone_key),     concat('e:', email)         from cc_edges
union all
select node, node from all_nodes
