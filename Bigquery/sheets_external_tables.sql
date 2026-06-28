-- ============================================================================
-- [ALTERNATIVA FUTURA - NAO EM USO]
-- O de-para Clint->produto hoje e um SEED (seeds/sales_team/map_clint_produto.csv),
-- porque criar tabela na mao no BQ exige permissao que nao temos (tudo via dbt).
-- Este arquivo fica como referencia para, no futuro, migrar o de-para para uma
-- PLANILHA editavel no navegador via pacote dbt_external_tables (criada pelo
-- run de prod com `dbt run-operation stage_external_sources`).
-- ============================================================================
-- Tabelas externas sobre Google Sheets (de-paras mantidos a mao)
-- ----------------------------------------------------------------------------
-- Rodar no console do BigQuery, no projeto grupo-primo-crm-prd (onde voce tem
-- acesso de criar). Quem roda precisa ter acesso de Drive a planilha.
--
-- ANTES de rodar, compartilhe a planilha (Leitor) com:
--   - dbt-user-access@grupo-primo-prd.iam.gserviceaccount.com  (SA prod/ci)
--   - sua conta Google                                          (dev / oauth)
--
-- Uma planilha, varias abas: cada aba vira UMA tabela externa, mudando so o
-- sheet_range (nome da aba). Troque <URL_DA_SUA_PLANILHA> pela URL real.
-- ============================================================================

-- OBS: este projeto materializa tudo no dataset grupo_primo_crm (nao existe um
-- dataset 'staging' no BQ). A tabela externa precisa viver num dataset real.

CREATE OR REPLACE EXTERNAL TABLE `grupo-primo-crm-prd.grupo_primo_crm.map_clint_produto`
OPTIONS (
  format = 'GOOGLE_SHEETS',
  uris = ['https://docs.google.com/spreadsheets/d/125iM8WQ9ze5UQlyDE-paFWKVP5lrQzsAnfrYOprl84E/edit'],
  sheet_range = 'clint_produto',   -- nome EXATO da aba
  skip_leading_rows = 1            -- pula a linha de cabecalho
);

-- Teste rapido de leitura (deve devolver as 19 regras):
-- SELECT * FROM `grupo-primo-crm-prd.grupo_primo_crm.map_clint_produto`;
