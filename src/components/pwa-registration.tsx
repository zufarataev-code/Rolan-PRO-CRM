import Script from "next/script";

/**
 * Loads the one install helper shared with the working CRM page /legacy-crm:
 * it registers the service worker and offers «Установить» on a phone.
 */
export function PwaRegistration() {
  return <Script src="/pwa-install.js" strategy="afterInteractive" />;
}
