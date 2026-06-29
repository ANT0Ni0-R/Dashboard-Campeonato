---
name: new-lookml
description: Generate LookML for the CRM Looker project — map a dbt mart to a .view.lkml view and build a .dashboard.lookml dashboard as code. Use when creating/updating Looker views or dashboards, mapping a dbt model to the semantic layer, or generating LookML for a new mart. Validated by driver.py (lkml parse + column match, dashboard YAML lint).
argument-hint: "[view|dashboard] [model_name]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# New LookML (View + Dashboard as Code)

Gera a camada Looker do projeto CRM a partir de um mart dbt. Duas saídas, mesmo padrão e
mesmo harness de validação (`driver.py`). **Não há Looker local** (Looker é SaaS) — a verificação
é parse + match de colunas, rodada via `driver.py`, que é o caminho principal desta skill.

Paths são relativos à raiz do repo (`<unit>/`). O driver fica em
`.claude/skills/new-lookml/driver.py`.

## Convenções do projeto (verificadas no repo)

- **Conexão/dataset:** views apontam para `grupo-primo-crm-prd.grupo_primo_crm.<modelo>` (o dataset
  onde o dbt materializa). **Nunca** usar placeholder `seu-projeto-gcp.dataset_mart`.
- **Model Looker:** `crm` (em `lookml/crm.model.lkml`). Todo elemento de dashboard usa `model: crm`.
- **Idioma:** labels e descriptions em **pt-BR**.
- **View** → `lookml/views/<subpasta>/<modelo>.view.lkml` (ex.: `views/extrato_leads/`).
- **Dashboard** → `lookml/<nome>.dashboard.lookml` na raiz de `lookml/`.

## Run (harness) — caminho principal

```bash
pip install lkml pyyaml          # uma vez
python .claude/skills/new-lookml/driver.py view \
  lookml/views/extrato_leads/<modelo>.view.lkml \
  models/mart/dashboard/_<modelo>.yml
python .claude/skills/new-lookml/driver.py dashboard \
  lookml/<nome>.dashboard.lookml \
  lookml/views/extrato_leads/<modelo>.view.lkml
```
- `view`: faz parse do `.view.lkml` com `lkml` e cruza as `dimension`/`dimension_group` contra as
  colunas do `.yml` do mart (fonte de verdade offline). Falha se uma dimensão referencia
  `${TABLE}.x` que não existe no `.yml`, ou se uma coluna do `.yml` não tem dimensão.
- `dashboard`: parse YAML + lint estrutural (`- dashboard:`, `layout`, `preferred_viewer`,
  `filters`, `elements`) e cruza cada `fields`/`field` dos tiles contra as dimensões/measures da
  view; valida que todo tile aponta `model: crm`.
- Exit code 0 = OK; 1 = erros listados no stdout.

## Generate: view

1. Ler o `.sql` do mart e o `_<modelo>.yml` (colunas + descriptions já documentadas).
2. Gerar o `.view.lkml`:
   - `sql_table_name: \`grupo-primo-crm-prd.grupo_primo_crm.<modelo>\` ;;`
   - `dimension: pk { type: string  primary_key: yes  hidden: yes  sql: concat(...) ;; }` com a
     chave única do `.yml` (ou o `concat` das colunas de grão).
   - Para cada coluna: `string` → `dimension type: string`; numérica → `dimension type: number`;
     data/timestamp → `dimension_group` com `timeframes: [raw, time, date, week, month, quarter, year]`.
   - `label`/`description` em pt-BR; para faixas, usar `order_by_field` apontando para uma
     dimensão `_sort` oculta.
   - Measures básicas com `group_label` e `value_format_name`: contagem (`count`/`count_distinct`),
     somas (`sum_*`), médias e `%` derivados via `safe_divide`/`nullif`.
3. Rodar `driver.py view`.

## Generate: dashboard

1. A partir das dimensões/measures da view, montar `lookml/<nome>.dashboard.lookml`:
   - Cabeçalho: `- dashboard: <nome>`, `title`, `layout: newspaper`, `preferred_viewer: dashboards-next`,
     `description`.
   - `filters:` nativos relevantes (Data, BU, Status, faixa) com `model: crm` e `explore`.
   - `elements:` com, no mínimo: **Single Value** (KPIs), **looker_column/looker_bar**
     (distribuições) e **looker_grid** (tabela detalhada). Cada tile: `model: crm`, `explore`,
     `fields`, `filters`, `sorts`, `row/col/width/height`, `listen`.
2. Rodar `driver.py dashboard`.

## Registrar no model

Adicionar em `lookml/crm.model.lkml`: um bloco `explore: <modelo> { label/description/group_label }`
e, se for um novo dashboard file, um `include: "/<nome>.dashboard.lookml"`. A view entra
automaticamente pelo glob `include: "/views/**/*.view.lkml"`.

## Gotchas

- `.view.lkml` é sintaxe LookML (blocos `{}`) → parser `lkml`. `.dashboard.lookml` é **YAML**
  (`- dashboard:`) → parser `pyyaml`. São formatos diferentes; o driver trata cada um.
- O dataset do `sql_table_name` é `grupo_primo_crm` em `grupo-primo-crm-prd`, **não** o projeto
  `grupo-primo-prd` onde vivem os marts de origem (`mart_portfel` etc.).
- Looker não valida localmente; o parse não garante que o Looker aceite tudo (ex.: nomes de campo
  em `listen`), mas o match de colunas pega 90% dos erros (dimensão apontando coluna inexistente).
- Measures que não re-agregam (médias, %) devem ser `type: number` com `safe_divide`, nunca `sum`.
- **`value_format` com texto literal (R$, %, etc.):** o Looker usa formato estilo Excel — letras
  literais PRECISAM vir entre aspas. `"R$#,##0"` falha ("unrecognized character R"); o correto é
  `value_format: "\"R$\"#,##0"`. O `driver.py view` agora pega isso. Para % use `value_format_name: percent_1`.
