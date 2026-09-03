import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
    const nextCookie = await cookies()
    nextCookie.set("token", "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });

  return NextResponse.json({ message: "Logged out successfully." });
}
