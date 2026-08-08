import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

import { ROLE_CODES } from "../src/lib/auth/constants";
import { hashPassword } from "../src/lib/auth/password";
import { sanitizeLegacyPayload, validateLegacyPayload } from "../src/features/legacy-crm/sanitize";

const workspacePath = process.argv[2] || path.resolve("data/legacy-crm-empty.json");
const credentialsPath = process.argv[3] || path.resolve("rolanpro-initial-access.json");

const accounts = [
  {
    email: "zufarast@gmail.com",
    fullName: "Zufar",
    roles: [ROLE_CODES.OWNER],
    legacyUserIds: ["u_o1"],
  },
  {
    email: "info@rolan-pro.com",
    fullName: "Danil",
    roles: [ROLE_CODES.MANAGER],
    legacyUserIds: ["u_m1"],
  },
  {
    email: "ataevzufar888@gmail.com",
    fullName: "Zufar Ataev",
    roles: [ROLE_CODES.CONSULTANT, ROLE_CODES.INSTALLER],
    legacyUserIds: ["u_z1", "u_i1"],
  },
] as const;

function temporaryPassword() {
  return `${randomBytes(9).toString("base64url")}!aA7`;
}

export async function provisionLegacyCrm(
  prisma: PrismaClient,
  sourceWorkspacePath = workspacePath,
  initialAccessPath = credentialsPath,
) {
  const workspace = JSON.parse(await readFile(sourceWorkspacePath, "utf8")) as unknown;
  if (!validateLegacyPayload(workspace)) {
    throw new Error("Invalid empty legacy workspace payload.");
  }

  const createdCredentials: Array<{ email: string; temporaryPassword: string }> = [];

  for (const account of accounts) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    const password = existing?.password_hash ? null : temporaryPassword();
    const passwordHash = password ? hashPassword(password) : existing?.password_hash;
    if (!passwordHash) {
      throw new Error(`Could not resolve a password hash for ${account.email}.`);
    }
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        full_name: account.fullName,
        is_active: true,
        legacy_user_ids: [...account.legacyUserIds],
        ...(password
          ? { password_hash: passwordHash, must_change_password: true }
          : {}),
      },
      create: {
        email: account.email,
        full_name: account.fullName,
        is_active: true,
        legacy_user_ids: [...account.legacyUserIds],
        password_hash: passwordHash,
        must_change_password: true,
      },
    });

    for (const roleCode of account.roles) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
      await prisma.userAccess.upsert({
        where: {
          user_id_role_id: {
            user_id: user.user_id,
            role_id: role.role_id,
          },
        },
        update: { is_active: true },
        create: {
          user_id: user.user_id,
          role_id: role.role_id,
          is_active: true,
          is_primary: roleCode === account.roles[0],
        },
      });
    }

    if (password) {
      createdCredentials.push({ email: account.email, temporaryPassword: password });
    }
  }

  await prisma.legacyWorkspace.upsert({
    where: { workspace_id: "primary" },
    update: {},
    create: {
      workspace_id: "primary",
      payload: sanitizeLegacyPayload(workspace),
      revision: 1,
    },
  });

  if (createdCredentials.length > 0) {
    await writeFile(initialAccessPath, `${JSON.stringify(createdCredentials, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(initialAccessPath, 0o600);
    console.log(`Provisioned CRM. Initial access file: ${initialAccessPath}`);
  } else {
    console.log("Provisioned CRM. No new temporary passwords were created.");
  }

  return createdCredentials.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();
  provisionLegacyCrm(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
