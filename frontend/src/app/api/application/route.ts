import { NextResponse } from "next/server";
import { ContactType } from "@prisma/client";

import { encryptContact, maskContact } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";
import { publicClient } from "@/lib/server/publicClient";
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

    const { walletAddress, nickname, contactType, contactValue, txHash } = parsed.data;

    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
    if (tx.from.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Transaction sender does not match wallet address" }, { status: 401 });
    }

    const encrypted = encryptContact(contactValue);

    const application = await prisma.application.upsert({
      where: { walletAddress: walletAddress.toLowerCase() },
      create: {
        walletAddress: walletAddress.toLowerCase(),
        nickname,
        contactType: contactType as ContactType,
        contactValueEncrypted: encrypted,
        txHash,
        status: "tx_pending",
      },
      update: {
        nickname,
        contactType: contactType as ContactType,
        contactValueEncrypted: encrypted,
        txHash,
        status: "tx_pending",
      },
      select: {
        walletAddress: true,
        nickname: true,
        contactType: true,
        txHash: true,
        status: true,
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
          txHash: application.txHash,
          status: application.status,
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST /api/application]", error);
    return NextResponse.json({ error: "Failed to save application" }, { status: 500 });
  }
}
