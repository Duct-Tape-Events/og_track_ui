import { NextResponse } from "next/server";

import { CONTRACT_ABI, CONTRACT_ADDRESS } from "@/lib/contract/config";
import { getProof } from "@/lib/server/blockSnapshot";
import { publicClient } from "@/lib/server/publicClient";
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

    const address = parsed.data.walletAddress.toLowerCase() as `0x${string}`;

    const [depositAmountWei, alreadySignedUp, proofResult] = await Promise.all([
      publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "depositAmountWei",
      }),
      publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "isSignedUp",
        args: [address],
      }),
      getProof(address),
    ]);

    return NextResponse.json({
      eligible: proofResult.eligible,
      proof: proofResult.eligible ? proofResult.proof : [],
      alreadySignedUp,
      depositAmountWei: depositAmountWei.toString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
