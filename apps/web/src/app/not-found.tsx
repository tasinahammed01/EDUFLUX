import Link from "next/link";
export default function NotFound() {
  return <main className="error-page"><p className="eyebrow">404</p><h1>That page drifted out of orbit.</h1><Link className="button button-primary" href="/">Return home</Link></main>;
}
