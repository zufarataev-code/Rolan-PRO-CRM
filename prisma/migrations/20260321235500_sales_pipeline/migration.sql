CREATE TABLE pipeline_statuses (
    pipeline_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code VARCHAR(60) NOT NULL UNIQUE,
    name_ru VARCHAR(140) NOT NULL,
    name_en VARCHAR(140) NOT NULL,
    stage_group VARCHAR(40) NOT NULL,
    color_token VARCHAR(50),
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leads
ADD COLUMN pipeline_status_id UUID;

ALTER TABLE deals
ADD COLUMN pipeline_status_id UUID;

CREATE TABLE follow_ups (
    follow_up_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(lead_id) ON DELETE CASCADE,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE CASCADE,
    type_key VARCHAR(50) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'scheduled',
    due_at TIMESTAMPTZ NOT NULL,
    notes TEXT,
    outcome TEXT,
    assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(lead_id) ON DELETE CASCADE,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE CASCADE,
    entity_type VARCHAR(60),
    entity_id UUID,
    title VARCHAR(180) NOT NULL,
    description TEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    priority VARCHAR(30) NOT NULL DEFAULT 'normal',
    due_at TIMESTAMPTZ,
    assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pipeline_statuses (status_code, name_ru, name_en, stage_group, color_token, is_closed, sort_order)
VALUES
    ('NEW_LEAD', 'Новый лид', 'New Lead', 'active', 'slate', FALSE, 1),
    ('CONTACTED', 'Контакт установлен', 'Contacted', 'active', 'blue', FALSE, 2),
    ('CONSULTATION_SCHEDULED', 'Консультация назначена', 'Consultation Scheduled', 'active', 'amber', FALSE, 3),
    ('CONSULTATION_COMPLETED', 'Консультация проведена', 'Consultation Completed', 'active', 'yellow', FALSE, 4),
    ('SURVEY_COMPLETED', 'Замер завершен', 'Survey Completed', 'active', 'indigo', FALSE, 5),
    ('PROPOSAL_DRAFT', 'Proposal черновик', 'Proposal Draft', 'active', 'violet', FALSE, 6),
    ('PROPOSAL_SENT', 'Proposal отправлен', 'Proposal Sent', 'active', 'purple', FALSE, 7),
    ('PROPOSAL_UPDATED_BY_CLIENT', 'Proposal обновлен клиентом', 'Proposal Updated by Client', 'active', 'fuchsia', FALSE, 8),
    ('AGREEMENT_SIGNED', 'Agreement подписан', 'Agreement Signed', 'active', 'emerald', FALSE, 9),
    ('DEPOSIT_PENDING', 'Депозит ожидается', 'Deposit Pending', 'active', 'orange', FALSE, 10),
    ('DEPOSIT_PAID', 'Депозит оплачен', 'Deposit Paid', 'active', 'green', FALSE, 11),
    ('PROJECT_CREATED', 'Проект создан', 'Project Created', 'active', 'blue', FALSE, 12),
    ('SCHEDULED', 'Запланировано', 'Scheduled', 'active', 'cyan', FALSE, 13),
    ('IN_PROGRESS', 'В работе', 'In Progress', 'active', 'lime', FALSE, 14),
    ('COMPLETED', 'Завершено', 'Completed', 'active', 'teal', FALSE, 15),
    ('FINAL_PAYMENT_PENDING', 'Финальный платеж ожидается', 'Final Payment Pending', 'active', 'amber', FALSE, 16),
    ('PAID', 'Оплачено', 'Paid', 'won', 'green', TRUE, 17),
    ('CLOSED_WON', 'Сделка выиграна', 'Closed Won', 'won', 'emerald', TRUE, 18),
    ('CLOSED_LOST', 'Сделка проиграна', 'Closed Lost', 'lost', 'red', TRUE, 19),
    ('WARRANTY_SERVICE', 'Гарантия / Сервис', 'Warranty / Service', 'service', 'orange', FALSE, 20);

UPDATE leads
SET pipeline_status_id = (
    SELECT pipeline_status_id
    FROM pipeline_statuses
    WHERE status_code = 'NEW_LEAD'
)
WHERE pipeline_status_id IS NULL;

UPDATE deals
SET pipeline_status_id = (
    SELECT pipeline_status_id
    FROM pipeline_statuses
    WHERE status_code = 'NEW_LEAD'
)
WHERE pipeline_status_id IS NULL;

ALTER TABLE leads
ALTER COLUMN pipeline_status_id SET NOT NULL;

ALTER TABLE deals
ALTER COLUMN pipeline_status_id SET NOT NULL;

ALTER TABLE leads
ADD CONSTRAINT leads_pipeline_status_id_fkey
FOREIGN KEY (pipeline_status_id) REFERENCES pipeline_statuses(pipeline_status_id) ON DELETE RESTRICT;

ALTER TABLE deals
ADD CONSTRAINT deals_pipeline_status_id_fkey
FOREIGN KEY (pipeline_status_id) REFERENCES pipeline_statuses(pipeline_status_id) ON DELETE RESTRICT;

ALTER TABLE leads
DROP COLUMN status;

ALTER TABLE deals
DROP COLUMN stage;

CREATE INDEX idx_leads_pipeline_status_id ON leads(pipeline_status_id);
CREATE INDEX idx_deals_pipeline_status_id ON deals(pipeline_status_id);
CREATE INDEX idx_follow_ups_lead_id ON follow_ups(lead_id);
CREATE INDEX idx_follow_ups_deal_id ON follow_ups(deal_id);
CREATE INDEX idx_follow_ups_assigned_to ON follow_ups(assigned_to);
CREATE INDEX idx_follow_ups_created_by ON follow_ups(created_by);
CREATE INDEX idx_follow_ups_due_at ON follow_ups(due_at);
CREATE INDEX idx_tasks_lead_id ON tasks(lead_id);
CREATE INDEX idx_tasks_deal_id ON tasks(deal_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
