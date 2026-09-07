/* ==========================================================================
   egg-hatch-relay.js ― 番外編トップ(シーズン制)

   GET /relay/seasons/current で、今開催中のシーズン(テーマ・開催期間・
   そのシーズンのリレー作品一覧)を取得して、主役として大きく表示する。
   GET /relay/seasons で、過去のシーズン(アーカイブ)も一覧できるようにする。
   ========================================================================== */

(() => {
  "use strict";

  const escapeHtml = EggAuth.escapeHtml;

  function formatDate(iso) {
    if (!iso) return "未定";
    return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  }

  function stageLabelHtml(manga) {
    const done = manga.status === "completed";
    return `<span class="eggRelayStageLabel${done ? " eggRelayStageLabel--completed" : ""}">${escapeHtml(manga.stage_label)}</span>`;
  }

  function mangaRecruitmentPill(manga) {
    if (manga.recruitment) {
      return `<span class="eggRelayStatusPill">続きを募集中(パート${manga.recruitment.part_number})</span>`;
    }
    return "";
  }

  function mangaCardHtml(manga) {
    return `
      <article class="eggRelayMangaCard">
        <h2 class="eggRelayMangaTitle">${escapeHtml(manga.title)}</h2>
        <p class="eggRelayMangaDesc">${escapeHtml(manga.description || "")}</p>
        <div class="eggRelayMeta">
          ${stageLabelHtml(manga)}
          ${mangaRecruitmentPill(manga)}
          <span>現在 <strong>パート${manga.current_part_number}</strong> まで公開中</span>
        </div>
        <div class="eggRelayBtnRow">
          <a class="eggRelayBtn eggRelayBtn--ghost" href="egg-hatch-relay-detail.html?id=${encodeURIComponent(manga.id)}">続きを読む</a>
          <a class="eggRelayBtn eggRelayBtn--primary" href="egg-hatch-relay-submit.html?mangaId=${encodeURIComponent(manga.id)}"
             ${manga.recruitment ? "" : 'style="pointer-events:none;opacity:.4;"'}>
            続きに応募する
          </a>
        </div>
      </article>`;
  }

  function seasonHeroHtml(season) {
    return `
      <div class="eggRelaySeasonHero">
        <p class="eggRelaySeasonName">${escapeHtml(season.display_name)}</p>
        <p class="eggRelaySeasonTheme">今回のテーマ「${escapeHtml(season.theme)}」</p>
        <p class="eggRelaySeasonPeriod">開催期間　${formatDate(season.starts_at)} ～ ${formatDate(season.ends_at)}</p>
        ${season.description ? `<p class="eggRelaySeasonDesc">${escapeHtml(season.description)}</p>` : ""}
        <span class="eggRelaySeasonCatch">このテーマから、みんなで1本の短編漫画を完成させよう。</span>
      </div>`;
  }

  async function renderArchive() {
    const box = document.getElementById("eggRelayArchive");
    let seasons;
    try {
      seasons = await EggAuth.apiFetch("/relay/seasons");
    } catch (e) {
      box.innerHTML = "";
      return;
    }

    const pastSeasons = seasons.filter((s) => s.status === "ended");
    if (!pastSeasons.length) {
      box.innerHTML = "";
      return;
    }

    box.innerHTML = `
      <h2 class="eggRelaySeasonSectionTitle">過去のシーズン</h2>
      ${pastSeasons
        .map(
          (s) => `
        <details class="eggRelayArchiveCard">
          <summary>${escapeHtml(s.display_name)}</summary>
          <p class="eggRelayArchiveTheme">テーマ「${escapeHtml(s.theme)}」・${formatDate(s.starts_at)} ～ ${formatDate(s.ends_at)}</p>
          <ul class="eggRelayArchiveMangaList" id="eggRelayArchiveMangas-${s.id}"><li>読み込み中…</li></ul>
        </details>`
        )
        .join("")}
    `;

    // 開いたときだけ中身を取りに行く(最初から全部取得すると通信が増えるため)
    pastSeasons.forEach((s) => {
      const details = box.querySelector(`#eggRelayArchiveMangas-${s.id}`).closest("details");
      details.addEventListener(
        "toggle",
        async () => {
          if (!details.open) return;
          try {
            const full = await EggAuth.apiFetch(`/relay/seasons/${s.id}`);
            const list = document.getElementById(`eggRelayArchiveMangas-${s.id}`);
            if (!full.mangas.length) {
              list.innerHTML = `<li>このシーズンの作品はありません。</li>`;
              return;
            }
            list.innerHTML = full.mangas
              .map(
                (m) => `<li>
                  <a href="egg-hatch-relay-detail.html?id=${encodeURIComponent(m.id)}">${escapeHtml(m.title)}</a>
                  ・${escapeHtml(m.stage_label)}
                </li>`
              )
              .join("");
          } catch (e) {
            /* 何も表示しない(致命的ではないため) */
          }
        },
        { once: true }
      );
    });
  }

  async function init() {
    const seasonBox = document.getElementById("eggRelaySeasonBox");
    const mangaListBox = document.getElementById("eggRelayMangaList");

    const currentUser = await EggAuth.getCurrentUser();
    if (currentUser && currentUser.is_admin) {
      const adminLinkBox = document.getElementById("eggRelayAdminLinkBox");
      if (adminLinkBox) {
        adminLinkBox.innerHTML = `<a class="eggRelayBtn eggRelayBtn--ghost" href="egg-hatch-relay-admin.html">運営用:番外編管理画面 →</a>`;
      }
    }

    try {
      const season = await EggAuth.apiFetch("/relay/seasons/current");
      seasonBox.innerHTML = seasonHeroHtml(season);

      if (!season.mangas.length) {
        mangaListBox.innerHTML = `<p class="eggRelayEmpty">このシーズンの作品はまだ準備中です。</p>`;
      } else {
        mangaListBox.innerHTML = `
          <h2 class="eggRelaySeasonSectionTitle">このシーズンの作品</h2>
          ${season.mangas.map(mangaCardHtml).join("")}
        `;
      }
    } catch (e) {
      seasonBox.innerHTML = `<p class="eggRelayEmpty">現在開催中のシーズンはありません。</p>`;
    }

    renderArchive();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
