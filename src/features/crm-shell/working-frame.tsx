"use client";

import { cn } from "@/lib/utils";

/**
 * A screen of the working CRM shown inside the new frame. The working CRM
 * hides its own menu and phone dock there (src/features/legacy-crm/embed-frame.ts),
 * so the person sees one menu and the same data and actions as always.
 */
export function WorkingFrame({ src, title, className }: { src: string; title: string; className?: string }) {
  return <iframe src={src} title={title} className={cn("bg-background block size-full border-0", className)} />;
}

/** A whole section: fills the frame between the menu, the top bar and the phone dock. */
export function WorkingSection({ src, title }: { src: string; title: string }) {
  return (
    <div className="fixed inset-x-0 top-14 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 lg:top-0 lg:bottom-0 lg:left-64">
      <WorkingFrame src={src} title={title} />
    </div>
  );
}
