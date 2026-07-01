{{
    config (
        materialized = "table"
        , meta = {'owner': 'arthur.haro'}
        , tags = ["mongo-ecomm"]
        , partition_by = {
          "field": "transaction_created_date",
          "data_type": "date",
          "granularity": "month"
        }
    )
}}

WITH

base AS ( SELECT * FROM {{ ref('int_sales_team__transactions_with_sales_request') }} )

, sales_detail AS (
    SELECT
        transaction_id
        , transaction_created_at
        , transaction_created_date
        , refund_date
        , transaction_week
        , transaction_month
        , transaction_bu_adjusted
        , CASE
            WHEN transaction_bu_adjusted = 'MBA' THEN 'HUB'
            WHEN transaction_bu_adjusted = 'Bruno Perini' THEN 'BP'
            WHEN transaction_bu_adjusted = 'Equity+' THEN 'EQ+'
            WHEN transaction_bu_adjusted = 'Thiago Nigro' THEN 'TN'
            ELSE transaction_bu_adjusted
        END AS bu
        , user_email
        , user_name
        , user_phone
        , campanha
        , campaign_acronym
        , canal1
        , canal2
        , medium
        , outro
        , pmp
        , product_name
        , offer_name
        , COALESCE(map_product_group, 'Outros') AS product_group
        , matched_seller_name AS seller_name
        , matched_seller_pmp AS seller_pmp
        , CASE
            WHEN matched_seller_pmp IS NOT NULL THEN 'TVD'
            WHEN UPPER(canal1) IN ('TORRES', 'TVD', 'VENDAS') THEN 'TVD'
            WHEN UPPER(outro) LIKE ANY ('%DIANA%', '%VENDAS_IA%', '%THAIS%', '%VIC_IA%') THEN 'TVD'
            ELSE 'OUTROS'
        END AS sales_channel
        , cycle_count
        , installment_number
        , installments
        , transaction_gross_amount
        , transaction_net_amount
        , net_transactions
        , gmv
        , CASE
            WHEN is_smart_installment = TRUE THEN TRUE
            WHEN product_name LIKE '%MBA%' AND installments > 12 THEN TRUE
            ELSE FALSE
        END AS is_smart_installment
        , CASE WHEN total_refund IS NOT NULL THEN TRUE ELSE FALSE END AS is_refunded
        {# , CASE WHEN transaction_status_grouped = 'Refunded' THEN TRUE ELSE FALSE END AS is_refunded #}
        , FALSE AS is_manual_claim
        , is_in_tvd_portfolio
        , request_type
        , request_pmp
        , request_name
    FROM base
    WHERE
        (NOT is_transaction_trial OR is_transaction_trial IS NULL)
        AND (installment_number IS NULL OR installment_number = 1)
        AND (cycle_count IS NULL OR cycle_count = 1)
        AND transaction_bu_adjusted NOT IN ('Grão', 'Portfel')
        AND UPPER(REGEXP_REPLACE(NORMALIZE(product_name, NFD), r'\pM', '')) NOT LIKE 'PRE%'
        AND UPPER(REGEXP_REPLACE(NORMALIZE(product_name, NFD), r'\pM', '')) NOT LIKE '%RECORRENTE%'
        AND UPPER(REGEXP_REPLACE(NORMALIZE(product_name, NFD), r'\pM', '')) NOT LIKE '%RENOVACAO%'
        AND (
            outro IS NULL
            OR (
                UPPER(REGEXP_REPLACE(NORMALIZE(outro, NFD), r'\pM', '')) NOT LIKE 'PRE%'
                AND UPPER(REGEXP_REPLACE(NORMALIZE(outro, NFD), r'\pM', '')) NOT LIKE '%RECORRENTE%'
                AND UPPER(REGEXP_REPLACE(NORMALIZE(outro, NFD), r'\pM', '')) NOT LIKE '%RENOVACAO%'
            )
        )
        AND (
            product_class IS NULL
            OR NOT (UPPER(product_class) LIKE '%ADM%' AND UPPER(product_class) LIKE '%-S%')
        )
)

, sales_consolidated AS (
    SELECT
        * REPLACE (
            CASE
                WHEN sales_channel = 'OUTROS' AND request_type IS NOT NULL
                    THEN request_name
                WHEN
                    sales_channel = 'TVD'
                    AND request_type = 'Troca de PMP de vendedor'
                    AND request_name IS NOT NULL
                    THEN request_name
                ELSE seller_name
            END AS seller_name

            , CASE
                WHEN sales_channel = 'OUTROS' AND request_type IS NOT NULL
                    THEN request_pmp
                WHEN
                    sales_channel = 'TVD'
                    AND request_type = 'Troca de PMP de vendedor'
                    AND request_pmp IS NOT NULL
                    THEN request_pmp
                ELSE seller_pmp
            END AS seller_pmp

            , CASE
                WHEN sales_channel = 'OUTROS' AND request_type IS NOT NULL
                    THEN 'TVD'
                ELSE sales_channel
            END AS sales_channel

            , CASE
                WHEN sales_channel = 'OUTROS' AND request_type IS NOT NULL THEN TRUE
                WHEN
                    sales_channel = 'TVD'
                    AND request_type = 'Troca de PMP de vendedor'
                    THEN TRUE
                ELSE FALSE
            END AS is_manual_claim
        )
    FROM sales_detail
)

-- dedup: 1 linha "boa" por transaction_id. As demais linhas do mesmo
-- transaction_id (ex.: mesma venda reetiquetada com outro product_name, como
-- 'Consultor de Elite #FINCLASS') sao marcadas is_venda_duplicada = TRUE.
-- Desempate para escolher o KEEPER (rn = 1):
--   1) PMP do vendedor conhecido (seller_pmp NOT NULL)
--   2) maior receita (gmv)
--   3) hash estavel do (product_name, user_email) -- pseudo-aleatorio reproduzivel.
, dedup AS (
    SELECT
        *
        , CASE
            WHEN transaction_id IS NULL THEN FALSE
            ELSE ROW_NUMBER() OVER (
                PARTITION BY transaction_id
                ORDER BY
                    (seller_pmp IS NOT NULL) DESC
                    , gmv DESC
                    , FARM_FINGERPRINT(CONCAT(COALESCE(product_name, ''), '|', COALESCE(user_email, '')))
            ) > 1
        END AS is_venda_duplicada
    FROM sales_consolidated
)

SELECT
    transaction_id
    , transaction_created_at
    , transaction_created_date
    , transaction_week
    , transaction_month
    , refund_date
    , transaction_bu_adjusted AS bu_adjusted
    , bu AS bu_short
    , product_group
    , product_name
    , offer_name
    , cycle_count
    , installment_number
    , installments
    , transaction_gross_amount
    , transaction_net_amount
    , net_transactions
    , gmv
    , user_email
    , user_phone
    , user_name
    , sales_channel
    , seller_name
    , seller_pmp
    , campanha
    , campaign_acronym
    , pmp
    , canal1
    , canal2
    , medium
    , outro
    , is_smart_installment
    , is_refunded
    , is_manual_claim
    , is_in_tvd_portfolio
    , is_venda_duplicada
FROM dedup
