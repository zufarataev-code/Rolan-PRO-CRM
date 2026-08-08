"use client";

import { useMemo, useState } from "react";

type ServiceTypeRow = {
  service_type_id: string;
  service_code: string;
  name_ru: string;
  unit_type: string;
  base_price: number | string;
  min_price: number | string;
  block_revenue_price: number | string;
  material_cost_per_sqft?: number | string;
  installation_cost_per_sqft?: number | string;
  block_cost_price?: number | string;
  is_active: boolean;
  sort_order: number | string;
};

type ServiceAddonRow = {
  service_addon_id: string;
  service_type_id: string;
  addon_code: string;
  name_ru: string;
  unit_type: string;
  default_price: number | string;
  min_price: number | string;
  cost_price?: number | string;
  is_active: boolean;
  sort_order: number | string;
};

type FilmRow = {
  film_id: string;
  category_name_ru: string;
  brand_name_ru: string;
  model_name_ru: string;
  thickness: string | null;
  unit: string;
  is_active: boolean;
  sort_order: number | string;
};

type ComplexityRow = {
  complexity_level_id: string;
  level_code: string;
  name_ru: string;
  numeric_rank: number | string;
  multiplier: number | string;
  is_active: boolean;
  sort_order: number | string;
};

type CityRow = {
  city_id: string;
  city_code: string;
  name_ru: string;
  state_code: string | null;
  default_zip_code: string | null;
  is_active: boolean;
  sort_order: number | string;
};

type CompanyOverheadRow = {
  key: string;
  label_ru: string;
  description_ru: string;
  monthly_amount: number | string;
};

type OwnerSettingsEditorProps = {
  serviceTypes: ServiceTypeRow[];
  serviceAddons: ServiceAddonRow[];
  filmCatalog: FilmRow[];
  complexityLevels: ComplexityRow[];
  cities: CityRow[];
  companyOverhead: CompanyOverheadRow[];
};

type SaveState = {
  kind: "idle" | "saving" | "success" | "error";
  message: string | null;
};

function sectionSaveKey(entity: string, id: string) {
  return `${entity}:${id}`;
}

async function patchReference(entity: string, id: string, patch: Record<string, unknown>) {
  const response = await fetch("/api/v1/settings/reference", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      entity,
      id,
      patch,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        errors?: Array<{
          message?: string;
        }>;
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message ?? "Не удалось сохранить изменения.");
  }
}

async function patchCompanyOverhead(patch: Record<string, unknown>) {
  const response = await fetch("/api/v1/settings/company-overhead", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      patch,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        errors?: Array<{
          message?: string;
        }>;
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message ?? "Не удалось сохранить overhead.");
  }
}

