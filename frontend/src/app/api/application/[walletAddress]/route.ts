import { NextResponse } from "next/server";

import { maskContact } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";
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

    const application = await prisma.application.findUnique({
      where: { walletAddress: parsed.data.walletAddress.toLowerCase() },
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

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        application: {
          walletAddress: application.walletAddress,
          nickname: application.nickname,
          contactType: application.contactType,
          contactValueMasked: maskContact(""),
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
