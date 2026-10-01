export const ROLE_CODES = {
  OWNER: "OWNER",
  AI_SERVICE: "AI_SERVICE",
  MANAGER: "MANAGER",
  CONSULTANT: "CONSULTANT",
  INSTALLER: "INSTALLER",
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export const ROLE_NAMES = {
  [ROLE_CODES.OWNER]: {
    ru: "Владелец",
    en: "Owner",
  },
  [ROLE_CODES.AI_SERVICE]: {
    ru: "AI-сервис",
    en: "AI Service",
  },
  [ROLE_CODES.MANAGER]: {
    ru: "Менеджер",
    en: "Manager",
  },
  [ROLE_CODES.CONSULTANT]: {
    ru: "Консультант / Замерщик",
    en: "Consultant / Surveyor",
  },
  [ROLE_CODES.INSTALLER]: {
    ru: "Специалист по установке",
    en: "Installer",
  },
} as const;

export const DEFAULT_SESSION_HOURS = 168;
