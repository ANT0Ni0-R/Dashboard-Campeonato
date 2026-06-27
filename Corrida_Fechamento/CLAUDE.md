# Corrida de Fechamento — Dashboard 4

> Contexto especifico da pasta `Corrida_Fechamento/`. Leia `../CLAUDE.md` para principios gerais,
> git, vendedores e visao geral do repositorio.

---

## O que e

Apps Script Web App (painel de TV) que estimula um clima de corrida no **fechamento das metas do
mes** (foco no ultimo dia). Fonte unica: **Supabase** (`db_transactions_events`), consultada no
servidor com JWT HS256 assinado/renovado sozinho. Parametros na planilha vinculada.

Visual reescrito a partir de um front gerado pelo Claude Design (formato proprietario "dc" no
`.zip`) — convertido para **HTML/CSS/JS puro** (o runtime `dc`/`support.js` nao roda no Apps Script).

## Arquivos

| Arquivo | Papel |
|---|---|
| `Code.gs` | Backend: le planilha, consulta Supabase, monta o dashboard (`getDashboard()`) |
| `Index.html` | Front: HTML/CSS/JS puro; polling via `google.script.run` |
| `appsscript.json` | Manifest |
| `Config-template.md` | Guia das abas (Config, Participantes, Parcelamento) |
| `README.md` | Setup/deploy |
| `Dashboard de fechamento de vendas.zip` + PNGs | Referencia visual original (nao usados em runtime) |

## Arquitetura (reaproveitamento)

Base = `competicoes/Code.gs` (1 planilha + Supabase JWT server-side). Funcoes de auth/REST
identicas: `lerConfig_`, `resolveAuthHeaders_`, `mintJwt_`, `restGet_`, `parseRows_`. Helpers de
tempo/PMP/TVD vindos do `gerencial/Code.gs`: `hojeSP_`/`diaSP_`/`horaSP_`, `isTvd_`, `sellerCode_`,
`canonCode_`, `parseAliasPmp_`, `semEmailTeste_`. GMV Ajustado adaptado do `gmvProjetado_` do
gerencial (aqui casa por **slug + faixa**, em `gmvAjustado_`).

## `Code.gs` — pontos-chave

- **`getDashboard()`** -> `montaDashboard_(rows, cfg, participantes, regras)` e a unica entrada do front.
- **Atribuicao DUPLA** (decisao de produto):
  - **Geral do time** (Realizado no mes, GMV hoje, hora-a-hora, ritmo) = criterio **TVD**
    (`acumulaGeralTvd_`, so `pmp` contem "TVD").
  - **Corrida/podio por pessoa** = soma por **PMP** da aba `Participantes` (`acumulaPorPmp_`,
    qualquer canal, so o dia de hoje).
- **GMV Ajustado por produto** (`gmvAjustado_`): 1a regra de `Parcelamento` cujo slug casa (contem,
  case-insensitive) **e** price na faixa -> `price*meses*fator`; sem match -> price.
- **Escopo:** `fetchTransactions_` busca todos os `order_success` na janela e **exclui** os slugs de
  `excluir_slugs` via filtros `slug=not.ilike.*termo*` repetidos (AND no PostgREST). `limit=100000`.
- **Badge % por vendedor** = `gmvHoje / falta` (coluna `Falta` da aba Participantes; input manual).
- **Ritmo R$/h:** `realHora = gmvHoje / horasDecorridas`, `necHora = faltaMes / horasRestantes`,
  janela de expediente `expediente_inicio`..`expediente_fim` em BRT (`horaAgoraSP_`).
- **Cores dos vendedores:** paleta `SELLER_COLORS` atribuida por ordem de ranking (nao por PMP fixo).
- `diag()` no editor loga config + shape de `getDashboard()`.

## `Index.html` — front

- **Sem framework.** O layout 1920x1080 e ajustado via `zoom` (`fit()`); estilos inline preservados
  do design original.
- `f1Car(color)` = porte do componente `F1Car.dc.html` (HTML/CSS) com a cor injetada. Usado na
  barra de progresso da corrida (carro counter-scaled na ponta) e no podio (carro rotacionado).
- **Fotos:** avatares da corrida usam foto + fallback de iniciais (`<img onload="this.className='loaded'">`
  + CSS `.avatar img.loaded + .initials{display:none}`), padrao dos outros dashboards.
- **Countdown** client-side ate `config.fim` (no ultimo dia = fim de hoje); fallback = 23:59:59.
- **Velocimetro** (`gaugeGeo`) = `gmvHoje / meta.metaDia`.
- **Hora-a-hora:** mostra a janela `08h..expediente_fim`; pico destacado em verde; total do dia.
- **Polling:** `getDashboard()` a cada `poll_segundos`; numeros-heroi com count-up (`animNum`),
  barras/gauge animam por transicao CSS.

## Pontos de atencao

1. **Fotos `<PMP>.jpg`** (PMP maiusculo, extensao `.jpg` minuscula) em `assets/fotos/`; URL raw
   case-sensitive (`cfg.fotosBase + code + '.jpg'`, igual a competicoes/gerencial) — ver `../CLAUDE.md`.
2. **Apps Script nao le do GitHub:** colar `Code.gs`/`Index.html` no editor e republicar o deploy.
3. **Manutencao mensal:** atualizar `meta_mes`/`inicio`/`fim` na Config e `Falta` por vendedor.
4. **Janela do mes e configurada** (nao automatica) — decisao do dono.
5. **TVD vs PMP:** se um vendedor da corrida nao usa link com "TVD" no pmp, ele aparece na corrida
   (por PMP) mas nao soma no geral do time (TVD). Intencional.
