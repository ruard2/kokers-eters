export function adminToken() {
  return process.env.ADMIN_TOKEN || "dev-admin";
}

export function isAdminKey(value: string | undefined | null) {
  return Boolean(value && value === adminToken());
}
