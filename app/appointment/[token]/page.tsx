import { notFound } from "next/navigation";

import { PublicAppointmentActions } from "@/components/public-appointment-actions";
import { getPublicAppointment } from "@/features/legacy-crm/public-appointments";

type PageProps = { params: Promise<{ token: string }> };

export default async function PublicAppointmentPage({ params }: PageProps) {
  const { token } = await params;
  const appointment = await getPublicAppointment(token);
  if (!appointment) notFound();

  return <PublicAppointmentActions token={token} initialAppointment={appointment} />;
}
