/* ==========================================================================
   egg-hatch-relay-admin.js ― 番外編 管理画面(運営用)

   ここで運営ができること(すべてサーバー側でも is_admin をチェック済み):
   1. 新しいシーズンを作る          POST  /relay/seasons
   2. テーマと期間を入れる(編集)   PATCH /relay/seasons/<id>
   3. 作品を作る                    POST  /relay/mangas
   4. 進行状況を変更する            PATCH /relay/mangas/<id>
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  const SEASON_OPTIONS = [
    { value: "spring", label: "春" },
    { value: "summer", label: "夏" },
    { value: "autumn", label: "秋" },
    { value: "winter", label: "冬" },
  ];

  function toDateInputValue(iso) {
    if (!iso) return "";
    return iso.slice(0, 10); // YYYY-MM-DD
  }

  function renderDenied(message) {
    document.getElementById("eggRelayAdminPage").innerHTML = `
      <p class="eggRelayEmpty">${escapeHtml(message)}</p>
      <a class="eggRelayToMain" href="egg-hatch-relay.html">番外編トップへ戻る →</a>`;
  }

  async function loadCurrentSeason() {
    try {
      return await EggAuth.apiFetch("/relay/seasons/current");
    } catch (e) {
      return null;
    }
  }

  function renderPage(season) {
    const page = document.getElementById("eggRelayAdminPage");

    const currentBox = season
      ? `<div class="eggRelayAdminCurrentBox">
           現在開催中：<strong>${escapeHtml(season.display_name)}</strong>
           ／テーマ「${escapeHtml(season.theme)}」
           ／${escapeHtml(toDateInputValue(season.starts_at))} ～ ${season.ends_at ? escapeHtml(toDateInputValue(season.ends_at)) : "未定"}
         </div>`
      : `<div class="eggRelayAdminCurrentBox">現在開催中のシーズンはありません。まず下から新しいシーズンを作成してください。</div>`;

    page.innerHTML = `
      <h1 class="eggRelayMangaTitle">番外編 管理画面</h1>
      <p class="eggRelayMangaDesc">シーズンの作成・テーマや期間の設定、作品の追加、進行状況の変更ができます。</p>
      ${currentBox}

      <section class="eggRelayAdminSection">
        <h2 class="eggRelayAdminSectionTitle">① 新しいシーズンを作る</h2>
        <p class="eggRelayAdminSectionHint">開催中のシーズンがある場合、自動的に終了してから切り替わります。</p>
        <form id="eggRelayNewSeasonForm">
          <div class="eggRelayAdminGrid">
            <div class="eggRelayAdminField">
              <label>季節</label>
              <select id="eggRelaySeasonKey">
                ${SEASON_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}
              </select>
            </div>
            <div class="eggRelayAdminField">
              <label>年</label>
              <input type="number" id="eggRelaySeasonYear" value="${new Date().getFullYear()}">
            </div>
            <div class="eggRelayAdminField">
              <label>開始日</label>
              <input type="date" id="eggRelaySeasonStarts">
            </div>
            <div class="eggRelayAdminField">
              <label>終了予定日(任意)</label>
              <input type="date" id="eggRelaySeasonEnds">
            </div>
            <div class="eggRelayAdminField" style="grid-column:1/-1;">
              <label>テーマ</label>
              <input type="text" id="eggRelaySeasonTheme" placeholder="例：変わっていく季節に、置いていかれるもの">
            </div>
            <div class="eggRelayAdminField" style="grid-column:1/-1;">
              <label>説明(任意)</label>
              <textarea id="eggRelaySeasonDesc" rows="2" placeholder="このテーマについて、参加者に伝えたいこと"></textarea>
            </div>
          </div>
          <p class="eggRelayError" id="eggRelayNewSeasonError" hidden></p>
          <div class="eggRelayAdminSubmitRow">
            <button type="submit" class="eggRelayBtn eggRelayBtn--primary">このシーズンを開始する</button>
          </div>
          <p class="eggRelayAdminSuccess" id="eggRelayNewSeasonSuccess" hidden></p>
        </form>
      </section>

      <section class="eggRelayAdminSection" id="eggRelayEditSeasonSection" ${season ? "" : "hidden"}>
        <h2 class="eggRelayAdminSectionTitle">② テーマと期間を入れる(現在のシーズンを編集)</h2>
        <p class="eggRelayAdminSectionHint">開催中のシーズンのテーマ・説明・期間をあとから調整できます。</p>
        <form id="eggRelayEditSeasonForm">
          <div class="eggRelayAdminGrid">
            <div class="eggRelayAdminField">
              <label>開始日</label>
              <input type="date" id="eggRelayEditStarts" value="${season ? toDateInputValue(season.starts_at) : ""}">
            </div>
            <div class="eggRelayAdminField">
              <label>終了予定日</label>
              <input type="date" id="eggRelayEditEnds" value="${season && season.ends_at ? toDateInputValue(season.ends_at) : ""}">
            </div>
            <div class="eggRelayAdminField" style="grid-column:1/-1;">
              <label>テーマ</label>
              <input type="text" id="eggRelayEditTheme" value="${season ? escapeHtml(season.theme) : ""}">
            </div>
            <div class="eggRelayAdminField" style="grid-column:1/-1;">
              <label>説明</label>
              <textarea id="eggRelayEditDesc" rows="2">${season ? escapeHtml(season.description || "") : ""}</textarea>
            </div>
          </div>
          <p class="eggRelayError" id="eggRelayEditSeasonError" hidden></p>
          <div class="eggRelayAdminSubmitRow">
            <button type="submit" class="eggRelayBtn eggRelayBtn--ghost">この内容で更新する</button>
          </div>
          <p class="eggRelayAdminSuccess" id="eggRelayEditSeasonSuccess" hidden></p>
        </form>
      </section>

      <section class="eggRelayAdminSection" id="eggRelayNewMangaSection" ${season ? "" : "hidden"}>
        <h2 class="eggRelayAdminSectionTitle">③ 作品を作る</h2>
        <p class="eggRelayAdminSectionHint">スタート作品(最初のページ)を公開すると、現在のシーズンに追加されます。</p>
        <form id="eggRelayNewMangaForm">
          <div class="eggRelayAdminGrid eggRelayAdminGrid--full">
            <div class="eggRelayAdminField">
              <label>タイトル</label>
              <input type="text" id="eggRelayMangaTitle" placeholder="例：夜明けの町">
            </div>
            <div class="eggRelayAdminField">
              <label>説明(任意)</label>
              <textarea id="eggRelayMangaDesc" rows="2" placeholder="どんな話の始まりか、簡単に"></textarea>
            </div>
            <div class="eggRelayAdminField">
              <label>スタート作品(画像またはPDF)</label>
              <div class="eggRelayFileDrop">
                <input type="file" id="eggRelayMangaFile" accept="image/*,.pdf">
                <div id="eggRelayMangaFileName" style="margin-top:8px;"></div>
              </div>
            </div>
          </div>
          <p class="eggRelayError" id="eggRelayNewMangaError" hidden></p>
          <div class="eggRelayAdminSubmitRow">
            <button type="submit" class="eggRelayBtn eggRelayBtn--primary">この作品を公開する</button>
          </div>
          <p class="eggRelayAdminSuccess" id="eggRelayNewMangaSuccess" hidden></p>
        </form>
      </section>

      <section class="eggRelayAdminSection" id="eggRelayStageSection" ${season ? "" : "hidden"}>
        <h2 class="eggRelayAdminSectionTitle">④ 進行状況を変更する</h2>
        <p class="eggRelayAdminSectionHint">
          「アイデア段階」「ストーリー制作中」「作画募集中」「制作中」「完成」など、自由な文言で今の状態を伝えられます。
        </p>
        <div id="eggRelayStageList"><p class="eggRelayEmpty">読み込んでいます…</p></div>
      </section>
    `;

    if (season) {
      document.getElementById("eggRelaySeasonStarts").value = toDateInputValue(season.starts_at);
    } else {
      document.getElementById("eggRelaySeasonStarts").value = new Date().toISOString().slice(0, 10);
    }

    setupNewSeasonForm();
    if (season) {
      setupEditSeasonForm(season);
      setupNewMangaForm(season);
      renderStageList(season);
    }
  }

  function setupNewSeasonForm() {
    document.getElementById("eggRelayNewSeasonForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("eggRelayNewSeasonError");
      const successEl = document.getElementById("eggRelayNewSeasonSuccess");
      errorEl.hidden = true;
      successEl.hidden = true;

      const theme = document.getElementById("eggRelaySeasonTheme").value.trim();
      const year = document.getElementById("eggRelaySeasonYear").value;
      const startsDate = document.getElementById("eggRelaySeasonStarts").value;
      const endsDate = document.getElementById("eggRelaySeasonEnds").value;

      if (!theme || !year || !startsDate) {
        errorEl.textContent = "季節・年・開始日・テーマは必須です。";
        errorEl.hidden = false;
        return;
      }

      try {
        await EggAuth.apiFetch("/relay/seasons", {
          method: "POST",
          body: JSON.stringify({
            season_key: document.getElementById("eggRelaySeasonKey").value,
            year: Number(year),
            theme,
            description: document.getElementById("eggRelaySeasonDesc").value.trim(),
            starts_at: `${startsDate}T00:00:00`,
            ends_at: endsDate ? `${endsDate}T00:00:00` : null,
          }),
        });
        successEl.textContent = "新しいシーズンを開始しました。ページを再読み込みします…";
        successEl.hidden = false;
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  function setupEditSeasonForm(season) {
    document.getElementById("eggRelayEditSeasonForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("eggRelayEditSeasonError");
      const successEl = document.getElementById("eggRelayEditSeasonSuccess");
      errorEl.hidden = true;
      successEl.hidden = true;

      const startsDate = document.getElementById("eggRelayEditStarts").value;
      const endsDate = document.getElementById("eggRelayEditEnds").value;

      try {
        await EggAuth.apiFetch(`/relay/seasons/${season.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            theme: document.getElementById("eggRelayEditTheme").value.trim(),
            description: document.getElementById("eggRelayEditDesc").value.trim(),
            starts_at: startsDate ? `${startsDate}T00:00:00` : undefined,
            ends_at: endsDate ? `${endsDate}T00:00:00` : null,
          }),
        });
        successEl.textContent = "更新しました。";
        successEl.hidden = false;
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  function setupNewMangaForm(season) {
    document.getElementById("eggRelayMangaFile").addEventListener("change", (e) => {
      const f = e.target.files[0];
      document.getElementById("eggRelayMangaFileName").textContent = f ? `選択中：${f.name}` : "";
    });

    document.getElementById("eggRelayNewMangaForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("eggRelayNewMangaError");
      const successEl = document.getElementById("eggRelayNewMangaSuccess");
      errorEl.hidden = true;
      successEl.hidden = true;

      const title = document.getElementById("eggRelayMangaTitle").value.trim();
      const file = document.getElementById("eggRelayMangaFile").files[0];

      if (!title || !file) {
        errorEl.textContent = "タイトルとスタート作品のファイルは必須です。";
        errorEl.hidden = false;
        return;
      }

      try {
        const uploaded = await EggAuth.uploadFile(file);
        await EggAuth.apiFetch("/relay/mangas", {
          method: "POST",
          body: JSON.stringify({
            title,
            description: document.getElementById("eggRelayMangaDesc").value.trim(),
            file_id: uploaded.id,
            season_id: season.id,
          }),
        });
        successEl.textContent = "作品を公開しました。ページを再読み込みします…";
        successEl.hidden = false;
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  function renderStageList(season) {
    const box = document.getElementById("eggRelayStageList");
    if (!season.mangas.length) {
      box.innerHTML = `<p class="eggRelayEmpty">このシーズンにはまだ作品がありません。上の「③ 作品を作る」から追加してください。</p>`;
      return;
    }

    box.innerHTML = season.mangas
      .map(
        (m) => `
        <div class="eggRelayAdminMangaRow" data-id="${m.id}">
          <span class="eggRelayAdminMangaTitle">${escapeHtml(m.title)}</span>
          <input type="text" class="eggRelayStageInput" value="${escapeHtml(m.stage_label)}" style="flex:1 0 160px;">
          <select class="eggRelayStatusSelect">
            <option value="open" ${m.status === "open" ? "selected" : ""}>進行中(open)</option>
            <option value="closed" ${m.status === "closed" ? "selected" : ""}>一時停止(closed)</option>
            <option value="completed" ${m.status === "completed" ? "selected" : ""}>完成(completed)</option>
          </select>
          <button type="button" class="eggRelayStageSaveBtn">更新する</button>
          <span class="eggRelayAdminSuccess" hidden>更新しました</span>
        </div>`
      )
      .join("");

    box.querySelectorAll(".eggRelayStageSaveBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest(".eggRelayAdminMangaRow");
        const mangaId = row.dataset.id;
        const stageLabel = row.querySelector(".eggRelayStageInput").value.trim();
        const status = row.querySelector(".eggRelayStatusSelect").value;
        const successTag = row.querySelector(".eggRelayAdminSuccess");

        if (!stageLabel) {
          alert("進行状況のラベルを入力してください。");
          return;
        }

        btn.disabled = true;
        successTag.hidden = true;
        try {
          await EggAuth.apiFetch(`/relay/mangas/${mangaId}`, {
            method: "PATCH",
            body: JSON.stringify({ stage_label: stageLabel, status }),
          });
          successTag.hidden = false;
        } catch (err) {
          alert(err.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function init() {
    const currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      window.location.replace(`egg-hatch-login.html?next=${encodeURIComponent("egg-hatch-relay-admin.html")}`);
      return;
    }
    if (!currentUser.is_admin) {
      renderDenied("この管理画面は運営のみ利用できます。");
      return;
    }

    const season = await loadCurrentSeason();
    renderPage(season);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
