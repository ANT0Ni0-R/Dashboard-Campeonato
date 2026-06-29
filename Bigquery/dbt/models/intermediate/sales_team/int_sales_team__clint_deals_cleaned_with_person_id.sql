{{
  config(
    materialized = 'table',
    tags = ['sales_team', 'identity', 'product']
  )
}}

/*
  int_sales_team__clint_deals_cleaned_with_person_id
  --------------------------------------------------------------------------
  Deals enriquecido com as DUAS chaves canonicas + flag de dedup. Grao 1:1
  (1 linha por deal_id; NAO filtra).

  - person_id : left join em person_keys pela match_key (email/telefone norm.).
  - product_id: de-para regra+excecao do seed map_clint_produto -- a regra de
                ORIGEM (group_name+origin_name) vence a de GRUPO (group_name)
                via COALESCE. product_id NULL = grupo nao mapeado (ex. "Nao usar").
  - is_primary_person_origin: primeiro deal de cada (person_id, origin_name) por
                created_at (desempate por deal_id). person_id NULL -> true.
                Impacto medido: ~8,3% nao-primaria.
*/

with deals as (
    select
        s.*,
        pk.person_id
    from {{ ref('int_sales_team__clint_deals_cleaned') }} s
    left join {{ ref('int_sales_team__person_keys') }} pk
        on {{ person_match_key('s.contact_email', 's.contact_phone') }} = pk.match_key
),

mapa as (
    select
        trim(group_name)              as group_name,
        nullif(trim(origin_name), '') as origin_name,
        nullif(trim(product_id), '')  as product_id
    from {{ ref('map_clint_produto') }}
    where nullif(trim(product_id), '') is not null
),

map_origem as (
    select group_name, origin_name, product_id from mapa where origin_name is not null
),

map_grupo as (
    select group_name, product_id from mapa where origin_name is null
),

resolved as (
    select
        d.*,
        coalesce(mo.product_id, mg.product_id) as product_id
    from deals d
    left join map_origem mo
        on d.group_name = mo.group_name
       and d.origin_name = mo.origin_name
    left join map_grupo mg
        on d.group_name = mg.group_name
)

select
    r.*,
    json_value(fields, '$.falar_com_especialis') as especialista,
    json_value(fields, '$.carrinho_abandonado')  as carrinho_abandonado,
    case
        when person_id is null then true
        when row_number() over (
                 partition by person_id, origin_name
                 order by created_at, deal_id
             ) = 1 then true
        else false
    end as is_primary_person_origin
from resolved r
