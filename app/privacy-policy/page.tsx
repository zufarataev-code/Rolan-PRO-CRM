import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | RolanPRO",
  description: "RolanPRO privacy policy and SMS consent policy.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <section className="legal-card">
        <Link className="legal-back" href="/">
          RolanPRO
        </Link>
        <p className="legal-kicker">Privacy Policy</p>
        <h1>RolanPRO Privacy Policy</h1>
        <p className="legal-muted">Last updated: August 9, 2026</p>

        <h2>Information we collect</h2>
        <p>
          RolanPRO may collect your name, phone number, email address, service address, project details,
          photos, measurements, and messages when you request a quote, consultation, measurement, proposal,
          installation, or support.
        </p>

        <h2>How we use information</h2>
        <p>
          We use this information to respond to your request, schedule consultations and measurements,
          prepare proposals, coordinate installations, provide customer support, send project updates,
          and manage billing or payment links related to your project.
        </p>

        <h2>SMS and text messaging</h2>
        <p>
          If you provide your phone number and consent to receive text messages, RolanPRO may send
          customer-care and transactional SMS messages related to quote requests, consultations, measurements,
          installation schedules, project status, payment links, balances, and support. Message frequency varies.
          Message and data rates may apply. Reply STOP to opt out or HELP for help.
        </p>
        <p>
          We do not sell, rent, or share mobile information, SMS opt-in data, or SMS consent with third
          parties or affiliates for marketing or promotional purposes. Service providers may process messages
          only as needed to deliver RolanPRO communications and may not use that information for their own
          marketing.
        </p>

        <h2>Opt out</h2>
        <p>
          You can opt out of SMS messages at any time by replying STOP. For assistance, reply HELP, call
          +1 (424) 325-0512, or email info@rolan-pro.com.
        </p>

        <h2>Contact</h2>
        <p>
          RolanPRO<br />
          5320 Derry Ave Ste N, Agoura Hills, CA 91301<br />
          Phone: +1 (424) 325-0512<br />
          Email: info@rolan-pro.com
        </p>
      </section>
    </main>
  );
}
