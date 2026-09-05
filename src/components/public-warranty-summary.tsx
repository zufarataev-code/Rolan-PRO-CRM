export function PublicWarrantySummary() {
  return (
    <section className="proposal-section proposal-warranty-section">
      <div className="proposal-section-kicker">Warranty</div>
      <h2>Warranty included with your project</h2>
      <p>
        This proposal, agreement and payment package includes the warranty terms applicable to the products and services you select.
      </p>
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <div>
          <strong>Product / material coverage</strong>
          <p>
            Manufacturer coverage follows the exact film, smart-film system or related product installed on your project and the published terms for that product.
          </p>
        </div>
        <div>
          <strong>ROLANPRO workmanship coverage</strong>
          <p>
            Installation workmanship is covered according to the signed ROLANPRO agreement and the final approved scope of work.
          </p>
        </div>
        <div>
          <strong>Warranty handover</strong>
          <p>
            The final warranty record and care instructions are tied to the completed project so the installed product, installation date and covered scope remain traceable in ROLANPRO CRM.
          </p>
        </div>
      </div>
      <p style={{ marginTop: 14, opacity: 0.74 }}>
        Exact coverage periods and exclusions are determined by the selected product and the signed agreement; no generic term on this page overrides those documents.
      </p>
    </section>
  );
}
