import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_CODES } from "@/lib/auth/constants";
import { getMailHomeHref } from "./navigation";

test("mail returns owners to the owner workspace", () => {
  assert.equal(getMailHomeHref([ROLE_CODES.OWNER]), "/owner");
});

test("mail returns managers to the manager workspace", () => {
  assert.equal(getMailHomeHref([ROLE_CODES.MANAGER]), "/manager");
});

test("owner wins when a user has both owner and manager roles", () => {
  assert.equal(getMailHomeHref([ROLE_CODES.MANAGER, ROLE_CODES.OWNER]), "/owner");
});
