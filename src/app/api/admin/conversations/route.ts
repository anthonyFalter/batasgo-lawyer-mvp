import { count, desc, eq } from "drizzle-orm";
import { authorizeAdminRequest } from "@/lib/admin/api-auth";
import { db } from "@/lib/db/client";
import { citizenConversations, citizenMessages } from "@/lib/db/schema";

export async function GET(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const rows = await db
      .select({
        id: citizenConversations.id,
        workspaceId: citizenConversations.workspaceId,
        citizenId: citizenConversations.citizenId,
        createdAt: citizenConversations.createdAt,
        lastMessageAt: citizenConversations.lastMessageAt,
        messageCount: count(citizenMessages.id),
      })
      .from(citizenConversations)
      .leftJoin(citizenMessages, eq(citizenMessages.conversationId, citizenConversations.id))
      .groupBy(citizenConversations.id)
      .orderBy(desc(citizenConversations.lastMessageAt))
      .limit(100);
    return Response.json({
      conversations: rows.map((row) => ({
        ...row,
        synthetic: row.citizenId.startsWith("demo_citizen_pitch_"),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin conversation metadata query failed.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to load conversation metadata." }, { status: 500 });
  }
}
