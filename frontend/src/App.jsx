import AppCore from "./AppCore.jsx";

/**
 * Point d'entrée applicatif volontairement minimal.
 *
 * Le cœur historique reste dans AppCore pendant le découpage progressif.
 * Les prochaines extractions (authentification, navigation et modales)
 * pourront ainsi être effectuées par blocs sans toucher au bootstrap React.
 */
export default function App() {
  return <AppCore />;
}
