export const ROLE_CODES = {
  OWNER: "OWNER",
  AI_SERVICE: "AI_SERVICE",
  MANAGER: "MANAGER",
  CONSULTANT: "CONSULTANT",
  INSTALLER: "INSTALLER",
  // Added on top of INSTALLER: runs an installation group (distributes jobs,
  // earns 10% of each group installer's pay on top). Never sees prices.
  INSTALLER_LEAD: "INSTALLER_LEAD",
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
    ru: "Главный специалист по установке",
    en: "Lead installation specialist",
  },
  [ROLE_CODES.INSTALLER_LEAD]: {
    ru: "Руководитель монтажной группы",
    en: "Installation team lead",
  },
} as const;

export const DEFAULT_SESSION_HOURS = 168;
