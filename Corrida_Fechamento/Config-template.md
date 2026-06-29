# Planilha do dashboard "Corrida de Fechamento" — abas e colunas

O dashboard e **uma Google Sheet** vinculada ao Apps Script (`Code.gs`). Ele le todos os
parametros daqui. Para reaproveitar em outro mes/produto, **duplique a planilha**
(`Arquivo > Fazer uma copia` — o script vinculado vai junto) e ajuste a aba `Config`.

Tres abas: `Config`, `Participantes`, `Parcelamento`.

## Aba `Config` (duas colunas: `chave` | `valor`)

| chave | exemplo | descricao |
|---|---|---|
| `titulo` | `Corrida de Fechamento` | titulo no header |
| `inicio` | `2026-06-01T00:00:00-03:00` | inicio da janela do mes (`created_at >=`) |
| `fim` | `2026-06-30T23:59:59-03:00` | fim da janela do mes (`created_at <=`); tambem e o alvo do countdown |
| `meta_mes` | `2549892` | meta de GMV do mes (time, criterio TVD) |
| `meta_dia` | `380000` | referencia do velocimetro de GMV de hoje (opcional; vazio/0 = usa o que falta no mes) |
| `gmv_requisicoes` | `150000` | GMV de requisicoes (manual): nao cai no Supabase; soma no Realizado do mes e abate da meta (opcional; vazio/0 = ignora) |
| `poll_segundos` | `60` | intervalo de atualizacao da TV |
| `excluir_slugs` | `legado,trilogia do investidor` | slugs a IGNORAR (case-insensitive, "contem"); separados por virgula |
| `expediente_inicio` | `8` | hora cheia em que comeca o expediente (base do R$/h e do grafico hora-a-hora) |
| `expediente_fim` | `24` | hora cheia em que termina o expediente (24 = meia-noite) |
| `pmp_aliases` | `JCK:JKC` | correcoes de PMP `DE:PARA` (opcional; default `JCK:JKC`) |
| `exclude_email_domains` | `timeprimo.com` | dominios de e-mail de teste a remover (opcional) |
| `fotos_base` | `https://raw.githubusercontent.com/ANT0Ni0-R/Dashboard-Campeonato/main/assets/fotos/` | base das fotos (opcional; default no `Code.gs`) |
| `tabela` | `db_transactions_events` | tabela do Supabase (opcional) |
| `url` | `https://….supabase.co` | URL do Supabase (opcional; default no `Code.gs`) |

A primeira linha pode ser um cabecalho `chave | valor` — ele e ignorado.
Datas em ISO 8601 com fuso `-03:00` (America/Sao_Paulo).

**Importante (atribuicao dupla):**
- Os KPIs **gerais do time** (Realizado no mes, GMV de hoje, Ritmo, grafico hora-a-hora) somam
  apenas vendas do **canal TVD** (`pmp` contem "TVD").
- A **corrida / podio por pessoa** soma por **PMP cadastrado** na aba `Participantes` (qualquer canal).

## Aba `Participantes` (tres colunas: `PMP` | `Nome` | `Falta`)

| PMP | Nome | Falta |
|---|---|---|
| HMD | Henrique | 18000 |
| CCL | Camila | 22000 |
| HDZ | Diniz | 9000 |

- `Falta` = quanto falta (em R$) para o vendedor bater a meta dele. O **badge %** da corrida e
  `GMV de hoje do vendedor / Falta`. Atualize esse valor quando mudar a meta individual.
- A **foto** vem de `fotos_base + <PMP>.jpg` (PMP maiusculo + extensao `.jpg` minuscula, ex.:
  `.../fotos/HMD.jpg`); sem foto, aparecem as iniciais.

## Aba `Parcelamento` (cinco colunas: `slug_like` | `valor_min` | `valor_max` | `meses` | `fator`)

GMV Ajustado **por produto**. A venda parcelada entra no Supabase so com a 1a parcela (`price`).
A regra projeta o contrato cheio: a 1a regra cujo `slug` casa (por "contem") **e** cujo `price` cai
na faixa `[valor_min, valor_max]` vence -> GMV = `price * meses * fator`.
Sem nenhuma regra que case -> `price` inalterado (produto sem parcelamento).

O match e **normalizado**: ignora acentos, espacos, hifens e maiusculas/minusculas. Ou seja,
`Formação Consultor de IA` casa com o slug real `formacao-consultor-de-ia`. Pode preencher
`slug_like` com o nome amigavel do produto que funciona.

| slug_like | valor_min | valor_max | meses | fator |
|---|---|---|---|---|
| `formacao-x` | 0 | | 12 | 0.9 |
| `mentoria-y` | 0 | 1000 | 6 | 0.85 |

- `valor_max` vazio = sem teto.
- `fator` = provisao de reembolso da recorrencia (1 = sem desconto).
- Produtos sem parcelamento: nao precisam de linha aqui.

## Segredos (NAO ficam na planilha)

Em `Extensoes > Apps Script > Project Settings > Script Properties`:

| propriedade | valor |
|---|---|
| `SUPABASE_JWT_SECRET` | JWT Secret do projeto Supabase (assinatura HS256) |
| `SUPABASE_JWT_SUB` | uuid do seu usuario (claim `sub`) |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (header `apikey`) |
