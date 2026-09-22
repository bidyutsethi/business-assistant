// Settings page: update profile and change password against the real API.
(function () {
  document.addEventListener("DOMContentLoaded", () => {
    const user = window.BA_AUTH.user;
    document.getElementById("settingsFullName").value = user.fullName;
    document.getElementById("settingsCompany").value = user.company || "";
    document.getElementById("settingsEmail").value = user.email;

    document.getElementById("profileForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const { user: updated } = await baFetch("/auth/me", {
          method: "PUT",
          body: JSON.stringify({
            fullName: document.getElementById("settingsFullName").value.trim(),
            company: document.getElementById("settingsCompany").value.trim(),
          }),
        });
        // Keep the locally cached user (and thus sidebar/greeting) in sync
        // without requiring a re-login.
        localStorage.setItem("ba_user", JSON.stringify(updated));
        window.BA_AUTH.user = updated;
        document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = updated.fullName));
        document.querySelectorAll("[data-user-initials]").forEach(
          (el) => (el.textContent = updated.fullName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join(""))
        );
        showToast("Profile updated.", "success");
      } catch (err) {
        showToast(err.message || "Couldn't update your profile.", "error");
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.getElementById("passwordForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await baFetch("/auth/password", {
          method: "PUT",
          body: JSON.stringify({
            currentPassword: document.getElementById("currentPassword").value,
            newPassword: document.getElementById("newPassword").value,
          }),
        });
        showToast("Password updated.", "success");
        e.target.reset();
      } catch (err) {
        showToast(err.message || "Couldn't update your password.", "error");
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
})();
