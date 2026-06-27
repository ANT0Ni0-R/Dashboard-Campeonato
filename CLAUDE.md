# Dashboard Campeonato — Contexto Geral

> Este e o mapa raiz do repositorio. Cada subprojeto tem seu proprio CLAUDE.md com
> detalhes tecnicos especificos — comece por aqui e aprofunde no arquivo da pasta relevante.

---

## Principios de trabalho — pergunte ANTES de codar

Antes de escrever qualquer linha de codigo, responda explicitamente a estas 5 perguntas:

1. **Sera que tem uma forma mais simples de fazer?**
   Prefira a solucao mais direta. Esta base e vanilla JS + Apps Script, sem build, sem
   framework. Nao introduza dependencias, abstracoes ou camadas novas se uma funcao
   pequena resolve. Menos codigo = menos bug.

2. **Sera que alguem ja fez isso antes?**
   Verifique o historico (`git log`), as secoes "Erros cometidos" e "Pontos de atencao"
   deste arquivo e dos CLAUDE.md das subpastas. Muito problema aqui ja foi resolvido.

3. **Tem alguma documentacao para isso?**
   Antes de inferir comportamento, consulte: este CLAUDE.md, o CLAUDE.md da subpasta, e
   a doc oficial da dependencia (Supabase REST, Apps Script, BigQuery). Nao chute APIs
   externas — confirme.

4. **Sera que esse codigo ja existe no projeto?**
   Procure (`grep`) antes de criar. Ha muita logica reutilizavel: calculo de GMV, parsing
   de PMP, formatacao de moeda, fetch do Supabase, render de podio.

5. **Sera que eu deveria separar isso em mais de um arquivo?**
   `copa/app.js` ja tem ~1370 linhas. Avalie se a mudanca merece um modulo proprio.
   Equilibre: separar demais em projeto sem bundler atrapalha (cada arquivo vira um
   `<script>`).

---

## Fluxo de trabalho

### Subagentes — use o modelo mais barato que resolva

- **Haiku** (`claude-haiku-4-5`): exploracao read-only, grep, lookup simples.
- **Sonnet** (`claude-sonnet-4-6`): edicoes localizadas, refactors pequenos.
- **Opus** (`claude-opus-4-8`): design/arquitetura, implementacao complexa.

### Git

- Mensagens de commit em **ASCII puro** (acentos via heredoc podem dar exit code 144).
- Sempre revisar o CLAUDE.md da subpasta afetada apos implementar.

### Revisao pos-implementacao (obrigatoria)

- Funcoes com mais de **30 linhas** — quebrar.
- Logica duplicada mais de **duas vezes** — extrair.
- **Ausencia de tratamento de erros** em operacoes assincronas.
- **Graficos sem data labels.** Todo grafico (Chart.js + `chartjs-plugin-datalabels`) deve
  exibir valores como rotulos. Quando sobrepostos, usar `display: 'auto'`.
- **Total em graficos empilhados/agrupados.** Alem dos rotulos por segmento, todo grafico de
  barras empilhadas (ou agrupadas) deve exibir o **rotulo do TOTAL** no topo de cada coluna —
  boa pratica de visualizacao de dados. Padrao usado: um dataset-overlay de linha transparente
  com a soma da pilha, exibindo so o data label (ex.: `renderChartDia` em `gerencial/`).
- Executar `/code-review` antes de apresentar o codigo.

---

## Estrutura de pastas

| Caminho | Papel | CLAUDE.md |
|---|---|---|
| `copa/` | Dashboard 1 - bracket (vanilla JS + Supabase) | `copa/CLAUDE.md` |
| `apps-script/` | Dashboard 2 - Ranking Geral (BigQuery) | `apps-script/CLAUDE.md` |
| `competicoes/` | Variante reutilizavel: podio de GMV por competicao | `competicoes/CLAUDE.md` |
| `gerencial/` | Dashboard 3 - Gerencial (Apps Script, 4 quadrantes) | `gerencial/CLAUDE.md` |
| `Corrida_Fechamento/` | Dashboard 4 - Corrida de fechamento do mes (Apps Script + Supabase) | `Corrida_Fechamento/CLAUDE.md` |
| `assets/` | Fotos, bandeiras e outros assets compartilhados entre projetos | - |

**`assets/`:**
```
assets/
  fotos/          -- fotos dos vendedores (CCL.jpeg, HUM.jpg, etc.)
  flags/          -- bandeiras (brasil.svg, argentina.webp, etc.)
  fotos_bandeiras/
```

URL raw: `https://raw.githubusercontent.com/ant0ni0-r/dashboard-campeonato/main/assets/fotos/HUM.jpg`
O repo precisa ser **publico** para as URLs raw funcionarem.

---

## Visao Geral dos projetos

| Dashboard | Fonte de dados | Hospedagem |
|---|---|---|
| Copa (bracket) | Supabase (polling 60s) | Abrir `copa/index.html` localmente |
| Ranking Geral | BigQuery (direto) | Apps Script Web App |
| Gerencial | Supabase real-time + BigQuery snapshot 30 min | Apps Script Web App |
| Competicoes | Supabase (JWT server-side) | Apps Script Web App (1 por competicao) |
| Corrida de Fechamento | Supabase (JWT server-side, polling) | Apps Script Web App |

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
| JPP | Joao Pedro | C |
| HUM | Hudson | D |
| JKC | Jackson | D |

Grupos A, B, C avancam 2; Grupo D avanca 1. Repescagem: 1 vaga.

---

## Fases da competicao

| Fase | Tipo | Data |
|---|---|---|
| grupos | grupos | 16/jun |
| quartas | mata-mata 1v1 | 17/jun |
| brasil | tela separada | 18/jun |
| semis | mata-mata 1v1 | 19/jun |
| final | mata-mata 1v1 | 20/jun |

---

## Erros cometidos -- nao repetir

> Os erros foram movidos para arquivos `ERROS.md` dedicados (fonte unica de verdade):
>
> - **`ERROS.md`** (raiz) — erros globais (BigQuery, Supabase/CAPTCHA, git, funil, fotos, etc.).
> - **`<subpasta>/ERROS.md`** — erros especificos daquele subprojeto.
>
> **Antes de codar, leia o `ERROS.md` global e o da subpasta afetada.** Ao resolver um bug novo,
> registre-o no nivel certo (global se vale para o repo todo; subpasta se for especifico).

---

## Pontos de atencao

1. **Trocar o produto na semana do lancamento:** mudar `slug_like` em `copa/config.js` para `%LEGADO%`.
2. **Apps Script nao atualiza sozinho:** mudancas nos `.gs`/`.html` precisam ser coladas no editor e redeployadas.
3. **`fase_ativa_override`:** deixar `null` para producao. Usar so para testes.
4. **Repo publico:** necessario para as URLs raw.githubusercontent das fotos funcionarem.
5. **Datas do Supabase:** a query filtra `created_at >= 2026-06-16`. Antes disso retorna vazio e o JSON fallback assume (intencional para testes).
6. **GMV projetado (gerencial, so Supabase):** parcelado entra no Supabase so com a 1a parcela. A aba `Faixas_GMV` projeta `price * meses * fator` por faixa. BigQuery ja traz o contrato cheio (nao usa). Detalhe em `gerencial/CLAUDE.md`.
