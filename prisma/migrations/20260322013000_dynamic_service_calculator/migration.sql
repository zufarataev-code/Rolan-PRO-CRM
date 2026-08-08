CREATE TABLE project_position_addons (
    position_addon_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id UUID NOT NULL REFERENCES project_positions(position_id) ON DELETE CASCADE,
    service_addon_id UUID NOT NULL REFERENCES service_addons(service_addon_id) ON DELETE RESTRICT,
    quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT project_position_addons_unique UNIQUE (position_id, service_addon_id)
);

CREATE INDEX idx_project_position_addons_position_id ON project_position_addons(position_id);
CREATE INDEX idx_project_position_addons_service_addon_id ON project_position_addons(service_addon_id);
