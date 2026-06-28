# Erros cometidos e solucionados — Bigquery / dbt

> Log de erros especificos do subprojeto **Bigquery** (modelos dbt no `grupo-primo-crm`).
> Erros globais (que valem pro repo todo) ficam no `ERROS.md` da raiz.
>
> **Antes de codar, leia este arquivo e o `ERROS.md` global.**
> Formato: `### <Area>: <titulo>` + **Sintoma** / **Causa** / **Solucao**.

---

## dbt: ref() em comentario cria ciclo ("Found a cycle")

**Sintoma:** `Compilation Error / Found a cycle: model.<projeto>.<modelo>` — o modelo aparece
referenciando a si mesmo, mesmo sem `ref` no codigo executavel.

**Causa:** o dbt renderiza Jinja **antes** de qualquer parsing, inclusive **dentro de
comentarios** SQL (`/* */`) e YAML (`#`). Um `{{ ref('o_proprio_modelo') }}` escrito como
exemplo de uso num comentario do cabecalho vira uma aresta real no grafo -> auto-referencia.

**Solucao:** nunca usar `{{ ref(...) }}`/`{{ source(...) }}` em comentario. Escrever o nome
como texto puro (ex.: "left join este modelo (nome) using (match_key)").

---

## dbt: fonte duplicada ("two sources with the name")

**Sintoma:** `Compilation Error / dbt found two sources with the name "<schema>_<tabela>"`.
Aborta o parse do projeto **inteiro** (nenhum modelo roda).

**Causa:** definir num `_sources.yml` novo uma fonte que **ja existe** em outro arquivo
(ex.: `models/staging/_sources.yml`). As fontes de `grupo-primo-prd` (`mart_grupo`,
`mart_lancamentos`) ja estao cadastradas no projeto.

**Solucao:** antes de criar `sources`, checar se ja existem (`grep` no `models/staging`).
Se existem, **reusar** o mesmo `source('nome','tabela')` no `.sql` e nao redeclarar.

---

## BigQuery/dbt: "query is too complex" em SQL iterativo

**Sintoma:** `Resources exceeded during query execution: Not enough resources for query
planning - query is too complex.`

**Causa:** SQL com muitas CTEs encadeadas que referenciam repetidamente as fontes cruas
(ex.: connected-components com N iteracoes de label-propagation). O dbt faz **inline** de
CTE — entao as 4 fontes eram re-escaneadas a cada iteracao e o plano explodia.

**Solucao:** **materializar os passos intermediarios em tabelas fisicas** (quebrar em
varios modelos `table`). Cada iteracao passa a ler uma tabela pronta, nao a re-inlinar tudo.
Caso do `int_sales_team__person_keys`: dividido em `_pairs` (scan unico) -> `_graph`
(adjacencia) -> modelo final (propagacao lendo o grafo fisico).

---

## gcloud/dbt: leitura cross-project falha (serviceusage / quota project)

**Sintoma:** `Caller does not have required permission to use project grupo-primo-prd.
Grant ... roles/serviceusage.serviceUsageConsumer ...` ao ler tabela de outro projeto.
A conexao mesmo-projeto (`dbt debug`) passa; so a leitura cross-project quebra.

**Causa:** ADC autenticado com conta de usuario **sem quota project** definido e **sem**
`serviceusage.services.use`. Sem quota project, o BigQuery cobra o `serviceusage` no
proprio projeto lido (`grupo-primo-prd`), onde a conta nao tem permissao.

**Solucao (preferida):** impersonar o service account do dbt (no `profiles.yml`:
`impersonate_service_account: <SA>`) — precisa de `roles/iam.serviceAccountTokenCreator`
sobre esse SA. **Alternativa:** admin concede `roles/serviceusage.serviceUsageConsumer`
no projeto de billing + `roles/bigquery.dataViewer` em `grupo-primo-prd`, e entao
`gcloud auth application-default set-quota-project grupo-primo-crm-dev`.
(O `gcloud auth ... login --scopes` NAO resolve — o problema e IAM, nao escopo.)

---

