"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useReadContract, useSendTransaction, useSwitchChain } from "wagmi";
import { encodeFunctionData, formatEther } from "viem";

import { CONTRACT_ABI, CONTRACT_ADDRESS, CONTRACT_CHAIN_ID } from "@/lib/contract/config";

type ContactType = "telegram" | "email" | "signal";
type Mode = "menu" | "form";
type Flow = "apply" | "view";
type ApplyStep = "connectWallet" | "nickname" | "contactType" | "contactValue" | "confirm";
type ViewStep = "walletAddress";
type FormStep = ApplyStep | ViewStep;

type ApplyDraft = {
  nickname: string;
  contactType: ContactType | null;
  contactValue: string;
};

type SavedApplication = {
  walletAddress: string;
  nickname: string;
  contactType: ContactType;
  contactValueMasked: string;
  txHash: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const BASE_MENU_ITEMS = ["read manifesto", "apply for og hackathon", "attend ETHPrague 2026"] as const;
type BaseMenuItem = (typeof BASE_MENU_ITEMS)[number];
type MenuItem = BaseMenuItem | "disconnect" | "view my application";

const MANIFESTO_LINES = [
  "╔══════════════════════════════════════╗",
  "║        OG's aren't jaded!           ║",
  "╚══════════════════════════════════════╝",
  "",
  "  [Manifesto placeholder — coming soon]",
  "",
  "  We build with conviction, curiosity, and care.",
  "  We value craft over hype and signal over noise.",
  "  We ship work that is legible, useful, and open.",
  "  We stay optimistic because builders define the future.",
  "",
];

const INITIAL_LINES = [
  "",
  "  ██████╗  ██████╗ ███████╗",
  "  ██╔══██╗██╔════╝ ██╔════╝",
  "  ██║  ██║██║  ███╗███████╗",
  "  ██║  ██║██║   ██║╚════██║",
  "  ██████╔╝╚██████╔╝███████║",
  "  ╚═════╝  ╚═════╝ ╚══════╝",
  "",
  "  OG's aren't jaded!",
  "",
];

const APPLY_STEPS: ApplyStep[] = ["connectWallet", "nickname", "contactType", "contactValue", "confirm"];
const CONTACT_TYPES: ContactType[] = ["telegram", "email", "signal"];

const EMPTY_DRAFT: ApplyDraft = { nickname: "", contactType: null, contactValue: "" };

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function validateContact(type: ContactType, value: string): boolean {
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (type === "telegram") return /^@?[a-zA-Z0-9_]{5,32}$/.test(value);
  return /^([+][0-9]{7,15}|[a-zA-Z0-9_.-]{3,64})$/.test(value);
}

function isValidAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function formatDeposit(wei: bigint): string {
  if (wei === 0n) return "0 ETH";
  if (wei < 1_000_000_000_000_000n) return `${wei} wei`;
  return `${formatEther(wei)} ETH`;
}

export function CliTerminal() {
  const [lines, setLines] = useState<string[]>(INITIAL_LINES);
  const [mode, setMode] = useState<Mode>("menu");
  const [menuIndex, setMenuIndex] = useState(0);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [formStep, setFormStep] = useState<FormStep>("connectWallet");
  const [draft, setDraft] = useState<ApplyDraft>(EMPTY_DRAFT);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [contactTypeIndex, setContactTypeIndex] = useState(0);
  const [userApplication, setUserApplication] = useState<SavedApplication | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { data: depositAmountWei } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "depositAmountWei",
  });

  // ── Auto-switch to correct network on connect ─────────────────────────────

  useEffect(() => {
    if (!isConnected || chainId === CONTRACT_CHAIN_ID) return;
    switchChainAsync({ chainId: CONTRACT_CHAIN_ID }).catch(() => {});
  }, [isConnected, chainId, switchChainAsync]);

  // ── Fetch application for connected wallet ────────────────────────────────

  useEffect(() => {
    if (!address) { setUserApplication(null); return; }
    fetch(`/api/application/${address}`)
      .then((res) => res.json())
      .then((data: { application?: SavedApplication }) => setUserApplication(data.application ?? null))
      .catch(() => setUserApplication(null));
  }, [address]);

  const hasApplied = userApplication !== null;

  const menuItems: MenuItem[] = [
    "read manifesto",
    hasApplied ? "view my application" : "apply for og hackathon",
    "attend ETHPrague 2026",
    ...(isConnected ? (["disconnect"] as const) : []),
  ];

  // Clamp menuIndex when items shrink (e.g. after disconnect removes the last item)
  useEffect(() => {
    setMenuIndex((i) => Math.min(i, menuItems.length - 1));
  }, [menuItems.length]);

  const appendLine = (line: string) => setLines((c) => [...c, line]);
  const appendLines = (next: string[]) => setLines((c) => [...c, ...next]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    if (mode === "form") inputRef.current?.focus();
  }, [mode, formStep]);

  const returnToMenu = useCallback(() => {
    setMode("menu");
    setFlow(null);
    setDraft(EMPTY_DRAFT);
    setInputValue("");
  }, []);

  // ── Escape: go back one level ─────────────────────────────────────────────

  const goBack = useCallback(() => {
    setInputValue("");

    if (flow === "view" || formStep === "connectWallet") {
      returnToMenu();
      return;
    }

    const prevStep = APPLY_STEPS[APPLY_STEPS.indexOf(formStep as ApplyStep) - 1];
    setFormStep(prevStep);

    if (prevStep === "connectWallet") {
      setDraft((d) => ({ ...d, nickname: "" }));
      appendLine("Connect wallet? y/n");
    } else if (prevStep === "nickname") {
      setDraft((d) => ({ ...d, contactType: null }));
      appendLines(["", "Enter a nickname:"]);
    } else if (prevStep === "contactType") {
      setDraft((d) => ({ ...d, contactValue: "" }));
      setContactTypeIndex(draft.contactType ? CONTACT_TYPES.indexOf(draft.contactType) : 0);
      appendLines(["", "Choose a contact method:"]);
    } else if (prevStep === "contactValue") {
      setDraft((d) => ({ ...d, contactValue: "" }));
      const hint =
        draft.contactType === "telegram" ? "(e.g. @username)" :
        draft.contactType === "email"    ? "(e.g. you@example.com)" :
                                           "(e.g. +1234567890)";
      appendLines(["", `Enter your ${draft.contactType} handle ${hint}:`]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, formStep, draft.contactType, returnToMenu]);

  useEffect(() => {
    if (mode !== "form") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); goBack(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, goBack]);

  // ── Menu keyboard navigation ──────────────────────────────────────────────

  const handleMenuSelect = useCallback(
    async (index: number) => {
      const selected = menuItems[index];
      appendLine(`> ${selected}`);

      if (selected === "read manifesto") {
        appendLines(MANIFESTO_LINES);
        return;
      }

      if (selected === "apply for og hackathon") {
        setDraft(EMPTY_DRAFT);
        setFlow("apply");
        setMode("form");

        if (isConnected && address) {
          // Already connected — skip straight to nickname
          setFormStep("nickname");
          appendLines([
            "",
            `Wallet connected: ${truncateAddress(address)}`,
            "",
            "Enter a nickname:",
          ]);
        } else {
          setFormStep("connectWallet");
          appendLines(["", "Connect wallet? y/n"]);
        }
        return;
      }

      if (selected === "view my application") {
        if (!userApplication) return;
        const r = userApplication;
        appendLines([
          "",
          "Your application:",
          `  wallet     ${truncateAddress(r.walletAddress)}`,
          `  nickname   ${r.nickname}`,
          `  contact    ${r.contactType}: ${r.contactValueMasked}`,
          `  status     ${r.status}`,
          ...(r.txHash ? [`  tx         https://sepolia.etherscan.io/tx/${r.txHash}`] : []),
          `  submitted  ${formatDate(r.createdAt)}`,
          "",
        ]);
        return;
      }

      if (selected === "attend ETHPrague 2026") {
        appendLine("Opening ETHPrague...");
        window.open("https://ethprague.com/", "_blank", "noopener,noreferrer");
        return;
      }

      if (selected === "disconnect") {
        try {
          await disconnectAsync();
          appendLines(["", "Wallet disconnected.", ""]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Disconnect failed";
          appendLine(`Disconnect failed: ${message}`);
        }
        return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuItems, isConnected, address, disconnectAsync, userApplication],
  );

  useEffect(() => {
    if (mode !== "menu") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIndex((i) => (i + 1) % menuItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleMenuSelect(menuIndex);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, menuIndex, menuItems, handleMenuSelect]);

  // ── Contact type selection (arrow keys) ──────────────────────────────────

  useEffect(() => {
    if (mode !== "form" || formStep !== "contactType") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setContactTypeIndex((i) => (i - 1 + CONTACT_TYPES.length) % CONTACT_TYPES.length);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setContactTypeIndex((i) => (i + 1) % CONTACT_TYPES.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const ct = CONTACT_TYPES[contactTypeIndex];
        const hint =
          ct === "telegram" ? "(e.g. @username)" :
          ct === "email"    ? "(e.g. you@example.com)" :
                              "(e.g. +1234567890)";
        appendLine(`> ${ct}`);
        setDraft((d) => ({ ...d, contactType: ct }));
        setFormStep("contactValue");
        setLines((l) => [...l, "", `Enter your ${ct} handle ${hint}:`]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, formStep, contactTypeIndex]);

  // ── Apply form steps ──────────────────────────────────────────────────────

  const handleApplyStep = async (value: string) => {
    if (formStep === "connectWallet") {
      const v = value.toLowerCase();
      if (v === "n" || v === "no") { returnToMenu(); return; }
      if (v !== "y" && v !== "yes") { appendLine("Please type y or n."); return; }

      if (!connectors.length) {
        appendLine("No wallet found. Make sure a browser wallet extension is installed.");
        return;
      }

      setIsProcessing(true);
      try {
        const result = await connectAsync({ connector: connectors[0] });
        appendLines([
          "",
          `Connected: ${truncateAddress(result.accounts[0])}`,
          "",
          "Enter a nickname:",
        ]);
        setFormStep("nickname");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Connection failed";
        if (message.toLowerCase().includes("already connected") && address) {
          appendLines([
            "",
            `Connected: ${truncateAddress(address)}`,
            "",
            "Enter a nickname:",
          ]);
          setFormStep("nickname");
        } else {
          appendLine(`Connect failed: ${message}`);
          returnToMenu();
        }
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (formStep === "nickname") {
      if (value.length < 2 || value.length > 64) {
        appendLine("Nickname must be between 2 and 64 characters.");
        return;
      }
      setDraft((d) => ({ ...d, nickname: value }));
      setContactTypeIndex(0);
      setFormStep("contactType");
      appendLines(["", "Choose a contact method:"]);
      return;
    }

    if (formStep === "contactValue") {
      if (!draft.contactType) { returnToMenu(); return; }
      if (!validateContact(draft.contactType, value)) {
        appendLine(`That doesn't look like a valid ${draft.contactType}. Try again.`);
        return;
      }
      setDraft((d) => ({ ...d, contactValue: value }));
      setFormStep("confirm");
      const amountStr = depositAmountWei !== undefined ? formatDeposit(depositAmountWei) : "...";
      appendLines([
        "",
        "Review your application:",
        `  wallet     ${address ? truncateAddress(address) : "unknown"}`,
        `  nickname   ${draft.nickname}`,
        `  contact    ${draft.contactType}: ${value}`,
        "",
        `stake ${amountStr} to confirm your application? y/n`,
        "",
      ]);
      return;
    }

    if (formStep === "confirm") {
      const v = value.toLowerCase();
      if (v === "no" || v === "n") { appendLine("Application canceled."); returnToMenu(); return; }
      if (v !== "yes" && v !== "y") { appendLine("Please type y or n."); return; }
      if (!address) { appendLine("Wallet disconnected. Please restart."); returnToMenu(); return; }

      setIsProcessing(true);
      try {
        // 1. Fetch Merkle proof + check eligibility
        appendLine("Checking eligibility...");
        const proofRes = await fetch(`/api/merkle/proof/${address}`);
        const proofData = (await proofRes.json()) as {
          eligible: boolean;
          proof: `0x${string}`[];
          alreadySignedUp: boolean;
          depositAmountWei: string;
          error?: string;
        };

        if (!proofRes.ok) throw new Error(proofData.error ?? "Failed to fetch proof");
        if (proofData.alreadySignedUp) { appendLine("Already signed up on-chain."); returnToMenu(); return; }
        if (!proofData.eligible) { appendLines(["", "Not eligible — address not in the OG snapshot.", ""]); returnToMenu(); return; }

        const stakeAmount = BigInt(proofData.depositAmountWei);

        // 2. Switch chain if needed
        if (chainId !== CONTRACT_CHAIN_ID) {
          appendLine("Switching to Sepolia...");
          await switchChainAsync({ chainId: CONTRACT_CHAIN_ID });
        }

        // 3. Send transaction
        appendLine("Confirm the transaction in your wallet.");
        const txHash = await sendTransactionAsync({
          to: CONTRACT_ADDRESS,
          value: stakeAmount,
          data: encodeFunctionData({ abi: CONTRACT_ABI, functionName: "signup", args: [proofData.proof] }),
        });

        appendLines([`Transaction submitted: ${txHash}`, `Track: https://sepolia.etherscan.io/tx/${txHash}`]);

        // 4. Save application — server verifies tx.from matches wallet address
        const saveRes = await fetch("/api/application", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            nickname: draft.nickname,
            contactType: draft.contactType,
            contactValue: draft.contactValue,
            txHash,
          }),
        });
        const savePayload = (await saveRes.json()) as { error?: string };
        if (!saveRes.ok) throw new Error(savePayload.error ?? "Failed to save application");

        // 5. Refresh local application state
        const refreshed = await fetch(`/api/application/${address}`).then((r) => r.json()) as { application?: SavedApplication };
        setUserApplication(refreshed.application ?? null);

        appendLines(["", "✓ Staked and saved. Welcome to the OGs.", ""]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong";
        appendLine(`Error: ${message}`);
      } finally {
        setIsProcessing(false);
        returnToMenu();
      }
      return;
    }
  };

  // ── View application step ─────────────────────────────────────────────────

  const handleViewStep = async (value: string) => {
    if (formStep !== "walletAddress") return;
    if (!isValidAddress(value)) {
      appendLine("Invalid address. Must be a 0x-prefixed Ethereum address.");
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch(`/api/application/${value}`);
      const payload = (await response.json()) as { error?: string; application?: SavedApplication };

      if (!response.ok || !payload.application) {
        throw new Error(payload.error ?? "No application found for this address.");
      }

      const r = payload.application;
      appendLines([
        "",
        "Application found:",
        `  nickname     ${r.nickname}`,
        `  contact      ${r.contactType}: ${r.contactValueMasked}`,
        `  status       ${r.status}`,
        ...(r.txHash ? [`  tx           https://sepolia.etherscan.io/tx/${r.txHash}`] : []),
        `  submitted    ${formatDate(r.createdAt)}`,
        "",
      ]);
    } catch (error) {
      appendLine(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setIsProcessing(false);
      returnToMenu();
    }
  };

  // ── Form submit ───────────────────────────────────────────────────────────

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isProcessing) return;

    const value = inputValue.trim();
    setInputValue("");

    if (value.toLowerCase() === "cancel") {
      appendLine("Canceled.");
      returnToMenu();
      return;
    }

    if (!value) return;

    appendLine(`> ${value}`);

    if (flow === "apply") await handleApplyStep(value);
    if (flow === "view") await handleViewStep(value);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] p-4">
      <main className="flex h-[85vh] w-full max-w-3xl flex-col rounded-md border border-[#2B5D2B] bg-black/90 font-mono text-sm text-[#7CFF7C] shadow-[0_0_30px_rgba(124,255,124,0.12)]">

        <header className="border-b border-[#2B5D2B] px-4 py-2 text-xs text-[#5B985B]">
          OG's aren't jaded! :: ETHPrague 2026
        </header>

        <section
          ref={outputRef}
          className="flex-1 overflow-y-auto px-5 py-3 leading-6 whitespace-pre-wrap"
          aria-live="polite"
        >
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </section>

        {mode === "menu" && (
          <nav className="border-t border-[#2B5D2B] px-5 py-4">
            <p className="mb-2 text-xs text-[#5B985B]">↑ ↓ navigate · enter select</p>
            {menuItems.map((item, i) => (
              <div key={item} className={`py-0.5 ${i === menuIndex ? "text-[#D5FFD5]" : "text-[#5B985B]"}`}>
                {i === menuIndex ? "▶ " : "  "}{item}
              </div>
            ))}
          </nav>
        )}

        {mode === "form" && formStep === "contactType" && (
          <nav className="border-t border-[#2B5D2B] px-5 py-4">
            <p className="mb-2 text-xs text-[#5B985B]">↑ ↓ navigate · enter select · esc back</p>
            {CONTACT_TYPES.map((ct, i) => (
              <div key={ct} className={`py-0.5 ${i === contactTypeIndex ? "text-[#D5FFD5]" : "text-[#5B985B]"}`}>
                {i === contactTypeIndex ? "▶ " : "  "}{ct}
              </div>
            ))}
          </nav>
        )}

        {mode === "form" && formStep !== "contactType" && (
          <footer className="border-t border-[#2B5D2B] px-4 py-3">
            <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
              <span className="text-[#5B985B]">›</span>
              <input
                ref={inputRef}
                className="w-full bg-transparent text-[#D5FFD5] outline-none placeholder:text-[#2B5D2B] disabled:opacity-40"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isProcessing ? "processing..." : "press 'escape' to return"}
                disabled={isProcessing}
                autoComplete="off"
              />
            </form>
          </footer>
        )}

      </main>
    </div>
  );
}
