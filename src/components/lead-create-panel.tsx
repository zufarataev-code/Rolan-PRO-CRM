"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LeadCreatePanelProps = {
  cities: Array<{
    city_id: string;
    name_ru: string;
    name_en: string;
  }>;
};

type LeadCreatePayload = {
  lead_id?: string;
};

type ApiEnvelope<TPayload> = {
  data?: TPayload;
  errors?: Array<{
    message?: string;
  }>;
};

export function LeadCreatePanel({ cities }: LeadCreatePanelProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("website");
  const [cityId, setCityId] = useState("");
  const [notes, setNotes] = useState("");
  const [savingMode, setSavingMode] = useState<"lead" | null>(null);
  const [message, setMessage] = useState("Создайте лид из входящего запроса, звонка или сайта.");
  const saving = savingMode !== null;

  function resetForm() {
    setName("");
    setPhone("");
    setEmail("");
    setSource("website");
    setCityId("");
    setNotes("");
  }

  async function createLead() {
    const response = await fetch("/api/v1/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        source: source.trim() || null,
        city_id: cityId || null,
        notes: notes.trim() || null,
      }),
    });

    const payload = (await response.json().catch(() => null)) as ApiEnvelope<LeadCreatePayload> | null;

    if (!response.ok || !payload?.data?.lead_id) {
      throw new Error(payload?.errors?.[0]?.message ?? "Не удалось создать лид.");
    }

    return payload.data.lead_id;
  }

  function openProjectForm() {
    const params = new URLSearchParams();

    if (name.trim()) {
      params.set("client_name", name.trim());
      params.set("project_title", name.trim());
    }

    if (phone.trim()) {
      params.set("phone", phone.trim());
    }

    if (email.trim()) {
      params.set("email", email.trim());
    }

    if (cityId) {
      params.set("city_id", cityId);
    }

    if (notes.trim()) {
      params.set("project_notes", notes.trim());
    }

    router.push(`/manager/projects/new${params.toString() ? `?${params.toString()}` : ""}`);
  }

  async function submit() {
    if (saving) {
      return;
    }

    if (!name.trim()) {
      setMessage("Укажите имя лида или название компании.");
      return;
    }

    setSavingMode("lead");
    setMessage("Создаю лид...");

    try {
      await createLead();
      resetForm();
      setMessage("Лид создан. Таблица обновлена.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать лид.");
    } finally {
      setSavingMode(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit();
  }

  return (
    <section id="new-lead" className="surface">
      <div className="detail-hero">
        <div>
          <h2 className="surface-title">Новый лид</h2>
          <p className="surface-subtitle">
            Создайте лид из заявки с сайта, входящего звонка или ручного обращения менеджера.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="split-grid">
        <div className="surface">
          <div className="proposal-item-grid">
            <label className="calculator-field">
              <span>Имя / Компания</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например, Glendale Medical"
                disabled={saving}
              />
            </label>

            <label className="calculator-field">
              <span>Телефон</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+1 (555) 000-0000"
                disabled={saving}
              />
            </label>

            <label className="calculator-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="client@example.com"
                disabled={saving}
              />
            </label>

            <label className="calculator-field">
              <span>Источник</span>
              <select value={source} onChange={(event) => setSource(event.target.value)} disabled={saving}>
                <option value="website">Website</option>
                <option value="phone">Phone</option>
                <option value="referral">Referral</option>
                <option value="instagram">Instagram</option>
                <option value="manual">Manual</option>
              </select>
            </label>

            <label className="calculator-field">
              <span>Город</span>
              <select value={cityId} onChange={(event) => setCityId(event.target.value)} disabled={saving}>
                <option value="">Без города</option>
                {cities.map((city) => (
                  <option key={city.city_id} value={city.city_id}>
                    {city.name_ru || city.name_en}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="calculator-notes">
            <span>Заметки менеджера</span>
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Что уже известно по клиенту, объекту, срокам и типу пленки."
              disabled={saving}
            />
          </label>
        </div>

        <div className="surface">
          <div className="inspector-list">
            <div className="inspector-item">
              <div className="row-title">Что произойдет после сохранения</div>
              <div className="row-meta">Лид будет создан в NEW_LEAD и сразу появится в таблице лидов.</div>
            </div>
            <div className="inspector-item">
              <div className="row-title">Контекст</div>
              <div className="row-meta">Дальше менеджер сможет перевести лид в сделку и назначить консультацию.</div>
            </div>
            <div className="inspector-item">
              <div className="row-title">Быстрый старт проекта</div>
              <div className="row-meta">
                Кнопка "Создать проект" откроет простое окно проекта с клиентом, услугой, материалом и live P&amp;L.
              </div>
            </div>
            <div className="inspector-item">
              <div className="row-title">Статус</div>
              <div className="row-meta">{message}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <button type="submit" className="soft-button" disabled={saving}>
              {savingMode === "lead" ? "Создание..." : "Создать лид"}
            </button>
            <button type="button" className="accent-button" onClick={openProjectForm} disabled={saving}>
              Создать проект
            </button>
            <button
              type="button"
              className="soft-button"
              onClick={() => {
                resetForm();
                setMessage("Форма очищена.");
              }}
              disabled={saving}
            >
              Очистить
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
