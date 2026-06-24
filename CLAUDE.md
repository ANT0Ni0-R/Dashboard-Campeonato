# Dashboard Campeonato — Contexto para Claude

> Este arquivo é o **mapa do projeto**. Leia-o primeiro e use-o para navegar:
> ele descreve arquitetura, arquivos, funções e dependências para que você
> **não precise ler todo o código antes de programar**. Comece pelo
> "Mapa de código" abaixo e só abra os arquivos relevantes à tarefa.

---

## Princípios de trabalho — pergunte ANTES de codar

Antes de escrever qualquer linha de código, pare e responda explicitamente a
estas 5 perguntas. Elas evitam retrabalho, duplicação e complexidade
desnecessária — os erros mais caros desta base vieram de pular essas etapas.

1. **Será que tem uma forma mais simples de fazer?**
   Prefira a solução mais direta. Esta base é vanilla JS + Apps Script, sem
   build, sem framework. Não introduza dependências, abstrações ou camadas
   novas se uma função pequena resolve. Menos código = menos bug.

2. **Será que alguém já fez isso antes?**
   Verifique o histórico (`git log`), as seções "Erros cometidos" e "Pontos de
   atenção" deste arquivo, e os READMEs (`apps-script/`, `competicoes/`,
   `teste/`). Muito problema aqui já foi resolvido — não repita o erro nem
   reinvente a solução.

3. **Tem alguma documentação para isso?**
   Antes de inferir comportamento, consulte: este CLAUDE.md, os READMEs das
   subpastas, e a doc oficial da dependência (Supabase REST, Apps Script,
   BigQuery, GitHub Pages). Não chute APIs externas — confirme.

4. **Será que esse código já existe no projeto?**
   Procure (`grep`) antes de criar. Há muita lógica reutilizável: cálculo de
   GMV, parsing de PMP, formatação de moeda, fetch do Supabase, render de
   pódio. Veja o "Mapa de código" abaixo e reutilize em vez de duplicar.

5. **Será que eu deveria separar isso em mais de um arquivo?**
   `app.js` já tem ~1370 linhas. Avalie se a mudança merece um módulo/arquivo
   próprio em vez de inchar um arquivo existente. Equilibre: separar demais em
   projeto sem bundler também atrapalha (cada arquivo vira um `<script>`).

---

## Mapa de código (leia isto em vez do projeto inteiro)

### Estrutura de pastas

| Caminho | Papel |
|---|---|
| `index.html` + `app.js` + `config.js` + `styles.css` | **Dashboard 1 — Copa (bracket)**. Produção via GitHub Pages. |
| `apps-script/Code.gs` + `apps-script/Index.html` | **Dashboard 2 — Ranking Geral** (BigQuery). Colado manualmente no Apps Script. |
| `competicoes/` | Variante reutilizável: pódio de GMV por competição (1 planilha = 1 competição). Backend lê Supabase via JWT server-side. Tem README próprio. |
| `teste/` | Build isolada para validar conexão Supabase + auto-refresh, sem mexer na produção. Usa `../styles.css` e `../config.js`. |
| `ranking.html` + `bq_fetch.py` | Ranking estático que consome `bq_data.json` gerado por `bq_fetch.py` (consulta BigQuery via ADC do gcloud). |
| `db_transactions_events_rows.json` | Dados de exemplo (fallback offline do Dashboard 1). |
| `fotos/`, `flags/`, `fotos_bandeiras/` | Assets servidos via raw.githubusercontent (repo precisa ser público). |

### `app.js` — onde está cada coisa (~1370 linhas)

Vanilla JS, sem módulos. Depende de `COMPETICAO` (global de `config.js`) e dos
IDs do DOM em `index.html`. Funções principais:

