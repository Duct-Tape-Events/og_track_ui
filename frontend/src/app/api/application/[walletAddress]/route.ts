import { NextResponse } from "next/server";

import { decryptContact, maskContact } from "@/lib/server/encryption";
import { prisma } from "@/lib/server/prisma";
import { walletParamSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ walletAddress: string }>;
};

export async function GET(_: Request, context: RouteContext) {
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

    const decrypted = decryptContact(application.contactValueEncrypted);

    return NextResponse.json(
      {
        application: {
          walletAddress: application.walletAddress,
          nickname: application.nickname,
          contactType: application.contactType,
          contactValueMasked: maskContact(decrypted),
          txHash: application.txHash,
          status: application.status,
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
