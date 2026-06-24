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
| `fotos_base` | `https://raw.githubusercontent.com/.../competicoes/fotos/` | base das fotos `<PMP>.jpg` |
| `tabela` | `db_transactions_events` | tabela do Supabase |
| `url` | `https://ipalripfknzhrzddhvdx.supabase.co` | endpoint do Supabase (pode vir de Script Property) |
| `bq_project` | `grupo-primo-prd` | **com hifens** — projeto do BigQuery (PR2) |
| `bq_table` | `grupo-primo-prd.mart_sales_team.mrt_sales_team__transactions_with_sales_request` | tabela do BigQuery (PR2) |
| `bq_product_like` | `%legado%` | filtro do produto no **BigQuery** (`product_name LIKE`) (PR2) |
| `canal_tvd` | `TVD` | valor de `sales_channel` que identifica o time de vendas no BigQuery (PR2) |

> **TVD no Supabase:** uma venda e do time de vendas (TVD) quando o campo `pmp` **contem "TVD"**.
> "Outros" = `pmp` sem "TVD". No BigQuery, TVD = `sales_channel = 'TVD'` (= `canal_tvd`).

## Aba `Participantes` (PMP | Nome)

| PMP | Nome |
|---|---|
| EZB | Enzo |
| FAL | Fernando |
| JKC | Jackson |

Mapa PMP -> Nome para exibir o ranking. Opcional (sem nome, mostra o PMP).

## Aba `Acessos` (Email | Nivel) — controle de acesso (PR3)

| Email | Nivel |
|---|---|
| fulano@grupo-primo.com | admin |
| ciclano@grupo-primo.com | viewer |

Allowlist de e-mails liberados. O `doGet` le `Session.getActiveUser().getEmail()` (visitante do
mesmo Google Workspace) e bloqueia quem nao estiver nesta aba. E-mail vazio (fora do dominio) = negado.

## Aba `Snapshot_BQ` (gerada pelo trigger — PR2)

Preenchida automaticamente por um trigger de 30 em 30 min (`snapshotBigQuery_`). Guarda o JSON do
ultimo snapshot do BigQuery e o timestamp. A visao "Comissao" le daqui (sem rodar BQ por request).

| A | B |
|---|---|
| `geradoEm` | `2026-06-24T13:30:00-03:00` |
| `json` | `{...}` (payload do dashboard) |
