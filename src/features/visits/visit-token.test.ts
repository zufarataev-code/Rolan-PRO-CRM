import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { visitCrewFromPayload } from "../proposals/client-visit-core";
import { orderIdFromVisitToken, visitToken } from "./visit-token";

// Owner, 2026-11-27: the client's link shows who is coming and lets them move the time.
test("a visit link opens only its own project", () => {
  const token = visitToken("o9km8hag4");
  assert.equal(orderIdFromVisitToken(token), "o9km8hag4");
  assert.equal(orderIdFromVisitToken(token.replace("o9km8hag4", "otherproj")), null);
  assert.equal(orderIdFromVisitToken("o9km8hag4"), null);
  assert.equal(orderIdFromVisitToken(`${token}x`), null);
});

test("the client sees the surveyor for a measurement and the crew for an installation, first names only", () => {
  const payload = {
    users: [
      { id: "m", name: "Zufar Ataev", role: "measurer", photo: "data:image/png;base64,AAA" },
      { id: "i1", name: "Ринат", role: "installer", photo: "/api/v1/files/view?key=x" },
      { id: "i2", name: "Нурик", role: "installer", active: false },
    ],
    orders: [{ id: "o", measurerId: "m", installerIds: ["i1", "i2", "i1"] }],
  };
  assert.deepEqual(visitCrewFromPayload(payload, "o", "measure"), [{ name: "Zufar", role: "Замерщик", photo: "data:image/png;base64,AAA" }]);
  assert.deepEqual(visitCrewFromPayload(payload, "o", "install"), [{ name: "Ринат", role: "Специалист по установке", photo: null }]);
});

test("the notice carries the link; the page and its API need no staff sign-in", () => {
  const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
  assert.match(html, /const link = await clientVisitLink\(orderId\);/);
  assert.match(html, /Кто к вам приедет и перенос времени: \$\{link\}/);
  assert.match(html, /Details \/ reschedule: \$\{link\}/);
  const rbac = readFileSync("src/lib/auth/rbac.ts", "utf8");
  assert.doesNotMatch(rbac, /prefix: "\/visit"/);
  assert.match(readFileSync("app/visit/[token]/page.tsx", "utf8"), /apiPath=\{`\/api\/public\/visits\//);
});