## BigQuery: backreference de regex nao funciona (RE2)

**Sintoma:** regex com `\1` (ex.: `^(\d)\1{9}$` para detectar digitos repetidos) da erro
ou nao casa.

**Causa:** o BigQuery usa a engine **RE2**, que **nao suporta backreferences**.

**Solucao:** reescrever sem backreference. Para "todos os digitos iguais" use
`coluna = REPEAT(SUBSTR(coluna,1,1), LENGTH(coluna))`.

---

## Identidade: normalizacao ingenua de telefone fragmenta a pessoa

**Sintoma:** o mesmo telefone real gera varias `phone_key` diferentes (ex.: `1193914037`,
`5519939140`, `5551199391`) -> a pessoa se divide em varios `person_id`, e truncamentos
viram pontes falsas entre pessoas distintas.

**Causa:** tratar DDI `55`, o 9o digito opcional e lixo de tamanho com regra fraca
(ex.: so cortar DDI quando `LENGTH IN (12,13)`, ou pegar "ultimos 8" sobre numero com lixo).

**Causa-raiz aceita:** o 9o digito "nao fica 100%" (ver `identidade.md`).

**Solucao:** digitos -> tira DDI `55` so quando sobra nacional plausivel (`LENGTH >= 12`) ->
aceitar a chave **so** se o nacional tiver 10 ou 11 digitos -> `phone_key = DDD + ultimos 8`.
Tamanho fora disso vira `NULL` (nao faz ponte em lixo). Telefone de alto grau
(>= 6 emails) e repdigit entram na **blocklist** e nao propagam aresta.

---

## BigQuery: canal TVD nao e `is_in_tvd_portfolio`

**Sintoma:** filtrar vendas do time de vendas por `is_in_tvd_portfolio = TRUE` zera o funil
do Legado (todas as 2.822 vendas tem `is_in_tvd_portfolio = FALSE`), apesar de o Legado ser
claramente um produto do time de vendas.

**Causa:** `is_in_tvd_portfolio` mede outra coisa (produto no portfolio TVD), nao "esta venda
passou pelo time de vendas". O canal correto e a coluna **`sales_channel`** da
`mrt_sales_team__transactions_with_sales_request` (valores `TVD` x `OUTROS`).

**Solucao:** filtrar `sales_channel = 'TVD'`. Bate 1:1 com `canal1 = 'TVD'` e e exatamente
onde `seller_pmp`/`seller_name` vem 100% preenchidos (no Legado: 784 vendas / R$ 2,99 mi).
A base do `int_..._transactions_with_sales_request_with_person_id` tem que ser a **mrt** (que
carrega `sales_channel`), nao o intermediario que a abstrai.

---

## BigQuery: colisao de product_id ao trocar a base da transactions

**Sintoma:** `CREATE TABLE has columns with duplicate name product_id` no build da
transactions, ou o oposto (`* except (product_id)` falha porque a coluna nao existe).

**Causa:** o intermediario antigo trazia uma coluna escalar `product_id` (id de origem), que
colidia com o `product_id` canonico do de-para. A **mrt** (`mrt_sales_team__transactions_with_sales_request`)
**nao** tem `product_id` escalar (so o array `products`).

**Solucao:** ao usar a mrt como base, NAO usar `* except (product_id)` nem criar
`product_id_origem` — o `product_id` canonico vem so do join com `map_transactions_produto`.
Conferir as colunas da fonte (`INFORMATION_SCHEMA.COLUMNS`) antes de escrever o `select *`.

---

## BigQuery: GROUP BY / filtro por alias do SELECT

**Sintoma:** `Unrecognized name: <alias>` ao usar `GROUP BY <alias_do_select>` (ou filtrar
um alias no mesmo `WHERE`).

**Causa:** o GoogleSQL resolve `GROUP BY`/`WHERE` antes dos aliases do `SELECT`.

**Solucao:** repetir a expressao inteira no `GROUP BY`, ou materializar o alias numa CTE
antes de agrupar/filtrar. (Tambem listado nos gotchas transversais de `fontes.md`.)
