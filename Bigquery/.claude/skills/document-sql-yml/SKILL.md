---
name: document-sql-yml
description: Atualiza ou cria documentação YAML de modelos dbt a partir de arquivos SQL. Adiciona colunas ausentes com descrições contextuais em pt-BR, classifica PII por coluna (policy tags) e por modelo (pii_level), sem remover entradas existentes.
argument-hint: "[sql_file_or_folder]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Document SQL → YAML

Documenta modelos dbt a partir de `$ARGUMENTS`.

`$ARGUMENTS` pode ser:
- Caminho para um único arquivo `.sql` → documentar apenas esse modelo.
- Caminho para uma pasta → buscar e documentar todos os arquivos `.sql` recursivamente.

> **Obrigatório para marts de dashboard:** todo `.sql` novo em `models/mart/dashboard/` deve ter
> seu `_<model>.yml` dedicado com a chave única recebendo `unique` + `not_null` (ver Passo 4.5).
> Esses modelos alimentam o Looker — schema sem testes quebra a confiança da camada semântica.

---

## Passo 1 — Coletar arquivos SQL

- Se `$ARGUMENTS` terminar em `.sql`, a lista alvo é esse arquivo único.
- Caso contrário, usar Glob para encontrar todos os `**/*.sql` recursivamente sob `$ARGUMENTS`.
- **Ignorar** arquivos cujo nome começa com `_` (não são modelos).

---

## Passo 2 — Para cada SQL: extrair colunas de saída

Ler o arquivo SQL e extrair os nomes das colunas do **SELECT final de saída**:

### 2.1 Identificar o SELECT de saída

1. Procurar por um CTE chamado `final`. Se existir, usar o SELECT desse CTE como fonte.
2. Se não houver CTE `final`, usar o último SELECT do arquivo.

### 2.2 Extrair nomes de colunas

- **Alias explícito**: `<expr> AS column_name` → extrair `column_name`.
- **Referência direta**: `table.column_name` ou `column_name` simples → extrair `column_name`.
- **Expressões sem alias** como `CURRENT_DATE()`, `COUNT(*)`, `COALESCE(...)` sem AS → ignorar (nome não inferível).
- **`SELECT *`** → não inventar colunas; atualizar apenas o bloco do modelo e registrar como documentação parcial no resumo.
- Remover qualquer expressão Jinja `{{ }}` do nome da coluna.
- Normalizar todos os nomes para `snake_case` minúsculo.

---

## Passo 3 — Localizar o arquivo YAML alvo

A convenção é **1 arquivo YAML por modelo SQL** (`_<model_name>.yml`).

Para cada arquivo `.sql` com nome `<model_name>.sql`:

1. **Construir o nome do YAML dedicado**: `_<model_name>.yml` na mesma pasta do SQL.
   - Ex.: `stg_ads__facebook.sql` → `_stg_ads__facebook.yml`
2. Se o arquivo dedicado **já existir** → usá-lo diretamente.
3. Se **não existir**, verificar se o modelo já está documentado num YAML compartilhado na mesma pasta (ex.: `_<source>__models.yml` ou qualquer `_*models*.yml`):
   - **Se o bloco do modelo for encontrado no YAML compartilhado**: extrair o bloco completo daquele modelo (com todas as colunas, descriptions, policy_tags, tests), criar o novo `_<model_name>.yml` com esse conteúdo, e **remover** o bloco daquele modelo do YAML compartilhado. Se após a remoção o YAML compartilhado ficar sem nenhuma entrada em `models:`, removê-lo.
   - **Se não encontrado em nenhum YAML existente**: criar novo `_<model_name>.yml` do zero.

**Estrutura mínima do YAML dedicado:**
```yaml
version: 2

models:
  - name: <model_name>
    description: ""
    columns: []
```

---

## Passo 4 — Inferir descrição do modelo

Para cada modelo cujo `description` estiver ausente ou vazio no YAML, inferir uma descrição de **1 a 2 frases em português**, objetiva e específica.

### Fontes de inferência (usar todas em conjunto)

- **Nome do modelo**: extrair entidade e domínio (ex.: `stg_mysql__grao_pension_proposals` → proposta previdenciária do Grão).
- **Source/ref do FROM principal**: identifica o sistema de origem.
- **CTEs**: os nomes dos CTEs descrevem transformações aplicadas.
- **Colunas de saída**: revelam o que o modelo expõe (ex.: presença de `balance`, `certificate_id`, `proposal_id`).
- **JOINs e filtros**: indicam enriquecimentos e regras de negócio aplicadas.

