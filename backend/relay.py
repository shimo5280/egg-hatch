"""
EGG HATCH 番外編 - リレー漫画

本編(works.py)とは別の機能として追加している。本編の権限ロジックには
一切手を入れず、既存の User(ログイン)・File(安全なアップロード)を
そのまま再利用する。

権限方針:
- 閲覧(一覧・詳細)は誰でもできる(本編の作品閲覧と同じ考え方)
- 「続きに応募する」のはログインしていれば誰でもできる(プロ/アマの区別をしない)
- リレー漫画の作成・募集の開始・応募の採用/不採用は「運営(is_admin)」のみ
  → フロントの表示を隠すだけでなく、ここ(サーバー側)で毎回チェックする
"""

from flask import Blueprint, request, jsonify, abort, send_from_directory
from flask_login import login_required, current_user

from models import db, RelayManga, RelayRecruitment, RelaySubmission, RelaySeason, RelayPart, File, _now
from files import _upload_folder  # 保存フォルダの取得だけ再利用する(既存のfiles.pyには一切手を入れない)

relay_bp = Blueprint("relay", __name__, url_prefix="/relay")


# ---------------------------------------------------------------------------
# 権限チェック用のヘルパー
# ---------------------------------------------------------------------------

def _require_admin():
    """運営(is_admin)本人でなければ 403 で止める"""
    if not current_user.is_authenticated or not current_user.is_admin:
        abort(403, description="この操作は運営のみ行えます。")


def _get_manga_or_404(manga_id):
    manga = db.session.get(RelayManga, manga_id)
    if manga is None:
        abort(404, description="指定されたリレー漫画が見つかりません。")
    return manga


def _get_current_season():
    """現在開催中(status='current')のシーズンを1件返す。無ければ None。"""
    return RelaySeason.query.filter_by(status="current").order_by(RelaySeason.starts_at.desc()).first()


def _validate_file_ownership(file_id):
    """指定されたfile_idが、今ログインしている本人がアップロードしたものかを確認する。
    本編(works.py)の応募処理と全く同じ考え方(他人のファイルIDを流用させない)。"""
    if not file_id:
        return None
    file_record = db.session.get(File, file_id)
    if file_record is None or file_record.uploaded_by != current_user.id:
        return "invalid"
    return file_record


# ---------------------------------------------------------------------------
# シーズン(春夏秋冬、約3か月ごとにテーマを1つ発表する)
# ---------------------------------------------------------------------------

@relay_bp.get("/seasons")
def list_seasons():
    """過去のシーズンも含めた一覧(アーカイブ用)。新しい順。"""
    seasons = RelaySeason.query.order_by(RelaySeason.starts_at.desc()).all()
    return jsonify([s.to_dict() for s in seasons])


@relay_bp.get("/seasons/current")
def get_current_season():
    """現在開催中のシーズンを、そのシーズンのリレー作品一覧つきで返す。"""
    season = _get_current_season()
    if season is None:
        abort(404, description="現在開催中のシーズンはありません。")
    return jsonify(season.to_dict(include_mangas=True))


@relay_bp.get("/seasons/<int:season_id>")
def get_season(season_id):
    season = db.session.get(RelaySeason, season_id)
    if season is None:
        abort(404, description="指定されたシーズンが見つかりません。")
    return jsonify(season.to_dict(include_mangas=True))


@relay_bp.post("/seasons")
@login_required
def create_season():
    """新しいシーズンを開始する(運営のみ)。

    現在開催中のシーズンがあれば、自動的に「終了(ended)」にしてから
    新しいシーズンを開始する(同時に複数シーズンが「開催中」にならないようにする)。
    """
    _require_admin()

    data = request.get_json(silent=True) or {}
    season_key = (data.get("season_key") or "").strip()
    theme = (data.get("theme") or "").strip()
    year = data.get("year")

    if season_key not in RelaySeason.SEASON_LABELS:
        return jsonify({"error": "season_key は spring / summer / autumn / winter のいずれかにしてください。"}), 400
    if not theme or not year:
        return jsonify({"error": "year とテーマ(theme)は必須です。"}), 400

    from datetime import datetime

    starts_at = _now_or_parse(data.get("starts_at"))
    ends_at = None
    if data.get("ends_at"):
        try:
            ends_at = datetime.fromisoformat(data["ends_at"])
        except ValueError:
            return jsonify({"error": "ends_at の日時形式が正しくありません。"}), 400

    # 開催中のシーズンがあれば、先に終了させる
    current = _get_current_season()
    if current is not None:
        current.status = "ended"
        if current.ends_at is None:
            current.ends_at = starts_at

    season = RelaySeason(
        season_key=season_key,
        year=int(year),
        theme=theme,
        description=(data.get("description") or "").strip(),
        starts_at=starts_at,
        ends_at=ends_at,
        status="current",
    )
    db.session.add(season)
    db.session.commit()
    return jsonify(season.to_dict()), 201


