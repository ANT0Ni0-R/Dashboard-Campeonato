{{
    config (
        materialized = "ephemeral"
        , meta = {'owner': 'arthur.haro'}
        , tags = ["clint"]
    )
}}

WITH


cl_history AS ( SELECT * FROM {{ ref('int_sales_team__clint_deals_history_cleaned') }} )
, cl_bookings AS ( SELECT * FROM {{ ref('int_sales_team__sdr_booking_cleaned') }} WHERE deal_id IS NOT NULL )
, cl_deals AS ( SELECT * FROM {{ ref('int_sales_team__clint_deals_cleaned') }} )

, noshow_per_booking AS (
    SELECT
        b.deal_id
        , b.booking_id
        , b.booked_at
        , MAX(CASE WHEN UPPER(h.deal_stage) LIKE '%NO SHOW%' THEN 1 ELSE 0 END) AS has_noshow_in_window
    FROM cl_bookings AS b
    LEFT JOIN cl_history AS h
        ON b.deal_id = h.deal_id
        AND UPPER(h.deal_stage) LIKE '%NO SHOW%'
        AND h.entered_stage_at >= b.meeting_at
        AND h.entered_stage_at < COALESCE(b.next_meeting_at, CURRENT_DATETIME())
    GROUP BY ALL
)

, booking_with_outcome AS (
    SELECT
        b.*
        , d.sdr_pmp
        , d.closer_pmp
        , d.owner_pmp
        , CASE
            WHEN b.is_reschedule = 1 THEN 'Reagendado'
            WHEN b.is_past_meeting = 0 THEN 'Agendado'
            WHEN b.is_no_show = 1 THEN 'No Show'
            WHEN ns.has_noshow_in_window = 1 THEN 'No Show'
            ELSE 'Realizado'
        END AS booking_outcome
    FROM cl_bookings AS b
    LEFT JOIN cl_deals AS d
        ON b.deal_id = d.deal_id
    LEFT JOIN noshow_per_booking AS ns
        ON b.deal_id = ns.deal_id
        AND b.booking_id = ns.booking_id
        AND b.booked_at = ns.booked_at
)

, booking_aggregated AS (
    SELECT
        deal_id
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN booking_id END) AS booking_id
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN customer_email END) AS customer_email
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN service_name END) AS service_name
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN target_product END) AS target_product
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN sdr_pmp END) AS sdr_pmp
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN owner_pmp END) AS owner_pmp
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN closer_pmp END) AS closer_pmp
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN staff_email END) AS staff_email
        , MIN(booked_dt) AS first_booked_dt
        , MIN(meeting_dt) AS first_meeting_dt
        , MAX(CASE WHEN meeting_rn = 1 THEN meeting_time END) AS first_meeting_time
        , MAX(CASE WHEN meeting_rn = 1 THEN booking_outcome END) AS first_meeting_outcome
        , MAX(booked_dt) AS last_booked_dt
        , MAX(meeting_dt) AS last_meeting_dt
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN meeting_time END) AS last_meeting_time
        , MAX(CASE WHEN meeting_rn_desc = 1 THEN booking_outcome END) AS last_meeting_outcome
        , MAX(CASE WHEN meeting_rn = 1 THEN days_in_advance END) AS booking_lead_time
        , COUNT(*) AS scheduled_count
        , SUM(CASE WHEN booking_outcome = 'Reagendado' THEN 1 ELSE 0 END) AS rescheduled_count
        , SUM(CASE WHEN booking_outcome = 'No Show' THEN 1 ELSE 0 END) AS no_show_count
        , SUM(CASE WHEN booking_outcome = 'Realizado' THEN 1 ELSE 0 END) AS completed_meeting_count
        , MAX(CASE WHEN meeting_rn = 1 AND meeting_at <= CURRENT_DATETIME('America/Sao_Paulo') THEN 1 ELSE 0 END) AS is_first_past_meeting
        , MAX(CASE WHEN meeting_rn_desc = 1 AND meeting_at <= CURRENT_DATETIME('America/Sao_Paulo') THEN 1 ELSE 0 END) AS is_last_past_meeting
    FROM booking_with_outcome
    GROUP BY ALL
)

SELECT * FROM booking_aggregated
