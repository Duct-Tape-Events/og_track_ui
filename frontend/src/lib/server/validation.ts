import { z } from "zod";

const walletAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address");
const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid tx hash");

export const createApplicationSchema = z.object({
  walletAddress: walletAddressSchema,
  nickname: z.string().trim().min(2).max(64),
  contactType: z.enum(["telegram", "email", "signal"]),
  contactValue: z.string().trim().min(3).max(190),
  txHash: txHashSchema,
});

export const walletParamSchema = z.object({
  walletAddress: walletAddressSchema,
});
