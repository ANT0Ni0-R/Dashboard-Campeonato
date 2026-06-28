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
