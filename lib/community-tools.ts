type CommunityToolsContext = {
  user: { id: string; email: string; name?: string };
  organization: { id: string; name: string };
  membership: { role: string };
  product: { code: string };
};

export function communityToolsEnabled() {
  return process.env.COMMUNITY_TOOLS_SSO_ENABLED === "true";
}

export async function exchangeCommunityToolsTicket(
  ticket: string
): Promise<CommunityToolsContext> {
  if (!communityToolsEnabled()) {
    throw new Error("Community Tools SSO is uitgeschakeld.");
  }
  if (!ticket.startsWith("ctt_") || ticket.length > 200) {
    throw new Error("Ongeldig Community Tools-ticket.");
  }

  const baseUrl = required("COMMUNITY_TOOLS_URL").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/integrations/exchange`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("COMMUNITY_TOOLS_CLIENT_SECRET")}`,
      "Content-Type": "application/json",
      "X-Community-Tools-Client": required("COMMUNITY_TOOLS_CLIENT_ID")
    },
    body: JSON.stringify({ ticket }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error("Community Tools heeft toegang geweigerd.");

  const context = (await response.json()) as CommunityToolsContext;
  if (
    context.product?.code !== "shared_meals" ||
    !context.user?.id ||
    !context.user?.email ||
    !context.organization?.id ||
    !context.organization?.name ||
    !["owner", "admin"].includes(context.membership?.role)
  ) {
    throw new Error("Onvolledige Community Tools-context.");
  }
  return context;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} ontbreekt.`);
  return value;
}
