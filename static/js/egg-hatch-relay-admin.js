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

      <section class="eggRelayAdminSection" id="eggRelayClientApprovalSection">
        <h2 class="eggRelayAdminSectionTitle">⑤ 依頼者アカウントの承認</h2>
        <p class="eggRelayAdminSectionHint">
          登録しただけの依頼者アカウントは、お仕事依頼を送信できません。内容を確認し、問題なければ承認してください。
        </p>
        <div id="eggRelayClientApprovalList"><p class="eggRelayEmpty">読み込んでいます…</p></div>
      </section>

      <section class="eggRelayAdminSection" id="eggRelayJobRequestSection">
        <h2 class="eggRelayAdminSectionTitle">⑥ 仕事依頼管理</h2>
        <p class="eggRelayAdminSectionHint">
          依頼者からの仕事依頼は、まずここに届きます。内容を確認し、問題なければメンバーへ通知してください。
          メンバーの回答が出そろったら、成立／不成立を判断して依頼者へ結果を報告してください。
        </p>
        <div id="eggRelayJobRequestList"><p class="eggRelayEmpty">読み込んでいます…</p></div>
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
    renderClientApprovalList();
    renderJobRequestManagement();
  }

  async function renderClientApprovalList() {
    const box = document.getElementById("eggRelayClientApprovalList");
    let clients;
    try {
      clients = await EggAuth.apiFetch("/admin/clients");
    } catch (e) {
      box.innerHTML = `<p class="eggRelayEmpty">読み込みに失敗しました。</p>`;
      return;
    }

    if (!clients.length) {
      box.innerHTML = `<p class="eggRelayEmpty">依頼者アカウントの登録はまだありません。</p>`;
      return;
    }

    box.innerHTML = clients
      .map(
        (c) => `
        <div class="eggRelayAdminMangaRow" data-id="${c.id}">
          <span class="eggRelayAdminMangaTitle">
            ${escapeHtml(c.display_name)}${c.company_name ? `(${escapeHtml(c.company_name)})` : ""}
          </span>
          <span style="font-size:12px;color:var(--eh-text-muted);">${escapeHtml(c.email)}</span>
          <span class="eggRelayStatusTag eggRelayStatusTag--${c.is_approved ? "accepted" : "pending"}">
            ${c.is_approved ? "承認済み" : "未承認"}
          </span>
          <button type="button" class="eggRelayClientApprovalBtn" data-next="${c.is_approved ? "false" : "true"}">
            ${c.is_approved ? "承認を取り消す" : "承認する"}
          </button>
        </div>`
      )
      .join("");

    box.querySelectorAll(".eggRelayClientApprovalBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest(".eggRelayAdminMangaRow");
        const clientId = row.dataset.id;
        const nextApproved = btn.dataset.next === "true";
        btn.disabled = true;
        try {
          await EggAuth.apiFetch(`/admin/clients/${clientId}`, {
            method: "PATCH",
            body: JSON.stringify({ is_approved: nextApproved }),
          });
          renderClientApprovalList();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
  }

  const JOB_REQUEST_STATUS_LABELS = {
    pending_review: "運営確認待ち",
    rejected: "却下",
    awaiting_responses: "メンバー回答待ち",
    reviewing_responses: "回答確認中",
    finalized_success: "成立",
    finalized_failure: "不成立",
  };

  function jobRequestRowHtml(jr) {
    const recipientLines = jr.recipients
      .map((r) => `${escapeHtml(r.display_name)}(ID:${r.id})：${r.response_status === "pending" ? "未回答" : r.response_status === "accepted" ? "承諾" : "辞退"}`)
      .join(" / ");

    const actions = [];
    if (jr.status === "pending_review") {
      actions.push(`<button type="button" class="eggRequestPrimaryAction" data-action="notify">メンバーへ通知</button>`);
      actions.push(`<button type="button" class="eggRequestDangerAction" data-action="reject">依頼を却下</button>`);
    }
    if (jr.status === "awaiting_responses" || jr.status === "reviewing_responses") {
      actions.push(`<button type="button" class="eggRequestPrimaryAction" data-action="finalize-success">成立として報告</button>`);
      actions.push(`<button type="button" class="eggRequestDangerAction" data-action="finalize-failure">不成立として報告</button>`);
    }

    return `
      <div class="eggRelayJobRequestRow" data-id="${jr.id}">
        <div class="eggRelayJobRequestHead">
          <span style="font-weight:700;">#${jr.id} ${escapeHtml(jr.title)}</span>
          <span class="eggRequestStatusTag eggRequestStatusTag--${jr.status}">${escapeHtml(JOB_REQUEST_STATUS_LABELS[jr.status] || jr.status)}</span>
        </div>
        <p style="font-size:12px;color:var(--eh-text-muted);margin:0 0 6px;">
          依頼者：${escapeHtml(jr.requester.display_name)}(ID:${jr.requester.id})
          ／作成：${new Date(jr.created_at).toLocaleString("ja-JP")}
        </p>
        <p style="font-size:13px;margin:0 0 6px;white-space:pre-wrap;">${escapeHtml(jr.message || "(本文なし)")}</p>
        <p style="font-size:12.5px;margin:0;"><strong>指定メンバーの回答状況：</strong>${recipientLines}</p>
        ${actions.length ? `<div class="eggRelayJobRequestActions">${actions.join("")}</div>` : ""}
      </div>`;
  }

  async function renderJobRequestManagement() {
    const box = document.getElementById("eggRelayJobRequestList");
    let jobRequests;
    try {
      jobRequests = await EggAuth.apiFetch("/admin/job-requests");
    } catch (e) {
      box.innerHTML = `<p class="eggRelayEmpty">読み込みに失敗しました。</p>`;
      return;
    }

    if (!jobRequests.length) {
      box.innerHTML = `<p class="eggRelayEmpty">仕事依頼はまだありません。</p>`;
      return;
    }

    box.innerHTML = jobRequests.map(jobRequestRowHtml).join("");

    box.querySelectorAll(".eggRelayJobRequestActions button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest(".eggRelayJobRequestRow");
        const jobRequestId = row.dataset.id;
        const action = btn.dataset.action;

        let endpoint, body, confirmMsg;
        if (action === "notify") {
          endpoint = `/admin/job-requests/${jobRequestId}/notify`;
          confirmMsg = "この内容でメンバーへ通知します。よろしいですか？";
        } else if (action === "reject") {
          endpoint = `/admin/job-requests/${jobRequestId}/reject`;
          confirmMsg = "この依頼を却下します。メンバーには一切通知されません。よろしいですか？";
        } else if (action === "finalize-success") {
          endpoint = `/admin/job-requests/${jobRequestId}/finalize`;
          body = { result: "success" };
          confirmMsg = "この依頼を「成立」として依頼者へ報告します。よろしいですか？";
        } else if (action === "finalize-failure") {
          endpoint = `/admin/job-requests/${jobRequestId}/finalize`;
          body = { result: "failure" };
          confirmMsg = "この依頼を「不成立」として依頼者へ報告します。よろしいですか？";
        } else {
          return;
        }

        if (!window.confirm(confirmMsg)) return;

        row.querySelectorAll("button").forEach((b) => (b.disabled = true));
        try {
          await EggAuth.apiFetch(endpoint, { method: "POST", body: body ? JSON.stringify(body) : undefined });
          renderJobRequestManagement();
        } catch (err) {
          alert(err.message);
          row.querySelectorAll("button").forEach((b) => (b.disabled = false));
        }
      });
    });
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
