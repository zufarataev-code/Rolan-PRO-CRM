ALTER TABLE projects
  ADD COLUMN lead_source VARCHAR(120),
  ADD COLUMN lead_intent_service_type_id UUID;

ALTER TABLE projects
  ADD CONSTRAINT projects_lead_intent_service_type_id_fkey
  FOREIGN KEY (lead_intent_service_type_id) REFERENCES service_types(service_type_id) ON DELETE SET NULL;

CREATE INDEX projects_lead_intent_service_type_id_idx ON projects(lead_intent_service_type_id);
