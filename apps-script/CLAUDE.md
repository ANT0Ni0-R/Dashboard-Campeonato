# Apps Script — Dashboard 2 (Ranking Geral)

> Contexto especifico da pasta `apps-script/`. Leia `../CLAUDE.md` para principios gerais,
> git, times e visao geral do repositorio.

---

## O que e

Apps Script Web App que serve o Ranking Geral do Lancamento. Consulta BigQuery diretamente
(sem snapshot) e renderiza um ranking com podio e fotos.

## Arquivos

| Arquivo | Papel |
|---|---|
| `Code.gs` | Backend: serve `Index.html`, consulta BigQuery, auth Supabase (fallback) |
| `Index.html` | Front completo (HTML + CSS + JS inline) |
| `README.md` | Instrucoes de setup e autenticacao |

## Como atualizar em producao

O Apps Script **nao le os arquivos do GitHub automaticamente**. Para publicar mudancas:
1. Copiar `Code.gs` e `Index.html` para o editor em `script.google.com`
2. Deploy → Gerenciar implantacoes → atualizar versao existente

## `Code.gs` — funcoes principais

- `doGet` / `include` — serve `Index.html`
- `lerConfig_` / `resolveAuthHeaders_` / `getAccessToken_` / `mintJwt_` / `setSecrets_` — auth Supabase
- `getTransactions` / `restGet_` / `parseRows_` — consulta de dados
- `diagSupabase` — diagnostico

## Query BigQuery

```sql
SELECT seller_pmp, MAX(seller_name) AS seller_name, SUM(gmv) AS gmv_total, COUNT(*) AS qtd
FROM `grupo-primo-prd.mart_sales_team.mrt_sales_team__transactions_with_sales_request`
WHERE is_refunded = false
  AND seller_pmp IS NOT NULL
  AND LENGTH(seller_pmp) = 3
  AND seller_pmp IN ('CCL','FAL',...)
  AND UPPER(product_name) LIKE UPPER('%legado%')
GROUP BY seller_pmp
ORDER BY gmv_total DESC
```

Projeto BigQuery: `grupo-primo-prd` (com hifens — sem hifens causa erro de regiao).

## Autenticacao Supabase (historico)

O Supabase ativou CAPTCHA no Auth, quebrando o login `grant_type=password`.
Correcao: usar a **secret key** (`sb_secret_...`) no header `apikey` (service_role, ignora RLS,
nao expira, nao passa por CAPTCHA). Fica so em Script Property `SUPABASE_SECRET_KEY` — nunca versionada.

Fallback em cascata no `Code.gs`:
1. `SUPABASE_SECRET_KEY` (secret key, header `apikey`)
2. `SUPABASE_ACCESS_TOKEN` (JWT longo, Bearer) + `SUPABASE_PUBLISHABLE_KEY` (apikey)
3. Login legado (quebrara com CAPTCHA ativo — apenas ultimo recurso)

## Fotos dos vendedores

Carregadas via URL raw do GitHub (`assets/fotos/`):
```
https://raw.githubusercontent.com/ant0ni0-r/dashboard-campeonato/main/assets/fotos/HUM.jpg
```
O repo precisa estar **publico** para essas URLs funcionarem sem autenticacao.

Fallback de iniciais: `.avatar img.loaded + .initials { display: none; }` — iniciais aparecem ate a foto carregar.
