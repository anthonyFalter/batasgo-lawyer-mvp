import "server-only";

import { auth, verifyToken } from "@clerk/nextjs/server";
import { z } from "zod";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";

export type CitizenApiActor =
  | { kind: "citizen"; citizenId: string }
  | { kind: "lawyer"; clerkUserId: string; workspaceId: string };

function configuredCitizenOrigins() {
  return (process.env.CITIZEN_APP_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

export function citizenApiHeaders(request: Request, additional?: HeadersInit) {
  const origin = request.headers.get("origin");
  const allowedOrigins = configuredCitizenOrigins();
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
  });

  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }

  new Headers(additional).forEach((value, key) => headers.set(key, value));
  return headers;
}

export function citizenApiJson(
  request: Request,
  body: unknown,
  init: ResponseInit = {},
) {
  const headers = citizenApiHeaders(request, init.headers);
  return Response.json(body, { ...init, headers });
}

export function citizenApiOptions(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = configuredCitizenOrigins();
  if (!origin || !allowedOrigins.includes(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: citizenApiHeaders(request) });
}

function isJwtVerificationError(error: unknown) {
  return error instanceof Error && error.name.includes("Token");
}

export async function authenticateCitizenApiRequest(
  request: Request,
): Promise<{ actor: CitizenApiActor } | { response: Response }> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    const requestOrigin = request.headers.get("origin");
    const allowedOrigins = configuredCitizenOrigins();
    if (!token || !requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      return { response: citizenApiJson(request, { error: "Citizen app origin is not allowed." }, { status: 403 }) };
    }

    const jwtKey = process.env.CITIZEN_CLERK_JWT_KEY?.replace(/\\n/g, "\n");
    if (!jwtKey) {
      return {
        response: citizenApiJson(request, { error: "Citizen authentication is not configured on this service." }, { status: 503 }),
      };
    }

    try {
      const result = await verifyToken(token, {
        jwtKey,
        authorizedParties: allowedOrigins,
      });
      const claims = z.object({ sub: z.string().min(1) }).safeParse(result);
      if (!claims.success) {
        return { response: citizenApiJson(request, { error: "Citizen authentication is required." }, { status: 401 }) };
      }
      return { actor: { kind: "citizen", citizenId: claims.data.sub } };
    } catch (error) {
      if (!isJwtVerificationError(error)) {
        console.error("Citizen access-token verification failed.", error instanceof Error ? error.name : "UnknownError");
      }
      return { response: citizenApiJson(request, { error: "Citizen authentication is required." }, { status: 401 }) };
    }
  }

  const { userId } = await auth();
  if (!userId) {
    return { response: citizenApiJson(request, { error: "Authentication required." }, { status: 401 }) };
  }

  try {
    const workspaceId = await getOrCreatePersonalWorkspace(userId);
    return { actor: { kind: "lawyer", clerkUserId: userId, workspaceId } };
  } catch (error) {
    console.error("Could not resolve the lawyer workspace for citizen messaging.", error instanceof Error ? error.name : "UnknownError");
    return { response: citizenApiJson(request, { error: "Unable to resolve the lawyer workspace." }, { status: 500 }) };
  }
}
