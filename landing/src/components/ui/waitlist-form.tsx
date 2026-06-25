"use client";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok || data.message === "Already joined") {
        setStatus("success");
        setMessage(data.message === "Already joined" ? "You're already on the list." : "You're on the list!");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">
        <Check className="size-4" />
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-1.5 shadow-card-soft focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="min-w-0 flex-1 bg-transparent px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-azure-600 disabled:opacity-60"
        >
          {status === "loading" ? "Joining…" : "Notify me"}
          {status !== "loading" && <ArrowRight className="size-3.5" />}
        </button>
      </div>
      {status === "error" && <p className="mt-2 text-xs text-destructive">{message}</p>}
    </form>
  );
}
