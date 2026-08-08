"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { LeadCaptureForm } from "@/components/marketing/lead-capture-form";
import { MascotPromo } from "@/components/marketing/mascot-promo";
import styles from "@/components/marketing/landing.module.css";

type Locale = "en" | "ru";
type ServiceKey = "solar" | "privacy" | "security" | "smart";
type ThemeStyle = CSSProperties & Record<`--${string}`, string>;

const LOCALE_STORAGE_KEY = "rolan-pro-landing-locale-v1";

const phoneHref = "tel:+14243250512";
const phoneLabel = "+1 (424) 325-0512";
const emailHref = "mailto:info@rolan-pro.com";
const emailLabel = "info@rolan-pro.com";
const mapsHref =
  "https://www.google.com/maps/search/?api=1&query=5320+Derry+Ave+Ste+N,+Agoura+Hills,+CA+91301";

const needCardStyles: ThemeStyle[] = [
  {
    "--accent": "#d7a72f",
    "--accent-soft": "rgba(215, 167, 47, 0.14)",
  },
  {
    "--accent": "#57a8d8",
    "--accent-soft": "rgba(87, 168, 216, 0.14)",
  },
  {
    "--accent": "#2f6ec5",
    "--accent-soft": "rgba(47, 110, 197, 0.14)",
  },
  {
    "--accent": "#3db8d1",
    "--accent-soft": "rgba(61, 184, 209, 0.14)",
  },
];

const serviceCardStyles: ThemeStyle[] = [
  {
    "--accent": "#d7a72f",
    "--accent-soft": "rgba(215, 167, 47, 0.12)",
  },
  {
    "--accent": "#2f6ec5",
    "--accent-soft": "rgba(47, 110, 197, 0.12)",
  },
  {
    "--accent": "#3db8d1",
    "--accent-soft": "rgba(61, 184, 209, 0.12)",
  },
  {
    "--accent": "#7ea3c2",
    "--accent-soft": "rgba(126, 163, 194, 0.12)",
  },
];

const needServiceKeys: ServiceKey[] = ["solar", "privacy", "security", "smart"];
const serviceCardKeys: ServiceKey[] = ["solar", "security", "smart", "privacy"];

const dynamicUiCopy = {
  en: {
    serviceSelectorEyebrow: "Color-coded service navigation",
    serviceSelectorText:
      "Pick the service path that matches the problem. The hero, Gena, and the estimate form will adapt to it.",
    featuredLabel: "Now featuring",
    proofLabel: "What this service is usually chosen for",
    callHint: "For local service sites in the U.S., phone calls usually convert fastest when the visitor already knows the problem.",
    activePathLabel: "Active path",
    selectedPathLabel: "Selected path",
  },
  ru: {
    serviceSelectorEyebrow: "Цветная навигация по услугам",
    serviceSelectorText:
      "Выберите направление по вашей задаче. Под него перестроятся герой-блок, Гена и форма заявки.",
    featuredLabel: "Сейчас в фокусе",
    proofLabel: "Обычно эту услугу выбирают, когда нужно",
    callHint:
      "Для локального рынка США звонок чаще всего конвертирует быстрее, когда клиент уже понимает свою проблему.",
    activePathLabel: "Активный сценарий",
    selectedPathLabel: "Выбранный сценарий",
  },
} as const;

