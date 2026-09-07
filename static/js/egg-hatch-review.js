/* ==========================================================================
   egg-hatch-review.js (Flask接続版)

   ?workId=2 で対象作品を特定し、GET /works/<id>/applications
   (発案者のみアクセス可)から実際の応募データを取得します。
   採用・見送りは PATCH /applications/<id> で実際に保存されます
   (ページを再読み込みしても消えません)。

   応募者の「私の世界観」「得意分野」は、応募データ自体には含まれていないため
   (プライバシー上、応募一覧には最小限の情報しか載せない設計にしています)、
   選択された応募者ごとに GET /users/<id>/profile を追加で取得しています。

   提出物について：今のバックエンドは「ファイル添付」だけを構造化して
   保存しており、文章・URL提出は intent/comment 欄に含まれる形になって
   います(元のプロトタイプにあった「提出タイプ」ほど厳密には分かれて
   いません)。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  const STATUS_LABEL = {
    pending: "未選考",
    candidate: "候補",
    accepted: "採用",
    declined: "見送り",
  };

  let applications = [];
  let selectedId = null;
  let activeRoleFilter = "all";
  let currentWorkId = null;
  const profileCache = {}; // applicant_id -> profile(取得済みならキャッシュする)

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function renderNoAccess(workId, message) {
    document.getElementById("eggReviewPage").innerHTML = `
      <div class="eggWorkBlock" style="text-align:center;">
        <p class="eggWorkBlockText">${escapeHtml(message)}</p>
        <p style="margin-top:12px;">
          <a href="egg-hatch-work.html?id=${encodeURIComponent(workId)}" style="color:var(--eh-gold);">作品詳細に戻る</a>
        </p>
      </div>`;
  }

  const FLOW_STEP_LABELS = ["作品詳細", "応募する", "選考・採用", "制作スペース"];
  function flowStepsHtml(currentIndex) {
    return `<div class="eggFlowSteps">${FLOW_STEP_LABELS.map(
      (label, i) =>
        `${i > 0 ? '<span class="eggFlowStepSep">→</span>' : ""}<span class="eggFlowStep${i === currentIndex ? " is-current" : ""}">${i + 1}. ${label}</span>`
    ).join("")}</div>`;
  }

  /* ---------------------------------------------------------------------
     骨組みの描画
     --------------------------------------------------------------------- */

  function renderShell(workId, work) {
    document.getElementById("eggReviewBackLink").href = `egg-hatch-work.html?id=${encodeURIComponent(workId)}`;

    const roles = [...new Set(applications.map((a) => a.role_name))];

    document.getElementById("eggReviewPage").innerHTML = `
      <div class="eggReviewHead">
        ${flowStepsHtml(2)}
        <p class="eggReviewEyebrow">選考画面（発案者用）</p>
        <h1 class="eggReviewTitle">${escapeHtml(work.title)}</h1>
        <div class="eggReviewStats" id="eggReviewStats"></div>
        <div class="eggReviewFilters" id="eggReviewFilters">
          <button class="eggReviewFilterBtn is-active" data-role="all">すべて</button>
          ${roles.map((r) => `<button class="eggReviewFilterBtn" data-role="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join("")}
        </div>
      </div>

      <p class="eggFlowGuide">📍 今の段階：応募内容を確認する選考画面です。左の一覧から応募を選び、右のパネルで内容を確認して「採用する」を押すと、次の「制作スペース」に進めます。</p>

      <div class="eggReviewLayout">
        <div class="eggReviewList" id="eggReviewList"></div>
        <div class="eggReviewDetail" id="eggReviewDetail"></div>
      </div>
    `;

    document.querySelectorAll(".eggReviewFilterBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeRoleFilter = btn.dataset.role;
        document.querySelectorAll(".eggReviewFilterBtn").forEach((b) => b.classList.toggle("is-active", b === btn));
        renderList();
      });
    });
  }

  function renderStats() {
    const total = applications.length;
    const accepted = applications.filter((a) => a.status === "accepted").length;
    const candidate = applications.filter((a) => a.status === "candidate").length;
    const declined = applications.filter((a) => a.status === "declined").length;

    document.getElementById("eggReviewStats").innerHTML = `
      <span><strong>${total}</strong>応募</span>
      <span><strong>${candidate}</strong>候補</span>
      <span><strong>${accepted}</strong>採用</span>
      <span><strong>${declined}</strong>見送り</span>
    `;
  }

  function renderList() {
    const list = document.getElementById("eggReviewList");
    const filtered = applications.filter((a) => activeRoleFilter === "all" || a.role_name === activeRoleFilter);

    if (!filtered.length) {
      list.innerHTML = `<p class="eggWorkTeamEmpty">該当する応募がありません。</p>`;
      return;
    }

    list.innerHTML = filtered
      .map(
        (a) => `
        <article class="eggReviewCard ${a.id === selectedId ? "is-selected" : ""}" data-id="${a.id}" tabindex="0">
          <div class="eggReviewCardTop">
            <div>
              <p class="eggReviewCardName">${escapeHtml(a.applicant.display_name)}</p>
              <p class="eggReviewCardRole">${escapeHtml(a.role_name)}</p>
            </div>
            <span class="eggReviewBadge eggReviewBadge--${a.status}">${STATUS_LABEL[a.status]}</span>
          </div>
          <p class="eggReviewCardPreview">${escapeHtml(a.intent)}</p>
        </article>`
      )
      .join("");

    list.querySelectorAll(".eggReviewCard").forEach((card) => {
      card.addEventListener("click", () => {
        selectedId = Number(card.dataset.id);
        renderList();
        renderDetail();
      });
    });

    renderStats();
  }

  /* ---------------------------------------------------------------------
     詳細パネル
     --------------------------------------------------------------------- */

  function submissionPreviewHtml(a) {
    if (!a.submission_file) {
      return `<p class="eggReviewDetailText">ファイルの提出はありません(文章・URLでの提出は「担当したい内容」「コメント」欄をご確認ください)。</p>`;
    }
    return `
      <div class="eggReviewSubmissionCover">${escapeHtml(a.applicant.display_name.slice(0, 1))}</div>
      <p class="eggReviewDetailText">
        提出ファイル：${escapeHtml(a.submission_file.original_filename)}
        （${Math.round(a.submission_file.size_bytes / 1024)}KB）<br>
        <a href="/files/${a.submission_file.id}/download" style="color:var(--eh-gold);">ダウンロードする →</a>
      </p>`;
  }

  async function renderDetail() {
    const detail = document.getElementById("eggReviewDetail");
    const a = applications.find((x) => x.id === selectedId);

    if (!a) {
      detail.innerHTML = `<p class="eggReviewDetailEmpty">左の一覧から応募を選んでください</p>`;
      return;
    }

    detail.innerHTML = `<p class="eggReviewDetailEmpty">読み込んでいます…</p>`;

    // 応募者プロフィール(私の世界観・得意分野)を取得(キャッシュがあれば使い回す)
    let profile = profileCache[a.applicant.id];
    if (!profile) {
      try {
        profile = await EggAuth.apiFetch(`/users/${a.applicant.id}/profile`);
        profileCache[a.applicant.id] = profile;
      } catch (e) {
        profile = { worldview: null, specialties: [] };
      }
    }

    detail.innerHTML = `
      <div class="eggReviewProfile">
        <div class="eggReviewAvatar">${escapeHtml(a.applicant.display_name.slice(0, 1))}</div>
        <div>
          <p class="eggReviewProfileName">
            <a href="egg-hatch-profile.html?id=${encodeURIComponent(a.applicant.id)}" style="color:inherit;text-decoration:underline;">${escapeHtml(a.applicant.display_name)}</a>
          </p>
          <p class="eggReviewProfileRole">応募役割：${escapeHtml(a.role_name)}</p>
          ${profile.worldview ? `<p class="eggReviewProfileWorldview">「${escapeHtml(profile.worldview)}」</p>` : ""}
          <div class="eggHatchTags" style="margin-top:8px;">
            ${(profile.specialties || []).map((s) => `<span class="eggHatchTag eggHatchTag--role">${escapeHtml(s)}</span>`).join("")}
          </div>
        </div>
      </div>

      <div class="eggReviewDetailBlock">
        <p class="eggReviewDetailLabel">提出内容</p>
        <div class="eggReviewSubmissionPreview">${submissionPreviewHtml(a)}</div>
      </div>

      <div class="eggReviewDetailBlock">
        <p class="eggReviewDetailLabel">自分が担当したい内容</p>
        <p class="eggReviewDetailText">${escapeHtml(a.intent)}</p>
      </div>

      <div class="eggReviewDetailBlock">
        <p class="eggReviewDetailLabel">コメント</p>
        <p class="eggReviewDetailText">${a.comment ? escapeHtml(a.comment) : "（コメントなし）"}</p>
      </div>

      <div class="eggReviewActions" id="eggReviewActions">
        <button class="eggReviewActionBtn ${a.status === "candidate" ? "is-active--candidate" : ""}" data-status="candidate">候補に保存</button>
        <button class="eggReviewActionBtn ${a.status === "accepted" ? "is-active--accepted" : ""}" data-status="accepted">採用する</button>
        <button class="eggReviewActionBtn ${a.status === "declined" ? "is-active--declined" : ""}" data-status="declined">見送る</button>
      </div>
      ${
        a.status === "accepted"
          ? `<p class="eggReviewNote" style="margin-top:10px;">🎉 採用しました。<a href="egg-hatch-team.html?workId=${encodeURIComponent(currentWorkId)}" style="color:var(--eh-gold);font-weight:700;">制作スペースへ進む →</a></p>`
          : ""
      }
      <p class="eggReviewNote">この選考結果は保存されます。</p>
    `;

    detail.querySelectorAll(".eggReviewActionBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const newStatus = a.status === btn.dataset.status ? "pending" : btn.dataset.status;
        btn.disabled = true;
        try {
          const updated = await EggAuth.apiFetch(`/applications/${a.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: newStatus }),
          });
          a.status = updated.status;
          renderList();
          renderDetail();
        } catch (e) {
          alert(e.message);
          btn.disabled = false;
        }
      });
    });
  }

  /* ---------------------------------------------------------------------
     初期化
     --------------------------------------------------------------------- */

  async function init() {
    const workId = getParam("workId");
    if (!workId) {
      renderNoAccess("", "対象の作品が指定されていません。");
      return;
    }

    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      // location.replaceで履歴を置き換える(「戻る」でこの選考画面に戻ってこないように)
      const next = `egg-hatch-review.html?workId=${encodeURIComponent(workId)}`;
      window.location.replace(`egg-hatch-login.html?next=${encodeURIComponent(next)}`);
      return;
    }

    let work;
    try {
      work = await EggAuth.apiFetch(`/works/${workId}`);
    } catch (e) {
      renderNoAccess(workId, "指定された作品が見つかりませんでした。");
      return;
    }

    try {
      applications = await EggAuth.apiFetch(`/works/${workId}/applications`);
    } catch (e) {
      // 403(発案者以外)など、権限が無い場合はここに来る
      renderNoAccess(workId, e.message || "この選考画面を見る権限がありません(発案者のみ閲覧できます)。");
      return;
    }

    currentWorkId = workId;
    selectedId = applications.length ? applications[0].id : null;

    renderShell(workId, work);
    renderList();
    renderDetail();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
