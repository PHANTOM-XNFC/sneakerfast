const WHATSAPP_NUMBER = "";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function buildWhatsAppUrl(message) {
  const number = digitsOnly(WHATSAPP_NUMBER);
  if (!number) {
    return "";
  }
  const text = encodeURIComponent(message || "Olá! Tenho interesse nos produtos SneakerFast.");
  return "https://wa.me/" + number + "?text=" + text;
}

function setupWhatsAppButtons() {
  const buttons = document.querySelectorAll("[data-whatsapp]");
  const notes = document.querySelectorAll("[data-whatsapp-note]");
  const url = buildWhatsAppUrl(document.body.getAttribute("data-whatsapp-message"));
  const ready = Boolean(url);

  buttons.forEach(function (button) {
    if (ready) {
      button.classList.remove("is-disabled");
      button.removeAttribute("aria-disabled");
      button.addEventListener("click", function () {
        window.location.href = url;
      });
      return;
    }

    button.classList.add("is-disabled");
    button.setAttribute("aria-disabled", "true");
    button.addEventListener("click", function (event) {
      event.preventDefault();
    });
  });

  notes.forEach(function (note) {
    note.hidden = ready;
  });
}

document.addEventListener("DOMContentLoaded", setupWhatsAppButtons);
