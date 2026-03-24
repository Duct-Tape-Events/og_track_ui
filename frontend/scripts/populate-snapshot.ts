/**
 * One-time script: fetches Sepolia block 10453411, extracts addresses,
 * verifies the Merkle root, and writes them to src/data/snapshot.ts
 *
 * Run with: npx tsx scripts/populate-snapshot.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { createPublicClient, http, encodePacked, getAddress, keccak256, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { MerkleTree } from "merkletreejs";

const BLOCK_NUMBER = 10453411n;
const EXPECTED_ROOT = "0x8cb64a64c65bb56d82f36115ab11d0dd5c63e55174cb6b7ead8c10292e91046b";
const RPC_URL = process.env.ETHEREUM_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

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

function dedup(addresses: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of addresses) {
    const norm = a.toLowerCase();
    if (!seen.has(norm)) { seen.add(norm); result.push(a); }
  }
  return result;
}

async function main() {
  console.log(`Fetching mainnet block ${BLOCK_NUMBER}...`);
  const block = await client.getBlock({ blockNumber: BLOCK_NUMBER, includeTransactions: true });
  console.log(`  ${block.transactions.length} transactions found`);

  const txs = block.transactions as { from: string; to: string | null }[];

  // Try "from" only
  const fromAddresses = dedup(txs.map((tx) => tx.from));
  const fromTree = buildTree(fromAddresses);
  let addresses: string[];

  if (treeRoot(fromTree) === EXPECTED_ROOT) {
    console.log(`Root verified using "from" extraction (${fromAddresses.length} addresses)`);
    addresses = fromAddresses;
  } else {
    // Try "from + to"
    const fromToAddresses = dedup([
      ...txs.map((tx) => tx.from),
      ...txs.filter((tx) => tx.to).map((tx) => tx.to as string),
    ]);
    const fromToTree = buildTree(fromToAddresses);

    if (treeRoot(fromToTree) === EXPECTED_ROOT) {
      console.log(`Root verified using "from+to" extraction (${fromToAddresses.length} addresses)`);
      addresses = fromToAddresses;
    } else {
      console.error(`Neither extraction method matched the expected root.`);
      console.error(`  Expected:  ${EXPECTED_ROOT}`);
      console.error(`  "from":    ${treeRoot(fromTree)}`);
      console.error(`  "from+to": ${treeRoot(fromToTree)}`);
      process.exit(1);
    }
  }

  const lines = addresses.map((a) => `  "${a.toLowerCase()}",`).join("\n");
  const output = `// Ordered list of addresses used to build the Merkle tree for OGAuthSignup.
// The ORDER here must exactly match the order used when the contract was deployed.
// All addresses should be lowercase.
// Auto-generated from mainnet block ${BLOCK_NUMBER} — do not edit manually.
export const SNAPSHOT_ADDRESSES: \`0x\${string}\`[] = [
${lines}
];
`;

  const outPath = join(import.meta.dirname, "../src/data/snapshot.ts");
  writeFileSync(outPath, output, "utf8");
  console.log(`Written to src/data/snapshot.ts (${addresses.length} addresses)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
