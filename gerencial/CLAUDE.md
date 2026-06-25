# Gerencial — Dashboard 3

> Contexto especifico da pasta `gerencial/`. Leia `../CLAUDE.md` para principios gerais,
> git, times e visao geral do repositorio.

---

## O que e

Apps Script Web App com visao gerencial em 4 quadrantes. Duas fontes de dados espelhadas:
- **Supabase real-time** — dados ao vivo (lidos a cada visita/refresh)
- **BigQuery por snapshot** — comissao consolidada (snapshot a cada 30 min via trigger)

Menu fixo no topo, tema dark/light, controle de acesso por aba `Acessos`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `Code.gs` | Backend principal: acesso, Supabase real-time, agregacoes, listarVendas |
| `BigQuery.gs` | Snapshot BigQuery (trigger 30 min), leitura da aba `Snapshot_BQ` |
| `Index.html` | HTML principal: menu fixo + grid 4 quadrantes |
| `Stylesheet.html` | CSS (incluido via `<?= include('Stylesheet') ?>`) |
| `JavaScript.html` | JS do cliente (incluido via `<?= include('JavaScript') ?>`) |
| `AccessDenied.html` | Pagina de acesso negado |
| `Config-template.md` | Guia de configuracao das abas da planilha |
| `appsscript.json` | Manifest do Apps Script |

## Deploy

**1 Google Sheet por dashboard.** Abas necessarias: `Config`, `Participantes`, `Acessos` (colunas: Email | Nivel | PMP), `Snapshot_BQ`.

Deploy como: **"Executar como: usuario que acessa"** + acesso ao **dominio**.
Isso permite que o `Code.gs` leia o e-mail do visitante para checar a allowlist.

Para publicar mudancas: copiar os arquivos `.gs` e `.html` para o editor em `script.google.com` e atualizar o deploy (gerenciar implantacoes → nova versao). O Apps Script nao le automaticamente do GitHub.

## `Code.gs` — funcoes

**Acesso e setup:**
- `doGet(e)` — checa acesso, serve `Index` ou `AccessDenied`
- `lerConfig_()` / `lerParticipantes_()` — le abas Config e Participantes da planilha
- `emailAtivo_()` / `lerAcessos_()` / `emailAutorizado_()` / `exigirAcesso_()` — controle de acesso

**Supabase real-time:**
- `fetchTransactions_(config)` — faz REST call ao Supabase com JWT server-side
- `aggregateRows_(rows)` — agrega por PMP; TVD = campo `pmp` contem "TVD"
- `montaPorHora_(rows)` — eixo fixo 0h-23h para o Q2 (grafico de linha)
- `montaPorDia_(rows, sellers)` — serie por dia com `sellers` para o Q4 (barras empilhadas TVD)
- `getDashboardSupabase(params)` — entry point chamado pelo JS do cliente

**Listar vendas:**
- `listarVendas(params)` — filtra pelo produto configurado, separa "minhas vendas" x "gerais" via `meuPmp_()`
- `parseAliasPmp_(pmp)` / `canonCode_(code)` — normalizacao de PMP (ex: `JCK` → `JKC` por padrao)

**Auth JWT:**
- `resolveAuthHeaders_()` / `mintJwt_()` / `restGet_()` / `parseRows_()` — autenticacao Supabase server-side

**Diagnostico:** `diag()` — retorna status da conexao.

## `BigQuery.gs` — funcoes

- `snapshotBigQuery()` — trigger de 30 min (roda como dono do script, nao como visitante). Executa queries e grava JSON na aba `Snapshot_BQ`.
- `getDashboardBigQuery(params)` — so le a aba `Snapshot_BQ` (visitantes nao tocam o BQ).
- `sqlKpisBQ_()` / `sqlRankingBQ_()` / `sqlPorDiaBQ_()` / `sqlPorDiaSellerBQ_()` / `sqlPorHoraBQ_()` — queries BigQuery
- `bqQuery_(sql)` — executa via servico avancado `BigQuery`
- `canonSqlExpr_(alias)` — alias de PMP em SQL
- `criarTriggerSnapshot()` / `testSnapshot()` — setup e teste do trigger

