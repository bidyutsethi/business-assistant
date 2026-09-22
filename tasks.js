// Tasks page: list, add, change status, delete.
(function () {
  const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

  const STATUS_META = {
    open: { cls: "open", label: "Open" },
    approval: { cls: "pending", label: "Needs Approval" },
    scheduled: { cls: "resolved", label: "Scheduled" },
    done: { cls: "resolved", label: "Done" },
  };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadTasks() {
    const tbody = document.getElementById("tasksBody");
    const emptyState = document.getElementById("tasksEmpty");
    try {
      const { tasks } = await baFetch("/tasks");
      if (!tasks.length) {
        tbody.innerHTML = "";
        emptyState.hidden = false;
        return;
      }
      emptyState.hidden = true;
      tbody.innerHTML = tasks
        .map(
          (t) => `
        <tr data-id="${t.id}">
          <td>${escapeHtml(t.title)}</td>
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
        </tr>`
        )
        .join("");
    } catch (err) {
      tbody.innerHTML = "";
      emptyState.hidden = false;
      document.querySelector("#tasksEmpty h4").textContent = "Couldn't load tasks";
      document.querySelector("#tasksEmpty p").textContent = err.message || "Could not reach the API.";
    }
  }

  const modal = document.getElementById("taskModal");
  function openModal() {
    document.getElementById("taskForm").reset();
    modal.classList.add("open");
  }
  function closeModal() {
    modal.classList.remove("open");
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadTasks();

    document.getElementById("addTaskBtn").addEventListener("click", openModal);
    document.getElementById("taskCancelBtn").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    document.getElementById("tasksBody").addEventListener("change", async (e) => {
      if (!e.target.classList.contains("status-change")) return;
      try {
        await baFetch(`/tasks/${e.target.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ status: e.target.value }),
        });
        showToast("Task updated.", "success");
      } catch (err) {
        showToast(err.message || "Couldn't update the task.", "error");
        loadTasks();
      }
    });

    document.getElementById("tasksBody").addEventListener("click", async (e) => {
      const row = e.target.closest("tr");
      if (!row || !e.target.closest(".delete-btn")) return;
      if (!confirm("Delete this task?")) return;
      try {
        await baFetch(`/tasks/${row.dataset.id}`, { method: "DELETE" });
        showToast("Task deleted.", "success");
        loadTasks();
      } catch (err) {
        showToast(err.message || "Couldn't delete this task.", "error");
      }
    });

    document.getElementById("taskForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await baFetch("/tasks", {
          method: "POST",
          body: JSON.stringify({ title: document.getElementById("taskTitle").value.trim() }),
        });
        showToast("Task added.", "success");
        closeModal();
        loadTasks();
      } catch (err) {
        showToast(err.message || "Couldn't add the task.", "error");
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
})();
