import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function json<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ detail: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ detail: error.issues }, { status: 422 });
  }

  console.error(error);
  return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
}

export function bearerWorkerAuth(request: Request, expectedKey: string): void {
  if (request.headers.get("authorization") !== `Bearer ${expectedKey}`) {
    throw new ApiError(401, "Invalid or missing worker API key");
  }
}

export function compact(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
