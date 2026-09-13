/* Business Assistant — shared front-end interactions
   No backend is wired up yet. Everything here simulates UI state
   so a real API/auth/AI layer can be connected later. */

// ---------- Toasts ----------
function showToast(message, type = "success") {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "error"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>';
  toast.innerHTML = `${icon}<span>${message}</span>`;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}
window.showToast = showToast;

// ---------- Mobile nav toggle ----------
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.style.display === "flex";
      links.style.display = open ? "none" : "flex";
      links.style.flexDirection = "column";
      links.style.position = "absolute";
      links.style.top = "72px";
      links.style.left = "0";
      links.style.right = "0";
      links.style.background = "#0b0f1a";
      links.style.padding = "20px 32px";
    });
  }

  // ---------- Approval demo (Approve/Reject) ----------
  document.querySelectorAll(".approval-card").forEach((card) => {
    const approveBtn = card.querySelector(".btn-approve");
    const rejectBtn = card.querySelector(".btn-reject");
    approveBtn?.addEventListener("click", () => {
      card.querySelector(".tag").textContent = "✓ Approved";
      card.querySelector(".approval-actions").innerHTML = "";
      showToast("Refund approved and sent for processing.", "success");
    });
    rejectBtn?.addEventListener("click", () => {
      card.querySelector(".tag").textContent = "✕ Rejected";
      card.querySelector(".approval-actions").innerHTML = "";
      showToast("Action rejected. No changes were made.", "error");
    });
  });

  // ---------- Confirm cards on AI assistant page ----------
  document.querySelectorAll(".confirm-card").forEach((card) => {
    const confirmBtn = card.querySelector(".confirm-yes");
    const cancelBtn = card.querySelector(".confirm-no");
    confirmBtn?.addEventListener("click", () => {
      card.querySelector(".confirm-actions").innerHTML = '<span style="font-size:13px;color:var(--success);font-weight:600;">✓ Confirmed and processed</span>';
      showToast("Action confirmed.", "success");
    });
    cancelBtn?.addEventListener("click", () => {
      card.querySelector(".confirm-actions").innerHTML = '<span style="font-size:13px;color:var(--danger);font-weight:600;">✕ Cancelled</span>';
      showToast("Action cancelled.", "error");
    });
  });

  // ---------- Login/signup form validation (frontend-only demo) ----------
  document.querySelectorAll("form[data-auth-form]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let valid = true;
      form.querySelectorAll("input[required]").forEach((input) => {
        const field = input.closest(".field");
        field.classList.remove("field-error");
        const existingError = field.querySelector(".error-msg");
        if (existingError) existingError.remove();
        if (!input.value.trim() || (input.type === "email" && !input.value.includes("@"))) {
          valid = false;
          field.classList.add("field-error");
          const msg = document.createElement("span");
          msg.className = "error-msg";
          msg.textContent = input.type === "email" ? "Enter a valid email address." : "This field is required.";
          field.appendChild(msg);
        }
      });
      if (!valid) {
        showToast("Please fix the highlighted fields.", "error");
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = "Please wait...";
      submitBtn.disabled = true;
      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        showToast("Authentication is not connected yet in this preview.", "error");
      }, 900);
    });
  });

  // ---------- Chat input (AI assistant page demo) ----------
  const chatForm = document.getElementById("chatForm");
  const chatWindow = document.getElementById("chatWindow");
  if (chatForm && chatWindow) {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = chatForm.querySelector("input");
      const text = input.value.trim();
      if (!text) return;
      appendMessage(chatWindow, "user", text);
      input.value = "";
      chatWindow.scrollTop = chatWindow.scrollHeight;
      const typing = appendMessage(chatWindow, "ai", "Thinking...", true);
      setTimeout(() => {
        typing.querySelector(".msg-bubble").textContent =
          "This is a UI preview. Once connected to the AI Agent backend, I'll query your live business data and tools to answer this.";
        chatWindow.scrollTop = chatWindow.scrollHeight;
      }, 900);
    });

    document.querySelectorAll(".suggestion-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const input = chatForm.querySelector("input");
        input.value = chip.textContent.replace(/^"|"$/g, "");
        chatForm.dispatchEvent(new Event("submit"));
      });
    });
  }

  function appendMessage(container, role, text, isTyping = false) {
    const msg = document.createElement("div");
    msg.className = `msg ${role}`;
    msg.innerHTML = `
      <div class="msg-avatar">${role === "user" ? "YOU" : "AI"}</div>
      <div class="msg-bubble">${text}</div>
    `;
    container.appendChild(msg);
    return msg;
  }

  // ---------- MIS report generator ----------
  const reportForm = document.getElementById("reportGenForm");
  if (reportForm) {
    reportForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const output = document.getElementById("reportOutput");
      const btn = reportForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = "Generating...";
      btn.disabled = true;
      output.querySelectorAll(".report-section, .report-output-head").forEach(el => el.style.opacity = "0.35");
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        output.querySelectorAll(".report-section, .report-output-head").forEach(el => el.style.opacity = "1");
        output.scrollIntoView({ behavior: "smooth", block: "start" });
        showToast("Report generated from sample data.", "success");
      }, 1000);
    });
  }

  document.querySelectorAll("[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showToast(`${btn.dataset.export} export will be available once connected to a report backend.`, "error");
    });
  });
});
