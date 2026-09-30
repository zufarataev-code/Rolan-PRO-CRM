import { redirect } from "next/navigation";

/** Compatibility address: employee management lives inside the CRM shell. */
export default function TeamRedirect() {
  redirect("/legacy-crm?panel=team");
}
