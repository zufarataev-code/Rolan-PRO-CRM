"use client";

import { useCallback, useEffect, useRef, useState, type Ref } from "react";

import { cn } from "@/lib/utils";

type WorkingWindow = Window & {
  cloudHasPendingChanges?: () => boolean;
  cloudPersistConfirmed?: () => Promise<boolean>;
  parseHash?: () => void;
  render?: () => void;
};

function workingWindow(frame: HTMLIFrameElement | null): WorkingWindow | null {
  try {
    return (frame?.contentWindow as WorkingWindow | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * The working CRM saves an edit a moment after it is made. Before its frame is
 * closed, anything still waiting is sent and confirmed by the server, so
 * closing right after an action never loses it.
 */
export async function saveWorkingFrame(frame: HTMLIFrameElement | null) {
  const win = workingWindow(frame);
  try {
    if (win?.cloudHasPendingChanges?.() && win.cloudPersistConfirmed) return await win.cloudPersistConfirmed();
  } catch {
    return false;
  }
  return true;
}

/**
 * A screen of the working CRM shown inside the new frame. The working CRM
 * hides its own menu and phone dock there (src/features/legacy-crm/embed-frame.ts),
 * so the person sees one menu and the same data and actions as always.
 */
export function WorkingFrame({ src, title, className, ref, onLoad }: { src: string; title: string; className?: string; ref?: Ref<HTMLIFrameElement>; onLoad?: () => void }) {
  return <iframe ref={ref} src={src} title={title} onLoad={onLoad} className={cn("bg-background block size-full border-0", className)} />;
}

/**
 * ONE working CRM lives in the frame for the whole visit. It shows the
 * sections not redrawn yet (shown or hidden as the person moves around, never
 * torn down — a section opens at once and an edit made a second before
 * leaving it is still saved). And it is there even while only the new screens
 * are on display: the working CRM's background duties — projects created
 * automatically from advertising leads, follow-ups of closed projects, live
 * updates — run because the CRM is open, and must keep running here.
 */
export function WorkingSections({ src, title, visible }: { src: string | null; title: string; visible: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [first, setFirst] = useState<string | null>(src);
  const wanted = useRef<string | null>(null);
  if (src && !first) setFirst(src);
  if (src) wanted.current = src;

  // On a new screen the working CRM starts a moment later, so it never delays the screen itself.
  useEffect(() => {
    if (first) return;
    const timer = window.setTimeout(() => setFirst((current) => current ?? "/legacy-crm"), 2500);
    return () => window.clearTimeout(timer);
  }, [first]);

  // Same page, another section: only the address after # changes, nothing reloads.
  const show = useCallback(() => {
    const win = workingWindow(frame.current);
    const target = wanted.current;
    if (!win || !target) return;
    try {
      // Until the working CRM has loaded there is nothing to steer; onLoad calls this again.
      if (typeof win.parseHash !== "function") return;
      const hash = target.slice(target.indexOf("#"));
      if (win.location.hash === hash) {
        win.parseHash();
        win.render?.();
      } else win.location.hash = hash;
    } catch {
      /* the frame is between two pages (sign-in, reload); its next load calls this again */
    }
  }, []);

  useEffect(() => {
    if (src && visible) show();
  }, [src, visible, show]);

  if (!first) return null;
  return (
    <div className={cn("fixed inset-x-0 top-14 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 lg:top-0 lg:bottom-0 lg:left-64", !visible && "hidden")}>
      <WorkingFrame ref={frame} src={first} title={title} onLoad={show} />
    </div>
  );
}
