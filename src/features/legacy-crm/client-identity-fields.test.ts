import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync("private/legacy/rolanpro-crm-cloud.html", "utf8");

function block(startMarker: string, endMarker: string) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `block ${startMarker} not found`);
  return html.slice(start, end);
}

function loadIdentity(fields: Record<string, string> = {}) {
  const context = vm.createContext({
    document: { getElementById: (id: string) => (id in fields ? { value: fields[id] } : null) },
    academyEsc: (value: unknown) => String(value ?? ""),
  });
  const source = [
    block("function splitClientName(fullName)", "function cleanAddressUnitValue"),
    block("// ---------- CLIENT IDENTITY: B2C person / B2B company", "function clientAccountType(c)"),
    block("function clientAccountType(c)", "function clientRelationshipType(c)"),
  ].join("\n");
  vm.runInContext(
    `${source}; Object.assign(this, { readClientIdentityFields, clientDisplayName, clientRepresentativeLine, clientIdentityFromLead, clientIdentityFieldsHtml });`,
    context,
  );
  return context as unknown as {
    readClientIdentityFields: (prefix: string) => { error?: string; fields?: Record<string, string> };
    clientDisplayName: (client: Record<string, unknown>) => string;
    clientRepresentativeLine: (client: Record<string, unknown>) => string;
    clientIdentityFromLead: (lead: Record<string, unknown>) => Record<string, string>;
    clientIdentityFieldsHtml: (prefix: string, client?: Record<string, unknown>) => string;
  };
}

test("B2C needs a first name; the card name is «Имя Фамилия»", () => {
  assert.match(loadIdentity({ "nc-kind": "b2c" }).readClientIdentityFields("nc").error || "", /имя клиента/);
  const { fields } = loadIdentity({ "nc-kind": "b2c", "nc-first-name": "Anna", "nc-last-name": "Smith" }).readClientIdentityFields("nc");
  assert.equal(fields?.name, "Anna Smith");
  assert.equal(fields?.accountType, "b2c");
  assert.equal(fields?.type, "residential");
  assert.equal(fields?.companyName, "");
});

test("B2B needs the company, the representative and the representative's title", () => {
  const missingTitle = loadIdentity({ "nc-kind": "b2b", "nc-company": "Acme LLC", "nc-first-name": "John" }).readClientIdentityFields("nc");
  assert.match(missingTitle.error || "", /должность/);

  const identity = loadIdentity({
    "nc-kind": "b2b", "nc-company": "Acme LLC", "nc-company-type": "designer",
    "nc-first-name": "John", "nc-last-name": "Doe", "nc-title": "Project manager", "nc-relationship": "one_time",
  });
  const { fields } = identity.readClientIdentityFields("nc");
  assert.equal(fields?.name, "Acme LLC");
  assert.equal(fields?.type, "commercial");
  assert.equal(fields?.relationshipType, "one_time", "a company is a partner only when chosen explicitly");
  assert.equal(identity.clientRepresentativeLine(fields as never), "John Doe · Project manager");
});

test("website and backend leads fill the card in either naming style", () => {
  const identity = loadIdentity();
  const company = identity.clientIdentityFromLead({ company_name: "Acme LLC", first_name: "John", contact_title: "Owner", company_type: "retail" });
  assert.equal(company.accountType, "b2b");
  assert.equal(company.name, "Acme LLC");
  assert.equal(company.companyType, "retail");
  const person = identity.clientIdentityFromLead({ name: "Maria Lopez" });
  assert.equal(person.accountType, "b2c");
  assert.equal(person.firstName, "Maria");
  assert.equal(person.lastName, "Lopez");
});

test("all client forms use the shared identity block, and website leads show in «Новые лиды»", () => {
  for (const prefix of ["nc", "client-contact", "oc"]) {
    assert.match(html, new RegExp(`clientIdentityFieldsHtml\\('${prefix}'`));
    assert.match(html, new RegExp(`readClientIdentityFields\\('${prefix}'\\)`));
  }
  assert.doesNotMatch(html, /id="nc-name"|id="oc-name"|id="client-contact-name"/);
  assert.match(html, /\['facebook_messenger', 'website'\]\.includes\(lead\?\.source\)/);
  assert.match(html, /markLeadProcessed\(leadId, 'CLOSED_LOST'\)/);
  assert.match(html, /pipeline_status_code: statusCode/);
});

