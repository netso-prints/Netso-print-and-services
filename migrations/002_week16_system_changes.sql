ALTER TABLE tbl_user_address
    ADD COLUMN region VARCHAR(100) NULL AFTER address_label,
    ADD COLUMN region_code VARCHAR(20) NULL AFTER region,
    ADD COLUMN province_code VARCHAR(20) NULL AFTER province,
    ADD COLUMN city_municipality VARCHAR(100) NULL AFTER province_code,
    ADD COLUMN city_municipality_code VARCHAR(20) NULL AFTER city_municipality,
    ADD COLUMN barangay_code VARCHAR(20) NULL AFTER barangay,
    ADD COLUMN house_unit VARCHAR(150) NULL AFTER barangay_code,
    ADD COLUMN subdivision VARCHAR(150) NULL AFTER house_unit,
    ADD COLUMN postal_code VARCHAR(4) NULL AFTER subdivision,
    ADD COLUMN landmark VARCHAR(150) NULL AFTER postal_code;

ALTER TABLE tbl_services
    ADD COLUMN signage_type VARCHAR(30) NULL AFTER category_id,
    ADD COLUMN signage_config_json JSON NULL AFTER signage_type,
    ADD CONSTRAINT chk_services_signage_type CHECK (
        signage_type IS NULL OR signage_type IN ('panaprint-panaflex', 'acrylic', 'cut-out')
    );

ALTER TABLE tbl_print_order
    ADD COLUMN service_location_address TEXT NULL AFTER notes,
    ADD COLUMN service_location_classification VARCHAR(20) NULL AFTER service_location_address,
    ADD COLUMN location_charge DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER service_location_classification,
    ADD COLUMN location_psgc_code VARCHAR(20) NULL AFTER location_charge,
    ADD CONSTRAINT chk_print_order_location_classification CHECK (
        service_location_classification IS NULL OR
        service_location_classification IN ('in_area', 'outside_area')
    ),
    ADD CONSTRAINT chk_print_order_location_charge CHECK (location_charge >= 0);

INSERT INTO tbl_app_setting (setting_key, setting_value) VALUES
    ('outside_location_charge', '0'),
    ('agreement_threshold', '5000')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);
