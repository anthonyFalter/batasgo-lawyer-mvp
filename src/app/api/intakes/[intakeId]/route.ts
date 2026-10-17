import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { intakes } from "@/lib/db/schema";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { intakeStatusSchema, isSameOriginRequest } from "@/lib/intakes/validation";
import { toIntakeDTO } from "@/lib/intakes/service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ intakeId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const { intakeId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intakeId)) {
    return Response.json({ error: "Intake was not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = intakeStatusSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Intake status must be pending, accepted, or declined." }, { status: 400 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const [updated] = await db
      .update(intakes)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(intakes.id, intakeId), eq(intakes.workspaceId, workspaceId)))
      .returning();

    if (!updated) return Response.json({ error: "Intake was not found." }, { status: 404 });
    return Response.json({ intake: toIntakeDTO(updated) });
  } catch (error) {
    console.error("Could not update workspace intake.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to update this intake right now." }, { status: 500 });
  }
}
