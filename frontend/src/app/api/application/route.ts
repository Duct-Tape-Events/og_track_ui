import { NextResponse } from "next/server";
import { ContactType } from "@prisma/client";

import { encryptContact, maskContact } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";
import { checkRateLimit, getIp } from "@/lib/server/ratelimit";
import { createApplicationSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!checkRateLimit(getIp(request), 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const json = await request.json();
    const parsed = createApplicationSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { walletAddress, nickname, contactType, contactValue } = parsed.data;
    const encrypted = encryptContact(contactValue);

    const application = await prisma.application.upsert({
      where: { walletAddress: walletAddress.toLowerCase() },
      create: {
        walletAddress: walletAddress.toLowerCase(),
        nickname,
        contactType: contactType as ContactType,
        contactValueEncrypted: encrypted,
      },
      update: {
        nickname,
        contactType: contactType as ContactType,
        contactValueEncrypted: encrypted,
      },
      select: {
        walletAddress: true,
        nickname: true,
        contactType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        application: {
          walletAddress: application.walletAddress,
          nickname: application.nickname,
          contactType: application.contactType,
          contactValueMasked: maskContact(contactValue),
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
