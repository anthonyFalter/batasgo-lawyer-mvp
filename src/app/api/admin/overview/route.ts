import { count, eq } from "drizzle-orm";
import { authorizeAdminRequest } from "@/lib/admin/api-auth";
import { db } from "@/lib/db/client";
import {
  citizenConversations,
  citizenHandoffAttachments,
  citizenJournalHandoffs,
  citizenLawyerProfiles,
  citizenMessages,
  intakes,
  workspaces,
} from "@/lib/db/schema";

export async function GET(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const [
      [workspaceCount],
      [lawyerProfileCount],
      [listedLawyerCount],
      [conversationCount],
      [messageCount],
      [handoffCount],
      [attachmentCount],
      [sampleIntakeCount],
    ] = await Promise.all([
      db.select({ count: count() }).from(workspaces),
      db.select({ count: count() }).from(citizenLawyerProfiles),
      db.select({ count: count() }).from(citizenLawyerProfiles).where(eq(citizenLawyerProfiles.listed, true)),
      db.select({ count: count() }).from(citizenConversations),
      db.select({ count: count() }).from(citizenMessages),
      db.select({ count: count() }).from(citizenJournalHandoffs),
      db.select({ count: count() }).from(citizenHandoffAttachments),
      db.select({ count: count() }).from(intakes).where(eq(intakes.isSample, true)),
    ]);
    return Response.json({
      counts: {
        lawyerWorkspaces: workspaceCount.count,
        lawyerProfiles: lawyerProfileCount.count,
        discoverableLawyers: listedLawyerCount.count,
        conversations: conversationCount.count,
        messages: messageCount.count,
        journalHandoffs: handoffCount.count,
        handoffAttachments: attachmentCount.count,
        syntheticIntakes: sampleIntakeCount.count,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin overview query failed.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to load the admin overview." }, { status: 500 });
  }
}
