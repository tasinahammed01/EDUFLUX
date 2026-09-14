import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getServerSession } from "@/lib/auth/server-session";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.requiresOnboarding) redirect("/onboarding");
  if (session.user.primaryPersona === "STUDENT") redirect("/student/dashboard");
  return <AppShell user={session.user}>{children}</AppShell>;
}
