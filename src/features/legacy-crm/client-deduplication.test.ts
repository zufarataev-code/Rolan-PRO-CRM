import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");
const clientsRoute = readFileSync("app/api/v1/clients/route.ts", "utf8");
const clientRoute = readFileSync("app/api/v1/clients/[clientId]/route.ts", "utf8");
const workspaceRoute = readFileSync("app/api/v1/legacy-crm/state/route.ts", "utf8");
const projectService = readFileSync("src/features/projects/service.ts", "utf8");
const proposalPublisher = readFileSync("src/features/legacy-crm/publish-proposal.ts", "utf8");

function functionSource(name: string, nextName: string) {
  const start = html.indexOf(`function ${name}`);
  const end = html.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return html.slice(start, end);
}

test("manual legacy client creation opens or selects an existing matching card", () => {
  const createClient = functionSource("createClient", "closeModal");
  const createOrderClient = functionSource("createOrderClientFromOverlay", "createOrder");

  assert.match(createClient, /uniqueExistingClientByContact\(phone, email\)/);
  assert.match(createClient, /existing === false\) return/);
  assert.match(createClient, /focusExistingClientCard\(existing\)/);
  assert.match(createOrderClient, /uniqueExistingClientByContact\(phone, email\)/);
  assert.match(createOrderClient, /selectOrderClient\(existing\.id\)/);
});

test("legacy contact edits and lead conversions cannot introduce duplicate cards", () => {
  const saveContact = functionSource("saveClientContactProfile", "projectEstimateServiceLabel");
  const convertLead = functionSource("convertLead", "dismissLead");

  assert.match(saveContact, /existingClientByContact\(phoneChanged \? phone : '', emailChanged \? email : '', clientId\)/);
  // Reuses the matching card; several matches → the manager chooses one.
  assert.match(convertLead, /clientsMatchingContact\(l\.phone, l\.email\)/);
  assert.match(convertLead, /chooseLegacyClient\(matches,/);
});

test("canonical client APIs lock identity and reuse or reject matching clients", () => {
  assert.match(clientsRoute, /lockClientIdentity\(tx, contact\)/);
  assert.match(clientsRoute, /findExistingClientByIdentity\(tx, contact\)/);
  assert.match(clientsRoute, /reused: true/);
  // Updates lock old + new identities and check only the contacts that change.
  assert.match(clientRoute, /lockClientIdentityUpdate\(tx, clientId, contact\)/);
  assert.match(clientRoute, /findExistingClientByIdentity\(tx, changed, clientId\)/);
  assert.match(clientRoute, /"duplicate_client"/);
});

test("project and proposal creation reuse identity without creating or overwriting a duplicate", () => {
  assert.match(projectService, /findExistingClientByIdentity\(tx, contact\)/);
  assert.match(projectService, /\? \{ client_id: reusableClient\.client\.client_id \}/);
  assert.match(proposalPublisher, /findExistingClientByIdentity\(tx, contact, clientId!\)/);
  // An existing client card is never rewritten by a proposal: only missing
  // contact fields are filled, and only without an identity conflict.
  assert.match(proposalPublisher, /if \(!identityConflict && current\)/);
  assert.match(proposalPublisher, /email: current\.email \? undefined : snapshot\.email/);
  const reuseUpdate = proposalPublisher.slice(
    proposalPublisher.indexOf("Publishing a proposal never rewrites"),
    proposalPublisher.indexOf("const total = snapshot.items"),
  );
  assert.doesNotMatch(reuseUpdate, /name: snapshot\.clientName/);
  assert.doesNotMatch(reuseUpdate, /service_address:/);
});

test("legacy workspace server rejects a newly introduced duplicate identity", () => {
  assert.match(workspaceRoute, /findIntroducedClientIdentityDuplicate/);
  assert.match(workspaceRoute, /duplicateClientError\(introducedDuplicate\)/);
  assert.match(html, /result\?\.errors\?\.\[0\]\?\.code === 'duplicate_client'/);
  assert.match(html, /Дубль клиента заблокирован/);
});
