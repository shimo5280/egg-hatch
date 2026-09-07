/* ==========================================================================
   egg-hatch-login.js
   ログイン／新規登録フォームの制御。egg-hatch-auth.js の EggAuth.apiFetch を使う。
   ========================================================================== */

(() => {
  "use strict";

  function setupTabs() {
    const buttons = document.querySelectorAll(".eggLoginTabs .eggApplyTypeBtn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.toggle("is-active", b === btn));
        document.getElementById("eggLoginPanelLogin").classList.toggle("is-active", btn.dataset.tab === "login");
        document.getElementById("eggLoginPanelRegister").classList.toggle("is-active", btn.dataset.tab === "register");
      });
    });
  }

  function redirectAfterAuth() {
    // ログイン前に見ようとしていたページがあれば、そこへ戻す。
    // location.replaceで履歴を置き換える(「戻る」を押したときに、
    // 済んだはずのログイン画面へ戻ってしまわないようにするため)
    const params = new URLSearchParams(window.location.search);
    window.location.replace(params.get("next") || "/");
  }

  function setupLoginForm() {
    const form = document.getElementById("eggLoginForm");
    const errorEl = document.getElementById("eggLoginError");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const email = document.getElementById("eggLoginEmail").value.trim();
      const password = document.getElementById("eggLoginPassword").value;

      try {
        await EggAuth.apiFetch("/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        redirectAfterAuth();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  function setupRegisterForm() {
    const form = document.getElementById("eggRegisterForm");
    const errorEl = document.getElementById("eggRegisterError");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const display_name = document.getElementById("eggRegisterName").value.trim();
      const email = document.getElementById("eggRegisterEmail").value.trim();
      const password = document.getElementById("eggRegisterPassword").value;

      try {
        await EggAuth.apiFetch("/register", {
          method: "POST",
          body: JSON.stringify({ display_name, email, password }),
        });
        redirectAfterAuth();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    setupLoginForm();
    setupRegisterForm();
  });
})();
