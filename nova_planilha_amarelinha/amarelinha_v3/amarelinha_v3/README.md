# Amarelinha v3 — Guia de Instalação

## Estrutura dos arquivos

```
Code.gs       → setup inicial + menu + criação das abas
addMonth.gs   → lógica de adicionar mês na Amarelinha e Metas
extrato.gs    → recalculo do Extrato ao mudar o dropdown
utils.gs      → coloração automática, triggers, utilitários
```

---

## Passo a passo

### 1. Criar o Google Sheets

1. Acesse [sheets.new](https://sheets.new) para criar uma planilha em branco.
2. Dê um nome: **Amarelinha v3 — Grupo Primo**.

---

### 2. Abrir o Apps Script

1. No menu: **Extensões → Apps Script**.
2. Apague o arquivo `Código.gs` padrão que aparece.

---

### 3. Criar os arquivos de script

Para cada arquivo abaixo:
- Clique em **+** ao lado de "Arquivos"
- Escolha **Script**
- Renomeie para o nome indicado (sem `.gs`, o editor adiciona automaticamente)
- Cole o conteúdo

| Arquivo       | Conteúdo                    |
|---------------|-----------------------------|
| `Code`        | conteúdo de `Code.gs`       |
| `addMonth`    | conteúdo de `addMonth.gs`   |
| `extrato`     | conteúdo de `extrato.gs`    |
| `utils`       | conteúdo de `utils.gs`      |

---

### 4. Salvar e executar o setup

1. Salve todos os arquivos (**Ctrl+S**).
2. Volte para o Google Sheets e **recarregue a página** (F5).
3. Aguarde o menu **🗓️ Amarelinha** aparecer na barra de menus.
4. Clique em **🗓️ Amarelinha → 📋 Setup inicial (1ª vez)**.
5. Autorize as permissões quando solicitado.
6. As 5 abas serão criadas automaticamente.

---

### 5. Instalar o trigger

1. Clique em **🗓️ Amarelinha → 🔧 Instalar trigger (1ª vez)**.
2. Isso instala o `onEdit` como trigger instalável, necessário para que
   a coloração automática e o recalculo do Extrato funcionem ao editar células.

> **Por que instalar o trigger?**  
> O `onEdit` simples roda com autorização restrita; o trigger instalável roda
> com autorização completa, garantindo a coloração automática e o recálculo do
> Extrato ao editar células. (O mapeamento mês→coluna é derivado da própria
> planilha — a linha 1 da Amarelinha — e não depende mais do `PropertiesService`;
> este guarda apenas a lista de meses do dropdown.)

---

### 6. Adicionar o primeiro mês

1. Clique em **🗓️ Amarelinha → ➕ Adicionar mês…**
2. Digite `2026-07` (ou o mês desejado).
3. O script vai:
   - Criar o bloco de colunas na Amarelinha (Jul 1…31)
   - Adicionar as linhas de meta em "Metas por Produto" com valores `0`
   - Atualizar o dropdown no Extrato

4. Repita para cada mês que quiser pré-cadastrar (Agosto, Setembro…).

---

### 7. Preencher as metas

Na aba **Metas por Produto**, preencha a coluna **Meta (R$)** para cada
linha do mês. As células estão em amarelo para facilitar a identificação.

Cada mês tem 11 linhas de produto:
- FPF Lista de Espera
- FPF Carrinho
- FCE Perpétuo (dias 1–24)
- FCE Lançamento (dias 25–fim)
- GRV, Renovação, Portfel, Ancora, OLG, FCS, FIA

---

### 8. Preencher a Amarelinha

Na aba **Amarelinha**, preencha cada célula com a tag do produto para
o vendedor naquele dia. Use o dropdown de validação para as tags válidas.

A coloração é aplicada automaticamente ao digitar.

---

### 9. Ver o Extrato

1. Vá para a aba **Extrato**.
2. No dropdown da célula **B2**, selecione o mês desejado.
3. O extrato recalcula automaticamente: dias alocados, meta rateada por
   produto, total por vendedor e 3 sanity checks.

---

### 10. Ver a Lista

A aba **Lista** é preenchida automaticamente junto com o Extrato.
Formato: `mes | seller_name | seller_pmp | produto | meta_gmv`
Apenas linhas com meta > 0.

---

## Adicionando novos vendedores

Na aba **Amarelinha**, adicione uma nova linha abaixo dos vendedores
existentes (coluna A = nome, coluna B = PMP). Quando você rodar
"Adicionar mês" para os próximos meses, o novo vendedor já estará incluído.

Para meses já criados: preencha manualmente as células do bloco daquele mês
para o novo vendedor.

---

## Adicionando novos produtos

1. Na aba **Produtos**, adicione uma linha com a nova tag.
2. Na aba **Metas por Produto**, adicione linhas com a nova tag para cada mês.
3. Na Amarelinha, use a nova tag nas células desejadas.
4. Clique em **🔄 Recolorir Amarelinha** para aplicar a cor (adicione a cor
   no mapa `TAG_COLORS` no arquivo `Code.gs` se quiser uma cor personalizada).
5. Clique em **🔁 Recalcular Extrato agora** para atualizar.

---

## Fluxo de uso mensal

```
1. Adicionar mês (menu)          → Amarelinha + Metas preparados
2. Preencher metas (R$)          → aba Metas por Produto
3. Preencher alocação diária     → aba Amarelinha
4. Selecionar mês no dropdown    → Extrato recalcula automaticamente
5. Exportar Lista                → aba Lista filtrada, pronta para importar
```

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Menu não aparece | Recarregue a página (F5) |
| Extrato não recalcula ao mudar dropdown | Execute "Instalar trigger" novamente |
| "Mês não encontrado" no Extrato | Execute "Adicionar mês" antes de preencher |
| Coloração não funciona | Use "Recolorir Amarelinha" no menu para reaplicar |
| Erro de permissão | Re-autorize em Apps Script → Executar → Autorizar |
