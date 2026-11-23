import { useSyncExternalStore } from "react";

import { todayKey } from "@/features/crm-shell/calendar";

const neverChanges = () => () => {};

/**
 * Today's "YYYY-MM-DD" on the viewer's own device, and "" while the page is drawn
 * on the server. The server keeps its own clock (UTC), so in Los Angeles from 4 PM
 * its "today" is already tomorrow; a screen that waits for this value draws the
 * same page on the server and in the browser.
 */
export function useViewerToday(now: () => Date = () => new Date()) {
  return useSyncExternalStore(neverChanges, () => todayKey(now()), () => "");
}