@relay_bp.patch("/seasons/<int:season_id>")
@login_required
def update_season(season_id):
    """シーズンのテーマ・開催期間・終了などを更新する(運営のみ)。"""
    season = db.session.get(RelaySeason, season_id)
    if season is None:
        abort(404, description="指定されたシーズンが見つかりません。")
    _require_admin()

    data = request.get_json(silent=True) or {}
    if "theme" in data:
        season.theme = (data.get("theme") or "").strip() or season.theme
    if "description" in data:
        season.description = (data.get("description") or "").strip()
    if "starts_at" in data and data["starts_at"]:
        from datetime import datetime
        try:
            season.starts_at = datetime.fromisoformat(data["starts_at"])
        except ValueError:
            return jsonify({"error": "starts_at の日時形式が正しくありません。"}), 400
    if "ends_at" in data:
        if data["ends_at"]:
            from datetime import datetime
            try:
                season.ends_at = datetime.fromisoformat(data["ends_at"])
            except ValueError:
                return jsonify({"error": "ends_at の日時形式が正しくありません。"}), 400
        else:
            season.ends_at = None
    if "status" in data:
        if data["status"] not in ("current", "ended"):
            return jsonify({"error": "status は current / ended のいずれかにしてください。"}), 400
        season.status = data["status"]
        if season.status == "ended" and season.ends_at is None:
            season.ends_at = _now()

    db.session.commit()
    return jsonify(season.to_dict())


def _now_or_parse(value):
    from datetime import datetime
    if not value:
        return _now()
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return _now()


# ---------------------------------------------------------------------------
# リレー漫画 一覧・詳細(誰でも閲覧できる)
# ---------------------------------------------------------------------------

@relay_bp.get("/mangas")
def list_mangas():
    mangas = RelayManga.query.order_by(RelayManga.updated_at.desc()).all()
    return jsonify([m.to_dict(include_parts=False) for m in mangas])


@relay_bp.get("/mangas/<int:manga_id>")
def get_manga(manga_id):
    manga = _get_manga_or_404(manga_id)
    return jsonify(manga.to_dict())


# ---------------------------------------------------------------------------
# リレー漫画の作成(運営のみ)= スタート作品の公開
# ---------------------------------------------------------------------------

@relay_bp.post("/mangas")
@login_required
def create_manga():
    _require_admin()

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    file_id = data.get("file_id")

    if not title or not file_id:
        return jsonify({"error": "タイトルと、スタート作品のファイルは必須です。"}), 400

    file_record = _validate_file_ownership(file_id)
    if file_record == "invalid":
        return jsonify({"error": "指定されたファイルが見つからないか、あなたがアップロードしたものではありません。"}), 400

    # season_id が指定されなければ、現在開催中のシーズンに自動で紐づける
    season_id = data.get("season_id")
    if season_id is None:
        current_season = _get_current_season()
        season_id = current_season.id if current_season else None

    manga = RelayManga(
        season_id=season_id,
        title=title,
        description=(data.get("description") or "").strip(),
        status="open",
        stage_label=(data.get("stage_label") or "アイデア段階").strip(),
        current_part_number=1,
    )
    db.session.add(manga)
    db.session.flush()  # manga.id を先に確定させる

    part1 = RelayPart(
        relay_manga_id=manga.id,
        part_number=1,
        author_id=current_user.id,
        file_id=file_record.id,
    )
    db.session.add(part1)
    db.session.commit()
    return jsonify(manga.to_dict()), 201


