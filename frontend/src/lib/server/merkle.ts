import { MerkleTree } from "merkletreejs";
import { encodePacked, getAddress, keccak256, type Hex } from "viem";

import { SNAPSHOT_ADDRESSES } from "@/data/snapshot";

// Leaf: keccak256(abi.encodePacked(address)) — matches OGAuthSignup.sol
function addressLeaf(account: string): Buffer {
  const checksum = getAddress(account);
  const hash = keccak256(encodePacked(["address"], [checksum]));
  return Buffer.from(hash.slice(2), "hex");
}

function buildTree(): MerkleTree {
  const leaves = SNAPSHOT_ADDRESSES.map(addressLeaf);
  return new MerkleTree(
    leaves,
    (data: Buffer) => {
      const hex = `0x${data.toString("hex")}` as Hex;
      return Buffer.from(keccak256(hex).slice(2), "hex");
    },
    { sortPairs: true },
  );
}

export type ProofResult =
  | { eligible: true; proof: `0x${string}`[] }
  | { eligible: false; proof: null };

export function getProof(address: string): ProofResult {
  if (SNAPSHOT_ADDRESSES.length === 0) return { eligible: false, proof: null };

  const tree = buildTree();
  const leaf = addressLeaf(address);
  const proof = tree.getHexProof(leaf) as `0x${string}`[];

  // An empty proof on a non-single-element tree means the address isn't in the tree
  if (proof.length === 0 && SNAPSHOT_ADDRESSES.length > 1) {
    return { eligible: false, proof: null };
  }

  // Verify the proof is valid before returning it
  const root = tree.getRoot();
  const isValid = tree.verify(tree.getProof(leaf), leaf, root);
  if (!isValid) return { eligible: false, proof: null };

  return { eligible: true, proof };
}
