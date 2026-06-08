"use client";
import { useState } from "react";
import { Input } from "./input";
import { Button } from "./button";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    if (res.ok || data.message === "Already joined") {
      setStatus("success");
      setMessage(data.message);
      setEmail("");
    } else {
      setStatus("error");
      setMessage(data.error);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <form onSubmit={handleSubmit} className="flex flex-row items-center w-full sm:w-auto gap-0">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="border-2 border-r-0 border-secondary/20 bg-white/90 text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xl w-full sm:w-56 px-4 py-5 text-xl rounded-none rounded-l-md"
        />
        <Button
          type="submit"
          disabled={status === "loading"}
          className="rounded-none rounded-r-md px-5 py-5 font-medium border-2 border-primary/20 border-l-0 shadow-xl hover:shadow-2xl transition-all duration-300 bg-primary text-white hover:bg-primary/90"
        >
          {status === "loading"
            ? "Joining..."
            : status === "success" && message === "Success"
            ? "Joined!"
            : status === "success" && message === "Already joined"
            ? "Already joined"
            : status === "error" && message === "Too many requests"
            ? "Too many requests"
            : status === "error" && message === "Server error"
            ? "Server error"
            : status === "error"
            ? "Try Again"
            : "Join Waitlist"}
        </Button>
      </form>
    </div>
  );
}
