import { apiFetch } from "./lib/api.js";

let scheduled = false;
let participantsPromise = null;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadParticipants({ force = false } = {}) {
  if (force || !participantsPromise) {
    participantsPromise = apiFetch("/participants")
      .then((participants) => Array.isArray(participants) ? participants : [])
      .catch((error) => {
        participantsPromise = null;
        throw error;
      });
  }
  return participantsPromise;
}

function findParticipant(details, participants) {
  const email = String(details.querySelector('input[type="email"]')?.value || "").trim().toLowerCase();
  if (email) {
    const byEmail = participants.find((participant) => String(participant.email || "").trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }

  const summaryName = normalize(details.querySelector("summary")?.textContent);
  if (!summaryName) return null;

  return participants.find((participant) => {
    const firstLast = normalize(`${participant.prenom || ""} ${participant.nom || ""}`);
    const lastFirst = normalize(`${participant.nom || ""} ${participant.prenom || ""}`);
    return summaryName === firstLast || summaryName === lastFirst;
  }) || null;
}

function createQualificationLabel({ key, label, checked }) {
  const wrapper = document.createElement("label");
  wrapper.className = "participant-qualification-option";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.qualificationKey = key;
  input.checked = Boolean(checked);

  wrapper.append(input, document.createTextNode(` ${label}`));
  return wrapper;
}

async function saveQualifications(details, participant, status) {
  const inputs = [...details.querySelectorAll("[data-qualification-key]")];
  const saeInput = inputs.find((input) => input.dataset.qualificationKey === "initiateurSae");
  const sneInput = inputs.find((input) => input.dataset.qualificationKey === "initiateurSne");
  if (!saeInput || !sneInput) return;

  inputs.forEach((input) => { input.disabled = true; });
  status.textContent = "Enregistrement…";

  try {
    const saved = await apiFetch(`/admin/participants/${encodeURIComponent(participant.id)}/qualifications`, {
      method: "PUT",
      body: JSON.stringify({
        initiateurSae: saeInput.checked,
        initiateurSne: sneInput.checked,
      }),
    });

    participant.initiateurSae = Boolean(saved.initiateurSae);
    participant.initiateurSne = Boolean(saved.initiateurSne);
    saeInput.checked = participant.initiateurSae;
    sneInput.checked = participant.initiateurSne;
    status.textContent = "Enregistré · badges actualisés au prochain rechargement";
  } catch (error) {
    saeInput.checked = Boolean(participant.initiateurSae);
    sneInput.checked = Boolean(participant.initiateurSne);
    status.textContent = `Erreur : ${error.message || error}`;
  } finally {
    inputs.forEach((input) => { input.disabled = false; });
  }
}

function installControls(details, participant) {
  if (details.dataset.initiatorQualificationsInstalled === "true") return;

  const groups = [...details.querySelectorAll(".group")];
  const rolesGroup = groups.find((group) => {
    const text = String(group.textContent || "");
    return text.includes("Cotisation") && text.includes("FFME") && text.includes("Encadrant");
  });
  if (!rolesGroup) return;

  const sae = createQualificationLabel({
    key: "initiateurSae",
    label: "Initiateur SAE",
    checked: participant.initiateurSae,
  });
  const sne = createQualificationLabel({
    key: "initiateurSne",
    label: "Initiateur SNE",
    checked: participant.initiateurSne,
  });
  const status = document.createElement("span");
  status.className = "small participant-qualification-status";
  status.setAttribute("aria-live", "polite");

  rolesGroup.append(sae, sne, status);
  details.dataset.initiatorQualificationsInstalled = "true";

  [sae, sne].forEach((label) => {
    label.querySelector("input")?.addEventListener("change", () => {
      saveQualifications(details, participant, status);
    });
  });
}

async function updateQualificationControls() {
  const cards = [...document.querySelectorAll(".participant-admin-details")];
  if (!cards.length) return;

  let participants;
  try {
    participants = await loadParticipants();
  } catch (error) {
    console.error("Chargement des qualifications Initiateur impossible", error);
    return;
  }

  cards.forEach((details) => {
    const participant = findParticipant(details, participants);
    if (participant) installControls(details, participant);
  });
}

function scheduleUpdate() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    updateQualificationControls();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleUpdate, { once: true });
} else {
  scheduleUpdate();
}

new MutationObserver(scheduleUpdate).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
