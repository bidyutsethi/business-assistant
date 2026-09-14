// Auth guard for authenticated app pages (dashboard, AI assistant, MIS
// reports). Runs synchronously so an unauthenticated visitor is redirected
// before the page has a chance to render.
(function () {
  const token = localStorage.getItem("ba_token");
  const userRaw = localStorage.getItem("ba_user");
  let user = null;

  if (token && userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch (err) {
      user = null;
    }
  }

  if (!token || !user) {
    window.location.href = "login.html";
    return;
  }

  window.BA_AUTH = { token, user };

  window.baFetch = async function baFetch(path, options) {
    options = options || {};
    const res = await fetch(window.API_BASE + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      localStorage.removeItem("ba_token");
      localStorage.removeItem("ba_user");
      window.location.href = "login.html";
      throw new Error("Unauthorized");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  };

  function initials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");
  }

  function greeting() {
    const h = new Date().getHours();
    const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
    return `Good ${part}, ${user.fullName.split(" ")[0]}`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = user.fullName));
    document.querySelectorAll("[data-user-role]").forEach((el) => (el.textContent = user.role));
    document.querySelectorAll("[data-user-initials]").forEach((el) => (el.textContent = initials(user.fullName)));
    document.querySelectorAll("[data-user-greeting]").forEach((el) => (el.textContent = greeting()));

    document.querySelectorAll("[data-logout]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.removeItem("ba_token");
        localStorage.removeItem("ba_user");
        window.location.href = "login.html";
      });
    });
  });
})();
