"""
EGG HATCH - 作品・応募・チーム関連のルート(設計ドキュメントの「3」に対応)

ここでの一番の目的は「権限チェック」です。
- 応募一覧・選考(採用/見送り)を見られる／操作できるのは、その作品の発案者だけ
- 制作スペース(チームの情報)を見られるのは、発案者 と 採用されたメンバーだけ

フロントエンド(ボタンを隠す・リンクを出さない)だけに頼らず、
**サーバー側のこのファイルで毎回チェックする**ことが重要です。
URLを直接叩かれても、権限が無ければ 403 を返すようにしています。
"""

from flask import Blueprint, request, jsonify, abort
from flask_login import login_required, current_user

from models import db, Work, WorkRole, Application, TeamMember, File

works_bp = Blueprint("works", __name__)


# ---------------------------------------------------------------------------
# 権限チェック用のヘルパー
# ---------------------------------------------------------------------------

def _get_work_or_404(work_id):
    work = db.session.get(Work, work_id)
    if work is None:
        abort(404, description="指定された作品が見つかりません。")
    return work


def _require_owner(work):
    """作品の発案者本人でなければ 403 で止める"""
    if current_user.id != work.owner_id:
        abort(403, description="この操作は、作品の発案者のみ行えます。")


def _is_team_member(work, user):
    if user.id == work.owner_id:
        return True  # 発案者は常にチームの一員として扱う
    return TeamMember.query.filter_by(work_id=work.id, user_id=user.id).first() is not None


def _require_team_member(work):
    """発案者 か チームメンバーでなければ 403 で止める(制作スペース用)"""
    if not _is_team_member(work, current_user):
        abort(403, description="この制作スペースには、チームメンバーのみアクセスできます。")


# ---------------------------------------------------------------------------
# 作品(閲覧は誰でもできる。トップページ・作品詳細ページに相当)
# ---------------------------------------------------------------------------

@works_bp.get("/works")
def list_works():
    works = Work.query.order_by(Work.created_at.desc()).all()
    return jsonify([w.to_dict() for w in works])


@works_bp.get("/works/<int:work_id>")
def get_work(work_id):
    work = _get_work_or_404(work_id)
    return jsonify(work.to_dict())


@works_bp.post("/works")
@login_required
def create_work():
    """作品／アイデアの投稿。ログインしていれば誰でもできる"""
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    idea = (data.get("idea") or "").strip()

    if not title or not idea:
        return jsonify({"error": "タイトルと短いアイデアは必須です。"}), 400

    work = Work(
        owner_id=current_user.id,  # ← ログイン中の本人を発案者にする(なりすまし防止。フォーム値は使わない)
        title=title,
        theme=(data.get("theme") or "").strip() or None,
        idea=idea,
        synopsis=(data.get("synopsis") or "").strip() or None,
        worldview=(data.get("worldview") or "").strip() or None,
        original_text=(data.get("original_text") or "").strip() or None,
        status="idea",
    )
    db.session.add(work)
    db.session.commit()
    return jsonify(work.to_dict()), 201


# ---------------------------------------------------------------------------
# 募集したい役割(work_roles) ― 追加・一覧・締切は発案者のみ操作できる
# ---------------------------------------------------------------------------

@works_bp.post("/works/<int:work_id>/roles")
@login_required
def create_role(work_id):
    work = _get_work_or_404(work_id)
    _require_owner(work)  # ← 発案者以外は役割を追加できない

    data = request.get_json(silent=True) or {}
    role_name = (data.get("role_name") or "").strip()
    if not role_name:
        return jsonify({"error": "役割名は必須です。"}), 400

    role = WorkRole(
        work_id=work.id,
        role_name=role_name,
        description=(data.get("description") or "").strip() or None,
        is_open=True,
    )
    db.session.add(role)

    # 役割の募集を始めた = 「アイデア段階」から「募集中」に進める
    if work.status == "idea":
        work.status = "recruiting"

    db.session.commit()
    return jsonify(role.to_dict()), 201


@works_bp.patch("/works/<int:work_id>/roles/<int:role_id>")
@login_required
def update_role(work_id, role_id):
    """募集を締め切る(is_open を false にする)など。発案者のみ"""
    work = _get_work_or_404(work_id)
    _require_owner(work)

    role = WorkRole.query.filter_by(id=role_id, work_id=work.id).first()
    if role is None:
        abort(404, description="指定された役割が見つかりません。")

    data = request.get_json(silent=True) or {}
    if "is_open" in data:
        role.is_open = bool(data["is_open"])

    db.session.commit()
    return jsonify(role.to_dict())