**Configuracao BigQuery:** projeto `grupo-primo-prd` (com hifens — obrigatorio), dataset `mart_sales_team`, tabela `mrt_sales_team__transactions_with_sales_request`. TVD = `sales_channel = 'TVD'`.

## `JavaScript.html` — frontend (4 quadrantes)

Supabase e BigQuery devolvem o **mesmo shape**; ha um unico path de render.

**Q1 — KPIs:** 4 metricas (Total=gold, TVD=green, Share=blue, Ticket=violet). HOJE em destaque vs GERAL (opacidade). `fitKpis()` encolhe a fonte ate caber sem `...`.

**Q2 — Linha hora a hora:** eixo 0h-23h fixo, com folga extra no topo (`grace`/`padTop`). Chart.js + datalabels.

**Q3 — Ranking:** podio dos 3 primeiros (`podiumHTML`, ordem 2-1-3) + lista dos demais (`listaHTML`, scroll proprio). Mesmo padrao de `buildPodium`/`buildCopaList` do `copa/app.js`.

**Q4 — Dois graficos alinhados:**
- `chart-dia-share` (em cima): so linha de Share (%)
- `chart-dia` (embaixo): barras TVD empilhadas por vendedor
- Eixos Y de largura fixa (`afterFit s.width=56`) para alinhar as categorias dos dois graficos.
- O grafico de barras inclui um **dataset-overlay de linha transparente** (`label: 'Total'`,
  `hideInLegend: true`) so para exibir o **total da pilha** no topo de cada coluna. A legenda
  filtra esse dataset via `legend.labels.filter` em `baseOpts`.

**Q3 — Ranking:** podio dos 3 primeiros em destaque (`podiumHTML`) + lista 4o+ com scroll
estilizado (`listaHTML`/`.copa-list`). Com **menos de 4 vendedores**, `renderRanking` marca
`#rank-list` com a classe `podium-only` e o podio ocupa todo o quadrante.

Regra: **todo grafico exibe data labels** (`chartjs-plugin-datalabels`). Quando os rotulos se sobrepoem, usar `display: 'auto'`. Graficos empilhados tambem exibem o rotulo do total no topo.

## `Stylesheet.html` + `Index.html`

Tema dark/light toggleavel via botao no menu. Menu fixo: titulo, status (dot), seletor de datas, 3 botoes (Supabase/BigQuery/Listar Vendas), tema.

## Fotos dos vendedores

Carregadas via URL raw do GitHub apontando para `../assets/fotos/`. FOTOS_BASE no `Code.gs`:
```js
FOTOS_BASE: 'https://raw.githubusercontent.com/ANT0Ni0-R/Dashboard-Campeonato/main/assets/fotos/'
```
(O `competicoes/fotos/` que estava antes foi consolidado em `assets/fotos/` na reorganizacao do repo.)

Logica de fallback no frontend: `<img onload="this.className='loaded'">` + CSS `.avatar img.loaded + .initials { display: none; }` — iniciais visiveis enquanto carrega, somem quando a foto aparece.

## Pontos de atencao

- `snapshotBigQuery` roda como **dono do script** (trigger), nao como o visitante. Isso permite acesso ao BQ sem expor credenciais.
- Alias de PMP: `JCK` → `JKC` por padrao em `canonCode_`. Mude `Config-template.md` se precisar de outros aliases.
- A aba `Acessos` tem coluna `PMP` que mapeia o e-mail do usuario ao seu PMP — usada em `listarVendas` para separar "minhas vendas".
- Projeto BigQuery com **hifens**: `grupo-primo-prd`. Sem hifens causa `Cannot parse as CloudRegion`.
