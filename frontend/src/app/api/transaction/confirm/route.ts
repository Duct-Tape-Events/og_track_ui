import { NextResponse } from "next/server";
import { verifyMessage } from "viem";

import { APPLICATION_SIGN_MESSAGE } from "@/app/api/application/route";
import { prisma } from "@/lib/server/prisma";
import { checkRateLimit, getIp } from "@/lib/server/ratelimit";
import { confirmTxSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!checkRateLimit(getIp(request), 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const json = await request.json();
    const parsed = confirmTxSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { walletAddress, txHash, signature } = parsed.data;

    const valid = await verifyMessage({
      address: walletAddress as `0x${string}`,
      message: APPLICATION_SIGN_MESSAGE(walletAddress),
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const application = await prisma.application.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() },
      select: { id: true },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    await prisma.application.update({
      where: { walletAddress: walletAddress.toLowerCase() },
      data: { txHash, status: "tx_pending" },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/transaction/confirm]", error);
    return NextResponse.json({ error: "Failed to confirm transaction" }, { status: 500 });
  }
}
