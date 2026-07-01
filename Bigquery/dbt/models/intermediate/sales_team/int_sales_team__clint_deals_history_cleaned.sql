{{
    config (
        materialized = "view"
        , meta = {'owner': 'arthur.haro'}
        , tags = ["clint"]
    )
}}

WITH

deals_history AS ( SELECT * FROM {{ source('staging_clint', 'stg_clint__deals_history') }} )
, seller AS ( SELECT * FROM {{ source('staging_google_sheets', 'stg_google_sheets__map_sellers_tvd') }} )

, windowed AS (
    SELECT
        d.*
        , s.seller_pmp AS user_pmp
        , ROW_NUMBER() OVER w_asc AS stage_seq_asc
        , ROW_NUMBER() OVER w_desc AS stage_seq_desc
        , LAG(deal_stage) OVER w_asc AS prev_stage
        , LEAD(deal_stage) OVER w_asc AS next_stage
        , LEAD(updated_stage_at) OVER w_asc AS left_stage_at

    FROM deals_history AS d
    LEFT JOIN seller AS s
        ON d.user_email = s.seller_email
    WINDOW
        w_asc  AS (PARTITION BY d.deal_id ORDER BY d.updated_stage_at ASC)
        , w_desc AS (PARTITION BY d.deal_id ORDER BY d.updated_stage_at DESC)
)

, final AS (
    SELECT
        deal_id
        , deal_stage
        , created_at
        , updated_stage_at AS entered_stage_at
        , left_stage_at
        , prev_stage
        , next_stage
        , stage_seq_asc
        , stage_seq_desc
        , DATETIME_DIFF(COALESCE(left_stage_at, CURRENT_DATETIME()), updated_stage_at, MINUTE) AS minutes_in_stage
        , DATETIME_DIFF(COALESCE(left_stage_at, CURRENT_DATETIME()), updated_stage_at, HOUR) AS hours_in_stage
        , DATETIME_DIFF(COALESCE(left_stage_at, CURRENT_DATETIME()), updated_stage_at, DAY) AS days_in_stage
        , user_email
        , user_pmp
        , user_name
        , _python_synced
    FROM windowed
)

SELECT * FROM final
