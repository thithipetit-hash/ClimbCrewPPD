import React, { useMemo, useRef, useState } from "react";
import { getGeckoLevelInfo } from "../lib/gecko-level.js";
import { customAvatarSource } from "../lib/custom-avatar.js";
import "../styles/profile-gecko.css";

const LEVEL_ACCENTS = ["#65a30d", "#4d7c0f", "#0284c7", "#2563eb", "#7c3aed", "#9333ea", "#d97706", "#0ea5e9"];
const AVATAR_ROOT = "/media/avatars/split";
const PROFILE_ROOT = "/media/avatars/profile";
const EVOLUTION_ROOT = "/media/avatars/evolutions";
const ASSET_VERSION = "260817010";
const EVOLUTION_LABELS = ["Découverte", "Initiation", "Autonome", "Confirmé", "Technique", "Expert", "Maître", "Élite"];
const CUSTOM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CUSTOM_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function prepareCustomImage(file) {
  return new Promise((resolve, reject) => {
    if (!CUSTOM_IMAGE_TYPES.has(file.type)) {
      reject(new Error("Format refusé. Utilisez une image PNG, JPEG ou WebP."));
      return;
    }
    if (file.size > CUSTOM_IMAGE_MAX_BYTES) {
      reject(new Error("Image trop volumineuse. La taille maximale est de 5 Mo."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire cette image."));
    reader.onload = () => {
      const source = new Image();
      source.onerror = () => reject(new Error("Le fichier ne contient pas une image valide."));
      source.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext("2d");
        const cropSize = Math.min(source.naturalWidth, source.naturalHeight);
        const sourceX = (source.naturalWidth - cropSize) / 2;
        const sourceY = (source.naturalHeight - cropSize) / 2;
        context.clearRect(0, 0, 512, 512);
        context.drawImage(source, sourceX, sourceY, cropSize, cropSize, 0, 0, 512, 512);
        const preparedImage = canvas.toDataURL("image/webp", 0.86);
        if (preparedImage.length > 450000) {
          reject(new Error("L’image reste trop volumineuse après conversion. Choisissez une image plus simple."));
          return;
        }
        resolve(preparedImage);
      };
      source.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function asset(root, name, extension = "webp") {
  return `${root}/${name}.${extension}?v=${ASSET_VERSION}`;
}

function evolutionImages(avatarId) {
  return EVOLUTION_LABELS.map((_, index) => `${EVOLUTION_ROOT}/${avatarId}/level-${index + 1}.webp?v=${ASSET_VERSION}`);
}

function evolutionImagesByVariant(avatarId) {
  return {
    masculine: EVOLUTION_LABELS.map((_, index) => `${EVOLUTION_ROOT}/${avatarId}/homme/level-${index + 1}.webp?v=${ASSET_VERSION}`),
    feminine: EVOLUTION_LABELS.map((_, index) => `${EVOLUTION_ROOT}/${avatarId}/femme/level-${index + 1}.webp?v=${ASSET_VERSION}`),
  };
}

export const AVATAR_OPTIONS = Object.freeze([
  { id: "gecko", label: "Gecko", group: "Animaux", image: asset(AVATAR_ROOT, "gecko"), evolutionImagesByVariant: evolutionImagesByVariant("gecko") },
  { id: "bouquetin", label: "Bouquetin", group: "Animaux", image: asset(AVATAR_ROOT, "bouquetin"), evolutionImagesByVariant: evolutionImagesByVariant("bouquetin") },
  { id: "capucin", label: "Singe capucin", group: "Animaux", image: asset(AVATAR_ROOT, "capucin"), evolutionImagesByVariant: evolutionImagesByVariant("capucin") },
  { id: "ecureuil", label: "Écureuil", group: "Animaux", image: asset(AVATAR_ROOT, "ecureuil"), evolutionImagesByVariant: evolutionImagesByVariant("ecureuil") },
  { id: "paresseux", label: "Paresseux", group: "Animaux", image: asset(AVATAR_ROOT, "paresseux"), evolutionImagesByVariant: evolutionImagesByVariant("paresseux") },
  { id: "leopard_neiges", label: "Léopard des neiges", group: "Animaux", image: asset(AVATAR_ROOT, "leopard-neiges"), evolutionImagesByVariant: evolutionImagesByVariant("leopard_neiges") },
  { id: "orang_outan", label: "Orang-outan bloqueur", group: "Animaux", image: asset(AVATAR_ROOT, "orang-outan"), evolutionImagesByVariant: evolutionImagesByVariant("orang_outan") },
  { id: "pieuvre", label: "Pieuvre grimpeuse", group: "Animaux", image: asset(AVATAR_ROOT, "pieuvre"), evolutionImagesByVariant: evolutionImagesByVariant("pieuvre") },
  { id: "robot", label: "Robot assureur", group: "Personnages", image: asset(AVATAR_ROOT, "robot"), evolutionImagesByVariant: evolutionImagesByVariant("robot") },
  { id: "astronaute", label: "Astronaute en SAE", group: "Personnages", image: asset(AVATAR_ROOT, "astronaute"), evolutionImagesByVariant: evolutionImagesByVariant("astronaute") },
  { id: "capybara", label: "Capybara zen", group: "Animaux", image: asset(AVATAR_ROOT, "capybara"), evolutionImagesByVariant: evolutionImagesByVariant("capybara") },
  { id: "chevalier", label: "Chevalier grimpeur", group: "Personnages", image: asset(AVATAR_ROOT, "chevalier"), evolutionImagesByVariant: evolutionImagesByVariant("chevalier") },
  { id: "humain_homme", label: "Grimpeur hyperréaliste", group: "Personnages", image: asset(AVATAR_ROOT, "humain-homme"), evolutionImages: evolutionImages("humain_homme") },
  { id: "humain_femme", label: "Grimpeuse hyperréaliste", group: "Personnages", image: asset(AVATAR_ROOT, "humain-femme"), evolutionImages: evolutionImages("humain_femme") },
  { id: "fraise", label: "Fraise verticale", group: "Fruits", image: asset(PROFILE_ROOT, "avatar-fraise"), evolutionImagesByVariant: evolutionImagesByVariant("fraise") },
  { id: "banane", label: "Banane dynamique", group: "Fruits", image: asset(PROFILE_ROOT, "avatar-banane"), evolutionImagesByVariant: evolutionImagesByVariant("banane") },
  { id: "kiwi", label: "Kiwi tenace", group: "Fruits", image: asset(PROFILE_ROOT, "avatar-kiwi"), evolutionImagesByVariant: evolutionImagesByVariant("kiwi") },
  { id: "pasteque", label: "Pastèque puissante", group: "Fruits", image: asset(PROFILE_ROOT, "avatar-pasteque"), evolutionImagesByVariant: evolutionImagesByVariant("pasteque") },
  { id: "ananas", label: "Ananas engagé", group: "Fruits", image: asset(PROFILE_ROOT, "avatar-ananas"), evolutionImagesByVariant: evolutionImagesByVariant("ananas") },
  { id: "chausson", label: "Chausson d’escalade", group: "Objets", image: asset(PROFILE_ROOT, "avatar-chausson"), evolutionImagesByVariant: evolutionImagesByVariant("chausson") },
  { id: "mousqueton", label: "Mousqueton", group: "Objets", image: asset(PROFILE_ROOT, "avatar-mousqueton"), evolutionImagesByVariant: evolutionImagesByVariant("mousqueton") },
  { id: "gourde", label: "Gourde", group: "Objets", image: asset(PROFILE_ROOT, "avatar-gourde"), evolutionImagesByVariant: evolutionImagesByVariant("gourde") },
  { id: "casque", label: "Casque", group: "Objets", image: asset(PROFILE_ROOT, "avatar-casque"), evolutionImagesByVariant: evolutionImagesByVariant("casque") },
  { id: "sac_magnesie", label: "Sac à magnésie", group: "Objets", image: asset(PROFILE_ROOT, "avatar-sac-magnesie"), evolutionImagesByVariant: evolutionImagesByVariant("sac_magnesie") },
]);

export const ANIMAL_OPTIONS = AVATAR_OPTIONS;

const AVATAR_GROUPS = [...new Set(AVATAR_OPTIONS.map((option) => option.group))];

function imageForLevel(avatar, level, variant) {
  const index = Math.max(0, Math.min(EVOLUTION_LABELS.length - 1, level - 1));
  const variantImages = variant === "masculine" || variant === "feminine"
    ? avatar.evolutionImagesByVariant?.[variant]
    : null;
  const stableVariantFallback = avatar.evolutionImagesByVariant?.masculine
    || avatar.evolutionImagesByVariant?.feminine;

  return variantImages?.[index]
    || avatar.evolutionImages?.[index]
    || stableVariantFallback?.[index]
    || avatar.image;
}

export default function ProfileGecko({ grade, sexe, participant, onProfileUpdate, editable = true, compact = false }) {
  const { level, variant } = getGeckoLevelInfo(grade, sexe);
  const [showEvolutionHistory, setShowEvolutionHistory] = useState(false);
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [customImageError, setCustomImageError] = useState("");
  const fileInputRef = useRef(null);
  const accent = variant === "feminine" ? "#db2777" : LEVEL_ACCENTS[level - 1];
  const avatar = useMemo(
    () => AVATAR_OPTIONS.find((option) => option.id === participant?.avatarId) || AVATAR_OPTIONS[0],
    [participant?.avatarId],
  );
  const customImage = customAvatarSource(participant);

  async function onCustomImageChange(event) {
    const file = event.target.files?.[0];
    if (!file || !participant?.id) return;
    setCustomImageError("");
    try {
      const preparedImage = await prepareCustomImage(file);
      await onProfileUpdate?.({ customAvatarImage: preparedImage });
      setShowEvolutionHistory(false);
    } catch (error) {
      setCustomImageError(error.message || "Impossible de charger cette image.");
    } finally {
      event.target.value = "";
    }
  }

  function removeCustomImage() {
    onProfileUpdate?.({ customAvatarImage: "" });
    setCustomImageError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleAvatarImageClick() {
    if (editable) {
      setShowAvatarEditor((visible) => !visible);
      return;
    }
    if (!customImage) setShowEvolutionHistory((visible) => !visible);
  }

  return (
    <div className={`card profile-gecko-card${compact ? " profile-gecko-card--compact" : ""}`}>
      {!editable && (
        <div className="card-header profile-gecko-header">
          <h3 style={{ margin: 0 }}>Profil public</h3>
        </div>
      )}

      <div className="profile-gecko-stage" style={{ "--gecko-accent": accent }} data-level={level}>
        <button
          type="button"
          className="profile-gecko-real-image"
          aria-label={editable ? "Choisir l’avatar, l’image ou le sexe" : customImage ? "Image de profil personnalisée" : "Afficher les évolutions passées de l’avatar"}
          aria-expanded={editable ? showAvatarEditor : showEvolutionHistory}
          aria-controls={editable ? "profile-avatar-editor" : "profile-avatar-evolution-history"}
          onClick={handleAvatarImageClick}
          title={editable ? "Cliquer pour modifier l’avatar, l’image ou le sexe" : undefined}
        >
          <img className={`profile-animal-image${customImage ? " profile-custom-image" : ""}`} src={customImage || imageForLevel(avatar, level, variant)} alt="" draggable="false" />
        </button>

        {editable && showAvatarEditor && (
          <div id="profile-avatar-editor" className="profile-avatar-evolution-history profile-avatar-editor">
            <strong>Personnaliser mon profil</strong>

            <div className="grid two" style={{ marginTop: 8 }}>
              <label>
                <span>Avatar</span>
                <select value={avatar.id} onChange={(event) => onProfileUpdate?.({ avatarId: event.target.value })}>
                  {AVATAR_GROUPS.map((group) => (
                    <optgroup key={group} label={group}>
                      {AVATAR_OPTIONS.filter((option) => option.group === group).map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label>
                <span>Sexe</span>
                <select value={String(participant?.sexe || "").toUpperCase()} onChange={(event) => onProfileUpdate?.({ sexe: event.target.value })}>
                  <option value="">Non précisé</option>
                  <option value="M">Homme</option>
                  <option value="F">Femme</option>
                </select>
              </label>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onCustomImageChange}
              style={{ display: "none" }}
            />

            <div className="group" style={{ marginTop: 10 }}>
              <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()}>
                Charger une image personnelle
              </button>
              {customImage && (
                <button type="button" className="secondary" onClick={removeCustomImage}>
                  Revenir à l’avatar
                </button>
              )}
            </div>

            <div className="small profile-custom-image-help" style={{ marginTop: 8 }}>
              Image personnelle : PNG, JPEG ou WebP · 5 Mo maximum · format carré 512×512 recommandé.
              L’image est recadrée au centre et convertie automatiquement en WebP 512×512.
            </div>
            {customImageError && <div className="profile-custom-image-error" role="alert">{customImageError}</div>}
          </div>
        )}

        {!editable && !customImage && showEvolutionHistory && (
          <div id="profile-avatar-evolution-history" className="profile-avatar-evolution-history">
            <strong>Images des évolutions précédentes</strong>
            {level > 1 ? (
              <div className="profile-avatar-evolution-gallery">
                {EVOLUTION_LABELS.slice(0, level - 1).map((evolutionLabel, index) => (
                  <figure className="profile-avatar-history-item" key={evolutionLabel}>
                    <span className="profile-gecko-stage profile-avatar-history-stage" data-level={index + 1}>
                      <img className="profile-animal-image" src={imageForLevel(avatar, index + 1, variant)} alt={`${avatar.label} au niveau ${index + 1}`} draggable="false" />
                    </span>
                    <figcaption>Niveau {index + 1} · {evolutionLabel}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="small">Aucune évolution précédente pour le moment.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
