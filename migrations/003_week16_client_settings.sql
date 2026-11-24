-- Values the client must confirm. Defaults are proposals and can be changed here without a code change.
-- inside_area_city_codes: comma-separated 10-digit PSGC city/municipality codes treated as in-area
--   in addition to Santiago City (0203135000). Leave empty until the client approves nearby locations.
-- allow_job_site_address: 1 lets customers enter a separate job site address; 0 uses the profile address only.
-- agreement_statuses: comma-separated order statuses that can download the agreement.
-- agreement_terms / agreement_terms_version: terms text and version printed on the agreement PDF.
INSERT INTO tbl_app_setting (setting_key, setting_value) VALUES
    ('inside_area_city_codes', ''),
    ('allow_job_site_address', '0'),
    ('agreement_statuses', 'In Pre-Press,In Production,Ready for Pickup,Completed'),
    ('agreement_terms', 'The parties confirm the saved order specifications and amount. NETSO may proceed only after production authorization.'),
    ('agreement_terms_version', 'draft-1')
ON DUPLICATE KEY UPDATE setting_key = setting_key;