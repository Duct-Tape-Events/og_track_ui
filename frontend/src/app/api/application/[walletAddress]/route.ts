import { NextResponse } from "next/server";

import { decryptContact } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";
import { publicClient } from "@/lib/server/publicClient";
import { checkRateLimit, getIp } from "@/lib/server/ratelimit";
import { walletParamSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ walletAddress: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  if (!checkRateLimit(getIp(request), 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { walletAddress } = await context.params;
    const parsed = walletParamSchema.safeParse({ walletAddress });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid wallet address", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    let application = await prisma.application.findUnique({
      where: { walletAddress: parsed.data.walletAddress.toLowerCase() },
      select: {
        walletAddress: true,
        nickname: true,
        contactType: true,
        contactValueEncrypted: true,
        txHash: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    // Auto-resolve tx_pending: check on-chain and update status
    if (application.status === "tx_pending" && application.txHash) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: application.txHash as `0x${string}` });
        const newStatus = receipt.status === "success" ? "tx_confirmed" : "tx_failed";
        application = await prisma.application.update({
          where: { walletAddress: parsed.data.walletAddress.toLowerCase() },
          data: { status: newStatus },
          select: {
            walletAddress: true,
            nickname: true,
            contactType: true,
            contactValueEncrypted: true,
            txHash: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      } catch {
        // Receipt not yet available — leave status as tx_pending
      }
    }

    const contactValue = decryptContact(application.contactValueEncrypted);

    return NextResponse.json(
      {
        application: {
          walletAddress: application.walletAddress,
          nickname: application.nickname,
          contactType: application.contactType,
          contactValueMasked: contactValue,
          txHash: application.txHash,
          status: application.status,
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[GET /api/application/:walletAddress]", error);
    return NextResponse.json({ error: "Failed to fetch application" }, { status: 500 });
  }
}
