# Fontes

Legenda: **✓** schema validado (via `get_table_info`) · **⚠** vem de contexto anterior, confirmar via `SELECT` antes do build.

---

## ✓ `grupo-primo-prd.mart_sales_team.mrt_sales_team__clint_deals_cleaned`

Base do `fct_deals` e fonte das chaves do `person_id`. **1 linha por `deal_id`** (estado atual).
~675k linhas, **não particionada**.

| coluna | uso |
|---|---|
| `deal_id` | PK / grão do fct_deals |
| `contact_id` | ligação com history e messages |
| `contact_email`, `contact_phone` | matéria-prima do person_id — **sem policy tag, legíveis** |
| `group_name`, `product_group`, `origin_name` | chave de produto (→ dim_produto) e quebra de origem |
| `deal_stage`, `deal_status` | etapa atual / status (OPEN/WON/LOST) |
| `deal_tier`, `deal_tier_criterio` | tier (coluna real — preferir ao JSON, que é esparso) |
| `created_at` | data de entrada no funil |
| `won_at`, `lost_at` | venda/perda no próprio deal (fallback de venda) |
| `owner_email`/`owner_pmp`, `sdr_email`/`sdr_pmp`, `closer_email`/`closer_pmp` | atribuição |
| `fields` (JSON) | `$.origem_do_lead`, `$.tier` só como fallback |

Gotchas: origem do lead = `JSON_VALUE(fields,'$.origem_do_lead')` (não `origin_name`, que é origem
de funil); o funil tem ordem fixa de etapas e **difere por produto** (FPF é mais rico que Legado).

---

## ⚠ `grupo-primo-crm-prd.grupo_primo_crm.mrt_sales_team__transactions_with_sales_request`

Base do `fct_sales`. **Fonte de verdade de GMV** (versão do `prd` subconta parcelas).
Particionada por mês em `transaction_dt`.

> **`get_table_info` falha por permissão neste projeto.** Confirme colunas via `SELECT`
> cross-project rodando a partir de `grupo-primo-prd`.

Colunas esperadas (confirmar nomes): email/telefone do comprador, `product_name` (substring,
excluir reembolso), `gmv` (já multiplica parcelas aqui), `seller_pmp`, `pmp`, `bu_short`,
`sales_channel`, `transaction_dt`.

Gotchas: `bu_short` inconsistente (`BP`/`Bp` → `UPPER(TRIM())`); `Portfel` não existe como
`bu_short`; `Grao` tem ~8 linhas; **fan-out do JKC** (Jackson com dois `seller_name`) duplica
linha — deduplicar. GMV ponderado: `SUM(gmv)/SUM(vendas)`, nunca média de tickets.

---

## ⚠ `grupo-primo-prd.staging_clint.stg_clint__deals_history`

Só para `activated_at`. **1 linha por mudança de etapa**, snapshot de 30 min.
**Não particionada** (~1,7 GB / 4,4M linhas) → **sempre** escopar por
`deal_id IN (SELECT deal_id FROM <cte_do_escopo>)` pra evitar full scan.

| coluna | uso |
|---|---|
| `deal_id` | join com fct_deals |
| `deal_stage` | identificar etapas de ativação (a "régua") |
| `updated_stage_at` | `activated_at` = MIN entre etapas de ativação |
| owner / `user_pmp` | dono da 1ª etapa de ativação (atribuição) |

Alternativa: `mart_sales_team.mrt_sales_team__clint_deals_history_cleaned` usa
`entered_stage_at` (equivalente) e carrega `user_pmp`. O `rn` nativo do history é **não
confiável** → use `ROW_NUMBER() OVER (PARTITION BY deal_id ORDER BY updated_at DESC)`.

---

## ✓ `grupo-primo-prd.mart_lancamentos.mrt_lancamentos__pesquisas_compiladas`

`dim_survey`. **Granularidade: 1 linha por email + campanha** (`is_first_answer_campaign = 1`).
~1,08M linhas. **Já deduplicada — não re-deduplique.**

| coluna | uso |
|---|---|
| `email` (99,99% preenchido, legível), `phone` (91%) | person_id (PII interna) |
| `campaign` | chave de produto (→ dim_produto; **69 códigos** distintos) |
| `survey_type` | separar `Leads` × `Alunos` |
| `tier`, `income`, `wealth`, `age`, `career_moment`, `consultant_interest`, `objective_*`… | perfil de quem preencheu |
| `bought_or_not` | flag de compra já cruzada (atalho/validação) |
| `createddate` | data da resposta (preenchida com data do lead quando ausente) |

Gotchas: `campaign` é mapeada via `stg_google_sheets__map_lancamentos`; lista de espera
`BT0001` é remapeada para `BT0002`. `email`/`phone`/`name`/renda têm policy tag mas são
legíveis pelo nosso service account (confirmado).

---

## ⚠ `grupo-primo-prd.mart_grupo.mrt_grupo__leads`

Topo de funil (denominador de Leads) e reforço do person_id. Particionada por mês em
`lead_created_date`, **clusterizada por `campanha`**.

| coluna | uso |
|---|---|
| `lead_email`, `lead_phone_number` (+ `lead_phone_ddi`) | person_id + contagem de Leads. **Nao existe `lead_phone`** (confirmado 2026-06-28). |
| `lead_created_date` | partição (filtrar direto, sem `DATE()`) + data de criação |
| `campanha` (cluster) | chave de produto p/ leads |
| `origem_do_lead`, `tier` | quebra no topo |
| `lead_name` | nome (first/last mascarados → usar `lead_name` ou `SPLIT`) |

---

## Gotchas transversais de BigQuery

- `rows` é palavra reservada — não use como alias.
- `GROUP BY` usa a expressão inteira, não o alias do SELECT.
- Filtro em alias do SELECT não funciona no mesmo `WHERE` → materialize numa CTE antes.
- `ROLLUP`/`GROUPING`: alias do SELECT igual à coluna do `GROUP BY` quebra — use alias diferente.
- `NOT EXISTS`/`NOT IN` com `OR` em dois campos falha → use dois `LEFT JOIN` ou
  `LEFT JOIN` + `COALESCE(n,0)=0`.
- `stg_clint__deals`: já deduplicado por `rn = 1`.
- `stg_clint__messages`: particionada por dia em `created_at` — filtrar `created_at >= DATETIME '...'`,
  **nunca** envolver em `DATE()`. `user_email` tem sufixo `+gp` → `REGEXP_REPLACE(email, r'\+[^@]*', '')`.
- `mrt_grupo__ads`: deduplicar a `(ad_date, media, ad_id)` antes de somar spend.