### Padrão de descrição

> `"Staging de <entidade> proveniente do <sistema de origem>. <complemento opcional sobre transformações ou filtros relevantes>."`

Exemplos:
- `"Staging de usuários da plataforma Grão, com normalização de e-mail, telefone e documento."`
- `"Staging de propostas previdenciárias do Grão, incluindo dados de regime tributário, contribuições e status de envio ao parceiro."`
- `"Staging de linhas de faturamento do Portfel, com valores brutos, ajustados e líquidos por contrato."`

### Regras

- **Proibido** usar placeholders: `TODO`, `PENDENTE`, `A definir`, descrição genérica vazia.
- Se não for possível inferir algo específico, usar o padrão mínimo: `"Staging de <entidade> do sistema <source>."`
- **Nunca sobrescrever** descrição de modelo que já esteja preenchida.

---

## Passo 4.5 — Identificar ou criar coluna de ID único e aplicar testes

**Objetivo:** Garantir que todo modelo tenha exatamente uma coluna identificada como chave única, com testes `unique` e `not_null` declarados no YAML.

### 4.5.1 — Detectar coluna de ID único natural

Varrer as colunas extraídas do SELECT final (Passo 2) na seguinte ordem de prioridade. **Primeira correspondência vence:**

| Prioridade | Critério | Ação |
|---|---|---|
| 1 | Coluna chamada `uid` (já é surrogate key via `generate_surrogate_key`) | Usar `uid` como chave única → ir para 4.5.3 |
| 2 | Coluna cujo nome é `<entity>_id` onde `<entity>` corresponde à entidade do modelo (ex: `transaction_id` em `stg_*__transactions`, `contact_id` em `stg_*__contacts`) | Usar essa coluna → ir para 4.5.3 |
| 3 | Existe **exatamente uma** coluna terminando em `_id` dentro do grupo `-- ids` do SELECT | Usar essa coluna → ir para 4.5.3 |
| 4 | Nenhuma das anteriores | Ir para 4.5.2 (gerar surrogate key) |

**Regra obrigatória:** nunca renomear uma coluna existente para `uid`. Se o ID natural existe com nome próprio (ex: `transaction_id`), mantê-lo com esse nome.

### 4.5.2 — Quando não há ID único natural: inferir grain e gerar surrogate key

1. **Inferir o grain** analisando o SQL (nessa ordem de prioridade):
   - Colunas no `PARTITION BY` de cláusulas `QUALIFY` — são as colunas que definem unicidade na deduplicação.
   - Colunas no `GROUP BY` do SELECT final ou de CTEs chave.
   - Combinação semanticamente natural: `customer_document` + campos de data + campos de ativo/produto/entidade.

2. **Modificar o arquivo SQL**: adicionar `{{ dbt_utils.generate_surrogate_key([...]) }} AS uid` como **primeira coluna** do CTE `final` (ou do último SELECT), logo abaixo do comentário `-- ids`. Usar Edit com diff mínimo — nunca reescrever o bloco inteiro.

   ```sql
   -- ids
   {{ dbt_utils.generate_surrogate_key(['col_a', 'col_b', 'col_c']) }} AS uid
   ```

3. A coluna `uid` passa a ser o ID único do modelo → ir para 4.5.3.

### 4.5.3 — Aplicar testes `unique` e `not_null` no YAML

Na coluna identificada (natural ou `uid`), garantir no YAML:

```yaml
- name: transaction_id   # ou uid
  description: "..."
  tests:
    - unique
    - not_null
```

**Regras de preservação:**
- Se a coluna **já tem ambos** os testes no YAML → não duplicar, não alterar.
- Se tem apenas um dos dois → adicionar o que falta.
- Nunca remover testes existentes em nenhuma coluna.

---

## Passo 5 — Inferir descrições contextuais de colunas

Para cada coluna nova (ausente no YAML), inferir uma descrição **curta, objetiva, em português**, específica da entidade/evento com base em:

