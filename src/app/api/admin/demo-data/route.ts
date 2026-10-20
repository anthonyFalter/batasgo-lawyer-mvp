import { and, eq, like } from "drizzle-orm";
import { authorizeAdminRequest } from "@/lib/admin/api-auth";
import { db } from "@/lib/db/client";
import {
  citizenConversations,
  citizenLawyerProfiles,
  citizenMessages,
} from "@/lib/db/schema";
import { encryptText } from "@/lib/citizen/message-crypto";

const SYNTHETIC_CITIZEN_PREFIX = "demo-citizen-pitch-";
const sampleMessages = [
  {
    sender: "citizen" as const,
    offsetMinutes: 3,
    text: "DEMO DATA ONLY: I would like to understand what documents are useful for a labor consultation.",
  },
  {
    sender: "lawyer" as const,
    offsetMinutes: 2,
    text: "DEMO DATA ONLY: You can describe the timeline and bring any relevant notices. Please do not share real client data in this demo.",
  },
  {
    sender: "citizen" as const,
    offsetMinutes: 0,
    text: "DEMO DATA ONLY: Understood. This synthetic conversation is here to demonstrate the messaging workflow.",
  },
];

export async function POST(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const profiles = await db
      .select({
        workspaceId: citizenLawyerProfiles.workspaceId,
        clerkUserId: citizenLawyerProfiles.clerkUserId,
        displayName: citizenLawyerProfiles.displayName,
        specialty: citizenLawyerProfiles.specialty,
      })
      .from(citizenLawyerProfiles)
      .where(eq(citizenLawyerProfiles.listed, true));
    let created = 0;

    for (const profile of profiles) {
      const citizenId = `${SYNTHETIC_CITIZEN_PREFIX}${profile.workspaceId.replaceAll("-", "")}`;
      const [conversation] = await db
        .insert(citizenConversations)
        .values({
          workspaceId: profile.workspaceId,
          citizenId,
          citizenDisplayName: encryptText("Synthetic Pitch Citizen"),
          subject: encryptText("Synthetic consultation workflow"),
          lastMessagePreview: encryptText(sampleMessages[2].text.slice(0, 240)),
        })
        .onConflictDoNothing({
          target: [citizenConversations.workspaceId, citizenConversations.citizenId],
        })
        .returning({ id: citizenConversations.id });
      if (!conversation) continue;

      const now = Date.now();
      await db.insert(citizenMessages).values(sampleMessages.map((message) => ({
        conversationId: conversation.id,
        sender: message.sender,
        senderId: message.sender === "citizen" ? citizenId : profile.clerkUserId,
        content: encryptText(message.text),
        createdAt: new Date(now - message.offsetMinutes * 60_000),
      })));
      created += 1;
    }
    return Response.json({ created, skippedExisting: profiles.length - created }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Synthetic conversation seeding failed.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to seed synthetic conversations." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const deleted = await db
      .delete(citizenConversations)
      .where(like(citizenConversations.citizenId, `${SYNTHETIC_CITIZEN_PREFIX}%`))
      .returning({ id: citizenConversations.id });
    return Response.json({ deleted: deleted.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Synthetic conversation cleanup failed.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to remove synthetic conversations." }, { status: 500 });
  }
}
