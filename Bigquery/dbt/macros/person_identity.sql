{#
  Normalizacao canonica de identidade (email / telefone) usada pelo person_id.

  FONTE UNICA DE VERDADE: estes macros definem a normalizacao tanto na construcao
  do int_sales_team__person_keys (via _pairs) quanto em qualquer modelo
  *_with_person_id. Use SEMPRE eles para derivar a chave de join -- nunca
  reescreva a normalizacao na mao, senao a chave diverge e o join quebra.

  ATENCAO: alterar a logica aqui MUDA o person_id. Se mexer, rode de novo
  `dbt run --select +int_sales_team__person_keys` e revalide.
#}

{# Email canonico: lower/trim; NULL se vazio ou sem '@'. #}
{% macro email_norm(col) -%}
  case when nullif(lower(trim({{ col }})), '') like '%@%'
       then nullif(lower(trim({{ col }})), '') end
{%- endmacro %}

{# Telefone canonico: digitos -> tira DDI 55 (quando sobra >=12 dig) ->
   aceita so nacional de 10/11 dig -> DDD + ultimos 8 (robusto ao 9o digito).
   Tamanho fora disso vira NULL (nao casa em lixo). #}
{% macro phone_key(col) -%}
  {%- set digits = "regexp_replace(" ~ col ~ ", r'[^0-9]', '')" -%}
  {%- set national -%}
    case when starts_with({{ digits }}, '55') and length({{ digits }}) >= 12
         then substr({{ digits }}, 3)
         else {{ digits }} end
  {%- endset -%}
  case when length({{ national }}) in (10, 11)
       then concat(substr({{ national }}, 1, 2), substr({{ national }}, -8)) end
{%- endmacro %}

{# Chave de join null-safe para o int_sales_team__person_keys. #}
{% macro person_match_key(email_col, phone_col) -%}
  concat(
    coalesce({{ email_norm(email_col) }}, ''), '|',
    coalesce({{ phone_key(phone_col) }}, '')
  )
{%- endmacro %}
