export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero-card" aria-labelledby="page-title">
        <p className="eyebrow">INTEGRATECH · DOCENCIA</p>
        <h1 id="page-title">El espacio de docencia está listo.</h1>
        <p className="intro">
          Aquí construiremos rápidamente las herramientas, contenidos y flujos que necesite el proyecto.
        </p>
        <div className="status-pill" role="status">
          <span aria-hidden="true" /> Base publicada correctamente
        </div>
      </section>
    </main>
  );
}
