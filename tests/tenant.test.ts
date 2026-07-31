import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCommunityToolsAdminKey,
  resolveAdminContext
} from "../lib/admin";
import { verifyCommunityToolsManagementRequest } from "../lib/community-tools-management";

const root = new URL("../", import.meta.url);

test("legacy and Community Tools admin contexts stay distinct", () => {
  process.env.ADMIN_TOKEN = "legacy-secret";
  process.env.COMMUNITY_TOOLS_SESSION_SECRET = "x".repeat(48);

  const centralKey = createCommunityToolsAdminKey({
    organizationId: "organization-a",
    userId: "user-a"
  });
  assert.deepEqual(resolveAdminContext("legacy-secret"), {
    key: "legacy-secret",
    organizationId: null,
    communityToolsUserId: null
  });
  assert.equal(
    resolveAdminContext(centralKey)?.organizationId,
    "organization-a"
  );
  assert.equal(resolveAdminContext(`${centralKey}tampered`), null);
});

test("admin reads and mutations are organization scoped", async () => {
  const [page, actions, automation, matching, reassign] = await Promise.all([
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
    readFile(new URL("app/actions.ts", root), "utf8"),
    readFile(new URL("lib/automation.ts", root), "utf8"),
    readFile(new URL("lib/matching.ts", root), "utf8"),
    readFile(
      new URL("app/api/admin/matches/reassign/route.ts", root),
      "utf8"
    )
  ]);

  assert.match(page, /where: \{ organizationId \}/);
  assert.match(actions, /admin\.organizationId/);
  assert.match(automation, /round: \{ organizationId \}/);
  assert.match(matching, /round: \{ month: \{ lt: month \}, organizationId \}/);
  assert.match(reassign, /round: \{ organizationId: admin\.organizationId \}/);
});

test("Community Tools callback only accepts the shared meals product", async () => {
  const integration = await readFile(
    new URL("lib/community-tools.ts", root),
    "utf8"
  );
  const callback = await readFile(
    new URL("app/api/community-tools/sso/route.ts", root),
    "utf8"
  );

  assert.match(integration, /context\.product\?\.code !== "shared_meals"/);
  assert.match(integration, /\["owner", "admin"\]/);
  assert.match(integration, /COMMUNITY_TOOLS_SSO_ENABLED/);
  assert.match(callback, /communityToolsAccount\.upsert/);
  assert.match(callback, /createCommunityToolsAdminKey/);
  assert.match(callback, /appUrl\(`\/\?key=/);
  assert.doesNotMatch(callback, /new URL\([^)]*request\.url/);
});

test("management directory is independently opt-in and bearer protected", () => {
  process.env.COMMUNITY_TOOLS_MANAGEMENT_ENABLED = "true";
  process.env.COMMUNITY_TOOLS_MANAGEMENT_SECRET = "management-secret";
  assert.equal(
    verifyCommunityToolsManagementRequest(
      new Request("https://example.test", {
        headers: { authorization: "Bearer management-secret" }
      })
    ),
    true
  );
  assert.equal(
    verifyCommunityToolsManagementRequest(
      new Request("https://example.test", {
        headers: { authorization: "Bearer wrong" }
      })
    ),
    false
  );
});

test("management directory exposes accounts but not meal participants", async () => {
  const route = await readFile(
    new URL(
      "app/api/community-tools/v1/organizations/[organizationId]/users/route.ts",
      root
    ),
    "utf8"
  );
  assert.match(route, /include: \{\s*accounts:/);
  assert.doesNotMatch(route, /participant\.findMany|participants:/);
  assert.match(route, /communityToolsId: organizationId/);
});
