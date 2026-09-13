import type { Metadata } from "next";
import { ClassDashboard } from "@/features/classes/class-dashboard";
export const metadata: Metadata = { title: "Student classes" };
export default function StudentDashboard() { return <ClassDashboard mode="student" />; }
