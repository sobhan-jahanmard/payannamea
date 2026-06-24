import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = "payanname_auth_token";
const DEFAULT_AUTH_SECRET = "local-dev-auth-secret-change-me";

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(input: string): Promise<string> {
  const secret = process.env.AUTH_SECRET?.trim() || DEFAULT_AUTH_SECRET;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return bytesToBase64url(new Uint8Array(signature));
}

async function decodeVerifiedToken(token: string): Promise<{ role: string; exp: number } | null> {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    return null;
  }

  const signingInput = `${header}.${payload}`;
  if ((await sign(signingInput)) !== signature) {
    return null;
  }

  const decoded = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload))) as {
    role?: unknown;
    exp?: unknown;
  };
  if (typeof decoded.role !== "string" || typeof decoded.exp !== "number") {
    return null;
  }
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return { role: decoded.role, exp: decoded.exp };
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.next();
  }

  const payload = await decodeVerifiedToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (payload.role !== "admin") {
    return NextResponse.redirect(new URL("/orders", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
