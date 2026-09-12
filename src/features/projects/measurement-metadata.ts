import { prisma } from "@/lib/db";
import type { MeasurementSource } from "./constructor";
import { verificationStatusForSource } from "./constructor";

export async function syncMeasurementConstructorMetadata(
  measurementId: string,
  source: MeasurementSource,
) {
  return prisma.measurement.update({
    where: {
      measurement_id: measurementId,
    },
    data: {
      measurement_source: source,
      verification_status: verificationStatusForSource(source),
    },
  });
}
