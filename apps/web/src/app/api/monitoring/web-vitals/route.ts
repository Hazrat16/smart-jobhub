import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    // Structured server log for web-vitals ingestion (Sentry/Datadog bridge point).
    console.log(
      JSON.stringify({
        level: "info",
        event: "web_vitals",
        timestamp: new Date().toISOString(),
        payload,
      }),
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
