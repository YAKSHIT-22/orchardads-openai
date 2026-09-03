import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { generateJWT } from "@/lib/generateJwt";

export async function POST(request: Request) {
try {
    const { name, email, password, recaptchaToken } = await request.json();

    // When reCAPTCHA is configured, the token is REQUIRED — otherwise a caller
    // could bypass the check simply by omitting the field.
    if (process.env.RECAPTCHA_SECRET_KEY) {
      if (!recaptchaToken) {
        return NextResponse.json({ error: "reCAPTCHA verification required" }, { status: 400 });
      }
      const recaptchaResponse = await fetch(
        `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`,
        { method: "POST" }
      );
      const recaptchaData = await recaptchaResponse.json();
      if (!recaptchaData.success) {
        return NextResponse.json({ error: "Invalid reCAPTCHA" }, { status: 400 });
      }
    }

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "All fields are required." },
        { status: 400 }
      );
    }
    const emailOk = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
    if (!emailOk) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 100) {
      return NextResponse.json({ error: "Password must be 8–100 characters." }, { status: 400 });
    }
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
      return NextResponse.json({ error: "Enter a valid name (up to 100 characters)." }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists." },
        { status: 409 }
      );
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
        data: { name, email, password: hash },
    });  
    const token = await generateJWT({
      name: user.name,
      userId: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.verified,
      hasAccessData: false
    });
    const nextCookie = await cookies();
    nextCookie.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });
    return NextResponse.json({ message: 'User Registered successfully.', name: user.name, userId: user.id, email: user.email }, { status: 201 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}