# Arquitetura

## Visão geral

Três funis hoje vivem em bases separadas, cada uma com seu identificador de produto:

- **Deals** (Clint) → identificados por `group_name` / `product_group`.
- **Pesquisa** → identificada por `campaign` (código).
- **Vendas** (transactions) → identificada por `product_name` (substring).

A Gold liga tudo por duas chaves canônicas: `person_id` (pessoa) e `product_id` (produto).
O `product_id` vem do seed `dim_produto`, que faz o de-para dos três identificadores acima.

## DAG

```
FONTES                              SEED              INTERMEDIÁRIO        MARTS / GOLD
deal_cleaned ─┐                                                           ┌─ fct_deals ─┐
deals_history ┼─ contact_email/phone ─┐                                   │             │
transactions ─┼─ email/phone ─────────┼─► dim_person (person_id) ─────────┼─ fct_sales ─┼─► fct_funil
pesquisas ────┼─ email/phone ─────────┘                                   │             │   (grão: deal)
leads ────────┘                                                           └─ dim_survey ┘
                  dim_produto (seed) ── product_id em fct_deals/fct_sales/dim_survey ──┘
```

Diagrama renderizável em `arquitetura.mermaid` (mesma pasta do handover original).

## Grão e modelos

| Modelo | Grão | Origem | Papel |
|---|---|---|---|
| `dim_person` | 1 por pessoa | união de emails/telefones de todas as fontes | resolve `person_id` |
| `dim_produto` (seed) | 1 por produto | você mantém (CSV) | catálogo / `product_id` |
| `map_clint_produto` (seed) | 1 por regra | você mantém (CSV) | de-para Clint→produto (regra+exceção) |
| `int_deal_conversa` | 1 por `deal_id` | `stg_clint__messages` | TMR/TME por deal (janela + canal) |
| `fct_deals` | 1 por `deal_id` | `deal_cleaned` + `deals_history` | deal + `activated_at` + atribuição da ativação |
| `fct_sales` | 1 por fatura | transactions (CRM) | venda + GMV correto + atribuição do PMO |
| `dim_survey` | 1 por email+campanha | `pesquisas_compiladas` | perfil "de quem preencheu" |
| `fct_funil` | 1 por `deal_id` (deal enriquecido) | junta os marts por `person_id × product_id` | a Gold |

> **Chaves nas fontes:** cada fonte carrega as duas chaves canônicas (`person_id` +
> `product_id`) no próprio modelo `..._with_person_id` — não criamos um modelo por chave.
> Para a Clint isso já está no `int_sales_team__clint_deals_cleaned_with_person_id`.

**Por que grão de deal na Gold:** resolve a confusão "duplicação boa × ruim". Mesmo lead em
funis diferentes = várias linhas (correto). Mesmo lead com dois deals no mesmo pipeline =
dedup por regra. Duas pesquisas na mesma campanha = já tratado na fonte. Quem quiser visão
por pessoa agrega por `person_id` em cima da Gold.

## Atribuição (dupla, por etapa — não há um "dono" do funil inteiro)

- **Ativação** → dono da 1ª etapa de ativação no `deals_history` (`user_pmp` / owner).
- **Venda** → PMO da fatura na transactions: `COALESCE(seller_pmp, ARRAY_REVERSE(SPLIT(pmp,'-'))[SAFE_OFFSET(0)])`.
  - Remaps de vendedor: `BPS_UPSELLVALE*`→`BPS`, `VBP`→`VPB`, `JCK`→`JKC`.
  - HC (humano) = código de 3 letras `^[A-Za-z]{3}$`, excluindo `TVD-EXT` e o falso-positivo `TVD`.
  - IA/EXT (DIANA, MJ, VIC_IA, VENDAS_IA, THAIS*, FLUX*, WPP_AI, >3 chars, TVD-EXT) geram GMV mas **não** contam como HC.

Carregue os dois donos lado a lado no `fct_funil`; quem consome escolhe.

## Lançamento × perpétuo

- **Lançamento**: a fronteira natural do produto é a `campanha` (cluster em `mrt_grupo__leads`).
- **Perpétuo**: não há fronteira de campanha; o recorte é `product_id` + **janela de tempo**
  (`janela_inicio`/`janela_fim` no seed `dim_produto`).

## Conversas — TMR/TME (a partir de `stg_clint__messages`)

Métricas de atendimento por deal, para a Gold e modelos posteriores.

- **Fonte:** `grupo-primo-prd.staging_clint.stg_clint__messages` (9,2M linhas, **particionada por
  dia em `created_at` → sempre escopar**). Link com o deal: `messages.chat_contact_id = deals.contact_id`
  (não há `channel_id` no deal). Direção da mensagem: tem `user_email`/`user_id` = saída do atendente;
  sem = entrada do lead.
- **Grão / atribuição (decidido):** **janela do deal** — atribui ao deal as mensagens do contato
  entre `created_at` e `coalesce(won_at, lost_at, agora)`, **filtrando pelo `channel_id`**
  (`chat_channel_account_id`). Cada grupo de origem (TVD2, TVD5, …) tem seu conjunto de números/canais,
  então o canal desempata a qual deal a conversa pertence quando o contato tem vários deals.
  → precisaremos de um de-para **grupo ↔ canais** (seed ou derivado dos dados).
- **Métricas:** **TME** = tempo até a 1ª resposta do atendente após a 1ª msg do lead;
  **TMR** = média dos tempos de resposta do atendente ao longo da conversa.
- **Modelo:** `int_deal_conversa` (1 linha por `deal_id`) → entra no `fct_funil`. Carregar também
  o(s) `channel_id` no deal/Gold (útil para tabelas posteriores).