# ---------------------------------------------------------------------------
# 応募する(ログインしていれば誰でもできる)
# ---------------------------------------------------------------------------

@works_bp.post("/works/<int:work_id>/applications")
@login_required
def apply_to_work(work_id):
    work = _get_work_or_404(work_id)

    if work.owner_id == current_user.id:
        return jsonify({"error": "自分が発案した作品には応募できません。"}), 400

    data = request.get_json(silent=True) or {}
    work_role_id = data.get("work_role_id")
    intent = (data.get("intent") or "").strip()

    if not work_role_id or not intent:
        return jsonify({"error": "応募する役割と、担当したい内容は必須です。"}), 400

    role = WorkRole.query.filter_by(id=work_role_id, work_id=work.id).first()
    if role is None:
        return jsonify({"error": "指定された役割が見つかりません。"}), 400
    if not role.is_open:
        return jsonify({"error": "この役割は現在募集していません。"}), 400

    # 同じ作品・同じ役割への重複応募を防ぐ(選考中のものが既にあれば弾く)
    existing = Application.query.filter_by(
        work_id=work.id, applicant_id=current_user.id, work_role_id=role.id
    ).filter(Application.status.in_(["pending", "candidate"])).first()
    if existing is not None:
        return jsonify({"error": "この役割にはすでに応募済みです。"}), 409

    # 提出物としてファイルが添付されている場合、そのファイルが本当に
    # 「今ログインしている本人が」「事前に /uploads でアップロードしたもの」かを確認する。
    # (他人がアップロードしたファイルIDを勝手に指定できないようにするため)
    submission_file_id = data.get("file_id")
    if submission_file_id is not None:
        file_record = db.session.get(File, submission_file_id)
        if file_record is None or file_record.uploaded_by != current_user.id:
            return jsonify({"error": "指定されたファイルが見つからないか、あなたがアップロードしたものではありません。"}), 400

    application = Application(
        work_id=work.id,
        applicant_id=current_user.id,  # ← ここも必ずログイン中の本人。フォームの名前は信用しない
        work_role_id=role.id,
        intent=intent,
        comment=(data.get("comment") or "").strip() or None,
        submission_file_id=submission_file_id,
        status="pending",
    )
    db.session.add(application)
    db.session.commit()
    return jsonify(application.to_dict()), 201


# ---------------------------------------------------------------------------
# 選考画面(発案者のみ)
# ---------------------------------------------------------------------------

@works_bp.get("/works/<int:work_id>/applications")
@login_required
def list_applications(work_id):
    work = _get_work_or_404(work_id)
    _require_owner(work)  # ← ここが権限チェックの本体。発案者以外は403

    applications = Application.query.filter_by(work_id=work.id).order_by(Application.created_at.desc()).all()
    return jsonify([a.to_dict() for a in applications])


@works_bp.patch("/applications/<int:application_id>")
@login_required
def update_application_status(application_id):
    """採用・候補・見送りのステータス変更。発案者のみ操作できる"""
    application = db.session.get(Application, application_id)
    if application is None:
        abort(404, description="指定された応募が見つかりません。")

    _require_owner(application.work)  # ← 応募が紐づく作品の発案者かどうかをチェック

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    if new_status not in Application.STATUS_CHOICES:
        return jsonify({"error": "status は pending / candidate / accepted / declined のいずれかにしてください。"}), 400

    application.status = new_status

    # 採用(accepted)になったら、チームメンバーとして登録する = 「チーム成立」
    if new_status == "accepted":
        already_member = TeamMember.query.filter_by(
            work_id=application.work_id, user_id=application.applicant_id
        ).first()
        if already_member is None:
            db.session.add(
                TeamMember(
                    work_id=application.work_id,
                    user_id=application.applicant_id,
                    role_name=application.role.role_name,
                )
            )
        # 採用が決まった役割は、募集を締め切る
        application.role.is_open = False
        # チームが動き始めたので、作品のステータスも更新する
        if application.work.status == "recruiting":
            application.work.status = "in_progress"

    db.session.commit()
    return jsonify(application.to_dict())


# ---------------------------------------------------------------------------
# 制作スペース(発案者 と 採用されたメンバーのみ)
# ---------------------------------------------------------------------------

@works_bp.get("/works/<int:work_id>/team")
@login_required
def get_team(work_id):
    work = _get_work_or_404(work_id)
    _require_team_member(work)  # ← ここが権限チェックの本体。チーム外の人は403

    members = TeamMember.query.filter_by(work_id=work.id).all()
    member_list = [{"role_name": "発案／世界観", "user": work.owner.to_public_dict()}]
    member_list += [m.to_dict() for m in members]

    return jsonify({"work": work.to_dict(), "members": member_list})
