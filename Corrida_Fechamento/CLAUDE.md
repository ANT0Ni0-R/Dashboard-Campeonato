# Corrida de Fechamento — Dashboard 4

> Contexto especifico da pasta `Corrida_Fechamento/`. Leia `../CLAUDE.md` para principios gerais,
> git, vendedores e visao geral do repositorio.
>
> **Erros:** registre/consulte em `ERROS.md` (este subprojeto) e `../ERROS.md` (global).

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
- **Atribuicao TRIPLA** (decisao de produto):
  - **Realizado no mes + GMV hoje (card) + Ritmo** = criterio **TVD** do **mes** (`rowsTvdMes`,
    `acumulaGeralTvd_`, so `pmp` contem "TVD"), **com exclusao de slug** (`excluir_slugs`). O Realizado
    no mes = TVD do Supabase **+** `gmv_requisicoes` (aporte manual da Config; nao cai no Supabase, so
    entra no acumulado/falta/ritmo do mes, nunca em hoje/hora-a-hora/corrida).
  - **Corrida por pessoa** = soma por **PMP** da aba `Participantes` (`acumulaPorPmp_`, qualquer canal,
    so hoje), de `rowsHoje` -> **qualquer slug** (sem `excluir_slugs`).
  - **Hora-a-hora** = TVD de **hoje** (`acumulaHoraTvd_`), tambem de `rowsHoje` -> **qualquer slug**.
    Logo o "Total hoje"/pico do grafico pode **superar** o card "GMV de hoje" (slug-excluido) — intencional.
- **GMV Ajustado por produto** (`gmvAjustado_`): 1a regra de `Parcelamento` cujo slug casa (contem,
  case-insensitive) **e** price na faixa -> `price*meses*fator`; sem match -> price.
- **Escopo / filtros:** `fetchPaginado_(cfg, filtroExtra, ini, fim, aplicaExclusaoSlug)` busca os
  `order_success` na janela (paginado) e, no Apps Script, **sempre** remove e-mails de teste
  (`semEmailTeste_`) e PMPs de `excluir_pmps` (`semPmpExcluido_`). A exclusao de **slug**
  (`semSlugExcluido_`) e **opcional** (`aplicaExclusaoSlug`): `true` so para `rowsTvdMes` (os KPIs do
  time). `rowsHoje` (corrida + hora-a-hora) passa `false` -> qualquer slug. A exclusao de PMP resolve o
  codigo igual a corrida (ultimo segmento do pmp + alias) e zera o vendedor em TODOS os indicadores.
- **Ritmo R$/h:** `realHora = gmvHoje / horasDecorridas`, `necHora = faltaMes / horasRestantes`,
  janela de expediente `expediente_inicio`..`expediente_fim` em BRT (`horaAgoraSP_`).
- **Cores dos vendedores:** paleta `SELLER_COLORS` atribuida por ordem de ranking (nao por PMP fixo).
- `diag()` no editor loga config + shape de `getDashboard()`.

## `Index.html` — front

- **Sem framework.** O layout 1920x1080 e ajustado via `zoom` (`fit()`); estilos inline preservados
  do design original.
- `f1Car(color)` = porte do componente `F1Car.dc.html` (HTML/CSS) com a cor injetada. Usado na
  barra de progresso da corrida (carro counter-scaled na ponta) e no meta-fill do topo.
- **Layout (ROW B) = 2 colunas:** corrida (esquerda, `flex:2.4`) + GMV geral hora-a-hora (direita,
  `flex:1.15`), ambos altura cheia. (O "Podio do dia" foi removido; o hora-a-hora ocupava a largura toda
  embaixo e agora e a coluna direita, com barras verticais ate o fim.)
- **Barra da corrida (`renderRace`) = proporcional ao LIDER:** `frac = gmvHoje / maxGmv` (maior GMV do
  dia). O 1o colocado chega na linha de chegada; os demais relativos a ele. Ranking por **GMV de hoje**
  (`montaSellers_` ordena por `gmvHoje` desc, desempate por nome). Cada linha mostra **so o GMV a direita**
  (sem badge de % e sem rotulo no ponteiro). Linhas compactas (avatar 38, `space-between`) p/ caber os 11.
- Validacao visual via **screenshot headless (Chromium)** com `google.script.run` stubado antes do commit.
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
