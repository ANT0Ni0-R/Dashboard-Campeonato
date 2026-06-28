# Erros cometidos e solucionados — nova_planilha_amarelinha

> Log de erros especificos deste subprojeto. Erros que valem para todo o repositorio
> ficam no `ERROS.md` da raiz.
>
> Formato: **Sintoma / Causa / Solucao** (igual ao `ERROS.md` global).

---

## Apps Script: `moveActiveSheet is not a function` ao encadear no `setActiveSheet`

**Sintoma:**
```
TypeError: ss.setActiveSheet(...).moveActiveSheet is not a function
```

**Causa:** `Spreadsheet.setActiveSheet(sheet)` retorna um objeto **`Sheet`**, nao o `Spreadsheet`.
`moveActiveSheet(pos)` e metodo do **`Spreadsheet`**, entao encadear `.moveActiveSheet()` no
retorno de `setActiveSheet()` chama o metodo num `Sheet` — que nao existe.

**Solucao:** chamar os dois metodos separadamente no `Spreadsheet` (`ss`):

```js
// errado
ss.setActiveSheet(sh).moveActiveSheet(i + 1);

// certo
ss.setActiveSheet(sh);
ss.moveActiveSheet(i + 1);
```

Corrigido em `amarelinha_v3/amarelinha_v3/Code.gs` (funcao de ordenacao das abas).

---

## Apps Script: merge sobreposto no setup da aba Amarelinha

**Sintoma:**
```
Exception: E necessario selecionar todas as celulas em um intervalo para mescla-las ou separa-las.
```
Acontecia ao gerar a aba `Amarelinha`; como a excecao abortava o setup, as abas
`Extrato` e `Lista` nem chegavam a ser criadas.

**Causa:** em `_createAmarelinha` o canto do cabecalho era mesclado como `A1:B3` (um unico
bloco) e, logo depois, o codigo tentava mesclar `A2:B2` e escrever em `A3` — celulas que ja
estavam *dentro* do bloco `A1:B3`. Mesclar um subconjunto de um merge existente gera esse erro.

**Solucao:** manter apenas o merge do canto `A1:B3` com o rotulo "Vendedor / PMP" e remover
as re-mesclagens `A2:B2` / `A3` (eram codigo conflitante e tambem contradiziam o significado
das colunas: A = nome, B = PMP por linha).

> Regra geral: nunca mesclar um intervalo que se sobreponha parcialmente a um merge ja existente.
> Setups de planilha devem ser idempotentes — cada `_create*` deleta a aba antes de recriar, entao
> basta rodar o setup de novo apos a correcao.

---

## Apps Script: "O servico Planilhas apresentou falha ao acessar o documento" no addMonth

**Sintoma:**
```
Erro: O servico Planilhas apresentou falha ao acessar o documento com o codigo <id>.
```
Aparecia ao adicionar o 2o mes (e o 1o ja saia com o merge do mes fragmentado — "julho/2026"
mesclado so ate a coluna Z e o valor repetido celula a celula em AA..AG).

**Causa:**
- `addMonth` escrevia **celula a celula** dentro de loops: para cada um dos ~31 dias chamava
  `setValue`/`setBackground`/etc. + `setColumnWidth`, e para cada um dos 17 vendedores chamava
  `_getAllTags()` (relendo a aba Produtos) e aplicava validacao/borda individualmente. Sao
  centenas de chamadas ao servico Sheets num unico run -> dispara o erro transiente de acesso.
- O merge do mes era feito sem `breakApart()` defensivo; restos de merge de uma execucao
  anterior fragmentavam o resultado.

**Solucao (refatoracao em `addMonth.gs`):**
1. **Escritas em lote** — montar arrays e gravar de uma vez (`setValues`/`setBackgrounds`/
   `setFontColors`) e `setColumnWidths(start, n, w)` numa unica chamada. `_getAllTags()` sai do
   loop (1x). Reduz de centenas para ~uma duzia de chamadas. (Fonte: Apps Script Best Practices.)
2. **`breakApart()` antes de `merge()`** no bloco do mes.
3. **`addMonth` idempotente** — `_removeMonth(mesStr)` no inicio limpa estado anterior/parcial, e
   tudo roda dentro de `_retry(fn, 3)` (backoff 1s/2s/4s) que repete **so** o erro transiente de
   acesso. Como e idempotente, repetir nao duplica colunas.
4. **`getMonthMapping` deriva da planilha** (procura o rotulo na linha 1) em vez de confiar em
   `PropertiesService`. Assim remover/recriar um mes (que desloca colunas) nunca dessincroniza o
   mapeamento usado pelo Extrato.

> Regra geral (Sheets via Apps Script): leia/escreva SEMPRE em lote com arrays; loops
> celula-a-celula sao lentos e sobrecarregam o servico (causa #1 do erro de acesso ao documento).
> Para erros transientes, envolver a operacao IDEMPOTENTE em retry com backoff.

> **Atencao ao re-deployar:** se a planilha atual estiver num estado quebrado/misto (ex.: o mes
> gravado como Date em vez do rotulo "Julho/2026"), rode o **setup inicial** de novo (recria as
> abas limpas) antes de adicionar os meses — o `getMonthMapping` procura o rotulo string e nao
> reconheceria um mes gravado como Date.

> **Limitacao conhecida (aceita):** recriar um mes que NAO seja o ultimo reanexa as colunas no
> fim (o bloco fica fora da ordem cronologica visual). Os dados nao se perdem — `getMonthMapping`
> acha o mes pelo rotulo — e o Extrato continua correto. Recriar o ULTIMO mes (caso comum) mantem
> a ordem. Inserir colunas na posicao certa nao compensa a complexidade.
