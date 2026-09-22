// Support tickets page: filterable list, inline status change, new ticket.
(function () {
  const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

  const STATUS_META = {
    open: { cls: "open", label: "Open" },
    pending: { cls: "pending", label: "Pending" },
    resolved: { cls: "resolved", label: "Resolved" },
  };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  let currentStatus = "";
  let customersCache = [];

  async function loadTickets() {
    const tbody = document.getElementById("ticketsBody");
    const emptyState = document.getElementById("ticketsEmpty");
    try {
      const qs = currentStatus ? `?status=${encodeURIComponent(currentStatus)}` : "";
      const { tickets } = await baFetch(`/support${qs}`);
      if (!tickets.length) {
        tbody.innerHTML = "";
        emptyState.hidden = false;
        return;
      }
      emptyState.hidden = true;
      tbody.innerHTML = tickets
        .map((t) => `
        <tr data-id="${t.id}">
          <td>${escapeHtml(t.subject)}</td>
          <td>${escapeHtml(t.customer_name || "—")}</td>
          <td>${t.region}</td>
          <td>
            <select class="status-select status-change" data-id="${t.id}">
              ${Object.entries(STATUS_META).map(([val, m]) => `<option value="${val}" ${val === t.status ? "selected" : ""}>${m.label}</option>`).join("")}
            </select>
          </td>
          <td class="text-muted">${dateFmt.format(new Date(t.created_at))}</td>
          <td>
            <div class="table-actions">
              <button class="delete-btn danger" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
            </div>
          </td>
        </tr>`)
        .join("");
    } catch (err) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
      document.querySelector("#ticketsEmpty h4").textContent = "Couldn't load tickets";
      document.querySelector("#ticketsEmpty p").textContent = err.message || "Could not reach the API.";
    }
  }

  async function loadCustomersIntoSelect() {
    const select = document.getElementById("ticketCustomer");
    try {
      const { customers } = await baFetch("/customers");
      customersCache = customers;
      select.innerHTML = customers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.region})</option>`).join("");
    } catch (err) {
      select.innerHTML = `<option value="">Couldn't load customers</option>`;
    }
  }

  const modal = document.getElementById("ticketModal");
  function openModal() {
    document.getElementById("ticketForm").reset();
    modal.classList.add("open");
  }
  function closeModal() {
    modal.classList.remove("open");
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadTickets();

    document.getElementById("statusFilters").addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-pill");
      if (!btn) return;
      document.querySelectorAll("#statusFilters .filter-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentStatus = btn.dataset.status;
      loadTickets();
    });

    document.getElementById("addTicketBtn").addEventListener("click", async () => {
      if (!customersCache.length) await loadCustomersIntoSelect();
      if (!customersCache.length) {
        showToast("Add a customer first before creating a ticket.", "error");
        return;
      }
      openModal();
    });
    document.getElementById("ticketCancelBtn").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    document.getElementById("ticketsBody").addEventListener("change", async (e) => {
      if (!e.target.classList.contains("status-change")) return;
      try {
        await baFetch(`/support/${e.target.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ status: e.target.value }),
        });
        showToast("Ticket updated.", "success");
      } catch (err) {
        showToast(err.message || "Couldn't update the ticket.", "error");
        loadTickets();
      }
    });

    document.getElementById("ticketsBody").addEventListener("click", async (e) => {
      const row = e.target.closest("tr");
      if (!row || !e.target.closest(".delete-btn")) return;
      if (!confirm("Delete this ticket?")) return;
      try {
        await baFetch(`/support/${row.dataset.id}`, { method: "DELETE" });
        showToast("Ticket deleted.", "success");
        loadTickets();
      } catch (err) {
        showToast(err.message || "Couldn't delete this ticket.", "error");
      }
    });

    document.getElementById("ticketForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await baFetch("/support", {
          method: "POST",
          body: JSON.stringify({
            subject: document.getElementById("ticketSubject").value.trim(),
            customerId: Number(document.getElementById("ticketCustomer").value),
          }),
        });
        showToast("Ticket created.", "success");
        closeModal();
        loadTickets();
      } catch (err) {
        showToast(err.message || "Couldn't create the ticket.", "error");
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
})();
