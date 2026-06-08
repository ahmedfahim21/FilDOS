import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const RATE_LIMIT_WINDOW = 20 * 1000;
const recentSubmissions = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const now = Date.now();

    // Basic rate limiting
    const last = recentSubmissions.get(ip);
    if (last && now - last < RATE_LIMIT_WINDOW) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    recentSubmissions.set(ip, now);

    // Check for duplicate
    const { data: existing, error: selectError } = await supabase
      .from("waitlist")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (selectError) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ message: "Already joined" }, { status: 200 });
    }

    const { error: insertError } = await supabase.from("waitlist").insert([{ email }]);
    if (insertError) {
      if (insertError.code === "23505") {
        // Duplicate key error from Supabase/Postgres
        return NextResponse.json({ message: "Already joined" }, { status: 200 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
