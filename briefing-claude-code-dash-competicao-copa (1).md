---
titulo: Briefing — Dashboard de Competição "Copa" (para Claude Code)
status: a-verificar
origem: misto
fonte: conversa Antonio + Claude (08-10/06/2026)
projeto: Dashboard TV Vendas
tipo: briefing-de-tarefa
---

# Briefing — Dashboard de Competição "Copa"

> [!important] Como usar este briefing
> Documento para entregar ao **Claude Code**. Antes de entregar, preencher todos os campos `[A DEFINIR]`. Os blocos `[CONFIRMADO]` já estão decididos e **não devem ser reinterpretados**. Itens marcados `[NÃO ENCONTRADO: ...]` são lacunas conhecidas — o dash deve tratá-las de forma parametrizável, não chutar valores.

## 1. Objetivo

Construir **um dashboard HTML de competição de vendas** para exibir em TV (notebook → HDMI), temática Copa do Mundo. Substitui o Metabase para esse caso, dando controle total de layout. **KPI único: GMV por vendedor.**

## 2. Princípio de arquitetura (não negociável)

**Dashboard burro + `config.js`.** O dash não conhece a competição: lê um arquivo de configuração e renderiza. Trocar de produto = **editar `config.js` + refresh**, nunca mexer no código. A **virada de fase é automática** (derivada do relógio vs. janelas do config — ver §5.1), então não exige intervenção no fim de semana.

- **UM chaveamento (bracket) único, sempre completo na tela**, orientação **vertical** (de cima para baixo). A **fase ativa** (derivada do relógio) controla o **zoom/destaque** na fase em questão — **não** troca de tela. O bracket inteiro fica visível; a fase ativa recebe enquadramento maior e destaque.
- O **código do vendedor** (`seller_code` / PMP) **aparece na tela** junto do card (decisão do Antonio — ver §11), mas continua sendo a chave técnica que casa GMV ao card.
- Slug do produto, régua de GMV e **janela de tempo de cada fase** são **parâmetros do config**, não hardcoded.

## 3. Fonte de dados — Supabase

- **Tabela:** `db_transactions_events`
- **Acesso:** REST/PostgREST do Supabase, com `anon key` (já obtida). URL do projeto: `[A DEFINIR]`
- **Sem Realtime necessário** (ver §6): polling simples a cada **60s** relendo as linhas das janelas relevantes.

### Regras de cálculo (seguir à risca — vêm do dado real)

```
1. Filtrar type = 'order_success'        (descarta cart_abandoned, period_upserted,
                                           order_refunded, order_canceled, order_pending)
2. Filtrar slug do produto               (parâmetro do config — ver §4)
3. Filtrar created_at na JANELA DA FASE   (timezone America/Sao_Paulo; ver §5 — GMV zera por fase)
4. seller_code = último segmento do pmp  → split_part(pmp, '-', -1)
   Vendedor válido SOMENTE se LENGTH(seller_code) = 3
5. GMV por linha = régua sobre price     (parâmetro do config — ver §4)
6. GMV do vendedor = soma das linhas; ordenar desc
```

> [!warning] O recorte de data NÃO é "hoje"
> O GMV **zera por fase** (§5). Cada fase tem uma janela própria (`inicio`/`fim`) declarada no config. A query soma `created_at` dentro dessa janela — não usa `= hoje`. Enquanto a janela está aberta (ex.: grupos durante terça), o card mostra o **parcial ao vivo** acumulado na janela.

> [!warning] Não usar a coluna `gmv` da tabela
> Ela vem nula na quase totalidade das linhas. O GMV é **calculado a partir de `price`** pela régua.

### Régua de GMV (FPF — teste)

```
price < 1000  → price * 12
price < 2000  → price * 4
senão         → price
```

> [!decision] Onde fazer a transformação [CONFIRMADO]
> Régua + filtro de 3 chars + soma por vendedor + avanço de fase: tudo no **front (JS)** sobre as linhas `order_success`. Supabase fica **só-leitura**, sem view nem objeto novo (decisão Antonio).

## 4. Parametrização de produto (config)

| Momento | Produto | Slug (filtro) | Régua |
|---|---|---|---|
| Teste (antes de terça) | FPF | `%FORMAÇÃO DE PLANEJADOR FINANCEIRO%` | ×12 / ×4 / price |
| Produção (terça) | Legado | `[A DEFINIR]` | `[A DEFINIR — por ora usa a do FPF]` |

