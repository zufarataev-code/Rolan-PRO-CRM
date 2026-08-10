import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms and SMS Terms | RolanPRO",
  description: "RolanPRO terms of service and SMS messaging terms.",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <section className="legal-card">
        <Link className="legal-back" href="/">
          RolanPRO
        </Link>
        <p className="legal-kicker">Terms</p>
        <h1>RolanPRO Terms and SMS Messaging Terms</h1>
        <p className="legal-muted">Last updated: August 9, 2026</p>

        <h2>Service requests</h2>
        <p>
          By submitting a request to RolanPRO, you authorize us to contact you about your window film project,
          including consultation, measurement, proposal, installation, support, and billing details.
        </p>

        <h2>SMS consent</h2>
        <p>
          By checking the SMS consent box on a RolanPRO form, you agree to receive customer-care and
          transactional SMS messages from RolanPRO about your quote, appointment, project updates, payment
          links, balances, and customer support. Consent is not a condition of purchase.
        </p>

        <h2>Program name and message types</h2>
        <p>
          The program name is RolanPRO Customer Care SMS. Messages may include quote follow-up,
          consultation and measurement scheduling, installation reminders, project status, payment balance,
          and support communications. RolanPRO does not use this program for third-party advertising.
        </p>

        <h2>Message frequency and cost</h2>
        <p>
          Message frequency varies based on your project activity. Message and data rates may apply according
          to your mobile carrier plan.
        </p>

        <h2>Opt out and help</h2>
        <p>
          You may opt out at any time by replying STOP. For help, reply HELP, call +1 (424) 325-0512, or email
          info@rolan-pro.com.
        </p>

        <h2>Privacy</h2>
        <p>
          Mobile information, SMS opt-in data, and consent are handled according to our{" "}
          <Link className="legal-inline-link" href="/privacy-policy">
            Privacy Policy
          </Link>
          . We do not sell or share mobile information or SMS consent with third parties or affiliates for
          marketing or promotional purposes.
        </p>
      </section>
    </main>
  );
}
