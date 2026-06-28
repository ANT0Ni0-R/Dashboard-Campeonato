{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity']
  )
}}

/*
  int_sales_team__person_keys  (modelo final, 3 de 3)
  --------------------------------------------------------------------------
  Crosswalk de identidade. GRAO: 1 linha por par distinto (email, phone_key).
  Cada par recebe um person_id canonico: a mesma pessoa, ligada por email OU
  telefone (transitivamente = connected components), recebe o mesmo person_id.

  Uso downstream (substitui o join "ON a.email=b.email OR a.phone=b.phone"):
    1. normalize email/telefone da sua tabela do mesmo jeito do _pairs;
    2. derive match_key = concat(coalesce(email,''),'|',coalesce(phone_key,''));
    3. left join este modelo (int_sales_team__person_keys) using (match_key).

  Connected components via min-label propagation lendo o grafo ja materializado
  (int_sales_team__person_keys_graph). cc_iterations = numero de saltos
  propagados; componentes sao minusculos, converge em poucas rodadas. Se algum
  dia precisar de mais alcance, basta aumentar cc_iterations.
*/

{% set cc_iterations = 10 %}

with adj as (
    select src, dst
    from {{ ref('int_sales_team__person_keys_graph') }}
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
    -- 'e:' < 'p:' lexicograficamente => o representante tende a ser um email
    select node, label as component_key
    from labels_{{ cc_iterations }}
),

pairs as (
    select email, phone_key, match_key
    from {{ ref('int_sales_team__person_keys_pairs') }}
),

resolved as (
    select
        p.email,
        p.phone_key,
        p.match_key,
        coalesce(ce.component_key, cp.component_key) as component_key
    from pairs p
    left join component ce on ce.node = concat('e:', p.email)
    left join component cp on cp.node = concat('p:', p.phone_key)
)

select
    email,
    phone_key,
    match_key,
    to_hex(md5(component_key)) as person_id
from resolved
