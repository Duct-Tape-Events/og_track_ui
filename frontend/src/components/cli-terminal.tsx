"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ContactType = "telegram" | "email" | "signal";
type Mode = "menu" | "form";
type Flow = "apply" | "view";
type ApplyStep = "walletAddress" | "nickname" | "contactType" | "contactValue" | "confirm";
type ViewStep = "walletAddress";
type FormStep = ApplyStep | ViewStep;

type ApplyDraft = {
  walletAddress: string;
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

const MENU_ITEMS = ["read manifesto", "apply for og hackathon", "attend ETHPrague 2026"] as const;

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

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function validateContact(type: ContactType, value: string): boolean {
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (type === "telegram") return /^@?[a-zA-Z0-9_]{5,32}$/.test(value);
  return /^([+][0-9]{7,15}|[a-zA-Z0-9_.-]{3,64})$/.test(value);
}

function isValidAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

const EMPTY_DRAFT: ApplyDraft = {
  walletAddress: "",
  nickname: "",
  contactType: null,
  contactValue: "",
};

export function CliTerminal() {
  const [lines, setLines] = useState<string[]>(INITIAL_LINES);
  const [mode, setMode] = useState<Mode>("menu");
  const [menuIndex, setMenuIndex] = useState(0);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [formStep, setFormStep] = useState<FormStep>("walletAddress");
  const [draft, setDraft] = useState<ApplyDraft>(EMPTY_DRAFT);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const appendLine = (line: string) => setLines((c) => [...c, line]);
  const appendLines = (next: string[]) => setLines((c) => [...c, ...next]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    if (mode === "form") {
      inputRef.current?.focus();
    }
  }, [mode, formStep]);

  const returnToMenu = () => {
    setMode("menu");
    setFlow(null);
    setDraft(EMPTY_DRAFT);
    setInputValue("");
  };

  // ── Menu keyboard navigation ──────────────────────────────────────────────

  const handleMenuSelect = useCallback(
    async (index: number) => {
      const selected = MENU_ITEMS[index];
      appendLine(`> ${selected}`);

      if (selected === "read manifesto") {
        appendLines(MANIFESTO_LINES);
        return;
      }

      if (selected === "apply for og hackathon") {
        setDraft(EMPTY_DRAFT);
        setFlow("apply");
        setFormStep("walletAddress");
        setMode("form");
        appendLines(["", "Starting application. Type `cancel` at any time to abort.", "", "Enter your wallet address:"]);
        return;
      }

      if (selected === "attend ETHPrague 2026") {
        appendLine("Opening ETHPrague...");
        window.open("https://ethprague.com/", "_blank", "noopener,noreferrer");
        return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (mode !== "menu") return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenuIndex((i) => (i - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenuIndex((i) => (i + 1) % MENU_ITEMS.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleMenuSelect(menuIndex);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, menuIndex, handleMenuSelect]);

  // ── Apply form steps ──────────────────────────────────────────────────────

  const handleApplyStep = async (value: string) => {
    if (formStep === "walletAddress") {
      if (!isValidAddress(value)) {
        appendLine("Invalid address. Must be a 0x-prefixed Ethereum address.");
        return;
      }
      setDraft((d) => ({ ...d, walletAddress: value }));
      setFormStep("nickname");
      appendLines(["", "Enter a nickname:"]);
      return;
    }

    if (formStep === "nickname") {
      if (value.length < 2 || value.length > 64) {
        appendLine("Nickname must be between 2 and 64 characters.");
        return;
      }
      setDraft((d) => ({ ...d, nickname: value }));
      setFormStep("contactType");
      appendLines(["", "Choose a contact method:", "  telegram | email | signal", ""]);
      return;
    }

    if (formStep === "contactType") {
      const ct = value.toLowerCase() as ContactType;
      if (!["telegram", "email", "signal"].includes(ct)) {
        appendLine("Please enter: telegram, email, or signal");
        return;
      }
      setDraft((d) => ({ ...d, contactType: ct }));
      setFormStep("contactValue");
      const hint =
        ct === "telegram" ? "(e.g. @username)" :
        ct === "email"    ? "(e.g. you@example.com)" :
                            "(e.g. +1234567890)";
      appendLines(["", `Enter your ${ct} handle ${hint}:`]);
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
      appendLines([
        "",
        "Review your application:",
        `  wallet     ${truncateAddress(draft.walletAddress)}`,
        `  nickname   ${draft.nickname}`,
        `  contact    ${draft.contactType}: ${value}`,
        "",
        "Submit? yes / no",
        "",
      ]);
      return;
    }

    if (formStep === "confirm") {
      const v = value.toLowerCase();
      if (v === "no" || v === "n") { returnToMenu(); appendLine("Application canceled."); return; }
      if (v !== "yes" && v !== "y") { appendLine("Please type yes or no."); return; }

      setIsProcessing(true);
      try {
        const response = await fetch("/api/application", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: draft.walletAddress,
            nickname: draft.nickname,
            contactType: draft.contactType,
            contactValue: draft.contactValue,
          }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Failed to save application");

        appendLines(["", "✓ Application saved. Welcome to the OGs.", ""]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save application";
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
    if (formStep === "walletAddress") {
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
        const message = error instanceof Error ? error.message : "Lookup failed";
        appendLine(message);
      } finally {
        setIsProcessing(false);
        returnToMenu();
      }
    }
  };

  // ── Form submit handler ───────────────────────────────────────────────────

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isProcessing) return;

    const value = inputValue.trim();
    setInputValue("");

    if (value.toLowerCase() === "cancel") {
      appendLine("Application canceled.");
      returnToMenu();
      return;
    }

    if (!value) {
      appendLine("Input required. Type `cancel` to abort.");
      return;
    }

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
            {MENU_ITEMS.map((item, i) => (
              <div
                key={item}
                className={`py-0.5 ${i === menuIndex ? "text-[#D5FFD5]" : "text-[#5B985B]"}`}
              >
                {i === menuIndex ? "▶ " : "  "}{item}
              </div>
            ))}
          </nav>
        )}

        {mode === "form" && (
          <footer className="border-t border-[#2B5D2B] px-4 py-3">
            <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
              <span className="text-[#5B985B]">›</span>
              <input
                ref={inputRef}
                className="w-full bg-transparent text-[#D5FFD5] outline-none placeholder:text-[#2B5D2B] disabled:opacity-40"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isProcessing ? "processing..." : "type response or `cancel`..."}
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
