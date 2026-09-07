/* ==========================================================================
   egg-hatch-apply.js (Flask接続版)

   ?workId=2 で対象作品を特定し、GET /works/<id> から募集中の役割を取得。
   ファイルは EggAuth.uploadFile() で実際に /uploads へアップロードしてから、
   その file_id を応募データに含めて POST /works/<id>/applications します。

   ログインしていない場合は、ログインページへ誘導します
   (応募者は必ずログイン中の本人として記録される仕組みのため)。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function renderNotFound() {
    document.getElementById("eggApplyPage").innerHTML = `
      <div class="eggWorkBlock" style="text-align:center;">
        <p class="eggWorkBlockText">応募先の作品が見つかりませんでした。作品詳細ページから応募してください。</p>
      </div>`;
  }

  const FLOW_STEP_LABELS = ["作品詳細", "応募する", "選考・採用", "制作スペース"];
  function flowStepsHtml(currentIndex) {
    return `<div class="eggFlowSteps">${FLOW_STEP_LABELS.map(
      (label, i) =>
        `${i > 0 ? '<span class="eggFlowStepSep">→</span>' : ""}<span class="eggFlowStep${i === currentIndex ? " is-current" : ""}">${i + 1}. ${label}</span>`
    ).join("")}</div>`;
  }

  function renderForm(workId, work, currentUser) {
    document.getElementById("eggApplyBackLink").href = `egg-hatch-work.html?id=${encodeURIComponent(workId)}`;

    const openRoles = work.roles.filter((r) => r.is_open);

    const rolesHtml = openRoles
      .map(
        (r, i) => `
        <label class="eggApplyRoleOption">
          <input type="radio" name="role" value="${r.id}" ${i === 0 ? "checked" : ""}>
          <span class="eggApplyRoleCard">
            <span>
              <p class="eggApplyRoleName">${escapeHtml(r.role_name)}</p>
              <p class="eggApplyRoleDesc">${escapeHtml(r.description || "")}</p>
            </span>
            <span class="eggApplyRoleApplicants">応募${r.applications_count}件</span>
          </span>
        </label>`
      )
      .join("");

    document.getElementById("eggApplyPage").innerHTML = `
      <div class="eggApplyHead">
        ${flowStepsHtml(1)}
        <p class="eggApplyEyebrow">応募する作品</p>
        <h1 class="eggApplyWorkTitle">${escapeHtml(work.title)}</h1>
        <p class="eggApplyWorkTheme">${escapeHtml(work.theme || "")}</p>
      </div>

      <p class="eggFlowGuide">📍 今の段階：役割を選んで応募する画面です。送信すると発案者による「選考」段階に進みます。</p>

      <form class="eggApplyForm" id="eggApplyForm" novalidate>

        <section class="eggWorkBlock">
          <h2 class="eggWorkBlockTitle">応募する役割を選ぶ</h2>
          <div class="eggApplyRoles">${rolesHtml}</div>
        </section>

        <section class="eggWorkBlock">
          <h2 class="eggWorkBlockTitle">自分が担当したい内容</h2>
          <p class="eggApplyHint">この役割で、具体的に何を作りたいか・どう関わりたいかを書いてください。</p>
          <textarea class="eggApplyTextarea" id="eggApplyIntent" rows="4" placeholder="例：姉妹の対比が伝わるよう、線の硬さを変えてキャラクターデザインを提案したいです。"></textarea>
        </section>

        <section class="eggWorkBlock">
          <h2 class="eggWorkBlockTitle">提出物</h2>
          <p class="eggApplyHint">文章・ネーム・キャラクターラフ・漫画ページなど、この作品向けに作ったサンプルを提出してください。</p>
          <div class="eggApplySubmitType" id="eggApplySubmitType">
            <button type="button" class="eggApplyTypeBtn is-active" data-type="text">文章で提出</button>
            <button type="button" class="eggApplyTypeBtn" data-type="file">画像/ファイルで提出</button>
            <button type="button" class="eggApplyTypeBtn" data-type="url">URLで提出</button>
          </div>
          <div class="eggApplySubmitArea" id="eggApplySubmitArea"></div>
          <p class="eggApplyHint" id="eggApplyFileHint" style="display:none;margin-top:6px;">画像(jpg/png/gif)またはPDF、10MBまで対応しています。</p>
        </section>

        <section class="eggWorkBlock">
          <h2 class="eggWorkBlockTitle">コメント</h2>
          <p class="eggApplyHint">発案者へのメッセージなど（任意）</p>
          <textarea class="eggApplyTextarea" id="eggApplyComment" rows="3" placeholder="よろしくお願いします、など"></textarea>
        </section>

        <section class="eggWorkBlock">
          <h2 class="eggWorkBlockTitle">応募者</h2>
          <p class="eggApplyHint" style="margin:0;">${escapeHtml(currentUser.display_name)} さんとして応募します(ログイン中の本人)</p>
        </section>

        <p class="eggApplyError" id="eggApplyError" hidden></p>

        <div class="eggApplySubmitRow">
          <button type="submit" class="eggWorkApplyBtn" id="eggApplySubmitBtn">この内容で応募する</button>
        </div>
      </form>

      <div class="eggApplyDone" id="eggApplyDone" hidden></div>
    `;

    setupSubmitTypeToggle();
    setupFormSubmit(workId, work);
  }

  /* --- 提出タイプ（文章／ファイル／URL）の切り替え --- */
  function setupSubmitTypeToggle() {
    const buttons = document.querySelectorAll("#eggApplySubmitType .eggApplyTypeBtn");
    const area = document.getElementById("eggApplySubmitArea");
    const fileHint = document.getElementById("eggApplyFileHint");

    const areas = {
      text: `<textarea class="eggApplyTextarea" id="eggApplySubmitText" rows="5" placeholder="ここに文章（プロット・脚本・ネーム原稿など）を貼り付けてください。"></textarea>`,
      file: `<div class="eggApplyFileDrop">
               画像・PDFなどのファイルを選択してください（ネーム／ラフ／漫画ページなど）
               <br><input type="file" id="eggApplySubmitFile" accept="image/*,.pdf">
               <div class="eggApplyFileName" id="eggApplyFileName"></div>
             </div>`,
      url: `<input class="eggApplyInput" type="url" id="eggApplySubmitUrl" placeholder="https://... （pixiv、Google Drive、SNS投稿などのリンク）">`,
    };

    function setType(type) {
      buttons.forEach((b) => b.classList.toggle("is-active", b.dataset.type === type));
      area.innerHTML = areas[type];
      area.dataset.type = type;
      fileHint.style.display = type === "file" ? "block" : "none";
      if (type === "file") {
        const fileInput = document.getElementById("eggApplySubmitFile");
        fileInput.addEventListener("change", () => {
          const name = fileInput.files[0] ? fileInput.files[0].name : "";
          document.getElementById("eggApplyFileName").textContent = name ? `選択中：${name}` : "";
        });
      }
    }

    buttons.forEach((b) => b.addEventListener("click", () => setType(b.dataset.type)));
    setType("text");
  }

  /* --- 送信処理：実際に /uploads → /works/<id>/applications へ送信する --- */
  function setupFormSubmit(workId, work) {
    const form = document.getElementById("eggApplyForm");
    const errorEl = document.getElementById("eggApplyError");
    const submitBtn = document.getElementById("eggApplySubmitBtn");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const roleInput = form.querySelector('input[name="role"]:checked');
      const intent = document.getElementById("eggApplyIntent").value.trim();
      const submitType = document.getElementById("eggApplySubmitArea").dataset.type;

      let urlValue = "";
      let fileToUpload = null;
      if (submitType === "url") {
        urlValue = document.getElementById("eggApplySubmitUrl").value.trim();
      } else if (submitType === "file") {
        const fileInput = document.getElementById("eggApplySubmitFile");
        fileToUpload = fileInput.files && fileInput.files[0];
      }
      const textValue = submitType === "text" ? document.getElementById("eggApplySubmitText").value.trim() : "";

      const hasSubmission = submitType === "text" ? !!textValue : submitType === "url" ? !!urlValue : !!fileToUpload;

      if (!roleInput || !intent || !hasSubmission) {
        errorEl.textContent = "役割・担当したい内容・提出物は必須です。入力内容をご確認ください。";
        errorEl.hidden = false;
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "送信しています…";

      try {
        let fileId = null;
        if (submitType === "file") {
          const uploaded = await EggAuth.uploadFile(fileToUpload);
          fileId = uploaded.id;
        }

        // URL提出の場合、専用のファイル欄が無いので comment に含めて発案者に伝える
        const comment = document.getElementById("eggApplyComment").value.trim();
        const combinedComment = submitType === "url" && urlValue
          ? `${comment ? comment + "\n" : ""}提出URL: ${urlValue}`
          : comment;

        const application = await EggAuth.apiFetch(`/works/${workId}/applications`, {
          method: "POST",
          body: JSON.stringify({
            work_role_id: Number(roleInput.value),
            intent,
            comment: combinedComment,
            file_id: fileId,
          }),
        });

        showDone(work, application, workId);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "この内容で応募する";
      }
    });
  }

  function showDone(work, application, workId) {
    document.getElementById("eggApplyForm").hidden = true;
    const done = document.getElementById("eggApplyDone");
    done.hidden = false;
    done.innerHTML = `
      <div class="eggApplyDoneEgg">🥚</div>
      <h2 class="eggApplyDoneTitle">応募を送信しました</h2>
      <p class="eggApplyDoneText">
        「${escapeHtml(work.title)}」の<strong>${escapeHtml(application.role_name)}</strong>への応募として、
        発案者に届きました。<br>
        発案者が内容を確認し、選考のうえ連絡する流れになります。
      </p>
      <p style="margin-top:18px;">
        📍 次にすること：<a href="egg-hatch-work.html?id=${encodeURIComponent(workId)}" style="color:var(--eh-gold);font-weight:700;">作品詳細に戻る →</a>
      </p>
    `;
  }

  async function init() {
    const workId = getParam("workId");
    if (!workId) {
      renderNotFound();
      return;
    }

    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      // 応募にはログインが必須。今いたページに戻れるよう next を付けてログインページへ
      // (location.replaceで履歴を置き換える。location.hrefだと「戻る」でこの応募ページに
      //  戻ってきてしまい、また未ログイン判定でループしたような挙動に見えてしまうため)
      const next = `egg-hatch-apply.html?workId=${encodeURIComponent(workId)}`;
      window.location.replace(`egg-hatch-login.html?next=${encodeURIComponent(next)}`);
      return;
    }

    try {
      const work = await EggAuth.apiFetch(`/works/${workId}`);
      renderForm(workId, work, currentUser);
    } catch (e) {
      renderNotFound();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
