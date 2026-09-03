import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import UserProvider from "@/providers/UserProvider";
import { toast } from "sonner";

interface Props {
  children: React.ReactNode;
}

export default async function DashboardRootLayout({ children }: Props) {
  const nextCookie = await cookies();
  const token = nextCookie.get("token")?.value;

  let initialUser: { name: string, userId: string; email: string } | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.JWT_SECRET!)
      );
      const { name, userId, email } = payload as { name:string, userId: string; email: string };
      initialUser = { name, userId, email };
    } catch (err) {
      toast.error("Session expired. Please log in again.");
    }
  }

  return <UserProvider initialUser={initialUser}>{children}</UserProvider>;
}