O dash deve ler slug e régua do config, de modo que a virada teste→produção seja só edição de arquivo.

## 5. Formato da competição

> [!info] Estrutura geral
> Chaveamento (mata-mata) com fase de grupos + repescagem na entrada. Total de vendedores: **11 closers**, distribuídos em **4 grupos (3+3+3+2)**.

> [!note] Roster confirmado [CONFIRMADO]
> 11 closers. `seller_code` = últimos 3 chars do PMP (todos têm 3 letras → casam direto).
>
> | Closer | PMP (`seller_code`) | Grupo |
> |---|---|---|
> | Camila | CCL | A |
> | Fernando | FAL | A |
> | Monica | MDR | A |
> | Diniz | HDZ | B |
> | Harry | HLM | B |
> | Thayna | THS | B |
> | Enzo | EZB | C |
> | Henrique | HMD | C |
> | João Pedro | JPP | C |
> | Hudson | HUM | D |
> | Jackson | JKC | D |
>
> Grupos definidos por distribuição neutra (sem GMV histórico). Conferência de avanço: A+B+C avançam 2 cada (6) + D avança 1 = **7 diretos** + 1 repescagem = **8 nas quartas**. ✔

### 5.1 Ordem de entrada e pareamento (determinístico) [CONFIRMADO]

> [!important] Regra de pareamento: cruzado entre grupos vizinhos
> O bracket flui vertical (de cima para baixo). Para não cruzar linhas longas **e** não pôr dois do mesmo grupo no mesmo confronto, o pareamento das quartas é **cruzado entre grupos vizinhos** (A↔B e C↔D). O lado C/D foi **invertido** por decisão do Antonio.

**Ordem de entrada dos 8 classificados** (sequência vertical do bracket):
`1ºA, 2ºA, 1ºB, 2ºB, 1ºC, 2ºC, 1ºD, REP`
(REP = o único que sobe da repescagem.)

**Quartas — 4 confrontos (8 → 4):**
```
QF1: 1ºA × 2ºB
QF2: 1ºB × 2ºA
QF3: 1ºC × 1ºD
QF4: REP  × 2ºC
```
- A↔B: cruzado padrão (1º de um × 2º do outro).
- C↔D: invertido — como D só classifica 1 (1ºD), o par C/D usa {1ºC, 2ºC, 1ºD, REP}. Montagem: `1ºC × 1ºD` e `REP × 2ºC`.

**Semis — vencedores vizinhos (4 → 2):**
```
SF1: vencedor(QF1) × vencedor(QF2)
SF2: vencedor(QF3) × vencedor(QF4)
```

**Final (2 → 1):**
```
F: vencedor(SF1) × vencedor(SF2)
```

> [!note] Avanço automático — sem estado persistido [CONFIRMADO]
> O Antonio **não estará no escritório sáb/dom**. O dash deve virar de fase e montar os confrontos **sozinho**, sem ninguém editar o config no fim de semana.
> - `fase_ativa` deixa de ser manual: é **derivada do relógio** (`America/Sao_Paulo`) comparado às janelas `inicio`/`fim` de cada fase.
> - A cada poll, o dash **recalcula do zero** a partir das linhas do Supabase: para cada fase já encerrada, soma o GMV da janela daquela fase, decide os vencedores e **semeia** a fase seguinte pela regra de pareamento acima. Determinístico → não precisa salvar estado em lugar nenhum.
> - Seguro porque `order_success.created_at` é real: janela encerrada não recebe linha nova depois do horário, então o resultado congelado é estável entre refreshes.
> - Consequência para o config: os arrays `confrontos` **não precisam ser escritos à mão** — o dash os deriva. Mantê-los no modelo apenas como documentação da forma.

### Fase de grupos + repescagem (SIMULTÂNEAS) — terça + quarta

- Janela: **terça 16/06 00:00 → quarta 17/06 23:59** (`America/Sao_Paulo`). GMV parcial ao vivo dentro da janela.
- Em cada grupo, o **pior em GMV vai para a repescagem**; os demais **avançam direto**.
  - Grupos de 3 → avançam 2, cai 1 (para repescagem).
  - Grupo de 2 → avança 1, cai 1 (para repescagem).
- A **repescagem roda no mesmo período** da fase de grupos, reunindo os "piores" de cada grupo. O **menos pior da repescagem** (1) sobe para o chaveamento.
- **Resultado: 8 classificados** para as quartas = 7 que avançaram direto + 1 da repescagem.

### Quartas — quinta 18/06