- **Nome da coluna** (sufixo/prefixo como guia de tipo):
  - Termina com `_id` ou começa com `id_` → `"Identificador do(a) <entidade inferida do nome do modelo>."`
  - Termina com `_at`, `_date`, `_ts`, `_em` → `"Data/hora de <evento inferido do nome da coluna>."`
  - Começa com `is_`, `has_`, `was_`, `flag_` → `"Indica se <condição inferida do nome da coluna>."`
  - Começa com `nr_`, `qty_`, `num_` ou termina com `_count`, `_qty`, `_amount`, `_valor` → `"Quantidade/valor de <métrica inferida>."`
  - Nome igual a `created_at` / `updated_at` / `deleted_at` → descrições padrão: `"Data de criação do registro."` / `"Data da última atualização do registro."` / `"Data de exclusão do registro."`.

- **Nome do modelo** (entidade principal, ex.: `stg_hubspot__contacts` → entidade é `contato`).
- **Conteúdo do SQL**: ler expressões, JOINs e CTEs para entender o contexto da coluna.
- **Nomes de colunas vizinhas** para inferir o domínio.

### Regras de qualidade das descrições

- **Proibido** usar placeholders: `TODO`, `PENDENTE`, `A definir`, `Campo X`, descrição genérica vazia ou similar.
- Sempre específicas: mencionar a entidade ou evento ao qual a coluna se refere.
- Curtas: máximo de 1 frase objetiva.
- Em português do Brasil.
- Meta: **100% das colunas processadas com descrição não vazia e específica**.

---

## Passo 5.5 — Classificar colunas PII e atribuir Policy Tags

### 5.5.0 Pré-condição: PII só em `materialized = table`

Ler o `materialized` no `config()` do `.sql`. Se for `view`, **pular o Passo 5.5 inteiro** — views não recebem `policy_tags` (não persistem dados, não há superfície de PII a proteger). Só modelos `materialized = table` são classificados aqui.

### 5.5.1 Determinar o domínio da entidade do modelo

Antes de classificar colunas, identificar a qual domínio o modelo pertence. Usar o **nome do modelo** e o **contexto do SQL** (sources, CTEs, JOINs) para inferir:

| Sinais no nome/source/SQL | Domínio |
|---|---|
| `client`, `cliente`, `lead`, `prospect`, `customer`, `user`, `usuario`, `conta_cliente`, `account` (contexto de cliente pessoa física) | **cliente** |
| `consultor`, `advisor`, `planejador`, `planner`, `assessor`, `banker`, `agente` | **consultor** |
| `colaborador`, `employee`, `funcionario`, `rh`, `hr`, `people`, `folha` | **colaborador** |

Se o modelo mistura entidades (ex: fato que junta cliente + consultor), classificar **cada coluna individualmente** usando o prefixo/sufixo da coluna e o contexto do CTE/JOIN de onde ela vem.

### 5.5.2 Classificação de colunas por nome (regras estáticas)

Aplicar as regras abaixo **na ordem listada** (primeira correspondência vence). Os padrões são case-insensitive e usam match parcial (contém):

```
PRIORIDADE 1 — Documento / Identificação pessoal
  Padrão: cpf, cnpj, rg, passport, documento, document_number, tax_id, ssn
  → Domínio cliente:    PII_DOCUMENTO_CLIENTE
  → Domínio consultor:  PII_DOCUMENTO_CONSULTOR

PRIORIDADE 2 — Dados bancários
  Padrão: agencia, conta_corrente, bank_account, account_number, routing, iban, pix_key, chave_pix, dados_bancarios
  → PII_DADOS_BANCARIOS_CLIENTE (sempre cliente — consultor não tem essa tag)

PRIORIDADE 3 — Renda / Salário
  Padrão: renda, income, salary, salario, wage, faixa_salarial, income_range
  → Domínio cliente:    PII_RENDA_CLIENTE
  → Domínio consultor:  PII_REMUNERACAO_CONSULTOR

PRIORIDADE 4 — Patrimônio / Investimentos
  Padrão: patrimonio, net_worth, wealth, investment_total, aum, assets_under, balance (quando em contexto financeiro pessoal), saldo_investido, volume_investido
  → PII_PATRIMONIO_CLIENTE (sempre cliente)

PRIORIDADE 5 — Remuneração (comissão, bônus — específico de consultor/colaborador)
  Padrão: comissao, commission, bonus, bonificacao, remuneracao, compensation
  → Domínio consultor:  PII_REMUNERACAO_CONSULTOR

PRIORIDADE 6 — Endereço
  Padrão: endereco, address, logradouro, street, bairro, neighborhood, cidade, city, estado, state, cep, zip_code, zip, postal, complemento, numero_residencia
  → PII_ENDERECO_CLIENTE (sempre cliente — consultor/colaborador não têm essa tag)

PRIORIDADE 7 — Contato (email, telefone)
  Padrão: email, e_mail, phone, telefone, celular, mobile, whatsapp, sms
  → Domínio cliente:    PII_CONTATO_CLIENTE
  → Domínio consultor:  PII_CONTATO_CONSULTOR

PRIORIDADE 8 — Nome
  Padrão: nome, name, first_name, last_name, sobrenome, full_name, nome_completo, razao_social
  → Domínio cliente:    PII_NOME_CLIENTE
  → Domínio consultor:  PII_NOME_CONSULTOR
```

