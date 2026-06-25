# Dashboard Gerencial (Apps Script)

Dashboard de acompanhamento **gerencial** de uma competicao/lancamento, com tres visoes na mesma
pagina (sem trocar de URL):

- **⚡ Real-time (Supabase):** KPIs, graficos e ranking agregados ao vivo (polling configuravel).
- **💰 Comissao (BigQuery):** a mesma visao, lendo o snapshot do BigQuery gravado numa aba do
  Sheets a cada 30 min (trigger `snapshotBigQuery`).
- **🔎 Consulta de vendas:** vendas (`order_success`) do **produto do dash** nos ultimos 7 dias via
  Supabase, em duas tabelas — **Minhas vendas** (PMP do closer logado) e **Vendas Gerais do
  lancamento** (as demais) — com busca por email/telefone.
- **📊 Funil (so nivel `gerencial`):** ativacao/conversao do lancamento por snapshot do BigQuery
  (trigger `snapshotFunil`). KPIs, ativacao por origem, ativados x vendas x conversao x TMR por
  vendedor, curvas hora-a-hora e dia-a-dia, TMR e bolha TMR x conversao. Filtros Dia/Origem/Vendedor
  client-side. O botao so aparece para quem tem `Nivel = gerencial` na aba `Acessos`.

Identidade visual Grupo Primo (dark por padrao) com **modo claro** alternavel. Layout em **4
quadrantes** que cabem numa unica tela:

| | esquerda | direita |
|---|---|---|
| **topo** | Q1 — KPIs (Hoje em destaque x Geral), 4 cores, valor auto-ajustado | Q3 — Ranking: **podio dos 3 + lista** dos demais (scroll proprio) |
| **base** | Q2 — GMV TVD hora a hora, eixo fixo 0h-23h (acumulado/spot) | Q4 — **dois graficos alinhados**: linha de Share em cima, barras TVD **empilhadas por vendedor** embaixo (spot/acumulado) |

**Modelo escalavel:** cada dashboard e **uma Google Sheet** (abas `Config`, `Participantes`,
`Acessos`, `Snapshot_BQ`) + Apps Script vinculado + Web App proprio. Para criar outro, **duplica-se
a planilha**. Segredos do Supabase ficam em Script Properties (nunca na planilha).

## Conteudo desta pasta

| arquivo | papel |
|---|---|
| `Code.gs` | backend: config, acesso por papel (Nivel), agregacao Supabase, consulta de vendas |
| `BigQuery.gs` | backend Comissao: queries BQ, snapshot na aba `Snapshot_BQ`, trigger 30 min + helpers de snapshot fragmentado |
| `Funil.gs` | backend Funil (so gerencial): queries de ativacao/conversao/TMR, snapshot na aba `Snapshot_Funil` |
| `Index.html` | shell: menu fixo + 4 views + 4 quadrantes + view Funil; carrega Chart.js via CDN |
| `Stylesheet.html` | CSS (tema dark/light por variaveis, grid responsivo) |
| `JavaScript.html` | front: render dos KPIs/graficos/ranking, troca de view/tema, polling |
| `appsscript.json` | manifesto (timezone, escopos, Web App) |
| `Config-template.md` | schema das abas da planilha |

## Definicao de TVD

- **Supabase (real-time):** uma venda e TVD quando o campo `pmp` **contem "TVD"**. "Outros" = `pmp`
  sem "TVD". O codigo do vendedor (ranking) e o ultimo segmento de 3 letras do `pmp`.
- **BigQuery (comissao):** TVD = `sales_channel = 'TVD'` (`canal_tvd` na aba Config). _(PR2)_

GMV = `price` (produto sem recorrencia). `Share TVD = GMV TVD / GMV Total` (mesma metrica no Q4).

**Alias de PMP:** a aba `Config` aceita `pmp_aliases` (`DE:PARA`, default `JCK:JKC`) para corrigir
um PMP criado errado na origem — funde o codigo no ranking, na foto e na atribuicao (Supabase em JS;
BigQuery via `CASE` no SQL, somando os dois codigos).

## Setup (1a vez)

1. **Crie a Google Sheet** com as abas `Config` e `Participantes` (ver `Config-template.md`).
2. Na planilha: `Extensoes > Apps Script`. Crie e cole os arquivos desta pasta:
   - `Code.gs` -> `Code.gs` (e, para a Comissao/Funil, `BigQuery.gs` e `Funil.gs`)
   - `Index.html` -> arquivo HTML `Index`
   - `Stylesheet.html` -> arquivo HTML `Stylesheet`
   - `JavaScript.html` -> arquivo HTML `JavaScript`
   - (opcional) `appsscript.json`: ative em `Project Settings > Mostrar arquivo de manifesto`.
3. `Project Settings > Script Properties`, adicione os segredos do Supabase:
   - `SUPABASE_JWT_SECRET` — JWT Secret do projeto (`Settings > API > JWT Settings`).
   - `SUPABASE_JWT_SUB` — uuid do seu usuario (`Authentication > Users`).
   - `SUPABASE_PUBLISHABLE_KEY` — `sb_publishable_...`.
   - (fallback) `SUPABASE_SERVICE_ROLE_KEY` (legado `eyJ...`, ignora RLS) ou `SUPABASE_ACCESS_TOKEN`.
4. No editor, rode **`diag`** uma vez (autorize os escopos). Veja o `Registro de execucao`: deve
   listar a janela, os KPIs totais e as contagens de ranking/dias/horas.
