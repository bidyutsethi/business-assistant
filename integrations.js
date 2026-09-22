// Integrations page: grouped by category, each with a connect/disconnect toggle.
(function () {
  const CATEGORY_LABELS = {
    communication: "Communication",
    data: "Data",
    business: "Business",
    infrastructure: "Infrastructure",
  };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderIntegrations(integrations) {
    const container = document.getElementById("integrationsList");
    const byCategory = {};
    integrations.forEach((i) => {
      byCategory[i.category] = byCategory[i.category] || [];
      byCategory[i.category].push(i);
    });

    container.innerHTML = `<div class="integration-cats">${Object.entries(byCategory)
      .map(
        ([category, items]) => `
        <div class="integration-cat">
          <h5>${CATEGORY_LABELS[category] || category}</h5>
          <ul>
            ${items
              .map(
                (i) => `
              <li style="justify-content:space-between;">
                <span style="display:flex;align-items:center;gap:10px;">
                  <span class="dot" style="background:${i.connected ? "var(--success)" : "var(--slate-300)"};"></span>
                  ${escapeHtml(i.name)}
                </span>
                <button class="toggle-switch ${i.connected ? "on" : ""}" data-id="${i.id}" title="${i.connected ? "Connected" : "Not connected"}"></button>
              </li>`
              )
              .join("")}
          </ul>
        </div>`
      )
      .join("")}</div>`;
  }

  async function loadIntegrations() {
    try {
      const { integrations } = await baFetch("/integrations");
      renderIntegrations(integrations);
    } catch (err) {
      document.getElementById("integrationsList").innerHTML = `<div class="empty-state"><h4>Couldn't load integrations</h4><p>${err.message || "Could not reach the API."}</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadIntegrations();

    document.getElementById("integrationsList").addEventListener("click", async (e) => {
      const btn = e.target.closest(".toggle-switch");
      if (!btn) return;
      btn.disabled = true;
      try {
        const { integration } = await baFetch(`/integrations/${btn.dataset.id}/toggle`, { method: "PUT" });
        loadIntegrations();
        showToast(`${integration.name} ${integration.connected ? "connected" : "disconnected"}.`, "success");
      } catch (err) {
        showToast(err.message || "Couldn't update this integration.", "error");
        btn.disabled = false;
      }
    });
  });
})();
