"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="error-page"><p className="eyebrow">Something went wrong</p><h1>We couldn’t open this view.</h1><button className="button button-primary" onClick={reset}>Try again</button></main>;
}