test("an existing company card opens with its company fields visible", () => {
  const markup = loadIdentity().clientIdentityFieldsHtml("cc", { accountType: "b2b", companyName: "Acme", firstName: "John", contactTitle: "Owner" });
  assert.match(markup, /<option value="b2b" selected>/);
  assert.match(markup, /id="cc-company" value="Acme"/);
  assert.match(markup, /id="cc-title" value="Owner"/);
  assert.doesNotMatch(markup, /id="cc-company-block" class="[^"]*hidden/);
});

test("public lead values are escaped in «Новые лиды» and in shared contact renderers", () => {
  const leads = block("function renderLeadsView", "async function fetchLeads(");
  assert.match(leads, /academyEsc\(l\.name \|\| 'Без имени'\)/);
  assert.match(leads, /✉️ \$\{academyEsc\(l\.email\)\}/);
  assert.match(leads, /startCall\('\$\{academyEsc\(jsQuote\(l\.phone\)\)\}'/);
  assert.doesNotMatch(leads, /\$\{l\.(name|email|phone)\b(?! \?)/);
  assert.match(html, /✉️ \$\{academyEsc\(email\)\}<\/a>/);
  assert.match(html, /📍 \$\{academyEsc\(address\)\}<\/a>/);
});

test("cold-call companies keep the representative's title out of the last name", () => {
  const context = vm.createContext({});
  vm.runInContext(
    [
      block("function splitClientName(fullName)", "function cleanAddressUnitValue"),
      block("const CLIENT_COMPANY_TYPES = [", "function clientCompanyTypeLabel"),
      block("function coldProspectCompanyType(p)", "function toggleClientIdentityFields(prefix)"),
    ].join("\n") + "; Object.assign(this, { coldProspectIdentity });",
    context,
  );
  const { coldProspectIdentity } = context as unknown as { coldProspectIdentity: (p: Record<string, string>) => Record<string, string> };
  assert.deepEqual({ ...coldProspectIdentity({ companyName: "Acme", contactName: "John Smith office manager", businessType: "Офис" }) },
    { companyName: "Acme", companyType: "office", firstName: "John Smith office manager", lastName: "", contactTitle: "" });
  assert.deepEqual({ ...coldProspectIdentity({ companyName: "Acme", contactName: "John Smith", contactTitle: "Owner", companyType: "retail" }) },
    { companyName: "Acme", companyType: "retail", firstName: "John", lastName: "Smith", contactTitle: "Owner" });
});

test("a website lead is claimed on the server before the client and order are written", () => {
  const convert = block("async function convertLead(leadId)", "async function dismissLead(");
  const claim = convert.indexOf("setCanonicalLeadStatus(leadId, 'CONTACTED')");
  assert.ok(claim > 0, "claim present");
  assert.ok(claim < convert.indexOf("db.clients.push(client)"), "claim before the client is written");
  assert.ok(claim < convert.indexOf("db.orders.push(o)"), "claim before the order is written");
  assert.match(convert, /if \(canonical && !\(await setCanonicalLeadStatus\(leadId, 'CONTACTED'\)\)\) return;/);
  // One run per lead; the lead leaves the inbox only with a server-confirmed project,
  // otherwise the order/client are rolled back and the lead is released.
  assert.match(convert, /if \(convertingLeadIds\.has\(leadId\)\) return;/);
  assert.match(convert, /if \(!\(await cloudPersistConfirmed\(\)\)\) \{/);
  assert.match(convert, /db\.orders = db\.orders\.filter\(order => order\.id !== o\.id\);/);
  assert.match(convert, /await setCanonicalLeadStatus\(leadId, previousStatus, \['CONTACTED'\], \{ silent: true \}\);/);
  assert.ok(convert.indexOf("cloudPersistConfirmed()") < convert.indexOf("openOrder(o.id)"));
  // Status changes are compare-and-set on the server.
  assert.match(html, /body: JSON\.stringify\(\{ pipeline_status_code: statusCode, expected_status_codes: expectedStatusCodes \}\)/);
  const route = readFileSync("app/api/v1/leads/[leadId]/route.ts", "utf8");
  assert.match(route, /pipeline_status: \{ status_code: \{ in: expectedStatusCodes \} \}/);
  assert.match(route, /"lead_status_changed"/);
});

test("creating a project keeps «Разовый клиент» for a company", () => {
  assert.doesNotMatch(html, /accountTypeForOrder === 'b2b' \? 'regular'/);
  assert.doesNotMatch(html, /accountType === 'b2b' \? 'regular'/);
});
