import { NextResponse } from "next/server";

export function apiSuccess<T>(data: T, meta: Record<string, unknown> = {}) {
  return NextResponse.json({
    data,
    meta,
    errors: [],
  });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  meta: Record<string, unknown> = {},
) {
  return NextResponse.json(
    {
      data: null,
      meta,
      errors: [
        {
          code,
          message,
        },
      ],
    },
    { status },
  );
}
