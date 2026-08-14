import React from "react";

const HOLD_COLORS = ["#f97316", "#8b5cf6", "#06b6d4", "#eab308", "#ef4444", "#22c55e"];

function Hold({ x, y, rotate = 0, color, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path
        d="M-16 1 C-13 -10 -4 -15 7 -12 C15 -10 20 -3 18 5 C16 13 4 16 -8 13 C-16 11 -20 7 -16 1Z"
        fill={color}
        stroke="rgba(15,23,42,.28)"
        strokeWidth="2"
      />
      <path d="M-9 -4 C-3 -8 6 -8 11 -4" fill="none" stroke="rgba(255,255,255,.58)" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function Quickdraw({ x, y, rotate = 0, accent = "#f97316" }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <path d="M0 -13 C-9 -13 -9 0 0 0 C9 0 9 -13 0 -13Z" fill="none" stroke="#334155" strokeWidth="4" />
      <path d="M0 0 L0 16" stroke={accent} strokeWidth="5" strokeLinecap="round" />
      <path d="M0 16 C-9 16 -9 29 0 29 C9 29 9 16 0 16Z" fill="none" stroke="#334155" strokeWidth="4" />
    </g>
  );
}

export default function GeckoArtwork({ level, label, variant = "neutral", accent = "#2563eb" }) {
  const feminine = variant === "feminine";
  const hasShoes = level >= 2;
  const hasHarness = level >= 3;
  const hasQuickdraws = level >= 4;
  const hasPremiumGear = level >= 5;
  const isExpert = level >= 6;
  const isMaster = level >= 7;
  const isCrystal = level >= 8;
  const gear = feminine ? "#c026d3" : accent;
  const bodyLight = feminine ? "#a3e635" : "#bef264";
  const bodyMid = feminine ? "#65a30d" : "#65a30d";
  const bodyDark = "#365314";

  const leftHand = isExpert ? [76, 142] : [88, 172];
  const rightHand = isExpert ? [322, 116] : [306, 154];

  return (
    <svg
      className="profile-gecko-artwork"
      viewBox="0 0 420 520"
      role="img"
      aria-label={`Gecko ${label}, niveau ${level} sur 8`}
    >
      <defs>
        <linearGradient id="gecko-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.52" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="gecko-wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbe4ef" />
          <stop offset="0.52" stopColor="#b9c5d5" />
          <stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="gecko-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={bodyLight} />
          <stop offset="0.5" stopColor={bodyMid} />
          <stop offset="1" stopColor={bodyDark} />
        </linearGradient>
        <radialGradient id="gecko-belly" cx="35%" cy="25%" r="75%">
          <stop offset="0" stopColor="#d9f99d" stopOpacity=".95" />
          <stop offset="1" stopColor="#84cc16" stopOpacity=".1" />
        </radialGradient>
        <linearGradient id="gecko-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="0.35" stopColor="#64748b" />
          <stop offset="0.72" stopColor="#cbd5e1" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="gecko-crystal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ecfeff" />
          <stop offset=".33" stopColor="#67e8f9" />
          <stop offset=".7" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <filter id="gecko-shadow" x="-35%" y="-35%" width="170%" height="180%">
          <feDropShadow dx="0" dy="12" stdDeviation="11" floodColor="#0f172a" floodOpacity=".24" />
        </filter>
        <filter id="gecko-soft-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#0f172a" floodOpacity=".22" />
        </filter>
        <filter id="gecko-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <pattern id="gecko-texture" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="7" r="1.2" fill="#64748b" opacity=".12" />
          <circle cx="21" cy="18" r="1" fill="#64748b" opacity=".1" />
          <path d="M0 27 L27 0" stroke="#fff" strokeOpacity=".11" strokeWidth="1" />
        </pattern>
      </defs>

      <rect x="8" y="8" width="404" height="504" rx="34" fill="url(#gecko-card)" stroke={accent} strokeWidth="4" />
      <rect x="18" y="18" width="384" height="484" rx="26" fill="url(#gecko-texture)" opacity=".72" />

      <path
        d={isExpert ? "M282 20 L402 20 L402 500 L224 500 C242 422 250 345 257 265 C266 163 273 84 282 20Z" : "M300 20 L402 20 L402 500 L258 500 C270 419 279 340 286 256 C293 163 297 88 300 20Z"}
        fill="url(#gecko-wall)"
        opacity=".98"
      />
      <path d="M299 20 C293 125 289 232 275 340 C267 402 258 455 250 500" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="4" />

      <Hold x={346} y={82} rotate={-12} color={HOLD_COLORS[0]} scale={1.05} />
      <Hold x={316} y={145} rotate={9} color={HOLD_COLORS[1]} scale={.94} />
      <Hold x={365} y={215} rotate={-8} color={HOLD_COLORS[2]} scale={1.08} />
      <Hold x={310} y={286} rotate={13} color={HOLD_COLORS[3]} scale={.94} />
      <Hold x={360} y={360} rotate={-10} color={HOLD_COLORS[4]} scale={1.05} />
      <Hold x={318} y={430} rotate={7} color={HOLD_COLORS[5]} scale={.9} />

      {isCrystal && (
        <g filter="url(#gecko-glow)" opacity=".92">
          <path d="M48 378 L67 337 L87 378 L68 408Z" fill="url(#gecko-crystal)" stroke="#0284c7" strokeWidth="2" />
          <path d="M93 79 L107 48 L123 79 L108 101Z" fill="url(#gecko-crystal)" stroke="#0284c7" strokeWidth="2" />
          <path d="M365 41 L378 17 L391 42 L378 61Z" fill="url(#gecko-crystal)" stroke="#0284c7" strokeWidth="2" />
        </g>
      )}

      <g filter="url(#gecko-shadow)">
        <path
          d="M158 341 C94 346 56 385 70 422 C80 448 119 447 136 426 C148 411 140 394 124 396 C111 397 106 410 115 418"
          fill="none"
          stroke={bodyDark}
          strokeWidth="20"
          strokeLinecap="round"
        />
        <path d="M157 341 C106 349 77 374 77 399" fill="none" stroke="#84cc16" strokeOpacity=".36" strokeWidth="8" strokeLinecap="round" />

        <ellipse cx="203" cy="283" rx="71" ry="92" fill="url(#gecko-body)" transform={isExpert ? "rotate(-10 203 283)" : "rotate(-4 203 283)"} />
        <ellipse cx="188" cy="173" rx="73" ry="62" fill="url(#gecko-body)" transform="rotate(-7 188 173)" />
        <ellipse cx="179" cy="274" rx="42" ry="58" fill="url(#gecko-belly)" opacity=".62" transform="rotate(-7 179 274)" />

        <path d="M141 136 C153 118 174 108 194 108" fill="none" stroke="#d9f99d" strokeOpacity=".42" strokeWidth="9" strokeLinecap="round" />
        <path d="M157 233 C170 219 194 211 217 214" fill="none" stroke="#d9f99d" strokeOpacity=".3" strokeWidth="8" strokeLinecap="round" />

        <ellipse cx="161" cy="154" rx="24" ry="29" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
        <ellipse cx="213" cy="145" rx="24" ry="29" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
        <ellipse cx="164" cy="158" rx="11" ry="16" fill="#111827" />
        <ellipse cx="217" cy="149" rx="11" ry="16" fill="#111827" />
        <circle cx="168" cy="152" r="4" fill="#fff" />
        <circle cx="221" cy="143" r="4" fill="#fff" />
        <path d="M162 190 C180 207 207 205 226 184" fill="none" stroke="#365314" strokeWidth="6" strokeLinecap="round" />
        <path d="M181 196 C191 201 201 199 209 194" fill="none" stroke="#fda4af" strokeWidth="3" strokeLinecap="round" opacity=".8" />

        {feminine && (
          <g>
            <path d="M137 132 L128 123 M141 126 L136 114" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />
            <path d="M232 120 L240 109 M237 126 L249 118" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />
            <path d="M121 118 C106 99 111 83 128 88 C142 93 145 109 138 120Z" fill={gear} stroke="#831843" strokeWidth="2" />
            <path d="M140 116 C153 94 169 96 173 112 C176 126 158 133 141 124Z" fill="#f472b6" stroke="#831843" strokeWidth="2" />
            <circle cx="139" cy="119" r="7" fill="#fbcfe8" />
          </g>
        )}

        {[[172,240,6],[212,235,5],[232,260,6],[166,292,5],[214,305,5],[190,330,4]].map(([x,y,r], index) => (
          <circle key={index} cx={x} cy={y} r={r} fill="#365314" opacity=".7" />
        ))}

        <path d={`M158 239 C130 226 104 198 ${leftHand[0]} ${leftHand[1]}`} fill="none" stroke="#65a30d" strokeWidth="24" strokeLinecap="round" />
        <path d={`M230 231 C260 211 287 183 ${rightHand[0]} ${rightHand[1]}`} fill="none" stroke="#65a30d" strokeWidth="24" strokeLinecap="round" />
        <circle cx={leftHand[0]} cy={leftHand[1]} r="15" fill="#84cc16" stroke="#4d7c0f" strokeWidth="2" />
        <circle cx={rightHand[0]} cy={rightHand[1]} r="15" fill="#84cc16" stroke="#4d7c0f" strokeWidth="2" />
        {[[-8,-4],[0,-9],[8,-4]].map(([dx,dy],i)=><circle key={`lh${i}`} cx={leftHand[0]+dx} cy={leftHand[1]+dy} r="4" fill="#d9f99d" opacity=".85" />)}
        {[[-8,-4],[0,-9],[8,-4]].map(([dx,dy],i)=><circle key={`rh${i}`} cx={rightHand[0]+dx} cy={rightHand[1]+dy} r="4" fill="#d9f99d" opacity=".85" />)}

        <path d="M174 354 C151 376 132 402 118 433" fill="none" stroke="#65a30d" strokeWidth="26" strokeLinecap="round" />
        <path d="M227 355 C249 379 266 404 278 434" fill="none" stroke="#65a30d" strokeWidth="26" strokeLinecap="round" />
        <circle cx="117" cy="435" r="13" fill="#84cc16" />
        <circle cx="279" cy="435" r="13" fill="#84cc16" />

        {hasShoes && (
          <g filter="url(#gecko-soft-shadow)">
            <path d="M91 430 C108 419 131 421 143 435 C132 451 107 456 83 449 C83 441 86 435 91 430Z" fill={gear} stroke="#1e293b" strokeWidth="4" />
            <path d="M259 431 C278 418 301 422 313 437 C301 452 278 456 252 449 C252 441 255 435 259 431Z" fill={gear} stroke="#1e293b" strokeWidth="4" />
            <path d="M92 438 C108 432 122 433 134 439" fill="none" stroke="#fff" strokeOpacity=".62" strokeWidth="3" strokeLinecap="round" />
            <path d="M263 439 C279 432 294 434 304 440" fill="none" stroke="#fff" strokeOpacity=".62" strokeWidth="3" strokeLinecap="round" />
            <path d="M129 327 C120 343 118 365 126 383 C143 385 156 378 163 364 C158 346 148 333 129 327Z" fill={hasPremiumGear ? gear : "#64748b"} stroke="#334155" strokeWidth="4" />
            <path d="M133 335 C140 337 147 343 151 350" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {hasHarness && (
          <g>
            <path d="M145 329 C177 347 221 348 254 326" fill="none" stroke="#1e293b" strokeWidth="13" strokeLinecap="round" />
            <path d="M159 334 L168 371 M239 332 L231 372" stroke={gear} strokeWidth="9" strokeLinecap="round" />
            <rect x="193" y="336" width="23" height="14" rx="5" fill="url(#gecko-metal)" stroke="#1e293b" strokeWidth="2" />
            <path d="M206 346 C208 380 210 420 208 485" fill="none" stroke={isCrystal ? "#38bdf8" : "#f59e0b"} strokeWidth="7" strokeLinecap="round" />
            <path d="M209 348 C211 387 213 430 211 482" fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {hasQuickdraws && (
          <g>
            <Quickdraw x={256} y={336} rotate={-16} accent="#f97316" />
            <Quickdraw x={145} y={341} rotate={15} accent="#06b6d4" />
            {hasPremiumGear && <Quickdraw x={273} y={352} rotate={-26} accent="#eab308" />}
          </g>
        )}

        {hasPremiumGear && (
          <g>
            <path d="M164 255 C185 244 217 244 238 257 L244 308 C219 321 180 320 157 306Z" fill={gear} opacity=".22" stroke={gear} strokeWidth="3" />
            <path d="M186 270 L211 270 L219 293 L198 306 L178 293Z" fill="#fff" fillOpacity=".86" stroke={gear} strokeWidth="2" />
            <path d="M194 279 L203 276 L211 284 L206 296 L193 296 L187 287Z" fill={gear} opacity=".88" />
          </g>
        )}

        {isExpert && (
          <g opacity=".9">
            <circle cx="73" cy="141" r="4" fill="#fff" />
            <circle cx="82" cy="133" r="3" fill="#fff" />
            <circle cx="319" cy="115" r="4" fill="#fff" />
            <path d="M66 154 C73 148 82 145 91 145" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".7" />
          </g>
        )}

        {isMaster && (
          <g filter="url(#gecko-soft-shadow)">
            <path d="M158 102 L170 75 L188 92 L207 67 L223 92 L245 76 L238 111 C211 120 184 119 158 112Z" fill="#fbbf24" stroke="#b45309" strokeWidth="3" />
            <circle cx="207" cy="79" r="5" fill="#fff7ed" />
            <circle cx="171" cy="89" r="4" fill="#fde68a" />
            <circle cx="234" cy="88" r="4" fill="#fde68a" />
          </g>
        )}
      </g>

      <g filter="url(#gecko-soft-shadow)">
        <circle cx="57" cy="58" r="34" fill={accent} />
        <circle cx="57" cy="58" r="27" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="2" />
        <text x="57" y="69" textAnchor="middle" fontSize="34" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif">{level}</text>
      </g>

      <g transform="translate(28 466)">
        <rect x="0" y="0" width="236" height="34" rx="17" fill="#0f172a" opacity=".91" />
        <text x="118" y="23" textAnchor="middle" fontSize="17" fontWeight="800" letterSpacing="1.2" fill="#fff" fontFamily="system-ui, sans-serif">
          {String(label || "").toUpperCase()}
        </text>
      </g>

      {isCrystal && (
        <g transform="translate(328 457)" filter="url(#gecko-glow)">
          <path d="M0 27 L18 0 L37 27 L19 51Z" fill="url(#gecko-crystal)" stroke="#0284c7" strokeWidth="2" />
          <path d="M18 0 L19 51 M0 27 L37 27" stroke="#fff" strokeOpacity=".65" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
