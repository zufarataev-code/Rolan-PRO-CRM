import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { useViewerToday } from "@/features/crm-shell/use-viewer-today";

function Probe() {
  return createElement("b", null, `[${useViewerToday(() => new Date(2026, 10, 22, 16, 47))}]`);
}

test("the server draws no date: today comes only from the viewer's device", () => {
  assert.equal(renderToStaticMarkup(createElement(Probe)), "<b>[]</b>");
});
