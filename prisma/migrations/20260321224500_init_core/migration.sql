CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    description_ru TEXT,
    description_en TEXT,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(191) NOT NULL UNIQUE,
    full_name VARCHAR(160) NOT NULL,
    password_hash TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_access (
    user_access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_access_user_role_unique UNIQUE (user_id, role_id)
);

CREATE TABLE service_types (
    service_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    unit_type VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_field_config (
    service_field_config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type_id UUID NOT NULL REFERENCES service_types(service_type_id) ON DELETE CASCADE,
    field_key VARCHAR(80) NOT NULL,
    field_label_ru VARCHAR(160) NOT NULL,
    field_label_en VARCHAR(160) NOT NULL,
    input_type VARCHAR(50) NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    dropdown_source VARCHAR(80),
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    default_value JSONB,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT service_field_config_service_field_unique UNIQUE (service_type_id, field_key)
);

CREATE TABLE service_addons (
    service_addon_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type_id UUID NOT NULL REFERENCES service_types(service_type_id) ON DELETE CASCADE,
    addon_code VARCHAR(50) NOT NULL,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    unit_type VARCHAR(50) NOT NULL,
    default_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT service_addons_service_addon_unique UNIQUE (service_type_id, addon_code)
);

CREATE TABLE film_catalog (
    film_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_code VARCHAR(50) NOT NULL,
    category_name_ru VARCHAR(120) NOT NULL,
    category_name_en VARCHAR(120) NOT NULL,
    brand_code VARCHAR(50) NOT NULL,
    brand_name_ru VARCHAR(120) NOT NULL,
    brand_name_en VARCHAR(120) NOT NULL,
    model_code VARCHAR(80) NOT NULL UNIQUE,
    model_name_ru VARCHAR(120) NOT NULL,
    model_name_en VARCHAR(120) NOT NULL,
    thickness VARCHAR(50),
    unit VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_statuses (
    project_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    color_token VARCHAR(50),
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_statuses (
    payment_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    color_token VARCHAR(50),
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE position_statuses (
    position_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    color_token VARCHAR(50),
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE event_types (
    event_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    color_token VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE event_tracks (
    event_track_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    color_token VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE complexity_levels (
    complexity_level_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    numeric_rank INTEGER NOT NULL DEFAULT 1,
    multiplier DECIMAL(6, 2) NOT NULL DEFAULT 1,
    color_token VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cities (
    city_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    state_code VARCHAR(20),
    default_zip_code VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE document_types (
    document_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_code VARCHAR(50) NOT NULL UNIQUE,
    name_ru VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE leads (
    lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_code VARCHAR(40) UNIQUE,
    name VARCHAR(160) NOT NULL,
    phone VARCHAR(40),
    email VARCHAR(191),
    source VARCHAR(120),
    status VARCHAR(50) NOT NULL DEFAULT 'new_lead',
    city_id UUID REFERENCES cities(city_id) ON DELETE SET NULL,
    assigned_manager_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clients (
    client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_code VARCHAR(40) UNIQUE,
    name VARCHAR(160) NOT NULL,
    phone VARCHAR(40),
    email VARCHAR(191),
    billing_address TEXT,
    service_address TEXT,
    city_id UUID REFERENCES cities(city_id) ON DELETE SET NULL,
    zip_code VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deals (
    deal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_code VARCHAR(40) UNIQUE,
    lead_id UUID REFERENCES leads(lead_id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
    assigned_manager_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL,
    stage VARCHAR(50) NOT NULL DEFAULT 'new_lead',
    estimated_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_code VARCHAR(40) UNIQUE,
    client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE SET NULL,
    manager_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    lead_installer_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    project_status_id UUID NOT NULL REFERENCES project_statuses(project_status_id) ON DELETE RESTRICT,
    payment_status_id UUID REFERENCES payment_statuses(payment_status_id) ON DELETE SET NULL,
    city_id UUID REFERENCES cities(city_id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL,
    address TEXT,
    zip_code VARCHAR(20),
    install_date DATE,
    start_time TIME,
    end_time TIME,
    priority VARCHAR(30) NOT NULL DEFAULT 'normal',
    problem_flag BOOLEAN NOT NULL DEFAULT FALSE,
    manager_notes TEXT,
    installer_notes TEXT,
    what_to_bring TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_positions (
    position_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    service_type_id UUID NOT NULL REFERENCES service_types(service_type_id) ON DELETE RESTRICT,
    film_id UUID REFERENCES film_catalog(film_id) ON DELETE SET NULL,
    position_status_id UUID NOT NULL REFERENCES position_statuses(position_status_id) ON DELETE RESTRICT,
    complexity_level_id UUID REFERENCES complexity_levels(complexity_level_id) ON DELETE SET NULL,
    title VARCHAR(160),
    dynamic_fields JSONB,
    pricing_source VARCHAR(50) NOT NULL DEFAULT 'manual',
    base_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    min_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    actual_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE calendar_events (
    calendar_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type_id UUID NOT NULL REFERENCES event_types(event_type_id) ON DELETE RESTRICT,
    event_track_id UUID REFERENCES event_tracks(event_track_id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(lead_id) ON DELETE SET NULL,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    color_token VARCHAR(50),
    is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
    problem_flag BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE installer_jobs (
    installer_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    position_id UUID REFERENCES project_positions(position_id) ON DELETE SET NULL,
    calendar_event_id UUID REFERENCES calendar_events(calendar_event_id) ON DELETE SET NULL,
    installer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'assigned',
    on_the_way_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    before_photos_required BOOLEAN NOT NULL DEFAULT FALSE,
    after_photos_required BOOLEAN NOT NULL DEFAULT FALSE,
    checklist_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completion_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    installer_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE attachments_files (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(lead_id) ON DELETE SET NULL,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,
    position_id UUID REFERENCES project_positions(position_id) ON DELETE SET NULL,
    calendar_event_id UUID REFERENCES calendar_events(calendar_event_id) ON DELETE SET NULL,
    installer_job_id UUID REFERENCES installer_jobs(installer_job_id) ON DELETE SET NULL,
    uploaded_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    file_type VARCHAR(50) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    storage_provider VARCHAR(50) NOT NULL DEFAULT 's3',
    storage_bucket VARCHAR(120),
    storage_key VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(120),
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,
    document_type_id UUID NOT NULL REFERENCES document_types(document_type_id) ON DELETE RESTRICT,
    file_id UUID REFERENCES attachments_files(file_id) ON DELETE SET NULL,
    title VARCHAR(180) NOT NULL,
    language_code VARCHAR(5) NOT NULL DEFAULT 'en',
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE activity_log (
    activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id UUID,
    project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,
    action_key VARCHAR(80) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    entity_type VARCHAR(60),
    entity_id UUID,
    type_key VARCHAR(80) NOT NULL,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE email_actions (
    email_action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(60) NOT NULL,
    entity_id UUID,
    recipient_email VARCHAR(191) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_access_role_id ON user_access(role_id);
CREATE INDEX idx_leads_city_id ON leads(city_id);
CREATE INDEX idx_leads_assigned_manager_id ON leads(assigned_manager_id);
CREATE INDEX idx_clients_city_id ON clients(city_id);
CREATE INDEX idx_deals_lead_id ON deals(lead_id);
CREATE INDEX idx_deals_client_id ON deals(client_id);
CREATE INDEX idx_deals_assigned_manager_id ON deals(assigned_manager_id);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_deal_id ON projects(deal_id);
CREATE INDEX idx_projects_manager_id ON projects(manager_id);
CREATE INDEX idx_projects_lead_installer_id ON projects(lead_installer_id);
CREATE INDEX idx_projects_project_status_id ON projects(project_status_id);
CREATE INDEX idx_projects_payment_status_id ON projects(payment_status_id);
CREATE INDEX idx_projects_city_id ON projects(city_id);
CREATE INDEX idx_project_positions_project_id ON project_positions(project_id);
CREATE INDEX idx_project_positions_service_type_id ON project_positions(service_type_id);
CREATE INDEX idx_project_positions_film_id ON project_positions(film_id);
CREATE INDEX idx_project_positions_position_status_id ON project_positions(position_status_id);
CREATE INDEX idx_project_positions_complexity_level_id ON project_positions(complexity_level_id);
CREATE INDEX idx_calendar_events_event_type_id ON calendar_events(event_type_id);
CREATE INDEX idx_calendar_events_event_track_id ON calendar_events(event_track_id);
CREATE INDEX idx_calendar_events_lead_id ON calendar_events(lead_id);
CREATE INDEX idx_calendar_events_deal_id ON calendar_events(deal_id);
CREATE INDEX idx_calendar_events_project_id ON calendar_events(project_id);
CREATE INDEX idx_calendar_events_assigned_user_id ON calendar_events(assigned_user_id);
CREATE INDEX idx_installer_jobs_project_id ON installer_jobs(project_id);
CREATE INDEX idx_installer_jobs_position_id ON installer_jobs(position_id);
CREATE INDEX idx_installer_jobs_calendar_event_id ON installer_jobs(calendar_event_id);
CREATE INDEX idx_installer_jobs_installer_id ON installer_jobs(installer_id);
CREATE INDEX idx_attachments_files_lead_id ON attachments_files(lead_id);
CREATE INDEX idx_attachments_files_deal_id ON attachments_files(deal_id);
CREATE INDEX idx_attachments_files_project_id ON attachments_files(project_id);
CREATE INDEX idx_attachments_files_position_id ON attachments_files(position_id);
CREATE INDEX idx_attachments_files_calendar_event_id ON attachments_files(calendar_event_id);
CREATE INDEX idx_attachments_files_installer_job_id ON attachments_files(installer_job_id);
CREATE INDEX idx_attachments_files_uploaded_by ON attachments_files(uploaded_by);
CREATE INDEX idx_documents_client_id ON documents(client_id);
CREATE INDEX idx_documents_deal_id ON documents(deal_id);
CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_document_type_id ON documents(document_type_id);
CREATE INDEX idx_documents_file_id ON documents(file_id);
CREATE INDEX idx_documents_created_by ON documents(created_by);
CREATE INDEX idx_activity_log_actor_user_id ON activity_log(actor_user_id);
CREATE INDEX idx_activity_log_project_id ON activity_log(project_id);
CREATE INDEX idx_notifications_recipient_user_id ON notifications(recipient_user_id);
CREATE INDEX idx_notifications_actor_user_id ON notifications(actor_user_id);
CREATE INDEX idx_email_actions_created_by ON email_actions(created_by);