@relay_bp.patch("/mangas/<int:manga_id>")
@login_required
def update_manga(manga_id):
    """進行状況ラベル(stage_label)などを更新する(運営のみ)。

    工程を固定のパイプラインにせず、「今この作品に何が必要か」を運営が
    自由な文言で都度アップデートできるようにするための、追加のエンドポイント。
    """
    manga = _get_manga_or_404(manga_id)
    _require_admin()

    data = request.get_json(silent=True) or {}
    if "stage_label" in data:
        label = (data.get("stage_label") or "").strip()
        if not label:
            return jsonify({"error": "stage_label は空にできません。"}), 400
        manga.stage_label = label
    if "description" in data:
        manga.description = (data.get("description") or "").strip()
    if "status" in data:
        if data["status"] not in ("open", "closed", "completed"):
            return jsonify({"error": "status は open / closed / completed のいずれかにしてください。"}), 400
        manga.status = data["status"]

    db.session.commit()
    return jsonify(manga.to_dict())


# ---------------------------------------------------------------------------
# 募集(運営のみ開始できる)
# ---------------------------------------------------------------------------

@relay_bp.post("/mangas/<int:manga_id>/recruitments")
@login_required
def open_recruitment(manga_id):
    """次のパートの募集を開始する。既に募集中の場合は新しく開かない。"""
    manga = _get_manga_or_404(manga_id)
    _require_admin()

    if manga.open_recruitment() is not None:
        return jsonify({"error": "現在すでに募集中です。新しい募集を開始する前に、今の募集を終了(採用)してください。"}), 400

    data = request.get_json(silent=True) or {}
    closes_at = None
    if data.get("closes_at"):
        from datetime import datetime
        try:
            closes_at = datetime.fromisoformat(data["closes_at"])
        except ValueError:
            return jsonify({"error": "closes_at の日時形式が正しくありません。"}), 400

    recruitment = RelayRecruitment(
        relay_manga_id=manga.id,
        part_number=manga.current_part_number + 1,
        max_pages=int(data.get("max_pages") or 5),
        closes_at=closes_at,
        is_open=True,
    )
    db.session.add(recruitment)
    manga.status = "open"
    db.session.commit()
    return jsonify(recruitment.to_dict()), 201


# ---------------------------------------------------------------------------
# 応募する(ログインしていれば、プロ/アマ問わず誰でもできる)
# ---------------------------------------------------------------------------

@relay_bp.post("/mangas/<int:manga_id>/submissions")
@login_required
def submit_continuation(manga_id):
    manga = _get_manga_or_404(manga_id)

    recruitment = manga.open_recruitment()
    if recruitment is None:
        return jsonify({"error": "現在、続きの募集は行われていません。"}), 400

    data = request.get_json(silent=True) or {}
    file_id = data.get("file_id")
    if not file_id:
        return jsonify({"error": "漫画ファイル(画像またはPDF)は必須です。"}), 400

    file_record = _validate_file_ownership(file_id)
    if file_record == "invalid":
        return jsonify({"error": "指定されたファイルが見つからないか、あなたがアップロードしたものではありません。"}), 400

    submission = RelaySubmission(
        relay_manga_id=manga.id,
        target_part_number=recruitment.part_number,
        applicant_id=current_user.id,
        file_id=file_record.id,
        comment=(data.get("comment") or "").strip(),
        status="pending",
    )
    db.session.add(submission)
    db.session.commit()
    return jsonify(submission.to_dict()), 201


# ---------------------------------------------------------------------------
# 選考(運営のみ)
# ---------------------------------------------------------------------------

@relay_bp.get("/mangas/<int:manga_id>/submissions")
@login_required
def list_submissions(manga_id):
    manga = _get_manga_or_404(manga_id)
    _require_admin()

    part_number = request.args.get("part_number", type=int)
    query = RelaySubmission.query.filter_by(relay_manga_id=manga.id)
    if part_number is not None:
        query = query.filter_by(target_part_number=part_number)
    submissions = query.order_by(RelaySubmission.created_at.asc()).all()
    return jsonify([s.to_dict() for s in submissions])


