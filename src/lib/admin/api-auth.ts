import { createHash, timingSafeEqual } from "node:crypto";

export function authorizeAdminRequest(request: Request) {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json({ error: "Admin API is not configured." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const expectedDigest = createHash("sha256").update(secret).digest();
  const suppliedDigest = createHash("sha256").update(suppliedSecret).digest();

  if (!suppliedSecret || !timingSafeEqual(expectedDigest, suppliedDigest)) {
    return Response.json({ error: "Admin authorization required." }, { status: 401 });
  }
  return null;
}
