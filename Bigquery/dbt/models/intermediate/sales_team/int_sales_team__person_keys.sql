{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity']
  )
}}

/*
  int_sales_team__person_keys
  --------------------------------------------------------------------------
  Crosswalk de identidade. GRAO: 1 linha por par distinto (email, phone_key)
  observado nas 4 fontes. Cada par recebe um person_id canonico: a mesma
  pessoa, ligada por email OU telefone (transitivamente = connected
  components), recebe o mesmo person_id.

  Uso downstream (substitui o join "ON a.email=b.email OR a.phone=b.phone"):
    1. normalize email/telefone da sua tabela do mesmo jeito daqui;
    2. derive match_key = concat(coalesce(email_norm,''),'|',coalesce(phone_key,''));
    3. left join este modelo (int_sales_team__person_keys) using (match_key)  -> person_id.

  Logica validada no BigQuery em 2026-06-28 (ver Bigquery/identidade.md):
    - ~8,27M pares distintos; 6,72M emails; 6,17M telefones.
    - merge por telefone alcanca ~13% de emails que o merge so-email perderia.
    - telefones de alto grau sao lixo (1199999999, etc.) -> blocklist obrigatoria.

  NOTA DE BUILD: por o dbt fazer inline de CTE, as 4 fontes sao reescaneadas a
  cada iteracao do connected-components. Se o build ficar caro/lento, mover os
  CTEs raw_keys..edges_all para um modelo proprio materializado como table
  (ex.: int_sales_team__person_edges) e dar ref aqui.

  AJUSTE OS 4 INPUTS abaixo conforme o seu projeto (ref vs source / nomes de coluna).
*/

{% set cc_iterations   = 10 %}
{% set phone_block_deg = var('person_keys_phone_block_degree', 6) %}
{% set email_block_deg = var('person_keys_email_block_degree', 6) %}

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
        -- email so vale se tiver '@'
        case when email like '%@%' then email end as email,
        -- tira o DDI 55 quando sobra um nacional plausivel (>= 12 digitos com 55 na frente)
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
),

keys_clean as (
    select email, phone_key
    from keys
    where email is not null or phone_key is not null
),

-- ---------- blocklist -----------------------------------------------------
edges_all as (
    select email, phone_key
    from keys_clean
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
    -- alto grau (telefone que liga muitos emails = compartilhado/lixo)
    select phone_key from phone_degree where n_emails >= {{ phone_block_deg }}
    union distinct
    -- padroes obvios de preenchimento falso
    select phone_key
    from keys_clean
    where phone_key is not null
      and (
          phone_key = repeat(substr(phone_key, 1, 1), 10)                       -- 10 digitos iguais (0000000000, 1111111111, ...)
          or regexp_contains(phone_key, r'(99999999|00000000|11111111|12345678|87654321)$')
      )
),

blocked_email as (
    -- email com telefones demais = inbox compartilhada/teste
    select email from email_degree where n_phones >= {{ email_block_deg }}
    union distinct
    select email
    from keys_clean
    where email is not null
      and regexp_contains(email, r'^(test|teste|no-?reply|exemplo|example|sac|contato|atendimento)@')
),

-- ---------- connected components (min-label propagation) ------------------
cc_edges as (
    -- arestas validas: nenhum lado na blocklist
    select e.email, e.phone_key
    from edges_all e
    left join blocked_phone bp using (phone_key)
    left join blocked_email be using (email)
    where bp.phone_key is null
      and be.email is null
),

all_nodes as (
    select distinct node from (
        select concat('e:', email)     as node from keys_clean where email is not null
        union all
        select concat('p:', phone_key)         from keys_clean where phone_key is not null
    )
),

adj as (
    -- grafo bipartite nao-direcionado + self-loop (mantem nó isolado com rótulo proprio)
    select concat('e:', email) as src, concat('p:', phone_key) as dst from cc_edges
    union all
    select concat('p:', phone_key),     concat('e:', email)         from cc_edges
    union all
    select node, node from all_nodes
),

labels_0 as (
    select src as node, min(dst) as label
    from adj
    group by src
),

{% for i in range(1, cc_iterations + 1) %}
labels_{{ i }} as (
    -- novo rotulo = menor rotulo entre os vizinhos (inclui o proprio via self-loop)
    select adj.src as node, min(prev.label) as label
    from adj
    join labels_{{ i - 1 }} prev on prev.node = adj.dst
    group by adj.src
),
{% endfor %}

component as (
    -- 'e:' < 'p:' lexicograficamente => o representante do componente tende a ser um email
    select node, label as component_key
    from labels_{{ cc_iterations }}
),

resolved as (
    select
        k.email,
        k.phone_key,
        coalesce(ce.component_key, cp.component_key) as component_key
    from keys_clean k
    left join component ce on ce.node = concat('e:', k.email)
    left join component cp on cp.node = concat('p:', k.phone_key)
)

select
    email,
    phone_key,
    concat(coalesce(email, ''), '|', coalesce(phone_key, '')) as match_key,
    to_hex(md5(component_key))                                as person_id
from resolved
