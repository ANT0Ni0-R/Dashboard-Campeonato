# Copa — Dashboard 1 (Bracket)

> Contexto especifico da pasta `copa/`. Leia `../CLAUDE.md` para principios gerais,
> git, times e visao geral do repositorio.
>
> **Erros:** registre/consulte em `ERROS.md` (este subprojeto) e `../ERROS.md` (global).

---

## Arquitetura

Pagina estatica de bracket com polling em tempo real do Supabase. Nao ha servidor
proprio — servido abrindo `index.html` localmente (GitHub Pages foi desativado).

**Arquivos:**
| Arquivo | Papel |
|---|---|
| `index.html` | Pagina principal; carrega `styles.css`, `config.js`, `app.js` |
| `config.js` | Fonte unica de configuracao (ver secao abaixo) |
| `app.js` | Logica toda (~1370 linhas, vanilla JS, ver mapa abaixo) |
| `styles.css` | Visual |
| `ranking.html` | Ranking estatico que consome `bq_data.json` gerado pelo `bq_fetch.py` |
| `bq_fetch.py` | Gera `bq_data.json` consultando BigQuery via ADC do gcloud |
| `db_transactions_events_rows.json` | Dados de exemplo para fallback offline |
| `teste/` | Build isolada para validar conexao Supabase + auto-refresh |

**Assets compartilhados** estao em `../assets/` (fotos, flags, fotos_bandeiras).
`config.js` constroi URLs absolutas via `ASSETS_BASE + '/assets/fotos/...'`.

## Mapa de `app.js`

- **Ciclo/polling:** `startPolling`, `updateDashboard`, `forcarAtualizacao`, `updateSyncBar`, `updateSyncCountdown`
- **Tempo/fase:** `getNow`, `determineActivePhase`, `phaseForMs`, `parseDate`, `isCopaDay`/`isCopaDayMs`, `getCongelamento`, `getApuracao`, `updateTimer`, `formatDuration`, `translatePhaseName`
- **Dados:** `fetchTransactions` (REST Supabase, fallback JSON), `calcularGMV`, `calcularResultados` (agrega por PMP, monta grupos/mata-mata/campeao)
- **Render:** `renderDashboard` (dispatcher por fase), `createGruposContainer`, `renderBracket`, `buildPhaseSection`, `buildConfrontosFor`, `buildCampeaoRow`, `createCloserCard`, `createConfrontoBox`, `renderCopaDay`, `buildPodium`, `buildCopaList`, `renderDailyClosing`, `buildBigPlayerCard`, `renderSemis`, `buildSemiBlock`, `buildFinalProjection`, `renderFinal`, `buildFinalHalf`
- **Layout:** `fitBracket` (scale do bracket 1500px fixo), `initDaySelector`, `buildCompetitionDays`
- **UI util:** `formatCurrency`, `showLoading`, `showStatusDot`, `toggleApuracaoBanner`

## Mapa de `config.js`

Global `COMPETICAO`. Chaves principais:
- `fase_ativa_override`: `null` = usa relogio; `"grupos"|"quartas"|"brasil"|"semis"|"final"` para forcar
- `produto`: `slug_like`, `regua`, `excluir_ids`, `ajustar_precos`
- `supabase`: `url`, `anon_key`, `tabela`, `poll_segundos`
- `congelamento`: toggle (desativado em producao)
- `vendedores`: 11 PMPs com nome, selecao, foto (`assets/fotos/...`), bandeira (`assets/flags/...`)
- `fases`: grupos/quartas/brasil/semis/final com janelas em America/Sao_Paulo

Constantes globais definidas aqui (acessiveis em `app.js`):
- `ASSETS_BASE`: URL base raw.githubusercontent.com ate `main/`
- `DEFAULT_FLAG`: URL absoluta da bandeira fallback (brasil.svg)

A normalizacao no final do arquivo converte caminhos relativos em `vendedores` para URLs absolutas via `ASSETS_BASE`.

## Regras de negocio

- **PMP:** codigo de 3 letras extraido do campo `pmp` da transacao. So valido se `LENGTH = 3`.
- **GMV = price** (produto sem recorrencia, mult=1).
- **Fase derivada do relogio** (America/Sao_Paulo) quando `fase_ativa_override = null`.
- **Simulador:** botoes no rodape para forcar fases sem esperar as datas reais.
- **Campeao:** linha so aparece quando `res.campeao` e truthy (apos a final).
- **Fallback JSON:** se Supabase nao responder, carrega `db_transactions_events_rows.json`. Datas deslocadas +154 dias para bater com a semana da competicao.

## Fase "brasil"

Tipo `tela-a-parte` — renderiza `renderBrasilLeaderboard()` em vez do bracket. Tela separada de ranking para o dia do Brasil (18/jun).

## Assets

Estrutura depois da reorganizacao:
```
../assets/
  fotos/   — CCL.jpeg, HUM.jpg, etc. (extensoes mistas: .jpeg, .jpg, .JPG)
  flags/   — bandeiras em svg/png/webp
  fotos_bandeiras/
```

URLs raw no GitHub: `https://raw.githubusercontent.com/ant0ni0-r/dashboard-campeonato/main/assets/fotos/HUM.jpg`

Fallback de avatar: DiceBear (`onerror` nas `<img>`).

## teste/

Valida conexao Supabase + auto-refresh sem mexer na producao.
Reusa `../styles.css` e `../config.js` (caminhos relativos funcionam pois `teste/` esta dentro de `copa/`).
