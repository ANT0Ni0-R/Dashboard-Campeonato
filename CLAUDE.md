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

### BigQuery: hifens no PROJECT_ID e na tabela

O ID do projeto e `grupo-primo-prd` (com hifens). Sem hifens causa:
- `Cannot parse as CloudRegion` -- se o PROJECT_ID nao tiver hifen
- `Access Denied: Table grupoprimoprd:...` -- se o path da tabela nao tiver hifen

**Regra:** sempre usar `grupo-primo-prd` com hifens em ambos os lugares.

### Apps Script: autenticacao Supabase com CAPTCHA

O Supabase ativou CAPTCHA no Auth, quebrando o login `grant_type=password`.
Solucao: usar a secret key em Script Property `SUPABASE_SECRET_KEY` (nunca no repo).
Ver detalhes em `apps-script/CLAUDE.md` e `apps-script/README.md`.

### Commit messages com caracteres especiais

Mensagens de commit com acentos via heredoc podem causar exit code 144. Usar ASCII puro.

### Funil: filtro de grupo e LIKE (aproximado), nao igualdade

`funil_group_name` casa por `LOWER(group_name) LIKE LOWER(valor)` — escolha consciente porque
os nomes de grupo no CRM sao longos/instaveis e o gerencial e um **modelo escalavel** (duplica a
planilha, troca so o produto). O valor vem com `%...%` (igual `slug_like`). Ja foi bug usar `=`
com valor `%...%`: os `%` viram literais e base/ativados/TMR voltam vazios.

Quando o grupo da Clint e **compartilhado** entre varios funis (caso FIA: grupo `MBA IA [TDV 2]`,
lancamento = origem `Formação Consultor de IA`), preencha tambem `funil_origin_name` para estreitar
o escopo aquele `origin_name`. Vazio = grupo inteiro (legado, grupo dedicado). Detalhe em
`gerencial/CLAUDE.md`.

### Fotos: nome do arquivo deve ser `<PMP>.jpg` MINUSCULO

O codigo monta a URL sempre como `<PMP>.jpg`. A URL raw do GitHub e case-sensitive no caminho,
entao `FAL.JPG`/`JKC.jpeg`/`CCL.jpeg` dao 404. Em `assets/fotos/` todos os arquivos devem ser
`<PMP>.jpg` minusculo. Ao adicionar foto nova, padronize a extensao.

### Fotos no Apps Script: overlay de iniciais

CSS `position: absolute` na imagem e no span `.initials` causa sobreposicao.
Solucao: imagem `position: absolute; top:0; left:0; width:100%; height:100%`
+ `onload="this.className='loaded'"` + CSS `.avatar img.loaded + .initials { display: none; }`.

---

## Pontos de atencao

1. **Trocar o produto na semana do lancamento:** mudar `slug_like` em `copa/config.js` para `%LEGADO%`.
2. **Apps Script nao atualiza sozinho:** mudancas nos `.gs`/`.html` precisam ser coladas no editor e redeployadas.
3. **`fase_ativa_override`:** deixar `null` para producao. Usar so para testes.
4. **Repo publico:** necessario para as URLs raw.githubusercontent das fotos funcionarem.
5. **Datas do Supabase:** a query filtra `created_at >= 2026-06-16`. Antes disso retorna vazio e o JSON fallback assume (intencional para testes).
