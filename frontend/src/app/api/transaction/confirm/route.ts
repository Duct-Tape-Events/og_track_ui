import { NextResponse } from "next/server";

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

    const { walletAddress, txHash } = parsed.data;

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
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
