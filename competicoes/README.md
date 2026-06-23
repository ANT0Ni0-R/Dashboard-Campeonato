# Competições TV — pódio de GMV (Apps Script)

Dashboard de pódio para competições simples de vendas: durante uma janela, alguns
Closers disputam quem faz mais **GMV**; a TV mostra o ranking do maior para o menor
com um **pódio** na identidade visual do Grupo Primo (dark, alto contraste).

Arquitetura **escalável**: cada competição é **uma Google Sheet** (com abas `Config`
e `Participantes`) + Apps Script vinculado + Web App próprio. Para criar outra,
**duplica-se a planilha**.

## Conteúdo desta pasta

| arquivo | papel |
|---|---|
| `Code.gs` | backend: lê a planilha, consulta o Supabase, monta o ranking e a consulta de vendas |
| `Index.html` | front do pódio (TV, dark) servido pelo Web App |
| `Vendas.html` | aba "Consultar vendas" (`?page=vendas`): lista as vendas dos últimos 7 dias, com busca por email/telefone |
| `appsscript.json` | manifesto (timezone, escopos, config do Web App) |
| `Config-template.md` | colunas das abas `Config` / `Participantes` da planilha |
| `fotos/<PMP>.jpg` | fotos dos Closers (servidas via `raw.githubusercontent.com`) |

> **Sobre os dois repositórios:** o plano era um repo **privado** (código) + um
> **público** (fotos). A criação automática foi bloqueada (403), então tudo está
> aqui por enquanto. Como o código **não tem segredos** (ficam em Script
> Properties), ser público não é um problema de segurança. Para separar depois:
> mova `competicoes/fotos/` para um repo público dedicado e o restante para um
> privado, e atualize `fotos_base` (aba Config) e `FOTOS_BASE` (`Code.gs`).

## Como dados são consultados

`getRanking()` (server-side) consulta o Supabase (`db_transactions_events`,
`type=order_success`), filtrando por `slug ilike` (produto) e `created_at` entre
`inicio` e `fim` (janela). Extrai o PMP de 3 letras do campo `pmp`
(`split('-')` → último segmento), soma `price` (GMV = price) por participante e
ordena desc. Auth via **JWT assinado no servidor** (ver Segredos).

## Aba "Consultar vendas"

O botão **🔎 Consultar vendas (7 dias)** no pódio abre, numa nova aba, a página
`?page=vendas` (`Vendas.html`). Ela lista as vendas (`order_success`) dos últimos
7 dias **de qualquer produto** e permite buscar por **email ou telefone**,
mostrando para cada venda o **produto (slug)** e o **PMP** em que ela caiu — útil
para conferir por que uma venda não entrou na competição. Backend:
`listarVendas(termo)` no `Code.gs` (sem termo = todas dos 7 dias, limite 300).

## Setup de uma competição (1ª vez)

1. **Crie a Google Sheet** com as abas `Config` e `Participantes` (ver `Config-template.md`).
2. Na planilha: `Extensões > Apps Script`. Crie os arquivos e cole o conteúdo desta pasta:
   - `Code.gs` → `Code.gs`
   - `Index.html` → arquivo HTML chamado `Index`
   - `Vendas.html` → arquivo HTML chamado `Vendas` (aba de consulta de vendas)
   - (opcional) `appsscript.json`: ative em `Project Settings > Mostrar arquivo de manifesto`.
3. `Project Settings > Script Properties`, adicione os segredos:
   - `SUPABASE_JWT_SECRET` — JWT Secret do projeto (Supabase: `Settings > API > JWT Settings`).
   - `SUPABASE_JWT_SUB` — uuid do seu usuário (`Authentication > Users > User UID`).
   - `SUPABASE_PUBLISHABLE_KEY` — `sb_publishable_...` (`Settings > API Keys`).
   - (opcional) `SUPABASE_JWT_ROLE` (default `authenticated`), `SUPABASE_URL`.
4. No editor, rode a função **`diag`** uma vez (autorize os escopos). Veja o
   `Registro de execução`: deve listar a janela, os participantes e o ranking.
5. **Deploy:** `Implantar > Nova implantação > App da Web`
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
   - Copie a URL `…/exec` e abra na smart TV.

## Como criar OUTRA competição

`Arquivo > Fazer uma cópia` da planilha (o script vinculado é copiado junto).
Na cópia: ajuste a aba `Config` (outro `titulo`/`produto`/`slug_like`/`participantes`/
janela), confirme os Script Properties (não são copiados — recadastre os 3 segredos)
e faça um **novo deploy** de Web App. Pronto: 2ª TV sem tocar no código.

## Fotos

`fotos/<PMP>.jpg`. Sem foto, o pódio usa as iniciais do nome. As URLs apontam para
a branch **`main`** (`fotos_base` no `Code.gs`); enquanto este código estiver numa
branch de trabalho, ajuste `fotos_base` na aba Config para a branch correspondente
ou aguarde o merge na `main`.

## Troubleshooting

- **`getRanking()` vazio / só iniciais:** confira a janela (`inicio`/`fim`) e o
  `slug_like`; rode `diag` e veja se as transações batem.
- **HTTP 401:** o JWT/RLS não autorizou — confira `SUPABASE_JWT_SUB` e a policy de SELECT.
- **Mudou o `Code.gs`/`Index.html`:** cole de novo no editor e **atualize a implantação**
  (`Gerenciar implantações > editar > Nova versão`). O Apps Script não puxa do GitHub.
