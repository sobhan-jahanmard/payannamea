import crypto from "node:crypto";

import { authSecret } from "./config";
import { getDataSource } from "./db/data-source";
import { UserEntity, UserSchema } from "./db/entities";
import { ApiError } from "./http";

const PASSWORD_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_ITERATIONS = 390_000;
const TOKEN_TTL_SECONDS = 60 * 60 * 24;
const RESET_TTL_SECONDS = 60 * 30;
const AUTH_COOKIE_NAME = "payanname_auth_token";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const digest = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256");
  return [PASSWORD_ALGORITHM, PASSWORD_ITERATIONS, base64url(salt), base64url(digest)].join("$");
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) {
    return false;
  }

  const [algorithm, iterationsRaw, saltRaw, digestRaw] = storedHash.split("$");
  if (algorithm !== PASSWORD_ALGORITHM || !iterationsRaw || !saltRaw || !digestRaw) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  const salt = fromBase64url(saltRaw);
  const expected = fromBase64url(digestRaw);
  const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  return crypto.timingSafeEqual(actual, expected);
}

function sign(input: string): string {
  return base64url(crypto.createHmac("sha256", authSecret()).update(input).digest());
}

export function createAccessToken(user: UserEntity): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: user.id,
      role: user.role,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS
    })
  );
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${sign(signingInput)}`;
}

export function decodeAccessToken(token: string): { sub: string; role: string } {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    throw new ApiError(401, "Invalid token");
  }

  const signingInput = `${header}.${payload}`;
  const expected = sign(signingInput);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new ApiError(401, "Invalid token");
  }

  const decoded = JSON.parse(fromBase64url(payload).toString("utf-8")) as {
    sub?: unknown;
    role?: unknown;
    exp?: unknown;
  };
  if (typeof decoded.sub !== "string" || typeof decoded.role !== "string") {
    throw new ApiError(401, "Invalid token");
  }
  if (typeof decoded.exp !== "number" || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new ApiError(401, "Token expired");
  }
  return { sub: decoded.sub, role: decoded.role };
}

export async function getCurrentUser(request: Request): Promise<UserEntity> {
  const authorization = request.headers.get("authorization");
  const prefix = "Bearer ";
  let token = authorization?.startsWith(prefix) ? authorization.slice(prefix.length).trim() : null;
  if (!token) {
    const cookie = request.headers.get("cookie") ?? "";
    token = cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))
      ?.slice(AUTH_COOKIE_NAME.length + 1) ?? null;
    token = token ? decodeURIComponent(token) : null;
  }
  if (!token) {
    throw new ApiError(401, "Missing bearer token");
  }

  const payload = decodeAccessToken(token);
  const dataSource = await getDataSource();
  const user = await dataSource.getRepository(UserSchema).findOneBy({ id: payload.sub });
  if (!user) {
    throw new ApiError(401, "User not found");
  }
  return user;
}

export async function requireAdmin(request: Request): Promise<UserEntity> {
  const user = await getCurrentUser(request);
  if (user.role !== "admin") {
    throw new ApiError(403, "Admin role required");
  }
  return user;
}

export function makeResetToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_SECONDS * 1000)
  };
}

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
