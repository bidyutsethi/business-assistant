// Assistant page: sends each question to the API, which answers from live
// business data. The conversation is kept in this browser (localStorage) so
// it survives a page reload; "New conversation" clears it.
(function () {
  const STORAGE_KEY = `ba_chat_${window.BA_AUTH.user.id}`;
  const MAX_SAVED = 60;

  let chatWindow;
  // Each entry: { role: "user" | "ai", text, stats?, link?, confirm?, outcome? }
  let messages = [];

  function load() {
    try {
      messages = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (err) {
      messages = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_SAVED)));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderConfirm(message) {
    const card = el("div", "confirm-card");
    card.appendChild(el("span", "tag", "Confirmation required"));
    card.appendChild(el("p", null, message.confirm.prompt));
    const actions = el("div", "confirm-actions");
    card.appendChild(actions);

    function showOutcome() {
      const ok = message.outcome === "confirmed";
      const note = el("span", null, ok ? "✓ Confirmed and saved" : "✕ Cancelled — nothing was changed");
      note.style.cssText = `font-size:13px;font-weight:600;color:var(${ok ? "--success" : "--danger"});`;
      actions.replaceChildren(note);
    }

    if (message.outcome) {
      showOutcome();
      return card;
    }

    const yes = el("button", "btn btn-approve btn-sm", message.confirm.confirmLabel || "Confirm");
    const no = el("button", "btn btn-reject btn-sm", "Cancel");
    actions.append(yes, no);

    yes.addEventListener("click", async () => {
      yes.disabled = no.disabled = true;
      try {
        if (message.confirm.type === "order_status") {
          await baFetch(`/orders/${message.confirm.orderId}`, {
            method: "PUT",
            body: JSON.stringify({ status: message.confirm.status }),
          });
        }
        message.outcome = "confirmed";
        save();
        showOutcome();
        showToast("Change saved.", "success");
      } catch (err) {
        yes.disabled = no.disabled = false;
        showToast(err.message || "Couldn't save the change.", "error");
      }
    });
    no.addEventListener("click", () => {
      message.outcome = "cancelled";
      save();
      showOutcome();
    });
    return card;
  }

  function renderMessage(message) {
    const wrap = el("div", `msg ${message.role}`);
    wrap.appendChild(el("div", "msg-avatar", message.role === "user" ? "YOU" : "BA"));
    const bubble = el("div", "msg-bubble", message.text);
    wrap.appendChild(bubble);

    if (message.stats && message.stats.length) {
      const list = el("div", "stat-list");
      message.stats.forEach((s) => {
        const row = el("div", "stat-row");
        row.appendChild(el("span", null, s.label));
        row.appendChild(el("strong", null, s.value));
        list.appendChild(row);
      });
      bubble.appendChild(list);
    }
    if (message.link) {
      const link = el("a", "msg-link", `${message.link.label} →`);
      link.href = message.link.href;
      bubble.appendChild(link);
    }
    if (message.role === "ai" && !message.pending) {
      const actions = el("div", "msg-actions");
      const copy = el("button", null, "Copy");
      copy.type = "button";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(plainText(message));
          showToast("Copied.", "success");
        } catch (err) {
          showToast("Couldn't copy to the clipboard.", "error");
        }
      });
      actions.appendChild(copy);
      bubble.appendChild(actions);
    }

    chatWindow.appendChild(wrap);
    if (message.confirm) chatWindow.appendChild(renderConfirm(message));
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return wrap;
  }

  function plainText(message) {
    const lines = [message.text];
    (message.stats || []).forEach((s) => lines.push(`  ${s.label}: ${s.value}`));
    return lines.join("\n");
  }

  function greeting() {
    const firstName = window.BA_AUTH.user.fullName.split(" ")[0];
    return {
      role: "ai",
      text:
        `Hello ${firstName}. I answer from your live sales, customer, support and task data. ` +
        "Ask a question, or pick one of the suggestions.",
    };
  }

  function renderAll() {
    chatWindow.replaceChildren();
    renderMessage(greeting());
    messages.forEach(renderMessage);
  }

  async function ask(text) {
    const question = { role: "user", text };
    messages.push(question);
    renderMessage(question);

    const typing = renderMessage({ role: "ai", text: "Checking your data...", pending: true });
    try {
      const data = await baFetch("/assistant/ask", { method: "POST", body: JSON.stringify({ message: text }) });
      const answer = { role: "ai", text: data.reply, stats: data.stats, link: data.link, confirm: data.confirm };
      messages.push(answer);
      typing.remove();
      renderMessage(answer);
    } catch (err) {
      typing.remove();
      // Not saved: a failed request shouldn't become part of the history.
      renderMessage({ role: "ai", text: err.message || "I couldn't reach the server. Please try again." });
    }
    save();
  }

  document.addEventListener("DOMContentLoaded", () => {
    chatWindow = document.getElementById("chatWindow");
    const form = document.getElementById("chatForm");
    const input = form.querySelector("input");

    load();
    renderAll();

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      ask(text);
    });

    document.querySelectorAll("[data-ask]").forEach((chip) => {
      chip.addEventListener("click", () => ask(chip.dataset.ask));
    });

    document.getElementById("newChatBtn").addEventListener("click", () => {
      messages = [];
      save();
      renderAll();
      input.focus();
    });

    document.getElementById("exportChatBtn").addEventListener("click", () => {
      if (!messages.length) {
        showToast("There's no conversation to export yet.", "error");
        return;
      }
      const text = messages
        .map((m) => `${m.role === "user" ? "You" : "Assistant"}: ${plainText(m)}`)
        .join("\r\n\r\n");
      downloadFile(`assistant-conversation-${new Date().toISOString().slice(0, 10)}.txt`, text);
    });
  });
})();
