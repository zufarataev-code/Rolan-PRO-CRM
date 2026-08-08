CREATE TABLE consultations (
    consultation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_event_id UUID UNIQUE REFERENCES calendar_events(calendar_event_id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(lead_id) ON DELETE SET NULL,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,
    assigned_consultant_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    assigned_manager_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    title VARCHAR(180) NOT NULL,
    location_address TEXT,
    scheduled_start_at TIMESTAMPTZ NOT NULL,
    scheduled_end_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    manager_notes TEXT,
    consultant_notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE surveys (
    survey_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL UNIQUE REFERENCES consultations(consultation_id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    summary_notes TEXT,
    electrical_notes TEXT,
    smart_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    solar_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    safety_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE measurements (
    measurement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES surveys(survey_id) ON DELETE CASCADE,
    room_name VARCHAR(160) NOT NULL,
    office_name VARCHAR(160),
    zone_name VARCHAR(160),
    floor VARCHAR(80),
    window_id VARCHAR(80),
    width DECIMAL(10, 2),
    height DECIMAL(10, 2),
    sqft DECIMAL(10, 2),
    glass_type VARCHAR(120),
    orientation VARCHAR(80),
    access_type VARCHAR(80),
    complexity_level_id UUID REFERENCES complexity_levels(complexity_level_id) ON DELETE SET NULL,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE survey_recommendations (
    survey_recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES surveys(survey_id) ON DELETE CASCADE,
    measurement_id UUID REFERENCES measurements(measurement_id) ON DELETE SET NULL,
    service_type_id UUID NOT NULL REFERENCES service_types(service_type_id) ON DELETE RESTRICT,
    film_id UUID REFERENCES film_catalog(film_id) ON DELETE SET NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    recommendation_notes TEXT,
    electrical_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE attachments_files
ADD COLUMN consultation_id UUID REFERENCES consultations(consultation_id) ON DELETE SET NULL,
ADD COLUMN survey_id UUID REFERENCES surveys(survey_id) ON DELETE SET NULL,
ADD COLUMN measurement_id UUID REFERENCES measurements(measurement_id) ON DELETE SET NULL;

CREATE INDEX idx_consultations_calendar_event_id ON consultations(calendar_event_id);
CREATE INDEX idx_consultations_lead_id ON consultations(lead_id);
CREATE INDEX idx_consultations_deal_id ON consultations(deal_id);
CREATE INDEX idx_consultations_client_id ON consultations(client_id);
CREATE INDEX idx_consultations_project_id ON consultations(project_id);
CREATE INDEX idx_consultations_assigned_consultant_id ON consultations(assigned_consultant_id);
CREATE INDEX idx_consultations_assigned_manager_id ON consultations(assigned_manager_id);
CREATE INDEX idx_consultations_created_by ON consultations(created_by);
CREATE INDEX idx_consultations_scheduled_start_at ON consultations(scheduled_start_at);
CREATE INDEX idx_surveys_status ON surveys(status);
CREATE INDEX idx_measurements_survey_id ON measurements(survey_id);
CREATE INDEX idx_measurements_complexity_level_id ON measurements(complexity_level_id);
CREATE INDEX idx_survey_recommendations_survey_id ON survey_recommendations(survey_id);
CREATE INDEX idx_survey_recommendations_measurement_id ON survey_recommendations(measurement_id);
CREATE INDEX idx_survey_recommendations_service_type_id ON survey_recommendations(service_type_id);
CREATE INDEX idx_survey_recommendations_film_id ON survey_recommendations(film_id);
CREATE INDEX idx_attachments_files_consultation_id ON attachments_files(consultation_id);
CREATE INDEX idx_attachments_files_survey_id ON attachments_files(survey_id);
CREATE INDEX idx_attachments_files_measurement_id ON attachments_files(measurement_id);