- **Ciclo/polling:** `startPolling`, `updateDashboard`, `forcarAtualizacao`, `updateSyncBar`, `updateSyncCountdown`
- **Tempo/fase:** `getNow`, `determineActivePhase`, `phaseForMs`, `parseDate`, `isCopaDay`/`isCopaDayMs`, `getCongelamento`, `getApuracao`, `updateTimer`, `formatDuration`, `translatePhaseName`
- **Dados:** `fetchTransactions` (REST Supabase, fallback JSON), `calcularGMV` (GMV = price + régua/ajustes de `config.js`), `calcularResultados` (núcleo: agrega por PMP, monta grupos/mata-mata/campeão)
- **Render:** `renderDashboard` (dispatcher por fase), `createGruposContainer`, `renderBracket`, `buildPhaseSection`, `buildConfrontosFor`, `buildCampeaoRow`, `createCloserCard`, `createConfrontoBox`, `renderCopaDay`, `buildPodium`, `buildCopaList`, `renderDailyClosing`, `buildBigPlayerCard`, `renderSemis`, `buildSemiBlock`, `buildFinalProjection`, `renderFinal`, `buildFinalHalf`
- **Layout:** `fitBracket` (scale do bracket 1500px fixo), `initDaySelector`, `buildCompetitionDays`
- **UI util:** `formatCurrency`, `showLoading`, `showStatusDot`, `toggleApuracaoBanner`

### `config.js` — fonte única de configuração do Dashboard 1

Exporta o global `COMPETICAO`. Chaves: `fase_ativa_override`, `produto`
(`slug_like`, `regua`, `excluir_ids`, `ajustar_precos`), `supabase`
(`url`, `anon_key`, `tabela`, `poll_segundos`), `congelamento`, `vendedores`
(11 PMPs), `fases` (grupos/quartas/semis/final com janelas em America/Sao_Paulo
e `dia_copa`). Mexa em config aqui, **não** espalhe constantes pelo `app.js`.

### `apps-script/Code.gs` — backend do Dashboard 2 (~397 linhas)

- `doGet`/`include`: serve `Index.html`
- `lerConfig_`, `resolveAuthHeaders_`, `getAccessToken_`, `mintJwt_`, `setSecrets_`: auth Supabase (secret key em Script Property — ver seção CAPTCHA)
- `getTransactions`, `restGet_`, `parseRows_`: consulta de dados
- `diagSupabase`: diagnóstico

### Dependências (todas externas, nada de `npm install`)

- **Front Copa:** zero libs. Fontes Google Fonts via `@import`; avatares fallback DiceBear. Supabase via `fetch` REST.
- **Apps Script:** serviço avançado `BigQuery` (habilitar no editor) + `UrlFetchApp` para Supabase.
- **`bq_fetch.py`:** `google-cloud-bigquery` (auth via ADC do gcloud).
- **CI:** `.github/workflows/pages.yml` publica o `_site/` na `main`.

### Fluxo de dados (Dashboard 1)

`config.js` (COMPETICAO) → `fetchTransactions()` (Supabase REST, fallback
`db_transactions_events_rows.json`) → `calcularResultados()` (agrega por PMP,
GMV via `calcularGMV`) → `renderDashboard()` (dispatch por fase) → DOM. Loop a
cada `poll_segundos` (60s) via `startPolling`.

---

## Visão Geral

Dois dashboards separados para um evento de vendas do Grupo Primo (lançamento "Legado", semana de 16–21/jun/2026):

| Dashboard | Arquivo | Fonte de dados | Hospedagem |
|---|---|---|---|
| Copa do Mundo: O Legado (bracket) | `index.html` + `app.js` + `styles.css` + `config.js` | Supabase (real-time polling 60s) | GitHub Pages |
| Ranking Geral do Lançamento | `apps-script/Index.html` + `apps-script/Code.gs` | BigQuery (polling 30 min) | Apps Script Web App |

URL GitHub Pages (Copa): `https://ant0ni0-r.github.io/Dashboard-Campeonato/`

---

## Dashboard 1 — Copa do Mundo: O Legado (bracket)

### Arquitetura

