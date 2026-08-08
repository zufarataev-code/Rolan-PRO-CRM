-- DropForeignKey
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_actor_user_id_fkey";

-- DropForeignKey
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_project_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_calendar_event_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_consultation_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_installer_job_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_measurement_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_position_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_project_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_survey_id_fkey";

-- DropForeignKey
ALTER TABLE "attachments_files" DROP CONSTRAINT "attachments_files_uploaded_by_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_assigned_user_id_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_event_track_id_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_event_type_id_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_project_id_fkey";

-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_city_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_assigned_consultant_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_assigned_manager_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_calendar_event_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_client_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_created_by_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_project_id_fkey";

-- DropForeignKey
ALTER TABLE "deals" DROP CONSTRAINT "deals_assigned_manager_id_fkey";

-- DropForeignKey
ALTER TABLE "deals" DROP CONSTRAINT "deals_client_id_fkey";

-- DropForeignKey
ALTER TABLE "deals" DROP CONSTRAINT "deals_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "deals" DROP CONSTRAINT "deals_pipeline_status_id_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_client_id_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_created_by_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_document_type_id_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_file_id_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_project_id_fkey";

-- DropForeignKey
ALTER TABLE "email_actions" DROP CONSTRAINT "email_actions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "follow_ups" DROP CONSTRAINT "follow_ups_assigned_to_fkey";

-- DropForeignKey
ALTER TABLE "follow_ups" DROP CONSTRAINT "follow_ups_created_by_fkey";

-- DropForeignKey
ALTER TABLE "follow_ups" DROP CONSTRAINT "follow_ups_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "follow_ups" DROP CONSTRAINT "follow_ups_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "installer_jobs" DROP CONSTRAINT "installer_jobs_calendar_event_id_fkey";

-- DropForeignKey
ALTER TABLE "installer_jobs" DROP CONSTRAINT "installer_jobs_installer_id_fkey";

-- DropForeignKey
ALTER TABLE "installer_jobs" DROP CONSTRAINT "installer_jobs_position_id_fkey";

-- DropForeignKey
ALTER TABLE "installer_jobs" DROP CONSTRAINT "installer_jobs_project_id_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_assigned_manager_id_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_city_id_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_pipeline_status_id_fkey";

-- DropForeignKey
ALTER TABLE "measurements" DROP CONSTRAINT "measurements_complexity_level_id_fkey";

-- DropForeignKey
ALTER TABLE "measurements" DROP CONSTRAINT "measurements_survey_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_actor_user_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_recipient_user_id_fkey";

-- DropForeignKey
ALTER TABLE "project_position_addons" DROP CONSTRAINT "project_position_addons_position_id_fkey";

-- DropForeignKey
ALTER TABLE "project_position_addons" DROP CONSTRAINT "project_position_addons_service_addon_id_fkey";

-- DropForeignKey
ALTER TABLE "project_positions" DROP CONSTRAINT "project_positions_complexity_level_id_fkey";

-- DropForeignKey
ALTER TABLE "project_positions" DROP CONSTRAINT "project_positions_film_id_fkey";

-- DropForeignKey
ALTER TABLE "project_positions" DROP CONSTRAINT "project_positions_position_status_id_fkey";

-- DropForeignKey
ALTER TABLE "project_positions" DROP CONSTRAINT "project_positions_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_positions" DROP CONSTRAINT "project_positions_service_type_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_city_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_client_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_lead_installer_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_manager_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_payment_status_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_project_status_id_fkey";

-- DropForeignKey
ALTER TABLE "service_addons" DROP CONSTRAINT "service_addons_service_type_id_fkey";

-- DropForeignKey
ALTER TABLE "service_field_config" DROP CONSTRAINT "service_field_config_service_type_id_fkey";

-- DropForeignKey
ALTER TABLE "survey_recommendations" DROP CONSTRAINT "survey_recommendations_film_id_fkey";

-- DropForeignKey
ALTER TABLE "survey_recommendations" DROP CONSTRAINT "survey_recommendations_measurement_id_fkey";

-- DropForeignKey
ALTER TABLE "survey_recommendations" DROP CONSTRAINT "survey_recommendations_service_type_id_fkey";

-- DropForeignKey
ALTER TABLE "survey_recommendations" DROP CONSTRAINT "survey_recommendations_survey_id_fkey";

-- DropForeignKey
ALTER TABLE "surveys" DROP CONSTRAINT "surveys_consultation_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assigned_to_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_created_by_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_deal_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "user_access" DROP CONSTRAINT "user_access_role_id_fkey";

