import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // when someone visits '/', serve the static file in /public/index.html
  if (req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/index.html";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
