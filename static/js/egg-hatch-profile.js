/* ==========================================================================
   egg-hatch-profile.js (Flask接続版)

   ?id=3 のようなクエリでユーザーIDを受け取り、
   GET /users/<id>/profile から実データを取得して表示します。

   「過去の提出作品」「参加作品」「完成作品」は、まだそれ専用の集計API
   (どの作品にいつ応募・参加したか、をまとめて返す仕組み)を作っていないため、
   準備中の表示にしています(正直に伝えています)。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function tagList(labels) {
    return `<div class="eggHatchTags">${labels.map((l) => `<span class="eggHatchTag">${escapeHtml(l)}</span>`).join("")}</div>`;
  }

  function renderNotFound() {
    document.getElementById("eggProfilePage").innerHTML = `
      <div class="eggWorkBlock" style="text-align:center;">
        <p class="eggWorkBlockText">指定されたクリエイターが見つかりませんでした。</p>
      </div>`;
  }

  function comingSoonSection(title) {
    return `
      <section class="eggProfileSection">
        <h2 class="eggProfileSectionTitle">${escapeHtml(title)}</h2>
        <p class="eggProfileEmpty">この一覧はまだ準備中です(どの作品に参加したかをまとめて取得する仕組みは今後追加予定です)。</p>
      </section>`;
  }

  function renderProfile(p, isSelf) {
    document.getElementById("eggProfilePage").innerHTML = `
      <div class="eggProfileHead">
        <div class="eggProfileAvatar">${escapeHtml(p.user.display_name.charAt(0))}</div>
        <div>
          <h1 class="eggProfileName">${escapeHtml(p.user.display_name)}</h1>
          <p class="eggProfileHandle">${p.handle ? escapeHtml(p.handle) : ""}</p>
          <p class="eggProfileWorldview">${p.worldview ? escapeHtml(p.worldview) : "「私の世界観」はまだ登録されていません。"}</p>
        </div>
      </div>

      <div class="eggProfileTagBlock">
        <div>
          <p class="eggProfileTagGroupLabel">得意分野</p>
          ${tagList(p.specialties)}
        </div>
        <div>
          <p class="eggProfileTagGroupLabel">やりたい役割</p>
          ${tagList(p.roles_wanted)}
        </div>
        <div>
          <p class="eggProfileTagGroupLabel">好き／得意なジャンル</p>
          ${tagList(p.genres)}
        </div>
      </div>

      ${isSelf ? `<p class="eggApplyHint" style="margin-bottom:20px;"><a href="#" id="eggProfileEditLink" style="color:var(--eh-gold);">このプロフィールを編集する →</a></p>` : ""}

      ${comingSoonSection("過去の提出作品")}
      ${comingSoonSection("参加作品")}
      ${comingSoonSection("完成作品")}
    `;

    if (isSelf) {
      document.getElementById("eggProfileEditLink").addEventListener("click", (e) => {
        e.preventDefault();
        openEditForm(p);
      });
    }
  }

  /* --- 簡易編集フォーム(本人のみ表示。PUT /me/profile ＋ /me/tags を呼ぶ) --- */
  function openEditForm(p) {
    const page = document.getElementById("eggProfilePage");
    const wrap = document.createElement("div");
    wrap.className = "eggWorkBlock";
    wrap.innerHTML = `
      <h2 class="eggWorkBlockTitle">プロフィールを編集</h2>
      <p class="eggApplyHint">私の世界観</p>
      <textarea class="eggApplyTextarea" id="eggProfileEditWorldview" rows="3">${escapeHtml(p.worldview || "")}</textarea>
      <p class="eggApplyHint" style="margin-top:10px;">得意分野・やりたい役割・ジャンル（カンマ区切り）</p>
      <input class="eggApplyInput" id="eggProfileEditSpecialties" placeholder="得意分野" value="${escapeHtml((p.specialties || []).join(", "))}" style="margin-bottom:6px;">
      <input class="eggApplyInput" id="eggProfileEditRoles" placeholder="やりたい役割" value="${escapeHtml((p.roles_wanted || []).join(", "))}" style="margin-bottom:6px;">
      <input class="eggApplyInput" id="eggProfileEditGenres" placeholder="ジャンル" value="${escapeHtml((p.genres || []).join(", "))}">
      <p class="eggApplyError" id="eggProfileEditError" hidden></p>
      <button class="eggWorkApplyBtn" id="eggProfileEditSave" style="margin-top:12px;">保存する</button>
    `;
    page.insertBefore(wrap, page.children[1]);

    document.getElementById("eggProfileEditSave").addEventListener("click", async () => {
      const errorEl = document.getElementById("eggProfileEditError");
      const splitList = (val) => val.split(",").map((s) => s.trim()).filter(Boolean);
      try {
        await EggAuth.apiFetch("/me/profile", {
          method: "PUT",
          body: JSON.stringify({ worldview: document.getElementById("eggProfileEditWorldview").value.trim() }),
        });
        await EggAuth.apiFetch("/me/tags", {
          method: "PUT",
          body: JSON.stringify({
            specialties: splitList(document.getElementById("eggProfileEditSpecialties").value),
            roles_wanted: splitList(document.getElementById("eggProfileEditRoles").value),
            genres: splitList(document.getElementById("eggProfileEditGenres").value),
          }),
        });
        window.location.reload();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  async function init() {
    const id = getParam("id");
    if (!id) {
      renderNotFound();
      return;
    }
    try {
      const [profile, currentUser] = await Promise.all([
        EggAuth.apiFetch(`/users/${id}/profile`),
        EggAuth.getCurrentUser(),
      ]);
      const isSelf = currentUser && currentUser.id === profile.user.id;
      renderProfile(profile, isSelf);
    } catch (e) {
      renderNotFound();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
