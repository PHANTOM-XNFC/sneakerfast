const WHATSAPP_URL = "https://wa.me/message/TUP6PJHVHAJYM1";

function setupWhatsAppButtons() {
  document.querySelectorAll("[data-whatsapp]").forEach(function (button) {
    button.classList.remove("is-disabled");
    button.removeAttribute("aria-disabled");
    button.addEventListener("click", function () {
      window.open(WHATSAPP_URL, "_blank", "noopener,noreferrer");
    });
  });
}

document.addEventListener("DOMContentLoaded", setupWhatsAppButtons);
