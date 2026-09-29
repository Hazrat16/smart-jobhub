import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    // Structured server log for client errors (Sentry/Datadog bridge point).
    console.error(
      JSON.stringify({
        level: "error",
        event: "client_error",
        timestamp: new Date().toISOString(),
        payload,
      }),
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