Todas as referências acima (ex: `PII_DOCUMENTO_CLIENTE`) correspondem ao nome da variável dbt. No YAML, sempre escrever como `'{{ var("PII_DOCUMENTO_CLIENTE") }}'`.

**Variáveis de Policy Tags disponíveis** (já configuradas no `dbt_project.yml`):

```
# Dados financeiros do cliente
PII_DADOS_BANCARIOS_CLIENTE
PII_PATRIMONIO_CLIENTE
PII_RENDA_CLIENTE

# Dados pessoais do cliente
PII_CONTATO_CLIENTE
PII_DOCUMENTO_CLIENTE
PII_ENDERECO_CLIENTE
PII_NOME_CLIENTE

# Dados do consultor/planejador
PII_CONTATO_CONSULTOR
PII_DOCUMENTO_CONSULTOR
PII_NOME_CONSULTOR
PII_REMUNERACAO_CONSULTOR
```

**Exceções — NÃO classificar como PII:**
- Colunas que terminam com `_id`, `_key`, `_sk`, `_pk` (são surrogate keys, não dados pessoais).
- Colunas como `segment`, `status`, `type`, `category`, `tier`, `certification`, `cpa`, `cea` (são atributos categóricos, não PII).
- Colunas de data/hora (`_at`, `_date`, `_ts`, `created`, `updated`, `deleted`).
- Colunas de flag (`is_`, `has_`, `was_`, `flag_`).
- Colunas com `city_name`, `state_name` quando claramente se referem a dimensões geográficas genéricas (não endereço pessoal). Para desambiguar, verificar se o modelo é sobre a entidade cliente/pessoa ou sobre geografia.

**Uso dos grupos de colunas do SQL:**
- Colunas sob `-- ids` são identificadores — **nunca** recebem policy tag.
- Colunas sob `-- datas` são timestamps/datas — **nunca** recebem policy tag.
- Colunas sob `-- dimensoes` são atributos — **podem** conter PII (ex: `nome_cliente`, `email`). Aplicar as regras normalmente.
- Colunas sob `-- medidas` são métricas numéricas — **podem** conter PII financeiro (ex: `patrimonio`, `renda`). Aplicar as regras normalmente.
- Se o SQL não seguir essa convenção de agrupamento, classificar normalmente pelo nome da coluna.

### 5.5.3 Desambiguação com sample query (quando necessário)

Se a classificação estática deixar dúvida — por exemplo, uma coluna chamada `name` em um modelo que mistura entidades, ou `balance` que pode ser saldo de conta ou saldo de investimento — rodar **uma única query de sample** para resolver:

```sql
SELECT <coluna_duvidosa>
FROM `<project>.<dataset>.<table>`
TABLESAMPLE SYSTEM (5 PERCENT)
LIMIT 100
```

**Regras de eficiência para queries:**
- Agrupar **todas** as colunas duvidosas de um mesmo modelo em **uma única query** com todas as colunas no SELECT.
- Rodar no máximo **1 query por modelo** (não por coluna).
- Só rodar query se houver ambiguidade real. Se o nome do modelo + nome da coluna já são suficientes, não rodar.
- Usar `TABLESAMPLE SYSTEM (5 PERCENT) LIMIT 100` sempre. O `TABLESAMPLE` faz o BigQuery escanear apenas uma fração dos blocos da tabela (menor custo de processamento), enquanto `LIMIT 100` garante uma amostra maior e mais representativa para classificação PII confiável.
- Para identificar o dataset/tabela no BigQuery, consultar o `target` do modelo no `dbt_project.yml` ou no `profiles.yml`, ou inferir do padrão de pastas.

