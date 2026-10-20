import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { citizenApiJson } from "@/lib/citizen/api";
import { adminFeatureSettings } from "@/lib/db/schema";

export type AdminFeatureSettings = {
  citizenDirectoryEnabled: boolean;
  citizenMessagingEnabled: boolean;
  journalHandoffsEnabled: boolean;
};

export const defaultAdminFeatureSettings: AdminFeatureSettings = {
  citizenDirectoryEnabled: true,
  citizenMessagingEnabled: true,
  journalHandoffsEnabled: true,
};

export async function getAdminFeatureSettings(): Promise<AdminFeatureSettings> {
  const [settings] = await db
    .select({
      citizenDirectoryEnabled: adminFeatureSettings.citizenDirectoryEnabled,
      citizenMessagingEnabled: adminFeatureSettings.citizenMessagingEnabled,
      journalHandoffsEnabled: adminFeatureSettings.journalHandoffsEnabled,
    })
    .from(adminFeatureSettings)
    .where(eq(adminFeatureSettings.id, "default"))
    .limit(1);
  return settings ?? defaultAdminFeatureSettings;
}

export async function assertCitizenFeatureEnabled(request: Request, feature: keyof AdminFeatureSettings) {
  try {
    const settings = await getAdminFeatureSettings();
    if (settings[feature]) return null;
    return citizenApiJson(request,
      { error: "This feature is paused by the BatasGO demo administrator." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Could not check citizen feature setting.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request,
      { error: "Feature availability could not be checked. Please try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
