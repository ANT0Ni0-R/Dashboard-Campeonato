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
| `Code.gs` | Backend principal: acesso (papel/Nivel), Supabase real-time, agregacoes, listarVendas |
| `BigQuery.gs` | Snapshot BigQuery (trigger 30 min) + helpers de snapshot fragmentado (`gravarJsonChunked_`/`lerJsonChunked_`) |
| `Funil.gs` | Visao Funil (so gerencial): queries de ativacao/conversao/TMR + snapshot fragmentado na aba `Snapshot_Funil` |
| `Index.html` | HTML principal: menu fixo + grid 4 quadrantes + view Funil (rolavel) |
| `Stylesheet.html` | CSS (incluido via `<?= include('Stylesheet') ?>`) |
| `JavaScript.html` | JS do cliente (incluido via `<?= include('JavaScript') ?>`) |
| `AccessDenied.html` | Pagina de acesso negado |
| `Config-template.md` | Guia de configuracao das abas da planilha |
| `appsscript.json` | Manifest do Apps Script |

## Deploy

**1 Google Sheet por dashboard.** Abas necessarias: `Config`, `Participantes`, `Acessos` (colunas: Email | Nivel | PMP), `Snapshot_BQ`, `Snapshot_Funil`.

Deploy como: **"Executar como: usuario que acessa"** + acesso ao **dominio**.
Isso permite que o `Code.gs` leia o e-mail do visitante para checar a allowlist e o **papel**
(coluna `Nivel`). So `Nivel = gerencial` ve a aba **Funil**.

Para publicar mudancas: copiar os arquivos `.gs` e `.html` para o editor em `script.google.com` e atualizar o deploy (gerenciar implantacoes → nova versao). O Apps Script nao le automaticamente do GitHub.

## `Code.gs` — funcoes

**Acesso e setup:**
- `doGet(e)` — checa acesso, injeta `papel` no template, serve `Index` ou `AccessDenied`
- `lerConfig_()` / `lerParticipantes_()` — le abas Config e Participantes da planilha
- `lerAcessosMapa_()` — fonte unica da aba Acessos: `{ email: { nivel, pmp } }`
- `emailAtivo_()` / `lerAcessos_()` / `emailAutorizado_()` / `exigirAcesso_()` — controle de acesso
- `papelAtivo_()` / `exigirGerencial_()` — papel do visitante (coluna Nivel); gate da visao Funil

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

**Snapshot fragmentado:** `gravarJsonChunked_(sh, ts, json)` / `lerJsonChunked_(sh)` quebram o JSON em pedacos de ~40k chars (limite de ~50k/celula). Usados pelo Funil; o `Snapshot_BQ` continua em celula unica (cabe).

## `Funil.gs` — funcoes (visao Funil, so gerencial)

Mesmo modelo da Comissao: trigger roda como **dono**, grava o snapshot; o front so **le**.

- `getFunilData()` — entry point do front. `exigirGerencial_()` + le `Snapshot_Funil` (chunked) + parse.
- `snapshotFunil()` — trigger de 30 min: roda as queries, monta o shape normalizado, grava chunked.
- `montaSnapshotFunil_()` — orquestra as queries e os mappers no shape consumido pelo front.
- SQL builders: `sqlFunilBase_` (pipeline por origem, ROLLUP), `sqlFunilAtivados_` (fato dia x hora x pmp x origem; 1a etapa de ativacao por deal), `sqlFunilVendas_` (vendas distintas com match lead por email/telefone), `sqlFunilConversaoGeral_` (leads x compradores), `sqlFunilTmr_`/`sqlFunilTmrDia_`/`sqlFunilTmrHora_` (TMR via GROUPING SETS).
- **Filtro do grupo (`funilGrupoWhere_`)**: correspondencia **APROXIMADA** `LOWER(group_name) LIKE LOWER(funil_group_name)` — escolha consciente, nao igualdade. Os nomes de grupo no CRM sao longos e mudam entre lancamentos (`MBA IA [TDV 2]`, `Viver de Renda [TVD7]`, ...), entao casamos por trecho. Por ser **modelo escalavel** (duplica a planilha, troca so o produto), o `funil_group_name` pode vir com `%...%` (igual a `slug_like`/`bq_product_like`); se vier sem `%`, o codigo embrulha. Atencao: garanta que o trecho case com **um unico** grupo (valide no BQ), senao agrega lancamentos diferentes. **Bug ja cometido:** com `=` + valor `%...%` os `%` viravam literais e base/ativados/TMR voltavam vazios — `vendas`/`conversaoGeral` enganavam porque nao dependem desse match.
- Mappers `map*_` — convertem as linhas cruas do BQ no shape normalizado (isolam nomes de coluna).
- `criarTriggerFunil()` / `testFunil()` — instala o trigger / loga contagens de cada query (valide as colunas aqui contra as amostras antes de produzir).

