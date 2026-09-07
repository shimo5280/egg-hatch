/* ==========================================================================
   egg-hatch-relay-review.js ― 公式ルートを決める画面(運営用)

   「勝者を選ぶ」「審査で優劣を決める」のではなく、
   「今回の公式の続きとして、どの作品をつなぐか決定する」という位置づけの画面。
   採用されなかった作品も「落選」ではなく「今回は公式ルートには含まれなかった」
   という扱いにする(文言のみの違いで、データ上の扱いは変えていない)。

   ?mangaId=1 で対象を特定。GET /relay/mangas/<id>/submissions は
   運営(is_admin)以外は403になる(サーバー側で必ずチェックされる)。
   採用/不採用は PATCH /relay/submissions/<id> で確定する
   (内部的な状態名は accepted / rejected のまま。表示文言だけを変えている)。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  const STATUS_LABEL = { pending: "確認中", accepted: "公式ルートに採用", rejected: "今回は見送り" };

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function renderError(message, mangaId) {
    document.getElementById("eggRelayReviewPage").innerHTML = `
      <p class="eggRelayEmpty">${escapeHtml(message)}</p>
      ${mangaId ? `<a class="eggRelayToMain" href="egg-hatch-relay-detail.html?id=${encodeURIComponent(mangaId)}">リレー漫画詳細に戻る →</a>` : ""}`;
  }

  function isImage(mimeType) {
    return mimeType && mimeType.startsWith("image/");
  }

  function submissionCardHtml(s) {
    const fileUrl = `/relay/files/${s.file.id}/download`;
    return `
      <div class="eggRelaySubmissionCard" data-id="${s.id}">
        <div class="eggRelaySubmissionThumb">
          ${isImage(s.file.mime_type) ? `<img src="${fileUrl}" alt="">` : ""}
        </div>
        <div style="flex:1;">
          <div class="eggRelaySubmissionMeta">
            <a href="egg-hatch-profile.html?id=${encodeURIComponent(s.applicant.id)}">${escapeHtml(s.applicant.display_name)}</a>
            さんから届いた続き
            ・<span class="eggRelayStatusTag eggRelayStatusTag--${s.status}">${STATUS_LABEL[s.status]}</span>
          </div>
          <p class="eggRelaySubmissionComment">${s.comment ? escapeHtml(s.comment) : "(コメントなし)"}</p>
          <p style="margin:0 0 10px;"><a href="${fileUrl}" target="_blank" rel="noopener" style="font-size:12.5px;color:var(--eh-relay-accent);">ファイルを開く →</a></p>
          <div class="eggRelaySubmissionActions">
            <button class="eggRelayAccept" data-status="accepted" ${s.status !== "pending" ? "disabled" : ""}>公式の続きとして採用する</button>
            <button class="eggRelayReject" data-status="rejected" ${s.status !== "pending" ? "disabled" : ""}>今回は見送る</button>
          </div>
        </div>
      </div>`;
  }

  async function loadAndRenderSubmissions(mangaId, partNumber) {
    const list = document.getElementById("eggRelaySubmissionList");
    let submissions;
    try {
      submissions = await EggAuth.apiFetch(`/relay/mangas/${mangaId}/submissions?part_number=${partNumber}`);
    } catch (e) {
      list.innerHTML = `<p class="eggRelayEmpty">${escapeHtml(e.message)}</p>`;
      return;
    }

    if (!submissions.length) {
      list.innerHTML = `<p class="eggRelayEmpty">まだこのパートへ届いた続きはありません。</p>`;
      return;
    }

    list.innerHTML = submissions.map(submissionCardHtml).join("");

    list.querySelectorAll(".eggRelaySubmissionActions button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".eggRelaySubmissionCard");
        const submissionId = card.dataset.id;
        const status = btn.dataset.status;
        const label = status === "accepted"
          ? "この作品を、今回の公式の続きとして採用します。次のパートとしてつながります。よろしいですか？"
          : "この作品は、今回は公式ルートには採用しません。よろしいですか？";
        if (!window.confirm(label)) return;

        card.querySelectorAll("button").forEach((b) => (b.disabled = true));
        try {
          await EggAuth.apiFetch(`/relay/submissions/${submissionId}`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          });
          await loadAndRenderSubmissions(mangaId, partNumber);
          if (status === "accepted") {
            document.getElementById("eggRelayAcceptedNote").hidden = false;
          }
        } catch (e) {
          alert(e.message);
          card.querySelectorAll("button").forEach((b) => (b.disabled = false));
        }
      });
    });
  }

  async function init() {
    const mangaId = getParam("mangaId");
    if (!mangaId) {
      renderError("対象のリレー漫画が指定されていません。");
      return;
    }

    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      const next = `egg-hatch-relay-review.html?mangaId=${encodeURIComponent(mangaId)}`;
      window.location.replace(`egg-hatch-login.html?next=${encodeURIComponent(next)}`);
      return;
    }

    let manga;
    try {
      manga = await EggAuth.apiFetch(`/relay/mangas/${mangaId}`);
    } catch (e) {
      renderError("指定されたリレー漫画が見つかりませんでした。");
      return;
    }

    document.getElementById("eggRelayBackLink").href = `egg-hatch-relay-detail.html?id=${encodeURIComponent(manga.id)}`;

    if (!manga.recruitment) {
      renderError("現在、このリレー漫画は続きを募集していません(決定する対象がありません)。", manga.id);
      return;
    }

    const partNumber = manga.recruitment.part_number;

    document.getElementById("eggRelayReviewPage").innerHTML = `
      <h1 class="eggRelayMangaTitle">公式ルートを決める ―「${escapeHtml(manga.title)}」パート${partNumber}</h1>
      <p class="eggRelayMangaDesc">
        届いた続きを確認し、今回の公式ルートとしてつなぐ作品を1つ決定してください。
        採用されなかった作品も、今回は公式ルートに含まれなかったというだけで、
        優劣を判定したものではありません。
      </p>
      <p class="eggRelayMangaDesc" id="eggRelayAcceptedNote" hidden>
        🎉 今回の公式の続きとして採用し、パート${partNumber}としてつながりました。
        <a href="egg-hatch-relay-detail.html?id=${encodeURIComponent(manga.id)}">リレー漫画詳細で確認する →</a>
        次の続きを募集したい場合は、リレー漫画詳細ページから改めて募集を開始してください。
      </p>
      <div id="eggRelaySubmissionList"></div>
    `;

    await loadAndRenderSubmissions(manga.id, partNumber);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
