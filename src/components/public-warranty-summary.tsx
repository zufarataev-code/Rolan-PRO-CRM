export function PublicWarrantySummary({ language = "en" }: { language?: "en" | "ru" }) {
  const ru = language === "ru";
  return (
    <section className="proposal-section proposal-warranty-section">
      <div className="proposal-section-kicker">{ru ? "Гарантия" : "Warranty"}</div>
      <h2>{ru ? "Гарантия включена в проект" : "Warranty included with your project"}</h2>
      <p>
        {ru
          ? "Это КП, договор и пакет оплаты включают условия гарантии для выбранных товаров и услуг."
          : "This proposal, agreement and payment package includes the warranty terms applicable to the products and services you select."}
      </p>
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <div>
          <strong>{ru ? "Гарантия на продукт и материал" : "Product / material coverage"}</strong>
          <p>
            {ru
              ? "Гарантия производителя определяется конкретной плёнкой, системой smart-плёнки или другим продуктом, установленным на объекте, и официальными условиями этого продукта."
              : "Manufacturer coverage follows the exact film, smart-film system or related product installed on your project and the published terms for that product."}
          </p>
        </div>
        <div>
          <strong>{ru ? "Гарантия Rolan PRO на монтаж" : "ROLANPRO workmanship coverage"}</strong>
          <p>
            {ru
              ? "Качество монтажа покрывается гарантией согласно подписанному договору Rolan PRO и окончательно утверждённому объёму работ."
              : "Installation workmanship is covered according to the signed ROLANPRO agreement and the final approved scope of work."}
          </p>
        </div>
        <div>
          <strong>{ru ? "Передача гарантийных документов" : "Warranty handover"}</strong>
          <p>
            {ru
              ? "Итоговый гарантийный документ и инструкция по уходу сохраняются в проекте CRM вместе с продуктом, датой монтажа и объёмом гарантийного покрытия."
              : "The final warranty record and care instructions are tied to the completed project so the installed product, installation date and covered scope remain traceable in ROLANPRO CRM."}
          </p>
        </div>
      </div>
      <p style={{ marginTop: 14, opacity: 0.74 }}>
        {ru
          ? "Точные сроки и исключения определяются выбранным продуктом и подписанным договором; общий текст на этой странице не заменяет эти документы."
          : "Exact coverage periods and exclusions are determined by the selected product and the signed agreement; no generic term on this page overrides those documents."}
      </p>
    </section>
  );
}
