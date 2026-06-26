# Abas da planilha — Dashboard Gerencial

O dashboard e **escalavel**: cada dashboard e **uma Google Sheet** com as abas abaixo +
Apps Script vinculado + um Web App proprio. Para criar outro, **duplica-se a planilha**
(`Arquivo > Fazer uma copia`), ajustam-se as abas e faz-se um novo deploy. Os **segredos**
do Supabase ficam em Script Properties (nunca na planilha).

## Aba `Config` (duas colunas: chave | valor)

| chave | exemplo | papel |
|---|---|---|
| `titulo` | `O Legado` | nome exibido no menu |
| `produto` | `Formacao Consultor de IA` | subtitulo / nome do produto |
| `premio` | `A definir` | chip de premio (opcional) |
| `slug_like` | `%legado%` | filtro do produto no **Supabase** (`slug ilike`) |
| `participantes` | `EZB,FAL,JKC` | PMPs em destaque (nomes via aba Participantes). Opcional — o ranking lista todos os vendedores TVD |
| `inicio` | `2026-06-16T00:00:00-03:00` | inicio da janela (ISO com fuso) |
| `fim` | `2026-06-20T23:59:59-03:00` | fim da janela (ISO com fuso) |
| `poll_segundos` | `60` | intervalo de auto-refresh da visao real-time |
| `fotos_base` | `https://raw.githubusercontent.com/ANT0Ni0-R/Dashboard-Campeonato/main/assets/fotos/` | base das fotos. O codigo SEMPRE monta `<PMP>.jpg` (minusculo), entao os arquivos no diretorio precisam ser `<PMP>.jpg` minusculo. Use `assets/fotos/` (consolidado); URL raw e **case-sensitive** no caminho |
| `tabela` | `db_transactions_events` | tabela do Supabase |
| `url` | `https://ipalripfknzhrzddhvdx.supabase.co` | endpoint do Supabase (pode vir de Script Property) |
| `bq_project` | `grupo-primo-prd` | **com hifens** — projeto do BigQuery (PR2) |
| `bq_table` | `grupo-primo-crm-prd.grupo_primo_crm.mrt_sales_team__transactions_with_sales_request` | tabela de transactions no BigQuery. **Cross-project**: vive em `grupo-primo-crm-prd`, mas o billing roda em `bq_project` (`grupo-primo-prd`). Colunas de data: `transaction_created_date` (DATE, BRT) e `transaction_created_at` (DATETIME em **UTC**) |
| `bq_product_like` | `%legado%` | filtro do produto no **BigQuery** (`product_name LIKE`) (PR2) |
| `canal_tvd` | `TVD` | valor de `sales_channel` que identifica o time de vendas no BigQuery (PR2) |
| `pmp_aliases` | `JCK:JKC` | correcao de PMP trocado na origem (link de pagamento). Funde no ranking/foto/atribuicao. Formato `DE:PARA,DE:PARA`. Vazio = default `JCK:JKC` |
| `funil_group_name` | `%MBA IA [TDV 2]%` | nome do grupo no CRM (`clint_deals_*`) do **Funil**. Correspondencia **aproximada case-insensitive** (`LOWER(group_name) LIKE LOWER(valor)`) — os nomes de grupo sao longos/instaveis entre lancamentos, entao basta um trecho identificavel. Embrulhe em `%...%` (mesma convencao de `slug_like`/`bq_product_like`); se omitir os `%`, o codigo embrulha sozinho |
| `funil_origin_name` | `%Formação Consultor de IA%` | **opcional**. Estreita o escopo do funil a um `origin_name` (funil da Clint) **dentro** do grupo. **Vazio** = grupo inteiro e o lancamento (modo **legado**, quando o grupo era dedicado). **Preenchido** = so aquele funil (modo **FIA**, quando o grupo `MBA IA [TDV 2]` e compartilhado entre varios funis e o lancamento e a origem `Formação Consultor de IA`). Match aproximado LIKE, igual a `funil_group_name`. Afeta base/ativados/vendas/TMR de uma vez |
| `funil_campanha` | `BAR0001` | filtro `campanha` na tabela de leads do **Funil** (`mrt_grupo__leads`) |
| `bq_deals_history_table` | `grupo-primo-prd.mart_sales_team.mrt_sales_team__clint_deals_history_cleaned` | historico de etapas (ativacao) |
| `bq_deals_cleaned_table` | `grupo-primo-prd.mart_sales_team.mrt_sales_team__clint_deals_cleaned` | base do grupo + origem do lead |
| `bq_deals_enriched_table` | `grupo-primo-prd.mart_sales_team.mrt_sales_team__clint_deals_enriched` | funil TDV (reservado) |
| `bq_leads_table` | `grupo-primo-prd.mart_grupo.mrt_grupo__leads` | volume de leads / conversao geral |
| `bq_messages_table` | `grupo-primo-prd.staging_clint.stg_clint__messages` | mensagens do chat (TMR) |
| `tvd_channel_ids` | `b5a67dba-...,fa4ca424-...,2b86238b-...,16d9b4ae-...` | 4 `chat_channel_account_id` do Clint (TVD) usados no TMR. Separados por virgula |

