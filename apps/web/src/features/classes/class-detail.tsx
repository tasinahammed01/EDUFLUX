"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import type { ClassMember, ClassSummary } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";

export function ClassDetail({ id, mode }: { id: string; mode: "teacher" | "student" }) {
  const [item, setItem] = useState<ClassSummary | null>(null); const [members, setMembers] = useState<ClassMember[]>([]); const [error, setError] = useState("");
  useEffect(() => { let active = true; Promise.all([classesApi.one(id), ...(mode === "teacher" ? [classesApi.members(id)] : [])]).then(([detail, memberData]) => { if (!active) return; setItem(detail as ClassSummary); if (memberData) setMembers((memberData as { members: ClassMember[] }).members); }).catch(() => { if (active) setError("This class could not be opened."); }); return () => { active = false; }; }, [id, mode]);
  if (error) return <main className="dashboard"><Link className="back-link" href={`/${mode}/dashboard`}><ArrowLeft /> Back to classes</Link><div className="empty-state"><h1>{error}</h1></div></main>;
  if (!item) return <main className="dashboard"><div className="class-skeletons"><i /><i /></div></main>;
  return <main className="dashboard"><Link className="back-link" href={`/${mode}/dashboard`}><ArrowLeft /> Back to classes</Link><header className="class-detail-heading"><div><p className="eyebrow">{item.role} workspace</p><h1>{item.name}</h1><p>{item.description || "Your class space is ready."}</p></div>{item.joinCode && <div><small>JOIN CODE</small><strong>{item.joinCode}</strong></div>}</header>{mode === "teacher" && <section className="member-panel"><div className="member-title"><Users /><div><h2>Class members</h2><p>{members.length} active members shown</p></div></div><div className="member-list">{members.map((member) => <div key={member.userId}><span>{member.displayName.slice(0,2).toUpperCase()}</span><strong>{member.displayName}</strong><small>{member.role}</small><time>{new Date(member.joinedAt).toLocaleDateString()}</time></div>)}</div></section>} {mode === "student" && <section className="empty-state compact"><BookMessage /><h2>You’re in.</h2><p>Assignments and class activity arrive in Phase 3.</p></section>}</main>;
}

function BookMessage() { return <BookOpenIcon />; }
function BookOpenIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a3 3 0 013-3h5v18H7a3 3 0 00-3 2V5zm16 0a3 3 0 00-3-3h-5v18h5a3 3 0 013 2V5z" /></svg>; }
