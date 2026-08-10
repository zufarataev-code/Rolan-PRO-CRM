import type { Metadata } from "next";
import Link from "next/link";

import { SmsConsentForm } from "./sms-consent-form";

export const metadata: Metadata = {
  title: "SMS Consent & Service Request | RolanPRO",
  description: "Request RolanPRO service and explicitly consent to project-related SMS messages.",
};

export default function SmsConsentPage() {
  return (
    <main className="legal-page sms-optin-page">
      <section className="legal-card sms-optin-card">
        <Link className="legal-back" href="https://rolan-pro.com/">
          RolanPRO
        </Link>
        <p className="legal-kicker">Customer service SMS</p>
        <h1>Request service and choose SMS updates</h1>
        <p className="sms-optin-intro">
          Use this form to request help with a window-film project. SMS enrollment is optional and applies
          only to the number you provide below.
        </p>

        <SmsConsentForm />

        <div className="sms-optin-contact">
          <strong>RolanPRO</strong>
          <span>5320 Derry Ave Ste N, Agoura Hills, CA 91301</span>
          <a href="tel:+14243250512">+1 (424) 325-0512</a>
          <a href="mailto:info@rolan-pro.com">info@rolan-pro.com</a>
        </div>
      </section>
    </main>
  );
}
