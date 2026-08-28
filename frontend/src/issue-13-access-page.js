const PASSWORD_POLICY_TEXT = "8 caractères minimum, dont 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial.";
const FORGOT_PASSWORD_HELP_TEXT = "Un code de réinitialisation valable une heure sera envoyé par e-mail si le compte est actif.";

function normalizedText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

function findLabel(card, predicate) {
  return [...card.querySelectorAll("label")].find((label) => predicate(normalizedText(label.textContent), label));
}

function enhancePasswordPolicy(card) {
  const label = findLabel(card, (text) => text.includes("politique mot de passe") || text.includes("règles du mot de passe"));
  if (!label) return false;

  if (label.textContent !== "Règles du mot de passe") {
    label.textContent = "Règles du mot de passe";
  }

  const container = label.parentElement;
  const input = container?.querySelector('input[readonly]');
  if (!container || !input) return false;

  input.classList.add("issue13-password-policy-input");
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;

  let message = container.querySelector(".issue13-password-policy-text");
  if (!message) {
    message = document.createElement("p");
    message.className = "issue13-password-policy-text";
    container.appendChild(message);
  }
  if (message.textContent !== PASSWORD_POLICY_TEXT) {
    message.textContent = PASSWORD_POLICY_TEXT;
  }
  return true;
}

function enhanceConsent(card) {
  const label = findLabel(card, (text, node) => node.querySelector('input[type="checkbox"]') && text.includes("j’accepte"));
  if (!label) return;

  const checkbox = label.querySelector('input[type="checkbox"]');
  if (!checkbox) return;

  label.classList.add("issue13-consent-label");

  let copy = label.querySelector(".issue13-consent-copy");
  if (!copy) {
    for (const child of [...label.childNodes]) {
      if (child !== checkbox) child.remove();
    }

    copy = document.createElement("span");
    copy.className = "issue13-consent-copy";
    copy.textContent = "J’accepte les conditions d’utilisation";

    const link = document.createElement("a");
    link.className = "issue13-consent-link";
    link.href = "/rgpd.html";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Consulter le texte RGPD";
    link.addEventListener("click", (event) => event.stopPropagation());

    copy.appendChild(document.createTextNode(" — "));
    copy.appendChild(link);
    label.appendChild(copy);
  }
}

function isRequestFormVisible(card) {
  // Le formulaire de réinitialisation affiche lui aussi les règles du mot de
  // passe : seul le champ Prénom, propre à la création de compte, permet de
  // distinguer les deux formulaires sans se tromper de bouton.
  return Boolean(findLabel(card, (text) => text === "prénom"));
}

function findForgotPasswordHelper(card) {
  return [...card.querySelectorAll(".small")].find((element) => {
    const text = normalizedText(element.textContent);
    return text.includes("administrateur pourra générer un code")
      || text.includes("demande sera journalisée")
      || text.includes("code de réinitialisation valable une heure");
  });
}

function enhanceForgotPasswordCopy(card) {
  const helper = findForgotPasswordHelper(card);

  if (helper && helper.textContent !== FORGOT_PASSWORD_HELP_TEXT) {
    helper.textContent = FORGOT_PASSWORD_HELP_TEXT;
  }

  return Boolean(helper);
}

function enhanceButtons(card, requestFormVisible, forgotPasswordFormVisible) {
  // Les changements de l’issue #15 ne doivent s’appliquer que sur
  // le formulaire de création de compte, jamais sur l’écran de connexion.
  const submitButton = card.querySelector(".auth-submit-row button");
  if (submitButton) {
    submitButton.classList.toggle("issue13-hidden", forgotPasswordFormVisible);

    if (requestFormVisible) {
      submitButton.textContent = "Création d’un compte";
      submitButton.classList.remove("secondary");
    }
  }

  const switchButtons = [...card.querySelectorAll(".auth-switcher button")];
  const requestSwitchButton = switchButtons.find((button) => {
    const text = normalizedText(button.textContent);
    return text.includes("demander un accès")
      || text.includes("demander la création d’un compte")
      || text.includes("création d’un compte");
  });
  const forgotPasswordButton = switchButtons.find((button) => normalizedText(button.textContent).includes("mot de passe perdu"));

  if (requestSwitchButton) {
    requestSwitchButton.classList.toggle("issue13-hidden", requestFormVisible);

    if (!requestFormVisible) {
      requestSwitchButton.textContent = "Création d’un compte";
    }
  }

  if (forgotPasswordButton) {
    forgotPasswordButton.classList.toggle("issue13-hidden", requestFormVisible);

    if (requestFormVisible) {
      forgotPasswordButton.setAttribute("aria-hidden", "true");
      forgotPasswordButton.tabIndex = -1;
    } else {
      forgotPasswordButton.removeAttribute("aria-hidden");
      forgotPasswordButton.removeAttribute("tabindex");
    }

    // Sur l’écran « Mot de passe perdu », le gros bouton redondant est masqué.
    // Le bouton du sélecteur conserve l’action : un premier clic ouvre l’écran,
    // puis un clic depuis cet écran envoie la demande de code de réinitialisation.
    if (!forgotPasswordButton.dataset.issue13ResetActionBound) {
      forgotPasswordButton.dataset.issue13ResetActionBound = "true";
      forgotPasswordButton.addEventListener("click", (event) => {
        const currentCard = forgotPasswordButton.closest(".auth-card");
        const currentForgotFormVisible = Boolean(currentCard && findForgotPasswordHelper(currentCard));
        if (!currentForgotFormVisible) return;

        const currentSubmitButton = currentCard.querySelector(".auth-submit-row button");
        if (!currentSubmitButton) return;

        event.preventDefault();
        event.stopPropagation();
        currentSubmitButton.click();
      }, true);
    }
  }
}

function hideVersion(card) {
  for (const element of card.querySelectorAll(".small")) {
    if (normalizedText(element.textContent).startsWith("version ")) {
      element.classList.add("issue13-hidden");
    }
  }
}

function enhanceAccessPage() {
  const card = document.querySelector(".auth-card");
  if (!card) return;

  enhancePasswordPolicy(card);
  const requestFormVisible = isRequestFormVisible(card);
  const forgotPasswordFormVisible = enhanceForgotPasswordCopy(card);
  card.classList.toggle("issue13-request-form", requestFormVisible);
  if (requestFormVisible) enhanceConsent(card);
  enhanceButtons(card, requestFormVisible, forgotPasswordFormVisible);
  hideVersion(card);
}

let scheduled = false;
function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceAccessPage();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleEnhancement, { once: true });
} else {
  scheduleEnhancement();
}

const root = document.documentElement;
if (root) {
  new MutationObserver(scheduleEnhancement).observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
