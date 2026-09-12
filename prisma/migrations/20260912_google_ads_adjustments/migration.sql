CREATE TABLE conversion_adjustments (
  conversion_adjustment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_event_id UUID REFERENCES conversion_events(conversion_event_id) ON DELETE RESTRICT,
  adjustment_type VARCHAR(20) NOT NULL,
  financial_reference_id VARCHAR(191) NOT NULL,
  original_transaction_id VARCHAR(191) NOT NULL,
  adjusted_value NUMERIC(14,2),
  currency VARCHAR(3),
  reason VARCHAR(255),
  occurred_at TIMESTAMP WITH TIME ZONE(6) NOT NULL,
  created_by_user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE(6) DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE(6) DEFAULT now(),
  UNIQUE (conversion_event_id, financial_reference_id, adjustment_type),
  INDEX (original_transaction_id)
);

CREATE TABLE conversion_adjustment_outbox (
  conversion_adjustment_outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_adjustment_id UUID REFERENCES conversion_adjustments(conversion_adjustment_id) ON DELETE CASCADE,
  destination_account_id VARCHAR(64) NOT NULL,
  action_id VARCHAR(64) NOT NULL,
  original_transaction_id VARCHAR(191) NOT NULL,
  processing_status VARCHAR(40) DEFAULT 'queued',
  attempts INT DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE(6) DEFAULT now(),
  submitted_at TIMESTAMP WITH TIME ZONE(6),
  request_id VARCHAR(191),
  last_error JSON,
  created_at TIMESTAMP WITH TIME ZONE(6) DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE(6) DEFAULT now(),
  UNIQUE (destination_account_id, action_id, original_transaction_id, conversion_adjustment_id),
  INDEX (processing_status, next_retry_at),
  INDEX (conversion_adjustment_id)
);