- **Sem servidor local:** servido via GitHub Pages. Qualquer push na `main` dispara o workflow `.github/workflows/pages.yml` que republica em ~30s.
- **Polling Supabase:** `fetchTransactions()` em `app.js` chama o endpoint REST do Supabase a cada 60s. A anon key é pública por design (protegida por RLS) — pode estar no código sem problema.
- **Fallback local:** se Supabase não responder, carrega `db_transactions_events_rows.json` com dados de exemplo. As datas são deslocadas +154 dias para bater com a semana da competição (jan → jun).
- **Layout canvas-fixed + scale:** o bracket tem largura fixa de 1500px. `fitBracket()` em `app.js` aplica `transform: scale()` no `.bracket-scaler` para caber em qualquer resolução sem clipar. `window.addEventListener("resize", fitBracket)` mantém responsivo.

### Configuração (`config.js`)

```js
const COMPETICAO = {
  fase_ativa_override: null,  // null = usa relógio; "grupos"|"quartas"|"brasil"|"semis"|"final" para forçar
  produto: {
    slug_like: "%FORMAÇÃO DE PLANEJADOR FINANCEIRO%",  // muda para "%LEGADO%" na semana do lançamento
    regua: [{ ate: null, mult: 1 }]  // GMV = price (produto sem recorrência)
  },
  supabase: {
    url: "https://ipalripfknzhrzddhvdx.supabase.co",
    anon_key: "eyJ...",
    tabela: "db_transactions_events",
    poll_segundos: 60
  },
  vendedores: { /* 11 vendedores com PMP de 3 letras */ },
  fases: { grupos, quartas, brasil, semis, final }  // datas em America/Sao_Paulo
}
```

### Regras de negócio

- **PMP:** código de 3 letras extraído do campo `pmp` da transação (ex: `LAN-VIN-...-HUM` → `HUM`). Só válido se `LENGTH = 3`.
- **GMV = price** (sem multiplicador — produto não tem recorrência).
- **Fase derivada do relógio:** se `fase_ativa_override = null`, a fase ativa é determinada pela data/hora atual (America/Sao_Paulo) comparando com as janelas em `config.js.fases`.
- **Simulador:** painel fixo no rodapé com botões para forçar fases sem esperar as datas reais. Útil para testes e apresentação.
- **Sem campeão placeholder:** a linha de campeão só aparece quando `res.campeao` é truthy (após a final ser calculada).

### Fase "brasil"

Tipo `tela-a-parte` — renderiza `renderBrasilLeaderboard()` em vez do bracket. É uma tela separada de ranking para o dia do Brasil.

### Fotos e bandeiras

- Fotos: `fotos/CCL.jpeg`, `fotos/HMD.jpg`, etc. (extensões mistas: .jpeg, .jpg, .JPG)
- Bandeiras: `flags/brasil.svg`
- O `onerror` nos `<img>` faz fallback para avatar gerado pelo DiceBear

---

## Dashboard 2 — Ranking Geral do Lançamento (Apps Script)

### Arquitetura

- **Apps Script Web App:** deploy em `Executar como: Eu`, acesso conforme necessidade.
- **BigQuery:** `Code.gs` usa o serviço avançado `BigQuery` (habilitado manualmente no editor do Apps Script). O job roda no projeto `grupo-primo-prd` (com hífens — crítico).
- **Sem credenciais no repo:** a autenticação é feita pela conta Google do dono do Apps Script. Nada de service account ou ADC commitado.

### Configuração (`Code.gs`)

```js
var PROJECT_ID = 'grupo-primo-prd';  // HÍFENS OBRIGATÓRIOS
var TABELA = '`grupo-primo-prd.mart_sales_team.mrt_sales_team__transactions_with_sales_request`';
var PRODUTO_LIKE = 'legado';  // '' para modo teste (sem filtro de produto)
var PMPS_CAMPEONATO = ['CCL','FAL','MDR','HDZ','HLM','THS','EZB','HMD','JPP','HUM','JKC'];
```

### Query

