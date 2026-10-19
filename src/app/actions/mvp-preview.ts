"use server";

import { cookies } from "next/headers";

export async function acknowledgeMvpPreview() {
  const cookieStore = await cookies();
  cookieStore.set("batasgo_mvp_preview_seen", "1", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
