/* ==========================================================================
   egg-hatch-auth.js
   全ページで読み込む共通スクリプト。

   これまでの各ページのJS(egg-hatch.js など)は、SAMPLE_* というその場限りの
   仮データを使っていましたが、ここから先は実際のバックエンド(Flask)の
   APIを呼び出します。ここでは、その「呼び出し方」と「ログイン状態の表示」
   をまとめて用意しています。

   window.EggAuth として、他のJSファイルから使えるようにしています。
   ========================================================================== */

window.EggAuth = (() => {
  "use strict";

  const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
  let _csrfTokenPromise = null;

  /**
   * CSRFトークンを取得する(セッションに紐づくもの。初回だけサーバーに取りに行き、
   * 以降はメモリ上にキャッシュして使い回す)。
   */
  function _getCsrfToken() {
    if (!_csrfTokenPromise) {
      _csrfTokenPromise = fetch("/csrf-token", { credentials: "same-origin" })
        .then((res) => res.json())
        .then((body) => body.csrf_token);
    }
    return _csrfTokenPromise;
  }

  /**
   * バックエンドAPIを呼び出す共通関数。
   * - credentials: "same-origin" を必ず付ける(ログインセッションのCookieを送るため)
   * - 状態を変更するメソッドには、CSRFトークンを自動的に付与する
   * - エラー時は catch しやすいよう Error を投げる
   */
  async function apiFetch(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

    if (UNSAFE_METHODS.includes(method)) {
      headers["X-CSRF-Token"] = await _getCsrfToken();
    }

    const res = await fetch(path, {
      credentials: "same-origin",
      headers,
      ...options,
    });

    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }

    if (!res.ok) {
      const message = (body && body.error) || `通信に失敗しました(${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  /** ファイルアップロード専用(multipart/form-data なので Content-Type を自動にする) */
  async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/uploads", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": await _getCsrfToken() },
      body: formData,
    });
    const body = await res.json();
    if (!res.ok) {
      const err = new Error(body.error || "アップロードに失敗しました");
      err.status = res.status;
      throw err;
    }
    return body;
  }

  /** 今ログインしている人を取得する。ログインしていなければ null */
  async function getCurrentUser() {
    try {
      return await apiFetch("/me");
    } catch (e) {
      return null;
    }
  }

  /**
   * ページ上部のログイン状態表示を初期化する。
   * containerId の要素の中に「ログイン」or「◯◯さん | ログアウト」を描画する。
   */
  async function initAuthStatus(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const user = await getCurrentUser();

    if (user) {
      container.innerHTML = `
        <span>${escapeHtml(user.display_name)} さん</span>
        <button type="button" id="eggAuthLogoutBtn">ログアウト</button>
      `;
      document.getElementById("eggAuthLogoutBtn").addEventListener("click", async () => {
        await apiFetch("/logout", { method: "POST" });
        window.location.href = "/";
      });
    } else {
      container.innerHTML = `<a href="/egg-hatch-login.html">ログイン</a>`;
    }

    return user;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  return { apiFetch, uploadFile, getCurrentUser, initAuthStatus, escapeHtml };
})();
