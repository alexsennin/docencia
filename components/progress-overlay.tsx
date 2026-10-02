"use client";

export function ProgressOverlay({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="progress-backdrop" role="status" aria-live="polite" aria-atomic="true">
      <section className="progress-dialog">
        <div className="evaluating-spinner" aria-hidden="true" />
        <p className="eyebrow">UN MOMENTO</p>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </section>
    </div>
  );
}
