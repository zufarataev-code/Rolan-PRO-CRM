ALTER TABLE projects ADD COLUMN site_type VARCHAR(30);
ALTER TABLE clients ADD COLUMN customer_type VARCHAR(20);

ALTER TABLE film_catalog
  ADD COLUMN technology_code VARCHAR(50),
  ADD COLUMN appearance_code VARCHAR(50),
  ADD COLUMN application_side VARCHAR(30),
  ADD COLUMN capability_tags JSONB;

ALTER TABLE measurements
  ADD COLUMN project_position_id UUID,
  ADD COLUMN supersedes_measurement_id UUID,
  ADD COLUMN recorded_by_user_id UUID,
  ADD COLUMN measurement_source VARCHAR(30),
  ADD COLUMN verification_status VARCHAR(30);

ALTER TABLE projects
  ADD CONSTRAINT projects_site_type_check
  CHECK (site_type IS NULL OR site_type IN ('RESIDENTIAL', 'COMMERCIAL'));

ALTER TABLE clients
  ADD CONSTRAINT clients_customer_type_check
  CHECK (customer_type IS NULL OR customer_type IN ('B2C', 'B2B'));

ALTER TABLE measurements
  ADD CONSTRAINT measurements_source_status_check
  CHECK (
    (measurement_source IS NULL AND verification_status IS NULL)
    OR (measurement_source = 'CUSTOMER' AND verification_status = 'UNVERIFIED')
    OR (measurement_source = 'SURVEYOR_VERIFIED' AND verification_status = 'VERIFIED')
  ),
  ADD CONSTRAINT measurements_project_position_id_fkey
  FOREIGN KEY (project_position_id) REFERENCES project_positions(position_id) ON DELETE SET NULL,
  ADD CONSTRAINT measurements_supersedes_measurement_id_fkey
  FOREIGN KEY (supersedes_measurement_id) REFERENCES measurements(measurement_id) ON DELETE SET NULL,
  ADD CONSTRAINT measurements_recorded_by_user_id_fkey
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL;

CREATE INDEX measurements_project_position_id_idx ON measurements(project_position_id);
CREATE UNIQUE INDEX measurements_supersedes_measurement_id_key ON measurements(supersedes_measurement_id);
CREATE INDEX measurements_recorded_by_user_id_idx ON measurements(recorded_by_user_id);
