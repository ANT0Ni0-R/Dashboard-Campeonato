# Corrida de Fechamento — setup e deploy

Painel de TV para o fechamento das metas do mes (foco no ultimo dia): velocimetro de GMV de hoje,
corrida dos vendedores, grafico GMV geral hora-a-hora, countdown e ritmo necessario para bater a
meta. Fonte unica de dados: **Supabase** (tabela `db_transactions_events`), consultada no servidor
(sem login na TV).

## Arquivos

| Arquivo | Papel |
|---|---|
| `Code.gs` | Backend: le a planilha, consulta o Supabase (JWT server-side), monta o dashboard |
| `Index.html` | Front: HTML/CSS/JS puro (sem framework), chama `getDashboard()` via `google.script.run` |
| `appsscript.json` | Manifest do Apps Script |
| `Config-template.md` | Guia das abas da planilha (Config, Participantes, Parcelamento) |

> O `.zip` e os PNGs na pasta sao apenas a referencia visual original (Claude Design); nao sao
> usados em runtime.

## Setup

1. **Crie a Google Sheet** com as abas `Config`, `Participantes` e `Parcelamento` conforme
   `Config-template.md`.
2. **Crie o Apps Script vinculado**: na planilha, `Extensoes > Apps Script`.
3. **Cole os arquivos** `Code.gs`, `Index.html` e o conteudo de `appsscript.json` (Project
   Settings > marque "Mostrar arquivo de manifesto appsscript.json" para edita-lo).
4. **Grave os segredos** em `Project Settings > Script Properties`:
   - `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_SUB`, `SUPABASE_PUBLISHABLE_KEY`
   - (alternativa de fallback: `SUPABASE_SERVICE_ROLE_KEY`, que ignora RLS)
5. **Teste**: rode `diag()` no editor e veja o Registro de execucao — valida a config, a conexao
   Supabase e o shape de `getDashboard()` (realizado do mes, GMV de hoje, ranking por PMP, hora-a-hora).
6. **Deploy**: `Implantar > Nova implantacao > App da Web`
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa** (a smart TV abre sem login)
   - Copie a URL e abra na TV.

## Como funciona (resumo)

- **Geral do time (criterio TVD):** Realizado no mes, GMV de hoje, grafico hora-a-hora e o ritmo
  R$/h somam apenas vendas cujo `pmp` contem "TVD".
- **Por pessoa (PMP):** a corrida soma o GMV de hoje por PMP cadastrado em `Participantes` e ranqueia
  do maior para o menor GMV (1o colocado define a linha de chegada; os demais ficam proporcionais a ele).
- **GMV Ajustado:** cada venda parcelada e projetada para o contrato cheio pela aba `Parcelamento`
  (match por slug + faixa de preco -> `price * meses * fator`).
- **Escopo de `excluir_slugs`:** vale **so** para os KPIs do time (Realizado no mes, GMV de hoje,
  Ritmo). A **corrida** e o **grafico hora-a-hora** consideram **qualquer slug** (default excluido:
  `legado` e `trilogia do investidor`).

## Manutencao mensal

- Atualize `meta_mes`, `inicio`, `fim` (e `meta_dia` se usar) na aba `Config`.
- Atualize a coluna `Falta` por vendedor na aba `Participantes`.
- Revise a aba `Parcelamento` se entrar/sair produto parcelado.
- O Apps Script **nao** le do GitHub: ao mudar `Code.gs`/`Index.html`, cole no editor e
  republique o deploy (nova versao).
