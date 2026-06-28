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

CREATE OR REPLACE EXTERNAL TABLE `grupo-primo-crm-prd.staging.map_clint_produto`
OPTIONS (
  format = 'GOOGLE_SHEETS',
  uris = ['<URL_DA_SUA_PLANILHA>'],
  sheet_range = 'clint_produto',   -- nome EXATO da aba
  skip_leading_rows = 1            -- pula a linha de cabecalho
);

-- Teste rapido de leitura (deve devolver as 19 regras):
-- SELECT * FROM `grupo-primo-crm-prd.staging.map_clint_produto`;
