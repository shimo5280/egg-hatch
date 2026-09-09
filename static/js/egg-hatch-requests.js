/* ==========================================================================
   egg-hatch-requests.js ― お仕事依頼一覧(送った/受け取った)

   GET /job-requests は、ログイン中の本人が「依頼した」ものと
   「依頼された」ものの両方をまとめて返す。ここでは一覧表示のみを行い、
   承諾/辞退などのアクションは用意していない(現段階のスコープ外のため)。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  function formatDate(iso) {
    return new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function itemHtml(jr, currentUserId) {
    const isSent = jr.requester.id === currentUserId;
    const directionTag = isSent
      ? `<span class="eggRequestDirectionTag eggRequestDirectionTag--sent">送った依頼</span>`
      : `<span class="eggRequestDirectionTag eggRequestDirectionTag--received">受け取った依頼</span>`;

    const recipientNames = jr.recipients.map((r) => `${escapeHtml(r.display_name)}(ID:${r.id})`).join("・");
    const multiHint = jr.recipients.length >= 2 ? "(複数人への制作依頼)" : "";

    return `
      <article class="eggRequestListItem">
        <div class="eggRequestListItemHead">
          <span class="eggRequestListItemTitle">${escapeHtml(jr.title)}</span>
          <span class="eggRequestListItemDate">${formatDate(jr.created_at)}</span>
        </div>
        <p class="eggRequestListItemMeta">
          ${directionTag}
          依頼者：${escapeHtml(jr.requester.display_name)}(ID:${jr.requester.id})
          ／依頼相手：${recipientNames} ${multiHint}
        </p>
        ${jr.message ? `<p class="eggRequestListItemMessage">${escapeHtml(jr.message)}</p>` : ""}
      </article>`;
  }

  async function init() {
    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      window.location.replace(`egg-hatch-login.html?next=${encodeURIComponent("egg-hatch-requests.html")}`);
      return;
    }

    const page = document.getElementById("eggRequestListPage");
    let jobRequests;
    try {
      jobRequests = await EggAuth.apiFetch("/job-requests");
    } catch (e) {
      page.innerHTML = `<p class="eggApplyHint">読み込みに失敗しました。</p>`;
      return;
    }

    page.innerHTML = `
      <div class="eggApplyHead">
        <p class="eggApplyEyebrow">お仕事依頼</p>
        <h1 class="eggApplyWorkTitle">依頼一覧</h1>
        <p class="eggApplyHint">あなたが送った依頼と、あなたに届いた依頼をまとめて表示しています。</p>
      </div>
      <div id="eggRequestListBox"></div>
    `;

    const box = document.getElementById("eggRequestListBox");
    if (!jobRequests.length) {
      box.innerHTML = `<p class="eggWorkTeamEmpty">まだ依頼はありません。</p>`;
      return;
    }
    box.innerHTML = jobRequests.map((jr) => itemHtml(jr, currentUser.id)).join("");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
