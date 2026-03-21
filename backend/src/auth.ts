import crypto from "node:crypto";
import type { LoginRequest, LoginResponse } from "./types.js";

interface UserCredential {
  username: string;
  passwordHash: string;
  salt: string;
}

const TOKEN_TTL_SECONDS = 60 * 60;
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

function hashPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("hex");
}

function createToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const demoSalt = "starpaper-demo-salt";
const demoUsers: UserCredential[] = [
  {
    username: "Admin",
    passwordHash: hashPassword("admin123", demoSalt),
    salt: demoSalt
  }
];

export function validateLoginPayload(payload: unknown): payload is LoginRequest {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.username === "string" &&
    candidate.username.trim().length > 0 &&
    typeof candidate.password === "string" &&
    candidate.password.length > 0
  );
}

export function authenticate(input: LoginRequest): LoginResponse | null {
  const username = input.username.trim();
  const user = demoUsers.find((entry) => entry.username === username);
  if (!user) return null;

  const receivedHash = hashPassword(input.password, user.salt);
  if (receivedHash !== user.passwordHash) return null;

  return {
    accessToken: createToken(),
    tokenType: "Bearer",
    expiresInSeconds: TOKEN_TTL_SECONDS,
    username
  };
}
