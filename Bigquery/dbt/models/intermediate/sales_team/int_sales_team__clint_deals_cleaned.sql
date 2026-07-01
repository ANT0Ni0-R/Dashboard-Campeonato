{{
    config (
        materialized = "view"
        , meta = {'owner': 'arthur.haro'}
        , tags = ["clint"]
    )
}}

WITH

deals AS ( SELECT * FROM {{ source('staging_clint', 'stg_clint__deals') }} )
, contacts AS ( SELECT * FROM {{ source('staging_clint', 'stg_clint__contacts') }} )
, lost_status AS ( SELECT * FROM {{ source('staging_clint', 'stg_clint__lost_status') }} )
, origins AS ( SELECT * FROM {{ source('staging_clint', 'stg_clint__origins') }} )
, seller_pmp AS ( SELECT * FROM {{ source('staging_google_sheets', 'stg_google_sheets__map_sellers_tvd') }} )
, map_rules AS ( SELECT * FROM {{ source('staging_google_sheets', 'stg_google_sheets__map_clint_deal_entry') }} )

, contact_tags AS (
    SELECT
        c.contact_email
        , ARRAY(
            SELECT TRIM(t.name)
            FROM UNNEST(c.tags) AS t
            WHERE t.name IS NOT NULL
        ) AS tag_names
    FROM contacts AS c
)

, join_all AS (
    SELECT
        d.deal_id
        , d.contact_id
        , o.group_name
        , o.origin_name
        , m.deal_entry
        , m.product_group
        , d.created_at
        , d.updated_at
        , d.won_at
        , d.lost_at
        , d.user_name AS owner_name
        , d.user_email AS owner_email
        , d.sdr_email
        , d.closer_email
        , map_user.seller_pmp AS owner_pmp
        , map_sdr.seller_pmp AS sdr_pmp
        , map_closer.seller_pmp AS closer_pmp
        , d.contact_email
        , d.contact_name
        , d.contact_phone
        , d.deal_stage
        , d.deal_status
        , o.stage_order
        , l.lost_status_name
        , CASE
            WHEN o.group_name = 'Portfel [TVD 6]' THEN
                (
                    SELECT ANY_VALUE(t)
                    FROM UNNEST(ct.tag_names) AS t
                    WHERE UPPER(t) LIKE 'PORTFEL:%' AND UPPER(t) LIKE '%TIER%'
                )
        END AS portfel_tag
        , JSON_VALUE(d.fields, '$.origem_comercial') AS origem_comercial
        , JSON_VALUE(d.fields, '$.tier') AS deal_tier
        , JSON_VALUE(d.fields, '$.tier_criterio') AS deal_tier_criterio
        , ct.tag_names
        , d.fields
        , d._python_synced

    FROM deals AS d
    LEFT JOIN lost_status AS l ON d.lost_status_id = l.lost_status_id
    LEFT JOIN origins AS o ON d.stage_id = o.stage_id AND d.origin_id = o.origin_id
    LEFT JOIN contact_tags AS ct ON d.contact_email = ct.contact_email
    LEFT JOIN seller_pmp AS map_user ON d.user_email = map_user.seller_email
    LEFT JOIN seller_pmp AS map_closer ON d.closer_email = map_closer.seller_email
    LEFT JOIN seller_pmp AS map_sdr ON d.sdr_email = map_sdr.seller_email
    LEFT JOIN map_rules AS m
        ON o.group_name = m.group_name
        AND o.origin_name = m.origin_name
        AND (
            COALESCE(NULLIF(TRIM(m.tag_name), ''), '-') = '-'
            OR m.tag_name IN UNNEST(ct.tag_names)
        )
        AND (
            COALESCE(NULLIF(TRIM(m.origem_comercial), ''), '-') = '-'
            OR m.origem_comercial = JSON_VALUE(d.fields, '$.origem_comercial')
        )

    WHERE
        d.deal_id IS NOT NULL
        AND o.group_name <> 'Ultra Black Friday Infinita'
    QUALIFY ROW_NUMBER() OVER (PARTITION BY d.deal_id ORDER BY m.priority) = 1
)

SELECT * FROM join_all
