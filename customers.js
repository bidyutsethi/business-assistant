// Customers page: list, add, edit, delete — all backed by the real API.
(function () {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const modal = document.getElementById("customerModal");
  const form = document.getElementById("customerForm");
  const modalTitle = document.getElementById("customerModalTitle");

  function openModal(customer) {
    form.reset();
    document.getElementById("customerId").value = customer ? customer.id : "";
    document.getElementById("customerName").value = customer ? customer.name : "";
    document.getElementById("customerRegion").value = customer ? customer.region : "North America";
    modalTitle.textContent = customer ? "Edit Customer" : "Add Customer";
    modal.classList.add("open");
  }
  function closeModal() {
    modal.classList.remove("open");
  }

  async function loadCustomers() {
    const tbody = document.getElementById("customersBody");
    const emptyState = document.getElementById("customersEmpty");
    try {
      const { customers } = await baFetch("/customers");
      if (!customers.length) {
        tbody.innerHTML = "";
        emptyState.hidden = false;
        return;
      }
      emptyState.hidden = true;
      tbody.innerHTML = customers
        .map(
          (c) => `
        <tr data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-region="${c.region}">
          <td>${escapeHtml(c.name)}</td>
          <td>${c.region}</td>
          <td>${c.order_count}</td>
          <td>${money.format(c.total_spend)}</td>
          <td class="text-muted">${dateFmt.format(new Date(c.created_at))}</td>
          <td>
            <div class="table-actions">
              <button class="edit-btn" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button class="delete-btn danger" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
            </div>
          </td>
        </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
      document.querySelector("#customersEmpty h4").textContent = "Couldn't load customers";
      document.querySelector("#customersEmpty p").textContent = err.message || "Could not reach the API.";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadCustomers();

    document.getElementById("addCustomerBtn").addEventListener("click", () => openModal(null));
    document.getElementById("customerCancelBtn").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    document.getElementById("customersBody").addEventListener("click", async (e) => {
      const row = e.target.closest("tr");
      if (!row) return;
      const id = row.dataset.id;

      if (e.target.closest(".edit-btn")) {
        openModal({ id, name: row.dataset.name, region: row.dataset.region });
      }

      if (e.target.closest(".delete-btn")) {
        if (!confirm(`Delete ${row.dataset.name}? This cannot be undone.`)) return;
        try {
          await baFetch(`/customers/${id}`, { method: "DELETE" });
          showToast("Customer deleted.", "success");
          loadCustomers();
        } catch (err) {
          showToast(err.message || "Couldn't delete this customer.", "error");
        }
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("customerId").value;
      const payload = {
        name: document.getElementById("customerName").value.trim(),
        region: document.getElementById("customerRegion").value,
      };
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        if (id) {
          await baFetch(`/customers/${id}`, { method: "PUT", body: JSON.stringify(payload) });
          showToast("Customer updated.", "success");
        } else {
          await baFetch("/customers", { method: "POST", body: JSON.stringify(payload) });
          showToast("Customer added.", "success");
        }
        closeModal();
        loadCustomers();
      } catch (err) {
        showToast(err.message || "Couldn't save this customer.", "error");
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
})();
