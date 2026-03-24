import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

// Sepolia — for reading contract state (depositAmountWei, isSignedUp)
export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.ETHEREUM_SEPOLIA_RPC_URL),
});

// Mainnet — for fetching the snapshot block
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETHEREUM_MAINNET_RPC_URL),
});
