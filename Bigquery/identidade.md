# Identidade, ativação e produto

As três decisões que sustentam a Gold. As duas primeiras (person_id e ativação) já foram
**testadas em campo** em análises anteriores — não são teoria; o build é consolidar o que já rodou.

---

## 1. `dim_person` (resolução de identidade)

### Normalização canônica (sempre antes de qualquer join)

- **Email**: `LOWER(TRIM(email))`. É a âncora primária.
- **Telefone**: tirar tudo que não é dígito; se começa com `55` e tem 12–13 dígitos, derrubar o
  DDI; tratar o **9º dígito** opcional do celular. Chave útil = DDD + últimos 8 dígitos
  (`phone_key9` / últimos 11 dígitos). O 9º dígito é armadilha conhecida e não fica 100%.

### v1 — determinística (subir primeiro)

Email normalizado como chave primária, telefone normalizado como fallback. Padrões já validados:

- melhor telefone por **frequência e depois recência**;
- features de transação por **email OR phone** via `UNION DISTINCT` (captura histórico cross-identidade);
- colapso de pesquisa por `ARRAY_AGG(... IGNORE NULLS ORDER BY createddate DESC LIMIT 1)`;
- dedup via `QUALIFY ROW_NUMBER() OVER (PARTITION BY <chave> ORDER BY ...)`.

Limitação aceita na v1: não liga "mesma pessoa, emails diferentes" via telefone em comum.

### v2 — grafo (evoluir depois, sem quebrar downstream)

Componentes conectados sobre arestas (identificadores que co-ocorrem no mesmo registro),
materializados num `cluster_id`. A chave pública continua sendo `person_id` — downstream não muda.

---

## 2. Régua de ativação (para `activated_at` no `fct_deals`)

O history é snapshot de 30 min, então um deal pode pular `Ativado`. Regra:

> **Ativado** = o deal alcançou `Ativado` **ou qualquer etapa de progressão posterior**.

Ordem do funil (referência Legado; **confirmar por produto**, FPF é mais rico):

```
Base → Ativado → Aquece 1..5 → Ativado 2 → Aquece 1..5 (2) → Não Engajou → Engajou →
Fup 1..7 → Aguardando pagamento → Fup link 1..3 → Pagamento agendado →
Pagamento recorrente → Geladeira → Venda → Contato inválido → Perdido
```

- **Contam** como ativação: `Ativado`, `Ativado 2`, `Aquece*`, `Engajou`, `Não Engajou`,
  `Fup*`, `Aguardando pagamento`, `Fup link*`, `Pagamento agendado`, `Pagamento recorrente`, `Venda`.
- **Não contam** (saída/lateral): `Base`, `Perdido`, `Contato inválido`, `Geladeira`.
- `Fechamento` fica **fora** (movimentação em massa de pipeline).
- `FUP` conta só como sinal de **ativação**, não de engajamento.

`activated_at` = `MIN(updated_stage_at)` entre as etapas de ativação do deal. Quando vem de
etapa posterior, é um **teto** (ativação real foi naquele instante ou pouco antes).

Sugestão de modelagem: um seed `dim_stage_order` (etapa, ordem, flag_ativacao, flag_engajamento)
por produto, para não hardcodar a régua em cada modelo.

---

## 3. `dim_produto` (seed) — o caminho crítico

Sem ele, o `person_id` casa as pessoas mas não garante "banana com banana" (deal do produto A
com venda do produto A). É um CSV que você mantém, **1 linha por produto**:

| coluna | exemplo | liga em |
|---|---|---|
| `product_id` | `fpf` | (chave canônica) |
| `tipo` | `lancamento` / `perpetuo` | recorte temporal |
| `group_name_pattern` | `FPF [TDV 4]` | deals (`group_name`/`product_group`) |
| `campaign_code` | `BT0002` | pesquisa (`campaign`) |
| `product_name_pattern` | `%planejador financeiro%` | transactions (`product_name`) |
| `janela_inicio` / `janela_fim` | datas | só para `perpetuo` |

Bootstrap: puxar os valores distintos de `group_name` (deals), `campaign` (pesquisa, 69) e
`product_name` (transactions) e amarrar manualmente qual linha é qual produto. É o melhor
primeiro passo do projeto.
