"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import type { ClassSummary } from "@eduflux/shared-types";
import {
  createClassSchema,
  classSubjectLevelSchema,
} from "@eduflux/validation";
import { classesApi } from "@/lib/api/classes";
import { ApiClientError } from "@/lib/api/client";
import { notify } from "@/lib/notifications";

function today() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}
export function CreateClassDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (item: ClassSummary) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null),
    nameRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const [description, setDescription] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nameRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) onClose();
      if (event.key !== "Tab") return;
      const focusable = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
          ) ?? []),
        ],
        first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
    };
  }, [onClose]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setFields({});
    const form = new FormData(event.currentTarget),
      endDate = String(form.get("endDate") ?? "");
    const parsed = createClassSchema.safeParse({
      name: String(form.get("name") ?? ""),
      subjectLevel: String(form.get("subjectLevel") ?? ""),
      startDate: String(form.get("startDate") ?? ""),
      ...(endDate ? { endDate } : {}),
      ...(description ? { description } : {}),
    });
    if (!parsed.success) {
      setFields(parsed.error.flatten().fieldErrors);
      setError("Please check the highlighted fields.");
      return;
    }
    setPending(true);
    try {
      onCreated(await classesApi.create(parsed.data));
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else setError("The class could not be created. Please try again.");
      notify.error(caught, "Could not create class. Try again.", "create-class-error");
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="create-class-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-class-title"
        aria-describedby="create-class-description"
      >
        <header>
          <div>
            <p className="eyebrow">New learning space</p>
            <h2 id="create-class-title">Create New Class</h2>
            <p id="create-class-description">
              Set the essentials now. You can guide the details as your class
              grows.
            </p>
          </div>
          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            disabled={pending}
            aria-label="Close create class dialog"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={submit} noValidate>
          <div className="dialog-fields two-column">
            <Field
              label="Class Name"
              name="name"
              error={fields.name?.[0]}
              inputRef={nameRef}
              minLength={2}
              maxLength={100}
              required
              placeholder="e.g. Year 10 Literature"
            />
            <SelectField error={fields.subjectLevel?.[0]} />
          </div>
          <div className="dialog-fields two-column">
            <Field
              label="Start Date"
              name="startDate"
              type="date"
              error={fields.startDate?.[0]}
              defaultValue={today()}
              required
            />
            <Field
              label="End Date"
              name="endDate"
              type="date"
              error={fields.endDate?.[0]}
            />
          </div>
          <label className="dialog-field">
            <span>
              Description <small>optional</small>
            </span>
            <textarea
              name="description"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value.slice(0, 500))
              }
              maxLength={500}
              rows={4}
              aria-invalid={Boolean(fields.description)}
              aria-describedby={
                fields.description ? "description-error" : "description-count"
              }
              placeholder="What should students know about this class?"
            />
            {fields.description?.[0] ? (
              <small className="field-error" id="description-error">
                {fields.description[0]}
              </small>
            ) : (
              <small className="character-count" id="description-count">
                {description.length} / 500 characters
              </small>
            )}
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button
              className="button button-secondary"
              type="button"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button className="button button-primary" disabled={pending}>
              {pending && (
                <LoaderCircle className="spinner" aria-hidden="true" />
              )}
              {pending ? "Creating class…" : "Create Class"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
function Field({
  label,
  name,
  error,
  inputRef,
  ...props
}: {
  label: string;
  name: string;
  error?: string | undefined;
  inputRef?: React.Ref<HTMLInputElement>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${name}-error`;
  return (
    <label className="dialog-field">
      <span>{label}</span>
      <input
        ref={inputRef}
        name={name}
        {...props}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <small className="field-error" id={errorId}>
          {error}
        </small>
      )}
    </label>
  );
}
function SelectField({ error }: { error?: string | undefined }) {
  return (
    <label className="dialog-field">
      <span>Subject / Level</span>
      <select
        name="subjectLevel"
        defaultValue=""
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "subjectLevel-error" : undefined}
      >
        <option value="" disabled>
          Select a focus
        </option>
        {classSubjectLevelSchema.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && (
        <small className="field-error" id="subjectLevel-error">
          {error}
        </small>
      )}
    </label>
  );
}
