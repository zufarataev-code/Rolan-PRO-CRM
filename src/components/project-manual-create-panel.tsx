"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getAllowedFilmCategoryCodes } from "@/features/calculator/logic";
import type { CalculatorFilm, CalculatorServiceType } from "@/features/calculator/types";

type ProjectManualCreatePanelProps = {
  serviceTypes: CalculatorServiceType[];
  films: CalculatorFilm[];
  installers: Array<{
    user_id: string;
    full_name: string;
    email: string;
  }>;
  cities: Array<{
    city_id: string;
    name_ru: string;
    name_en: string;
    default_zip_code: string | null;
  }>;
  initialValues?: {
    client_name?: string;
    phone?: string;
    email?: string;
    city_id?: string;
    project_title?: string;
    project_notes?: string;
  };
  showInternalEconomics?: boolean;
};

type ApiEnvelope = {
  data?: {
    project?: {
      project_id?: string;
      project_code?: string | null;
      title?: string;
    };
    project_id?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function asNumber(value: string) {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findServiceType(serviceTypes: CalculatorServiceType[], serviceTypeId: string) {
  return serviceTypes.find((item) => item.service_type_id === serviceTypeId) ?? null;
}

function getFilmsForService(serviceType: CalculatorServiceType | null, films: CalculatorFilm[]) {
  const allowedCategories = getAllowedFilmCategoryCodes(serviceType?.service_code ?? null);
  return films.filter((film) => allowedCategories.includes(film.category_code));
}

function getDefaultFilmId(serviceType: CalculatorServiceType | null, films: CalculatorFilm[]) {
  return getFilmsForService(serviceType, films)[0]?.film_id ?? "";
}

export function ProjectManualCreatePanel({
  serviceTypes,
  films,
  installers,
  cities,
  initialValues,
  showInternalEconomics = false,
}: ProjectManualCreatePanelProps) {
  const router = useRouter();
  const defaultServiceTypeId = serviceTypes[0]?.service_type_id ?? "";
  const defaultServiceType = findServiceType(serviceTypes, defaultServiceTypeId);

  const [clientName, setClientName] = useState(initialValues?.client_name ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [cityId, setCityId] = useState(initialValues?.city_id ?? "");
  const [serviceAddress, setServiceAddress] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [projectTitle, setProjectTitle] = useState(initialValues?.project_title ?? initialValues?.client_name ?? "");
  const [serviceTypeId, setServiceTypeId] = useState(defaultServiceTypeId);
  const [filmId, setFilmId] = useState(getDefaultFilmId(defaultServiceType, films));
  const [billableSqft, setBillableSqft] = useState("");
  const [actualFilmSqft, setActualFilmSqft] = useState("");
  const [clientUnitPrice, setClientUnitPrice] = useState(defaultServiceType ? String(defaultServiceType.base_price) : "");
  const [installationCost, setInstallationCost] = useState(
    showInternalEconomics && defaultServiceType
      ? String(defaultServiceType.installation_cost_per_sqft)
      : "",
  );
  const [installerId, setInstallerId] = useState("");
  const [otherExpenses, setOtherExpenses] = useState("0");
  const [projectNotes, setProjectNotes] = useState(initialValues?.project_notes ?? "");
  const [positionNotes, setPositionNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Заполните проект и сохраните его в operational CRM.");

  const selectedServiceType = findServiceType(serviceTypes, serviceTypeId);
  const availableFilms = getFilmsForService(selectedServiceType, films);
  const selectedFilm = availableFilms.find((item) => item.film_id === filmId) ?? null;
  const selectedInstaller = installers.find((item) => item.user_id === installerId) ?? null;
  const selectedCity = cities.find((item) => item.city_id === cityId) ?? null;

  const billableSqftValue = asNumber(billableSqft);
  const actualFilmSqftValue = asNumber(actualFilmSqft) || billableSqftValue;
  const clientUnitPriceValue = asNumber(clientUnitPrice) || selectedServiceType?.base_price || 0;
  const installationCostValue = asNumber(installationCost) || selectedServiceType?.installation_cost_per_sqft || 0;
  const otherExpensesValue = asNumber(otherExpenses);
  const materialCostValue = actualFilmSqftValue * (selectedServiceType?.material_cost_per_sqft ?? 0);
  const installationCostTotal = actualFilmSqftValue * installationCostValue;
  const revenue = billableSqftValue * clientUnitPriceValue;
  const estimatedCost = materialCostValue + installationCostTotal + otherExpensesValue;
  const estimatedProfit = revenue - estimatedCost;
  const estimatedMargin = revenue > 0 ? (estimatedProfit / revenue) * 100 : 0;

  function resetForm() {
    setClientName(initialValues?.client_name ?? "");
    setPhone(initialValues?.phone ?? "");
    setEmail(initialValues?.email ?? "");
    setCityId(initialValues?.city_id ?? "");
    setServiceAddress("");
    setZipCode("");
    setProjectTitle(initialValues?.project_title ?? initialValues?.client_name ?? "");
    setServiceTypeId(defaultServiceTypeId);
    setFilmId(getDefaultFilmId(defaultServiceType, films));
    setBillableSqft("");
    setActualFilmSqft("");
    setClientUnitPrice(defaultServiceType ? String(defaultServiceType.base_price) : "");
    setInstallationCost(
      showInternalEconomics && defaultServiceType
        ? String(defaultServiceType.installation_cost_per_sqft)
        : "",
    );
    setInstallerId("");
    setOtherExpenses("0");
    setProjectNotes(initialValues?.project_notes ?? "");
    setPositionNotes("");
    setMessage("Форма очищена.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clientName.trim() || !projectTitle.trim()) {
      setMessage("Укажите клиента и название проекта.");
      return;
    }

    if (!serviceTypeId || !filmId) {
      setMessage("Выберите услугу и материал.");
      return;
    }

    if (billableSqftValue <= 0) {
      setMessage("Укажите расход для клиента больше 0.");
      return;
    }

    setSaving(true);
    setMessage("Создаю проект...");

    try {
      const response = await fetch("/api/v1/projects/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_name: clientName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          city_id: cityId || null,
          service_address: serviceAddress.trim() || null,
          zip_code: zipCode.trim() || null,
          project_title: projectTitle.trim(),
          service_type_id: serviceTypeId,
          film_id: filmId,
          billable_sqft: billableSqftValue,
          actual_film_sqft: actualFilmSqftValue,
          client_unit_price: clientUnitPriceValue,
          installation_cost_per_sqft: showInternalEconomics ? installationCostValue : null,
          extra_costs: otherExpensesValue,
          installer_id: installerId || null,
          project_notes: projectNotes.trim() || null,
          position_notes: positionNotes.trim() || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;

      if (!response.ok || !payload?.data?.project?.project_id) {
        throw new Error(payload?.errors?.[0]?.message ?? "Не удалось создать проект.");
      }

      setMessage("Проект создан. Открываю карточку проекта.");
      router.push(`/manager/projects/${payload.data.project.project_id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать проект.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="split-grid">
      <div className="surface">
        <div className="detail-hero">
          <div>
            <h2 className="surface-title">Быстрое создание проекта</h2>
            <p className="surface-subtitle">
              {showInternalEconomics
                ? "Клиент, услуга, материал, исполнитель и внутренняя экономика в одном экране."
                : "Клиент, услуга, материал, объем и исполнитель в одном экране."}
            </p>
          </div>
        </div>

        <h3 className="surface-title">Контакт и объект</h3>
        <div className="proposal-item-grid">
          <label className="calculator-field">
            <span>Клиент</span>
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} disabled={saving} />
          </label>

          <label className="calculator-field">
            <span>Телефон</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} disabled={saving} />
          </label>

          <label className="calculator-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={saving} />
          </label>

          <label className="calculator-field">
            <span>Город</span>
            <select
              value={cityId}
              onChange={(event) => {
                const nextCityId = event.target.value;
                const nextCity = cities.find((item) => item.city_id === nextCityId) ?? null;
                setCityId(nextCityId);
                if (!zipCode.trim() && nextCity?.default_zip_code) {
                  setZipCode(nextCity.default_zip_code);
                }
              }}
              disabled={saving}
            >
              <option value="">Без города</option>
              {cities.map((city) => (
                <option key={city.city_id} value={city.city_id}>
                  {city.name_ru || city.name_en}
                </option>
              ))}
            </select>
          </label>

          <label className="calculator-field">
            <span>Название проекта</span>
            <input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} disabled={saving} />
          </label>

          <label className="calculator-field">
            <span>ZIP</span>
            <input value={zipCode} onChange={(event) => setZipCode(event.target.value)} disabled={saving} />
          </label>
        </div>

        <label className="calculator-notes">
          <span>Адрес объекта</span>
          <textarea
            rows={2}
            value={serviceAddress}
            onChange={(event) => setServiceAddress(event.target.value)}
            disabled={saving}
          />
        </label>

        <h3 className="surface-title">Услуга и расчет</h3>
        <div className="proposal-item-grid">
          <label className="calculator-field">
            <span>Услуга</span>
            <select
              value={serviceTypeId}
              onChange={(event) => {
                const nextServiceTypeId = event.target.value;
                const nextServiceType = findServiceType(serviceTypes, nextServiceTypeId);
                setServiceTypeId(nextServiceTypeId);
                setClientUnitPrice(nextServiceType ? String(nextServiceType.base_price) : "");
                setInstallationCost(
                  showInternalEconomics && nextServiceType
                    ? String(nextServiceType.installation_cost_per_sqft)
                    : "",
                );
                setFilmId(getDefaultFilmId(nextServiceType, films));
              }}
              disabled={saving}
            >
              {serviceTypes.map((serviceType) => (
                <option key={serviceType.service_type_id} value={serviceType.service_type_id}>
                  {serviceType.name_ru}
                </option>
              ))}
            </select>
          </label>

          <label className="calculator-field">
            <span>Материал</span>
            <select value={filmId} onChange={(event) => setFilmId(event.target.value)} disabled={saving}>
              {availableFilms.map((film) => (
                <option key={film.film_id} value={film.film_id}>
                  {film.brand_name_ru} / {film.model_name_ru}
                </option>
              ))}
            </select>
          </label>

          <label className="calculator-field">
            <span>Расход для клиента, sqft</span>
            <input value={billableSqft} onChange={(event) => setBillableSqft(event.target.value)} disabled={saving} />
          </label>

          <label className="calculator-field">
            <span>Фактический расход, sqft</span>
            <input value={actualFilmSqft} onChange={(event) => setActualFilmSqft(event.target.value)} disabled={saving} />
          </label>

          <label className="calculator-field">
            <span>Цена для клиента / sqft</span>
            <input value={clientUnitPrice} onChange={(event) => setClientUnitPrice(event.target.value)} disabled={saving} />
          </label>

          {showInternalEconomics ? (
            <label className="calculator-field">
              <span>Цена монтажа / sqft</span>
              <input value={installationCost} onChange={(event) => setInstallationCost(event.target.value)} disabled={saving} />
            </label>
          ) : null}

          <label className="calculator-field">
            <span>Исполнитель</span>
            <select value={installerId} onChange={(event) => setInstallerId(event.target.value)} disabled={saving}>
              <option value="">Без исполнителя</option>
              {installers.map((installer) => (
                <option key={installer.user_id} value={installer.user_id}>
                  {installer.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="calculator-field">
            <span>Доп. расход проекта</span>
            <input value={otherExpenses} onChange={(event) => setOtherExpenses(event.target.value)} disabled={saving} />
          </label>
        </div>

        <label className="calculator-notes">
          <span>Заметки по проекту</span>
          <textarea rows={3} value={projectNotes} onChange={(event) => setProjectNotes(event.target.value)} disabled={saving} />
        </label>

        <label className="calculator-notes">
          <span>Заметки по позиции</span>
          <textarea rows={3} value={positionNotes} onChange={(event) => setPositionNotes(event.target.value)} disabled={saving} />
        </label>
      </div>

      <div className="surface">
        <div className="page-kicker">Итог проекта</div>
        <h3 className="surface-title">
          {showInternalEconomics ? "Внутренняя экономика" : "Данные для клиента"}
        </h3>

        <div className="project-finance-grid">
          <div className="calculator-metric-card">
            <span>Выручка</span>
            <strong>{formatMoney(revenue)}</strong>
          </div>
          {showInternalEconomics ? (
            <>
              <div className="calculator-metric-card">
                <span>Материал</span>
                <strong>{formatMoney(materialCostValue)}</strong>
              </div>
              <div className="calculator-metric-card">
                <span>Монтаж</span>
                <strong>{formatMoney(installationCostTotal)}</strong>
              </div>
            </>
          ) : null}
          <div className="calculator-metric-card">
            <span>Прочие</span>
            <strong>{formatMoney(otherExpensesValue)}</strong>
          </div>
          {showInternalEconomics ? (
            <>
              <div className="calculator-metric-card">
                <span>Прибыль</span>
                <strong>{formatMoney(estimatedProfit)}</strong>
              </div>
              <div className="calculator-metric-card">
                <span>Маржа</span>
                <strong>{estimatedMargin.toFixed(1)}%</strong>
              </div>
            </>
          ) : null}
        </div>

        <div className="inspector-list" style={{ marginTop: 16 }}>
          <div className="inspector-item">
            <div className="row-title">Материал и услуга</div>
            <div className="row-meta">
              {selectedServiceType?.name_ru ?? "Не выбрано"}
              {selectedFilm ? ` • ${selectedFilm.brand_name_ru} / ${selectedFilm.model_name_ru}` : ""}
            </div>
          </div>
          <div className="inspector-item">
            <div className="row-title">Клиентский объем / факт</div>
            <div className="row-meta">
              {billableSqftValue.toFixed(2)} sqft • факт {actualFilmSqftValue.toFixed(2)} sqft
            </div>
          </div>
          <div className="inspector-item">
            <div className="row-title">Исполнитель</div>
            <div className="row-meta">{selectedInstaller?.full_name ?? "Пока не выбран"}</div>
          </div>
          <div className="inspector-item">
            <div className="row-title">Город / адрес</div>
            <div className="row-meta">
              {selectedCity?.name_ru ?? "Без города"}
              {serviceAddress.trim() ? ` • ${serviceAddress.trim()}` : ""}
            </div>
          </div>
          {showInternalEconomics ? (
            <div className="inspector-item">
              <div className="row-title">Справочные ставки</div>
              <div className="row-meta">
                base {formatMoney(selectedServiceType?.base_price ?? 0)} • material {formatMoney(
                  selectedServiceType?.material_cost_per_sqft ?? 0,
                )} / sqft
              </div>
            </div>
          ) : null}
          <div className="inspector-item">
            <div className="row-title">Статус</div>
            <div className="row-meta">{message}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <button type="submit" className="accent-button" disabled={saving}>
            {saving ? "Создание..." : "Создать проект"}
          </button>
          <button type="button" className="soft-button" onClick={resetForm} disabled={saving}>
            Очистить
          </button>
          <button type="button" className="soft-button" onClick={() => router.push("/manager/projects")} disabled={saving}>
            К проектам
          </button>
        </div>
      </div>
    </form>
  );
}
