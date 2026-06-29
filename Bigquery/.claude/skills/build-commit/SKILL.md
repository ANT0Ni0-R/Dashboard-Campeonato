---
name: build-commit
description: Prepare changed dbt and BigQuery SQL work for commit. Runs sqlfluff fix, flags debug filters, compiles changed models, documents YAMLs with PII policy tags (via document-sql-yml), and documents CTEs.
argument-hint: "[--dry-run] [--skip-compile] [--verbose]"
---

# Build Commit

Prepare dbt changes for commit by running the build-commit workflow and documenting CTEs.

## Step 1 — Run the build workflow

Execute from the repo root:

```bash
./build_commit $ARGUMENTS
```

The script will:
1. Detect changed `.sql` files (unstaged, staged, untracked)
2. Run `sqlfluff fix` on each changed SQL file
3. Compile changed dbt models to infer output columns
4. Warn when a changed model has no `uid` column and no `unique` + `not_null` test
5. Flag likely debug filters left in changed SQL files
6. Compile changed models and downstream dependents
7. Print a consolidated summary

After running, report the summary to the user and highlight any warnings or errors.

## Step 2 — Validar compilação downstream (+1)

Após compilar os modelos alterados, valide que os dependentes diretos (+1) também compilam sem erro, garantindo que as mudanças não quebraram o pipeline.

1. Para cada modelo alterado (apenas modelos em `models/`, ignorar `tests/`), execute:
   ```bash
   dbt compile -s <model_name>+1
   ```
   O seletor `+1` inclui o próprio modelo **e** seus filhos diretos.

2. Se a compilação falhar para algum modelo, reporte o erro ao usuário com o nome do modelo e a mensagem de erro.

3. Se todos compilarem com sucesso, confirme no resumo final que a validação downstream passou.

## Step 3 — Documentar YAMLs e classificar PII

Para cada arquivo `.sql` alterado (detectado no Step 1), executar a skill `/document-sql-yml` passando o caminho do arquivo ou da pasta. Isso irá:
- Sincronizar colunas no YAML (adicionar ausentes, inferir descrições).
- Classificar colunas PII e aplicar policy tags automaticamente.
- Preservar entradas YAML e policy tags já existentes.

Se houver múltiplos arquivos alterados na mesma pasta, passar a pasta uma única vez para evitar reprocessamento.

## Step 4 — Document CTEs in changed models

After the build workflow completes, read each changed `.sql` model and add brief comments above each CTE. Follow these rules:

1. **Priorize contexto de negócio da memória**: se você participou do desenvolvimento do modelo ou discutiu suas regras de negócio em conversas anteriores, use esse conhecimento para explicar o *propósito de negócio* da CTE (ex: `-- Filtra apenas contratos ativos para cálculo de ranking`).
2. **Fallback para explicação lógica**: se não tiver contexto de negócio forte, descreva de forma concisa o que a CTE faz tecnicamente (ex: `-- Agrega pagamentos por contrato, mantendo apenas o mais recente`).
3. **Transformações complexas**: quando a CTE envolve um tratamento longo ou complexo, adicione também uma nota breve sobre como o dado será usado nas CTEs seguintes ou no select final.
4. **Formato**: use comentários SQL de linha única (`-- ...`) em português (pt-BR), na linha imediatamente acima da definição da CTE. Mantenha os comentários curtos (1-2 linhas no máximo).
5. **Não sobrescreva comentários existentes**: se a CTE já tem um comentário descritivo, preserve-o. Apenas adicione ou melhore onde a documentação está ausente ou pouco clara.
6. **Ordenação de colunas**: em cada SELECT, garanta que as colunas sigam a ordem: IDs → Dates → Dimensions → Metrics. Se encontrar colunas fora de ordem, reorganize-as.

### Exemplo

```sql
-- Busca contratos ativos com data de vigência válida
with contratos_ativos as (
    select ...
),

-- Calcula o prêmio líquido por contrato para uso no ranking final
premio_liquido as (
    select ...
)
```

## Commit message conventions

Mensagem em **inglês** (título e corpo), conventional-commit, sem co-autoria.

- **Título** — uma linha: `type(scope): imperative summary in lowercase`.
  - `type` ∈ `feat` | `fix` | `refactor` | `chore` | `docs` | `test` | `perf`.
  - `scope` = modelo ou área tocada (ex.: `int_fpf__survey`, `fpf`).
  - imperativo, minúsculas, sem ponto final.
- **Corpo (descrição)** — sempre presente, nunca só o título; separado do título por uma linha em branco:
  - diga **o quê** mudou e **por quê** (o "como" o diff já mostra).
  - 1 parágrafo enxuto; use poucos bullets quando houver várias frentes.
- **Sem trailer `Co-Authored-By`** (sobrepõe o default global).
