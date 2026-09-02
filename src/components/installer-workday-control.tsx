"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type JobOption = {
  installer_job_id: string;
  project: { project_code: string | null; title: string; address: string | null };
  position: { title: string | null; service_type: { name_ru: string } } | null;
};

type ActiveSession = {
  started_at: Date | string;
  tracking_enabled: boolean;
  last_location_at: Date | string | null;
  installer_job: JobOption | null;
};

async function request(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { data?: unknown; errors?: Array<{ message?: string }> } | null;
  if (!response.ok) throw new Error(payload?.errors?.[0]?.message ?? "Не удалось сохранить данные.");
  return payload?.data;
}

export function InstallerWorkdayControl({ activeSession, jobs }: { activeSession: ActiveSession | null; jobs: JobOption[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(activeSession ? "Смена активна." : "Начните смену перед выездом или работой.");
  const [jobId, setJobId] = useState(jobs[0]?.installer_job_id ?? "");
  const [startOdometer, setStartOdometer] = useState("");
  const [tracking, setTracking] = useState(true);
  const [endOdometer, setEndOdometer] = useState("");
  const [miles, setMiles] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!activeSession?.tracking_enabled || !navigator.geolocation) return;

    let lastSentAt = 0;
    const watcher = navigator.geolocation.watchPosition(
      async (position) => {
        if (Date.now() - lastSentAt < 45_000) return;
        lastSentAt = Date.now();
        try {
          await request("/api/v1/installer-work-sessions/location", {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_meters: position.coords.accuracy,
            captured_at: new Date(position.timestamp).toISOString(),
          });
          setMessage("Геолокация передаётся только во время активной смены.");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Не удалось передать геолокацию.");
        }
      },
      () => setMessage("Разрешите геолокацию для рабочего отслеживания или завершите смену без неё."),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, [activeSession?.tracking_enabled]);

  async function start() {
    setSaving(true);
    try {
      await request("/api/v1/installer-work-sessions", {
        action: "start",
        installer_job_id: jobId || null,
        start_odometer_miles: startOdometer ? Number(startOdometer) : null,
        tracking_enabled: tracking,
      });
      setMessage("Смена начата.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось начать смену.");
    } finally {
      setSaving(false);
    }
  }

  async function stop() {
    setSaving(true);
    try {
      await request("/api/v1/installer-work-sessions", {
        action: "stop",
        end_odometer_miles: endOdometer ? Number(endOdometer) : null,
        miles_driven: miles ? Number(miles) : null,
        notes,
      });
      setMessage("Смена завершена и добавлена в историю.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось завершить смену.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface installer-workday-control">
      <h2 className="surface-title">{activeSession ? "Смена идёт" : "Начать рабочий день"}</h2>
      {activeSession ? (
        <>
          <div className="installer-current-job">
            <strong>{activeSession.installer_job?.position?.title ?? activeSession.installer_job?.project.title ?? "Общая смена"}</strong>
            <span>{activeSession.installer_job?.project.address ?? "Без привязки к объекту"}</span>
            <span>Начало: {new Date(activeSession.started_at).toLocaleString("ru-RU")}</span>
          </div>
          <div className="installer-form-grid">
            <label><span>Одометр в конце, miles</span><input inputMode="decimal" value={endOdometer} onChange={(event) => setEndOdometer(event.target.value)} /></label>
            <label><span>Пробег вручную, если без одометра</span><input inputMode="decimal" value={miles} onChange={(event) => setMiles(event.target.value)} /></label>
            <label className="installer-notes-field"><span>Что сделано / проблема</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          </div>
          <button className="accent-button" type="button" disabled={saving} onClick={stop}>Завершить смену</button>
        </>
      ) : (
        <>
          <div className="installer-form-grid">
            <label className="installer-notes-field"><span>Монтаж на сегодня</span><select value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">Общая смена</option>{jobs.map((job) => <option key={job.installer_job_id} value={job.installer_job_id}>{job.project.project_code ?? "Проект"} — {job.position?.title ?? job.project.title}</option>)}</select></label>
            <label><span>Одометр в начале, miles</span><input inputMode="decimal" value={startOdometer} onChange={(event) => setStartOdometer(event.target.value)} /></label>
          </div>
          <label className="installer-tracking-consent"><input type="checkbox" checked={tracking} onChange={(event) => setTracking(event.target.checked)} /><span><strong>Рабочая геолокация</strong> — передавать местоположение только пока смена активна и приложение открыто.</span></label>
          <button className="accent-button" type="button" disabled={saving} onClick={start}>Начать смену</button>
        </>
      )}
      <div className="row-meta installer-control-message">{message}</div>
    </section>
  );
}
