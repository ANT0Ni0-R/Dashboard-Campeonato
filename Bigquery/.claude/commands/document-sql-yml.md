---
description: Document dbt models in YAML from a SQL file or folder. Adds missing columns with contextual Portuguese descriptions, PII policy tags, and unique/not_null tests — without removing existing entries.
---

# document-sql-yml

Document dbt models at `$ARGUMENTS` by running the full `/document-sql-yml` skill.

`$ARGUMENTS` can be:

- A single `.sql` file path → document that model only.
- A folder path → recursively find and document all `.sql` files in it.

## What it does

1. Extracts output columns from the `final` CTE (or last SELECT).
2. Creates a dedicated `_<model_name>.yml` per model (migrating from shared YAMLs when needed).
3. Infers and writes a model-level description in Portuguese if missing.
4. Adds missing columns with contextual pt-BR descriptions.
5. Classifies PII columns and applies policy tags (`PII_*` variables).
6. Sets `pii_level` in the SQL `config()` block.
7. Detects the unique ID column and adds `unique` + `not_null` tests; generates a surrogate key if none exists.
8. Removes orphaned YAML columns that were renamed or deleted in the SQL (with safeguards).
9. Prints a summary table of all actions taken.

## Guarantees

- Never modifies SQL beyond `pii_level` and surrogate key insertion.
- Never removes models or columns that still exist in the SQL.
- Never overwrites existing non-empty descriptions or policy tags.
- Never uses `TODO` or generic placeholders as descriptions.
