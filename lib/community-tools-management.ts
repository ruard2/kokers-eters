import { createHash, timingSafeEqual } from "node:crypto";

export function verifyCommunityToolsManagementRequest(request: Request) {
  if (process.env.COMMUNITY_TOOLS_MANAGEMENT_ENABLED !== "true") return false;

  const expected = process.env.COMMUNITY_TOOLS_MANAGEMENT_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;

  const received = authorization.slice("Bearer ".length);
  const expectedDigest = createHash("sha256").update(expected).digest();
  const receivedDigest = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedDigest, receivedDigest);
}
