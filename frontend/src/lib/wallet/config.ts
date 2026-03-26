"use client";

import { QueryClient } from "@tanstack/react-query";
import { createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const isProduction = process.env.NEXT_PUBLIC_ENVIRONMENT === "production";

export const wagmiConfig = createConfig({
  chains: isProduction ? [mainnet, sepolia] : [sepolia, mainnet],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: true,
});

export const queryClient = new QueryClient();
