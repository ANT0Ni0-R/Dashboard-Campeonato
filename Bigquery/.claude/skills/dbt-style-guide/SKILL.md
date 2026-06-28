---
name: dbt-style-guide
description: Grupo Primo dbt/SQL style guide and best practices. Auto-invoked when writing or modifying dbt SQL models to ensure code follows project conventions.
user-invocable: false
---

# Grupo Primo - dbt/SQL Style Guide

This skill is auto-loaded as context when writing or modifying dbt models. Follow these rules strictly.

## SQL Style

- **Leading commas** always (virgula no inicio de cada coluna e CTE)
- **UPPERCASE** for SQL keywords (SELECT, FROM, WHERE, LEFT JOIN, CASE, WHEN, THEN, END, AND, OR, etc.)
- **4 spaces** indentation
- **Explicit `AS`** for all column and table aliases
- **Descriptive aliases** for tables (never `a`, `b`, `c`)
- **Prefix columns** with table alias in JOINs: `revenue.email`
- **`GROUP BY ALL`** (never `GROUP BY 1, 2` or by column name)
- **No `ORDER BY`** (except inside window functions)
- **No `DISTINCT`**
- **`UNION ALL`** over `UNION`

## CTE Structure

- All `{{ ref() }}` and `{{ source() }}` in simple CTEs at the top with `SELECT *` — format `name AS ( SELECT * FROM {{ ref('...') }} )`, never inline in a JOIN/FROM/subquery
- On name collision, rename the transformation CTE (`journey` → `journey_cols`), not the base
- Descriptive CTE names: `lead_join_opportunity`, `transactions_filtered`
- Always end with a `final` CTE: `SELECT * FROM final`
- Comment complex CTEs with `-- Overview:` prefix
- No model header comment — straight from `config()` to `WITH`; docs live in YAML

## Naming

- **Models**: `stg_[source]__entity.sql` or `mrt_[bu]__entity.sql` (plural)
- **Columns**: `snake_case`, contextual (`contract_id` not `id`)
- **Dates**: suffix `_date` for DATE, `_at` for TIMESTAMP
- **Booleans**: prefix `is_`, `has_`, `was_`
- **Language**: English for all schemas, models, columns; YAML descriptions in pt-BR

## Materialization

- **Staging**: `view` (or `incremental` in exceptions)
- **Mart**: `table` or `incremental` (prefer `incremental` to reduce cost)

## Config Block

Every model must have:
```sql
{{
    config(
        materialized = "table",
        meta = {'owner': '<owner>'},
        tags = ["<source-tag>"]
    )
}}
```

Never remove existing `meta` / `tags` (e.g. `meta.owner`) when editing a model — shared environment, ownership is load-bearing. Only remove on explicit request.

## Data Quality

- **Emails**: use `LOWER()` or `{{ harmonize_emails() }}`
- **Phones**: use `{{ harmonize_phones() }}`
- **Documents (CPF/CNPJ)**: use `{{ harmonize_documents() }}`
- **Type casting**: always `SAFE_CAST`
- **Timezone**: ensure `America/Sao_Paulo`
- **PII columns**: must have policy tags in YAML

## Layer Rules

| Rule | Staging | Mart |
|------|---------|------|
| References | `{{ source() }}` only | `{{ ref() }}` only |
| JOINs | No | Yes |
| Aggregations | No | Yes |
| Business rules | No | Yes |

## Column Order in SELECT

1. IDs
2. Dates
3. Dimensions
4. Metrics

## Full reference

This skill is the complete style reference.
