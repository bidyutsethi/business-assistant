// Demo Requests page (site owner only): the inbox for "Book a Demo" and
// "Contact Sales" submissions. Mark each as contacted/closed, or delete it.
(function () {
  const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const STATUS_LABELS = { new: "New", contacted: "Contacted", closed: "Closed" };
  const KIND_LABELS = { demo: "Demo", sales: "Sales" };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  let requests = [];

  // These values were typed by strangers. A spreadsheet would run a cell that
  // starts with = + - or @ as a formula, so such cells get a leading apostrophe.
  function csvSafe(value) {
    const text = String(value);
    return ["=", "+", "-", "@"].includes(text.trimStart()[0]) ? `'${text}` : text;
  }

  function contactCell(r) {
    const email = escapeHtml(r.email);
    const phone = r.phone ? `<div class="text-muted">${escapeHtml(r.phone)}</div>` : "";
    // Encoded so an odd address can't break out of the attribute; "@" is restored
    // because mail apps expect it literally.
    const mailto = encodeURIComponent(r.email).replace("%40", "@");
    return `<a href="mailto:${mailto}" style="color:var(--accent);font-weight:600;">${email}</a>${phone}`;
  }

  async function loadRequests() {
    const tbody = document.getElementById("requestsBody");
    const emptyState = document.getElementById("requestsEmpty");
    try {
      requests = (await baFetch("/demo-requests")).requests;
      if (!requests.length) {
        tbody.innerHTML = "";
        emptyState.hidden = false;
        return;
      }
      emptyState.hidden = true;
      tbody.innerHTML = requests
        .map(
          (r) => `
        <tr data-id="${r.id}">
          <td>${escapeHtml(r.full_name)}</td>
          <td>${contactCell(r)}</td>
          <td>${escapeHtml(r.company || "—")}</td>
          <td>${KIND_LABELS[r.kind] || escapeHtml(r.kind)}</td>
          <td class="request-message">${escapeHtml(r.message || "—")}</td>
          <td class="text-muted" style="white-space:nowrap;">${dateFmt.format(new Date(r.created_at))}</td>
          <td>
            <select class="status-select status-change">
              ${Object.entries(STATUS_LABELS).map(([val, label]) => `<option value="${val}" ${val === r.status ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </td>
          <td>
            <div class="table-actions">
              <button class="delete-btn danger" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
            </div>
          </td>
        </tr>`
        )
        .join("");
    } catch (err) {
      requests = [];
      tbody.innerHTML = "";
      emptyState.hidden = false;
      document.querySelector("#requestsEmpty h4").textContent = "Couldn't load requests";
      document.querySelector("#requestsEmpty p").textContent = err.message || "Could not reach the API.";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadRequests();
    const tbody = document.getElementById("requestsBody");

    tbody.addEventListener("change", async (e) => {
      if (!e.target.classList.contains("status-change")) return;
      const row = e.target.closest("tr");
      try {
        await baFetch(`/demo-requests/${row.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ status: e.target.value }),
        });
        showToast("Request updated.", "success");
      } catch (err) {
        showToast(err.message || "Couldn't update the request.", "error");
      }
      loadRequests();
    });

    tbody.addEventListener("click", async (e) => {
      const row = e.target.closest("tr");
      if (!row || !e.target.closest(".delete-btn")) return;
      if (!confirm("Delete this request? This can't be undone.")) return;
      try {
        await baFetch(`/demo-requests/${row.dataset.id}`, { method: "DELETE" });
        showToast("Request deleted.", "success");
        loadRequests();
      } catch (err) {
        showToast(err.message || "Couldn't delete this request.", "error");
      }
    });

    document.getElementById("exportRequestsBtn").addEventListener("click", () => {
      if (!requests.length) {
        showToast("There are no requests to export yet.", "error");
        return;
      }
      const rows = [
        ["Name", "Email", "Phone", "Company", "Type", "Message", "Status", "Received"],
        ...requests.map((r) => [
          csvSafe(r.full_name), csvSafe(r.email), csvSafe(r.phone || ""), csvSafe(r.company || ""),
          KIND_LABELS[r.kind] || r.kind, csvSafe(r.message || ""), STATUS_LABELS[r.status] || r.status,
          new Date(r.created_at).toISOString(),
        ]),
      ];
      // The BOM makes Excel read the file as UTF-8.
      downloadFile(`demo-requests-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + toCsv(rows), "text/csv;charset=utf-8");
    });
  });
})();
