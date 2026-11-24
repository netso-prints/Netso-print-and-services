ALTER TABLE tbl_app_setting
    MODIFY COLUMN setting_value TEXT NOT NULL;

ALTER TABLE tbl_print_order
    ADD COLUMN signage_details_json JSON NULL AFTER finish,
    ADD COLUMN agreement_terms_snapshot TEXT NULL AFTER location_psgc_code,
    ADD COLUMN agreement_terms_version_snapshot VARCHAR(60) NULL AFTER agreement_terms_snapshot;

INSERT INTO tbl_app_setting (setting_key, setting_value) VALUES
    ('unnamed_street_fallback', 'If there is no named street, enter a clear location description.'),
    ('unnumbered_premises_fallback', 'If the premises have no number, enter a clear house or premises description.'),
    ('prefill_partial_legacy_addresses', '0'),
    ('agreement_threshold_includes_location_charge', '1'),
    ('agreement_threshold_inclusive', '1'),
    ('outside_location_charge', '0'),
    ('agreement_threshold', '5000'),
    ('inside_area_city_codes', ''),
    ('allow_job_site_address', '0'),
    ('agreement_statuses', 'In Pre-Press,In Production,Ready for Pickup,Completed'),
    ('agreement_terms', 'The parties confirm the saved order specifications and amount. NETSO may proceed only after production authorization.'),
    ('agreement_terms_version', 'draft-1')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
