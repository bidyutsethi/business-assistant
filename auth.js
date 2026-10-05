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
        const isRealApiError = typeof data.error === "string" && res.status !== 404;
        showToast(
          isRealApiError ? data.error : "The API isn't reachable right now. Please try again shortly.",
          "error"
        );
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
      // No email service is configured, so resets go through an admin.
      document.getElementById("forgotLink").addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("forgotNote").hidden = false;
      });

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
      // An invite link (signup.html?invite=CODE) joins an existing workspace
      // instead of creating a new one.
      let inviteCode = new URLSearchParams(window.location.search).get("invite");
      if (inviteCode) {
        const note = document.getElementById("inviteNote");
        note.hidden = false;
        note.textContent = "Checking your invite...";
        fetch(`${window.API_BASE}/auth/invite/${encodeURIComponent(inviteCode)}`)
          .then(async (res) => {
            if (res.status === 404) {
              // Only a definite "no such invite" drops the code. If the API is
              // just slow or unreachable, keep it and let signup validate it.
              inviteCode = null;
              note.textContent =
                "This invite link is no longer valid. Ask your admin for a new one, or continue to create your own workspace.";
              return;
            }
            const data = await res.json();
            note.textContent = "";
            note.append("You've been invited to join ");
            const name = document.createElement("b");
            name.textContent = data.workspaceName;
            note.append(name, ". Create your account to get access.");
            document.getElementById("signupSub").textContent = "Join your team on Business Assistant.";
          })
          .catch(() => {
            note.textContent = "You're signing up with an invite link.";
          });
      }

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
            inviteCode: inviteCode || undefined,
          },
          signupForm.querySelector('button[type="submit"]')
        );
      });
    }
  });
})();
