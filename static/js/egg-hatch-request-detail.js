/* ==========================================================================
   egg-hatch-request-detail.js ― お仕事依頼の詳細・回答

   ?id=1 で依頼を特定。GET /job-requests/<id> は、依頼者本人か、
   運営から通知済みのメンバー本人しか見られない(サーバー側でチェック済み)。

   メンバー(自分がrecipientで、まだ回答していない)の場合だけ、
   承諾/辞退のボタンを表示する。POST /job-requests/<id>/respond で送信する。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function renderError(message) {
    document.getElementById("eggRequestDetailPage").innerHTML = `
      <p class="eggApplyHint">${escapeHtml(message)}</p>
      <a class="eggWorkNavBack" href="egg-hatch-requests.html">依頼一覧に戻る →</a>`;
  }

  function memberListHtml(jr) {
    return `
      <ul class="eggRequestMemberList">
        ${jr.recipients
          .map((r) => `<li><a href="egg-hatch-profile.html?id=${encodeURIComponent(r.id)}">${escapeHtml(r.display_name)}</a>(ID:${r.id})</li>`)
          .join("")}
      </ul>`;
  }

  async function render(jr, currentUser) {
    const isRequester = jr.requester.id === currentUser.id;
    const page = document.getElementById("eggRequestDetailPage");

    const canRespond = !isRequester && jr.my_response_status === "pending"
      && (jr.status === "awaiting_responses" || jr.status === "reviewing_responses");

    const myResponseNote = !isRequester && jr.my_response_status && jr.my_response_status !== "pending"
      ? `<p class="eggApplyHint">あなたの回答：<strong>${jr.my_response_status === "accepted" ? "承諾" : "辞退"}</strong>(変更はできません)</p>`
      : "";

    page.innerHTML = `
      <div class="eggApplyHead">
        <p class="eggApplyEyebrow">お仕事依頼の詳細</p>
        <h1 class="eggApplyWorkTitle">${escapeHtml(jr.title)}</h1>
        <p class="eggApplyHint">
          <span class="eggRequestStatusTag eggRequestStatusTag--${jr.status}">${escapeHtml(jr.status_label)}</span>
          ・依頼日時：${formatDate(jr.created_at)}
        </p>
      </div>

      <section class="eggWorkBlock">
        <h2 class="eggWorkBlockTitle">依頼者</h2>
        <p class="eggApplyHint" style="margin:0;">${escapeHtml(jr.requester.display_name)}(ID:${jr.requester.id})</p>
      </section>

      <section class="eggWorkBlock">
        <h2 class="eggWorkBlockTitle">依頼本文</h2>
        <p class="eggApplyHint" style="margin:0;white-space:pre-wrap;">${jr.message ? escapeHtml(jr.message) : "(本文なし)"}</p>
      </section>

      <section class="eggWorkBlock">
        <h2 class="eggWorkBlockTitle">指定メンバー</h2>
        ${memberListHtml(jr)}
      </section>

      ${
        isRequester
          ? `<p class="eggRequestNoticeBox">
               この依頼は運営を経由してメンバーに届きます。各メンバーの個別の回答内容は、
               運営が最終結果を報告するまで表示されません。現在の状態は上部のバッジでご確認ください。
             </p>`
          : `
            ${myResponseNote}
            ${canRespond ? `
              <div class="eggRequestResponseBtnRow" id="eggRequestResponseButtons">
                <button type="button" class="eggRequestAcceptBtn" data-response="accepted">承諾する</button>
                <button type="button" class="eggRequestDeclineBtn" data-response="declined">辞退する</button>
              </div>
              <p class="eggApplyError" id="eggRequestResponseError" hidden></p>
            ` : ""}
          `
      }
    `;

    if (canRespond) {
      document.querySelectorAll("#eggRequestResponseButtons button").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const response = btn.dataset.response;
          const label = response === "accepted" ? "承諾" : "辞退";
          if (!window.confirm(`この依頼を「${label}」として回答します。あとから変更はできません。よろしいですか？`)) return;

          document.querySelectorAll("#eggRequestResponseButtons button").forEach((b) => (b.disabled = true));
          const errorEl = document.getElementById("eggRequestResponseError");
          errorEl.hidden = true;
          try {
            const updated = await EggAuth.apiFetch(`/job-requests/${jr.id}/respond`, {
              method: "POST",
              body: JSON.stringify({ response }),
            });
            render(updated, currentUser);
          } catch (err) {
            errorEl.textContent = err.message;
            errorEl.hidden = false;
            document.querySelectorAll("#eggRequestResponseButtons button").forEach((b) => (b.disabled = false));
          }
        });
      });
    }
  }

  async function init() {
    const id = getParam("id");
    if (!id) {
      renderError("依頼が指定されていません。");
      return;
    }

    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      window.location.replace(`egg-hatch-login.html?next=${encodeURIComponent("egg-hatch-request-detail.html?id=" + id)}`);
      return;
    }

    try {
      const jr = await EggAuth.apiFetch(`/job-requests/${id}`);
      render(jr, currentUser);
    } catch (e) {
      renderError("この依頼を閲覧する権限がないか、見つかりませんでした。");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
