/**
 * Warranty terms shown in the proposal and referenced by the agreement.
 *
 * Periods are the owner's published terms (2026-09-30): residential film from
 * 5 years to lifetime depending on the film; Smart film 5 years standard,
 * extendable to 12 years for an extra charge; anti-graffiti up to 2 years
 * (manufacturer). The exact period of each film is printed on the warranty
 * certificate issued at handover.
 */

type Language = "en" | "ru";
type Category = "smart" | "solar" | "protective" | "decorative" | "antigraffiti";

function categoriesOf(items: any[]): Category[] {
  const found = new Set<Category>();
  for (const item of items ?? []) {
    if (item && item.client_selected === false) continue;
    const raw = `${item?.film?.category_name ?? ""} ${item?.film?.model_name ?? ""} ${item?.service_type?.service_code ?? ""} ${item?.service_type?.name_en ?? ""} ${item?.title_en ?? ""}`.toLowerCase();
    if (raw.includes("graffiti")) found.add("antigraffiti");
    else if (raw.includes("smart")) found.add("smart");
    else if (raw.includes("safety") || raw.includes("security") || raw.includes("protect")) found.add("protective");
    else if (raw.includes("decor")) found.add("decorative");
    else if (raw.includes("solar") || raw.includes("sun")) found.add("solar");
  }
  return [...found];
}

const TERMS: Record<Category, { title: { en: string; ru: string }; period: { en: string; ru: string }; note: { en: string; ru: string } }> = {
  smart: {
    title: { en: "Smart switchable film", ru: "Smart-плёнка" },
    period: { en: "5 years", ru: "5 лет" },
    note: {
      en: "Standard coverage of the film and its power/control unit. Extended coverage up to 12 years is available for an additional charge.",
      ru: "Стандартная гарантия на плёнку и блок управления. Расширенная гарантия до 12 лет — за доплату.",
    },
  },
  solar: {
    title: { en: "Solar control film", ru: "Солнцезащитная плёнка" },
    period: { en: "5 years – lifetime", ru: "от 5 лет до пожизненной" },
    note: { en: "Residential coverage; the exact period depends on the selected film.", ru: "Для жилых помещений; точный срок зависит от выбранной плёнки." },
  },
  protective: {
    title: { en: "Safety & security film", ru: "Защитная плёнка" },
    period: { en: "5 years – lifetime", ru: "от 5 лет до пожизненной" },
    note: { en: "Residential coverage; the exact period depends on the selected film.", ru: "Для жилых помещений; точный срок зависит от выбранной плёнки." },
  },
  decorative: {
    title: { en: "Decorative film", ru: "Декоративная плёнка" },
    period: { en: "5 years – lifetime", ru: "от 5 лет до пожизненной" },
    note: { en: "Residential coverage; the exact period depends on the selected film.", ru: "Для жилых помещений; точный срок зависит от выбранной плёнки." },
  },
  antigraffiti: {
    title: { en: "Anti-graffiti film", ru: "Антивандальная плёнка" },
    period: { en: "up to 2 years", ru: "до 2 лет" },
    note: { en: "Manufacturer coverage.", ru: "Гарантия производителя." },
  },
};

export function PublicWarrantySummary({ language = "en", items = [] }: { language?: Language; items?: any[] }) {
  const ru = language === "ru";
  const lang = ru ? "ru" : "en";
  const categories = categoriesOf(items);
  const shown: Category[] = categories.length ? categories : ["solar"];

  return (
    <section className="rp-section rp-warranty" id="proposal-warranty">
      <div className="rp-kicker">{ru ? "Гарантия" : "Warranty"}</div>
      <h2 className="rp-h2">{ru ? "Гарантия на ваш проект" : "Your project is covered"}</h2>
      <div className="rp-warranty-grid">
        {shown.map((category) => (
          <article key={category} className="rp-warranty-card">
            <span className="rp-warranty-period">{TERMS[category].period[lang]}</span>
            <strong>{TERMS[category].title[lang]}</strong>
            <p>{TERMS[category].note[lang]}</p>
          </article>
        ))}
      </div>
      <ul className="rp-checklist">
        <li>{ru ? "Монтаж выполняет собственная бригада Rolan PRO." : "Installed by Rolan PRO's own crew."}</li>
        <li>
          {ru
            ? "После сдачи вы получаете гарантийный сертификат с плёнкой, датой монтажа и сроком по каждому проёму."
            : "At handover you receive a warranty certificate listing the film, installation date and coverage for each opening."}
        </li>
        <li>{ru ? "Инструкция по уходу — в комплекте." : "Care instructions are included."}</li>
      </ul>
    </section>
  );
}
