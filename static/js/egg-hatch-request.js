/* ==========================================================================
   egg-hatch-request.js ― お仕事依頼を作成する

   依頼相手は、既存のユーザーID(EggAuth/main appと同じUserテーブル)で指定する。
   ユーザーIDを入力→GET /users/<id>/profile(既存・公開エンドポイント)で
   実在確認と表示名取得を行い、「ID＋表示名」のチップとして一覧に追加する。
   1人でも、複数人でも指定できる。

   送信は POST /job-requests { title, message, recipient_user_ids: [...] }。
   通知・承認・契約などのフローはあえて作っていない(依頼の作成のみ)。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  // { id, display_name } の配列。チップ一覧の元データ。
  let recipients = [];

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function renderChips() {
    const box = document.getElementById("eggRequestChips");
    if (!recipients.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = recipients
      .map(
        (r) => `
        <span class="eggRequestChip" data-id="${r.id}">
          ${escapeHtml(r.display_name)}<span class="eggRequestChipId">(ID:${r.id})</span>
          <button type="button" aria-label="削除">✕</button>
        </span>`
      )
      .join("");

    box.querySelectorAll(".eggRequestChip button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.closest(".eggRequestChip").dataset.id);
        recipients = recipients.filter((r) => r.id !== id);
        renderChips();
        updateMultiNote();
      });
    });
  }

  function updateMultiNote() {
    const note = document.getElementById("eggRequestMultiNote");
    note.style.display = recipients.length >= 2 ? "block" : "none";
  }

  async function addRecipientById(rawId) {
    const errorEl = document.getElementById("eggRequestPickerError");
    errorEl.hidden = true;

    const id = Number(rawId);
    if (!rawId || !Number.isInteger(id) || id <= 0) {
      errorEl.textContent = "ユーザーIDは数字で入力してください。";
      errorEl.hidden = false;
      return;
    }
    if (recipients.some((r) => r.id === id)) {
      errorEl.textContent = "そのユーザーはすでに追加されています。";
      errorEl.hidden = false;
      return;
    }

    const addBtn = document.getElementById("eggRequestAddBtn");
    addBtn.disabled = true;
    try {
      // 既存の公開プロフィールAPIをそのまま使って、実在確認と表示名取得を行う
      const profile = await EggAuth.apiFetch(`/users/${id}/profile`);
      recipients.push({ id: profile.user.id, display_name: profile.user.display_name });
      renderChips();
      updateMultiNote();
      document.getElementById("eggRequestIdInput").value = "";
    } catch (e) {
      errorEl.textContent = `ID:${id} のユーザーが見つかりませんでした。IDをご確認ください。`;
      errorEl.hidden = false;
    } finally {
      addBtn.disabled = false;
    }
  }

  function renderForm() {
    document.getElementById("eggRequestPage").innerHTML = `
      <div class="eggApplyHead">
        <p class="eggApplyEyebrow">お仕事依頼</p>
        <h1 class="eggApplyWorkTitle">依頼を作成する</h1>
        <p class="eggApplyHint">
          個人への依頼だけでなく、複数のユーザーを指定して
          「このメンバーで作品を作ってほしい」という制作依頼もできます。
        </p>
      </div>

      <form class="eggApplyForm" id="eggRequestForm" novalidate>

        <section class="eggWorkBlock">
          <h2 class="eggWorkBlockTitle">依頼相手(ユーザーID)</h2>
          <p class="eggApplyHint">EGG HATCHに登録されているユーザーIDを入力してください。1人でも、複数人でも指定できます。</p>
          <div class="eggRequestRecipientPicker">
            <input class="eggApplyInput" type="number" min="1" id="eggRequestIdInput" placeholder="例：4">
            <button type="button" id="eggRequestAddBtn">追加</button>
          </div>
          <p class="eggApplyError" id="eggRequestPickerError" hidden></p>
          <div class="eggRequestChipList" id="eggRequestChips"></div>
          <p class="eggRequestMultiNote" id="eggRequestMultiNote" style="display:none;">
            複数人を指定しているため、このメンバーの組み合わせへの制作依頼として扱われます。
          </p>
        </section>

        <section class="eggWorkBlock">
          <h2 class="eggWorkBlockTitle">依頼のタイトル</h2>
          <input class="eggApplyInput" type="text" id="eggRequestTitle" placeholder="例：短編漫画の制作をお願いしたいです">
        </section>

        <section class="eggWorkBlock">
          <h2 class="eggWorkBlockTitle">依頼内容(任意)</h2>
          <textarea class="eggApplyTextarea" id="eggRequestMessage" rows="5" placeholder="どんな作品を、どんな形でお願いしたいか、具体的に書いてください。"></textarea>
        </section>

        <p class="eggApplyError" id="eggRequestFormError" hidden></p>

        <div class="eggApplySubmitRow">
          <button type="submit" class="eggWorkApplyBtn" id="eggRequestSubmitBtn">この内容で依頼する</button>
        </div>
      </form>

      <div class="eggApplyDone" id="eggRequestDone" hidden></div>
    `;

    document.getElementById("eggRequestAddBtn").addEventListener("click", () => {
      addRecipientById(document.getElementById("eggRequestIdInput").value.trim());
    });
    document.getElementById("eggRequestIdInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addRecipientById(document.getElementById("eggRequestIdInput").value.trim());
      }
    });

    document.getElementById("eggRequestForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("eggRequestFormError");
      errorEl.hidden = true;

      const title = document.getElementById("eggRequestTitle").value.trim();
      if (!title) {
        errorEl.textContent = "依頼のタイトルを入力してください。";
        errorEl.hidden = false;
        return;
      }
      if (!recipients.length) {
        errorEl.textContent = "依頼相手を、ユーザーIDで1人以上追加してください。";
        errorEl.hidden = false;
        return;
      }

      const submitBtn = document.getElementById("eggRequestSubmitBtn");
      submitBtn.disabled = true;
      submitBtn.textContent = "送信しています…";

      try {
        const created = await EggAuth.apiFetch("/job-requests", {
          method: "POST",
          body: JSON.stringify({
            title,
            message: document.getElementById("eggRequestMessage").value.trim(),
            recipient_user_ids: recipients.map((r) => r.id),
          }),
        });

        document.getElementById("eggRequestForm").hidden = true;
        const done = document.getElementById("eggRequestDone");
        done.hidden = false;
        done.innerHTML = `
          <div class="eggApplyDoneEgg">✉️</div>
          <h2 class="eggApplyDoneTitle">依頼を送りました</h2>
          <p class="eggApplyDoneText">
            「${escapeHtml(created.title)}」を、${created.recipients.map((r) => escapeHtml(r.display_name)).join("・")}
            さん${created.recipients.length >= 2 ? "たち" : ""}に依頼しました。
          </p>
          <p style="margin-top:18px;">
            <a href="egg-hatch-requests.html" style="color:var(--eh-gold);font-weight:700;">依頼一覧を見る →</a>
          </p>
        `;
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "この内容で依頼する";
      }
    });

    // ?to=4 のようにIDが渡されていれば、最初から依頼相手として追加しておく
    // (プロフィールページの「このクリエイターに依頼する」ボタンからの遷移用)
    const prefillId = getParam("to");
    if (prefillId) {
      addRecipientById(prefillId);
    }
  }

  async function init() {
    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      const next = "egg-hatch-request.html" + window.location.search;
      window.location.replace(`egg-hatch-login.html?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!currentUser.can_send_job_requests) {
      const isPendingClient = currentUser.account_type === "client" && !currentUser.is_approved;
      document.getElementById("eggRequestPage").innerHTML = `
        <div class="eggApplyHead">
          <p class="eggApplyEyebrow">お仕事依頼</p>
          <h1 class="eggApplyWorkTitle">${isPendingClient ? "運営の承認をお待ちください" : "この画面は依頼者アカウント専用です"}</h1>
          <p class="eggApplyHint">
            ${
              isPendingClient
                ? "依頼者登録ありがとうございます。運営が承認するまで、お仕事依頼の送信はできません。"
                : "お仕事の依頼を送るには、依頼者(出版社・編集者・企業など)アカウントでのログインが必要です。"
            }<br>
            あなた宛てに届いた依頼は<a href="egg-hatch-requests.html" style="color:var(--eh-gold);">こちら</a>から確認できます。
          </p>
        </div>
        <a class="eggWorkApplyBtn" href="egg-hatch-client.html">依頼者ページへ →</a>
      `;
      return;
    }
    renderForm();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
