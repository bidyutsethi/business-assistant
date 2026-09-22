// Analytics page: fetches /api/analytics and renders five real charts.
(function () {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const COLORS = ["#3b5bfd", "#6b86ff", "#a7b6ff", "#d7dbe6", "#8b98c4"];

  const ORDER_STATUS_LABELS = { new: "New", processing: "Processing", fulfilled: "Fulfilled", overdue: "Overdue" };

  function renderLegend(container, items, labelKey, valueKey, formatValue) {
    if (!items.length) {
      container.innerHTML = `<li class="text-muted">No data yet.</li>`;
      return;
    }
    const total = items.reduce((sum, i) => sum + Number(i[valueKey]), 0) || 1;
    container.innerHTML = items
      .map((item, idx) => {
        const share = ((Number(item[valueKey]) / total) * 100).toFixed(0);
        const label = labelKey === "status" ? ORDER_STATUS_LABELS[item[labelKey]] || item[labelKey] : item[labelKey];
        return `<li><span><span class="dot" style="background:${COLORS[idx % COLORS.length]}"></span>${label}</span><b>${formatValue ? formatValue(item[valueKey]) : item[valueKey]} (${share}%)</b></li>`;
      })
      .join("");
  }

  async function load() {
    try {
      const data = await baFetch("/analytics");

      renderLineChart(document.getElementById("revenueTrendChart"), data.revenueTrend, "revenue");
      renderLineChart(document.getElementById("customerGrowthChart"), data.customerGrowth, "customers");
      renderLineChart(document.getElementById("ticketTrendChart"), data.ticketTrend, "count");

      renderLegend(document.getElementById("ordersByStatusList"), data.ordersByStatus, "status", "count");
      renderLegend(document.getElementById("revenueByRegionList"), data.revenueByRegion, "region", "total", (v) => money.format(v));
    } catch (err) {
      document.getElementById("analyticsContent").hidden = true;
      document.getElementById("analyticsError").hidden = false;
      document.getElementById("analyticsErrorMsg").textContent = err.message || "Could not reach the API.";
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