- Janela: **quinta 18/06 00:00 → 23:59** (`America/Sao_Paulo`). GMV zera (novo período).
- **Mata-mata 1v1**: os 8 viram **4 confrontos de 2**. Em cada confronto, o **maior GMV avança**, o outro é eliminado. → 4 classificados.
- **Pareamento: cruzado entre grupos vizinhos** (A↔B, C↔D), nunca dois do mesmo grupo no mesmo confronto. C/D invertido (ver §5.1).

### Jogo do Brasil — sexta 19/06 (tela à parte)

- Janela: **sexta 19/06 00:00 → 23:59** (`America/Sao_Paulo`).
- A competição interna **pausa**. O dash muda para uma **tela própria** (fora do bracket): **ranking geral de todos os 11 vendedores por GMV, estilo tabela do Brasileirão** (decisão Antonio). [CONFIRMADO]
- GMV somado na janela da sexta (zera por fase, como as demais). Ordenação desc.

### Semifinal — sábado 20/06

- Janela: **sábado 20/06 00:00 → 23:59** (`America/Sao_Paulo`). GMV zera.
- Mesma lógica 1v1: 4 viram 2 confrontos, melhor de cada avança. → 2 finalistas.
- **Pareamento:** vencedores vizinhos — vencedor(QF1)×vencedor(QF2) e vencedor(QF3)×vencedor(QF4).

### Final — domingo 21/06

- Janela: **domingo 21/06 00:00 → 23:59** (`America/Sao_Paulo`). GMV zera.
- 1 confronto 1v1: vencedor(SF1) × vencedor(SF2). Maior GMV leva a taça.

> [!note] Regras de ranking [CONFIRMADO]
> - **Sem regra de desempate** (improvável; não implementar).
> - **GMV zera por fase** (cada fase soma só a sua janela de tempo — ver §3). **Não** é acumulado nem "só hoje".
> - Grupos: pior cai para repescagem; **`avancam` varia por grupo** (3→2, 2→1). Repescagem: sobe 1.
> - Quartas/Semi/Final: confronto **1v1**, maior GMV avança.
> - **Pareamento cruzado entre grupos vizinhos**, C/D invertido (ver §5.1).
> - **Avanço automático derivado do relógio + recálculo sem estado** (ver §5.1) — roda sáb/dom sem intervenção.

## 6. Fora de escopo [CONFIRMADO]

- **Comemoração visual/sonora de venda nova: NÃO implementar.** Já existe automação externa. Por isso o Realtime/WebSocket **não é necessário** neste dash — polling simples basta.
- **Momento vencedor / animação de fim de dia: NÃO implementar.** Antonio comunica a virada por fora.
- **Premiação:** fora por enquanto.

## 7. Estados e operação

- **Virada de fase:** **automática**, derivada do relógio (`America/Sao_Paulo`) vs. janelas do config. Não depende de editar `config.fase_ativa` no fim de semana. [CONFIRMADO] (ver §5.1)
- **Sem vendas ainda:** tela **zerada** (não erro, não vazio). [CONFIRMADO]
- **Atualização:** polling do Supabase a cada **60s**. [CONFIRMADO]
- **Supabase é só-leitura:** transformação (régua + filtro 3 chars + soma + avanço) toda no **front (JS)**; nenhum objeto novo no Supabase. [CONFIRMADO]

## 8. Ambiente de exibição [CONFIRMADO]

- Servido em **localhost** via `python -m http.server`.
- Aberto no **Chrome em tela cheia (kiosk mode)**: `chrome --kiosk http://localhost:PORTA`.
- Proporção: padrão de notebook espelhado em TV (16:9, resolução padrão).
- Deve funcionar offline após carregado (dados vêm do Supabase, mas imagens são locais).

## 9. Assets (locais)

```
dashboard-competicao/
├── index.html
├── config.js          ← fase, vendedores, grupos, slug, régua
├── fotos/             ← fotos QUADRADAS dos vendedores
└── flags/             ← bandeiras das seleções
```

- Imagens **hospedadas localmente**, servidas pelo mesmo `http.server`. Caminhos relativos no config.
- Fotos dos vendedores: **quadradas**. [CONFIRMADO]

## 10. Estrutura do `config.js` (modelo)

