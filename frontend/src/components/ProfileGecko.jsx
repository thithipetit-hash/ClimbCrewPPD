import React from "react";
import { GECKO_REAL_SPRITE } from "../assets/gecko-real/index.js";
import { getGeckoLevelInfo } from "../lib/gecko-level.js";
import "../styles/profile-gecko.css";

const LEVEL_ACCENTS = ["#65a30d", "#4d7c0f", "#0284c7", "#2563eb", "#7c3aed", "#9333ea", "#d97706", "#0ea5e9"];

export default function ProfileGecko({ grade, sexe }) {
  const { level, label, variant } = getGeckoLevelInfo(grade, sexe);
  const accent = variant === "feminine" ? "#db2777" : LEVEL_ACCENTS[level - 1];
  const column = Math.max(0, Math.min(7, level - 1));
  const row = variant === "feminine" ? 1 : 0;

  return (
    <div className="card profile-gecko-card">
      <div className="card-header profile-gecko-header">
        <div>
          <h3 style={{ margin: 0 }}>Mon Gecko</h3>
          <div className="small">Niveau {level}/8 · {label}{grade ? ` · CPR ${grade}` : ""}</div>
        </div>
        <span className="pill" style={{ borderColor: accent, color: "inherit" }}>{label}</span>
      </div>

      <div className="profile-gecko-stage" style={{ "--gecko-accent": accent }}>
        <div
          className="profile-gecko-photo-frame"
          role="img"
          aria-label={`Gecko ${label}, niveau ${level} sur 8`}
        >
          <img
            className="profile-gecko-photo-sprite"
            src={GECKO_REAL_SPRITE}
            alt=""
            aria-hidden="true"
            decoding="async"
            draggable="false"
            style={{
              "--gecko-column": column,
              "--gecko-row": row,
            }}
          />
        </div>
      </div>
    </div>
  );
}
