import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { createSessionClient, currentViewer } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Telegram chat ids are numeric (negative for groups). Validating the shape
 *  keeps obvious junk out of the worker's send loop. */
const CHAT_ID = /^-?\d{5,20}$/;

export async function POST(request: Request) {
  const viewer = await currentViewer();
  const client = createSessionClient();
  if (!viewer || !client) {
    return NextResponse.json({ error: "Sign in to set up notifications." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    telegramChatId?: string | null;
    enabled?: boolean;
  } | null;

  const raw = (body?.telegramChatId ?? "").toString().trim();
  const chatId = raw === "" ? null : raw;
  if (chatId !== null && !CHAT_ID.test(chatId)) {
    return NextResponse.json(
      { error: "That does not look like a Telegram chat id. Message the bot and use the number it reports." },
      { status: 422 }
    );
  }

  const { error } = await client.from("notification_settings").upsert(
    {
      owner_id: viewer.id,
      telegram_chat_id: chatId,
      enabled: body?.enabled ?? true,
      updated_at: new Date().toISOString()
    },
    { onConflict: "owner_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/watchlist");
  return NextResponse.json({ ok: true });
}
