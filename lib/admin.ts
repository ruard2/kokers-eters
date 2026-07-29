import { createHmac, timingSafeEqual } from "node:crypto";

export function adminToken() {
  return process.env.ADMIN_TOKEN || "dev-admin";
}

export function isAdminKey(value: string | undefined | null) {
  return Boolean(resolveAdminContext(value));
}

export type AdminContext = {
  key: string;
  organizationId: string | null;
  communityToolsUserId: string | null;
};

export function resolveAdminContext(
  value: string | undefined | null
): AdminContext | null {
  if (!value) return null;
  if (value === adminToken()) {
    return { key: value, organizationId: null, communityToolsUserId: null };
  }
  if (!value.startsWith("ctadmin_")) return null;

  const [payload, signature] = value.slice("ctadmin_".length).split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { organizationId?: string; userId?: string; expiresAt?: number };
    if (
      !parsed.organizationId ||
      !parsed.userId ||
      !parsed.expiresAt ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return {
      key: value,
      organizationId: parsed.organizationId,
      communityToolsUserId: parsed.userId
    };
  } catch {
    return null;
  }
}

export function createCommunityToolsAdminKey(input: {
  organizationId: string;
  userId: string;
}) {
  const payload = Buffer.from(
    JSON.stringify({
      organizationId: input.organizationId,
      userId: input.userId,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000
    })
  ).toString("base64url");
  return `ctadmin_${payload}.${sign(payload)}`;
}

function sign(payload: string) {
  const secret =
    process.env.COMMUNITY_TOOLS_SESSION_SECRET ||
    process.env.COMMUNITY_TOOLS_CLIENT_SECRET;
  if (!secret || secret.length < 32) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function demoSeedEnabled() {
  return process.env.ALLOW_DEMO_SEED === "true";
}
