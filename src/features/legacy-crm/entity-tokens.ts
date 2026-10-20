/**
 * Entity colour code — ONE colour, ONE meaning across the whole CRM.
 *
 * Source of truth for the colours and icons of film directions, stock levels
 * and add-on services. Mirrors the owner's design system «RolanPRO CRM —
 * цветовой код» (claude.ai/artifact/7wEua2rjjR7L4F2r4KbjAr).
 *
 * It is served two ways from the same table:
 *  - as CSS custom properties on :root (`--dir-solar`, `--stock-low`, …);
 *  - as `window.RP_ENTITY` for the legacy script, injected into <head> BEFORE
 *    the legacy code runs, so the legacy palettes read from it instead of
 *    keeping their own copies (there used to be seven disagreeing maps).
 *
 * Changing a colour here changes it on the касса, in the project card, the
 * catalog badges, the calendar, the kanban and the academy at once.
 */

export type EntityTone = {
  /** Full-value colour: filled tile, icon on light, dot in a list. */
  color: string;
  /** Light ground for an unselected tile or a badge. */
  tint: string;
  /** Text / icon colour that reads on `tint` (≥ 4.5:1). */
  deep: string;
  /** Short label used on tiles and in calendar chips. */
  short: string;
  /** Inline stroke-SVG body (24×24 viewBox), no outer <svg>. */
  icon: string;
};

/** Legacy keys: catalog category = `solar`, order serviceType = `solar_film`. */
export const DIRECTION_KEYS = ["solar", "protective", "smart", "decorative", "privacy"] as const;
export type DirectionKey = (typeof DIRECTION_KEYS)[number];

export const DIRECTIONS: Record<DirectionKey, EntityTone> = {
  solar: {
    color: "#D97706", tint: "#FFF4E0", deep: "#B45309", short: "Solar",
    icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  },
  protective: {
    color: "#1D4ED8", tint: "#E9EFFF", deep: "#1E40AF", short: "Security",
    icon: '<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
  },
  smart: {
    color: "#6D28D9", tint: "#F0EAFF", deep: "#5B21B6", short: "Smart",
    icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  },
  decorative: {
    color: "#0F766E", tint: "#E3F6F2", deep: "#115E59", short: "Decor",
    icon: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M12 8l2.5 4L12 16l-2.5-4z"/>',
  },
  privacy: {
    color: "#475569", tint: "#E2E8F0", deep: "#334155", short: "Privacy",
    icon: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4 10 7-.4 1.1-1.2 2.4-2.3 3.6M6.6 6.6C4.3 8 2.7 10 2 12c1 3 5 7 10 7 1.5 0 2.9-.3 4.1-.9"/>',
  },
};

/** Direction aliases used across the legacy file. */
export const DIRECTION_ALIASES: Record<string, DirectionKey> = {
  solar: "solar", solar_film: "solar", sun: "solar",
  protective: "protective", protective_film: "protective", safety: "protective", security: "protective",
  smart: "smart", smart_film: "smart", pdlc: "smart",
  decorative: "decorative", decorative_film: "decorative", decor: "decorative",
  privacy: "privacy", privacy_film: "privacy", mirror: "privacy",
};

/** Add-on services — a flat row under the film on the касса. */
export const ADDONS: Record<string, EntityTone> = {
  silicone: {
    color: "#0284C7", tint: "#DCF0FB", deep: "#0369A1", short: "Силикон",
    icon: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  },
  removal: {
    color: "#DC2626", tint: "#FEE2E2", deep: "#991B1B", short: "Демонтаж",
    icon: '<path d="m4 20 6-6M10 14l-2-2 8-8 4 4-8 8z"/>',
  },
  height: {
    color: "#6D28D9", tint: "#EDE4FF", deep: "#5B21B6", short: "Высотные",
    icon: '<path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/>',
  },
  travel: {
    color: "#16A34A", tint: "#DCFCE7", deep: "#166534", short: "Выезд",
    icon: '<path d="M3 15V9l3-5h12l3 5v6"/><path d="M3 15h18v3H3z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  },
  washing: {
    color: "#92400E", tint: "#FBE8CC", deep: "#78350F", short: "Мойка",
    icon: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M8 8V5a4 4 0 0 1 8 0v3"/>',
  },
};

/** Stock level of a film: dot next to the remaining length. */
export const STOCK = {
  ok: { color: "#16A34A", tint: "#DCFCE7", deep: "#166534", short: "в наличии" },
  low: { color: "#CA8A04", tint: "#FEF3C7", deep: "#854D0E", short: "мало" },
  out: { color: "#DC2626", tint: "#FEE2E2", deep: "#991B1B", short: "нет" },
} as const;

/** Shell colours the касса and badges rely on. */
export const FRAME = {
  navy: "#0F2440",
  gold: "#C9A24A",
  goldTint: "#FFF9EA",
  ink: "#141A26",
  muted: "#5A6577",
  border: "#D9DEE6",
} as const;

export const ENTITY_TOKENS = { directions: DIRECTIONS, aliases: DIRECTION_ALIASES, addons: ADDONS, stock: STOCK, frame: FRAME };

function cssVars(): string {
  const lines: string[] = [];
  for (const [k, t] of Object.entries(DIRECTIONS)) {
    lines.push(`--dir-${k}:${t.color};--dir-${k}-tint:${t.tint};--dir-${k}-deep:${t.deep};`);
  }
  for (const [k, t] of Object.entries(ADDONS)) {
    lines.push(`--addon-${k}:${t.color};--addon-${k}-tint:${t.tint};--addon-${k}-deep:${t.deep};`);
  }
  for (const [k, t] of Object.entries(STOCK)) {
    lines.push(`--stock-${k}:${t.color};--stock-${k}-tint:${t.tint};--stock-${k}-deep:${t.deep};`);
  }
  lines.push(`--rp-navy:${FRAME.navy};--rp-gold:${FRAME.gold};--rp-gold-tint:${FRAME.goldTint};--rp-ink:${FRAME.ink};--rp-muted:${FRAME.muted};--rp-border:${FRAME.border};`);
  return lines.join("");
}

/**
 * Injected at the start of <head>: the legacy script reads `window.RP_ENTITY`
 * at parse time, so it must exist before any legacy <script> runs.
 */
export const ENTITY_TOKENS_HTML =
  `<style id="rolanpro-entity-tokens">:root{${cssVars()}}</style>` +
  `<script id="rolanpro-entity-tokens-js">window.RP_ENTITY=${JSON.stringify(ENTITY_TOKENS).replace(/</g, "\\u003c")};</script>`;
