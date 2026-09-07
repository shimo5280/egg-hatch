/* ==========================================================================
   egg-hatch-team.js (Flask接続版)

   メンバー一覧・進捗は GET /works/<id>/team (発案者・チームメンバーのみ
   アクセス可)から実データを取得します。

   制作チャット・ラフ提出・ファイル共有一覧は、まだ専用のデータベース
   テーブルを作っていないため、引き続き「この画面を開いている間だけ」の
   一時的な機能です(ページを再読み込みすると消えます)。
   ただし、ファイル共有の「アップロード」ボタンだけは実際に /uploads へ
   アップロードするようにしてあります(一覧に載せているだけで、実ファイル
   自体はサーバーに正しく保存されます)。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  let work = null;
  let members = [];
  let currentUser = null;
  const chat = [];
  const submissions = [];
  const sharedFiles = [];

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function renderNoAccess(workId, message) {
    document.getElementById("eggTeamPage").innerHTML = `
      <div class="eggWorkBlock" style="text-align:center;">
        <p class="eggWorkBlockText">${escapeHtml(message)}</p>
        <p style="margin-top:12px;">
          ${
            workId
              ? `<a href="egg-hatch-work.html?id=${encodeURIComponent(workId)}" style="color:var(--eh-gold);">作品詳細に戻る</a>`
              : `<a href="/" style="color:var(--eh-gold);">トップへ戻る</a>`
          }
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
     骨組み
     --------------------------------------------------------------------- */

  function renderShell(workId) {
    document.getElementById("eggTeamBackLink").href = `egg-hatch-work.html?id=${encodeURIComponent(workId)}`;

    document.getElementById("eggTeamPage").innerHTML = `
      <div class="eggTeamHead">
        ${flowStepsHtml(3)}
        <p class="eggTeamEyebrow">制作スペース</p>
        <h1 class="eggTeamTitle">${escapeHtml(work.title)}</h1>
        <div class="eggTeamHeadProgress" id="eggTeamProgress"></div>
      </div>

      <p class="eggFlowGuide">📍 今の段階：チームが成立し、ここは採用されたメンバーだけの作品専属スペースです。チャットで相談したり、ラフ・修正版を提出したりできます。</p>

      <div class="eggTeamTabs">
        <button class="eggTeamTabBtn is-active" data-tab="chat">制作チャット</button>
        <button class="eggTeamTabBtn" data-tab="submissions">ラフ・修正版提出</button>
      </div>

      <div class="eggTeamLayout">
        <div>
          <div class="eggTeamTabPanel is-active" id="eggTeamTabChat">
            <div class="eggTeamChatBlock">
              <div class="eggTeamChatLog" id="eggTeamChatLog"></div>
              <form class="eggTeamChatForm" id="eggTeamChatForm">
                <input class="eggTeamChatInput" id="eggTeamChatInput" type="text" placeholder="メッセージを入力（${escapeHtml(currentUser.display_name)} として送信）" autocomplete="off">
                <button type="submit" class="eggTeamChatSendBtn">送信</button>
              </form>
            </div>
            <p class="eggWorkApplyNote" style="margin-top:8px;">※ チャットはこの画面を開いている間だけの一時的な機能です(まだ保存されません)</p>
          </div>

          <div class="eggTeamTabPanel" id="eggTeamTabSubmissions">
            <div class="eggWorkBlock">
              <h2 class="eggWorkBlockTitle">ラフ・修正版提出</h2>
              <div id="eggTeamSubmissionList"></div>
              <form class="eggTeamSubmitForm" id="eggTeamSubmitForm">
                <select id="eggTeamSubmitKind">
                  <option value="ラフ">ラフ</option>
                  <option value="修正版">修正版</option>
                </select>
                <input type="text" id="eggTeamSubmitTitle" placeholder="例：第6話 P03 ラフ" required>
                <input type="text" id="eggTeamSubmitComment" placeholder="コメント（任意）">
                <button type="submit">提出する</button>
              </form>
              <p class="eggWorkApplyNote" style="margin-top:10px;">※ この一覧もこの画面限定の一時的な機能です(タイトルのみ、保存はされません)</p>
            </div>
          </div>
        </div>

        <aside>
          <div class="eggWorkSideCard">
            <h3 class="eggWorkSideTitle">メンバー一覧・担当役割</h3>
            <div id="eggTeamMemberList"></div>
          </div>

          <div class="eggWorkSideCard">
            <h3 class="eggWorkSideTitle">ファイル共有</h3>
            <div id="eggTeamFileList"></div>
            <div class="eggTeamFileUpload">
              <input type="file" id="eggTeamFileInput" accept="image/*,.pdf">
              <p class="eggWorkApplyNote">アップロード自体は本物です(サーバーに保存されます)。ただし一覧表示はこの画面限定です。</p>
            </div>
          </div>
        </aside>
      </div>
    `;

    document.querySelectorAll(".eggTeamTabBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".eggTeamTabBtn").forEach((b) => b.classList.toggle("is-active", b === btn));
        document.getElementById("eggTeamTabChat").classList.toggle("is-active", btn.dataset.tab === "chat");
        document.getElementById("eggTeamTabSubmissions").classList.toggle("is-active", btn.dataset.tab === "submissions");
      });
    });
  }

  /* ---------------------------------------------------------------------
     進捗(実データが無いため、募集役割の充足率を簡易的な目安として表示)
     --------------------------------------------------------------------- */

  function renderProgress() {
    const box = document.getElementById("eggTeamProgress");
    const total = work.roles.length;
    if (total === 0) {
      box.innerHTML = `<p class="eggWorkTeamEmpty" style="margin:0;">まだ制作は始まっていません。まずはチームで方向性を相談しましょう。</p>`;
      return;
    }
    const closed = work.roles.filter((r) => !r.is_open).length;
    const percent = Math.round((closed / total) * 100);
    box.innerHTML = `
      <div class="eggHatchProgress">
        <div class="eggHatchProgressLabel"><span>制作中</span><span>${percent}%</span></div>
        <div class="eggHatchProgressTrack">
          <div class="eggHatchProgressFill" style="width:${percent}%"></div>
          <span class="eggHatchProgressEgg" style="left:${percent}%">🥚</span>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------------
     メンバー(実データ)
     --------------------------------------------------------------------- */

  function renderMembers() {
    document.getElementById("eggTeamMemberList").innerHTML = members
      .map(
        (m) => `
        <div class="eggWorkTeamRow">
          <div class="eggWorkTeamAvatar">${escapeHtml(m.user.display_name.charAt(0))}</div>
          <div>
            <a href="egg-hatch-profile.html?id=${encodeURIComponent(m.user.id)}" style="color:inherit;text-decoration:none;" class="eggWorkTeamName">${escapeHtml(m.user.display_name)}</a>
            <div class="eggWorkTeamRoleLabel">${escapeHtml(m.role_name)}</div>
          </div>
        </div>`
      )
      .join("");
  }

  /* ---------------------------------------------------------------------
     チャット(一時的な機能)
     --------------------------------------------------------------------- */

  function renderChat() {
    const log = document.getElementById("eggTeamChatLog");
    log.innerHTML = chat
      .map((m) => {
        const mine = m.fromId === currentUser.id;
        return `
        <div class="eggTeamChatMsg ${mine ? "eggTeamChatMsg--me" : ""}">
          <div class="eggTeamChatAvatar">${escapeHtml(m.from.charAt(0))}</div>
          <div class="eggTeamChatBubbleWrap">
            <p class="eggTeamChatName">${escapeHtml(m.from)}</p>
            <div class="eggTeamChatBubble">${escapeHtml(m.text)}</div>
          </div>
        </div>`;
      })
      .join("");
    log.scrollTop = log.scrollHeight;
  }

  function setupChatForm() {
    document.getElementById("eggTeamChatForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("eggTeamChatInput");
      const text = input.value.trim();
      if (!text) return;
      chat.push({ from: currentUser.display_name, fromId: currentUser.id, text });
      input.value = "";
      renderChat();
    });
  }

  /* ---------------------------------------------------------------------
     ラフ・修正版提出(一時的な機能)
     --------------------------------------------------------------------- */

  function renderSubmissions() {
    const list = document.getElementById("eggTeamSubmissionList");
    if (!submissions.length) {
      list.innerHTML = `<p class="eggWorkTeamEmpty">まだ提出はありません。</p>`;
      return;
    }
    list.innerHTML = submissions
      .map(
        (s) => `
        <div class="eggTeamSubmissionRow">
          <div class="eggTeamSubmissionThumb">${escapeHtml(s.by.charAt(0))}</div>
          <div style="flex:1;">
            <div class="eggTeamSubmissionMeta">
              <span class="eggTeamSubmissionKind eggTeamSubmissionKind--${escapeHtml(s.kind)}">${escapeHtml(s.kind)}</span>
              <span>${escapeHtml(s.by)}</span>
            </div>
            <p class="eggTeamSubmissionTitle">${escapeHtml(s.title)}</p>
            <p class="eggTeamSubmissionComment">${escapeHtml(s.comment)}</p>
          </div>
        </div>`
      )
      .join("");
  }

  function setupSubmissionForm() {
    document.getElementById("eggTeamSubmitForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const kind = document.getElementById("eggTeamSubmitKind").value;
      const title = document.getElementById("eggTeamSubmitTitle").value.trim();
      const comment = document.getElementById("eggTeamSubmitComment").value.trim();
      if (!title) return;
      submissions.unshift({ kind, title, by: currentUser.display_name, comment });
      document.getElementById("eggTeamSubmitTitle").value = "";
      document.getElementById("eggTeamSubmitComment").value = "";
      renderSubmissions();
    });
  }

  /* ---------------------------------------------------------------------
     ファイル共有(アップロード自体は本物のAPIを使う)
     --------------------------------------------------------------------- */

  function renderFiles() {
    if (!sharedFiles.length) {
      document.getElementById("eggTeamFileList").innerHTML = `<p class="eggWorkTeamEmpty">まだ共有されたファイルはありません。</p>`;
      return;
    }
    document.getElementById("eggTeamFileList").innerHTML = sharedFiles
      .map(
        (f) => `
        <div class="eggTeamFileRow">
          <a href="/files/${f.id}/download" class="eggTeamFileName">${escapeHtml(f.original_filename)}</a>
          <span class="eggTeamFileMeta">${escapeHtml(f.by)}</span>
        </div>`
      )
      .join("");
  }

  function setupFileUpload() {
    document.getElementById("eggTeamFileInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const uploaded = await EggAuth.uploadFile(file);
        sharedFiles.unshift({ ...uploaded, by: currentUser.display_name });
        renderFiles();
      } catch (err) {
        alert(err.message);
      }
      e.target.value = "";
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

    currentUser = await EggAuth.getCurrentUser();
    if (!currentUser) {
      // location.replaceで履歴を置き換える(「戻る」でこの制作スペースに戻ってこないように)
      const next = `egg-hatch-team.html?workId=${encodeURIComponent(workId)}`;
      window.location.replace(`egg-hatch-login.html?next=${encodeURIComponent(next)}`);
      return;
    }

    try {
      work = await EggAuth.apiFetch(`/works/${workId}`);
    } catch (e) {
      renderNoAccess(workId, "指定された作品が見つかりませんでした。");
      return;
    }

    try {
      const team = await EggAuth.apiFetch(`/works/${workId}/team`);
      members = team.members;
    } catch (e) {
      renderNoAccess(workId, e.message || "この制作スペースに入る権限がありません(採用されたメンバーのみ閲覧できます)。");
      return;
    }

    renderShell(workId);
    renderProgress();
    renderMembers();
    renderChat();
    setupChatForm();
    renderSubmissions();
    setupSubmissionForm();
    renderFiles();
    setupFileUpload();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
