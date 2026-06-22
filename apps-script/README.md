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
de login. Usamos a **`service_role` LEGADA** do Supabase (JWT no formato `eyJ...`),
que mapeia para o papel `service_role`, ignora RLS, nao expira e **nao passa por
CAPTCHA** (nao ha login). Ela vai no header `apikey`. O `Code.gs` deste diretorio
ja faz isso.

> ⚠️ **NAO use a secret key NOVA `sb_secret_...` aqui.** O Supabase bloqueia as
> secret keys novas quando o `User-Agent` parece navegador (responde 401
> *"Forbidden use of secret API key in browser"*), e o `UrlFetchApp` do Apps
> Script manda um User-Agent `Mozilla/5.0...` que nao da para sobrescrever. A
> `service_role` LEGADA nao tem esse bloqueio.

> A chave fica **so em Script Properties** — nunca neste repo (o Supabase revoga
> chaves achadas em repo publico).

## Passo a passo (uma vez)
1. **Supabase** → Project Settings → **API Keys** → aba **Legacy API keys** →
   revele e copie a key **`service_role`** (formato `eyJ...`).
2. **Apps Script** → ⚙️ Project Settings → **Script Properties** → adicione:
   - `SUPABASE_SERVICE_ROLE_KEY` = `eyJ...` (a service_role legada)
   - se voce tinha posto `SUPABASE_SECRET_KEY` = `sb_secret_...`, **troque o valor**
     pela service_role legada (ou renomeie a property; o codigo aceita os dois nomes)
   - (pode remover `SUPABASE_AUTH_EMAIL` e `SUPABASE_AUTH_PASSWORD`; viraram legado)
3. **Apps Script** → cole o `Code.gs` deste diretorio no arquivo `Code.gs` do editor e salve.
4. (Opcional, recomendado) rode a funcao **`diagSupabase`** no editor e confira no
   "Registro de execucao": `Modo ... 1`, `HTTP 200` e linhas retornadas.
5. **Implantar** → Gerenciar implantacoes → editar a implantacao ativa → **Nova versao** → Implantar.
6. Abrir a URL `...exec` (Copa) e `...exec?view=ranking` (Ranking) e confirmar que
   os dados carregam (status "Conectado").

## Alternativa (se quiser manter RLS, sem service_role)
Em vez da secret key, defina:
- `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` (header apikey)
- `SUPABASE_ACCESS_TOKEN` = um JWT de longa duracao de um usuario/role com leitura

O `Code.gs` usa esse modo automaticamente quando `SUPABASE_SECRET_KEY` nao esta
definida. JWT tambem e verificado offline pelo PostgREST, entao tambem nao passa
por CAPTCHA — mas exige gerar/renovar o token, enquanto a secret key nao expira.
