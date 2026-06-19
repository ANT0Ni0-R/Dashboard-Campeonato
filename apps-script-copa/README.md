# Copa do Mundo: O Legado — versão Apps Script (server-side)

Versão do dashboard da Copa servida pelo **Google Apps Script**, com as requisições
ao Supabase feitas no **servidor**. Permite manter o repositório de código
**privado**, expor uma **URL pública** que abre direto na smart TV (sem login) e
guardar as credenciais do Supabase **fora do cliente**.

É uma alternativa à versão GitHub Pages (`index.html` + `app.js` + `config.js` +
`styles.css`) — a lógica de cálculo/renderização é a mesma; só a busca de dados
mudou de fetch no navegador para `google.script.run` → servidor.

## Arquivos (cada um vira um arquivo no editor do Apps Script)

| Arquivo no repo | Arquivo no Apps Script | Conteúdo |
|---|---|---|
| `Code.gs` | `Code.gs` (Script) | `doGet`, `getTransactions`, login + cache de token |
| `Index.html` | `Index` (HTML) | casca HTML; monta a página via `include()` |
| `Stylesheet.html` | `Stylesheet` (HTML) | CSS (cópia do `styles.css`) |
| `Config.html` | `Config` (HTML) | `COMPETICAO` + `ASSETS_BASE` (cópia do `config.js`) |
| `JavaScript.html` | `JavaScript` (HTML) | motor do dashboard (cópia do `app.js`) |

> O Apps Script não lê o GitHub automaticamente: ao mudar qualquer arquivo aqui,
> copie/cole no editor em `script.google.com` e gere uma nova versão da implantação.

## Segredos (Script Properties)

Em `script.google.com` → ⚙️ **Configurações do projeto** → **Propriedades do script**,
adicione:

| Propriedade | Obrigatório | Default |
|---|---|---|
| `SUPABASE_PUBLISHABLE_KEY` | sim | — |
| `SUPABASE_AUTH_EMAIL` | sim | — |
| `SUPABASE_AUTH_PASSWORD` | sim | — |
| `SUPABASE_URL` | não | `https://ipalripfknzhrzddhvdx.supabase.co` |
| `SUPABASE_TABELA` | não | `db_transactions_events` |
| `PRODUTO_SLUG_LIKE` | não | `%legado%` |
| `CREATED_AT_GTE` | não | `2026-06-16T00:00:00-03:00` |

Nada de credencial vai para o repositório. (Há também a função utilitária
`setSecrets_()` no `Code.gs` para gravar via código uma única vez.)

### Como o servidor autentica

1. `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` com header `apikey:
   <publishable>` e body `{email, password}` → recebe `access_token`.
2. O token é cacheado (`CacheService`, ~50 min) para não logar a cada poll.
3. `GET {SUPABASE_URL}/rest/v1/{tabela}?...` com `apikey: <publishable>` +
   `Authorization: Bearer <access_token>`. Em caso de `401`, renova o token e repete.

Como a consulta é autenticada como usuário, dá para **fechar a RLS** para o papel
`authenticated` — os dados deixam de ser legíveis pela anon key pública.

## Fotos e bandeiras (`ASSETS_BASE`)

O Apps Script não serve arquivos locais. As fotos/bandeiras são carregadas de um
**repositório público** via `raw.githubusercontent.com`. Em `Config.html`,
`ASSETS_BASE` aponta para a base desses assets.

**Antes de tornar o repositório de código privado**, mova `fotos/` e `flags/` para
um repositório público de assets e atualize `ASSETS_BASE`, por exemplo:

```js
const ASSETS_BASE = 'https://raw.githubusercontent.com/ant0ni0-r/dashboard-campeonato-assets/main';
```

Enquanto o repo atual continuar público, o default já funciona.

## Deploy

1. Crie um projeto em `script.google.com` e cole os 5 arquivos.
2. Defina os Script Properties (acima).
3. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa** (necessário para a TV abrir sem login).
4. Abra a URL `/exec` gerada na smart TV.

Para publicar mudanças depois: **Implantar → Gerenciar implantações → editar →
nova versão**.
