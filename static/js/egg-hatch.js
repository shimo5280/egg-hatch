/* ==========================================================================
   EGG HATCH - egg-hatch.js (Flask接続版)

   これまでは SAMPLE_* というその場限りの仮データを使っていましたが、
   ここから実際のバックエンド(Flask)の API から取得したデータを描画します。
   - GET /works    ... 全作品(公開情報のみ)
   - GET /creators ... プロフィールを作っているクリエイター一覧

   バックエンド側にまだ持たせていないデータ(ジャンル・締切日・チーム人数など)は、
   その旨をコードのコメントに残しつつ、簡易的な代用値で表示しています。
   ========================================================================== */

(() => {
  "use strict";

  /* ---------------------------------------------------------------------
     ユーティリティ
     --------------------------------------------------------------------- */

  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.innerHTML = content;
    return node;
  };

  const tagList = (labels, modifier) =>
    `<div class="eggHatchTags">${labels
      .map((label) => `<span class="eggHatchTag${modifier ? " " + modifier : ""}">${EggAuth.escapeHtml(label)}</span>`)
      .join("")}</div>`;

  function goToWorkDetail(workId) {
    window.location.href = `egg-hatch-work.html?id=${encodeURIComponent(workId)}`;
  }

  function makeCardNavigable(card, workId) {
    card.tabIndex = 0;
    card.addEventListener("click", () => goToWorkDetail(workId));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goToWorkDetail(workId);
      }
    });
  }

  function goToCreatorProfile(userId) {
    window.location.href = `egg-hatch-profile.html?id=${encodeURIComponent(userId)}`;
  }

  // 作品タイトルの1文字目を、カードの仮カバーとして使う(実際の表紙画像はまだ無いため)
  const glyphFor = (title) => (title ? title.charAt(0) : "?");

  /* ---------------------------------------------------------------------
     カード生成関数(データの形は API のレスポンスに合わせてある)
     --------------------------------------------------------------------- */

  function buildWorkCard(work) {
    const card = el("article", "eggHatchCard");
    card.dataset.workId = work.id;
    card.innerHTML = `
      <div class="eggHatchCardCover">${EggAuth.escapeHtml(glyphFor(work.title))}</div>
      <h3 class="eggHatchCardTitle">${EggAuth.escapeHtml(work.title)}</h3>
      <p class="eggHatchCardDesc">${EggAuth.escapeHtml(work.idea || work.synopsis || "")}</p>
    `;
    makeCardNavigable(card, work.id);
    return card;
  }

  function buildRecruitingCard(work) {
    const openRoles = work.roles.filter((r) => r.is_open).map((r) => r.role_name);
    const card = el("article", "eggHatchCard");
    card.dataset.workId = work.id;
    card.innerHTML = `
      <div class="eggHatchCardCover">${EggAuth.escapeHtml(glyphFor(work.title))}</div>
      <h3 class="eggHatchCardTitle">${EggAuth.escapeHtml(work.title)}</h3>
      <p class="eggHatchCardDesc">${EggAuth.escapeHtml(work.idea || "")}</p>
      ${tagList(openRoles, "eggHatchTag--role")}
      <div class="eggHatchCardMeta"><span>常時募集</span></div>
    `;
    // ※ 募集期限(deadline)はまだバックエンドで管理していないため、
    //   ひとまず「常時募集」で固定表示しています。
    makeCardNavigable(card, work.id);
    return card;
  }

  function buildProgressCard(work) {
    const totalRoles = work.roles.length;
    const closedRoles = work.roles.filter((r) => !r.is_open).length;
    // ※ 本来の制作進捗(%)はまだバックエンドで管理していないため、
    //   「募集していた役割のうち、埋まった割合」を簡易的な目安として使っています。
    const percent = totalRoles > 0 ? Math.round((closedRoles / totalRoles) * 100) : 50;

    const card = el("article", "eggHatchCard");
    card.dataset.workId = work.id;
    card.innerHTML = `
      <div class="eggHatchCardCover">${EggAuth.escapeHtml(glyphFor(work.title))}</div>
      <h3 class="eggHatchCardTitle">${EggAuth.escapeHtml(work.title)}</h3>
      <p class="eggHatchCardDesc">${EggAuth.escapeHtml(work.idea || "")}</p>
      <div class="eggHatchProgress">
        <div class="eggHatchProgressLabel">
          <span>制作中</span>
          <span>応募 ${work.applications_count}件</span>
        </div>
        <div class="eggHatchProgressTrack">
          <div class="eggHatchProgressFill" style="width:${percent}%"></div>
          <span class="eggHatchProgressEgg" style="left:${percent}%">🥚</span>
        </div>
      </div>
    `;
    makeCardNavigable(card, work.id);
    return card;
  }

  function buildPopularCard(work) {
    const card = el("article", "eggHatchCard");
    card.dataset.workId = work.id;
    card.innerHTML = `
      <div class="eggHatchCardCover">${EggAuth.escapeHtml(glyphFor(work.title))}</div>
      <h3 class="eggHatchCardTitle">${EggAuth.escapeHtml(work.title)}</h3>
      <p class="eggHatchCardDesc">${EggAuth.escapeHtml(work.idea || "")}</p>
      <div class="eggHatchCardMeta"><span>応募 ${work.applications_count}件</span></div>
    `;
    makeCardNavigable(card, work.id);
    return card;
  }

  function buildCreatorCard(profile) {
    const card = el("article", "eggHatchCard eggHatchCreatorCard");
    card.tabIndex = 0;
    card.dataset.creatorId = profile.user.id;
    card.innerHTML = `
      <div class="eggHatchCreatorAvatar">${EggAuth.escapeHtml(glyphFor(profile.user.display_name))}</div>
      <p class="eggHatchCreatorName">${EggAuth.escapeHtml(profile.user.display_name)}</p>
      <p class="eggHatchCreatorWorldview">${EggAuth.escapeHtml(profile.worldview || "")}</p>
      ${tagList(profile.roles_wanted)}
    `;
    card.addEventListener("click", () => goToCreatorProfile(profile.user.id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToCreatorProfile(profile.user.id); }
    });
    return card;
  }

  /* ---------------------------------------------------------------------
     描画
     --------------------------------------------------------------------- */

  function renderSection(containerId, items, buildFn, emptyText) {
    const container = document.getElementById(containerId);
    if (!container) return; // このページに該当セクションが無ければ何もしない
    if (!items.length) {
      container.innerHTML = `<p class="eggWorkTeamEmpty">${EggAuth.escapeHtml(emptyText)}</p>`;
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.appendChild(buildFn(item)));
    container.appendChild(fragment);
  }

  async function initTopPageSections() {
    let works = [];
    let creators = [];

    try {
      works = await EggAuth.apiFetch("/works");
    } catch (e) {
      console.error("作品一覧の取得に失敗しました", e);
    }
    try {
      creators = await EggAuth.apiFetch("/creators");
    } catch (e) {
      console.error("クリエイター一覧の取得に失敗しました", e);
    }

    const byNewest = [...works].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const recruiting = works.filter((w) => w.status === "recruiting");
    const inProgress = works.filter((w) => w.status === "in_progress");
    const completed = works.filter((w) => w.status === "completed");
    const popular = [...works].sort((a, b) => b.applications_count - a.applications_count).slice(0, 4);

    renderSection("newWorksShelf", byNewest.slice(0, 6), buildWorkCard, "まだ作品が投稿されていません。");
    renderSection("recruitingWorksGrid", recruiting, buildRecruitingCard, "現在募集中の作品はありません。");
    renderSection("inProgressWorksGrid", inProgress, buildProgressCard, "現在制作中の作品はありません。");
    renderSection("completedWorksShelf", completed, buildWorkCard, "まだ完成した作品はありません。");
    renderSection("popularWorksShelf", popular, buildPopularCard, "まだ応募が集まっている作品はありません。");
    renderSection("newCreatorsShelf", creators.slice(0, 6), buildCreatorCard, "まだプロフィールを登録したクリエイターがいません。");
  }

  document.addEventListener("DOMContentLoaded", initTopPageSections);
})();
