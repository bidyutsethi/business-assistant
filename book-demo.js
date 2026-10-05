// "Book a Demo" / "Contact Sales" form. Public — no account needed. The
// request is saved by the API for the site owner to follow up on.
(function () {
  // book-demo.html?type=sales reuses the same form with sales wording.
  const kind = new URLSearchParams(window.location.search).get("type") === "sales" ? "sales" : "demo";

  function setFieldError(input, message) {
    const field = input.closest(".field");
    field.classList.add("field-error");
    let msg = field.querySelector(".error-msg");
    if (!msg) {
      msg = document.createElement("span");
      msg.className = "error-msg";
      field.appendChild(msg);
    }
    msg.textContent = message;
  }

  function clearFieldErrors(form) {
    form.querySelectorAll(".field").forEach((f) => {
      f.classList.remove("field-error");
      const msg = f.querySelector(".error-msg");
      if (msg) msg.remove();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("demoForm");
    const submitBtn = document.getElementById("demoSubmit");
    const name = document.getElementById("demoName");
    const email = document.getElementById("demoEmail");

    if (kind === "sales") {
      document.title = "Contact Sales — Business Assistant";
      document.getElementById("demoTitle").textContent = "Talk to sales";
      document.getElementById("demoSub").textContent = "Leave your details and we'll get back to you about plans and pricing.";
      document.querySelector('label[for="demoMessage"]').firstChild.textContent = "How can we help? ";
      submitBtn.textContent = "Contact sales";
    }
    const submitLabel = submitBtn.textContent;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFieldErrors(form);

      let valid = true;
      if (!name.value.trim()) {
        setFieldError(name, "Enter your name.");
        valid = false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        setFieldError(email, "Enter a valid email address.");
        valid = false;
      }
      if (!valid) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
      try {
        const res = await fetch(window.API_BASE + "/demo-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            fullName: name.value.trim(),
            email: email.value.trim(),
            company: document.getElementById("demoCompany").value.trim(),
            phone: document.getElementById("demoPhone").value.trim(),
            message: document.getElementById("demoMessage").value.trim(),
            website: document.getElementById("demoWebsite").value,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const isRealApiError = typeof data.error === "string" && res.status !== 404;
          showToast(isRealApiError ? data.error : "We couldn't send your request right now. Please try again shortly.", "error");
          return;
        }
        document.getElementById("demoDoneEmail").textContent = email.value.trim();
        document.getElementById("demoFormWrap").hidden = true;
        document.getElementById("demoDone").hidden = false;
      } catch (err) {
        showToast("We couldn't reach the server. Please try again in a moment.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      }
    });
  });
})();
