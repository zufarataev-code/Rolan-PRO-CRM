import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

import { buildMobileCrmShell } from "./mobile-shell";

const ownerShell = buildMobileCrmShell({
  user: {
    user_id: "owner-1",
    email: "owner@example.com",
    full_name: "Owner",
  },
  roles: ["OWNER"],
});

test("mobile shell provides all primary phone destinations", () => {
  assert.match(ownerShell, /Сегодня/);
  assert.match(ownerShell, /Лиды/);
  assert.match(ownerShell, /Проекты/);
  assert.match(ownerShell, /Календарь/);
  assert.match(ownerShell, /Ещё/);
  assert.match(ownerShell, /Профиль и настройки/);
});

test("mobile shell reuses canonical authenticated APIs", () => {
  assert.match(ownerShell, /\/api\/v1\/leads/);
  assert.match(ownerShell, /\/api\/v1\/projects/);
  assert.match(ownerShell, /\/api\/v1\/consultations/);
  assert.match(ownerShell, /\/api\/v1\/auth\/logout/);
  assert.match(ownerShell, /\/api\/v1\/legacy-crm\/state/);
  assert.match(ownerShell, /\/api\/v1\/installer-jobs\/my/);
});

test("mobile shell enforces phone UX protections", () => {
  assert.match(ownerShell, /@media \(max-width: 820px\)/);
  assert.match(ownerShell, /env\(safe-area-inset-top\)/);
  assert.match(ownerShell, /env\(safe-area-inset-bottom\)/);
  assert.match(ownerShell, /min-height: 44px/);
  assert.match(ownerShell, /font: 500 16px/);
  assert.match(ownerShell, /overflow-x: hidden/);
  assert.match(ownerShell, /-webkit-overflow-scrolling: touch/);
  assert.match(ownerShell, /scroll-padding-bottom:/);
  assert.match(ownerShell, /scrollIntoView\(\{ block: 'center'/);
});

test("lead creation and editing stay limited to owner and manager roles", () => {
  assert.match(ownerShell, /const canSales = roles\.includes\('OWNER'\) \|\| roles\.includes\('MANAGER'\)/);
  assert.match(ownerShell, /\.\.\.\(canSales \? \[\{ key: 'leads'/);
  assert.match(ownerShell, /if \(canSales\)/);
  assert.match(ownerShell, /method: 'POST'/);
  assert.match(ownerShell, /method: 'PATCH'/);
});

test("mobile shell provides desktop handoff, settings, and logout", () => {
  assert.match(ownerShell, /\/legacy-crm\?desktop=1/);
  assert.match(ownerShell, /\/change-password/);
  assert.match(ownerShell, /\/api\/v1\/auth\/logout/);
  assert.match(ownerShell, /window\.location\.assign\('\/login'\)/);
});

test("field roles use scoped work sources instead of sales endpoints", () => {
  const installerShell = buildMobileCrmShell({
    user: {
      user_id: "installer-1",
      email: "installer@example.com",
      full_name: "Installer",
    },
    roles: ["INSTALLER"],
  });

  assert.match(installerShell, /isInstaller/);
  assert.match(installerShell, /\/api\/v1\/installer-jobs\/my/);
  assert.match(installerShell, /\/api\/v1\/legacy-crm\/state/);
  assert.match(installerShell, /Мои работы/);
  assert.match(installerShell, /Только назначенные вам работы/);
});

test("inline user context is escaped against closing script injection", () => {
  const shell = buildMobileCrmShell({
    user: {
      user_id: "u1",
      email: "x@example.com",
      full_name: "</script><script>alert(1)</script>",
    },
    roles: ["MANAGER"],
  });

  assert.doesNotMatch(shell, /<\/script><script>alert\(1\)<\/script>/);
  assert.match(shell, /\\u003c\/script\\u003e/);
});

test("canonical legacy CRM route mounts the mobile shell", () => {
  const route = readFileSync(
    path.join(process.cwd(), "app", "legacy-crm", "route.ts"),
    "utf8",
  );

  assert.match(route, /buildMobileCrmShell/);
  assert.match(route, /const mobileUi = buildMobileCrmShell/);
  assert.match(route, /\$\{mobileUi\}/);
});
