import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Erreur de rendu ClimbCrew", error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main style={{ minHeight: "100vh", padding: 24, background: "#0f172a", color: "#f8fafc", fontFamily: "Arial, sans-serif" }}>
        <section style={{ maxWidth: 720, margin: "10vh auto", padding: 24, border: "1px solid #475569", borderRadius: 16, background: "#111827" }}>
          <h1>CristalClimbClub ne peut pas afficher cette page</h1>
          <p>Une erreur inattendue est survenue. Recharge la page. Si le problème persiste, transmets le message ci-dessous à l’administrateur.</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 12, borderRadius: 8, background: "#020617" }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>
            Recharger
          </button>
        </section>
      </main>
    );
  }
}
