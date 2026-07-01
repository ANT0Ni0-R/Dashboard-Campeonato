{{
    config (
        materialized = "ephemeral"
        , meta = {'owner': 'arthur.haro'}
        , tags = ["clint"]
    )
}}

WITH

booking_grao AS ( SELECT * FROM {{ source('staging_jitsu', 'stg_jitsu__booking_grao') }} )
, booking_portfel AS ( SELECT * FROM {{ source('staging_jitsu', 'stg_jitsu__booking_portfel') }} )
, deals_cleaned AS ( SELECT * FROM {{ ref('int_sales_team__clint_deals_cleaned') }} )

, phone_toxic AS (
    SELECT
        REGEXP_REPLACE(contact_phone, r'[^0-9]', '') AS phone
        , product_group
    FROM deals_cleaned
    WHERE contact_phone IS NOT NULL AND product_group IS NOT NULL
    GROUP BY ALL
    HAVING COUNT(DISTINCT deal_id) > 3
)

, deals AS (
    SELECT
        d.deal_id
        , LOWER(TRIM(d.contact_email)) AS contact_email
        , CASE
            WHEN pt.phone IS NULL AND LENGTH(REGEXP_REPLACE(d.contact_phone, r'[^0-9]', '')) >= 10
                THEN REGEXP_REPLACE(d.contact_phone, r'[^0-9]', '')
        END AS contact_phone
        , d.product_group
        , d.created_at
    FROM deals_cleaned AS d
    LEFT JOIN phone_toxic AS pt
        ON REGEXP_REPLACE(d.contact_phone, r'[^0-9]', '') = pt.phone
        AND d.product_group = pt.product_group
    WHERE d.product_group IS NOT NULL
)

, union_booking AS (
    SELECT * FROM booking_grao
    UNION ALL
    SELECT * FROM booking_portfel
)

, pre_processed AS (
    SELECT
        u.*
        , DATETIME(COALESCE(
            SAFE.PARSE_TIMESTAMP('%m/%d/%Y %I:%M:%S %p', start_time)
            , SAFE.PARSE_TIMESTAMP('%m/%d/%Y %H:%M:%S', start_time)
        ), 'America/Sao_Paulo') AS start_time_parsed

        , DATETIME(COALESCE(
            SAFE.PARSE_TIMESTAMP('%m/%d/%Y %I:%M:%S %p', end_time)
            , SAFE.PARSE_TIMESTAMP('%m/%d/%Y %H:%M:%S', end_time)
        ), 'America/Sao_Paulo') AS end_time_parsed

        , DATETIME(received_at, 'America/Sao_Paulo') AS received_at_ts
    FROM union_booking AS u
)

, deal_extraction AS (
    SELECT
        *
        , (
            SELECT JSON_VALUE(item, '$.answer')
            FROM UNNEST(JSON_EXTRACT_ARRAY(custom_question_answers)) AS item
            WHERE JSON_VALUE(item, '$.question') = 'ID Clint'
        ) AS deal_url
        , REGEXP_EXTRACT(
            (
                SELECT JSON_VALUE(item, '$.answer')
                FROM UNNEST(JSON_EXTRACT_ARRAY(custom_question_answers)) AS item
                WHERE JSON_VALUE(item, '$.question') = 'ID Clint'
            )
            , r'deal/([a-zA-Z0-9-]+)'
        ) AS deal_id_raw
    FROM pre_processed
)

, enriched AS (
    SELECT
        booking_id
        , deal_id_raw
        , customer_email
        , LOWER(TRIM(customer_email)) AS customer_email_norm
        , CASE
            WHEN LENGTH(REGEXP_REPLACE(customer_phone, r'[^0-9]', '')) >= 10
                THEN REGEXP_REPLACE(customer_phone, r'[^0-9]', '')
        END AS customer_phone_norm
        , service_name
        , CASE
            WHEN service_name = 'Reunião com Especialista Grupo Primo (Q)' THEN 'FCE'
            WHEN service_name = 'Reunião com Especialista Grupo Primo (D)' THEN 'FPF'
            WHEN service_name = 'Reunião com Especialista Grupo Primo - FPF' THEN 'FPF'
            WHEN service_name = 'Reunião com Planejador Financeiro' THEN 'Grão'
            WHEN service_name = 'Reunião com Consultor Financeiro' THEN 'Portfel (Descontinuada)'
            WHEN service_name LIKE '%Portfel%' THEN 'Portfel'
            ELSE NULL
        END AS target_product
        , JSON_VALUE(staff_members, '$[0].email_address') AS staff_email
        , DATE(received_at_ts) AS booked_dt
        , DATE(start_time_parsed) AS meeting_dt
        , CONCAT(
            FORMAT_DATETIME('%H:%M', start_time_parsed)
            , ' - '
            , FORMAT_DATETIME('%H:%M', end_time_parsed)
        ) AS meeting_time
        , DIV(duration, 60) AS meeting_len
        , DATE_DIFF(DATE(start_time_parsed), DATE(received_at_ts), DAY) AS days_in_advance
        , CASE WHEN start_time_parsed <= CURRENT_DATETIME('America/Sao_Paulo') THEN 1 ELSE 0 END AS is_past_meeting
        , start_time_parsed AS meeting_at
        , received_at_ts AS booked_at
        , deal_url
    FROM deal_extraction
)