```sql
SELECT seller_pmp, MAX(seller_name) AS seller_name, SUM(gmv) AS gmv_total, COUNT(*) AS qtd
FROM `grupo-primo-prd.mart_sales_team.mrt_sales_team__transactions_with_sales_request`
WHERE is_refunded = false
  AND seller_pmp IS NOT NULL
  AND LENGTH(seller_pmp) = 3
  AND seller_pmp IN ('CCL','FAL',...)
  AND UPPER(product_name) LIKE UPPER('%legado%')
GROUP BY seller_pmp
ORDER BY gmv_total DESC
```

### Fotos no Apps Script

Apps Script não pode servir arquivos locais. As fotos vêm via URL raw do GitHub:
```
https://raw.githubusercontent.com/ant0ni0-r/dashboard-campeonato/main/fotos/HUM.jpg
```
O repo precisa estar **público** para essas URLs funcionarem sem autenticação.
Lógica no front: `<img onload="this.className='loaded'">` + CSS `.avatar img.loaded + .initials { display: none; }` — imagem cobre as iniciais quando carrega, iniciais ficam visíveis enquanto carrega/falha.

### Como atualizar o Apps Script em produção

O Apps Script **não lê os arquivos do GitHub automaticamente**. Para publicar mudanças:
1. Copiar o conteúdo de `apps-script/Code.gs` e `apps-script/Index.html`
2. Colar no editor em `script.google.com`
3. Deploy → Gerenciar implantações → atualizar versão existente

---

## Infraestrutura e deploy

### GitHub Pages (Copa)

- Acionado por push na `main` via `.github/workflows/pages.yml`
- O workflow copia apenas os arquivos necessários para `_site/` (não publica `apps-script/`, `bq_fetch.py`, etc.)
- Repo precisa ser **público** (Pages gratuito não funciona em privado)
- Settings → Pages → Source = **GitHub Actions** (configurado)
- Ambiente `github-pages` só aceita deploy da `main` — não alterar isso

### Supabase

- Plano gratuito suporta carga tranquila para o caso de uso (14 usuários, polling 60s)
- Tabela: `db_transactions_events`, campo relevante: `type = 'order_success'`, `price`, `pmp`, `created_at`
- A query filtra `created_at >= 2026-06-16T00:00:00-03:00` — antes dessa data, o Supabase retorna vazio e o fallback JSON assume

#### Autenticação no Apps Script (CAPTCHA no Auth) — `apps-script/Code.gs`

- A produção real consulta o Supabase **server-side** no Apps Script (`getTransactions()` em `Code.gs`), não direto do navegador.
- O Supabase ativou **CAPTCHA** no Auth, o que quebrou o login `grant_type=password` que o `Code.gs` usava (`Falha no login Supabase (400): captcha protection`).
- **Correção:** usar a **secret key** (`sb_secret_...`) no header `apikey`. Mapeia para `service_role`, ignora RLS, não expira e não passa por CAPTCHA (não há login). É **server-only** (o Supabase recusa em navegador e **revoga** keys achadas em repo público), então fica **só em Script Property `SUPABASE_SECRET_KEY`** — nunca versionada.
- Com o sistema novo de chaves, a key vai no header **`apikey`**, não em `Authorization: Bearer`.
- Fallback no `Code.gs`: se não houver secret key, ele aceita `SUPABASE_ACCESS_TOKEN` (JWT longo, Bearer) + `SUPABASE_PUBLISHABLE_KEY` (apikey), e por último o login legado (CAPTCHA). Passo a passo em `apps-script/README.md`.

### BigQuery

- Projeto: `grupo-primo-prd` (com hífens — sem hífens causa erro "Cannot parse as CloudRegion")
- Dataset: `mart_sales_team`
- Tabela: `mrt_sales_team__transactions_with_sales_request`
- A credencial fica na conta Google do Apps Script — sem setup adicional nas TVs

---

## Vendedores (11 participantes)