**IMPORTANTE:** os nomes de coluna seguem o doc de contexto e **precisam ser validados** com `testFunil()` contra as amostras reais das tabelas. O front consome o shape normalizado, entao ajustes de coluna ficam restritos a `Funil.gs`. Etapas de "ativado" no array `FUNIL_STAGES_ATIVADO`.

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

### View Funil (`#view-funil`, so gerencial)

Pagina **rolavel** (nao o grid 4 quadrantes). `carregarFunil()` -> `getFunilData()` -> `renderFunil()`.
Os filtros **Dia / Origem / Vendedor** (no topo) e os toggles **Dia/Lancamento** (por painel) sao
**client-side** sobre o snapshot pre-computado (`state.funil`) — sem nova query. `aplicarFunil()`
re-renderiza todos os paineis. Como contagens agregam, KPIs/origem/tabela/curvas derivam do fato
fino `ativados [{dia,hora,pmp,origem,n}]`; o **TMR** (percentis nao recombinam) vem pre-agregado
por grao (`tmrTotal`/`tmrDia`/`tmrHora`, com `pmp`/`origem` = `null` para "todos").

Paineis: 6 KPIs; combos hora-a-hora e dia-a-dia (barra volume + linha % do pipeline, `funilComboChart`);
ativacao por origem (barras HTML); tabela por vendedor (mix de origens inline + vendas/conv/TMR);
TMR hora-a-hora (mediana + faixa p25-p75); bolha TMR x conversao. Reusa `themeColors`, `SELLER_COLORS`,
`cumulativo`, `diaLabel`; formatadores `formatInt`/`pct`/`pct0`/`pct2`/`formatMin`.

## `Stylesheet.html` + `Index.html`

Tema dark/light toggleavel via botao no menu. Menu fixo: titulo, status (dot), seletor de datas, 3 botoes (Supabase/BigQuery/Listar Vendas), tema.

## Fotos dos vendedores

Carregadas via URL raw do GitHub apontando para `../assets/fotos/`. FOTOS_BASE no `Code.gs`:
```js
FOTOS_BASE: 'https://raw.githubusercontent.com/ANT0Ni0-R/Dashboard-Campeonato/main/assets/fotos/'
```
(O `competicoes/fotos/` que estava antes foi consolidado em `assets/fotos/` na reorganizacao do repo.)

**Convencao de nome OBRIGATORIA: `<PMP>.jpg` minusculo.** O codigo monta a URL sempre como
`cfg.fotosBase + code + '.jpg'` (em `BigQuery.gs` e `Code.gs`) e a URL raw do GitHub e
**case-sensitive no caminho** — `FAL.JPG` e `JKC.jpeg` dao 404 contra `FAL.jpg`/`JKC.jpg`.
Ao adicionar foto nova, salve como `<PMP>.jpg` minusculo (sem `.JPG`/`.jpeg`).

Logica de fallback no frontend: `<img onload="this.className='loaded'">` + CSS `.avatar img.loaded + .initials { display: none; }` — iniciais visiveis enquanto carrega, somem quando a foto aparece.

## Pontos de atencao

- `snapshotBigQuery` roda como **dono do script** (trigger), nao como o visitante. Isso permite acesso ao BQ sem expor credenciais.
- Alias de PMP: `JCK` → `JKC` por padrao em `canonCode_`. Mude `Config-template.md` se precisar de outros aliases.
- A aba `Acessos` tem coluna `PMP` que mapeia o e-mail do usuario ao seu PMP — usada em `listarVendas` para separar "minhas vendas".
- Projeto BigQuery com **hifens**: `grupo-primo-prd`. Sem hifens causa `Cannot parse as CloudRegion`.
