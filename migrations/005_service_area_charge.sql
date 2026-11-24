ALTER TABLE tbl_services
    ADD COLUMN outside_area_charge_applies BOOLEAN NOT NULL DEFAULT FALSE
    AFTER is_active;

UPDATE tbl_services
SET outside_area_charge_applies = TRUE
WHERE service_code = 'tarpaulin';
