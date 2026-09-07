/* ==========================================================================
   egg-hatch-work.js (Flask接続版)

   ?id=2 のようなクエリパラメータで作品IDを受け取り、
   GET /works/<id> から実データを取得して表示します。

   キャラクター設定は、まだバックエンド側にテーブルが無いため
   「まだ登録されていません」という空表示になります(正直に伝えています)。
   制作メンバーは、チームメンバー以外には見せない権限設計になっているため、
   ログインしていない・チーム外の場合は「非公開」の案内を表示します。
   ========================================================================== */

(() => {
  "use strict";

  const STATUS_META = {
    idea: { label: "アイデア段階", css: "idea" },
    recruiting: { label: "募集中", css: "recruit" },
    in_progress: { label: "制作中", css: "progress" },
    completed: { label: "完成", css: "completed" },
  };

  function getWorkIdFromUrl() {
    return new URLSearchParams(window.location.search).get("id");
  }

  const escapeHtml = EggAuth.escapeHtml;

  /* ---------------------------------------------------------------------
     描画パーツ
     --------------------------------------------------------------------- */

  function renderRolesWanted(roles) {
    const openRoles = roles.filter((r) => r.is_open);
    if (!openRoles.length) {
      return `<p class="eggWorkTeamEmpty">まだ役割の募集は始まっていません。物語の方向性が固まり次第、ここに募集が表示されます。</p>`;
    }
    return openRoles
      .map(
        (r) => `
        <label class="eggApplyRoleOption" style="display:block;margin-bottom:8px;">
          <input type="radio" name="pickRole" value="${r.id}" style="margin-right:6px;">
          ${escapeHtml(r.role_name)}
          ${r.description ? `<br><span style="color:var(--eh-text-muted);font-size:11px;">${escapeHtml(r.description)}</span>` : ""}
          <span style="float:right;color:var(--eh-gold);font-size:11px;">応募${r.applications_count}件</span>
        </label>`
      )
      .join("");
  }

  function renderProgress(work) {
    if (work.status === "idea" || work.status === "recruiting") {
      return `<p class="eggWorkTeamEmpty">制作はまだ始まっていません。</p>`;
    }
    const total = work.roles.length;
    const closed = work.roles.filter((r) => !r.is_open).length;
    // ※ 詳細な進捗(%)はまだバックエンドで管理していないため、
    //   「募集していた役割のうち埋まった割合」を簡易的な目安にしています。
    const percent = total > 0 ? Math.round((closed / total) * 100) : 50;
    return `
      <div class="eggHatchProgress">
        <div class="eggHatchProgressLabel"><span>制作中</span><span>${percent}%</span></div>
        <div class="eggHatchProgressTrack">
          <div class="eggHatchProgressFill" style="width:${percent}%"></div>
          <span class="eggHatchProgressEgg" style="left:${percent}%">🥚</span>
        </div>
      </div>`;
  }

  const FLOW_STEP_LABELS = ["作品詳細", "応募する", "選考・採用", "制作スペース"];
  function flowStepsHtml(currentIndex) {
    return `<div class="eggFlowSteps">${FLOW_STEP_LABELS.map(
      (label, i) =>
        `${i > 0 ? '<span class="eggFlowStepSep">→</span>' : ""}<span class="eggFlowStep${i === currentIndex ? " is-current" : ""}">${i + 1}. ${label}</span>`
    ).join("")}</div>`;
  }

  function stageGuideHtml(work) {
    if (work.status === "idea") {
      return `<p class="eggFlowGuide">📍 今の段階：アイデア投稿のみで、まだ役割の募集は始まっていません。</p>`;
    }
    if (work.status === "recruiting") {
      return `<p class="eggFlowGuide">📍 今の段階：仲間を募集中です。右側の「募集中の役割」から<strong>応募する</strong>と、次の「選考」段階に進めます。</p>`;
    }
    return `<p class="eggFlowGuide">📍 今の段階：チームが結成され、制作が進んでいます。右下の「制作スペースへ」から実際の制作の様子を見られます(チームメンバーのみ閲覧可)。</p>`;
  }

  /* ---------------------------------------------------------------------
     メイン描画
     --------------------------------------------------------------------- */

  async function renderWork(work, currentUser) {
    const page = document.getElementById("eggWorkPage");
    const meta = STATUS_META[work.status] || { label: work.status, css: "idea" };
    const isOwner = currentUser && currentUser.id === work.owner_id;
    const openRolesCount = work.roles.filter((r) => r.is_open).length;

    page.innerHTML = `
      <div class="eggWorkHead">
        ${flowStepsHtml(0)}
        <span class="eggWorkStatus eggWorkStatus--${meta.css}">${escapeHtml(meta.label)}</span>
        <h1 class="eggWorkTitle">${escapeHtml(work.title)}</h1>
        <p class="eggWorkTheme">${escapeHtml(work.theme || "")}</p>
        <p class="eggWorkTheme" style="font-size:11.5px;">発案者：${escapeHtml(work.owner_name)}</p>
      </div>

      ${stageGuideHtml(work)}

      <div class="eggWorkLayout">
        <div class="eggWorkMain">

          <section class="eggWorkBlock">
            <h2 class="eggWorkBlockTitle">世界観</h2>
            <p class="eggWorkBlockText">${escapeHtml(work.worldview || "まだ登録されていません。")}</p>
          </section>

          <section class="eggWorkBlock">
            <h2 class="eggWorkBlockTitle">アイデア／原作内容</h2>
            <p class="eggWorkBlockText">${escapeHtml(work.idea)}</p>
            ${work.synopsis ? `<p class="eggWorkBlockText" style="margin-top:10px;">${escapeHtml(work.synopsis)}</p>` : ""}
            ${work.original_text ? `<p class="eggWorkBlockText" style="margin-top:10px;">${escapeHtml(work.original_text)}</p>` : ""}
          </section>

          <section class="eggWorkBlock">
            <h2 class="eggWorkBlockTitle">キャラクター設定</h2>
            <p class="eggWorkTeamEmpty">まだキャラクター設定は登録されていません。</p>
          </section>

          <section class="eggWorkBlock">
            <h2 class="eggWorkBlockTitle">応募作品一覧</h2>
            <p class="eggWorkApplicationsCount">現在 <strong>${work.applications_count}</strong> 件の応募が集まっています</p>
            ${
              isOwner
                ? `<a class="eggWorkNavBack" href="egg-hatch-review.html?workId=${encodeURIComponent(work.id)}">選考画面を見る（発案者用）→</a>`
                : `<p class="eggWorkTeamEmpty" style="margin:0;">応募内容の詳細は、発案者のみ確認できます。</p>`
            }
          </section>

        </div>

        <aside class="eggWorkSide">
          <div class="eggWorkSideCard">
            <h3 class="eggWorkSideTitle">募集中の役割</h3>
            ${renderRolesWanted(work.roles)}
            <button class="eggWorkApplyBtn" id="eggWorkApplyBtn" ${openRolesCount ? "" : "disabled style=\"opacity:.4;cursor:not-allowed;\""}>この作品に応募する</button>
            ${openRolesCount ? "" : '<p class="eggWorkApplyNote">※現在この作品では役割の募集がありません</p>'}
          </div>

          <div class="eggWorkSideCard">
            <h3 class="eggWorkSideTitle">制作進捗</h3>
            ${renderProgress(work)}
          </div>

          <div class="eggWorkSideCard" id="eggWorkTeamCard">
            <h3 class="eggWorkSideTitle">制作メンバー</h3>
            <p class="eggWorkTeamEmpty">読み込んでいます…</p>
          </div>
        </aside>
      </div>
    `;

    const applyBtn = document.getElementById("eggWorkApplyBtn");
    if (applyBtn && !applyBtn.disabled) {
      applyBtn.addEventListener("click", () => {
        if (!currentUser) {
          window.location.href = `egg-hatch-login.html?next=${encodeURIComponent("egg-hatch-apply.html?workId=" + work.id)}`;
          return;
        }
        window.location.href = `egg-hatch-apply.html?workId=${encodeURIComponent(work.id)}`;
      });
    }

    await renderTeamCard(work, currentUser, isOwner);
  }

  /* 制作メンバーは権限付きAPIなので、成功/403/未ログインで表示を出し分ける */
  async function renderTeamCard(work, currentUser, isOwner) {
    const card = document.getElementById("eggWorkTeamCard");
    if (!currentUser) {
      card.innerHTML = `
        <h3 class="eggWorkSideTitle">制作メンバー</h3>
        <p class="eggWorkTeamEmpty">制作メンバーの情報は、ログインしているチームメンバーのみ閲覧できます。</p>`;
      return;
    }
    try {
      const team = await EggAuth.apiFetch(`/works/${work.id}/team`);
      const rows = team.members
        .map((m) => `
          <div class="eggWorkTeamRow">
            <div class="eggWorkTeamAvatar">${escapeHtml(m.user.display_name.charAt(0))}</div>
            <div>
              <div class="eggWorkTeamName">${escapeHtml(m.user.display_name)}</div>
              <div class="eggWorkTeamRoleLabel">${escapeHtml(m.role_name)}</div>
            </div>
          </div>`)
        .join("");
      card.innerHTML = `
        <h3 class="eggWorkSideTitle">制作メンバー</h3>
        ${rows}
        <a class="eggWorkNavBack" style="display:block;margin-top:12px;" href="egg-hatch-team.html?workId=${encodeURIComponent(work.id)}">制作スペースへ →</a>`;
    } catch (e) {
      card.innerHTML = `
        <h3 class="eggWorkSideTitle">制作メンバー</h3>
        <p class="eggWorkTeamEmpty">${isOwner ? "まだチームは結成されていません。" : "制作メンバーの情報は、チームメンバーのみ閲覧できます。"}</p>`;
    }
  }

  function renderNotFound() {
    document.getElementById("eggWorkPage").innerHTML = `
      <div class="eggWorkBlock" style="text-align:center;">
        <p class="eggWorkBlockText">指定された作品が見つかりませんでした。</p>
        <p style="margin-top:12px;"><a href="/" style="color:var(--eh-gold);">トップへ戻る</a></p>
      </div>`;
  }

  async function init() {
    const id = getWorkIdFromUrl();
    if (!id) {
      renderNotFound();
      return;
    }
    try {
      const [work, currentUser] = await Promise.all([
        EggAuth.apiFetch(`/works/${id}`),
        EggAuth.getCurrentUser(),
      ]);
      renderWork(work, currentUser);
    } catch (e) {
      renderNotFound();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