**Critérios de decisão a partir do sample:**
- Coluna `name` com valores tipo "João Silva" → PII_NOME. Se parecer nome de empresa → provavelmente não é PII pessoal (ou usar `razao_social` → PII_NOME_CLIENTE se for lead PJ).
- Coluna `balance` com valores monetários altos e modelo é de cliente → PII_PATRIMONIO_CLIENTE.
- Coluna `email` com domínio `@grupoprimo.com.br` → é colaborador/consultor, não cliente.
- Coluna `phone` com formato +55 → não ajuda a desambiguar, usar contexto do modelo.

### 5.5.4 Output da classificação

Para cada coluna classificada como PII, registrar a policy tag a ser aplicada. Colunas não-PII não recebem tag.

---

## Passo 5.6 — Classificar `pii_level` do modelo

> **Só `materialized = table`.** Modelos `materialized = view` não recebem `pii_level` explícito via esta skill — o `meta` fica como está (ex.: só `{'owner'}`). Pular o Passo 5.6 para views.

Além das policy tags por coluna (Passo 5.5), cada modelo recebe um **`pii_level`** a nível de modelo. Esse valor é registrado **no bloco `config()` do arquivo `.sql`**, dentro da chave `meta` — **não no YAML**. Serve como:
- Documentação interna rápida da sensibilidade do modelo.
- Input para a estratégia de Policy Tags em escopo mais amplo (datasets, dashboards, exports).

### 5.6.1 Convenção de níveis

| Nível | Descrição | Quem pode ver |
|---|---|---|
| `critico` | Dados de RH (colaborador) | grp-pii-full + grp-rh |
| `alto` | Dados pessoais **+** financeiros do cliente/lead (nome/CPF/email **E** renda/patrimônio) | grp-pii-full |
| `medio` | Dados pessoais do cliente/lead (sem financeiro) **OU** financeiros do cliente (sem pessoais) | grp-pii-full + grp-crm-vendas |
| `baixo` | Dados pessoais do consultor/planejador | grp-pii-full + grp-operacoes |
| `nenhum` | Sem dados pessoais | todos com acesso ao dataset |

### 5.6.2 Regras de classificação (na ordem)

Avaliar na ordem; primeira correspondência vence. Usar o domínio inferido em 5.5.1 e o conjunto de policy tags atribuídas em 5.5.2:

1. **Domínio = colaborador** (RH/funcionário/folha) → `critico`.
2. **Domínio = cliente** com **pelo menos uma** tag pessoal (`PII_NOME_CLIENTE`, `PII_DOCUMENTO_CLIENTE`, `PII_CONTATO_CLIENTE`, `PII_ENDERECO_CLIENTE`) **E pelo menos uma** tag financeira (`PII_RENDA_CLIENTE`, `PII_PATRIMONIO_CLIENTE`, `PII_DADOS_BANCARIOS_CLIENTE`) → `alto`.
3. **Domínio = cliente** com tags **apenas** pessoais **OU apenas** financeiras → `medio`.
4. **Domínio = consultor** com qualquer tag de consultor (`PII_NOME_CONSULTOR`, `PII_DOCUMENTO_CONSULTOR`, `PII_CONTATO_CONSULTOR`, `PII_REMUNERACAO_CONSULTOR`) → `baixo`.
5. Nenhuma policy tag aplicada em nenhuma coluna → `nenhum`.

Modelos que misturam entidades (ex.: fato cliente + consultor): classificar pelo nível **mais alto** entre os domínios presentes.

### 5.6.3 Defaults vs. classificação explícita

O `dbt_project.yml` define defaults por camada:
- `staging/` → default `pii_level: medio`.
- `intermediate/` → default `pii_level: medio`.
- `marts/` → **sem default**: cada modelo precisa declarar.

Regras de quando declarar explicitamente:
- **Views (`materialized = view`)**: não declarar `pii_level` — pular (regra do topo do Passo 5.6). Vale para staging/intermediate views e views de consumo `rpt_*`.
- **Marts**: sempre declarar `pii_level` (não há default).
- **Staging / Intermediate (apenas `materialized = table`)**: declarar quando o nível inferido **diverge** do default `medio` (ex.: `nenhum`, `alto`, `critico`, `baixo`). Quando o inferido for `medio`, é opcional — pode omitir e herdar do default.
- Em caso de dúvida, **declarar explicitamente**: redundância > omissão.

### 5.6.4 Aplicar `pii_level` no arquivo SQL

Com o nível inferido em mãos, ler o bloco `config()` do arquivo `.sql` e aplicar a seguinte lógica:

