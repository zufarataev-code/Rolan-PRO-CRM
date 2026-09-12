ALTER TABLE projects ADD COLUMN site_type VARCHAR(30);
ALTER TABLE measurements ADD COLUMN measurement_source VARCHAR(30);
ALTER TABLE measurements ADD COLUMN verification_status VARCHAR(30);
