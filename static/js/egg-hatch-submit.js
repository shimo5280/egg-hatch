/* ==========================================================================
   egg-hatch-submit.js
   作品／アイデア投稿ページのフォーム制御。

   「完成した原作がなくても参加できる」という思想に合わせ、必須項目は
   タイトルと短いアイデアのみにしています。他はすべて空欄のまま投稿できます。

   まだバックエンドが無いプロトタイプなので、送信しても実際には保存されず、
   入力内容は console.log に出力し、完了画面を表示するだけです。
   将来的には fetch('/api/works', { method: 'POST', body: ... }) に
   置き換える想定で、payload の形を整えています。
   ========================================================================== */

(() => {
  "use strict";

  const GENRES = [
    "ヒューマンドラマ", "SF", "ファンタジー", "ダークファンタジー",
    "青春", "ミステリー", "サスペンス", "コメディ", "日常", "スチームパンク",
  ];

  let characterCount = 0;
  let roleCount = 0;

  function renderGenreChips() {
    const grid = document.getElementById("eggSubmitGenreGrid");
    grid.innerHTML = GENRES.map(
      (g, i) => `
      <label class="eggSubmitGenreChip">
        <input type="checkbox" name="genre" value="${g}" id="genre-${i}">
        <span>${g}</span>
      </label>`
    ).join("");
  }

  /* --- キャラクター設定：行の追加／削除 --- */
  function addCharacterRow() {
    characterCount += 1;
    const id = `char-${characterCount}`;
    const row = document.createElement("div");
    row.className = "eggSubmitRepeatRow";
    row.dataset.rowId = id;
    row.innerHTML = `
      <button type="button" class="eggSubmitRemoveBtn" aria-label="削除">✕ 削除</button>
      <input class="eggApplyInput" type="text" placeholder="名前（例：アリス）" data-field="name">
      <input class="eggApplyInput" type="text" placeholder="役割（例：主人公）" data-field="role">
      <textarea class="eggApplyTextarea" rows="2" placeholder="簡単な人物紹介" data-field="desc"></textarea>
    `;
    row.querySelector(".eggSubmitRemoveBtn").addEventListener("click", () => row.remove());
    document.getElementById("eggSubmitCharacterList").appendChild(row);
  }

  /* --- 募集したい役割：行の追加／削除 --- */
  function addRoleRow() {
    roleCount += 1;
    const id = `role-${roleCount}`;
    const row = document.createElement("div");
    row.className = "eggSubmitRepeatRow";
    row.dataset.rowId = id;
    row.innerHTML = `
      <button type="button" class="eggSubmitRemoveBtn" aria-label="削除">✕ 削除</button>
      <input class="eggApplyInput" type="text" placeholder="役割名（例：キャラクターデザイン）" data-field="role">
      <textarea class="eggApplyTextarea" rows="2" placeholder="お願いしたい内容" data-field="desc"></textarea>
    `;
    row.querySelector(".eggSubmitRemoveBtn").addEventListener("click", () => row.remove());
    document.getElementById("eggSubmitRoleList").appendChild(row);
  }

  function collectRepeatRows(containerId) {
    return Array.from(document.getElementById(containerId).querySelectorAll(".eggSubmitRepeatRow"))
      .map((row) => {
        const entry = {};
        row.querySelectorAll("[data-field]").forEach((input) => {
          entry[input.dataset.field] = input.value.trim();
        });
        return entry;
      })
      .filter((entry) => Object.values(entry).some((v) => v)); // 全部空の行は除外
  }

  /* --- 募集期限：ラジオで日付入力の有効／無効を切り替え --- */
  function setupDeadlineToggle() {
    const radios = document.querySelectorAll('input[name="deadlineType"]');
    const dateInput = document.getElementById("eggSubmitDeadlineDate");
    radios.forEach((r) => {
      r.addEventListener("change", () => {
        dateInput.disabled = r.value !== "date" ? true : false;
        if (document.querySelector('input[name="deadlineType"]:checked').value !== "date") {
          dateInput.disabled = true;
        } else {
          dateInput.disabled = false;
        }
      });
    });
  }

  /* --- 送信：実際に POST /works → POST /works/<id>/roles の順で送信する --- */
  function setupSubmit() {
    const form = document.getElementById("eggSubmitForm");
    const errorEl = document.getElementById("eggSubmitError");
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;

      const title = document.getElementById("eggSubmitTitle").value.trim();
      const idea = document.getElementById("eggSubmitIdea").value.trim();

      if (!title || !idea) {
        errorEl.textContent = "タイトルと短いアイデアは必須です。他の項目は空欄のままで投稿できます。";
        errorEl.hidden = false;
        return;
      }

      const rolesWanted = collectRepeatRows("eggSubmitRoleList").filter((r) => r.role);

      submitBtn.disabled = true;
      submitBtn.textContent = "投稿しています…";

      try {
        const work = await EggAuth.apiFetch("/works", {
          method: "POST",
          body: JSON.stringify({
            title,
            theme: document.getElementById("eggSubmitTheme").value.trim(),
            idea,
            synopsis: document.getElementById("eggSubmitSynopsis").value.trim(),
            worldview: document.getElementById("eggSubmitWorldview").value.trim(),
            original_text: document.getElementById("eggSubmitOriginal").value.trim(),
          }),
        });

        // 役割は1件ずつ、別のAPI(work_roles)へ登録する
        for (const r of rolesWanted) {
          await EggAuth.apiFetch(`/works/${work.id}/roles`, {
            method: "POST",
            body: JSON.stringify({ role_name: r.role, description: r.desc || "" }),
          });
        }

        showDone(work);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "この内容で投稿する";
      }
    });
  }

  function showDone(work) {
    document.getElementById("eggSubmitForm").hidden = true;
    const done = document.getElementById("eggSubmitDone");
    done.hidden = false;
    done.innerHTML = `
      <div class="eggApplyDoneEgg">🥚</div>
      <h2 class="eggApplyDoneTitle">「${EggAuth.escapeHtml(work.title)}」を投稿しました</h2>
      <p class="eggApplyDoneText">
        募集したい役割を入力していた場合は、その募集も同時に始まっています。<br>
        書き足りない部分は、あとからいつでも育てていくことができます。
      </p>
      <p class="eggApplyDoneNote">
        ※ ジャンル・キャラクター設定・応募用課題・募集期限は、まだ保存する仕組みを
        作っていないため、今回は保存されていません(タイトル・テーマ・アイデア・
        あらすじ・世界観・原作/プロット・募集役割は保存されています)。
      </p>
      <p style="margin-top:18px;">
        <a href="egg-hatch-work.html?id=${work.id}" style="color:var(--eh-gold);font-weight:700;">投稿した作品を見る →</a>
      </p>
    `;
  }

  async function init() {
    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      // 未ログイン時はログインページへ「置き換えて」移動する(location.hrefだと履歴が1つ増え、
      // ログイン後に「戻る」を押すとこの投稿ページに戻ってきてしまうため)
      window.location.replace(`egg-hatch-login.html?next=${encodeURIComponent("egg-hatch-submit.html")}`);
      return;
    }
    renderGenreChips();
    addCharacterRow();
    addRoleRow();
    document.getElementById("eggSubmitAddCharacter").addEventListener("click", addCharacterRow);
    document.getElementById("eggSubmitAddRole").addEventListener("click", addRoleRow);
    setupDeadlineToggle();
    setupSubmit();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
