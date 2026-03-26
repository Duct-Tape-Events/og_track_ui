import { getAddress } from "viem";

import { CONTRACT_ADDRESS } from "@/lib/contract/config";
import { publicClient as sepoliaClient, mainnetClient } from "@/lib/server/publicClient";

// Mainnet block whose state root is the contract's rootHash.
// Any address with a non-zero ETH balance at this block can sign up.
const BLOCK_NUMBER: bigint | null = process.env.MERKLE_MAINNET_BLOCK_NUMBER
  ? BigInt(process.env.MERKLE_MAINNET_BLOCK_NUMBER)
  : null;

export type ProofResult =
  | { eligible: true; proof: `0x${string}`[] }
  | { eligible: false; proof: null };

/**
 * Fetches an MPT account proof (eth_getProof) for `address` at the snapshot
 * block. The proof array can be passed directly to `signup(bytes[] proof)`.
 */
export async function getProof(address: string): Promise<ProofResult> {
  if (!BLOCK_NUMBER) {
    console.warn("[blockSnapshot] MERKLE_MAINNET_BLOCK_NUMBER not set — proof generation unavailable");
    return { eligible: false, proof: null };
  }

  const checksumAddress = getAddress(address) as `0x${string}`;

  const result = await mainnetClient.getProof({
    address: checksumAddress,
    storageKeys: [],
    blockNumber: BLOCK_NUMBER,
  });

  if (result.balance === 0n) {
    return { eligible: false, proof: null };
  }

  return { eligible: true, proof: result.accountProof };
}

/**
 * Verifies the contract's on-chain rootHash matches the state root of the
 * snapshot block, so we catch any mismatch between config and the live contract.
 */
export async function verifyContractRoot(): Promise<boolean> {
  if (!BLOCK_NUMBER) return false;
  try {
    const [block, onChainRoot] = await Promise.all([
      mainnetClient.getBlock({ blockNumber: BLOCK_NUMBER }),
      sepoliaClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: [
          {
            name: "rootHash",
            type: "function",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "", type: "bytes32" }],
          },
        ] as const,
        functionName: "rootHash",
      }),
    ]);
    return block.stateRoot === onChainRoot;
  } catch {
    return false;
  }
}