1. **`pii_level` ausente no SQL** → adicionar `'pii_level': '<nivel>'` dentro da chave `meta` do `config()`.
2. **`pii_level` presente no SQL e igual ao inferido** → nenhuma alteração no SQL.
3. **`pii_level` presente no SQL e diferente do inferido** → substituir o valor existente pelo inferido. Registrar a divergência no resumo final (Passo 8): valor anterior, valor novo e o motivo da reclassificação.

**Formato esperado no SQL** (exemplo):
```sql
{{
    config(
        materialized = "table",
        meta = {'owner': 'fulano', 'maturity': 'maturidade da base', 'pii_level': 'alto'},
        ...
    )
}}
```

Se o `config()` já tiver uma chave `meta` com outros campos (`owner`, `maturity`, etc.), preservar todos e apenas adicionar/atualizar `pii_level`. Usar Edit com diff mínimo — nunca reescrever o bloco config() inteiro.

---

## Passo 5.7 — Detectar e tratar colunas órfãs (no YAML mas ausentes do SQL)

Após extrair as colunas do SQL (Passo 2) e antes de aplicar o merge (Passo 6), comparar o conjunto de colunas do YAML existente com o conjunto de colunas extraídas do SQL. Toda coluna que aparece **no YAML mas não no SQL** é uma **coluna órfã** e merece tratamento.

### 5.7.1 Por que isso importa

Refatorações renomeiam/removem colunas no SQL, mas YAMLs antigos retêm as entradas obsoletas. Quando essas entradas têm `tests:` declarados (`not_null`, `unique`, `accepted_values`, etc.), o `dbt build` **falha** com `Database Error: Unrecognized name: <coluna>`. Mesmo sem tests, ficam descrições mentindo sobre o schema, poluindo o YAML.

Padrões comuns de renames pré → pós-refator no projeto Grupo Primo:

| nome antigo (YAML legado) | nome canônico novo (SQL atual) |
|---|---|
| `cpf_cnpj`, `cpf_cnpj_hash`, `client_cpf`, `user_document` | `customer_document` |
| `cblc`, `cliente_id`, `user_id` (em alguns) | `customer_code` |
| `id_global_usuario` | `customer_global_id` |
| `aum_date`, `position_date` (em alguns) | `auc_date` |
| `_python_synced` | `sync_at` |
| `valor` | `auc_value` |

### 5.7.2 Classificação automática das órfãs

Para cada coluna órfã (no YAML, ausente no SQL), classificar em uma de 3 categorias:

#### A) Rename evidente — REMOVER automaticamente

Critério: existe um nome canônico no SQL atual que casa com o padrão da tabela acima OU o domain do modelo (cliente/consultor) sugere correspondência clara.

Exemplos:
- YAML tem `cpf_cnpj` (com ou sem tests) + SQL tem `customer_document` → remover `cpf_cnpj`
- YAML tem `aum_date` + SQL tem `auc_date` → remover `aum_date`
- YAML tem `_python_synced` + SQL tem `sync_at` → remover `_python_synced`

#### B) Coluna obsoleta sem equivalente — REMOVER automaticamente

Critério: a coluna não tem tests, não tem policy_tag, e não há padrão de rename. É apenas resquício de SQL antigo.

Exemplos:
- YAML tem `row_num` mas SQL não usa mais (foi consolidado em outro modelo) → remover

#### C) Dúvida (alerta para revisão manual)

Critério: a coluna no YAML tem **`tests:` definidos** (especialmente `unique`, `not_null` em colunas chave) **ou `policy_tags:` que indicam PII** **e não há padrão claro de rename na tabela 5.7.1**.

Nesse caso, **NÃO remover** automaticamente. Listar no resumo final do Passo 8 com a indicação:

```
⚠️ Coluna `<nome>` no YAML do modelo `<model>` não está no SQL atual.
   Tem tests/policy_tags significativos. Possíveis causas:
   - Coluna foi removida do SQL incorretamente — restaurar no SQL.
   - Coluna foi renomeada mas não há padrão evidente — atualizar o nome no YAML.
   - Coluna foi removida intencionalmente — remover do YAML manualmente.
```

### 5.7.3 Aplicação

Aplicar a remoção das categorias **A** e **B** automaticamente no Passo 6 (junto com as outras mudanças de merge). Para a categoria **C**, registrar no resumo final mas **não modificar** o YAML.

