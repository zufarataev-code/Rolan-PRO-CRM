"use client";

import { useEffect, useState } from "react";

import styles from "./team-directory.module.css";

/**
 * Rate directory: installer pay per service and difficulty coefficients.
 * One source for payroll and profitability — the CRM reads these values on
 * load. Service rates live on service types, coefficients on complexity levels.
 */

type Service = {
  service_type_id: string;
  service_code: string;
  name_ru: string;
  unit_type: string;
  installation_cost_per_sqft: number | string | null;
  is_active?: boolean;
};

type Level = { level_code: string; name_ru: string; multiplier: number };

const RATE_SERVICES: Record<string, string> = {
  SMART_FILM: "за sq ft",
  SAFETY_FILM: "за sq ft",
  SOLAR_FILM: "за sq ft",
  DECORATIVE_FILM: "за sq ft",
  ZONE_CONNECTION: "за зону",
};

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.errors?.[0]?.message || "Не удалось сохранить.");
  return json?.data;
}

export function RateDirectory({ onChanged }: { onChanged: () => void }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    Promise.all([request("/api/v1/settings/pricing"), request("/api/v1/settings/complexity")])
      .then(([pricing, complexity]) => {
        setServices(((pricing?.services as Service[]) || []).filter((service) => service.service_code in RATE_SERVICES));
        setLevels((complexity?.levels as Level[]) || []);
      })
      .catch((error: Error) => setNotice({ tone: "error", text: error.message }));
  }, []);

  async function saveServiceRate(service: Service, value: string) {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0) return setNotice({ tone: "error", text: "Ставка должна быть числом не меньше 0." });
    try {
      await request("/api/v1/settings/pricing", "PATCH", {
        entity: "service_type",
        id: service.service_type_id,
        patch: { installation_cost_per_sqft: rate },
      });
      setNotice({ tone: "ok", text: `${service.name_ru}: ставка монтажнику $${rate.toFixed(2)} ${RATE_SERVICES[service.service_code]}.` });
      onChanged();
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    }
  }

  async function saveMultiplier(level: Level, value: string) {
    try {
      const data = await request("/api/v1/settings/complexity", "PATCH", { level_code: level.level_code, multiplier: Number(value) });
      setLevels(data.levels);
      setNotice({ tone: "ok", text: `${level.name_ru}: коэффициент ×${Number(value).toFixed(2)}.` });
      onChanged();
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    }
  }

  return (
    <>
      {notice ? (
        <p className={notice.tone === "ok" ? styles.ok : styles.error} role="status">
          {notice.text}
        </p>
      ) : null}

      <section className={styles.card}>
        <h2>Оплата монтажнику</h2>
        <p className={styles.muted}>Сдельно по направлению. Индивидуальная ставка в карточке сотрудника имеет приоритет.</p>
        {services === null ? (
          <p className={styles.muted}>Загружаем…</p>
        ) : (
          <ul className={styles.list}>
            {services.map((service) => (
              <li key={service.service_type_id} className={styles.row}>
                <div className={styles.person}>
                  <strong>{service.name_ru}</strong>
                  <span className={styles.muted}>{RATE_SERVICES[service.service_code]}</span>
                </div>
                <label className={styles.rateField}>
                  <span>$</span>
                  <input
                    id={`rate-${service.service_code}`}
                    type="number"
                    min="0"
                    step="0.25"
                    defaultValue={Number(service.installation_cost_per_sqft ?? 0).toFixed(2)}
                    onBlur={(event) => {
                      if (Number(event.target.value) !== Number(service.installation_cost_per_sqft)) {
                        void saveServiceRate(service, event.target.value);
                      }
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <h2>Коэффициенты сложности</h2>
        <p className={styles.muted}>Умножают всю сделку: цену клиенту и оплату бригаде. Для монтажей с 1 сентября 2026.</p>
        {levels === null ? (
          <p className={styles.muted}>Загружаем…</p>
        ) : (
          <ul className={styles.list}>
            {levels.map((level) => (
              <li key={level.level_code} className={styles.row}>
                <div className={styles.person}>
                  <strong>{level.name_ru}</strong>
                </div>
                <label className={styles.rateField}>
                  <span>×</span>
                  <input
                    id={`coef-${level.level_code}`}
                    type="number"
                    min="1"
                    max="5"
                    step="0.05"
                    defaultValue={level.multiplier.toFixed(2)}
                    onBlur={(event) => {
                      if (Number(event.target.value) !== level.multiplier) void saveMultiplier(level, event.target.value);
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
