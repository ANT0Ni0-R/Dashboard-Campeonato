# Gold de Funil de Vendas — Grupo Primo

Construção de uma camada **Gold de funil multi-produto** (deals → ativados → vendas) com
identidade resolvida por pessoa, no dbt. Este arquivo é o ponto de entrada; o detalhe
fica em `docs/ai/` e só deve ser aberto quando necessário.

## Missão (em uma frase)

Uma tabela Gold no grão de **deal enriquecido** (1 linha por `deal_id`), carimbada com
`person_id` (pessoa canônica) e `product_id` (produto canônico), com datas e flags de
ativação e venda, atribuição dupla (dono da ativação × PMO da venda) e os atributos da
pesquisa de quem preencheu — servindo quebras por origem do lead e tier.

## Onde se constrói

- Projeto dbt: **`grupo-primo-crm-prd`** (você tem acesso de escrita aqui).
- As fontes vivem em **dois** projetos GCP, então `sources.yml` tem dois `database`:
  - `grupo-primo-crm-prd` → transactions (fonte de verdade de GMV).
  - `grupo-primo-prd` → deals, deals_history, leads, pesquisas (leitura cross-project).

## Convenções obrigatórias

- **Queries ad-hoc** levam header: `/* origin=claude; session_id=<8 chars>; turn=N; type=adhoc|analysis|report */`.
- **`LIMIT 100`** por padrão em query de linha; remover só com aprovação explícita.
- Sempre **project ID completo** em referências fora do dbt: `projeto.dataset.tabela`.
- **Respeite partição/cluster** (ver `docs/ai/fontes.md`); filtrar a coluna de partição crua, sem `DATE()`.
- **PII** (email/telefone) fica interna — nunca enviar para URL externa (download local ok).
- O MCP do BigQuery é **read-only**; `DECLARE` não funciona por lá (inline os valores).

## Camadas (medallion)

```
seeds/        dim_produto              <- você mantém (de-para de produto)
staging/      stg_* (1:1 com a fonte, limpeza leve)
intermediate/ int_person_keys, int_deal_activation, ...
marts/        dim_person, fct_deals, fct_sales, dim_survey
gold/         fct_funil
```

## Sharp edges (as que mais machucam)

1. **GMV correto vem do CRM**, não do `prd`. A transactions do `grupo-primo-prd` subconta
   GMV (não multiplica parcelas em produtos como Vivendo de Leilão e Profissão Bancário).
   Use `grupo-primo-crm-prd.grupo_primo_crm.mrt_sales_team__transactions_with_sales_request`.
2. **`get_table_info` no projeto CRM falha** por permissão — confira o schema da transactions
   via `SELECT` cross-project, não pelo metadata.
3. **Ativação "pula" linhas**: o history é snapshot de 30 min; um deal pode passar de `Base`
   direto a uma etapa adiante sem registrar `Ativado`. Logo, "ativado" = chegou a `Ativado`
   **ou qualquer etapa de progressão posterior**. Ver `docs/ai/identidade.md`.
4. **Fan-out do JKC**: Jackson Araujo tem dois `seller_name` → duplica linha só pra JKC.
5. **`rows` é palavra reservada**; `GROUP BY` usa a expressão inteira, não o alias do SELECT;
   filtro em alias do SELECT precisa de CTE antes.
6. **A pesquisa já vem deduplicada** (1 linha por email+campanha) — não re-deduplique.

## Por onde começar

Leia `docs/ai/plano.md`. Caminho crítico = o seed `dim_produto` (sem ele os três funis
não casam). Antes do build, validar via `SELECT` as colunas de: transactions (CRM),
`stg_clint__deals_history` e `mrt_grupo__leads`.

## Índice de referência

- `ERROS.md` — erros já cometidos e resolvidos neste subprojeto (dbt/BigQuery). **Ler antes de codar.**
- `docs/ai/arquitetura.md` — DAG, modelos, grão, atribuição.
- `docs/ai/fontes.md` — tabelas, colunas (✓ validado / ⚠ confirmar), partições, gotchas por tabela.
- `docs/ai/identidade.md` — `dim_person` (resolução já testada em campo) + régua de ativação + seed `dim_produto`.
- `docs/ai/plano.md` — sequência de build, decisões em aberto, primeiras tarefas.
