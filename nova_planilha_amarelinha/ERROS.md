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