| PMP | Nome | Grupo |
|---|---|---|
| CCL | Camila | A |
| FAL | Fernando | A |
| MDR | Monica | A |
| HDZ | Diniz | B |
| HLM | Harry | B |
| THS | Thayna | B |
| EZB | Enzo | C |
| HMD | Henrique | C |
| JPP | João Pedro | C |
| HUM | Hudson | D |
| JKC | Jackson | D |

Grupos A, B, C avançam 2; Grupo D avança 1. Repescagem: 1 vaga.

---

## Fases da competição

| Fase | Tipo | Data |
|---|---|---|
| grupos | grupos | 16/jun |
| quartas | mata-mata 1v1 | 17/jun |
| brasil | tela separada | 18/jun |
| semis | mata-mata 1v1 | 19/jun |
| final | mata-mata 1v1 | 20/jun |

---

## Erros cometidos nesta sessão — não repetir

### BigQuery: hífens no PROJECT_ID e na tabela

O ID do projeto é `grupo-primo-prd` (com hífens). Sem hífens (`grupoprimoprd`) causa:
- `Cannot parse as CloudRegion` — se o PROJECT_ID não tiver hífen
- `Access Denied: Table grupoprimoprd:mart_sales_team...` — se o path da tabela não tiver hífen

**Regra:** sempre usar `grupo-primo-prd` (com hífens) em ambos os lugares.

### GitHub Pages: `actions/configure-pages` não habilita Pages remotamente

O parâmetro `enablement: true` na action `configure-pages@v5` falha com `Resource not accessible by integration` — o Pages precisa ser habilitado manualmente em Settings → Pages → Source = GitHub Actions, uma única vez.

### GitHub Pages: ambiente `github-pages` rejeita deploy de branches não-default

O ambiente criado pelo GitHub Pages só aceita deploy da branch default (`main`). Rodar o workflow em outra branch resulta em falha instantânea sem nem alocar runner. Sempre apontar `on.push.branches: [main]` e fundir mudanças via PR.

### Commit messages com caracteres especiais no git

Mensagens de commit com acentos/caracteres especiais via heredoc podem causar exit code 144 dependendo do locale do shell. Usar sempre ASCII puro nas mensagens de commit.

### `rerun_workflow_run` de run antiga não funciona bem

Fazer rerun de um workflow que falhou por restrição de permissão (não por erro de código) frequentemente falha na segunda tentativa também. Preferir disparar uma nova run via `workflow_dispatch` ou um novo commit.

### Fotos no Apps Script: overlay de iniciais

CSS `position: absolute` na imagem e no span `.initials` faz ambos ficarem sobrepostos. A solução correta:
- Imagem: `position: absolute; top: 0; left: 0; width: 100%; height: 100%`
- Ao carregar: `onload="this.className='loaded'"` + CSS `.avatar img.loaded + .initials { display: none; }`
- Iniciais ficam visíveis durante o carregamento e somem quando a foto aparece

---

## Pontos de atenção para próximas sessões

1. **Trocar o produto na semana do lançamento:** mudar `slug_like` em `config.js` para `%LEGADO%` e `PRODUTO_LIKE` em `Code.gs` para `'legado'`. O `Code.gs` já está em produção com `legado`; o `config.js` ainda usa o produto de formação.
2. **Apps Script não atualiza sozinho:** mudanças nos arquivos `apps-script/` precisam ser coladas manualmente no editor do Apps Script e redeploy feito.
3. **`fase_ativa_override`:** deixar `null` para produção. Usar apenas para testes.
4. **A branch de trabalho foi fundida na `main`:** todo desenvolvimento futuro deve abrir nova branch e fundir na `main` para o Pages republicar.
5. **Repo público:** necessário para as fotos do ranking (raw.githubusercontent.com) e para o Pages gratuito funcionarem.
6. **Datas do Supabase:** a query em `app.js` filtra `created_at >= 2026-06-16`. Antes dessa data, retorna vazio e o JSON de fallback assume. Isso é intencional para testes pré-lançamento.
