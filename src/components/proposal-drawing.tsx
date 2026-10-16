/**
 * Working drawing — Appendix A to the client agreement.
 *
 * Every measured opening is drawn to scale from the measurement snapshot
 * (sizes are stored in millimetres, shown in inches): outer frame, sashes,
 * film coverage, overall dimensions, quantity and area. Smart film shows its
 * switching zones. The client signs the agreement with this appendix in front
 * of them, so the scope is not "a line in a price list" but their own windows.
 */

type Language = "en" | "ru";

type Opening = {
  id: string;
  title: string;
  widthIn: number;
  heightIn: number;
  qty: number;
  sqft: number;
  panels: Array<{ widthIn: number; heightIn: number }>;
  panelMode: string | null;
  gridCols: number | null;
  gridRows: number | null;
  zones: number;
  category: FilmCategory;
  film: string;
};

type FilmCategory = "smart" | "solar" | "protective" | "decorative" | "other";

const MM_PER_INCH = 25.4;

/** Same rule as the rest of the proposal: values under 50 are already inches. */
function toInches(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 50 ? n : n / MM_PER_INCH;
}

/** 40.5 → 40 ½″ (nearest ⅛″, the precision a film crew works to). */
export function formatInches(value: number) {
  const eighths = Math.round(value * 8);
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  const fractions = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];
  return `${whole}${rest ? ` ${fractions[rest]}` : ""}″`;
}

function categoryOf(item: any): FilmCategory {
  const raw = `${item?.film?.category_name ?? ""} ${item?.service_type?.service_code ?? ""} ${item?.service_type?.name ?? ""} ${item?.service_type?.name_en ?? ""}`.toLowerCase();
  if (raw.includes("smart")) return "smart";
  if (raw.includes("safety") || raw.includes("security") || raw.includes("protect")) return "protective";
  if (raw.includes("decor")) return "decorative";
  if (raw.includes("solar") || raw.includes("sun")) return "solar";
  return "other";
}

const FILL: Record<FilmCategory, { pattern: string; label: { en: string; ru: string } }> = {
  smart: { pattern: "hatch-smart", label: { en: "Smart film", ru: "Smart-плёнка" } },
  solar: { pattern: "hatch-solar", label: { en: "Solar film", ru: "Солнцезащитная" } },
  protective: { pattern: "hatch-safety", label: { en: "Safety film", ru: "Защитная" } },
  decorative: { pattern: "hatch-decor", label: { en: "Decorative film", ru: "Декоративная" } },
  other: { pattern: "hatch-solar", label: { en: "Film", ru: "Плёнка" } },
};

export function openingsFromItems(items: any[], language: Language): Array<{ room: string; openings: Opening[] }> {
  const rooms = new Map<string, Opening[]>();
  for (const item of items ?? []) {
    if (!item?.client_selected) continue;
    const snap = item?.measurement_snapshot;
    if (!snap || typeof snap !== "object") continue;
    const widthIn = toInches(snap.width);
    const heightIn = toInches(snap.height);
    if (!widthIn || !heightIn) continue;
    const panels = Array.isArray(snap.panels)
      ? snap.panels
          .map((panel: any) => ({ widthIn: toInches(panel?.width), heightIn: toInches(panel?.height) }))
          .filter((panel: { widthIn: number; heightIn: number }) => panel.widthIn > 0 && panel.heightIn > 0)
      : [];
    const filmName = item.film
      ? `${item.film.brand_name_en || item.film.brand_name || ""} ${item.film.model_name_en || item.film.model_name || ""}`.trim()
      : "";
    const category = categoryOf(item);
    const room = String(item.room_name || (language === "ru" ? "Объект" : "Project"));
    const title = String((language === "ru" ? item.title_ru : item.title_en) || item.title || "").split(/\s+[—-]\s+/)[0] || "";
    const opening: Opening = {
      id: String(item.proposal_item_id),
      title: title.replace(/^Окно/, language === "ru" ? "Окно" : "Window"),
      widthIn,
      heightIn,
      qty: Math.max(1, Number(snap.qty) || 1),
      sqft: Number(snap.sqft) || 0,
      panels,
      panelMode: typeof snap.panel_mode === "string" ? snap.panel_mode : null,
      gridCols: Number(snap.grid_cols) || null,
      gridRows: Number(snap.grid_rows) || null,
      zones: category === "smart" ? Math.max(0, Number(snap.smart_zones) || Number(item?.dynamic_fields?.zones_qty) || 0) : 0,
      category,
      film: filmName || FILL[category].label[language],
    };
    if (!rooms.has(room)) rooms.set(room, []);
    rooms.get(room)!.push(opening);
  }
  return [...rooms].map(([room, openings]) => ({ room, openings }));
}

