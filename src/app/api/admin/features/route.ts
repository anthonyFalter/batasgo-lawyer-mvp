import { eq } from "drizzle-orm";
import { z } from "zod";
import { authorizeAdminRequest } from "@/lib/admin/api-auth";
import { db } from "@/lib/db/client";
import { adminFeatureSettings } from "@/lib/db/schema";
import { defaultAdminFeatureSettings } from "@/lib/admin/features";

const updateFeaturesSchema = z.object({
  citizenDirectoryEnabled: z.boolean(),
  citizenMessagingEnabled: z.boolean(),
  journalHandoffsEnabled: z.boolean(),
});

export async function GET(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const [settings] = await db
      .select()
      .from(adminFeatureSettings)
      .where(eq(adminFeatureSettings.id, "default"))
      .limit(1);
    return Response.json({ features: settings ?? defaultAdminFeatureSettings }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Admin feature settings query failed.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to load feature controls. Apply the lawyer app database migrations." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) return unauthorized;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = updateFeaturesSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "All feature settings must be boolean values." }, { status: 400 });

  try {
    const [features] = await db
      .insert(adminFeatureSettings)
      .values({ id: "default", ...parsed.data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: adminFeatureSettings.id,
        set: { ...parsed.data, updatedAt: new Date() },
      })
      .returning();
    return Response.json({ features }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin feature settings update failed.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to update feature controls. Apply the lawyer app database migrations." }, { status: 503 });
  }
}
