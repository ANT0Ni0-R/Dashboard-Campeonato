# Plano de build

## Sequência sugerida (de baixo pra cima do DAG)

1. **`sources.yml`** com os dois `database`: `grupo-primo-crm-prd` (transactions) e
   `grupo-primo-prd` (deals, history, leads, pesquisas). Rodar `dbt debug`.
2. **Confirmar schemas ⚠** via `SELECT` cross-project: transactions (CRM), `stg_clint__deals_history`,
   `mrt_grupo__leads`. (`get_table_info` não funciona no projeto CRM.)
3. **`dim_produto` (seed)** — bootstrap com os valores distintos das três fontes; amarrar o de-para.
4. **`stg_*`** — limpeza 1:1: normalização de email/telefone, dedup onde a fonte exige
   (deals_history via `ROW_NUMBER`), exclusão de reembolso na transactions.
5. **`int_person_keys`** — união de todas as chaves (email/telefone normalizados) → `dim_person`.
6. **`int_deal_activation`** — `activated_at` + dono da ativação a partir do history (escopado por deal).
7. **Marts**: `dim_person`, `fct_deals`, `fct_sales`, `dim_survey`.
8. **`fct_funil`** (gold) — junta por `person_id × product_id`.
9. **Testes**: `unique`/`not_null` nas PKs (`deal_id`, `person_id`, `product_id`),
   `relationships` de `fct_funil` para as dimensões, `accepted_values` em `tipo`/`survey_type`.

## Materialização (sugestão)

- staging: `view`
- intermediate: `ephemeral`
- marts/gold: `table` (avaliar `incremental` por `transaction_dt`/`created_at` se passar de ~1M linhas)

## Decisões em aberto (fechar com o Antonio)

1. **Grão da Gold**: deal enriquecido (proposto) ou já agregar por pessoa×produto×campanha?
2. **person_id**: começar determinístico e evoluir pro grafo (proposto), ou já fazer grafo?
3. **Régua de ativação**: hardcode por produto ou seed `dim_stage_order`?
4. **leads no `fct_funil`**: entram como denominador (topo de funil) ou ficam num modelo à parte?

## Primeira tarefa concreta

Montar o esqueleto do `dim_produto`: rodar três `SELECT DISTINCT` (`group_name`, `campaign`,
`product_name`), juntar num CSV e preencher o de-para. Isso destrava todo o resto.

## Estado do ambiente (já resolvido)

- dbt-bigquery em venv Python 3.12 (dbt-core não suporta 3.14); `dbt debug` ok no `grupo-primo-prd`.
- Auth: `gcloud auth login` + `gcloud auth application-default login` (o ADL é o que o dbt usa).
- Acesso de escrita ao dbt do projeto CRM disponível.
