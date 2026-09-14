import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getServerSession } from "@/lib/auth/server-session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.requiresOnboarding) redirect("/onboarding");
  if (session.user.primaryPersona === "TEACHER") redirect("/teacher/dashboard");
  return <AppShell user={session.user}>{children}</AppShell>;
}
