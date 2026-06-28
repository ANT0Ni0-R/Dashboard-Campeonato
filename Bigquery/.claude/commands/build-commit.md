---
description: Prepare changed dbt and BigQuery SQL work for commit. Runs sqlfluff fix, syncs YAMLs, flags debug filters, compiles changed models, validates downstream dependents, and documents CTEs.
---

# Build Commit

Run the repository's build-commit workflow to prepare dbt changes for commit.

## Step 1 — Run the build workflow

Execute from the repo root:

```bash
cd /home/arthurharo/repos/dbt-primo-crm && ./build_commit $ARGUMENTS
```

This script will:

1. Detect changed `.sql` files (unstaged, staged, untracked)
2. Run `sqlfluff fix` on each changed SQL file
3. Compile changed dbt models to infer output columns
4. Warn when a changed model has no `uid` column and no `unique` + `not_null` test
5. Flag likely debug filters left in changed SQL files
6. Compile changed models and downstream dependents
7. Print a consolidated summary

After running, report the summary and highlight any warnings or errors.

## Step 2 — Validate downstream compilation (+1)

For each changed model under `models/` (skip `tests/`), run:

```bash
dbt compile -s <model_name>+1
```

Report any compilation errors with the model name and message. Confirm in the final summary if all downstream dependents compiled successfully.

## Step 3 — Sync YAMLs and classify PII

For each changed `.sql` file detected in Step 1, invoke `/document-sql-yml` with the file or its folder. This will:

- Add missing columns to the YAML (infer descriptions in pt-BR).
- Classify PII columns and apply policy tags.
- Preserve all existing entries and policy tags.

If multiple changed files share the same folder, pass the folder once to avoid reprocessing.

## Step 4 — Document CTEs in changed models

Read each changed `.sql` model and add brief `-- ...` comments in pt-BR above each CTE that lacks one. Follow these rules:

1. Use business context from memory when available; otherwise describe what the CTE does technically.
2. Keep comments to 1–2 lines maximum.
3. Never overwrite existing descriptive comments.
4. Ensure column order in each SELECT follows: IDs → Dates → Dimensions → Metrics.
