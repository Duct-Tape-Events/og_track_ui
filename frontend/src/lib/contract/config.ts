import type { Abi } from "viem";

export const CONTRACT_CHAIN_ID = 11155111; // Sepolia
export const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "0xd43965821f8d40dd449760aA39a934Ff0b87dba7"
) as `0x${string}`;

// Minimal ABI — only the functions used by the frontend
export const CONTRACT_ABI = [
  {
    name: "signup",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "proof", type: "bytes[]", internalType: "bytes[]" }],
    outputs: [],
  },
  {
    name: "depositAmountWei",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
  },
  {
    name: "isSignedUp",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
  },
] as const satisfies Abi;

export const isContractConfigured = true;
