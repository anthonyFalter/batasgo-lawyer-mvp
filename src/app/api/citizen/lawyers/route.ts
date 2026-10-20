import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { citizenLawyerProfiles } from "@/lib/db/schema";
import { assertCitizenFeatureEnabled } from "@/lib/admin/features";
import {
  authenticateCitizenApiRequest,
  citizenApiJson,
  citizenApiOptions,
} from "@/lib/citizen/api";

export async function OPTIONS(request: Request) {
  return citizenApiOptions(request);
}

export async function GET(request: Request) {
  const result = await authenticateCitizenApiRequest(request);
  if ("response" in result) return result.response;
  const featureDisabled = await assertCitizenFeatureEnabled(request, "citizenDirectoryEnabled");
  if (featureDisabled) return featureDisabled;
  if (result.actor.kind !== "citizen") {
    return citizenApiJson(request, { error: "Citizen authentication is required." }, { status: 403 });
  }

  try {
    const profiles = await db
      .select({
        id: citizenLawyerProfiles.workspaceId,
        displayName: citizenLawyerProfiles.displayName,
        specialty: citizenLawyerProfiles.specialty,
        bio: citizenLawyerProfiles.bio,
      })
      .from(citizenLawyerProfiles)
      .where(eq(citizenLawyerProfiles.listed, true))
      .orderBy(asc(citizenLawyerProfiles.displayName))
      .limit(100);

    return citizenApiJson(request, {
      lawyers: profiles.map((profile) => ({
        ...profile,
        verificationStatus: "not_verified" as const,
      })),
    });
  } catch (error) {
    console.error("Could not load citizen lawyer profiles.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request, { error: "Lawyer directory is unavailable right now." }, { status: 500 });
  }
}
