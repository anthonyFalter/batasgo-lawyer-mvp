import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { intakes } from "@/lib/db/schema";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { getRiskFromScore, suggestIntakeDetails } from "@/lib/intakes/triage";
import { intakeCreateSchema, isSameOriginRequest } from "@/lib/intakes/validation";
import { listWorkspaceIntakes, toIntakeDTO } from "@/lib/intakes/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });

  try {
    const intakeList = await listWorkspaceIntakes(userId);
    return Response.json({ intakes: intakeList }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load workspace intakes.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to load intakes right now." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 20_000) {
    return Response.json({ error: "Intake request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = intakeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Intake details are invalid.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    const suggestions = suggestIntakeDetails(
      parsed.data.title,
      parsed.data.description,
    );
    const client = parsed.data.title || "Untitled intake";
    const summary = parsed.data.description || "Details pending lawyer review.";
    const score = parsed.data.priorityScore !== undefined ? parsed.data.priorityScore : suggestions.score;
    const risk = getRiskFromScore(score);
    const [created] = await db
      .insert(intakes)
      .values({
        workspaceId,
        reference: `INTAKE-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        domain: parsed.data.domain || suggestions.specialty,
        risk: risk === "Critical"
          ? "critical"
          : risk === "High" ? "high" : risk === "Unassessed" ? "unassessed" : "medium",
        client,
        summary,
        deadlineAt: parsed.data.deadlineAt
          ? new Date(`${parsed.data.deadlineAt}T12:00:00.000Z`)
          : null,
        caseStage: parsed.data.caseStage,
        urgencyFlags: parsed.data.urgencyFlags,
        priorityScore: score,
        documents: parsed.data.documents,
        isSample: false,
      })
      .returning();

    return Response.json({ intake: toIntakeDTO(created) }, { status: 201 });
  } catch (error) {
    console.error("Could not create workspace intake.", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Unable to save this intake right now." }, { status: 500 });
  }
}
