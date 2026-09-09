/* ==========================================================================
   egg-hatch-client.js ― 依頼者専用入口

   ・未ログイン           → 依頼者ログイン / 依頼者新規登録 の選択
   ・client / admin でログイン中 → そのまま依頼者向けダッシュボードへ
   ・一般ユーザー(general)でログイン中 → ここは依頼者用の入口である旨を伝える
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  function renderLoggedOut() {
    document.getElementById("eggClientEntryPage").innerHTML = `
      <div class="eggApplyHead">
        <p class="eggApplyEyebrow">出版社・編集者・企業の方へ</p>
        <h1 class="eggApplyWorkTitle">クリエイターにお仕事を依頼する</h1>
        <p class="eggApplyHint">
          EGG HATCHのクリエイターに、直接お仕事を依頼できます。
          1人への依頼はもちろん、複数人を指定して「このメンバーで作品を作ってほしい」という
          チーム単位の制作依頼にも対応しています。
        </p>
      </div>
      <div class="eggRequestChoiceRow">
        <a class="eggWorkApplyBtn" href="egg-hatch-client-login.html">依頼者ログイン</a>
        <a class="eggWorkApplyBtn" style="background:#fff;color:var(--eh-gold);border:1px solid var(--eh-gold);" href="egg-hatch-client-login.html?tab=register">依頼者新規登録</a>
      </div>
      <p class="eggApplyHint" style="margin-top:18px;">
        ※ 依頼者アカウントは、通常のEGG HATCH参加者アカウントとは別に登録します。
      </p>
    `;
  }

  function renderGeneralUserNotice(currentUser) {
    document.getElementById("eggClientEntryPage").innerHTML = `
      <div class="eggApplyHead">
        <p class="eggApplyEyebrow">出版社・編集者・企業の方へ</p>
        <h1 class="eggApplyWorkTitle">クリエイターにお仕事を依頼する</h1>
        <p class="eggApplyHint">
          現在、一般参加者「${escapeHtml(currentUser.display_name)}」さんとしてログイン中です。
          お仕事の依頼は、依頼者専用のアカウントで行っていただく形になっています。
        </p>
      </div>
      <div class="eggRequestChoiceRow">
        <a class="eggWorkApplyBtn" href="egg-hatch-client-login.html?tab=register">依頼者アカウントを登録する</a>
        <a class="eggWorkApplyBtn" style="background:#fff;color:var(--eh-gold);border:1px solid var(--eh-gold);" href="egg-hatch-client-login.html">依頼者アカウントでログインする</a>
      </div>
      <p class="eggApplyHint" style="margin-top:18px;">
        なお、あなた宛てに届いたお仕事依頼は、通常のログインのまま
        <a href="egg-hatch-requests.html" style="color:var(--eh-gold);">依頼一覧</a>から確認できます。
      </p>
    `;
  }

  function renderClientDashboard(currentUser) {
    document.getElementById("eggClientEntryPage").innerHTML = `
      <div class="eggApplyHead">
        <p class="eggApplyEyebrow">依頼者ページ</p>
        <h1 class="eggApplyWorkTitle">${escapeHtml(currentUser.company_name || currentUser.display_name)} 様</h1>
        <p class="eggApplyHint">ログイン中：${escapeHtml(currentUser.display_name)} さん(${escapeHtml(currentUser.company_name || "個人")})</p>
      </div>
      <div class="eggRequestDashboardGrid">
        <a class="eggRequestDashboardCard" href="/#newCreators">
          <p class="eggRequestDashboardCardTitle">クリエイターを探す</p>
          <p class="eggRequestDashboardCardDesc">EGG HATCHのクリエイター一覧・プロフィールを見る</p>
        </a>
        <a class="eggRequestDashboardCard" href="egg-hatch-request.html">
          <p class="eggRequestDashboardCardTitle">新しく依頼する</p>
          <p class="eggRequestDashboardCardDesc">ユーザーIDを指定して、1人またはチームに依頼を送る</p>
        </a>
        <a class="eggRequestDashboardCard" href="egg-hatch-requests.html">
          <p class="eggRequestDashboardCardTitle">送った依頼を確認する</p>
          <p class="eggRequestDashboardCardDesc">これまでに送った依頼の一覧を見る</p>
        </a>
      </div>
    `;
  }

  async function init() {
    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      renderLoggedOut();
      return;
    }
    if (currentUser.account_type === "client" || currentUser.account_type === "admin") {
      renderClientDashboard(currentUser);
      return;
    }
    renderGeneralUserNotice(currentUser);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
