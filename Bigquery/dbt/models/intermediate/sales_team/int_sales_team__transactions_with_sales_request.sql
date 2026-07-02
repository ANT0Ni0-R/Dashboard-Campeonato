{{
    config (
        materialized = "view"
        , meta = {'owner': 'arthur.haro'}
        , tags = ["mongo-ecomm"]
    )
}}

WITH

transactions AS ( SELECT * FROM {{ source('mart_grupo', 'mrt_grupo__transactions') }} )
, map_products AS ( SELECT * FROM {{ source('staging_google_sheets', 'stg_google_sheets__map_product_tvd_grouped') }} )
, map_product_portfolio AS ( SELECT DISTINCT product_name FROM {{ source('staging_google_sheets', 'stg_google_sheets__map_product_tvd_monthly') }} )
, sellers_tvd AS ( SELECT DISTINCT seller_pmp, seller_name FROM {{ source('staging_google_sheets', 'stg_google_sheets__map_sellers_tvd') }} )
, map_sales_requests AS ( SELECT * FROM {{ source('staging_google_sheets', 'stg_google_sheets__map_sales_requests') }} )

, base AS (
    SELECT
        *
        , REGEXP_REPLACE(
            CASE
                WHEN REGEXP_EXTRACT(COALESCE(NULLIF(TRIM(outro), ''), pmp), r'[^-]+$') = 'VBP' THEN 'VPB'
                WHEN REGEXP_EXTRACT(COALESCE(NULLIF(TRIM(outro), ''), pmp), r'[^-]+$') = 'CLL' THEN 'CCL'
                WHEN REGEXP_EXTRACT(COALESCE(NULLIF(TRIM(outro), ''), pmp), r'[^-]+$') = 'JCK' THEN 'JKC'
                ELSE REGEXP_EXTRACT(COALESCE(NULLIF(TRIM(outro), ''), pmp), r'[^-]+$')
            END
            , r"[^A-Za-z0-9_]", ''
        ) AS outro_normalized
        -- UBFI (Ultra Black Friday Infinita) foi ingerida sem installment_number/cycle_count,
        -- entao os filtros anti-recorrencia do gold nao pegam suas cobrancas repetidas.
        -- Aqui marcamos como recorrencia toda linha alem da 1a (por data) de cada assinatura
        -- (user_email + offer_name). O boolean UBFI na PARTITION isola a contagem dos demais
        -- produtos que porventura compartilhem offer_name. gmv NAO e alterado (gross ja e o
        -- contrato cheio para UBFI; multiplicar por installments superestimaria ~10x).
        , CASE
            WHEN product_name LIKE '%Ultra Black Friday Infinita%' THEN
                ROW_NUMBER() OVER (
                    PARTITION BY (product_name LIKE '%Ultra Black Friday Infinita%'), user_email, offer_name
                    ORDER BY transaction_created_at ASC, transaction_id ASC
                ) > 1
            ELSE FALSE
        END AS is_ubfi_recorrencia
    FROM transactions
    WHERE
        transaction_status_grouped IN ('Confirmed')
        AND transaction_created_date <= CURRENT_DATE('America/Sao_Paulo')
)

, transactions_enriched AS (
    SELECT
        t.*
        , mp.product_group AS map_product_group
        , mp.campaign_acronym AS campaign_acronym
        , su.seller_name AS matched_seller_name
        , su.seller_pmp AS matched_seller_pmp
        , (mpp.product_name IS NOT NULL) AS is_in_tvd_portfolio
        , CASE
            WHEN t.product_name = 'Profissão Bancário' AND t.cycle_count = 1 AND t.transaction_gross_amount = 249.75 AND t.installments IS NULL
                THEN t.transaction_gross_amount * 12
            WHEN t.installment_number IS NULL THEN t.transaction_gross_amount
            ELSE t.transaction_gross_amount * t.installments
        END / CASE WHEN t.product_name LIKE '%Vivendo de Leilão%' THEN 0.6 ELSE 1 END AS gmv
        , DATE_TRUNC(transaction_created_date, WEEK(MONDAY)) AS transaction_week
        , DATE_TRUNC(DATE(t.transaction_created_date), MONTH) AS transaction_month
    FROM base AS t
    LEFT JOIN map_products AS mp
        ON t.product_name = mp.product_name
    LEFT JOIN map_product_portfolio AS mpp
        ON t.product_name = mpp.product_name
    LEFT JOIN sellers_tvd AS su
        ON t.outro_normalized = su.seller_pmp
)

, sales_requests AS (
    SELECT
        sr.user_email AS email
        , sr.request_month
        , sr.request_type
        , sr.seller_pmp AS request_pmp
        , su.seller_name AS request_name
    FROM map_sales_requests AS sr
    LEFT JOIN sellers_tvd AS su
        ON sr.seller_pmp = su.seller_pmp
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY email, request_month
        ORDER BY sr.request_date DESC
    ) = 1
)

SELECT
    t.*
    , r.request_type
    , r.request_pmp
    , r.request_name
FROM transactions_enriched AS t
LEFT JOIN sales_requests AS r
    ON TRIM(t.user_email) = TRIM(r.email)
    AND t.transaction_month = r.request_month