export function OwnerSettingsEditor({
  serviceTypes: initialServiceTypes,
  serviceAddons: initialServiceAddons,
  filmCatalog: initialFilmCatalog,
  complexityLevels: initialComplexityLevels,
  cities: initialCities,
  companyOverhead: initialCompanyOverhead,
}: OwnerSettingsEditorProps) {
  const [serviceTypes, setServiceTypes] = useState(initialServiceTypes);
  const [serviceAddons, setServiceAddons] = useState(initialServiceAddons);
  const [filmCatalog, setFilmCatalog] = useState(initialFilmCatalog);
  const [complexityLevels, setComplexityLevels] = useState(initialComplexityLevels);
  const [cities, setCities] = useState(initialCities);
  const [companyOverhead, setCompanyOverhead] = useState(initialCompanyOverhead);
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});

  const serviceTypeNameById = useMemo(
    () => Object.fromEntries(serviceTypes.map((item) => [item.service_type_id, `${item.name_ru} (${item.service_code})`])),
    [serviceTypes],
  );

  async function saveRow(entity: string, id: string, patch: Record<string, unknown>) {
    const key = sectionSaveKey(entity, id);
    setSaveState((current) => ({
      ...current,
      [key]: { kind: "saving", message: "Сохраняем..." },
    }));

    try {
      await patchReference(entity, id, patch);
      setSaveState((current) => ({
        ...current,
        [key]: { kind: "success", message: "Сохранено" },
      }));
    } catch (error) {
      setSaveState((current) => ({
        ...current,
        [key]: {
          kind: "error",
          message: error instanceof Error ? error.message : "Ошибка сохранения",
        },
      }));
    }
  }

  async function saveCompanyOverhead() {
    const key = sectionSaveKey("company_overhead", "global");
    setSaveState((current) => ({
      ...current,
      [key]: { kind: "saving", message: "Сохраняем..." },
    }));

    try {
      await patchCompanyOverhead(Object.fromEntries(companyOverhead.map((item) => [item.key, item.monthly_amount])));
      setSaveState((current) => ({
        ...current,
        [key]: { kind: "success", message: "Overhead сохранен" },
      }));
    } catch (error) {
      setSaveState((current) => ({
        ...current,
        [key]: {
          kind: "error",
          message: error instanceof Error ? error.message : "Ошибка сохранения",
        },
      }));
    }
  }

  const companyOverheadMonthlyTotal = useMemo(
    () => companyOverhead.reduce((sum, row) => sum + Number(row.monthly_amount || 0), 0),
    [companyOverhead],
  );

  return (
    <div className="workspace">
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2 className="surface-title">Company Overhead</h2>
            <p className="surface-subtitle">
              Общие постоянные расходы компании. Этот блок используется для расчета Net PnL на owner-странице услуг.
            </p>
          </div>
          <div className="surface-actions">
            <span className="chip chip-accent">Monthly total {companyOverheadMonthlyTotal.toFixed(0)} USD</span>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Категория</th>
              <th>Описание</th>
              <th>Monthly USD</th>
            </tr>
          </thead>
          <tbody>
            {companyOverhead.map((row) => (
              <tr key={row.key}>
                <td>
                  <div className="row-title">{row.label_ru}</div>
                  <div className="row-meta mono">{row.key}</div>
                </td>
                <td className="row-meta">{row.description_ru}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={String(row.monthly_amount)}
                    onChange={(event) =>
                      setCompanyOverhead((current) =>
                        current.map((item) =>
                          item.key === row.key ? { ...item, monthly_amount: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="surface-actions" style={{ marginTop: 18 }}>
          <button type="button" className="accent-button" onClick={saveCompanyOverhead}>
            Сохранить overhead
          </button>
          {saveState[sectionSaveKey("company_overhead", "global")]?.message ? (
            <div className="row-meta">{saveState[sectionSaveKey("company_overhead", "global")]?.message}</div>
          ) : null}
        </div>
      </section>

      <section className="surface">
        <h2 className="surface-title">Service Types / Pricing</h2>
        <p className="surface-subtitle">Главный owner-level справочник цен по услугам.</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Услуга</th>
              <th>Ед.</th>
              <th>Base</th>
              <th>Min</th>
              <th>Block Rev</th>
              <th>Material</th>
              <th>Install</th>
              <th>Block Cost</th>
              <th>Active</th>
              <th>Sort</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {serviceTypes.map((row) => {
              const key = sectionSaveKey("service_type", row.service_type_id);
              return (
                <tr key={row.service_type_id}>
                  <td>
                    <div className="row-title">{row.name_ru}</div>
                    <div className="row-meta mono">{row.service_code}</div>
                  </td>
                  <td>
                    <input
                      value={row.unit_type}
                      onChange={(event) =>
                        setServiceTypes((current) =>
                          current.map((item) =>
                            item.service_type_id === row.service_type_id ? { ...item, unit_type: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  {[
                    "base_price",
                    "min_price",
                    "block_revenue_price",
                    "material_cost_per_sqft",
                    "installation_cost_per_sqft",
                    "block_cost_price",
                  ].map((field) => (
                    <td key={field}>
                      <input
                        type="number"
                        step="0.01"
                        value={String((row as Record<string, unknown>)[field] ?? "")}
                        onChange={(event) =>
                          setServiceTypes((current) =>
                            current.map((item) =>
                              item.service_type_id === row.service_type_id
                                ? { ...item, [field]: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(event) =>
                        setServiceTypes((current) =>
                          current.map((item) =>
                            item.service_type_id === row.service_type_id ? { ...item, is_active: event.target.checked } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={String(row.sort_order)}
                      onChange={(event) =>
                        setServiceTypes((current) =>
                          current.map((item) =>
                            item.service_type_id === row.service_type_id ? { ...item, sort_order: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() =>
                        saveRow("service_type", row.service_type_id, {
                          unit_type: row.unit_type,
                          base_price: row.base_price,
                          min_price: row.min_price,
                          block_revenue_price: row.block_revenue_price,
                          material_cost_per_sqft: row.material_cost_per_sqft,
                          installation_cost_per_sqft: row.installation_cost_per_sqft,
                          block_cost_price: row.block_cost_price,
                          is_active: row.is_active,
                          sort_order: row.sort_order,
                        })
                      }
                    >
                      Сохранить
                    </button>
                    {saveState[key]?.message ? <div className="row-meta">{saveState[key]?.message}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="surface">
        <h2 className="surface-title">Addons</h2>
        <p className="surface-subtitle">Прайсы по допуслугам для calculator / proposal flow.</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Addon</th>
              <th>Service</th>
              <th>Unit</th>
              <th>Default</th>
              <th>Min</th>
              <th>Cost</th>
              <th>Active</th>
              <th>Sort</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {serviceAddons.map((row) => {
              const key = sectionSaveKey("service_addon", row.service_addon_id);
              return (
                <tr key={row.service_addon_id}>
                  <td>
                    <div className="row-title">{row.name_ru}</div>
                    <div className="row-meta mono">{row.addon_code}</div>
                  </td>
                  <td className="row-meta">{serviceTypeNameById[row.service_type_id] ?? row.service_type_id}</td>
                  <td>
                    <input
                      value={row.unit_type}
                      onChange={(event) =>
                        setServiceAddons((current) =>
                          current.map((item) =>
                            item.service_addon_id === row.service_addon_id ? { ...item, unit_type: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  {["default_price", "min_price", "cost_price"].map((field) => (
                    <td key={field}>
                      <input
                        type="number"
                        step="0.01"
                        value={String((row as Record<string, unknown>)[field] ?? "")}
                        onChange={(event) =>
                          setServiceAddons((current) =>
                            current.map((item) =>
                              item.service_addon_id === row.service_addon_id
                                ? { ...item, [field]: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(event) =>
                        setServiceAddons((current) =>
                          current.map((item) =>
                            item.service_addon_id === row.service_addon_id ? { ...item, is_active: event.target.checked } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={String(row.sort_order)}
                      onChange={(event) =>
                        setServiceAddons((current) =>
                          current.map((item) =>
                            item.service_addon_id === row.service_addon_id ? { ...item, sort_order: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() =>
                        saveRow("service_addon", row.service_addon_id, {
                          unit_type: row.unit_type,
                          default_price: row.default_price,
                          min_price: row.min_price,
                          cost_price: row.cost_price,
                          is_active: row.is_active,
                          sort_order: row.sort_order,
                        })
                      }
                    >
                      Сохранить
                    </button>
                    {saveState[key]?.message ? <div className="row-meta">{saveState[key]?.message}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="surface">
        <h2 className="surface-title">Film Catalog</h2>
        <p className="surface-subtitle">Категории, бренды, модели и активность каталога пленок.</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Категория</th>
              <th>Бренд</th>
              <th>Модель</th>
              <th>Толщина</th>
              <th>Unit</th>
              <th>Active</th>
              <th>Sort</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filmCatalog.map((row) => {
              const key = sectionSaveKey("film", row.film_id);
              return (
                <tr key={row.film_id}>
                  {["category_name_ru", "brand_name_ru", "model_name_ru", "thickness", "unit"].map((field) => (
                    <td key={field}>
                      <input
                        value={String((row as Record<string, unknown>)[field] ?? "")}
                        onChange={(event) =>
                          setFilmCatalog((current) =>
                            current.map((item) => (item.film_id === row.film_id ? { ...item, [field]: event.target.value } : item)),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(event) =>
                        setFilmCatalog((current) =>
                          current.map((item) => (item.film_id === row.film_id ? { ...item, is_active: event.target.checked } : item)),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={String(row.sort_order)}
                      onChange={(event) =>
                        setFilmCatalog((current) =>
                          current.map((item) => (item.film_id === row.film_id ? { ...item, sort_order: event.target.value } : item)),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() =>
                        saveRow("film", row.film_id, {
                          category_name_ru: row.category_name_ru,
                          brand_name_ru: row.brand_name_ru,
                          model_name_ru: row.model_name_ru,
                          thickness: row.thickness,
                          unit: row.unit,
                          is_active: row.is_active,
                          sort_order: row.sort_order,
                        })
                      }
                    >
                      Сохранить
                    </button>
                    {saveState[key]?.message ? <div className="row-meta">{saveState[key]?.message}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="surface">
        <h2 className="surface-title">Complexity Levels</h2>
        <p className="surface-subtitle">Operational multiplier слой. Здесь управляется policy, не sales calculator UI.</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Название</th>
              <th>Rank</th>
              <th>Multiplier</th>
              <th>Active</th>
              <th>Sort</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {complexityLevels.map((row) => {
              const key = sectionSaveKey("complexity_level", row.complexity_level_id);
              return (
                <tr key={row.complexity_level_id}>
                  <td className="row-meta mono">{row.level_code}</td>
                  <td>
                    <input
                      value={row.name_ru}
                      onChange={(event) =>
                        setComplexityLevels((current) =>
                          current.map((item) =>
                            item.complexity_level_id === row.complexity_level_id ? { ...item, name_ru: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={String(row.numeric_rank)}
                      onChange={(event) =>
                        setComplexityLevels((current) =>
                          current.map((item) =>
                            item.complexity_level_id === row.complexity_level_id
                              ? { ...item, numeric_rank: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={String(row.multiplier)}
                      onChange={(event) =>
                        setComplexityLevels((current) =>
                          current.map((item) =>
                            item.complexity_level_id === row.complexity_level_id
                              ? { ...item, multiplier: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(event) =>
                        setComplexityLevels((current) =>
                          current.map((item) =>
                            item.complexity_level_id === row.complexity_level_id
                              ? { ...item, is_active: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={String(row.sort_order)}
                      onChange={(event) =>
                        setComplexityLevels((current) =>
                          current.map((item) =>
                            item.complexity_level_id === row.complexity_level_id
                              ? { ...item, sort_order: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() =>
                        saveRow("complexity_level", row.complexity_level_id, {
                          name_ru: row.name_ru,
                          numeric_rank: row.numeric_rank,
                          multiplier: row.multiplier,
                          is_active: row.is_active,
                          sort_order: row.sort_order,
                        })
                      }
                    >
                      Сохранить
                    </button>
                    {saveState[key]?.message ? <div className="row-meta">{saveState[key]?.message}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="surface">
        <h2 className="surface-title">Cities / Service Areas</h2>
        <p className="surface-subtitle">Базовые service areas для лидов, клиентов и проектов.</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Город</th>
              <th>State</th>
              <th>ZIP</th>
              <th>Active</th>
              <th>Sort</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cities.map((row) => {
              const key = sectionSaveKey("city", row.city_id);
              return (
                <tr key={row.city_id}>
                  <td className="row-meta mono">{row.city_code}</td>
                  <td>
                    <input
                      value={row.name_ru}
                      onChange={(event) =>
                        setCities((current) =>
                          current.map((item) => (item.city_id === row.city_id ? { ...item, name_ru: event.target.value } : item)),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.state_code ?? ""}
                      onChange={(event) =>
                        setCities((current) =>
                          current.map((item) =>
                            item.city_id === row.city_id ? { ...item, state_code: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={row.default_zip_code ?? ""}
                      onChange={(event) =>
                        setCities((current) =>
                          current.map((item) =>
                            item.city_id === row.city_id ? { ...item, default_zip_code: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(event) =>
                        setCities((current) =>
                          current.map((item) => (item.city_id === row.city_id ? { ...item, is_active: event.target.checked } : item)),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={String(row.sort_order)}
                      onChange={(event) =>
                        setCities((current) =>
                          current.map((item) =>
                            item.city_id === row.city_id ? { ...item, sort_order: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="soft-button"
                      onClick={() =>
                        saveRow("city", row.city_id, {
                          name_ru: row.name_ru,
                          state_code: row.state_code,
                          default_zip_code: row.default_zip_code,
                          is_active: row.is_active,
                          sort_order: row.sort_order,
                        })
                      }
                    >
                      Сохранить
                    </button>
                    {saveState[key]?.message ? <div className="row-meta">{saveState[key]?.message}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
