/* ==========================================================================
   egg-hatch-relay-submit.js ― 続き応募画面

   ?mangaId=1 で対象のリレー漫画を特定。
   ファイルは本編と同じ /uploads (EggAuth.uploadFile)で安全にアップロードし、
   その file_id を POST /relay/mangas/<id>/submissions に送る。
   ログインしていなければ、ログインページへ誘導する。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function renderError(message) {
    document.getElementById("eggRelaySubmitPage").innerHTML = `
      <p class="eggRelayEmpty">${escapeHtml(message)}</p>
      <a class="eggRelayToMain" href="egg-hatch-relay.html">番外編トップへ戻る →</a>`;
  }

  function renderForm(manga, currentUser) {
    document.getElementById("eggRelayBackLink").href = `egg-hatch-relay-detail.html?id=${encodeURIComponent(manga.id)}`;

    document.getElementById("eggRelaySubmitPage").innerHTML = `
      <h1 class="eggRelayMangaTitle">「${escapeHtml(manga.title)}」への続きを応募する</h1>
      <p class="eggRelayMangaDesc">
        現在募集中：<strong>パート${manga.recruitment.part_number}</strong>
        (1回の応募につき目安 ${manga.recruitment.max_pages}ページ程度)
      </p>

      <form class="eggRelayForm" id="eggRelaySubmitForm">
        <label class="eggRelayFormLabel">漫画ファイル(画像またはPDF)</label>
        <p class="eggRelayFormHint">1〜${manga.recruitment.max_pages}ページ程度を1つのファイルにまとめてアップロードしてください。</p>
        <div class="eggRelayFileDrop">
          <input type="file" id="eggRelayFileInput" accept="image/*,.pdf">
          <div id="eggRelayFileName" style="margin-top:8px;"></div>
        </div>

        <label class="eggRelayFormLabel">コメント(任意)</label>
        <textarea class="eggRelayTextarea" id="eggRelayComment" rows="4" placeholder="どんな続きにしたか、簡単に説明してください(任意)"></textarea>

        <p class="eggRelayFormHint">応募者：${escapeHtml(currentUser.display_name)} さん(ログイン中の本人)</p>

        <p class="eggRelayError" id="eggRelayError" hidden></p>
        <button type="submit" class="eggRelayBtn eggRelayBtn--primary" id="eggRelaySubmitBtn">この内容で応募する</button>
      </form>

      <div id="eggRelayDone" hidden></div>
    `;

    document.getElementById("eggRelayFileInput").addEventListener("change", (e) => {
      const f = e.target.files[0];
      document.getElementById("eggRelayFileName").textContent = f ? `選択中：${f.name}` : "";
    });

    document.getElementById("eggRelaySubmitForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("eggRelayError");
      errorEl.hidden = true;

      const fileInput = document.getElementById("eggRelayFileInput");
      const file = fileInput.files[0];
      if (!file) {
        errorEl.textContent = "漫画ファイルを選択してください。";
        errorEl.hidden = false;
        return;
      }

      const submitBtn = document.getElementById("eggRelaySubmitBtn");
      submitBtn.disabled = true;
      submitBtn.textContent = "送信しています…";

      try {
        const uploaded = await EggAuth.uploadFile(file);
        await EggAuth.apiFetch(`/relay/mangas/${manga.id}/submissions`, {
          method: "POST",
          body: JSON.stringify({
            file_id: uploaded.id,
            comment: document.getElementById("eggRelayComment").value.trim(),
          }),
        });

        document.getElementById("eggRelaySubmitForm").hidden = true;
        const done = document.getElementById("eggRelayDone");
        done.hidden = false;
        done.innerHTML = `
          <p class="eggRelayMangaDesc">応募を送信しました。運営が内容を確認し、今回の公式の続きとして採用されると、パート${manga.recruitment.part_number}として正式につながります。</p>
          <a class="eggRelayBtn eggRelayBtn--ghost" href="egg-hatch-relay-detail.html?id=${encodeURIComponent(manga.id)}">リレー漫画詳細に戻る →</a>
        `;
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "この内容で応募する";
      }
    });
  }

  async function init() {
    const mangaId = getParam("mangaId");
    if (!mangaId) {
      renderError("応募先のリレー漫画が指定されていません。");
      return;
    }

    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      const next = `egg-hatch-relay-submit.html?mangaId=${encodeURIComponent(mangaId)}`;
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

    if (!manga.recruitment) {
      renderError("現在、このリレー漫画は続きを募集していません。");
      return;
    }

    renderForm(manga, currentUser);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