/** Sash rectangles inside the frame, in inches relative to the frame's top-left corner. */
function sashLayout(opening: Opening) {
  const { widthIn: W, heightIn: H, panels, panelMode } = opening;
  if (panelMode === "french_grid" && opening.gridCols && opening.gridRows) {
    const cols = opening.gridCols, rows = opening.gridRows;
    return Array.from({ length: cols * rows }, (_, i) => ({
      x: (i % cols) * (W / cols), y: Math.floor(i / cols) * (H / rows), w: W / cols, h: H / rows,
    }));
  }
  const n = panels.length;
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
  const sumW = panels.reduce((s, p) => s + p.widthIn, 0);
  const sumH = panels.reduce((s, p) => s + p.heightIn, 0);
  const stacked = panelMode === "hung" || (Math.abs(sumH - H) < Math.abs(sumW - W));
  let offset = 0;
  return panels.map((p) => {
    if (stacked) {
      const h = (p.heightIn / sumH) * H;
      const rect = { x: 0, y: offset, w: W, h };
      offset += h;
      return rect;
    }
    const w = (p.widthIn / sumW) * W;
    const rect = { x: offset, y: 0, w, h: H };
    offset += w;
    return rect;
  });
}

function OpeningSvg({ opening, language, ids }: { opening: Opening; language: Language; ids: string }) {
  const ru = language === "ru";
  // Fit the opening into a 260 × 220 drawing area, keeping proportions.
  const maxW = 260, maxH = 170;
  const scale = Math.min(maxW / opening.widthIn, maxH / opening.heightIn);
  const w = opening.widthIn * scale;
  const h = opening.heightIn * scale;
  const left = 46, top = 18;
  const viewW = left + w + 18;
  const viewH = top + h + 46;
  const sashes = sashLayout(opening);
  const zoneLabels = opening.zones
    ? sashes.map((_, i) => `Z${Math.min(opening.zones, Math.floor((i * opening.zones) / sashes.length) + 1)}`)
    : [];

  return (
    <svg
      className="rp-drawing-svg"
      viewBox={`0 0 ${viewW} ${viewH}`}
      role="img"
      aria-label={`${opening.title}: ${formatInches(opening.widthIn)} × ${formatInches(opening.heightIn)}`}
    >
      {/* frame + sashes with film hatch */}
      <rect x={left - 4} y={top - 4} width={w + 8} height={h + 8} className="rp-frame-outer" />
      {sashes.map((sash, i) => (
        <g key={i}>
          <rect
            x={left + sash.x * scale + 2}
            y={top + sash.y * scale + 2}
            width={Math.max(0, sash.w * scale - 4)}
            height={Math.max(0, sash.h * scale - 4)}
            fill={`url(#${ids}-${FILL[opening.category].pattern})`}
            className="rp-sash"
          />
          {zoneLabels[i] ? (
            <g transform={`translate(${left + (sash.x + sash.w / 2) * scale} ${top + (sash.y + sash.h / 2) * scale})`}>
              <rect x={-13} y={-9} width={26} height={18} rx={5} className="rp-zone-pill" />
              <text y={4} className="rp-zone-label">{zoneLabels[i]}</text>
            </g>
          ) : null}
        </g>
      ))}

      {/* overall width — below */}
      <g className="rp-dim">
        <line x1={left} y1={top + h + 14} x2={left} y2={top + h + 26} />
        <line x1={left + w} y1={top + h + 14} x2={left + w} y2={top + h + 26} />
        <line x1={left} y1={top + h + 20} x2={left + w} y2={top + h + 20} markerStart={`url(#${ids}-arrow)`} markerEnd={`url(#${ids}-arrow)`} />
        <text x={left + w / 2} y={top + h + 38} className="rp-dim-text">{formatInches(opening.widthIn)}</text>
      </g>
      {/* overall height — left */}
      <g className="rp-dim">
        <line x1={left - 26} y1={top} x2={left - 14} y2={top} />
        <line x1={left - 26} y1={top + h} x2={left - 14} y2={top + h} />
        <line x1={left - 20} y1={top} x2={left - 20} y2={top + h} markerStart={`url(#${ids}-arrow)`} markerEnd={`url(#${ids}-arrow)`} />
        <text
          x={left - 26}
          y={top + h / 2}
          className="rp-dim-text"
          transform={`rotate(-90 ${left - 26} ${top + h / 2})`}
        >
          {formatInches(opening.heightIn)}
        </text>
      </g>
      <title>{ru ? "Размеры в дюймах" : "Dimensions in inches"}</title>
    </svg>
  );
}

