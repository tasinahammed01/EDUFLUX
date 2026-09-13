"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, GraduationCap, LoaderCircle, School, ShieldCheck } from "lucide-react";
import { loginSchema, registerSchema } from "@eduflux/validation";
import type { PrimaryPersona } from "@eduflux/shared-types";
import { authApi } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [persona, setPersona] = useState<PrimaryPersona>("TEACHER");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setError(""); setFields({});
    const form = new FormData(event.currentTarget);
    const input = mode === "register" ? { displayName: String(form.get("displayName") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), primaryPersona: persona } : { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };
    const parsed = (mode === "register" ? registerSchema : loginSchema).safeParse(input);
    if (!parsed.success) { setFields(parsed.error.flatten().fieldErrors); setError("Please check the highlighted fields."); return; }
    setPending(true);
    try {
      const session = mode === "register" ? await authApi.register(parsed.data as typeof input & { primaryPersona: PrimaryPersona; displayName: string }) : await authApi.login(parsed.data as { email: string; password: string });
      router.replace(session.user.primaryPersona === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard"); router.refresh();
    } catch (caught) { if (caught instanceof ApiClientError) { setError(caught.message); setFields(caught.fields ?? {}); } else setError("Something went wrong. Please try again."); }
    finally { setPending(false); }
  }

  return <div className="auth-card"><div className="auth-card-heading"><span><ShieldCheck aria-hidden="true" /></span><div><h2>{mode === "register" ? "Create your account" : "Welcome back"}</h2><p>{mode === "register" ? "Choose your starting workspace." : "Sign in to continue to your classes."}</p></div></div><form onSubmit={submit} noValidate>{error && <div className="form-error" role="alert">{error}</div>}{mode === "register" && <><fieldset className="persona-field"><legend>I’m joining as a</legend><div>{(["TEACHER","STUDENT"] as const).map((value) => <button key={value} type="button" aria-pressed={persona === value} onClick={() => setPersona(value)}>{value === "TEACHER" ? <School aria-hidden="true" /> : <GraduationCap aria-hidden="true" />}<span>{value === "TEACHER" ? "Teacher" : "Student"}<small>{value === "TEACHER" ? "Create and guide classes" : "Join and learn with a class"}</small></span></button>)}</div></fieldset><Field label="Display name" name="displayName" autoComplete="name" error={fields.displayName?.[0]} /> </>}<Field label="Email address" name="email" type="email" autoComplete="email" error={fields.email?.[0]} /><div className="password-field"><Field label="Password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} description={mode === "register" ? "Use 12–128 characters. Passphrases work well." : undefined} error={fields.password?.[0]} /><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div><button className="button button-primary auth-submit" disabled={pending}>{pending && <LoaderCircle className="spinner" aria-hidden="true" />}{pending ? (mode === "register" ? "Creating account…" : "Signing in…") : (mode === "register" ? "Create account" : "Sign in")}</button></form><p className="auth-switch">{mode === "register" ? "Already have an account?" : "New to EduFlux?"} <Link href={mode === "register" ? "/login" : "/register"}>{mode === "register" ? "Sign in" : "Create account"}</Link></p></div>;
}

function Field({ label, name, type = "text", autoComplete, description, error }: { label: string; name: string; type?: string | undefined; autoComplete: string; description?: string | undefined; error?: string | undefined }) {
  const describedBy = error ? `${name}-error` : description ? `${name}-description` : undefined;
  return <label className="form-field"><span>{label}</span><input name={name} type={type} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={describedBy} />{description && !error && <small id={`${name}-description`}>{description}</small>}{error && <small className="field-error" id={`${name}-error`}>{error}</small>}</label>;
}