const serviceSpotlights = [
  {
    key: "solar" as const,
    value: "Solar Window Films",
    accent: "#d7a72f",
    soft: "rgba(215, 167, 47, 0.18)",
    deep: "#7a5612",
    en: {
      navLabel: "Solar",
      navShort: "Heat + glare",
      badge: "Solar control",
      title: "Solar films that calm bright, overheated rooms without shutting daylight down.",
      text:
        "Start here if the room gets too hot, the sun feels aggressive, or screens are hard to use during the day.",
      points: [
        "Best fit for west-facing glass and sunny living spaces",
        "Helps cut glare on TVs, laptops, and office screens",
        "Popular first step for homes, offices, and storefront comfort",
      ],
      primaryCta: "Get Solar Estimate",
      formIntro:
        "Tell us which rooms feel too hot or too bright and we will guide you to the right solar film path.",
      formButtonLabel: "Get Solar Estimate",
      mediaBadge: "Featured path: solar control",
      mediaTitle: "Best when you want:",
      mediaText: "less heat, less glare, cooler rooms, and a cleaner light experience.",
      mascotMessage: "Gena says solar film is usually the fastest win for rooms that feel too hot or too bright.",
      mascotBadge: "Tap for solar estimate",
    },
    ru: {
      navLabel: "Solar",
      navShort: "Жара + блики",
      badge: "Защита от солнца",
      title: "Солнцезащитные пленки для ярких и перегретых помещений без ощущения темной комнаты.",
      text:
        "Начинайте с этого варианта, если в помещении слишком жарко, солнце давит или экранами неудобно пользоваться днем.",
      points: [
        "Подходит для западных окон и очень солнечных помещений",
        "Помогает убрать блики с ТВ, ноутбуков и рабочих экранов",
        "Часто это первый и самый понятный шаг для дома, офиса и витрины",
      ],
      primaryCta: "Расчет по solar-пленке",
      formIntro:
        "Расскажите, какие комнаты слишком жаркие или яркие, и мы подберем правильное солнцезащитное решение.",
      formButtonLabel: "Получить solar-расчет",
      mediaBadge: "В фокусе: solar control",
      mediaTitle: "Лучше всего, когда нужно:",
      mediaText: "меньше жары, меньше бликов, прохладнее комнаты и комфортнее свет.",
      mascotMessage: "Гена советует начинать с solar-пленки, когда главная проблема — жара и агрессивное солнце.",
      mascotBadge: "Нажмите для solar-расчета",
    },
  },
  {
    key: "privacy" as const,
    value: "Privacy / Frosted Films",
    accent: "#57a8d8",
    soft: "rgba(87, 168, 216, 0.18)",
    deep: "#245a7e",
    en: {
      navLabel: "Privacy",
      navShort: "Private + bright",
      badge: "Privacy films",
      title: "Privacy films that keep the room bright while making the glass feel calmer and more discreet.",
      text:
        "Choose this path when you want less visibility through the glass without closing the space off completely.",
      points: [
        "Strong for bathrooms, meeting rooms, partitions, and entry glass",
        "Lets the space stay open and clean instead of heavy or blocked off",
        "Great fit when the goal is privacy first, not darkness",
      ],
      primaryCta: "Get Privacy Estimate",
      formIntro:
        "Tell us where you need privacy and whether you want frosted, decorative, or daylight-friendly coverage.",
      formButtonLabel: "Get Privacy Estimate",
      mediaBadge: "Featured path: privacy film",
      mediaTitle: "Best when you want:",
      mediaText: "more privacy, bright interiors, cleaner partitions, and a softer architectural look.",
      mascotMessage: "Gena says privacy film is the easiest path when you want less exposure without losing light.",
      mascotBadge: "Tap for privacy estimate",
    },
    ru: {
      navLabel: "Privacy",
      navShort: "Приватно + светло",
      badge: "Пленки для приватности",
      title: "Privacy-пленки, которые сохраняют свет в комнате и делают стекло спокойнее и приватнее.",
      text:
        "Выбирайте этот сценарий, если хотите меньше просматриваемости через стекло, но не хотите закрывать помещение полностью.",
      points: [
        "Хорошо подходят для ванных, переговорных, перегородок и входного стекла",
        "Сохраняют легкость пространства вместо тяжелых штор и закрытых окон",
        "Отличный выбор, когда на первом месте именно приватность, а не затемнение",
      ],
      primaryCta: "Расчет по privacy-пленке",
      formIntro:
        "Напишите, где нужна приватность и хотите ли вы матовый, декоративный или максимально светлый вариант.",
      formButtonLabel: "Получить privacy-расчет",
      mediaBadge: "В фокусе: privacy film",
      mediaTitle: "Лучше всего, когда нужно:",
      mediaText: "больше приватности, светлые интерьеры, аккуратные перегородки и мягкий архитектурный вид.",
      mascotMessage: "Гена говорит, что privacy-пленка — самый понятный путь, когда хочется меньше видимости без потери света.",
      mascotBadge: "Нажмите для privacy-расчета",
    },
  },
  {
    key: "security" as const,
    value: "Security / Safety Films",
    accent: "#2f6ec5",
    soft: "rgba(47, 110, 197, 0.18)",
    deep: "#1d4782",
    en: {
      navLabel: "Safety",
      navShort: "Glass protection",
      badge: "Safety / security films",
      title: "Security films that help the glass stay together longer and feel more secure under impact.",
      text:
        "This is the right path when the concern is breakage, entry glass, storefront exposure, or safer glass behavior.",
      points: [
        "Useful for storefronts, doors, first-floor glass, and vulnerable entries",
        "Helps hold broken pieces together after impact",
        "Chosen when safety and risk reduction matter more than style alone",
      ],
      primaryCta: "Get Safety Estimate",
      formIntro:
        "Tell us which glass feels vulnerable and whether the priority is safety, storefront protection, or impact response.",
      formButtonLabel: "Get Safety Estimate",
      mediaBadge: "Featured path: safety film",
      mediaTitle: "Best when you want:",
      mediaText: "better fragment retention, safer doors and storefront glass, and a stronger protection layer.",
      mascotMessage: "Gena says safety film is the path to start with when the glass itself is the main concern.",
      mascotBadge: "Tap for safety estimate",
    },
    ru: {
      navLabel: "Safety",
      navShort: "Защита стекла",
      badge: "Защитные / safety-пленки",
      title: "Защитные пленки, которые помогают стеклу дольше держаться вместе и дают больше ощущения безопасности.",
      text:
        "Это правильный путь, когда беспокоят разбитие стекла, входные двери, витрины или более безопасное поведение стекла при ударе.",
      points: [
        "Подходит для витрин, дверей, стекла первых этажей и уязвимых входов",
        "Помогает удерживать осколки после удара",
        "Выбирают, когда безопасность и снижение риска важнее одного только внешнего вида",
      ],
      primaryCta: "Расчет по safety-пленке",
      formIntro:
        "Расскажите, какое стекло кажется уязвимым и что важнее: безопасность, защита витрины или реакция на удар.",
      formButtonLabel: "Получить safety-расчет",
      mediaBadge: "В фокусе: safety film",
      mediaTitle: "Лучше всего, когда нужно:",
      mediaText: "лучше удерживать осколки, сделать двери и витрины безопаснее и добавить защитный слой.",
      mascotMessage: "Гена советует safety-пленку, когда главный вопрос — само стекло и его защита.",
      mascotBadge: "Нажмите для safety-расчета",
    },
  },
  {
    key: "smart" as const,
    value: "Smart / Switchable Films",
    accent: "#3db8d1",
    soft: "rgba(61, 184, 209, 0.18)",
    deep: "#1f6674",
    en: {
      navLabel: "Smart",
      navShort: "On-demand privacy",
      badge: "Smart films",
      title: "Smart films that switch glass from clear to private on demand for a premium, modern experience.",
      text:
        "Go here when you want privacy without permanent frosting and you want the glass to feel like a feature.",
      points: [
        "Popular for conference rooms, luxury bathrooms, wellness spaces, and premium interiors",
        "Creates a dramatic wow factor while still solving a practical privacy need",
        "Best for clients who want both function and a strong design statement",
      ],
      primaryCta: "Get Smart Film Estimate",
      formIntro:
        "Tell us where you want switchable privacy and whether the space is residential, office, or hospitality.",
      formButtonLabel: "Get Smart Estimate",
      mediaBadge: "Featured path: smart film",
      mediaTitle: "Best when you want:",
      mediaText: "instant privacy, premium interiors, a wow effect, and glass that feels high-tech.",
      mascotMessage: "Gena says smart film is the premium move when you want privacy to appear only when needed.",
      mascotBadge: "Tap for smart estimate",
    },
    ru: {
      navLabel: "Smart",
      navShort: "Приватность по кнопке",
      badge: "Smart-пленки",
      title: "Smart-пленки, которые переключают стекло из прозрачного в приватное и дают современный премиальный эффект.",
      text:
        "Идите сюда, если хотите приватность без постоянной матовости и хотите, чтобы стекло стало фишкой пространства.",
      points: [
        "Популярны для переговорных, люксовых ванных, wellness-зон и премиальных интерьеров",
        "Дают сильный wow-эффект и одновременно решают задачу приватности",
        "Лучший вариант, когда важны и функция, и сильное визуальное впечатление",
      ],
      primaryCta: "Расчет по smart-пленке",
      formIntro:
        "Напишите, где нужна переключаемая приватность и для какого пространства это решение: дом, офис или hospitality.",
      formButtonLabel: "Получить smart-расчет",
      mediaBadge: "В фокусе: smart film",
      mediaTitle: "Лучше всего, когда нужно:",
      mediaText: "мгновенная приватность, премиальный интерьер, wow-эффект и технологичное стекло.",
      mascotMessage: "Гена подсказывает smart-пленку, когда нужна приватность по запросу, а не постоянно.",
      mascotBadge: "Нажмите для smart-расчета",
    },
  },
] as const;

