/* Business Assistant — shared front-end helpers (toasts, charts, file
   downloads) plus the marketing-page interactions. Page-specific logic that
   talks to the API lives in each page's own script. */

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

// ---------- File download (CSV / text exports) ----------
function downloadFile(filename, text, mimeType) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType || "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
window.downloadFile = downloadFile;

// rows: array of arrays. Quotes every cell so commas and quotes survive.
function toCsv(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}
window.toCsv = toCsv;

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

  // ---------- Approval demo on the marketing page (Approve/Reject) ----------
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
});
