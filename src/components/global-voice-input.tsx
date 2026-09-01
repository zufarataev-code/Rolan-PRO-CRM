"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void) | null;
};

export function GlobalVoiceInput() {
  const target = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hidden = ["/login", "/proposal/", "/privacy-policy", "/terms", "/sms-consent"].some((path) => window.location.pathname.startsWith(path));
    setVisible(!hidden);
    const remember = (event: FocusEvent) => {
      const element = event.target;
      if (element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && ["text", "search", "tel", "email", "url"].includes(element.type))) {
        target.current = element;
      }
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);

  if (!visible) return null;

  const start = () => {
    if (listening && recognition.current) return recognition.current.stop();
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return window.alert("Голосовой ввод поддерживается в Chrome, Edge и Safari на телефоне.");
    if (!target.current) return window.alert("Сначала нажмите на нужное текстовое поле, затем на микрофон.");

    const instance = new Recognition();
    recognition.current = instance;
    instance.lang = document.documentElement.lang === "en" ? "en-US" : "ru-RU";
    instance.continuous = false;
    instance.interimResults = false;
    instance.onstart = () => setListening(true);
    instance.onend = () => { setListening(false); recognition.current = null; };
    instance.onerror = (event) => {
      if (!["aborted", "no-speech"].includes(event.error)) window.alert("Не удалось распознать речь. Проверьте доступ к микрофону.");
    };
    instance.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
      const element = target.current;
      if (!element || !text) return;
      const startAt = element.selectionStart ?? element.value.length;
      const endAt = element.selectionEnd ?? startAt;
      const prefix = startAt > 0 && !/\s$/.test(element.value.slice(0, startAt)) ? " " : "";
      const value = element.value.slice(0, startAt) + prefix + text + element.value.slice(endAt);
      const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.focus();
    };
    instance.start();
  };

  return (
    <button
      type="button"
      aria-pressed={listening}
      onClick={start}
      title="Надиктовать в выбранное поле"
      style={{ position: "fixed", right: 18, bottom: 74, zIndex: 1001, minHeight: 44, padding: "0 14px", border: `1px solid ${listening ? "#dc2626" : "#bfdbfe"}`, borderRadius: 6, background: listening ? "#dc2626" : "#fff", color: listening ? "#fff" : "#1d4ed8", boxShadow: "0 12px 30px rgba(15,23,42,.18)", fontWeight: 800 }}
    >
      {listening ? "⏹ Остановить" : "🎙 Голосовой ввод"}
    </button>
  );
}
