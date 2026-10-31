import React from "react";

// Pictogrammes pédagogiques originaux, symboliques et non normatifs.
// Ils n'illustrent aucune manœuvre de sécurité à reproduire telle quelle.
export default function CompetenceIllustration({ category, title }) {
  return (
    <svg className="competences-illustration" viewBox="0 0 320 138" role="img" aria-label={"Schéma original et symbolique : " + title}>
      <rect width="320" height="138" rx="12" fill="#e5eef8" />
      <circle cx="266" cy="32" r="58" fill="#d2e5f4" />
      <path d="M16 112H304" stroke="#b3c9dc" strokeWidth="2" strokeDasharray="6 8" />
      {category === "securite" && (
        <g stroke="#175878" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M88 22 131 40V75Q128 98 88 116 48 98 45 75V40Z" fill="#fff" />
          <path d="m66 69 16 17 29-35" stroke="#188b66" strokeWidth="7" />
          <rect x="169" y="32" width="91" height="76" rx="9" fill="#fff" />
          <path d="m184 54 7 7 11-15M211 55h32m-59 26 7 7 11-15m9 8h32" strokeWidth="3.5" />
        </g>
      )}
      {category === "assurage" && (
        <g stroke="#175878" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M82 17C82 49 112 40 112 71S82 99 82 121" stroke="#e47e46" strokeWidth="8" />
          <circle cx="112" cy="70" r="22" fill="#fff" />
          <circle cx="112" cy="70" r="8" />
          <path d="M165 32h106M165 56h72M165 81h92" strokeWidth="7" />
          <path d="m238 101 13 12 22-25" stroke="#188b66" strokeWidth="6" />
        </g>
      )}
      {category === "bloc" && (
        <g stroke="#175878" strokeWidth="4" strokeLinejoin="round" fill="none">
          <path d="M51 102V25h56v27h35v50Z" fill="#fff" />
          <path d="m74 48 12-6 12 10-12 7ZM113 70l10-5 8 12-10 7" fill="#e9ae6a" />
          <rect x="37" y="103" width="212" height="19" rx="7" fill="#9cb6ce" />
          <circle cx="203" cy="52" r="11" fill="#fff" />
          <path d="m203 64-9 26 17 12m-17-12-15 13m15-22 21 4" strokeWidth="5" strokeLinecap="round" />
        </g>
      )}
      {category === "materiel" && (
        <g stroke="#175878" strokeWidth="4" strokeLinejoin="round" fill="none">
          <rect x="57" y="26" width="66" height="82" rx="19" fill="#fff" />
          <circle cx="90" cy="52" r="12" />
          <path d="M90 64v23M151 49h100m-100 25h100m-100 25h72" strokeWidth="7" />
          <circle cx="262" cy="101" r="13" fill="#e9ae6a" />
        </g>
      )}
      {category === "pedagogie" && (
        <g stroke="#175878" strokeWidth="4" strokeLinejoin="round" fill="none">
          <path d="M52 116 92 24h111l35 92Z" fill="#fff" />
          <path d="m107 57 14-7 12 12-13 9Zm47 33 14-7 12 12-13 9Z" fill="#e9ae6a" />
          <path d="M83 112Q117 95 130 80T173 49" stroke="#188b66" strokeWidth="4" strokeDasharray="7 8" />
          <path d="m163 52 16-11-1 19" stroke="#188b66" />
          <circle cx="256" cy="57" r="25" fill="#fff" />
          <path d="m274 75 20 22" />
        </g>
      )}
    </svg>
  );
}
