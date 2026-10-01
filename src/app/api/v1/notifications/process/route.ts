import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { processNotificationQueue } from "@/lib/services/push";

// Called by a scheduler (Coolify scheduled task) to retry anything that did
// not go out first time. Protected by CRON_SECRET.
export async function POST(req: NextRequest) {
  try {
    const given = Buffer.from(req.headers.get("x-cron-secret") ?? "");
    const want = Buffer.from(config.cronSecret);
    if (!want.length || given.length !== want.length || !timingSafeEqual(given, want)) {
      return NextResponse.json({ error: { code: "forbidden", message: "Not allowed." } }, { status: 403 });
    }
    return NextResponse.json(await processNotificationQueue(200));
  } catch (e) {
    return errorResponse(e);
  }
}
