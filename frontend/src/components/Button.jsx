/**
 * Bouton unique pour toute l'application : les styles réels vivent dans
 * styles/index.css (button, button.secondary, button.danger, button.ghost,
 * .remove-button, .menu-button, .nav-symbol...). Ce composant ne fait que
 * choisir la bonne combinaison de classes à partir d'une variante nommée,
 * pour éviter de retaper "className='danger ghost ...'" à chaque bouton.
 */
const VARIANT_CLASSES = {
  primary: "",
  secondary: "secondary",
  danger: "danger",
  ghost: "ghost",
  dangerGhost: "danger ghost",
  remove: "remove-button",
  navSymbol: "secondary nav-symbol",
};

export default function Button({ variant = "primary", className = "", ...props }) {
  const variantClassName = VARIANT_CLASSES[variant] ?? "";
  const combinedClassName = [variantClassName, className].filter(Boolean).join(" ");

  return <button className={combinedClassName || undefined} {...props} />;
}