-- DropForeignKey
ALTER TABLE "user_access" DROP CONSTRAINT "user_access_user_id_fkey";

-- AlterTable
ALTER TABLE "calendar_events" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "cities" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "complexity_levels" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "consultations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "deals" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "document_types" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "event_tracks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "event_types" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "film_catalog" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "follow_ups" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "installer_jobs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "measurements" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payment_statuses" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pipeline_statuses" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "position_statuses" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "project_position_addons" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "project_positions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "project_statuses" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "service_addons" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "service_field_config" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "service_types" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "survey_recommendations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "surveys" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_access" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "proposals" (
    "proposal_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proposal_code" VARCHAR(40),
    "deal_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "survey_id" UUID,
    "created_by" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "access_token" VARCHAR(120) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "subtotal_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "selected_total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "client_message" TEXT,
    "notes" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "client_viewed_at" TIMESTAMPTZ(6),
    "client_updated_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("proposal_id")
);

-- CreateTable
CREATE TABLE "proposal_items" (
    "proposal_item_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proposal_id" UUID NOT NULL,
    "measurement_id" UUID,
    "service_type_id" UUID NOT NULL,
    "film_id" UUID,
    "item_kind" VARCHAR(40) NOT NULL DEFAULT 'service',
    "room_name" VARCHAR(160),
    "zone_name" VARCHAR(160),
    "window_id" VARCHAR(80),
    "title_ru" VARCHAR(180) NOT NULL,
    "title_en" VARCHAR(180) NOT NULL,
    "description_ru" TEXT,
    "description_en" TEXT,
    "measurement_snapshot" JSONB,
    "dynamic_fields" JSONB,
    "addons_snapshot" JSONB,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unit_label" VARCHAR(50),
    "line_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "client_selected" BOOLEAN NOT NULL DEFAULT true,
    "selection_updated_at" TIMESTAMPTZ(6),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "proposal_items_pkey" PRIMARY KEY ("proposal_item_id")
);