5. **Deploy:** `Implantar > Nova implantacao > App da Web`
   - Executar como: **Usuario que acessa o app** (`USER_ACCESSING`) — necessario para ler o e-mail
     do visitante (`Session.getActiveUser().getEmail()`) e validar na aba `Acessos` (PR3).
   - Quem tem acesso: **Qualquer pessoa no Grupo Primo** (`DOMAIN`).
   - Abra a URL `…/exec`.

> **Modelo de acesso:** cada visitante (do dominio) roda o app como ele mesmo, entao precisa de
> **acesso de leitura a planilha** (compartilhe a Sheet com o grupo como Leitor). Os segredos do
> Supabase ficam em Script Properties (nao expostos). O **BigQuery NAO roda por visitante**: um
> **trigger de 30 min** (executado como o dono) grava o snapshot na aba `Snapshot_BQ` e a visao
> Comissao apenas le dali — por isso os visitantes nao precisam de acesso ao BigQuery (PR2).

## Visao Comissao (BigQuery por snapshot)

1. No editor: cole tambem `BigQuery.gs`. Habilite o **servico avancado BigQuery**
   (`Servicos +` > BigQuery API) — ou deixe via `appsscript.json` (`enabledAdvancedServices`).
2. Preencha na aba `Config`: `bq_project` (=`grupo-primo-prd`, **com hifens**), `bq_table`,
   `bq_product_like` e `canal_tvd` (=`TVD`).
3. Rode **`testSnapshot`** uma vez: loga os KPIs e as contagens das 4 queries (nao grava nada).
   Compare os KPIs com uma consulta manual no console do BigQuery (sanity).
4. Rode **`criarTriggerSnapshot`** uma vez: cria o trigger de 30 min e ja gera o 1o snapshot na
   aba `Snapshot_BQ`. O trigger roda **como o dono** (que tem acesso ao BigQuery); os visitantes
   so leem a aba.
5. O botao **💰 Comissao** passa a exibir os 4 quadrantes vindos do snapshot, com o horario do
   ultimo snapshot no status.

> A visao Comissao usa a **janela configurada** (`inicio`/`fim`); o seletor de datas do menu
> afeta a visao Real-time (Supabase). O BigQuery roda projeto/tabela **com hifens** — sem hifen
> falha (`Cannot parse as CloudRegion` / `Access Denied`).

## Visao Funil (so nivel gerencial)

1. No editor: cole tambem `Funil.gs`. Use o mesmo servico avancado **BigQuery** da Comissao.
2. Na aba `Acessos`, coloque `gerencial` na coluna **`Nivel`** de quem pode ver o Funil.
3. Na aba `Config`, confira/preencha as chaves `funil_*`, `bq_deals_*`, `bq_leads_table`,
   `bq_messages_table` e `tvd_channel_ids` (tem defaults — so sobrescreva se preciso). A janela
   reusa `inicio`/`fim`.
4. Rode **`testFunil`** uma vez: loga as contagens e uma amostra de cada query **sem gravar**.
   Use as **amostras de 100 linhas** das tabelas para validar os nomes de coluna; ajuste o SQL em
   `Funil.gs` conforme os erros (so este arquivo conhece os nomes crus — o front usa shape normalizado).
5. Rode **`criarTriggerFunil`** uma vez: cria o trigger de 30 min e gera o 1o snapshot na aba
   `Snapshot_Funil` (gravado **fragmentado** em varias celulas por causa do limite de ~50k/celula).
6. O botao **📊 Funil** aparece para o nivel gerencial e exibe os paineis a partir do snapshot.

> **Por que snapshot/papel:** o Funil toca tabelas de CRM/leads/mensagens; rodar por visitante
> exporia acesso ao BQ e seria lento. O trigger roda **como o dono** e grava o snapshot; o front
> so le. O gate por papel (`exigirGerencial_`) protege o dado tambem no backend (defesa em profundidade).

## Criar OUTRO dashboard

`Arquivo > Fazer uma copia` da planilha (o script vinculado vem junto). Na copia: ajuste a aba
`Config` (outro `titulo`/`produto`/`slug_like`/janela/`participantes` e os parametros `bq_*`),
recadastre os 3 segredos em Script Properties (nao sao copiados) e faca um **novo deploy** de Web App.

## Roadmap (entrega faseada)

- **PR1:** shell + menu + tema dark/light + visao Real-time (Supabase) + Consulta de vendas.
- **PR2 (este):** snapshot BigQuery (`snapshotBigQuery` + trigger 30 min + aba `Snapshot_BQ`) e a visao Comissao.
- **PR3:** controle de acesso (aba `Acessos` + checagem no `doGet`) e refino visual/responsivo.
- **PR4:** visao **Funil** (so nivel `gerencial`): snapshot proprio (`snapshotFunil` + aba
  `Snapshot_Funil` fragmentada), queries de ativacao/conversao/TMR e filtros client-side.
- **Melhorias:** KPIs maiores; Q2 com eixo fixo 0h-23h; Q4 empilhado por vendedor com Share por
  cima; alias de PMP (`JCK`->`JKC`); Consulta de vendas filtrada pelo produto e dividida em
  "Minhas vendas" x "Vendas Gerais" (coluna `PMP` na aba `Acessos`).

## Troubleshooting

- **Graficos vazios / KPIs zerados:** confira a janela (`inicio`/`fim`) e o `slug_like`; rode `diag`.
- **HTTP 401:** o JWT/RLS nao autorizou — confira `SUPABASE_JWT_SUB` e a policy de SELECT.
- **Mudou `Code.gs`/HTML:** cole de novo no editor e **atualize a implantacao**
  (`Gerenciar implantacoes > editar > Nova versao`). O Apps Script nao puxa do GitHub.
