import { MerkleTree } from "merkletreejs";
import { encodePacked, getAddress, keccak256, type Hex } from "viem";

import { CONTRACT_ADDRESS } from "@/lib/contract/config";
import { publicClient as sepoliaClient, mainnetClient } from "@/lib/server/publicClient";

// Set this once you have the block number from the contract deployer.
// Can also be provided via the MERKLE_BLOCK_NUMBER env var.
const BLOCK_NUMBER: bigint | null = process.env.MERKLE_BLOCK_NUMBER
  ? BigInt(process.env.MERKLE_BLOCK_NUMBER)
  : null;

// The root hash the contract was deployed with
const EXPECTED_ROOT = "0x8cb64a64c65bb56d82f36115ab11d0dd5c63e55174cb6b7ead8c10292e91046b";

function addressLeaf(account: string): Buffer {
  const checksum = getAddress(account);
  const hash = keccak256(encodePacked(["address"], [checksum]));
  return Buffer.from(hash.slice(2), "hex");
}

function buildTree(addresses: string[]): MerkleTree {
  const leaves = addresses.map(addressLeaf);
  return new MerkleTree(
    leaves,
    (data: Buffer) => {
      const hex = `0x${data.toString("hex")}` as Hex;
      return Buffer.from(keccak256(hex).slice(2), "hex");
    },
    { sortPairs: true },
  );
}

function treeRoot(tree: MerkleTree): string {
  return `0x${tree.getRoot().toString("hex")}`;
}

// Deduplicate preserving first-seen order
function dedup(addresses: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of addresses) {
    const norm = a.toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push(a);
    }
  }
  return result;
}

type SnapshotCache = {
  tree: MerkleTree;
  blockNumber: bigint;
  extractionMethod: "from" | "from+to";
};

let cache: SnapshotCache | null = null;

export async function getSnapshot(): Promise<SnapshotCache | null> {
  if (cache) return cache;
  if (!BLOCK_NUMBER) {
    console.warn("[blockSnapshot] MERKLE_BLOCK_NUMBER not set — proof generation unavailable");
    return null;
  }

  console.log(`[blockSnapshot] Fetching mainnet block ${BLOCK_NUMBER}...`);
  const block = await mainnetClient.getBlock({
    blockNumber: BLOCK_NUMBER,
    includeTransactions: true,
  });

  if (!block.transactions.length) {
    console.error("[blockSnapshot] Block has no transactions");
    return null;
  }

  const txs = block.transactions as { from: string; to: string | null }[];

  // Try "from" only first
  const fromAddresses = dedup(txs.map((tx) => tx.from));
  const fromTree = buildTree(fromAddresses);
  if (treeRoot(fromTree) === EXPECTED_ROOT) {
    console.log(`[blockSnapshot] Root verified using "from" extraction (${fromAddresses.length} addresses)`);
    cache = { tree: fromTree, blockNumber: BLOCK_NUMBER, extractionMethod: "from" };
    return cache;
  }

  // Try "from + to"
  const fromToAddresses = dedup([
    ...txs.map((tx) => tx.from),
    ...txs.filter((tx) => tx.to).map((tx) => tx.to as string),
  ]);
  const fromToTree = buildTree(fromToAddresses);
  if (treeRoot(fromToTree) === EXPECTED_ROOT) {
    console.log(`[blockSnapshot] Root verified using "from+to" extraction (${fromToAddresses.length} addresses)`);
    cache = { tree: fromToTree, blockNumber: BLOCK_NUMBER, extractionMethod: "from+to" };
    return cache;
  }

  console.error(
    `[blockSnapshot] Neither extraction method produced the expected root.\n` +
    `  Expected: ${EXPECTED_ROOT}\n` +
    `  "from" produced: ${treeRoot(fromTree)}\n` +
    `  "from+to" produced: ${treeRoot(fromToTree)}\n` +
    `  Check the block number or ask the deployer for the exact extraction method.`,
  );
  return null;
}

export type ProofResult =
  | { eligible: true; proof: `0x${string}`[] }
  | { eligible: false; proof: null };

export async function getProof(address: string): Promise<ProofResult> {
  const snapshot = await getSnapshot();
  if (!snapshot) return { eligible: false, proof: null };

  const leaf = addressLeaf(address);
  const proof = snapshot.tree.getHexProof(leaf) as `0x${string}`[];
  const root = snapshot.tree.getRoot();
  const isValid = snapshot.tree.verify(snapshot.tree.getProof(leaf), leaf, root);

  if (!isValid) return { eligible: false, proof: null };
  return { eligible: true, proof };
}

// Also verify the contract's on-chain rootHash matches what we expect,
// so we catch any mismatch between our config and the live contract.
export async function verifyContractRoot(): Promise<boolean> {
  try {
    const onChainRoot = await sepoliaClient.readContract({
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
    });
    return onChainRoot === EXPECTED_ROOT;
  } catch {
    return false;
  }
}
