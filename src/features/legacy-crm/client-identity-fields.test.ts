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
  assert.equal(fields?.relationshipType, "regular", "a company is always an account");
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
