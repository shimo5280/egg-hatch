/* ==========================================================================
   egg-hatch-client-login.js ― 依頼者専用ログイン・新規登録

   ログインそのものは既存の /login をそのまま使う(User共通・特別な処理は無い)。
   新規登録は依頼者専用の /register-client を使う(既存の /register は触らない)。

   ログイン成功後、そのアカウントが account_type = client / admin でなければ、
   「依頼者アカウントではありません」と伝えてログアウトする
   (依頼者専用の入口として、迷わないようにするための画面上のガード。
   実際の送信権限は、サーバー側のcan_send_job_requestsチェックで担保されている)。
   ========================================================================== */

(() => {
  "use strict";

  function setupTabs() {
    const buttons = document.querySelectorAll(".eggLoginTabs .eggApplyTypeBtn");
    const setTab = (tab) => {
      buttons.forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
      document.getElementById("eggLoginPanelLogin").classList.toggle("is-active", tab === "login");
      document.getElementById("eggLoginPanelRegister").classList.toggle("is-active", tab === "register");
    };
    buttons.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    const initialTab = new URLSearchParams(window.location.search).get("tab");
    if (initialTab === "register") setTab("register");
  }

  function redirectToClientArea() {
    window.location.replace("egg-hatch-client.html");
  }

  function setupLoginForm() {
    const form = document.getElementById("eggClientLoginForm");
    const errorEl = document.getElementById("eggClientLoginError");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const email = document.getElementById("eggClientLoginEmail").value.trim();
      const password = document.getElementById("eggClientLoginPassword").value;

      try {
        await EggAuth.apiFetch("/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });

        // ログインには成功したが、依頼者アカウントかどうかをここで確認する
        const me = await EggAuth.apiFetch("/me");
        if (me.account_type !== "client" && me.account_type !== "admin") {
          await EggAuth.apiFetch("/logout", { method: "POST" });
          errorEl.textContent = "このアカウントは依頼者(client)アカウントではありません。一般ユーザーの方は通常のログインをご利用ください。";
          errorEl.hidden = false;
          return;
        }

        redirectToClientArea();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  function setupRegisterForm() {
    const form = document.getElementById("eggClientRegisterForm");
    const errorEl = document.getElementById("eggClientRegisterError");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const display_name = document.getElementById("eggClientRegisterName").value.trim();
      const company_name = document.getElementById("eggClientRegisterCompany").value.trim();
      const client_type = document.getElementById("eggClientRegisterType").value;
      const email = document.getElementById("eggClientRegisterEmail").value.trim();
      const password = document.getElementById("eggClientRegisterPassword").value;

      if (!client_type) {
        errorEl.textContent = "依頼者種別を選択してください。";
        errorEl.hidden = false;
        return;
      }

      try {
        await EggAuth.apiFetch("/register-client", {
          method: "POST",
          body: JSON.stringify({ display_name, company_name, client_type, email, password }),
        });
        redirectToClientArea();
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