**Regras de proteção:**
- Aplicar apenas em modelos sob `models/bigquery/staging/brokers_refactored/`, `models/bigquery/intermediate/<bu>/brokers_refactored/` e similares (escopo de refator). **Não aplicar** em models legados sem refator.
- Se o YAML inteiro estiver sendo criado novo, não há órfãs.
- Se a remoção deixaria o modelo com `columns: []` vazio, manter ao menos a estrutura mínima (preservar `name`, `description`, `config`).

---

## Passo 6 — Aplicar merge no YAML

Ler o YAML existente (se existir). Aplicar as seguintes regras:

### Estrutura YAML esperada

```yaml
version: 2

models:
  - name: <model_name>
    description: ""
    columns:
      - name: <column_name>
        description: "<descrição>"
        policy_tags:
          - '{{ var("PII_<TAG>") }}'   # quando aplicável
```

> O `pii_level` **não vai no YAML** — vai no `config()` do arquivo `.sql` (ver Passo 5.6.4).

### Regras de merge (obrigatórias)

1. **`version: 2`** deve estar presente no topo. Adicionar se ausente.
2. **Bloco do modelo**: se um modelo com `name: <model_name>` já existir, **não duplicar**. Trabalhar dentro do bloco existente.
3. **Descrição do modelo**: se já houver descrição não vazia, **preservar**. Se ausente ou vazia, deixar como `""` — não fabricar descrição de modelo.
4. **Colunas existentes com descrição**: **nunca sobrescrever** descrição não vazia. **Remoção é permitida apenas para colunas órfãs categorias A e B do Passo 5.7** (coluna no YAML mas ausente do SQL atual, com rename evidente ou sem tests/policy_tags).
4a. **Colunas órfãs categoria C** (Passo 5.7 — com tests/policy_tags significativos sem padrão de rename): **NUNCA remover automaticamente**. Listar no resumo final (Passo 8) para revisão manual com a flag `⚠️ Coluna possivelmente removida do SQL por engano`.
5. **Colunas existentes sem descrição**: se uma coluna já estiver no YAML mas com descrição vazia, **preencher** com a descrição inferida.
6. **Colunas ausentes**: para cada coluna presente no SQL e ausente no YAML, **adicionar ao final** da lista `columns` com a descrição inferida.
7. **Ordem**: colunas existentes mantêm sua posição. Novas colunas são inseridas após a última coluna existente do modelo.
8. **Não reordenar** modelos nem colunas existentes.
9. **Arquivos `.sql`**: alterar **apenas** a chave `pii_level` dentro do bloco `config()` (ver Passo 5.6.4). Nunca alterar nenhuma outra parte do SQL.
10. **Policy tags (nova coluna PII)**: para cada coluna que recebeu policy tag no Passo 5.5, adicionar o bloco `policy_tags` no YAML:
    ```yaml
    - name: customer_email
      description: "Email principal do cliente."
      policy_tags:
        - '{{ var("PII_CONTATO_CLIENTE") }}'
    ```
11. **Preservar policy tags existentes**: se a coluna já existir no YAML **e já tiver `policy_tags` preenchido**, **não sobrescrever**. Preservar a tag existente.
12. **Adicionar policy tags a colunas existentes**: se a coluna já existir no YAML **sem `policy_tags`** e a classificação identificou uma tag, **adicionar** o bloco `policy_tags` à coluna existente.
13. **`pii_level` no YAML**: **não adicionar**. O pii_level é gerenciado exclusivamente no `.sql` (Passo 5.6.4). Se o YAML já tiver um bloco `config.meta.pii_level` de execuções anteriores da skill, **não remover** — registrar no resumo para remoção manual.

---

## Passo 7 — Escrever as alterações

### 7.1 — Arquivo YAML

- **Arquivo existente**: usar Edit para aplicar apenas as mudanças necessárias (diff mínimo).
- **Arquivo novo**: usar Write com o conteúdo YAML completo.
- Indentação: **2 espaços**, sem tabs.
- Validar que o YAML é sintaticamente correto antes de escrever.

### 7.2 — Arquivo SQL (pii_level e surrogate key)

Dois tipos de alteração permitidos no SQL:

**a) `pii_level`** (Passo 5.6.4): usar Edit com diff mínimo, substituindo apenas o valor de `pii_level` dentro do bloco `meta` do `config()`. Nunca reescrever o bloco config() inteiro.

**b) Surrogate key `uid`** (Passo 4.5.2): usar Edit com diff mínimo para inserir a linha `{{ dbt_utils.generate_surrogate_key([...]) }} AS uid` como primeira coluna do CTE `final` (ou último SELECT), imediatamente após o comentário `-- ids`. Se o comentário `-- ids` não existir, inserir antes da primeira coluna do SELECT final. Nunca alterar nenhuma outra linha do arquivo `.sql`.