const landingContent = {
  en: {
    schemaDescription:
      "Premium window film installation for solar, security, smart, and privacy films in Los Angeles.",
    header: {
      logoAria: "Rolan Pro home",
      navNeeds: "What you need",
      navServices: "Services",
      navProcess: "Process",
      navFaq: "FAQ",
      meta: "Los Angeles . Homes + Commercial",
      cta: "Get Free Estimate",
    },
    hero: {
      eyebrow: "Los Angeles window film installation",
      title: "Make your glass cooler, more private, and safer.",
      text:
        "Solar, smart, privacy, and security films for homes, offices, and storefronts. Tell us what you want to improve and we will recommend the right film and installation path.",
      primaryCta: "Start My Estimate",
      secondaryCta: "Call",
      mediaBadge: "Solar . Smart . Privacy . Security",
      mediaTitle: "Most requested in Los Angeles:",
      mediaText: "cooler rooms, more privacy, safer storefront glass, and smart film upgrades.",
    },
    trustItems: [
      "Free on-site consultation",
      "Film samples brought to your glass",
      "Residential and commercial",
      "Clear recommendations and quote",
    ],
    metrics: [
      { value: "10+", label: "Years in business" },
      { value: "15+", label: "Years of industry experience" },
      { value: "LA", label: "Homes, offices, and storefronts" },
      { value: "4", label: "Core film paths kept simple" },
    ],
    needs: {
      eyebrow: "Choose by result",
      title: "Start with what you want to improve in the room.",
      text:
        "Most people do not know film names, and they should not have to. Pick the result you need and we will guide you to the best option during the estimate.",
      tag: "Best path",
      cta: "Get recommendation",
      cards: [
        {
          title: "Too much heat and glare",
          path: "Solar window films",
          text: "A strong fit for sun-facing rooms, offices, and storefront glass that feels too bright or too hot.",
        },
        {
          title: "Need more privacy",
          path: "Privacy / frosted films",
          text: "Best for bathrooms, meeting rooms, partitions, front doors, and glass that should stay bright but private.",
        },
        {
          title: "Worried about glass breakage",
          path: "Security / safety films",
          text: "A better choice for storefronts, ground-floor glass, offices, and entry doors where safety matters.",
        },
        {
          title: "Want glass that switches private",
          path: "Smart / switchable films",
          text: "Ideal for premium interiors, conference rooms, bathrooms, and spaces that need privacy on demand.",
        },
      ],
    },
    services: {
      eyebrow: "Services",
      title: "Four clear film solutions for the most common requests.",
      text:
        "We keep the first page focused on the services people ask for most, so it is easy to compare options and request the right estimate without feeling overloaded.",
      cta: "Request estimate",
      specialtyNote:
        "Need decorative, anti-graffiti, or specialty exterior film? Those requests can still be reviewed during the estimate without overloading the first page.",
      cards: [
        {
          label: "Solar control",
          title: "Solar Window Films",
          text: "Reduce heat, glare, and UV exposure while keeping rooms comfortable and visually clean.",
          bullets: [
            "Helps reduce solar heat",
            "Makes screens easier to use",
            "Many options preserve daylight",
          ],
        },
        {
          label: "Glass protection",
          title: "Security / Safety Films",
          text: "Adds a protective layer that helps hold broken glass together and supports a safer response during impact.",
          bullets: [
            "Fragment retention support",
            "Useful for storefronts and doors",
            "Residential and commercial fit",
          ],
        },
        {
          label: "Instant privacy",
          title: "Smart / Switchable Films",
          text: "Turns glass from clear to private on demand for a modern, premium privacy experience.",
          bullets: [
            "On-demand privacy",
            "Luxury interior upgrade",
            "Strong fit for meeting rooms and bathrooms",
          ],
        },
        {
          label: "Soft daylight",
          title: "Privacy / Frosted Films",
          text: "Adds privacy without closing off natural light, with a clean architectural finish.",
          bullets: [
            "Great for partitions and doors",
            "Keeps the room bright",
            "Simple, modern privacy solution",
          ],
        },
      ],
    },
    reassurances: {
      eyebrow: "Why clients choose Rolan Pro",
      title: "Clear recommendations, clean installation, and no confusion.",
      text:
        "People leave a request when the next step feels safe and simple. We explain the fit, the finish, and the installation path before you commit to anything.",
      tag: "Common hesitation",
      cards: [
        {
          problem: "Not sure which film is right?",
          answer:
            "We organize the decision around the result you want: less heat, more privacy, safer glass, or smart control.",
        },
        {
          problem: "Worried the room will get too dark?",
          answer:
            "We can compare lighter solar films, frosted privacy options, and smart film paths based on your actual glass and light.",
        },
        {
          problem: "Need clean work in an occupied space?",
          answer:
            "The service path is built for homes, offices, and storefronts that need professional installation without unnecessary chaos.",
        },
        {
          problem: "Need one team for multiple film types?",
          answer:
            "Rolan Pro covers solar, privacy, security, and smart film so the client does not need to shop four different contractors.",
        },
      ],
    },
    process: {
      eyebrow: "How it works",
      title: "Simple path from first contact to recommendation and installation.",
      text:
        "You do not need to prepare technical details. Tell us what bothers you about the glass, and we will take it from there.",
      steps: [
        {
          number: "01",
          title: "Tell us what needs to change",
          text: "Heat, glare, privacy, smart glass, or safer glass behavior. Start with the problem, not the jargon.",
        },
        {
          number: "02",
          title: "We review glass, light, and fit",
          text: "The estimate is where the right film gets matched to the actual space, the visual finish, and the usage pattern.",
        },
        {
          number: "03",
          title: "You get the recommendation and install path",
          text: "Clear recommendation, clean installation, and the next step without guesswork.",
        },
      ],
    },
    faq: {
      eyebrow: "Questions",
      title: "Answers to the questions people ask before they contact us.",
      text:
        "These are the concerns that usually slow down a decision: price, privacy at night, heat reduction, glass safety, and smart film fit.",
      items: [
        {
          question: "How much does window film installation cost?",
          answer:
            "Pricing depends on film type, glass size, access, quantity, and installation complexity. The estimate is used to recommend the right film and give a clear quote.",
        },
        {
          question: "Does window film really help with heat?",
          answer:
            "Yes. Solar films are commonly used to help reduce heat and glare. Exact performance depends on the film, the glass, and sun exposure.",
        },
        {
          question: "Does privacy film work at night?",
          answer:
            "Daytime reflective privacy depends on the light balance. For reliable night privacy, frosted film or smart film is usually the better path.",
        },
        {
          question: "Can security film stop break-ins?",
          answer:
            "Security film does not make glass unbreakable. It helps hold broken pieces together and can delay access when the right system is specified and installed.",
        },
        {
          question: "Is smart film only for offices?",
          answer:
            "No. Smart film is also a strong option for bathrooms, premium homes, wellness spaces, and interiors that need privacy only some of the time.",
        },
        {
          question: "Do you only do these four services?",
          answer:
            "These are the main conversion-focused paths. Decorative, anti-graffiti, and some specialty exterior applications can also be discussed during the estimate.",
        },
      ],
    },
    final: {
      eyebrow: "Free estimate",
      title: "Send a quick request and get the right film recommendation.",
      text:
        "Homes, offices, storefronts, bathrooms, meeting rooms, and premium interiors across Los Angeles and nearby areas.",
      primaryCta: "Start Free Estimate",
      secondaryCta: "Call Now",
    },
    contacts: {
      call: "Call",
      email: "Email",
      office: "Office",
      officeValue: "5320 Derry Ave Ste N, Agoura Hills, CA 91301",
      maps: "Open in Google Maps",
      specialty: "Specialty note",
      specialtyText:
        "Decorative, anti-graffiti, and selected specialty exterior film applications can be discussed during the estimate as well.",
    },
    footer: {
      text:
        "Premium window film installation for solar, privacy, security, and smart glass applications in Los Angeles.",
      estimate: "Estimate",
    },
    mobileBar: {
      call: "Call now",
      estimate: "Get estimate",
    },
    form: {
      kicker: "Free estimate",
      title: "Get your free estimate",
      intro: "30-second request. Tell us the main goal and we will point you to the right film path.",
      nameLabel: "Name *",
      namePlaceholder: "Your name",
      phoneLabel: "Phone *",
      phonePlaceholder: "(424) 325-0512",
      propertyTypeLabel: "Property type",
      propertyTypeOptions: [
        { value: "Home", label: "Home" },
        { value: "Office", label: "Office" },
        { value: "Retail / Storefront", label: "Retail / Storefront" },
        { value: "Commercial Property", label: "Commercial Property" },
        { value: "Contractor / Designer Project", label: "Contractor / Designer Project" },
        { value: "Other", label: "Other" },
      ],
      serviceTypeLabel: "Main goal",
      serviceTypeOptions: [
        { value: "Need expert recommendation", label: "Need expert recommendation" },
        { value: "Solar Window Films", label: "Solar Window Films" },
        { value: "Security / Safety Films", label: "Security / Safety Films" },
        { value: "Smart / Switchable Films", label: "Smart / Switchable Films" },
        { value: "Privacy / Frosted Films", label: "Privacy / Frosted Films" },
        { value: "Specialty film request", label: "Specialty film request" },
      ],
      emailLabel: "Email",
      emailPlaceholder: "you@email.com",
      cityLabel: "City / Area",
      cityPlaceholder: "Los Angeles, Agoura Hills, etc.",
      messageLabel: "Project details",
      messagePlaceholder: "Tell us about the glass, the space, or the result you want.",
      buttonLabel: "Get My Estimate",
      buttonPendingLabel: "Sending request...",
      helperCall: "Prefer to talk now? Call",
      successMessage: "Thanks. Your request is in the CRM and our team can follow up with you.",
      errorMessage: "Something went wrong. Please call us directly.",
      networkErrorMessage: "Network issue. Please try again or call us directly.",
      honeypotMessage: "Thanks. Your request has been received.",
      consentNote: "By sending the form, you allow Rolan Pro to contact you about your estimate request.",
      smsConsentLabel:
        "I agree to receive SMS messages from RolanPRO about my quote, appointment, project updates, and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.",
      smsConsentErrorMessage: "Please confirm SMS consent so we can text you about this request.",
      privacyPolicyLabel: "Privacy Policy",
      termsLabel: "Terms",
      companyLabel: "Company",
    },
    mascot: {
      ariaLabel: "Rolan Pro helper mascot",
      closeLabel: "Close helper",
      label: "Rolan helper",
      message: "Need help choosing the right film?",
    },
  },
  ru: {
    schemaDescription:
      "Премиальная установка солнцезащитных, защитных, privacy и smart пленок в Лос-Анджелесе.",
    header: {
      logoAria: "Главная Rolan Pro",
      navNeeds: "Что нужно",
      navServices: "Услуги",
      navProcess: "Процесс",
      navFaq: "Вопросы",
      meta: "Лос-Анджелес . Дома и бизнес",
      cta: "Получить расчет",
    },
    hero: {
      eyebrow: "Установка пленок на стекло в Лос-Анджелесе",
      title: "Сделайте стекло прохладнее, приватнее и безопаснее.",
      text:
        "Солнцезащитные, smart, privacy и защитные пленки для домов, офисов и витрин. Расскажите, что хотите улучшить, и мы подберем правильное решение и удобный путь монтажа.",
      primaryCta: "Оставить заявку",
      secondaryCta: "Позвонить",
      mediaBadge: "Солнце . Smart . Privacy . Защита",
      mediaTitle: "Чаще всего заказывают в Лос-Анджелесе:",
      mediaText: "меньше жары, больше приватности, более безопасные витрины и smart-пленки.",
    },
    trustItems: [
      "Бесплатный выезд на консультацию",
      "Привозим образцы пленок к вашему стеклу",
      "Для дома и коммерции",
      "Понятная рекомендация и расчет",
    ],
    metrics: [
      { value: "10+", label: "Лет на рынке" },
      { value: "15+", label: "Лет опыта в индустрии" },
      { value: "LA", label: "Дома, офисы и витрины" },
      { value: "4", label: "Понятных направления услуг" },
    ],
    needs: {
      eyebrow: "Выбор по результату",
      title: "Начните с того, что хотите улучшить в помещении.",
      text:
        "Большинство клиентов не знают названия пленок, и это нормально. Выберите нужный результат, а мы подскажем лучший вариант на этапе расчета.",
      tag: "Лучшее решение",
      cta: "Получить рекомендацию",
      cards: [
        {
          title: "Слишком много жары и бликов",
          path: "Солнцезащитные пленки",
          text: "Подходит для солнечных комнат, офисов и витрин, где слишком ярко и жарко.",
        },
        {
          title: "Нужна больше приватности",
          path: "Privacy / матовые пленки",
          text: "Подходит для ванных, переговорных, перегородок, входных дверей и стекла, где нужен свет без лишней видимости.",
        },
        {
          title: "Беспокоитесь о разбитии стекла",
          path: "Защитные / safety пленки",
          text: "Хороший вариант для витрин, стеклянных дверей, офисов и первых этажей, где важна безопасность.",
        },
        {
          title: "Хотите переключаемую приватность",
          path: "Smart / switchable пленки",
          text: "Идеально для премиальных интерьеров, переговорных, ванных комнат и пространств с приватностью по запросу.",
        },
      ],
    },
    services: {
      eyebrow: "Услуги",
      title: "Четыре понятных решения для самых частых запросов.",
      text:
        "Мы оставляем на первой странице только самые востребованные направления, чтобы клиенту было легко сравнить варианты и быстро оставить заявку.",
      cta: "Запросить расчет",
      specialtyNote:
        "Нужны декоративные, антиграффити или специальные наружные пленки? Это тоже можно обсудить на этапе расчета, не перегружая первую страницу.",
      cards: [
        {
          label: "Защита от солнца",
          title: "Солнцезащитные пленки",
          text: "Снижают жару, блики и UV-нагрузку, сохраняя комфорт и аккуратный вид помещения.",
          bullets: [
            "Помогают уменьшить нагрев",
            "Делают экраны удобнее для работы",
            "Многие варианты сохраняют дневной свет",
          ],
        },
        {
          label: "Защита стекла",
          title: "Защитные / Safety пленки",
          text: "Добавляют защитный слой, который помогает удерживать осколки и повышает безопасность при ударе.",
          bullets: [
            "Поддержка удержания осколков",
            "Подходит для витрин и дверей",
            "Для жилых и коммерческих объектов",
          ],
        },
        {
          label: "Мгновенная приватность",
          title: "Smart / Switchable пленки",
          text: "Переключают стекло из прозрачного в приватное по нажатию и дают современный премиальный эффект.",
          bullets: [
            "Приватность по запросу",
            "Премиальный апгрейд интерьера",
            "Отлично для переговорных и ванных",
          ],
        },
        {
          label: "Мягкий дневной свет",
          title: "Privacy / матовые пленки",
          text: "Добавляют приватность, не перекрывая естественный свет, и дают чистый архитектурный вид.",
          bullets: [
            "Отлично для перегородок и дверей",
            "Сохраняют свет в помещении",
            "Простое современное решение приватности",
          ],
        },
      ],
    },
    reassurances: {
      eyebrow: "Почему выбирают Rolan Pro",
      title: "Понятные рекомендации, аккуратный монтаж и никакой путаницы.",
      text:
        "Клиент оставляет заявку, когда следующий шаг кажется простым и безопасным. Мы заранее объясняем, что подойдет именно вашему стеклу и как пройдет установка.",
      tag: "Частое сомнение",
      cards: [
        {
          problem: "Не знаете, какая пленка подойдет?",
          answer:
            "Мы подбираем решение по результату: меньше жары, больше приватности, безопаснее стекло или smart-управление.",
        },
        {
          problem: "Боитесь, что в комнате станет слишком темно?",
          answer:
            "Мы сравним более светлые солнцезащитные пленки, матовые privacy-варианты и smart-пленки под ваше стекло и освещение.",
        },
        {
          problem: "Нужен чистый монтаж в работающем помещении?",
          answer:
            "Наш процесс подходит для домов, офисов и витрин, где важен профессиональный монтаж без лишнего хаоса.",
        },
        {
          problem: "Нужна одна команда под разные типы пленок?",
          answer:
            "Rolan Pro закрывает solar, privacy, safety и smart-пленки, чтобы вам не пришлось искать несколько подрядчиков.",
        },
      ],
    },
    process: {
      eyebrow: "Как это работает",
      title: "Простой путь от первого контакта до рекомендации и монтажа.",
      text:
        "Вам не нужно готовить технические детали. Просто расскажите, что не устраивает в стекле, и мы возьмем остальное на себя.",
      steps: [
        {
          number: "01",
          title: "Расскажите, что хотите изменить",
          text: "Жара, блики, приватность, smart-стекло или более безопасное поведение стекла. Начинаем с проблемы, а не со сложных терминов.",
        },
        {
          number: "02",
          title: "Мы оцениваем стекло, свет и задачу",
          text: "На этапе расчета мы подбираем правильную пленку под пространство, внешний вид и реальный сценарий использования.",
        },
        {
          number: "03",
          title: "Вы получаете рекомендацию и путь монтажа",
          text: "Понятная рекомендация, аккуратная установка и следующий шаг без догадок.",
        },
      ],
    },
    faq: {
      eyebrow: "Вопросы",
      title: "Ответы на вопросы, которые чаще всего задают перед заявкой.",
      text:
        "Обычно решение тормозят цена, приватность ночью, защита от жары, безопасность стекла и понимание, подходит ли smart-пленка.",
      items: [
        {
          question: "Сколько стоит установка пленки на окна?",
          answer:
            "Цена зависит от типа пленки, размеров стекла, доступа, объема и сложности монтажа. На расчете мы подбираем правильное решение и даем понятную стоимость.",
        },
        {
          question: "Пленка действительно помогает от жары?",
          answer:
            "Да. Солнцезащитные пленки часто ставят именно для снижения жары и бликов. Точный эффект зависит от пленки, стекла и солнечной стороны.",
        },
        {
          question: "Работает ли privacy-пленка ночью?",
          answer:
            "Дневная зеркальная приватность зависит от баланса света. Для надежной приватности ночью обычно лучше подходят матовые или smart-пленки.",
        },
        {
          question: "Может ли защитная пленка остановить взлом?",
          answer:
            "Защитная пленка не делает стекло неразбиваемым. Она помогает удерживать осколки и может замедлить доступ при правильном подборе и установке.",
        },
        {
          question: "Smart-пленка подходит только для офисов?",
          answer:
            "Нет. Smart-пленка отлично подходит и для ванных, премиальных домов, wellness-пространств и интерьеров, где приватность нужна не постоянно.",
        },
        {
          question: "Вы занимаетесь только этими четырьмя услугами?",
          answer:
            "Это основные направления для удобного выбора. Декоративные, антиграффити и некоторые наружные решения тоже можно обсудить на этапе расчета.",
        },
      ],
    },
    final: {
      eyebrow: "Бесплатный расчет",
      title: "Оставьте короткую заявку и получите правильную рекомендацию по пленке.",
      text:
        "Дома, офисы, витрины, ванные комнаты, переговорные и премиальные интерьеры по Лос-Анджелесу и ближайшим районам.",
      primaryCta: "Начать расчет",
      secondaryCta: "Позвонить сейчас",
    },
    contacts: {
      call: "Телефон",
      email: "Email",
      office: "Офис",
      officeValue: "5320 Derry Ave Ste N, Agoura Hills, CA 91301",
      maps: "Открыть в Google Maps",
      specialty: "Дополнительно",
      specialtyText:
        "Декоративные, антиграффити и некоторые специальные наружные пленки тоже можно обсудить при расчете.",
    },
    footer: {
      text:
        "Премиальная установка солнцезащитных, privacy, защитных и smart-пленок в Лос-Анджелесе.",
      estimate: "Заявка",
    },
    mobileBar: {
      call: "Позвонить",
      estimate: "Расчет",
    },
    form: {
      kicker: "Бесплатный расчет",
      title: "Получите бесплатный расчет",
      intro: "Заявка за 30 секунд. Напишите главную задачу, и мы подскажем лучший вариант пленки.",
      nameLabel: "Имя *",
      namePlaceholder: "Ваше имя",
      phoneLabel: "Телефон *",
      phonePlaceholder: "+1 (424) 325-0512",
      propertyTypeLabel: "Тип объекта",
      propertyTypeOptions: [
        { value: "Home", label: "Дом" },
        { value: "Office", label: "Офис" },
        { value: "Retail / Storefront", label: "Магазин / витрина" },
        { value: "Commercial Property", label: "Коммерческий объект" },
        { value: "Contractor / Designer Project", label: "Проект подрядчика / дизайнера" },
        { value: "Other", label: "Другое" },
      ],
      serviceTypeLabel: "Главная задача",
      serviceTypeOptions: [
        { value: "Need expert recommendation", label: "Нужна рекомендация специалиста" },
        { value: "Solar Window Films", label: "Солнцезащитные пленки" },
        { value: "Security / Safety Films", label: "Защитные / Safety пленки" },
        { value: "Smart / Switchable Films", label: "Smart / Switchable пленки" },
        { value: "Privacy / Frosted Films", label: "Privacy / матовые пленки" },
        { value: "Specialty film request", label: "Специальный запрос по пленке" },
      ],
      emailLabel: "Email",
      emailPlaceholder: "you@email.com",
      cityLabel: "Город / район",
      cityPlaceholder: "Los Angeles, Agoura Hills и т.д.",
      messageLabel: "Детали проекта",
      messagePlaceholder: "Расскажите про стекло, помещение или результат, который хотите получить.",
      buttonLabel: "Получить расчет",
      buttonPendingLabel: "Отправляем заявку...",
      helperCall: "Хотите поговорить сразу? Звоните",
      successMessage: "Спасибо. Ваша заявка уже в CRM, и наша команда сможет с вами связаться.",
      errorMessage: "Что-то пошло не так. Пожалуйста, позвоните нам напрямую.",
      networkErrorMessage: "Проблема с сетью. Попробуйте еще раз или позвоните нам напрямую.",
      honeypotMessage: "Спасибо. Ваша заявка получена.",
      consentNote: "Отправляя форму, вы разрешаете Rolan Pro связаться с вами по вашему запросу.",
      smsConsentLabel:
        "Я согласен получать SMS от RolanPRO по заявке, консультации, замеру, статусу проекта и поддержке. Частота сообщений может меняться. Возможна тарификация оператора. Для отказа ответьте STOP, для помощи HELP. Согласие не является условием покупки.",
      smsConsentErrorMessage: "Подтвердите SMS-согласие, чтобы мы могли писать вам по этой заявке.",
      privacyPolicyLabel: "Privacy Policy",
      termsLabel: "Terms",
      companyLabel: "Компания",
    },
    mascot: {
      ariaLabel: "Плавающий помощник Rolan Pro",
      closeLabel: "Закрыть помощника",
      label: "Помощник Rolan",
      message: "Помочь выбрать правильную пленку?",
    },
  },
} as const;

