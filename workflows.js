// Workflows page: list automation rules and toggle them on/off.
(function () {
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderWorkflows(workflows) {
    const container = document.getElementById("workflowsList");
    if (!workflows.length) {
      container.innerHTML = `<div class="empty-state"><h4>No workflows defined</h4></div>`;
      return;
    }
    container.innerHTML = workflows
      .map(
        (w) => `
      <div class="panel" style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;">
        <div>
          <h4 style="font-size:15px;font-weight:650;margin-bottom:6px;">${escapeHtml(w.name)}</h4>
          <p style="font-size:13.5px;color:var(--slate-400);margin-bottom:12px;max-width:600px;line-height:1.5;">${escapeHtml(w.description)}</p>
          <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:var(--navy-700);">
            <span style="background:var(--off-white);padding:4px 10px;border-radius:100px;">${escapeHtml(w.trigger_label)}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--slate-400);"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            <span style="background:var(--accent-100);color:var(--accent-600);padding:4px 10px;border-radius:100px;">${escapeHtml(w.action_label)}</span>
          </div>
        </div>
        <button class="toggle-switch ${w.enabled ? "on" : ""}" data-id="${w.id}" title="${w.enabled ? "Enabled" : "Disabled"}"></button>
      </div>`
      )
      .join("");
  }

  async function loadWorkflows() {
    try {
      const { workflows } = await baFetch("/workflows");
      renderWorkflows(workflows);
    } catch (err) {
      document.getElementById("workflowsList").innerHTML = `<div class="empty-state"><h4>Couldn't load workflows</h4><p>${err.message || "Could not reach the API."}</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadWorkflows();

    document.getElementById("workflowsList").addEventListener("click", async (e) => {
      const btn = e.target.closest(".toggle-switch");
      if (!btn) return;
      btn.disabled = true;
      try {
        const { workflow } = await baFetch(`/workflows/${btn.dataset.id}/toggle`, { method: "PUT" });
        btn.classList.toggle("on", workflow.enabled);
        showToast(`${workflow.name} ${workflow.enabled ? "enabled" : "disabled"}.`, "success");
      } catch (err) {
        showToast(err.message || "Couldn't update this workflow.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
})();
