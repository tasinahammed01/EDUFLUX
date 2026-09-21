import type { Metadata } from "next";
import { JoinClassPage } from "@/features/classes/join-class-page";
export const metadata: Metadata = { title: "Join class" };
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <JoinClassPage token={(await params).token} />;
}
