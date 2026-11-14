#!/usr/bin/env python3
"""Import contacts from the LA tint-shop xlsx into the worker.
Usage: python3 scripts_import.py RolanPRO_LA_Tint_Shops_Database.xlsx https://wholesale.rolanpro-supply.com ADMIN_TOKEN
Only rows with an e-mail are sent."""
import sys, json, urllib.request
from openpyxl import load_workbook
xlsx, base, tok = sys.argv[1:4]
ws = load_workbook(xlsx).active
hdr = [c.value for c in ws[1]]
ix = {h: i for i, h in enumerate(hdr)}
rows = []
for r in ws.iter_rows(min_row=2, values_only=True):
    email = (r[ix["Email"]] or "").strip() if "Email" in ix else ""
    if not email: continue
    rows.append({"company": r[ix["Company"]], "email": email, "phone": r[ix["Phone"]], "city": r[ix["City"]],
                 "segment": r[ix.get("Segment", 0)], "website": r[ix.get("Website", 0)], "first_name": r[ix.get("Contact name", 0)] or None})
req = urllib.request.Request(f"{base}/admin/contacts", data=json.dumps(rows).encode(), method="POST",
                             headers={"content-type": "application/json", "authorization": f"Bearer {tok}"})
print(len(rows), "rows →", urllib.request.urlopen(req).read().decode())
