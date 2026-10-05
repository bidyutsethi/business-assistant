// Team page: lists everyone in the workspace. Admins can also invite people
// with a link, change each person's access level, reset their password, or
// remove them.
(function () {
  const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

  const ACCESS_LABELS = { admin: "Admin", member: "Member", viewer: "Viewer (read-only)" };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  let me = null;

  function showInvite(inviteCode) {
    const url = new URL("signup.html", window.location.href);
    url.searchParams.set("invite", inviteCode);
    document.getElementById("inviteLink").value = url.toString();
    document.getElementById("invitePanel").hidden = false;
  }

  function accessCell(m) {
    if (me.accessLevel !== "admin") return escapeHtml(ACCESS_LABELS[m.access_level] || m.access_level);
    return `
      <select class="status-select access-change">
        ${Object.entries(ACCESS_LABELS).map(([val, label]) => `<option value="${val}" ${val === m.access_level ? "selected" : ""}>${label}</option>`).join("")}
      </select>`;
  }

  function actionsCell(m) {
    if (me.accessLevel !== "admin") return "";
    const remove = m.id === me.id
      ? ""
      : `<button class="remove-btn danger" title="Remove from workspace"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>`;
    return `
      <div class="table-actions">
        <button class="reset-btn" title="Reset password"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></button>
        ${remove}
      </div>`;
  }

  async function loadTeam() {
    const tbody = document.getElementById("teamBody");
    try {
      const data = await baFetch("/team");
      me = data.me;
      document.getElementById("teamAdminNote").hidden = me.accessLevel === "admin";
      document.getElementById("workspaceName").textContent = data.workspace.name;
      if (data.workspace.inviteCode) showInvite(data.workspace.inviteCode);
      tbody.innerHTML = data.members
        .map(
          (m) => `
        <tr data-id="${m.id}" data-name="${escapeHtml(m.full_name)}">
          <td>${escapeHtml(m.full_name)}${m.id === me.id ? ' <span class="text-muted">(you)</span>' : ""}</td>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(m.company || "—")}</td>
          <td>${escapeHtml(m.role)}</td>
          <td>${accessCell(m)}</td>
          <td class="text-muted">${dateFmt.format(new Date(m.created_at))}</td>
          <td>${actionsCell(m)}</td>
        </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted">${escapeHtml(err.message || "Could not reach the API.")}</td></tr>`;
    }
  }

  const modal = document.getElementById("resetModal");
  function closeModal() {
    modal.classList.remove("open");
    document.getElementById("resetPassword").value = "";
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadTeam();
    const tbody = document.getElementById("teamBody");

    tbody.addEventListener("change", async (e) => {
      if (!e.target.classList.contains("access-change")) return;
      const row = e.target.closest("tr");
      try {
        await baFetch(`/team/${row.dataset.id}/access`, {
          method: "PUT",
          body: JSON.stringify({ accessLevel: e.target.value }),
        });
        showToast("Access updated.", "success");
      } catch (err) {
        showToast(err.message || "Couldn't update access.", "error");
      }
      loadTeam();
    });

    tbody.addEventListener("click", async (e) => {
      const row = e.target.closest("tr");
      if (!row) return;
      const name = row.dataset.name;

      if (e.target.closest(".reset-btn")) {
        if (!confirm(`Reset the password for ${name}? Their current password will stop working.`)) return;
        try {
          const { temporaryPassword } = await baFetch(`/team/${row.dataset.id}/reset-password`, { method: "POST" });
          document.getElementById("resetName").textContent = name;
          document.getElementById("resetPassword").value = temporaryPassword;
          modal.classList.add("open");
        } catch (err) {
          showToast(err.message || "Couldn't reset the password.", "error");
        }
      }

      if (e.target.closest(".remove-btn")) {
        if (!confirm(`Remove ${name} from the workspace? Their account will be deleted.`)) return;
        try {
          await baFetch(`/team/${row.dataset.id}`, { method: "DELETE" });
          showToast("Team member removed.", "success");
          loadTeam();
        } catch (err) {
          showToast(err.message || "Couldn't remove this team member.", "error");
        }
      }
    });

    document.getElementById("inviteCopyBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById("inviteLink").value);
        showToast("Invite link copied.", "success");
      } catch (err) {
        showToast("Couldn't copy — select the link and copy it manually.", "error");
      }
    });

    document.getElementById("inviteResetBtn").addEventListener("click", async () => {
      if (!confirm("Make a new invite link? The current link will stop working.")) return;
      try {
        const { inviteCode } = await baFetch("/team/invite/regenerate", { method: "POST" });
        showInvite(inviteCode);
        showToast("New invite link ready. The old one no longer works.", "success");
      } catch (err) {
        showToast(err.message || "Couldn't make a new link.", "error");
      }
    });

    document.getElementById("resetCloseBtn").addEventListener("click", closeModal);
    document.getElementById("resetCopyBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById("resetPassword").value);
        showToast("Copied.", "success");
      } catch (err) {
        showToast("Couldn't copy — select the password and copy it manually.", "error");
      }
    });
  });
})();
