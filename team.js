// Team page: read-only list of every registered user.
(function () {
  const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadTeam() {
    const tbody = document.getElementById("teamBody");
    try {
      const { members } = await baFetch("/team");
      tbody.innerHTML = members
        .map(
          (m) => `
        <tr>
          <td>${escapeHtml(m.full_name)}</td>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.company || "—")}</td>
          <td>${escapeHtml(m.role)}</td>
          <td class="text-muted">${dateFmt.format(new Date(m.created_at))}</td>
        </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted">${err.message || "Could not reach the API."}</td></tr>`;
    }
  }

  document.addEventListener("DOMContentLoaded", loadTeam);
})();
