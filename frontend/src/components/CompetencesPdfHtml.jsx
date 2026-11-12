import React from "react";
import extracted from "../data/ffme-extracted.json";

function SourceParagraph({ block }) {
  const text = block.lines.join("\n");
  if (block.kind === "heading") return <h5 className="ffme-html-heading">{text}</h5>;
  return <p className={block.kind === "list" ? "ffme-html-list" : "ffme-html-text"}>{text}</p>;
}

function OriginalLayout({ page }) {
  return (
    <div className="ffme-native-sheet" style={{ aspectRatio: page.width + " / " + page.height }}>
      {page.illustration && (
        <img
          className="ffme-native-drawing"
          src={page.illustration.src}
          alt=""
          loading="lazy"
          style={{
            left: 100 * page.illustration.x / page.width + "%",
            top: 100 * page.illustration.y / page.height + "%",
            width: 100 * page.illustration.width / page.width + "%",
            height: 100 * page.illustration.height / page.height + "%",
          }}
        />
      )}
      {page.spans.map((span, index) => (
        <span
          className="ffme-native-span"
          key={index}
          style={{
            left: 100 * span.x / page.width + "%",
            top: 100 * span.y / page.height + "%",
            fontSize: 100 * span.size / page.width + "cqw",
            fontWeight: span.bold ? 700 : 400,
            fontStyle: span.italic ? "italic" : "normal",
            color: span.color,
          }}
        >{span.text}</span>
      ))}
    </div>
  );
}

export default function CompetencesPdfHtml({ item, onExpandImage }) {
  const [view, setView] = React.useState(item.id === "comparatif" ? "original" : "reading");
  const document = extracted[item.id];

  if (!document?.pages?.length) {
    return <p className="competences-error" role="alert">Contenu HTML FFME indisponible pour cette fiche.</p>;
  }

  return (
    <section className="ffme-native-document" aria-label={"Document FFME structuré : " + item.title}>
      <div className="ffme-native-toolbar">
        <strong>Document FFME · Texte HTML et schémas séparés</strong>
        <div className="ffme-native-switch" role="group" aria-label="Mode d’affichage du document">
          <button type="button" aria-pressed={view === "reading"} onClick={() => setView("reading")}>Lecture HTML</button>
          <button type="button" aria-pressed={view === "original"} onClick={() => setView("original")}>Mise en page originale</button>
        </div>
      </div>
      <p className="small">
        Texte extrait des documents officiels FFME, conservé sans réécriture. Illustrations extraites séparément.
        En cas de doute sur un tableau, une légende ou une manœuvre, utilisez la mise en page originale.
      </p>
      <div className={"ffme-native-pages ffme-native-" + view}>
        {document.pages.map((page) => (
          <article className="ffme-native-page" key={page.number} aria-label={"Page " + page.number}>
            <h5 className="ffme-native-page-label">Page {page.number} / {document.pages.length}</h5>
            {view === "reading" ? (
              <div className="ffme-native-reader">
                {page.paragraphs.map((block, index) => <SourceParagraph block={block} key={index} />)}
                {page.illustration && (
                  <figure className="ffme-native-figure">
                    <button
                      type="button"
                      onClick={() => onExpandImage(page.illustration.src, item.title + " — schéma page " + page.number)}
                      aria-label={"Agrandir le schéma FFME page " + page.number + " : " + item.title}
                    >
                      <img src={page.illustration.src} loading="lazy" alt={"Schémas et représentations graphiques de la page " + page.number + " (© FFME)"} />
                    </button>
                    <figcaption>Schémas de la page {page.number} · © FFME. La lecture des étapes et légendes se fait dans le texte HTML ci-dessus ou dans la mise en page d’origine.</figcaption>
                  </figure>
                )}
              </div>
            ) : (
              <OriginalLayout page={page} />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