> Todas as chaves do **Funil** tem defaults em `DEFAULTS` (Code.gs); so preencha na aba para
> sobrescrever. A janela do Funil reusa `inicio`/`fim`.

> **TVD no Supabase:** uma venda e do time de vendas (TVD) quando o campo `pmp` **contem "TVD"**.
> "Outros" = `pmp` sem "TVD". No BigQuery, TVD = `sales_channel = 'TVD'` (= `canal_tvd`).

## Aba `Participantes` (PMP | Nome)

| PMP | Nome |
|---|---|
| EZB | Enzo |
| FAL | Fernando |
| JKC | Jackson |

Mapa PMP -> Nome para exibir o ranking. Opcional (sem nome, mostra o PMP).

## Aba `Acessos` (Email | Nivel | PMP) — controle de acesso + closer logado

| Email | Nivel | PMP |
|---|---|---|
| fulano@grupo-primo.com | admin | |
| ciclano@grupo-primo.com | viewer | JKC |

Allowlist de e-mails liberados. O `doGet` le `Session.getActiveUser().getEmail()` (visitante do
mesmo Google Workspace) e bloqueia quem nao estiver nesta aba (serve `AccessDenied.html`). As
funcoes de dados tambem checam (`exigirAcesso_`). **Aba vazia / sem aba = allowlist desligada**
(so o dominio do deploy filtra). E-mail vazio (fora do dominio) com allowlist preenchida = negado.

A coluna **`Nivel`** (2a coluna) define o **papel** do usuario. O valor **`gerencial`** libera a
aba **Funil** (botao so aparece e `getFunilData()` so responde para esse nivel — `exigirGerencial_`).
Outros valores (ex.: `viewer`, `closer`) veem as 3 abas padrao, mas **nao** o Funil. Linhas sem
nivel continuam liberadas para o dashboard padrao.

A coluna **`PMP`** (3a coluna, opcional) mapeia o e-mail -> PMP do closer. Na **Consulta de vendas**
ela separa "Minhas vendas" (vendas desse PMP) das "Vendas Gerais do lancamento" (as demais). Sem
PMP cadastrado, "Minhas vendas" fica vazia com um aviso e todas as vendas aparecem em "Gerais".

## Aba `Snapshot_BQ` (gerada pelo trigger — PR2)

Preenchida automaticamente por um trigger de 30 em 30 min (`snapshotBigQuery_`). Guarda o JSON do
ultimo snapshot do BigQuery e o timestamp. A visao "Comissao" le daqui (sem rodar BQ por request).

| A | B |
|---|---|
| `geradoEm` | `2026-06-24T13:30:00-03:00` |
| `json` | `{...}` (payload do dashboard) |

## Aba `Snapshot_Funil` (gerada pelo trigger do Funil)

Preenchida pelo trigger `snapshotFunil` (30 em 30 min). Como o JSON do funil costuma passar do
limite de ~50.000 chars por celula, ele e gravado **fragmentado**: `B1` = timestamp, `B2` = qtd de
pedacos, `A3:A(n+2)` = pedacos do JSON. `getFunilData()` concatena (`lerJsonChunked_`) e da o parse.
Nao edite a mao. Rode `criarTriggerFunil` uma vez para instalar o trigger e gerar o 1o snapshot.

| A | B |
|---|---|
| `geradoEm` | `2026-06-25T13:30:00-03:00` |
| `chunks` | `3` |
| `{"baseTotal":...` (pedaco 1) | |
| `...continuacao...` (pedaco 2) | |
| `...fim}` (pedaco 3) | |
