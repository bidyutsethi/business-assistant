// Orders page: filterable list, inline status change, new order, delete.
(function () {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

  const STATUS_META = {
    new: { cls: "open", label: "New" },
    processing: { cls: "pending", label: "Processing" },
    fulfilled: { cls: "resolved", label: "Fulfilled" },
    overdue: { cls: "overdue", label: "Payment overdue" },
  };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  let currentStatus = "";
  let customersCache = [];

  async function loadOrders() {
    const tbody = document.getElementById("ordersBody");
    const emptyState = document.getElementById("ordersEmpty");
    try {
      const qs = currentStatus ? `?status=${encodeURIComponent(currentStatus)}` : "";
      const { orders } = await baFetch(`/orders${qs}`);
      if (!orders.length) {
        tbody.innerHTML = "";
        emptyState.hidden = false;
        return;
      }
      emptyState.hidden = true;
      tbody.innerHTML = orders
        .map((o) => {
          const meta = STATUS_META[o.status] || { cls: "open", label: o.status };
          return `
        <tr data-id="${o.id}">
          <td>${escapeHtml(o.order_number)}</td>
          <td>${escapeHtml(o.customer_name)}</td>
          <td>${o.region}</td>
          <td>${money.format(o.amount)}</td>
          <td>
            <select class="status-select status-change" data-id="${o.id}">
              ${Object.entries(STATUS_META).map(([val, m]) => `<option value="${val}" ${val === o.status ? "selected" : ""}>${m.label}</option>`).join("")}
            </select>
          </td>
          <td class="text-muted">${dateFmt.format(new Date(o.created_at))}</td>
          <td>
            <div class="table-actions">
              <button class="delete-btn danger" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
            </div>
          </td>
        </tr>`;
        })
        .join("");
    } catch (err) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
      document.querySelector("#ordersEmpty h4").textContent = "Couldn't load orders";
      document.querySelector("#ordersEmpty p").textContent = err.message || "Could not reach the API.";
    }
  }

  async function loadCustomersIntoSelect() {
    const select = document.getElementById("orderCustomer");
    try {
      const { customers } = await baFetch("/customers");
      customersCache = customers;
      select.innerHTML = customers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.region})</option>`).join("");
    } catch (err) {
      select.innerHTML = `<option value="">Couldn't load customers</option>`;
    }
  }

  const modal = document.getElementById("orderModal");
  function openModal() {
    document.getElementById("orderForm").reset();
    modal.classList.add("open");
  }
  function closeModal() {
    modal.classList.remove("open");
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadOrders();

    document.getElementById("statusFilters").addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-pill");
      if (!btn) return;
      document.querySelectorAll("#statusFilters .filter-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentStatus = btn.dataset.status;
      loadOrders();
    });

    document.getElementById("addOrderBtn").addEventListener("click", async () => {
      if (!customersCache.length) await loadCustomersIntoSelect();
      if (!customersCache.length) {
        showToast("Add a customer first before creating an order.", "error");
        return;
      }
      openModal();
    });
    document.getElementById("orderCancelBtn").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    document.getElementById("ordersBody").addEventListener("change", async (e) => {
      if (!e.target.classList.contains("status-change")) return;
      const id = e.target.dataset.id;
      try {
        await baFetch(`/orders/${id}`, { method: "PUT", body: JSON.stringify({ status: e.target.value }) });
        showToast("Order status updated.", "success");
        loadOrders();
      } catch (err) {
        showToast(err.message || "Couldn't update the order.", "error");
        loadOrders();
      }
    });

    document.getElementById("ordersBody").addEventListener("click", async (e) => {
      const row = e.target.closest("tr");
      if (!row || !e.target.closest(".delete-btn")) return;
      if (!confirm("Delete this order? This cannot be undone.")) return;
      try {
        await baFetch(`/orders/${row.dataset.id}`, { method: "DELETE" });
        showToast("Order deleted.", "success");
        loadOrders();
      } catch (err) {
        showToast(err.message || "Couldn't delete this order.", "error");
      }
    });

    document.getElementById("orderForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        customerId: Number(document.getElementById("orderCustomer").value),
        amount: Number(document.getElementById("orderAmount").value),
        status: document.getElementById("orderStatus").value,
      };
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await baFetch("/orders", { method: "POST", body: JSON.stringify(payload) });
        showToast("Order created.", "success");
        closeModal();
        loadOrders();
      } catch (err) {
        showToast(err.message || "Couldn't create the order.", "error");
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
})();
