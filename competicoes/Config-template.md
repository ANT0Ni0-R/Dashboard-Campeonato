# Planilha da competição — abas e colunas

Cada competição é **uma Google Sheet** com duas abas. O Apps Script (`Code.gs`)
lê os parâmetros daqui. Para criar outra competição, **duplique a planilha**
(`Arquivo > Fazer uma cópia` — o script vinculado vai junto) e ajuste a aba `Config`.

## Aba `Config` (duas colunas: `chave` | `valor`)

| chave | exemplo | descrição |
|---|---|---|
| `titulo` | `FPF` | nome da competição (header do pódio) |
| `produto` | `Formação Planejador Financeiro` | subtítulo / nome do produto no header |
| `premio` | `Vale iFood R$200` | faixa de premiação (deixe vazio p/ ocultar) |
| `slug_like` | `%FORMACAO%` | filtro do produto no Supabase (`slug ilike`, use `%` como coringa) |
| `participantes` | `EZB,HLM,MDR,JKC` | PMPs de 3 letras, separados por vírgula |
| `inicio` | `2026-06-23T00:00:00-03:00` | início da janela (`created_at >=`) |
| `fim` | `2026-06-24T23:59:59-03:00` | fim da janela (`created_at <=`) |
| `poll_segundos` | `60` | intervalo de atualização da TV |
| `fotos_base` | `https://raw.githubusercontent.com/ANT0Ni0-R/Dashboard-Campeonato/main/competicoes/fotos/` | base das fotos (opcional; default no `Code.gs`) |
| `tabela` | `db_transactions_events` | tabela do Supabase (opcional) |
| `url` | `https://….supabase.co` | URL do Supabase (opcional; default no `Code.gs`) |

A primeira linha pode ser um cabeçalho `chave | valor` — ele é ignorado.
Datas em ISO 8601 com fuso `-03:00` (America/Sao_Paulo).

## Aba `Participantes` (duas colunas: `PMP` | `Nome`)

| PMP | Nome |
|---|---|
| EZB | Enzo |
| HLM | Harry |
| MDR | Monica |
| JKC | Jackson |

Usada só para exibir o **nome** (a tabela do Supabase tem `pmp`/`price`, não o nome).
Sem linha aqui, o pódio mostra o próprio PMP. A **foto** vem de
`fotos_base + <PMP>.jpg` (ex.: `.../fotos/EZB.jpg`); sem foto, aparece as iniciais.

## Segredos (NÃO ficam na planilha)

Em `Extensões > Apps Script > Project Settings > Script Properties`:

| propriedade | valor |
|---|---|
| `SUPABASE_JWT_SECRET` | JWT Secret do projeto Supabase (assinatura HS256) |
| `SUPABASE_JWT_SUB` | uuid do seu usuário (claim `sub` / RLS via `auth.uid()`) |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (header `apikey`) |
