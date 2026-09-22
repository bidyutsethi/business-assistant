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

// ---------- Shared line-chart renderer (dashboard, reports, analytics) ----------
// points: array of objects; valueKey: which numeric field to plot.
function renderLineChart(svg, points, valueKey) {
  if (!svg) return;
  if (!points || !points.length) {
    svg.innerHTML = "";
    return;
  }
  const values = points.map((p) => Number(p[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = points.length > 1 ? 600 / (points.length - 1) : 600;

  const coords = values.map((v, i) => {
    const x = points.length > 1 ? i * stepX : 0;
    const y = 150 - ((v - min) / range) * 140;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = coords.join(" ");
  const lastX = points.length > 1 ? (points.length - 1) * stepX : 0;
  const fill = `0,160 ${line} ${lastX.toFixed(1)},160`;

  svg.innerHTML = `
    <polyline points="${fill}" fill="rgba(59,91,253,0.08)" stroke="none"></polyline>
    <polyline points="${line}" fill="none" stroke="#3b5bfd" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
  `;
}
window.renderLineChart = renderLineChart;

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

  document.querySelectorAll("[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showToast(`${btn.dataset.export} export will be available once connected to a report backend.`, "error");
    });
  });
});
