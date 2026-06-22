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

## Opcao B (manter o RLS) — servidor assina o JWT e renova sozinho
Em vez da service_role (que ignora o RLS), o servidor assina o proprio token com
o **JWT Secret** do projeto e o renova automaticamente (~50min), sem login, sem
CAPTCHA e sem token estatico para gerenciar.

Defina em Script Properties:
- `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` (header apikey)
- `SUPABASE_JWT_SECRET` = o JWT Secret do projeto (Settings > API > **JWT Settings**)
- `SUPABASE_JWT_SUB` = uuid do usuario — **so** se a policy de RLS usa `auth.uid()`
- `SUPABASE_JWT_ROLE` = papel no token (opcional; default `authenticated`)

Pre-requisitos a confirmar com o time:
1. **RLS de leitura:** existe policy de `SELECT` na tabela para o papel do token
   (`authenticated`, ou o usuario do `SUPABASE_JWT_SUB`)? Sem isso o `diagSupabase`
   retorna `HTTP 200` mas com corpo `[]` (token valido, porem RLS bloqueia a leitura).
2. **HS256 ativo:** o projeto ainda valida o JWT Secret simetrico (legado)? Se ele
   migrou para assinatura **so** assimetrica, o token HS256 nao valida — nesse caso
   use a Opcao A (service_role legada).

> Importante: a Opcao B usa o **JWT Secret** (Settings > API > JWT Settings), que
> NAO expira e NAO e a `sb_secret_` nova. Como o servidor assina sob demanda, nao
> ha nada para colar manualmente a cada hora.

## Alternativa: JWT longo estatico (sem dar o JWT Secret ao Apps Script)
Se preferir nao guardar o JWT Secret aqui, o time gera **um** JWT de longa duracao
e voce cola em `SUPABASE_ACCESS_TOKEN` (+ `SUPABASE_PUBLISHABLE_KEY`). Funciona
igual, mas alguem precisa gerar um token novo quando esse expirar.
