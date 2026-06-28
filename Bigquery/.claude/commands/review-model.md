---
description: Review a dbt model against the Grupo Primo SQL/dbt style guide with a detailed checklist.
---

# Review Model

Review the dbt model at `$ARGUMENTS` against the Grupo Primo style guide.

## Style guide reference

Read the full guide at: `.claude/skills/dbt-style-guide/SKILL.md`

## Checklist

For each item, report PASS or FAIL with a brief explanation:

### Estrutura

- [ ] Config block present with `materialized`, `meta.owner`, and `tags`
- [ ] Tag corresponds to the source of lowest frequency
- [ ] Staging uses only `{{ source() }}`; mart uses only `{{ ref() }}`
- [ ] All `{{ ref() }}` / `{{ source() }}` are in CTEs at the top with `SELECT *`
- [ ] Has a `final` CTE before the closing `SELECT * FROM final`

### SQL Style

- [ ] Leading commas (virgula no inicio)
- [ ] Keywords in UPPERCASE (SELECT, FROM, WHERE, LEFT JOIN, etc.)
- [ ] Explicit `AS` for all column aliases
- [ ] Table aliases are descriptive (not `a`, `b`, `c`)
- [ ] All columns prefixed with table alias in JOINs
- [ ] Uses `GROUP BY ALL` (not `GROUP BY 1, 2` or column names)
- [ ] No `ORDER BY` (unless inside window function)
- [ ] No `DISTINCT` (unless justified)
- [ ] No `UNION` (should be `UNION ALL` if needed)

### Naming

- [ ] Model name follows convention: `stg_[source]__entity` or `mrt_[bu]__entity`
- [ ] Column names in `snake_case`
- [ ] Date columns end with `_date` or `_at`
- [ ] Boolean columns start with `is_`, `has_`, or `was_`
- [ ] CTE names are descriptive (not `a`, `b`, `final_table_adjust`)

### Data Quality

- [ ] No hardcoded debug filters (e.g., `WHERE email = '...'`, `WHERE reference_date = '...'`)
- [ ] Email fields use `LOWER()` or `{{ harmonize_emails() }}`
- [ ] Date fields ensure timezone `America/Sao_Paulo`
- [ ] Uses `SAFE_CAST` for type conversions

### Column ordering (in final SELECT)

- [ ] IDs first, then dates, then dimensions, then metrics

## Output format

Present results as a table with status and notes. At the end, give a summary score (e.g., 15/18 checks passed) and list the top priority fixes.