@relay_bp.patch("/submissions/<int:submission_id>")
@login_required
def review_submission(submission_id):
    """採用／不採用を決める。運営のみ操作できる。

    採用した場合:
    - そのファイル・応募者を正式な RelayPart として追加する
    - リレー漫画の current_part_number を進める
    - 今回の募集を閉じる
    - 同じパートに応募していた他の pending 応募は、まとめて rejected にする
      (1パートにつき採用は1件だけなので、選考待ちのまま残さないため)
    """
    submission = db.session.get(RelaySubmission, submission_id)
    if submission is None:
        abort(404, description="指定された応募が見つかりません。")

    _require_admin()

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    if new_status not in ("accepted", "rejected"):
        return jsonify({"error": "status は accepted / rejected のいずれかにしてください。"}), 400

    if submission.status != "pending":
        return jsonify({"error": "すでに決定済みの応募です。"}), 400

    manga = submission.relay_manga

    if new_status == "accepted":
        # 二重採用の防止(同じパートに既に正式採用済みでないか)
        already = RelayPart.query.filter_by(
            relay_manga_id=manga.id, part_number=submission.target_part_number
        ).first()
        if already is not None:
            return jsonify({"error": "このパートは、すでに別の応募が採用済みです。"}), 400

        submission.status = "accepted"

        new_part = RelayPart(
            relay_manga_id=manga.id,
            part_number=submission.target_part_number,
            author_id=submission.applicant_id,
            file_id=submission.file_id,
        )
        db.session.add(new_part)
        manga.current_part_number = submission.target_part_number

        # この募集を閉じる
        recruitment = RelayRecruitment.query.filter_by(
            relay_manga_id=manga.id, part_number=submission.target_part_number, is_open=True
        ).first()
        if recruitment is not None:
            recruitment.is_open = False

        # 同じパートを狙っていた他の未選考の応募を、まとめて見送りにする
        others = RelaySubmission.query.filter(
            RelaySubmission.relay_manga_id == manga.id,
            RelaySubmission.target_part_number == submission.target_part_number,
            RelaySubmission.status == "pending",
            RelaySubmission.id != submission.id,
        ).all()
        for other in others:
            other.status = "rejected"
    else:
        submission.status = "rejected"

    db.session.commit()
    return jsonify(submission.to_dict())


# ---------------------------------------------------------------------------
# ファイル閲覧(番外編専用。本編の files.py には一切手を入れない)
#
# 本編のファイルは「アップロード本人」か「応募先の作品の発案者」しか
# 見られない設計だが、番外編は少し性質が違う:
#   - 採用済みパートの漫画ページは、誰でも(ログインしていなくても)読める
#     ようにしたい(「続きを読む」は本編の閲覧と同じく公開情報の扱い)
#   - まだ選考中の応募ファイルは、応募者本人と運営だけが見られればよい
# そのため専用のダウンロード経路をここに用意する。
# ---------------------------------------------------------------------------

@relay_bp.get("/files/<int:file_id>/download")
def download_relay_file(file_id):
    file_record = db.session.get(File, file_id)
    if file_record is None:
        abort(404, description="指定されたファイルが見つかりません。")

    # 採用済みパートのファイルなら、誰でも閲覧できる(ログイン不要)
    part = RelayPart.query.filter_by(file_id=file_id).first()
    if part is not None:
        return send_from_directory(
            _upload_folder(),
            file_record.stored_filename,
            mimetype=file_record.mime_type,
            as_attachment=False,  # 漫画ページなので、その場で表示できるようにする
            download_name=file_record.original_filename,
        )

    # それ以外(選考待ちの応募ファイルなど)は、応募者本人か運営のみ
    submission = RelaySubmission.query.filter_by(file_id=file_id).first()
    if submission is not None:
        if not current_user.is_authenticated:
            abort(403, description="このファイルにアクセスするにはログインが必要です。")
        if current_user.id != submission.applicant_id and not current_user.is_admin:
            abort(403, description="このファイルにアクセスする権限がありません。")
        return send_from_directory(
            _upload_folder(),
            file_record.stored_filename,
            mimetype=file_record.mime_type,
            as_attachment=False,
            download_name=file_record.original_filename,
        )

    # 番外編に一切紐づいていないファイルIDは、この経路では見せない
    abort(404, description="指定されたファイルが見つかりません。")