, resolved AS (
    SELECT
        e.*
        , COALESCE(NULLIF(TRIM(e.deal_id_raw), ''), d.deal_id) AS deal_id
    FROM enriched AS e
    LEFT JOIN deals AS d
        ON NULLIF(TRIM(e.deal_id_raw), '') IS NULL
        AND e.target_product = d.product_group
        AND (
            e.customer_email_norm = d.contact_email
            OR e.customer_phone_norm = d.contact_phone
        )
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY e.booking_id
        ORDER BY
            CASE WHEN e.customer_email_norm = d.contact_email THEN 0 ELSE 1 END
            , ABS(TIMESTAMP_DIFF(e.booked_at, d.created_at, HOUR)) ASC
    ) = 1
)

, rekeyed AS (
    SELECT
        r.*
        , COALESCE(NULLIF(TRIM(r.deal_id), ''), NULLIF(r.customer_email_norm, '')) AS booking_key
    FROM resolved AS r
)

, sequenced AS (
    SELECT
        rk.*
        , ROW_NUMBER() OVER (PARTITION BY booking_key, target_product ORDER BY booked_at ASC) AS meeting_rn
        , ROW_NUMBER() OVER (PARTITION BY booking_key, target_product ORDER BY booked_at DESC) AS meeting_rn_desc
        , COUNT(*) OVER (PARTITION BY booking_key, target_product) AS meeting_count
        , LEAD(booked_at) OVER (PARTITION BY booking_key, target_product ORDER BY booked_at) AS next_booked_at
        , LAG(booked_at) OVER (PARTITION BY booking_key, target_product ORDER BY booked_at) AS prev_booked_at
        , LEAD(meeting_at) OVER (PARTITION BY booking_key, target_product ORDER BY booked_at) AS next_meeting_at
        , LAG(meeting_at) OVER (PARTITION BY booking_key, target_product ORDER BY booked_at) AS prev_meeting_at
    FROM rekeyed AS rk
    WHERE
        booking_key IS NOT NULL
        AND staff_email NOT IN ('fernando.arata@timeprimo.com', 'teste@teste.com')
        AND customer_email NOT IN ('fernando.k.arata@gmail.com', 'fernando.arata@timeprimo.com', 'teste@teste.com')
)

, classified AS (
    SELECT
        *
        , CASE WHEN next_booked_at > meeting_at THEN 1 ELSE 0 END AS is_no_show
        , CASE WHEN next_booked_at <= meeting_at THEN 1 ELSE 0 END AS is_reschedule
    FROM sequenced
)

, final AS (
    SELECT
        {{ dbt_utils.generate_surrogate_key(["booking_id", "booked_at"]) }} AS uid
        , fv.booking_id
        , fv.deal_id
        , fv.customer_email
        , fv.booking_key
        , fv.service_name
        , fv.target_product
        , fv.staff_email
        , fv.booked_dt
        , fv.booked_at
        , fv.meeting_dt
        , fv.meeting_at
        , fv.meeting_time
        , fv.meeting_len
        , fv.days_in_advance
        , fv.is_past_meeting
        , fv.is_no_show
        , fv.is_reschedule
        , fv.meeting_rn
        , fv.meeting_rn_desc
        , fv.meeting_count
        , fv.next_booked_at
        , fv.prev_booked_at
        , fv.next_meeting_at
        , fv.prev_meeting_at
        , fv.deal_url
    FROM classified AS fv
)

SELECT * FROM final
