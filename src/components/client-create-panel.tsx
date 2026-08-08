"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ClientCreatePanelProps = {
  cities: Array<{
    city_id: string;
    name_ru: string;
    name_en: string;
  }>;
};

type ApiEnvelope = {
  data?: {
    client_id?: string;
  };
  errors?: Array<{
    message?: string;
  }>;
};

export function ClientCreatePanel({ cities }: ClientCreatePanelProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [cityId, setCityId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Создайте клиента и дальше сразу запускайте сделку из manager flow.");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setMessage("Укажите имя клиента или компанию.");
      return;
    }

    setSaving(true);
    setMessage("Создаю клиента...");

    try {
      const response = await fetch("/api/v1/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          service_address: serviceAddress.trim() || null,
          billing_address: billingAddress.trim() || null,
          zip_code: zipCode.trim() || null,
          city_id: cityId || null,
          notes: notes.trim() || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;

      if (!response.ok || !payload?.data?.client_id) {
        throw new Error(payload?.errors?.[0]?.message ?? "Не удалось создать клиента.");
      }

      setName("");
      setPhone("");
      setEmail("");
      setServiceAddress("");
      setBillingAddress("");
      setZipCode("");
      setCityId("");
      setNotes("");
      setMessage("Клиент создан. Таблица обновлена.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать клиента.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="new-client" className="surface">
      <div className="detail-hero">
        <div>
          <h2 className="surface-title">Новый клиент</h2>
          <p className="surface-subtitle">
            Клиентская карточка нужна, чтобы дальше связать сделку, proposal, deposit и project в одной цепочке.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="split-grid">
        <div className="surface">
          <div className="proposal-item-grid">
            <label className="calculator-field">
              <span>Имя / Компания</span>
              <input value={name} onChange={(event) => setName(event.target.value)} disabled={saving} />
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
              <select value={cityId} onChange={(event) => setCityId(event.target.value)} disabled={saving}>
                <option value="">Без города</option>
                {cities.map((city) => (
                  <option key={city.city_id} value={city.city_id}>
                    {city.name_ru || city.name_en}
                  </option>
                ))}
              </select>
            </label>

            <label className="calculator-field">
              <span>ZIP</span>
              <input value={zipCode} onChange={(event) => setZipCode(event.target.value)} disabled={saving} />
            </label>
          </div>

          <label className="calculator-notes">
            <span>Service address</span>
            <textarea
              rows={3}
              value={serviceAddress}
              onChange={(event) => setServiceAddress(event.target.value)}
              disabled={saving}
            />
          </label>

          <label className="calculator-notes">
            <span>Billing address</span>
            <textarea
              rows={3}
              value={billingAddress}
              onChange={(event) => setBillingAddress(event.target.value)}
              disabled={saving}
            />
          </label>

          <label className="calculator-notes">
            <span>Notes</span>
            <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={saving} />
          </label>
        </div>

        <div className="surface">
          <div className="inspector-list">
            <div className="inspector-item">
              <div className="row-title">Что произойдет</div>
              <div className="row-meta">После создания клиента его можно сразу использовать для новой сделки.</div>
            </div>
            <div className="inspector-item">
              <div className="row-title">Статус</div>
              <div className="row-meta">{message}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button type="submit" className="accent-button" disabled={saving}>
              {saving ? "Создание..." : "Создать клиента"}
            </button>
            <button
              type="button"
              className="soft-button"
              disabled={saving}
              onClick={() => {
                setName("");
                setPhone("");
                setEmail("");
                setServiceAddress("");
                setBillingAddress("");
                setZipCode("");
                setCityId("");
                setNotes("");
                setMessage("Форма очищена.");
              }}
            >
              Очистить
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
