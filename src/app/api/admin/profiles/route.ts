import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { authorizeAdminRequest } from "@/lib/admin/api-auth";
import { db } from "@/lib/db/client";
import { citizenLawyerProfiles, workspaces } from "@/lib/db/schema";

const updateProfileSchema = z.object({
  workspaceId: z.string().uuid(),
  listed: z.boolean().optional(),
  specialty: z.string().trim().min(1).max(160).optional(),
  bio: z.string().trim().max(1200).optional(),
}).refine(
  ({ listed, specialty, bio }) => listed !== undefined || specialty !== undefined || bio !== undefined,
  "At least one profile field must be provided.",
);

export async function GET(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const profiles = await db
      .select({
        workspaceId: citizenLawyerProfiles.workspaceId,
        clerkUserId: citizenLawyerProfiles.clerkUserId,
        displayName: citizenLawyerProfiles.displayName,
        specialty: citizenLawyerProfiles.specialty,
        bio: citizenLawyerProfiles.bio,
        listed: citizenLawyerProfiles.listed,
        updatedAt: citizenLawyerProfiles.updatedAt,
        workspaceName: workspaces.name,
      })
      .from(citizenLawyerProfiles)
      .leftJoin(workspaces, eq(workspaces.id, citizenLawyerProfiles.workspaceId))
      .orderBy(asc(citizenLawyerProfiles.displayName));
    return Response.json({ profiles }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin lawyer profile query failed.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to load lawyer profiles." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "A valid workspace ID and at least one valid profile field are required." }, { status: 400 });
  }

  try {
    const { workspaceId, ...updates } = parsed.data;
    const [profile] = await db
      .update(citizenLawyerProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(citizenLawyerProfiles.workspaceId, workspaceId))
      .returning({
        workspaceId: citizenLawyerProfiles.workspaceId,
        listed: citizenLawyerProfiles.listed,
        specialty: citizenLawyerProfiles.specialty,
        bio: citizenLawyerProfiles.bio,
      });
    if (!profile) return Response.json({ error: "Lawyer profile not found." }, { status: 404 });
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin lawyer profile update failed.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to update the lawyer profile." }, { status: 500 });
  }
}
