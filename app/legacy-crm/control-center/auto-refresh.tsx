"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-runs the server checks every minute while the page is open. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}
