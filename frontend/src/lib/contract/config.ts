import type { Abi } from "viem";

export const CONTRACT_CHAIN_ID = 11155111; // Sepolia
export const CONTRACT_ADDRESS = "0xb51d799b94c3dc9119bc6ac072cfabe037126824" as `0x${string}`;

// Minimal ABI — only the functions used by the frontend
export const CONTRACT_ABI = [
  {
    name: "signup",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "proof", type: "bytes32[]", internalType: "bytes32[]" }],
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