-- CreateTable
CREATE TABLE "proposal_events" (
    "proposal_event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proposal_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_type" VARCHAR(30) NOT NULL DEFAULT 'manager',
    "event_key" VARCHAR(80) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_events_pkey" PRIMARY KEY ("proposal_event_id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "agreement_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proposal_id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "signer_name" VARCHAR(160),
    "signer_email" VARCHAR(191),
    "signer_title" VARCHAR(160),
    "signature_text" TEXT,
    "client_notes" TEXT,
    "accepted_terms" BOOLEAN NOT NULL DEFAULT false,
    "signed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("agreement_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposals_proposal_code_key" ON "proposals"("proposal_code");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_access_token_key" ON "proposals"("access_token");

-- CreateIndex
CREATE INDEX "proposals_deal_id_idx" ON "proposals"("deal_id");

-- CreateIndex
CREATE INDEX "proposals_client_id_idx" ON "proposals"("client_id");

-- CreateIndex
CREATE INDEX "proposals_survey_id_idx" ON "proposals"("survey_id");

-- CreateIndex
CREATE INDEX "proposals_created_by_idx" ON "proposals"("created_by");

-- CreateIndex
CREATE INDEX "proposals_status_idx" ON "proposals"("status");

-- CreateIndex
CREATE INDEX "proposal_items_proposal_id_idx" ON "proposal_items"("proposal_id");

-- CreateIndex
CREATE INDEX "proposal_items_measurement_id_idx" ON "proposal_items"("measurement_id");

-- CreateIndex
CREATE INDEX "proposal_items_service_type_id_idx" ON "proposal_items"("service_type_id");

-- CreateIndex
CREATE INDEX "proposal_items_film_id_idx" ON "proposal_items"("film_id");

-- CreateIndex
CREATE INDEX "proposal_events_proposal_id_idx" ON "proposal_events"("proposal_id");

-- CreateIndex
CREATE INDEX "proposal_events_actor_user_id_idx" ON "proposal_events"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_proposal_id_key" ON "agreements"("proposal_id");

-- CreateIndex
CREATE INDEX "agreements_status_idx" ON "agreements"("status");

-- AddForeignKey
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_field_config" ADD CONSTRAINT "service_field_config_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("service_type_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_addons" ADD CONSTRAINT "service_addons_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("service_type_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("city_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_pipeline_status_id_fkey" FOREIGN KEY ("pipeline_status_id") REFERENCES "pipeline_statuses"("pipeline_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_manager_id_fkey" FOREIGN KEY ("assigned_manager_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("city_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_manager_id_fkey" FOREIGN KEY ("assigned_manager_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_status_id_fkey" FOREIGN KEY ("pipeline_status_id") REFERENCES "pipeline_statuses"("pipeline_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("deal_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_installer_id_fkey" FOREIGN KEY ("lead_installer_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_status_id_fkey" FOREIGN KEY ("project_status_id") REFERENCES "project_statuses"("project_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_payment_status_id_fkey" FOREIGN KEY ("payment_status_id") REFERENCES "payment_statuses"("payment_status_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("city_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_positions" ADD CONSTRAINT "project_positions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_positions" ADD CONSTRAINT "project_positions_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("service_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_positions" ADD CONSTRAINT "project_positions_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "film_catalog"("film_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_positions" ADD CONSTRAINT "project_positions_position_status_id_fkey" FOREIGN KEY ("position_status_id") REFERENCES "position_statuses"("position_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_positions" ADD CONSTRAINT "project_positions_complexity_level_id_fkey" FOREIGN KEY ("complexity_level_id") REFERENCES "complexity_levels"("complexity_level_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_position_addons" ADD CONSTRAINT "project_position_addons_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "project_positions"("position_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_position_addons" ADD CONSTRAINT "project_position_addons_service_addon_id_fkey" FOREIGN KEY ("service_addon_id") REFERENCES "service_addons"("service_addon_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("event_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_event_track_id_fkey" FOREIGN KEY ("event_track_id") REFERENCES "event_tracks"("event_track_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("deal_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installer_jobs" ADD CONSTRAINT "installer_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installer_jobs" ADD CONSTRAINT "installer_jobs_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "project_positions"("position_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installer_jobs" ADD CONSTRAINT "installer_jobs_calendar_event_id_fkey" FOREIGN KEY ("calendar_event_id") REFERENCES "calendar_events"("calendar_event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installer_jobs" ADD CONSTRAINT "installer_jobs_installer_id_fkey" FOREIGN KEY ("installer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_calendar_event_id_fkey" FOREIGN KEY ("calendar_event_id") REFERENCES "calendar_events"("calendar_event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("deal_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_assigned_consultant_id_fkey" FOREIGN KEY ("assigned_consultant_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_assigned_manager_id_fkey" FOREIGN KEY ("assigned_manager_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("consultation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("survey_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_complexity_level_id_fkey" FOREIGN KEY ("complexity_level_id") REFERENCES "complexity_levels"("complexity_level_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("deal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("survey_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("proposal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_measurement_id_fkey" FOREIGN KEY ("measurement_id") REFERENCES "measurements"("measurement_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("service_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "film_catalog"("film_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_events" ADD CONSTRAINT "proposal_events_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("proposal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_events" ADD CONSTRAINT "proposal_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("proposal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_recommendations" ADD CONSTRAINT "survey_recommendations_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("survey_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_recommendations" ADD CONSTRAINT "survey_recommendations_measurement_id_fkey" FOREIGN KEY ("measurement_id") REFERENCES "measurements"("measurement_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_recommendations" ADD CONSTRAINT "survey_recommendations_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("service_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_recommendations" ADD CONSTRAINT "survey_recommendations_film_id_fkey" FOREIGN KEY ("film_id") REFERENCES "film_catalog"("film_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("deal_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "project_positions"("position_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_calendar_event_id_fkey" FOREIGN KEY ("calendar_event_id") REFERENCES "calendar_events"("calendar_event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("consultation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("survey_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_measurement_id_fkey" FOREIGN KEY ("measurement_id") REFERENCES "measurements"("measurement_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_installer_job_id_fkey" FOREIGN KEY ("installer_job_id") REFERENCES "installer_jobs"("installer_job_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments_files" ADD CONSTRAINT "attachments_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("deal_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("document_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "attachments_files"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_actions" ADD CONSTRAINT "email_actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("deal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("deal_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_activity_log_actor_user_id" RENAME TO "activity_log_actor_user_id_idx";

-- RenameIndex
ALTER INDEX "idx_activity_log_project_id" RENAME TO "activity_log_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_calendar_event_id" RENAME TO "attachments_files_calendar_event_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_consultation_id" RENAME TO "attachments_files_consultation_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_deal_id" RENAME TO "attachments_files_deal_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_installer_job_id" RENAME TO "attachments_files_installer_job_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_lead_id" RENAME TO "attachments_files_lead_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_measurement_id" RENAME TO "attachments_files_measurement_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_position_id" RENAME TO "attachments_files_position_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_project_id" RENAME TO "attachments_files_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_survey_id" RENAME TO "attachments_files_survey_id_idx";

-- RenameIndex
ALTER INDEX "idx_attachments_files_uploaded_by" RENAME TO "attachments_files_uploaded_by_idx";

-- RenameIndex
ALTER INDEX "idx_calendar_events_assigned_user_id" RENAME TO "calendar_events_assigned_user_id_idx";

-- RenameIndex
ALTER INDEX "idx_calendar_events_deal_id" RENAME TO "calendar_events_deal_id_idx";

-- RenameIndex
ALTER INDEX "idx_calendar_events_event_track_id" RENAME TO "calendar_events_event_track_id_idx";

-- RenameIndex
ALTER INDEX "idx_calendar_events_event_type_id" RENAME TO "calendar_events_event_type_id_idx";

-- RenameIndex
ALTER INDEX "idx_calendar_events_lead_id" RENAME TO "calendar_events_lead_id_idx";

-- RenameIndex
ALTER INDEX "idx_calendar_events_project_id" RENAME TO "calendar_events_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_clients_city_id" RENAME TO "clients_city_id_idx";

-- RenameIndex
ALTER INDEX "idx_consultations_assigned_consultant_id" RENAME TO "consultations_assigned_consultant_id_idx";

-- RenameIndex
ALTER INDEX "idx_consultations_assigned_manager_id" RENAME TO "consultations_assigned_manager_id_idx";

-- RenameIndex
ALTER INDEX "idx_consultations_calendar_event_id" RENAME TO "consultations_calendar_event_id_idx";

-- RenameIndex
ALTER INDEX "idx_consultations_client_id" RENAME TO "consultations_client_id_idx";

-- RenameIndex
ALTER INDEX "idx_consultations_created_by" RENAME TO "consultations_created_by_idx";

-- RenameIndex
ALTER INDEX "idx_consultations_deal_id" RENAME TO "consultations_deal_id_idx";

-- RenameIndex
ALTER INDEX "idx_consultations_lead_id" RENAME TO "consultations_lead_id_idx";

-- RenameIndex
ALTER INDEX "idx_consultations_project_id" RENAME TO "consultations_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_consultations_scheduled_start_at" RENAME TO "consultations_scheduled_start_at_idx";

-- RenameIndex
ALTER INDEX "idx_deals_assigned_manager_id" RENAME TO "deals_assigned_manager_id_idx";

-- RenameIndex
ALTER INDEX "idx_deals_client_id" RENAME TO "deals_client_id_idx";

-- RenameIndex
ALTER INDEX "idx_deals_lead_id" RENAME TO "deals_lead_id_idx";

-- RenameIndex
ALTER INDEX "idx_deals_pipeline_status_id" RENAME TO "deals_pipeline_status_id_idx";

-- RenameIndex
ALTER INDEX "idx_documents_client_id" RENAME TO "documents_client_id_idx";

-- RenameIndex
ALTER INDEX "idx_documents_created_by" RENAME TO "documents_created_by_idx";

-- RenameIndex
ALTER INDEX "idx_documents_deal_id" RENAME TO "documents_deal_id_idx";

-- RenameIndex
ALTER INDEX "idx_documents_document_type_id" RENAME TO "documents_document_type_id_idx";

-- RenameIndex
ALTER INDEX "idx_documents_file_id" RENAME TO "documents_file_id_idx";

-- RenameIndex
ALTER INDEX "idx_documents_project_id" RENAME TO "documents_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_email_actions_created_by" RENAME TO "email_actions_created_by_idx";

-- RenameIndex
ALTER INDEX "idx_follow_ups_assigned_to" RENAME TO "follow_ups_assigned_to_idx";

-- RenameIndex
ALTER INDEX "idx_follow_ups_created_by" RENAME TO "follow_ups_created_by_idx";

-- RenameIndex
ALTER INDEX "idx_follow_ups_deal_id" RENAME TO "follow_ups_deal_id_idx";

-- RenameIndex
ALTER INDEX "idx_follow_ups_due_at" RENAME TO "follow_ups_due_at_idx";

-- RenameIndex
ALTER INDEX "idx_follow_ups_lead_id" RENAME TO "follow_ups_lead_id_idx";

-- RenameIndex
ALTER INDEX "idx_installer_jobs_calendar_event_id" RENAME TO "installer_jobs_calendar_event_id_idx";

-- RenameIndex
ALTER INDEX "idx_installer_jobs_installer_id" RENAME TO "installer_jobs_installer_id_idx";

-- RenameIndex
ALTER INDEX "idx_installer_jobs_position_id" RENAME TO "installer_jobs_position_id_idx";

-- RenameIndex
ALTER INDEX "idx_installer_jobs_project_id" RENAME TO "installer_jobs_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_leads_assigned_manager_id" RENAME TO "leads_assigned_manager_id_idx";

-- RenameIndex
ALTER INDEX "idx_leads_city_id" RENAME TO "leads_city_id_idx";

-- RenameIndex
ALTER INDEX "idx_leads_pipeline_status_id" RENAME TO "leads_pipeline_status_id_idx";

-- RenameIndex
ALTER INDEX "idx_measurements_complexity_level_id" RENAME TO "measurements_complexity_level_id_idx";

-- RenameIndex
ALTER INDEX "idx_measurements_survey_id" RENAME TO "measurements_survey_id_idx";

-- RenameIndex
ALTER INDEX "idx_notifications_actor_user_id" RENAME TO "notifications_actor_user_id_idx";

-- RenameIndex
ALTER INDEX "idx_notifications_recipient_user_id" RENAME TO "notifications_recipient_user_id_idx";

-- RenameIndex
ALTER INDEX "idx_project_position_addons_position_id" RENAME TO "project_position_addons_position_id_idx";

-- RenameIndex
ALTER INDEX "idx_project_position_addons_service_addon_id" RENAME TO "project_position_addons_service_addon_id_idx";

-- RenameIndex
ALTER INDEX "project_position_addons_unique" RENAME TO "project_position_addons_position_id_service_addon_id_key";

-- RenameIndex
ALTER INDEX "idx_project_positions_complexity_level_id" RENAME TO "project_positions_complexity_level_id_idx";

-- RenameIndex
ALTER INDEX "idx_project_positions_film_id" RENAME TO "project_positions_film_id_idx";

-- RenameIndex
ALTER INDEX "idx_project_positions_position_status_id" RENAME TO "project_positions_position_status_id_idx";

-- RenameIndex
ALTER INDEX "idx_project_positions_project_id" RENAME TO "project_positions_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_project_positions_service_type_id" RENAME TO "project_positions_service_type_id_idx";

-- RenameIndex
ALTER INDEX "idx_projects_city_id" RENAME TO "projects_city_id_idx";

-- RenameIndex
ALTER INDEX "idx_projects_client_id" RENAME TO "projects_client_id_idx";

-- RenameIndex
ALTER INDEX "idx_projects_deal_id" RENAME TO "projects_deal_id_idx";

-- RenameIndex
ALTER INDEX "idx_projects_lead_installer_id" RENAME TO "projects_lead_installer_id_idx";

-- RenameIndex
ALTER INDEX "idx_projects_manager_id" RENAME TO "projects_manager_id_idx";

-- RenameIndex
ALTER INDEX "idx_projects_payment_status_id" RENAME TO "projects_payment_status_id_idx";

-- RenameIndex
ALTER INDEX "idx_projects_project_status_id" RENAME TO "projects_project_status_id_idx";

-- RenameIndex
ALTER INDEX "service_addons_service_addon_unique" RENAME TO "service_addons_service_type_id_addon_code_key";

-- RenameIndex
ALTER INDEX "service_field_config_service_field_unique" RENAME TO "service_field_config_service_type_id_field_key_key";

-- RenameIndex
ALTER INDEX "idx_survey_recommendations_film_id" RENAME TO "survey_recommendations_film_id_idx";

-- RenameIndex
ALTER INDEX "idx_survey_recommendations_measurement_id" RENAME TO "survey_recommendations_measurement_id_idx";

-- RenameIndex
ALTER INDEX "idx_survey_recommendations_service_type_id" RENAME TO "survey_recommendations_service_type_id_idx";

-- RenameIndex
ALTER INDEX "idx_survey_recommendations_survey_id" RENAME TO "survey_recommendations_survey_id_idx";

-- RenameIndex
ALTER INDEX "idx_surveys_status" RENAME TO "surveys_status_idx";

-- RenameIndex
ALTER INDEX "idx_tasks_assigned_to" RENAME TO "tasks_assigned_to_idx";

-- RenameIndex
ALTER INDEX "idx_tasks_created_by" RENAME TO "tasks_created_by_idx";

-- RenameIndex
ALTER INDEX "idx_tasks_deal_id" RENAME TO "tasks_deal_id_idx";

-- RenameIndex
ALTER INDEX "idx_tasks_due_at" RENAME TO "tasks_due_at_idx";

-- RenameIndex
ALTER INDEX "idx_tasks_lead_id" RENAME TO "tasks_lead_id_idx";

-- RenameIndex
ALTER INDEX "idx_user_access_role_id" RENAME TO "user_access_role_id_idx";

-- RenameIndex
ALTER INDEX "user_access_user_role_unique" RENAME TO "user_access_user_id_role_id_key";
