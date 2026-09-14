// Real signup/login handling for login.html and signup.html.
(function () {
  // Already signed in? Skip straight to the dashboard.
  if (localStorage.getItem("ba_token")) {
    window.location.href = "dashboard.html";
    return;
  }

  function setFieldError(input, message) {
    const field = input.closest(".field");
    field.classList.add("field-error");
    let msg = field.querySelector(".error-msg");
    if (!msg) {
      msg = document.createElement("span");
      msg.className = "error-msg";
      field.appendChild(msg);
    }
    msg.textContent = message;
  }

  function clearFieldErrors(form) {
    form.querySelectorAll(".field").forEach((f) => {
      f.classList.remove("field-error");
      const msg = f.querySelector(".error-msg");
      if (msg) msg.remove();
    });
  }

  async function submitAuth(path, payload, submitBtn) {
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Please wait...";
    try {
      const res = await fetch(window.API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Something went wrong. Please try again.", "error");
        return;
      }
      localStorage.setItem("ba_token", data.token);
      localStorage.setItem("ba_user", JSON.stringify(data.user));
      showToast("Success! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 500);
    } catch (err) {
      showToast("Could not reach the server. Is the API running?", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        clearFieldErrors(loginForm);
        const email = document.getElementById("email");
        const password = document.getElementById("password");
        let valid = true;
        if (!email.value.includes("@")) {
          setFieldError(email, "Enter a valid email address.");
          valid = false;
        }
        if (!password.value) {
          setFieldError(password, "Enter your password.");
          valid = false;
        }
        if (!valid) return;
        submitAuth(
          "/auth/login",
          { email: email.value.trim(), password: password.value },
          loginForm.querySelector('button[type="submit"]')
        );
      });
    }

    const signupForm = document.getElementById("signupForm");
    if (signupForm) {
      signupForm.addEventListener("submit", (e) => {
        e.preventDefault();
        clearFieldErrors(signupForm);
        const fullname = document.getElementById("fullname");
        const company = document.getElementById("company");
        const email = document.getElementById("email2");
        const password = document.getElementById("password2");
        let valid = true;
        if (!fullname.value.trim()) {
          setFieldError(fullname, "Enter your name.");
          valid = false;
        }
        if (!email.value.includes("@")) {
          setFieldError(email, "Enter a valid email address.");
          valid = false;
        }
        if (password.value.length < 8) {
          setFieldError(password, "Use at least 8 characters.");
          valid = false;
        }
        if (!valid) return;
        submitAuth(
          "/auth/signup",
          {
            fullName: fullname.value.trim(),
            company: company.value.trim(),
            email: email.value.trim(),
            password: password.value,
          },
          signupForm.querySelector('button[type="submit"]')
        );
      });
    }
  });
})();