```js
const COMPETICAO = {
  // fase_ativa NÃO é mais manual: o dash deriva do relógio (America/Sao_Paulo) vs. janelas.
  // Manter aqui só como override opcional p/ teste local (null = usar relógio).
  fase_ativa_override: null,   // "grupos" | "quartas" | "brasil" | "semis" | "final" | null

  produto: {
    slug_like: "%FORMAÇÃO DE PLANEJADOR FINANCEIRO%",   // troca para o legado na terça
    regua: [                                            // ordem importa
      { ate: 1000, mult: 12 },
      { ate: 2000, mult: 4 },
      { ate: null, mult: 1 }
    ]
  },

  supabase: {
    url: "[A DEFINIR]",
    anon_key: "[A DEFINIR]",
    tabela: "db_transactions_events",
    poll_segundos: 60
  },

  vendedores: {
    // chave = seller_code (PMP de 3 letras). Aparece na tela junto do card.
    // selecao/bandeira: todos "brasil" no 1º momento (decisão Antonio) — ajustar depois.
    "CCL": { nome: "Camila",     selecao: "brasil", foto: "fotos/ccl.jpg", bandeira: "flags/brasil.svg" },
    "HDZ": { nome: "Diniz",      selecao: "brasil", foto: "fotos/hdz.jpg", bandeira: "flags/brasil.svg" },
    "EZB": { nome: "Enzo",       selecao: "brasil", foto: "fotos/ezb.jpg", bandeira: "flags/brasil.svg" },
    "FAL": { nome: "Fernando",   selecao: "brasil", foto: "fotos/fal.jpg", bandeira: "flags/brasil.svg" },
    "HLM": { nome: "Harry",      selecao: "brasil", foto: "fotos/hlm.jpg", bandeira: "flags/brasil.svg" },
    "HMD": { nome: "Henrique",   selecao: "brasil", foto: "fotos/hmd.jpg", bandeira: "flags/brasil.svg" },
    "HUM": { nome: "Hudson",     selecao: "brasil", foto: "fotos/hum.jpg", bandeira: "flags/brasil.svg" },
    "JKC": { nome: "Jackson",    selecao: "brasil", foto: "fotos/jkc.jpg", bandeira: "flags/brasil.svg" },
    "JPP": { nome: "João Pedro", selecao: "brasil", foto: "fotos/jpp.jpg", bandeira: "flags/brasil.svg" },
    "MDR": { nome: "Monica",     selecao: "brasil", foto: "fotos/mdr.jpg", bandeira: "flags/brasil.svg" },
    "THS": { nome: "Thayna",     selecao: "brasil", foto: "fotos/ths.jpg", bandeira: "flags/brasil.svg" }
  },

  // cada fase declara sua JANELA de tempo — o GMV soma só dentro dela (zera por fase)
  // confrontos NÃO precisam ser escritos à mão: o dash os deriva (ver §5.1). Ficam aqui só p/ doc.
  fases: {
    grupos: {
      tipo: "grupos",
      inicio: "2026-06-16T00:00:00-03:00", fim: "2026-06-17T23:59:59-03:00",   // ter+qua (2 dias)
      grupos: [
        { nome: "Grupo A", membros: ["CCL","FAL","MDR"], avancam: 2 },
        { nome: "Grupo B", membros: ["HDZ","HLM","THS"], avancam: 2 },
        { nome: "Grupo C", membros: ["EZB","HMD","JPP"], avancam: 2 },
        { nome: "Grupo D", membros: ["HUM","JKC"],       avancam: 1 }   // grupo de 2
      ],
      repescagem: { sobem: 1 }   // o "menos pior" dos que caíram sobe; roda na MESMA janela
    },
    // ordem de entrada: 1ºA,2ºA,1ºB,2ºB,1ºC,2ºC,1ºD,REP — pareamento cruzado entre vizinhos (C/D invertido)
    quartas: { tipo: "mata-mata-1v1",
               inicio: "2026-06-18T00:00:00-03:00", fim: "2026-06-18T23:59:59-03:00",   // quinta
               // derivado: [1ºA×2ºB], [1ºB×2ºA], [1ºC×1ºD], [REP×2ºC]
               confrontos: "DERIVADO (ver §5.1)" },   // 8 → 4
    brasil:  { tipo: "tela-a-parte",
               inicio: "2026-06-19T00:00:00-03:00", fim: "2026-06-19T23:59:59-03:00",   // sexta
               formato: "ranking-brasileirao" },   // pausa o bracket; tabela vertical de todos por GMV desc
    semis:   { tipo: "mata-mata-1v1",
               inicio: "2026-06-20T00:00:00-03:00", fim: "2026-06-20T23:59:59-03:00",   // sábado
               // derivado: [venc(QF1)×venc(QF2)], [venc(QF3)×venc(QF4)]
               confrontos: "DERIVADO (ver §5.1)" },   // 4 → 2
    final:   { tipo: "mata-mata-1v1",
               inicio: "2026-06-21T00:00:00-03:00", fim: "2026-06-21T23:59:59-03:00",   // domingo
               // derivado: [venc(SF1)×venc(SF2)]
               confrontos: "DERIVADO (ver §5.1)" }   // 2 → 1 (taça)
  }
};
```

