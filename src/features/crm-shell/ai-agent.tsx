"use client";

import { useState } from "react";

import { WorkingFrame } from "@/features/crm-shell/working-frame";

/**
 * Owner, 2026-11-27: «из CRM удалили нашего ИИ, который должен быть у всех».
 * The agent (chat, voice, pulse) lives in the working CRM. On a screen of the
 * new interface the mascot opens that same agent in a side panel; a working
 * section shown inside the frame already has its own button.
 */
export function CrmAiAgent({ hidden }: { hidden: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (hidden && !open) return null;
  return (
    <>
      {!open ? (
        <button
          type="button"
          data-crm-ai-launcher
          aria-label="Агент Rolan PRO"
          onClick={() => { setOpen(true); setLoaded(true); }}
          className="fixed right-4 bottom-20 z-40 size-14 overflow-hidden rounded-full border-2 border-emerald-500 bg-white shadow-2xl transition-transform hover:scale-105 lg:bottom-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/rolan-mascot.webp" alt="" className="size-full object-cover" />
        </button>
      ) : null}
      {loaded ? (
        <div data-crm-ai-panel className={open ? "fixed inset-y-0 right-0 z-50 flex w-full max-w-[26rem] flex-col border-l bg-white shadow-2xl" : "hidden"}>
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
            <span className="font-semibold">Агент Rolan PRO</span>
            <button type="button" aria-label="Закрыть агента" className="text-2xl leading-none opacity-70 hover:opacity-100" onClick={() => setOpen(false)}>×</button>
          </div>
          <WorkingFrame src="/legacy-crm#/ai" title="Агент Rolan PRO" className="flex-1" />
        </div>
      ) : null}
    </>
  );
}