Registrar no resumo final (Passo 8) toda alteração feita no SQL: tipo (pii_level / surrogate key), modelo, valor anterior e valor novo.

---

## Passo 8 — Resumo final

Após processar todos os arquivos, imprimir a tabela:

```
## Resumo

| SQL file | YAML file | Action YAML | Models | Colunas adicionadas | Colunas descritas | Policy tags aplicadas | pii_level | Testes aplicados | uid gerado | Queries de sample |
|----------|-----------|-------------|--------|---------------------|-------------------|-----------------------|-----------|------------------|------------|-------------------|
| stg_hubspot__contacts.sql | _stg_hubspot__contacts.yml | created (migrado de _hubspot__models.yml) | 1 | 3 | 3 | 2 | medio (default) | contact_id (unique+not_null) | não | 0 |
| stg_hubspot__deals.sql    | _stg_hubspot__deals.yml | created | 1 | 12 | 12 | 1 | alto (declarado) | uid (unique+not_null) | sim: ['deal_id','stage_id','close_date'] | 1 |
| dim_colaboradores.sql     | _dim_colaboradores.yml | updated | 1 | 4 | 4 | 0 | critico (declarado) | employee_id (unique+not_null) | não | 0 |

Total: 3 arquivos SQL processados · 3 modelos documentados · 19 colunas adicionadas · 19 colunas descritas · 3 policy tags aplicadas · 2 pii_level declarados · 3 testes aplicados · 1 uid gerado · 1 query de sample
```

- Listar explicitamente casos com `SELECT *` como **documentação parcial** (modelo atualizado, colunas não extraídas).
- Indicar se algum arquivo YAML teve erro de sintaxe e foi pulado.
- Listar colunas que ficaram **sem tag por ambiguidade não resolvida** (se houver), para revisão manual.
- Listar alterações de `pii_level` no SQL: modelo, valor anterior e valor novo.
- Listar divergências de `pii_level` onde o SQL já tinha um valor diferente do inferido e foi atualizado automaticamente.
- Listar queries de sample executadas (quantas e em quais modelos).
- Listar **colunas órfãs removidas automaticamente** (categorias A e B do Passo 5.7) — quantas por modelo, com nomes.
- ⚠️ **Listar colunas órfãs categoria C — alertas para revisão manual** (Passo 5.7): cada coluna no YAML que tem tests/policy_tags significativos mas não está no SQL atual e não tem rename evidente. Indicar o modelo, nome da coluna, e tests/policy_tags que ela tem. Sugerir possíveis causas (rename não-óbvio, removida do SQL por engano, removida intencionalmente).
- Listar **YAMLs migrados** (modelo extraído de YAML compartilhado para arquivo dedicado): nome do modelo, YAML de origem, YAML de destino.
- Listar **surrogate keys geradas** (Passo 4.5.2): modelo, colunas usadas na chave, se o YAML compartilhado foi esvaziado/removido.
- Listar **testes aplicados** (Passo 4.5.3): modelo, nome da coluna, tipo (natural ou uid).

---

## Regras de segurança

- **Arquivos SQL**: são permitidas apenas duas alterações: (1) a chave `pii_level` dentro do bloco `config()` (Passo 5.6.4) e (2) a inserção de `{{ dbt_utils.generate_surrogate_key([...]) }} AS uid` quando nenhum ID único natural for encontrado (Passo 4.5.2). Qualquer outra alteração no SQL é proibida.
- **Remoção de colunas no YAML é permitida APENAS para colunas órfãs categorias A e B do Passo 5.7** (rename evidente OU sem tests/policy_tags). Caso C **nunca remover** — sinalizar no resumo.
- **Nunca remover** entradas de modelo, `config`, `meta` ou `policy_tags` de colunas vivas (que ainda existem no SQL).
- **Nunca sobrescrever descrições não vazias.**
- **Nunca sobrescrever `policy_tags` existentes.**
- **`pii_level` no YAML**: não adicionar em novas execuções. Se já existir de execuções anteriores, não remover — registrar no resumo para remoção manual.
- **Nunca usar placeholders genéricos** como descrição de coluna.
- Se um arquivo YAML tiver erros de sintaxe que impeçam merge seguro, reportar o erro e pular o arquivo — não sobrescrever.
