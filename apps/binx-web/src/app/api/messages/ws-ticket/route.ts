/**
 * route.ts - Messaging Websocket Ticket
 *
 * Mints a short-lived ticket the browser passes on the messaging websocket
 * handshake. The bearer token lives in an httpOnly cookie the browser's JS
 * can't read (and can't attach to a cross-origin WS connection anyway), so
 * this reads it server-side, trades it with binx-api for a single-purpose
 * ticket, and hands that back.
 *
 * @module apps/binx-web/src/app/api/messages/ws-ticket/route.ts
 * @route POST /api/messages/ws-ticket
 */
import { NextResponse } from "next/server";

import { AuthApiError } from "@/lib/auth";
import { getWsTicket } from "@/lib/messaging";

export async function POST() {
  try {
    const ticket = await getWsTicket();
    return NextResponse.json({ ticket }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Unable to open a live connection" }, { status: 500 });
  }
}