## 11. Layout — chaveamento vertical único [parcialmente definido]

> [!info] Referência visual
> Esboço do Antonio (chaveamento desenhado horizontal, mas a decisão final é **vertical**). Arquivo: `esboco_dash_competicao.jpeg`.

**Conceito central:** **um único bracket vertical, sempre completo na tela**, com **zoom/destaque na fase ativa** (`fase_ativa`). Não são telas separadas — é a mesma árvore, reenquadrada conforme a fase.

**Card do vendedor (em todas as fases):** [CONFIRMADO]
- Foto **quadrada** do vendedor.
- **PMP** (código do vendedor) — visível.
- Bandeira da seleção que o vendedor representa.
- **GMV da fase** (somado na janela da fase).

**Estrutura do bracket:**
- Topo/entrada: 4 grupos (A, B, C, D) + bloco de **repescagem** ao lado/abaixo, indicando quem caiu e quem subiu.
- Miolo: quartas (4 confrontos 1v1) → semis (2) → final (1) → taça.
- Destaque visual do vencedor de cada confronto (liberdade criativa).

**Liberdade criativa (Antonio autorizou):** animação de fundo e destaque dos vencedores. Manter temática Copa.

**Tratamento de eliminados e líder ao vivo:** [CONFIRMADO]
- **Eliminado:** permanece no bracket, **esmaecido em cinza** (não some) — preserva a leitura da árvore inteira.
- **Líder ao vivo:** enquanto uma fase está aberta, dar **destaque visual ao maior GMV do momento** em cada confronto/grupo (vencedor parcial até o fechamento da janela).

**Tela à parte — "jogo do Brasil" (`fase_ativa: "brasil"`):** [CONFIRMADO formato]
- Não usa o bracket. Pausa a competição e mostra um **ranking geral de todos os 11 vendedores por GMV, estilo tabela do Brasileirão**.
- **Tabela vertical**, uma linha por vendedor, ordenada por GMV desc. Sugestão de colunas: **posição** (1º, 2º, …) | **foto quadrada** | **nome + PMP** | **bandeira** | **GMV da janela (sexta)**.
- Liberdade criativa no visual (cores de pódio para o topo, faixas de destaque), mantendo a temática Copa. Sem confrontos 1v1 nesta tela — é classificação corrida.

> [!todo] Falta o Antonio definir (depois)
> - Seleções/bandeiras reais por vendedor (hoje todos "brasil" — placeholder).
> - URL/anon key do Supabase, fotos+bandeiras, slug+régua do produto legado.

## 12. Checklist de preenchimento antes de entregar ao Claude Code

- [ ] URL do projeto Supabase + `anon key` no config.
- [x] Intervalo de polling. *(60s)*
- [x] Decisão front-JS vs. view para a transformação. *(front; Supabase só-leitura)*
- [x] Lista de vendedores: `seller_code` (3 letras) → nome + seleção. *(11 closers; seleções todas "brasil" por ora)*
- [ ] Fotos quadradas em `fotos/` + bandeiras em `flags/`.
- [x] Configuração dos grupos (quem está em A, B, C, D). *(A: CCL/FAL/MDR · B: HDZ/HLM/THS · C: EZB/HMD/JPP · D: HUM/JKC)*
- [x] **Datas/horas das janelas** de cada fase (`inicio`/`fim`). *(grupos 16–17/06; quartas 18; brasil 19; semis 20; final 21)*
- [x] Layout da tela "jogo do Brasil". *(ranking estilo tabela do Brasileirão, GMV desc)*
- [x] Tratamento visual de eliminados no bracket. *(esmaecido em cinza; líder ao vivo destacado)*
- [x] Regra de pareamento + avanço automático. *(cruzado entre vizinhos, C/D invertido; derivado do relógio, sem estado — §5.1)*
- [ ] (Terça) slug + régua do produto legado — **e confirmar se `price` do legado vem como parcela ou valor cheio** (impacta a régua ×12/×4).
