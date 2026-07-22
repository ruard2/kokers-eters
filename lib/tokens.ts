import { randomBytes } from "crypto";

export function createToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}
