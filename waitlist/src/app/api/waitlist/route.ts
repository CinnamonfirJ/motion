import { NextResponse, type NextRequest } from "next/server";
import { count, join, parseSignup } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

// Best-effort per-IP limit. It lives in process memory, so on multi-instance or serverless
// hosts each instance counts separately; put a CDN/WAF rule in front for a hard limit.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, { count: number; resetAt: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 5_000) for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function GET() {
  try {
    return NextResponse.json({ count: await count() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("waitlist count failed", error);
    return NextResponse.json({ error: "waitlist-unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (limited(clientIp(req))) return NextResponse.json({ error: "rate-limited" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = parseSignup(body);
  // Pretend success to bots so they don't adapt.
  if (parsed.kind === "bot") return NextResponse.json({ ok: true }, { status: 201 });
  if (parsed.kind === "invalid") return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await join(parsed);
    return NextResponse.json(result, { status: result.already ? 200 : 201 });
  } catch (error) {
    console.error("waitlist join failed", error);
    return NextResponse.json({ error: "waitlist-unavailable" }, { status: 503 });
  }
}
