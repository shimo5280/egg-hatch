/* ==========================================================================
   egg-hatch-relay-detail.js ― リレー漫画詳細

   ?id=1 でリレー漫画を特定し、GET /relay/mangas/<id> で
   採用済みパートを順番に表示する(誰でも閲覧できる)。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function isImage(mimeType) {
    return mimeType && mimeType.startsWith("image/");
  }

  function partHtml(part) {
    const fileUrl = `/relay/files/${part.file.id}/download`;
    return `
      <article class="eggRelayPart">
        <div class="eggRelayPartHead">
          <span class="eggRelayPartNumber">パート ${part.part_number}</span>
          <span class="eggRelayPartAuthor">
            作者：<a href="egg-hatch-profile.html?id=${encodeURIComponent(part.author.id)}">${escapeHtml(part.author.display_name)}</a>
          </span>
        </div>
        ${
          isImage(part.file.mime_type)
            ? `<div class="eggRelayPartImageWrap"><img class="eggRelayPartImage" src="${fileUrl}" alt="パート${part.part_number}"></div>`
            : `<a class="eggRelayPartFileLink" href="${fileUrl}" target="_blank" rel="noopener">📄 ${escapeHtml(part.file.original_filename)} を開く</a>`
        }
      </article>`;
  }

  async function init() {
    const id = getParam("id");
    const page = document.getElementById("eggRelayDetailPage");
    if (!id) {
      page.innerHTML = `<p class="eggRelayEmpty">リレー漫画が指定されていません。</p>`;
      return;
    }

    let manga;
    try {
      manga = await EggAuth.apiFetch(`/relay/mangas/${id}`);
    } catch (e) {
      page.innerHTML = `<p class="eggRelayEmpty">指定されたリレー漫画が見つかりませんでした。</p>`;
      return;
    }

    document.getElementById("eggRelayBackLink").href = "egg-hatch-relay.html";

    const currentUser = await EggAuth.getCurrentUser();
    const isAdmin = currentUser && currentUser.is_admin;

    const recruitmentBlock = manga.recruitment
      ? `<div class="eggRelayBtnRow" style="margin:20px 0;">
           <a class="eggRelayBtn eggRelayBtn--primary" href="egg-hatch-relay-submit.html?mangaId=${encodeURIComponent(manga.id)}">
             続き(パート${manga.recruitment.part_number})を応募する →
           </a>
           ${isAdmin ? `<a class="eggRelayBtn eggRelayBtn--ghost" href="egg-hatch-relay-review.html?mangaId=${encodeURIComponent(manga.id)}">公式ルートを決める(運営)→</a>` : ""}
         </div>`
      : `<p class="eggRelayEmpty">現在、次の続きの受付はお休み中です。</p>`;

    page.innerHTML = `
      <h1 class="eggRelayMangaTitle">${escapeHtml(manga.title)}</h1>
      <div class="eggRelayMeta" style="margin-bottom:10px;">
        <span class="eggRelayStageLabel${manga.status === "completed" ? " eggRelayStageLabel--completed" : ""}">${escapeHtml(manga.stage_label)}</span>
      </div>
      <p class="eggRelayMangaDesc">${escapeHtml(manga.description || "")}</p>
      ${recruitmentBlock}
      <div class="eggRelayPartList">
        ${manga.parts.map(partHtml).join("")}
      </div>
      <a class="eggRelayToMain" href="/">EGG HATCH本編へ戻る →</a>
    `;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
