import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const hasAuth = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
  if (!hasAuth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  revalidateTag("productos", { expire: 0 });
  return NextResponse.json({ ok: true });
}
