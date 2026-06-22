# Apps Script — correcao do acesso ao Supabase (CAPTCHA)

## O problema
O Supabase ativou **CAPTCHA** no Auth. O `Code.gs` antigo fazia login
`grant_type=password` a cada renovacao de token, e esse endpoint agora exige
CAPTCHA — entao todo poll falhava com:

```
Falha no login Supabase (400): captcha protection: request disallowed (no captcha_token found)
```

## A correcao
Como a chamada ao Supabase e **100% server-side** (Apps Script), nao precisamos
de login. Usamos a **secret key** do Supabase (`sb_secret_...`), que mapeia para
`service_role`, ignora RLS, nao expira e **nao passa por CAPTCHA** (nao ha login).
Ela vai no header `apikey`. O `Code.gs` deste diretorio ja faz isso.

> Secret keys sao **server-only**: o Supabase recusa (401) se vierem de um
> navegador e **revoga** automaticamente qualquer secret key encontrada em repo
> publico. Por isso a key fica **so em Script Properties** — nunca neste repo.

## Passo a passo (uma vez)
1. **Supabase** → Project Settings → **API Keys** → *Secret keys* → crie/copie a
   key `sb_secret_...`.
2. **Apps Script** → ⚙️ Project Settings → **Script Properties** → adicione:
   - `SUPABASE_SECRET_KEY` = `sb_secret_...`
   - (pode remover `SUPABASE_AUTH_EMAIL` e `SUPABASE_AUTH_PASSWORD`; viraram legado)
3. **Apps Script** → cole o `Code.gs` deste diretorio no arquivo `Code.gs` do editor.
4. **Implantar** → Gerenciar implantacoes → editar a implantacao ativa → **Nova versao** → Implantar.
5. Abrir a URL `...exec` (Copa) e `...exec?view=ranking` (Ranking) e confirmar que
   os dados carregam (status "Conectado").

## Alternativa (se quiser manter RLS, sem service_role)
Em vez da secret key, defina:
- `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` (header apikey)
- `SUPABASE_ACCESS_TOKEN` = um JWT de longa duracao de um usuario/role com leitura

O `Code.gs` usa esse modo automaticamente quando `SUPABASE_SECRET_KEY` nao esta
definida. JWT tambem e verificado offline pelo PostgREST, entao tambem nao passa
por CAPTCHA — mas exige gerar/renovar o token, enquanto a secret key nao expira.