export function ProposalDrawing({
  items,
  language,
  clientName,
  address,
  proposalCode,
  ids = "rp",
}: {
  items: any[];
  language: Language;
  clientName: string;
  address: string;
  proposalCode: string;
  /** Prefix for SVG pattern ids — the screen and print copies must not share them. */
  ids?: string;
}) {
  const ru = language === "ru";
  const rooms = openingsFromItems(items, language);
  if (!rooms.length) return null;
  const totalOpenings = rooms.reduce((s, r) => s + r.openings.reduce((ss, o) => ss + o.qty, 0), 0);
  const totalSqft = rooms.reduce((s, r) => s + r.openings.reduce((ss, o) => ss + o.sqft, 0), 0);
  const categories = [...new Set(rooms.flatMap((r) => r.openings.map((o) => o.category)))];

  return (
    <section className="rp-section rp-drawing" id="working-drawing">
      {/* Shared SVG patterns for every opening on the page */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <defs>
          <pattern id={`${ids}-hatch-smart`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#e3f4fc" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#24a9e1" strokeWidth="1.4" />
          </pattern>
          <pattern id={`${ids}-hatch-solar`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#fff4e0" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#e8a33a" strokeWidth="1.1" />
          </pattern>
          <pattern id={`${ids}-hatch-safety`} width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#e6f5ee" />
            <path d="M0 4h8M4 0v8" stroke="#2f9e6c" strokeWidth="0.9" />
          </pattern>
          <pattern id={`${ids}-hatch-decor`} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#f0f1f4" />
            <circle cx="3" cy="3" r="1" fill="#8a94a6" />
          </pattern>
          <marker id={`${ids}-arrow`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 2 L5 5 L0 8" fill="none" stroke="#10253f" strokeWidth="1.4" />
          </marker>
        </defs>
      </svg>

      <div className="rp-kicker">{ru ? "Приложение А к договору" : "Appendix A to the agreement"}</div>
      <h2 className="rp-h2">{ru ? "Рабочий чертёж" : "Working drawing"}</h2>
      <p className="rp-lead">
        {ru
          ? "Каждый проём нарисован в масштабе по замеру. Размеры — в дюймах, по стеклу; на монтаже бригада сверяет их ещё раз."
          : "Every opening is drawn to scale from the site measurement. Dimensions are glass sizes in inches and are re-verified by the crew on installation day."}
      </p>

      <div className="rp-legend">
        {categories.map((category) => (
          <span key={category} className={`rp-legend-item rp-legend-${category}`}>
            <i />
            {FILL[category].label[language]}
          </span>
        ))}
        {categories.includes("smart") ? (
          <span className="rp-legend-item rp-legend-zone">
            <b>Z1</b>
            {ru ? "зона переключения" : "switching zone"}
          </span>
        ) : null}
      </div>

      {rooms.map((room) => (
        <div key={room.room} className="rp-drawing-room">
          <h3 className="rp-h3">{room.room}</h3>
          <div className="rp-drawing-grid">
            {room.openings.map((opening) => (
              <figure key={opening.id} className="rp-drawing-card">
                <OpeningSvg opening={opening} language={language} ids={ids} />
                <figcaption>
                  <strong>
                    {opening.title}
                    {opening.qty > 1 ? <span className="rp-qty">×{opening.qty}</span> : null}
                  </strong>
                  <span>{formatInches(opening.widthIn)} × {formatInches(opening.heightIn)}</span>
                  <span>{opening.film}</span>
                  {opening.sqft ? <span>{opening.sqft.toFixed(1)} sq ft</span> : null}
                  {opening.zones ? (
                    <span>
                      {ru ? `Зон: ${opening.zones} · пульт в комплекте` : `${opening.zones} zone${opening.zones === 1 ? "" : "s"} · remote included`}
                    </span>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}

      <dl className="rp-title-block">
        <div><dt>{ru ? "Клиент" : "Customer"}</dt><dd>{clientName}</dd></div>
        <div><dt>{ru ? "КП №" : "Proposal No."}</dt><dd>{proposalCode}</dd></div>
        <div><dt>{ru ? "Объект" : "Project"}</dt><dd>{address || "—"}</dd></div>
        <div><dt>{ru ? "Проёмов" : "Openings"}</dt><dd>{totalOpenings}</dd></div>
        <div><dt>{ru ? "Площадь плёнки" : "Film area"}</dt><dd>{totalSqft ? `${totalSqft.toFixed(1)} sq ft` : "—"}</dd></div>
        <div><dt>{ru ? "Единицы" : "Units"}</dt><dd>{ru ? "дюймы" : "inches"}</dd></div>
      </dl>
    </section>
  );
}
