"use client";

import { ProjectPhasesManager } from "@/components/project-phases-manager";

type ProjectExecutionAssignmentProps = {
  projectId: string;
  projectStatusLabel: string;
  initialSchedule: {
    date: Date | string | null;
    start_time: Date | string | null;
    end_time: Date | string | null;
    crew_id: string | null;
  } | null;
  initialManagerNotes?: string | null;
  crews: Array<{
    crew_id: string;
    name: string;
  }>;
  installers: Array<{
    user_id: string;
    full_name: string;
    email: string;
  }>;
  positions: Array<{
    position_id: string;
    title: string;
    assigned_installer_id: string | null;
  }>;
};

/**
 * Compatibility wrapper for the existing project card.
 *
 * The former component stored one schedule for the whole project. The business
 * workflow now supports multiple installation phases, so the visible project
 * card delegates to ProjectPhasesManager. Keeping this wrapper avoids creating
 * another CRM page or breaking the existing project-card contract while the
 * legacy single-schedule fields remain available for historical records.
 */
export function ProjectExecutionAssignment({
  projectId,
  projectStatusLabel,
  crews,
  installers,
  positions,
}: ProjectExecutionAssignmentProps) {
  return (
    <ProjectPhasesManager
      projectId={projectId}
      projectStatusLabel={projectStatusLabel}
      crews={crews}
      installers={installers}
      positions={positions.map((position) => ({
        position_id: position.position_id,
        title: position.title,
      }))}
    />
  );
}
