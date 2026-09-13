export function SectionHeading({ eyebrow, title, copy, align = "left" }: { eyebrow: string; title: string; copy: string; align?: "left" | "center" }) {
  return <div className={`section-heading ${align === "center" ? "is-centered" : ""}`}><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{copy}</p></div>;
}
