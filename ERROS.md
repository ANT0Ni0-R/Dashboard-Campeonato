# Erros cometidos e solucionados — nivel GLOBAL

> Log de erros que valem para **todo o repositorio** (ou mais de um subprojeto).
> Erros especificos de um subprojeto ficam no `ERROS.md` da pasta dele.
>
> **Antes de codar, leia este arquivo** (principio #2 do `CLAUDE.md`: "alguem ja fez isso antes?").
> Ao resolver um bug novo, adicione aqui (global) ou no `ERROS.md` da subpasta (especifico).

## Como registrar um erro

Use sempre este formato:

```
### <Area>: <titulo curto do erro>

**Sintoma:** o que aparece (mensagem de erro, comportamento errado).
**Causa:** por que acontece.
**Solucao:** o que fazer / regra a seguir.
```

---

## BigQuery: hifens no PROJECT_ID e na tabela

**Sintoma:**
- `Cannot parse as CloudRegion` — se o PROJECT_ID nao tiver hifen
- `Access Denied: Table grupoprimoprd:...` — se o path da tabela nao tiver hifen

**Causa:** o ID do projeto e `grupo-primo-prd` (com hifens) e foi escrito sem hifens.

**Solucao:** sempre usar `grupo-primo-prd` com hifens, tanto no PROJECT_ID quanto no path da tabela.

---

## Apps Script: autenticacao Supabase com CAPTCHA

**Sintoma:** login `grant_type=password` no Supabase Auth para de funcionar.

**Causa:** o Supabase ativou CAPTCHA no Auth.

**Solucao:** usar a secret key em Script Property `SUPABASE_SECRET_KEY` (nunca no repo).
Ver detalhes em `apps-script/CLAUDE.md` e `apps-script/README.md`.

---

## Git: commit messages com caracteres especiais

**Sintoma:** `git commit` retorna exit code 144.

**Causa:** mensagens de commit com acentos via heredoc.

**Solucao:** usar ASCII puro nas mensagens de commit.

---

## Funil: filtro de grupo e LIKE (aproximado), nao igualdade

**Sintoma:** base / ativados / TMR voltam vazios ao filtrar por grupo.

**Causa:** uso de `=` com um valor `%...%` — os `%` viram literais e nada casa.

**Solucao:** `funil_group_name` casa por `LOWER(group_name) LIKE LOWER(valor)` (aproximado).
Escolha consciente: os nomes de grupo no CRM sao longos/instaveis e o gerencial e um **modelo
escalavel** (duplica a planilha, troca so o produto). O valor vem com `%...%` (igual `slug_like`).

Quando o grupo da Clint e **compartilhado** entre varios funis (caso FIA: grupo `MBA IA [TDV 2]`,
lancamento = origem `Formacao Consultor de IA`), preencha tambem `funil_origin_name` para estreitar
o escopo aquele `origin_name`. Vazio = grupo inteiro (legado, grupo dedicado). Detalhe em
`gerencial/CLAUDE.md`.

---

## Fotos: nome do arquivo deve ser `<PMP>.jpg` MINUSCULO

**Sintoma:** foto do vendedor da 404.

**Causa:** a URL raw do GitHub e case-sensitive no caminho; o codigo monta sempre `<PMP>.jpg`,
entao `FAL.JPG` / `JKC.jpeg` / `CCL.jpeg` nao batem.

**Solucao:** em `assets/fotos/` todos os arquivos devem ser `<PMP>.jpg` minusculo. Ao adicionar
foto nova, padronize a extensao.

---

## Fotos no Apps Script: overlay de iniciais sobreposto

**Sintoma:** a imagem e o span `.initials` aparecem sobrepostos.

**Causa:** `position: absolute` aplicado na imagem e no span ao mesmo tempo.

**Solucao:** imagem `position: absolute; top:0; left:0; width:100%; height:100%`
+ `onload="this.className='loaded'"` + CSS `.avatar img.loaded + .initials { display: none; }`.
