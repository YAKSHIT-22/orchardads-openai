import { NextResponse } from "next/server";
import { sendContactEmail } from "@/lib/mailer";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { name, email, subject, message } = body;

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    await sendContactEmail({
      name,
      email,
      subject,
      message,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Something went wrong",
      },
      { status: 500 }
    );
  }
}