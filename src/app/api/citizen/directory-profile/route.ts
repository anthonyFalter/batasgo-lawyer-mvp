import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { citizenLawyerProfiles } from "@/lib/db/schema";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { isSameOriginRequest } from "@/lib/intakes/validation";
import { citizenLawyerProfileSchema } from "@/lib/citizen/validation";

const FALLBACK_NAME = "BatasGO lawyer";

/** The lawyer's public identity always comes from their Clerk account so it stays connected. */
async function getClerkIdentity() {
  const user = await currentUser();
  if (!user) return null;
  const email = user.primaryEmailAddress?.emailAddress ?? null;
  const name = (user.fullName ?? user.username ?? email?.split("@")[0] ?? "").trim();
  return { displayName: name, email, imageUrl: user.imageUrl };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });

  try {
    const identity = await getClerkIdentity();
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const [stored] = await db
      .select({
        displayName: citizenLawyerProfiles.displayName,
        specialty: citizenLawyerProfiles.specialty,
        bio: citizenLawyerProfiles.bio,
        listed: citizenLawyerProfiles.listed,
      })
      .from(citizenLawyerProfiles)
      .where(eq(citizenLawyerProfiles.workspaceId, workspaceId))
      .limit(1);

    let profile = stored ?? null;
    const clerkName = identity?.displayName ?? "";
    if (profile && clerkName.length >= 2 && profile.displayName !== clerkName) {
      // Keep the stored (citizen-visible) name in sync with Clerk.
      await db
        .update(citizenLawyerProfiles)
        .set({ displayName: clerkName, updatedAt: new Date() })
        .where(eq(citizenLawyerProfiles.workspaceId, workspaceId));
      profile = { ...profile, displayName: clerkName };
    }

    return Response.json({ profile, identity }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load lawyer citizen-directory profile.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to load this profile right now." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = citizenLawyerProfileSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Specialty is required (at least 2 characters).", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const identity = await getClerkIdentity();
    const clerkName = identity?.displayName ?? "";
    if (parsed.data.listed && clerkName.length < 2) {
      return Response.json({ error: "Add your name to your account before listing your profile." }, { status: 400 });
    }
    const displayName = clerkName.length >= 2 ? clerkName : FALLBACK_NAME;
    const values = { ...parsed.data, displayName };

    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const [profile] = await db
      .insert(citizenLawyerProfiles)
      .values({ ...values, workspaceId, clerkUserId: userId })
      .onConflictDoUpdate({
        target: citizenLawyerProfiles.workspaceId,
        set: { ...values, clerkUserId: userId, updatedAt: new Date() },
      })
      .returning({
        displayName: citizenLawyerProfiles.displayName,
        specialty: citizenLawyerProfiles.specialty,
        bio: citizenLawyerProfiles.bio,
        listed: citizenLawyerProfiles.listed,
      });

    return Response.json({ profile, identity }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not save lawyer citizen-directory profile.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to save this profile right now." }, { status: 500 });
  }
}
