import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/http/api-response";
import { hashPassword } from "@/lib/auth/password";
import { sendInvitationEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  const { fullName, email, role } = await request.json();
  
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return apiError(400, "duplicate_user", "User with this email already exists.");
  }

  const hashedPassword = hashPassword(Math.random().toString(36).slice(-8));

  const user = await prisma.user.create({
    data: {
      full_name: fullName,
      email,
      password_hash: hashedPassword,
      user_accesses: {
        create: [{
          role: { connect: { code: role } },
          is_active: true
        }]
      }
    }
  });

  await sendInvitationEmail(user.email, user.full_name);

  return apiSuccess({ message: "Employee added successfully and invitation email sent." });
}