export function LandingPage() {
  const [locale, setLocale] = useState<Locale>("en");
  const [activeServiceIndex, setActiveServiceIndex] = useState(0);
  const [serviceRotationLocked, setServiceRotationLocked] = useState(false);

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);

    if (storedLocale === "en" || storedLocale === "ru") {
      setLocale(storedLocale);
      return;
    }

    if (window.navigator.language.toLowerCase().startsWith("ru")) {
      setLocale("ru");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (serviceRotationLocked) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveServiceIndex((current) => (current + 1) % serviceSpotlights.length);
    }, 5200);

    return () => window.clearInterval(interval);
  }, [serviceRotationLocked]);

  const t = landingContent[locale];
  const ui = dynamicUiCopy[locale];
  const activeService = serviceSpotlights[activeServiceIndex];
  const activeServiceCopy = activeService[locale];
  const themedPageStyle: ThemeStyle = {
    "--theme-glow": activeService.soft,
    "--theme-accent": activeService.accent,
    "--theme-accent-soft": activeService.soft,
    "--theme-accent-deep": activeService.deep,
  };
  const compactFormCopy = {
    ...t.form,
    intro: activeServiceCopy.formIntro,
    buttonLabel: activeServiceCopy.formButtonLabel,
  };

  function setActiveServiceByIndex(index: number) {
    setServiceRotationLocked(true);
    setActiveServiceIndex(index);
  }

  function setActiveServiceByKey(key: ServiceKey) {
    const index = serviceSpotlights.findIndex((service) => service.key === key);

    if (index >= 0) {
      setActiveServiceByIndex(index);
    }
  }

  function handleServiceTypeChange(value: string) {
    const index = serviceSpotlights.findIndex((service) => service.value === value);

    if (index >= 0) {
      setActiveServiceByIndex(index);
    }
  }

  const businessSchema = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: "Rolan Pro",
    image: "/landing/hero-window-film.jpg",
    telephone: phoneLabel,
    email: emailLabel,
    url: "/",
    address: {
      "@type": "PostalAddress",
      streetAddress: "5320 Derry Ave Ste N",
      addressLocality: "Agoura Hills",
      addressRegion: "CA",
      postalCode: "91301",
      addressCountry: "US",
    },
    areaServed: ["Los Angeles", "Agoura Hills", "Greater Los Angeles Area"],
    description: t.schemaDescription,
    serviceType: [
      "Solar Window Films",
      "Security / Safety Films",
      "Smart / Switchable Films",
      "Privacy / Frosted Films",
    ],
  };

  return (
    <main className={styles.pageShell} style={themedPageStyle}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema) }}
      />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logoLink} href="#top" aria-label={t.header.logoAria}>
            <img
              className={styles.logo}
              src="/landing/rolan-logo.webp"
              alt="Rolan Pro logo"
              width="220"
              height="62"
            />
          </a>

          <nav className={styles.headerNav} aria-label="Primary navigation">
            <a href="#needs">{t.header.navNeeds}</a>
            <a href="#services">{t.header.navServices}</a>
            <a href="#process">{t.header.navProcess}</a>
            <a href="#faq">{t.header.navFaq}</a>
          </nav>

          <div className={styles.headerActions}>
            <div className={styles.languageSwitch} aria-label="Language switcher">
              <button
                className={`${styles.languageButton} ${locale === "en" ? styles.languageButtonActive : ""}`.trim()}
                type="button"
                onClick={() => setLocale("en")}
              >
                EN
              </button>
              <button
                className={`${styles.languageButton} ${locale === "ru" ? styles.languageButtonActive : ""}`.trim()}
                type="button"
                onClick={() => setLocale("ru")}
              >
                RU
              </button>
            </div>
            <div className={styles.headerMeta}>{t.header.meta}</div>
            <a className={styles.headerPhone} href={phoneHref}>
              {phoneLabel}
            </a>
            <a className={styles.primaryButton} href="#lead-form">
              {t.header.cta}
            </a>
          </div>
        </div>
      </header>

      <section id="top" className={styles.heroSection}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>{t.hero.eyebrow}</div>
            <h1 className={styles.heroTitle}>{t.hero.title}</h1>
            <p className={styles.heroText}>{t.hero.text}</p>

            <div className={styles.serviceNavigator}>
              <div className={styles.serviceNavigatorCopy}>
                <strong>{ui.serviceSelectorEyebrow}</strong>
                <p>{ui.serviceSelectorText}</p>
              </div>

              <div className={styles.servicePills}>
                {serviceSpotlights.map((service, index) => {
                  const serviceCopy = service[locale];

                  return (
                    <button
                      key={service.key}
                      className={`${styles.servicePill} ${
                        index === activeServiceIndex ? styles.servicePillActive : ""
                      }`.trim()}
                      type="button"
                      style={
                        {
                          "--accent": service.accent,
                          "--accent-soft": service.soft,
                          "--accent-deep": service.deep,
                        } as CSSProperties
                      }
                      onClick={() => setActiveServiceByIndex(index)}
                    >
                      <strong>{serviceCopy.navLabel}</strong>
                      <span>{serviceCopy.navShort}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.heroCtas}>
              <a className={styles.primaryButton} href="#lead-form">
                {activeServiceCopy.primaryCta}
              </a>
              <a className={styles.secondaryButton} href={phoneHref}>
                {t.hero.secondaryCta} {phoneLabel}
              </a>
            </div>

            <div
              className={styles.heroServicePreview}
              style={
                {
                  "--accent": activeService.accent,
                  "--accent-soft": activeService.soft,
                  "--accent-deep": activeService.deep,
                } as ThemeStyle
              }
            >
              <div className={styles.heroServicePreviewHead}>
                <span className={styles.heroServicePreviewTag}>{ui.featuredLabel}</span>
                <strong className={styles.heroServicePreviewName}>{activeServiceCopy.badge}</strong>
              </div>

              <h2 className={styles.heroServicePreviewTitle}>{activeServiceCopy.title}</h2>
              <p className={styles.heroServicePreviewText}>{activeServiceCopy.text}</p>

              <div className={styles.heroCallout}>{ui.callHint}</div>

              <div className={styles.heroServicePreviewLabel}>{ui.proofLabel}</div>
              <ul className={styles.heroServicePoints}>
                {activeServiceCopy.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>

            <div className={styles.metricRail}>
              {t.metrics.map((metric) => (
                <article key={metric.label} className={styles.metricCard}>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.heroSide}>
            <LeadCaptureForm
              id="lead-form"
              compact
              copy={compactFormCopy}
              serviceTypeValue={activeService.value}
              onServiceTypeChange={handleServiceTypeChange}
            />

            <div
              className={styles.mediaCard}
              style={
                {
                  "--accent": activeService.accent,
                  "--accent-soft": activeService.soft,
                  "--accent-deep": activeService.deep,
                } as CSSProperties
              }
            >
              <div className={styles.mediaBadge}>{activeServiceCopy.mediaBadge}</div>
              <img
                className={styles.mediaImage}
                src="/landing/hero-window-film.jpg"
                alt="Interior with premium window film installation"
              />
              <div className={styles.mediaCaption}>
                <strong>{activeServiceCopy.mediaTitle}</strong>
                <span>{activeServiceCopy.mediaText}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.trustBar}>
        <div className={styles.trustRow}>
          {t.trustItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section id="needs" className={styles.section}>
        <div className={styles.sectionIntro}>
          <div className={styles.sectionEyebrow}>{t.needs.eyebrow}</div>
          <h2>{t.needs.title}</h2>
          <p>{t.needs.text}</p>
        </div>

        <div className={styles.goalGrid}>
          {t.needs.cards.map((need, index) => (
            <article
              key={need.title}
              className={`${styles.goalCard} ${
                activeService.key === needServiceKeys[index] ? styles.goalCardActive : ""
              }`.trim()}
              style={needCardStyles[index]}
            >
              <span className={styles.goalTag}>
                {activeService.key === needServiceKeys[index] ? ui.activePathLabel : t.needs.tag}
              </span>
              <h3>{need.title}</h3>
              <p>{need.text}</p>
              <strong>{need.path}</strong>
              <a
                className={styles.inlineLink}
                href="#lead-form"
                onClick={() => setActiveServiceByKey(needServiceKeys[index])}
              >
                {t.needs.cta}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section id="services" className={`${styles.section} ${styles.sectionTint}`}>
        <div className={styles.sectionIntro}>
          <div className={styles.sectionEyebrow}>{t.services.eyebrow}</div>
          <h2>{t.services.title}</h2>
          <p>{t.services.text}</p>
        </div>

        <div className={styles.serviceGrid}>
          {t.services.cards.map((service, index) => (
            <article
              key={service.title}
              className={`${styles.serviceCard} ${
                activeService.key === serviceCardKeys[index] ? styles.serviceCardActive : ""
              }`.trim()}
              style={serviceCardStyles[index]}
            >
              <div className={styles.serviceTop}>
                <span className={styles.serviceLabel}>{service.label}</span>
                {activeService.key === serviceCardKeys[index] ? (
                  <span className={styles.serviceActiveBadge}>{ui.selectedPathLabel}</span>
                ) : null}
              </div>
              <h3>{service.title}</h3>
              <p>{service.text}</p>
              <ul className={styles.serviceList}>
                {service.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <a
                className={styles.inlineLink}
                href="#lead-form"
                onClick={() => setActiveServiceByKey(serviceCardKeys[index])}
              >
                {t.services.cta}
              </a>
            </article>
          ))}
        </div>

        <div className={styles.specialtyNote}>{t.services.specialtyNote}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.reassuranceLayout}>
          <div className={styles.reassuranceCopy}>
            <div className={styles.sectionEyebrow}>{t.reassurances.eyebrow}</div>
            <h2>{t.reassurances.title}</h2>
            <p>{t.reassurances.text}</p>
          </div>

          <div className={styles.reassuranceGrid}>
            {t.reassurances.cards.map((item) => (
              <article key={item.problem} className={styles.reassuranceCard}>
                <span className={styles.reassuranceMeta}>{t.reassurances.tag}</span>
                <h3>{item.problem}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="process" className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.sectionIntro}>
          <div className={styles.sectionEyebrow}>{t.process.eyebrow}</div>
          <h2>{t.process.title}</h2>
          <p>{t.process.text}</p>
        </div>

        <div className={styles.processGrid}>
          {t.process.steps.map((step) => (
            <article key={step.number} className={styles.processCard}>
              <div className={styles.processNumber}>{step.number}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className={styles.section}>
        <div className={styles.sectionIntro}>
          <div className={styles.sectionEyebrow}>{t.faq.eyebrow}</div>
          <h2>{t.faq.title}</h2>
          <p>{t.faq.text}</p>
        </div>

        <div className={styles.faqGrid}>
          {t.faq.items.map((faq) => (
            <details key={faq.question} className={styles.faqItem}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAccent}`}>
        <div className={styles.finalPanel}>
          <div className={styles.finalCopy}>
            <div className={styles.sectionEyebrow}>{t.final.eyebrow}</div>
            <h2>{t.final.title}</h2>
            <p>{t.final.text}</p>

            <div className={styles.finalActions}>
              <a className={styles.primaryButton} href="#lead-form">
                {activeServiceCopy.primaryCta}
              </a>
              <a className={styles.secondaryButton} href={phoneHref}>
                {t.final.secondaryCta}
              </a>
            </div>
          </div>

          <div className={styles.contactStack}>
            <article className={styles.contactCard}>
              <span className={styles.contactLabel}>{t.contacts.call}</span>
              <a className={styles.contactValue} href={phoneHref}>
                {phoneLabel}
              </a>
            </article>

            <article className={styles.contactCard}>
              <span className={styles.contactLabel}>{t.contacts.email}</span>
              <a className={styles.contactValue} href={emailHref}>
                {emailLabel}
              </a>
            </article>

            <article className={styles.contactCard}>
              <span className={styles.contactLabel}>{t.contacts.office}</span>
              <p className={styles.contactValue}>{t.contacts.officeValue}</p>
              <a className={styles.inlineLink} href={mapsHref} target="_blank" rel="noreferrer">
                {t.contacts.maps}
              </a>
            </article>

            <article className={styles.contactCard}>
              <span className={styles.contactLabel}>{t.contacts.specialty}</span>
              <p className={styles.contactNote}>{t.contacts.specialtyText}</p>
            </article>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <strong>ROLAN PRO</strong>
            <p className={styles.footerText}>{t.footer.text}</p>
          </div>

          <div className={styles.footerLinks}>
            <a href="#needs">{t.header.navNeeds}</a>
            <a href="#services">{t.header.navServices}</a>
            <a href="#process">{t.header.navProcess}</a>
            <a href="#faq">{t.header.navFaq}</a>
            <a href="#lead-form">{t.footer.estimate}</a>
          </div>
        </div>
      </footer>

      <div className={styles.mobileBar}>
        <a className={styles.secondaryButton} href={phoneHref}>
          {t.mobileBar.call}
        </a>
        <a className={styles.primaryButton} href="#lead-form">
          {t.mobileBar.estimate}
        </a>
      </div>

      <MascotPromo
        copy={{
          ...t.mascot,
          message: activeServiceCopy.mascotMessage,
        }}
        accentColor={activeService.accent}
        accentSoft={activeService.soft}
        badgeText={activeServiceCopy.mascotBadge}
        onActivate={() => setServiceRotationLocked(true)}
      />
    </main>
  );
}
