import type { Metadata } from "next";
import { ClassDashboard } from "@/features/classes/class-dashboard";
export const metadata: Metadata = { title: "Teacher classes" };
export default function TeacherDashboard() { return <ClassDashboard mode="teacher" />; }
