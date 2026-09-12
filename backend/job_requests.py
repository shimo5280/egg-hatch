"""
EGG HATCH - お仕事依頼(運営仲介フロー)

本編・番外編とは別の追加機能。既存の User(会員登録・ログイン)をそのまま使い、
新しいID体系は作らない。ユーザーIDで依頼相手を1人、または複数人指定できる
(この部分の仕様・エンドポイント契約は既存のまま変更していない)。

【今回追加した「運営を必ず間に挟む」フロー】
依頼者 → 運営 → クリエイター(メンバー) → 運営 → 依頼者、という流れにする。
依頼者からメンバーへ直接通知が届くことはない。

状態遷移:
    pending_review ──(運営が却下)──────────────→ rejected
    pending_review ──(運営がメンバーへ通知)─────→ awaiting_responses
    awaiting_responses ──(誰か1人が回答)────────→ reviewing_responses
    awaiting_responses / reviewing_responses
        ──(運営が結果報告: 成立)────────────────→ finalized_success
        ──(運営が結果報告: 不成立)──────────────→ finalized_failure

含まれるもの:
- POST   /job-requests                       依頼を作成する(既存のまま。ログイン必須)
- GET    /job-requests                        自分が関わる依頼の一覧(送った/受け取った)を見る
- GET    /job-requests/<id>                   依頼の詳細を見る
- POST   /job-requests/<id>/respond           メンバーが承諾/辞退を回答する(新規)
- GET    /notifications                       自分宛ての内部通知一覧(新規)
- GET    /admin/job-requests                  運営向け・依頼の一覧(新規)
- GET    /admin/job-requests/<id>             運営向け・依頼の詳細(新規)
- POST   /admin/job-requests/<id>/notify      運営操作:メンバーへ通知する(新規)
- POST   /admin/job-requests/<id>/reject      運営操作:依頼を却下する(新規)
- POST   /admin/job-requests/<id>/finalize    運営操作:依頼者へ結果報告する(新規)

意図的にスコープ外のまま:
- 外部メール・LINE等への通知送信(Notificationモデルは、あとから拡張しやすい構造にしてある)
- 契約・金銭のやり取りにまつわる処理
"""

from flask import Blueprint, request, jsonify, abort
from flask_login import login_required, current_user

from models import db, User, JobRequest, JobRequestRecipient, Notification, _now

job_requests_bp = Blueprint("job_requests", __name__)


# ---------------------------------------------------------------------------
# 権限チェック・通知作成のヘルパー
# ---------------------------------------------------------------------------

def _require_admin():
    if not current_user.is_authenticated or not (current_user.is_admin or current_user.account_type == "admin"):
        abort(403, description="この操作は運営のみ行えます。")


def _notify(user_id, kind, message, job_request_id=None):
    db.session.add(Notification(
        user_id=user_id, kind=kind, message=message, related_job_request_id=job_request_id,
    ))


def _notify_all_admins(kind, message, job_request_id=None):
    admin_ids = [u.id for u in User.query.filter(
        db.or_(User.is_admin.is_(True), User.account_type == "admin")
    ).all()]
    for admin_id in admin_ids:
        _notify(admin_id, kind, message, job_request_id)


# ---------------------------------------------------------------------------
# 依頼の作成(既存のまま。仕様・エンドポイントは変更していない)
# ---------------------------------------------------------------------------

@job_requests_bp.post("/job-requests")
@login_required
def create_job_request():
    # お仕事依頼を「送信」できるのは client(出版社・編集者・企業など) か admin のみ。
    # 一般ユーザーがURLを直接叩いても、ここで403になる(フロント側の表示制御だけに頼らない)。
    if not current_user.can_send_job_requests:
        abort(403, description="お仕事依頼の送信は、依頼者アカウント(client)のみ利用できます。")

    data = request.get_json(silent=True) or {}

    title = (data.get("title") or "").strip()
    message = (data.get("message") or "").strip()
    recipient_ids = data.get("recipient_user_ids")

    if not title:
        return jsonify({"error": "依頼のタイトルは必須です。"}), 400
    if not isinstance(recipient_ids, list) or not recipient_ids:
        return jsonify({"error": "依頼相手を、ユーザーIDで1人以上指定してください。"}), 400

    try:
        recipient_ids = sorted({int(uid) for uid in recipient_ids})
    except (TypeError, ValueError):
        return jsonify({"error": "ユーザーIDの指定が正しくありません。"}), 400

    if len(recipient_ids) > 20:
        return jsonify({"error": "一度に指定できる依頼相手は20人までです。"}), 400

    users = User.query.filter(User.id.in_(recipient_ids)).all()
    found_ids = {u.id for u in users}
    missing_ids = [uid for uid in recipient_ids if uid not in found_ids]
    if missing_ids:
        return jsonify({
            "error": f"指定されたユーザーIDの一部が見つかりません: {', '.join(str(i) for i in missing_ids)}"
        }), 400

    # 【変更点】ここでメンバーへ直接届くのではなく、まず運営確認待ちの状態で作成する
    job_request = JobRequest(
        requester_id=current_user.id,
        title=title,
        message=message,
        status=JobRequest.STATUS_PENDING_REVIEW,
    )
    db.session.add(job_request)
    db.session.flush()  # job_request.id を確定させる

    for uid in recipient_ids:
        db.session.add(JobRequestRecipient(job_request_id=job_request.id, user_id=uid))

    # 運営(全員)へ「新規依頼が来たこと」を通知する
    _notify_all_admins(
        "job_request_new",
        f"「{title}」という新しいお仕事依頼が届きました。内容を確認してください。",
        job_request.id,
    )

    db.session.commit()
    return jsonify(job_request.to_dict(viewer_role="requester")), 201


# ---------------------------------------------------------------------------
# 閲覧(依頼者 / メンバー)
# ---------------------------------------------------------------------------

def _require_involved(job_request):
    """依頼者本人か、宛先(受け手)の1人でなければ403にする。
    メンバーについては、運営から通知される前の依頼はそもそも「関わっていない」扱いにする
    (URL直接入力で、まだ通知されていない依頼を覗けないようにするため)。"""
    is_requester = job_request.requester_id == current_user.id
    is_recipient = any(r.user_id == current_user.id for r in job_request.recipients)

    if is_requester:
        return "requester"
    if is_recipient and job_request.status in JobRequest.STATUSES_VISIBLE_TO_RECIPIENTS:
        return "recipient"
    abort(403, description="この依頼に関わっていないか、まだ通知されていないため閲覧できません。")


@job_requests_bp.get("/job-requests")
@login_required
def list_my_job_requests():
    """自分が「依頼した」ものと「依頼された」ものの両方を、新しい順にまとめて返す。
    メンバーとして関わっているものは、運営からまだ通知されていない依頼を除く。"""
    sent = JobRequest.query.filter_by(requester_id=current_user.id).all()
    received = (
        JobRequest.query.join(JobRequestRecipient)
        .filter(
            JobRequestRecipient.user_id == current_user.id,
            JobRequest.status.in_(JobRequest.STATUSES_VISIBLE_TO_RECIPIENTS),
        )
        .all()
    )

    combined = {jr.id: jr for jr in sent + received}
    ordered = sorted(combined.values(), key=lambda jr: jr.created_at, reverse=True)

    result = []
    for jr in ordered:
        if jr.requester_id == current_user.id:
            result.append(jr.to_dict(viewer_role="requester"))
        else:
            result.append(jr.to_dict(viewer_role="recipient", viewer_user_id=current_user.id))
    return jsonify(result)


@job_requests_bp.get("/job-requests/<int:job_request_id>")
@login_required
def get_job_request(job_request_id):
    job_request = db.session.get(JobRequest, job_request_id)
    if job_request is None:
        abort(404, description="指定された依頼が見つかりません。")
    role = _require_involved(job_request)
    return jsonify(job_request.to_dict(viewer_role=role, viewer_user_id=current_user.id))


# ---------------------------------------------------------------------------
# メンバーが承諾/辞退を回答する
# ---------------------------------------------------------------------------

@job_requests_bp.post("/job-requests/<int:job_request_id>/respond")
@login_required
def respond_to_job_request(job_request_id):
    job_request = db.session.get(JobRequest, job_request_id)
    if job_request is None:
        abort(404, description="指定された依頼が見つかりません。")

    recipient = JobRequestRecipient.query.filter_by(
        job_request_id=job_request.id, user_id=current_user.id
    ).first()
    if recipient is None:
        abort(403, description="この依頼の宛先ではないため、回答できません。")

    if job_request.status not in JobRequest.STATUSES_ACCEPTING_RESPONSES:
        return jsonify({"error": "現在、この依頼は回答を受け付けていません。"}), 400

    if recipient.response_status != JobRequestRecipient.RESPONSE_PENDING:
        return jsonify({"error": "この依頼にはすでに回答済みです。"}), 400

    data = request.get_json(silent=True) or {}
    response = data.get("response")
    if response not in (JobRequestRecipient.RESPONSE_ACCEPTED, JobRequestRecipient.RESPONSE_DECLINED):
        return jsonify({"error": "response は accepted / declined のいずれかにしてください。"}), 400

    recipient.response_status = response
    recipient.responded_at = _now()

    # 最初の回答が届いたタイミングで、運営が確認しやすいよう状態を進める
    if job_request.status == JobRequest.STATUS_AWAITING_RESPONSES:
        job_request.status = JobRequest.STATUS_REVIEWING_RESPONSES

    response_label = "承諾" if response == JobRequestRecipient.RESPONSE_ACCEPTED else "辞退"
    _notify_all_admins(
        "job_request_response",
        f"「{job_request.title}」に、{current_user.display_name}さんが{response_label}と回答しました。",
        job_request.id,
    )

    db.session.commit()
    return jsonify(job_request.to_dict(viewer_role="recipient", viewer_user_id=current_user.id))


# ---------------------------------------------------------------------------
# 内部通知
# ---------------------------------------------------------------------------

@job_requests_bp.get("/notifications")
@login_required
def list_my_notifications():
    notifications = (
        Notification.query.filter_by(user_id=current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify([n.to_dict() for n in notifications])


# ---------------------------------------------------------------------------
# 運営向け:仕事依頼管理
# ---------------------------------------------------------------------------

@job_requests_bp.get("/admin/job-requests")
@login_required
def admin_list_job_requests():
    _require_admin()
    status = request.args.get("status")
    query = JobRequest.query
    if status:
        query = query.filter_by(status=status)
    job_requests = query.order_by(JobRequest.created_at.desc()).all()
    return jsonify([jr.to_dict(viewer_role="admin") for jr in job_requests])


@job_requests_bp.get("/admin/job-requests/<int:job_request_id>")
@login_required
def admin_get_job_request(job_request_id):
    _require_admin()
    job_request = db.session.get(JobRequest, job_request_id)
    if job_request is None:
        abort(404, description="指定された依頼が見つかりません。")
    return jsonify(job_request.to_dict(viewer_role="admin"))


@job_requests_bp.post("/admin/job-requests/<int:job_request_id>/notify")
@login_required
def admin_notify_members(job_request_id):
    """運営操作:内容を確認したうえで、指定されたメンバーへ依頼を通知する。"""
    _require_admin()
    job_request = db.session.get(JobRequest, job_request_id)
    if job_request is None:
        abort(404, description="指定された依頼が見つかりません。")

    if job_request.status != JobRequest.STATUS_PENDING_REVIEW:
        return jsonify({"error": "運営確認待ちの依頼のみ、メンバーへ通知できます。"}), 400

    job_request.status = JobRequest.STATUS_AWAITING_RESPONSES
    job_request.notified_at = _now()

    for recipient in job_request.recipients:
        _notify(
            recipient.user_id,
            "job_request_notified",
            f"「{job_request.title}」というお仕事依頼が届きました。内容を確認し、承諾/辞退を回答してください。",
            job_request.id,
        )

    db.session.commit()
    return jsonify(job_request.to_dict(viewer_role="admin"))


@job_requests_bp.post("/admin/job-requests/<int:job_request_id>/reject")
@login_required
def admin_reject_job_request(job_request_id):
    """運営操作:内容を確認したうえで、依頼を却下する(メンバーには一切通知されない)。"""
    _require_admin()
    job_request = db.session.get(JobRequest, job_request_id)
    if job_request is None:
        abort(404, description="指定された依頼が見つかりません。")

    if job_request.status != JobRequest.STATUS_PENDING_REVIEW:
        return jsonify({"error": "運営確認待ちの依頼のみ、却下できます。"}), 400

    job_request.status = JobRequest.STATUS_REJECTED

    _notify(
        job_request.requester_id,
        "job_request_rejected",
        f"「{job_request.title}」の依頼は、運営の確認の結果、見送らせていただくことになりました。",
        job_request.id,
    )

    db.session.commit()
    return jsonify(job_request.to_dict(viewer_role="admin"))


@job_requests_bp.post("/admin/job-requests/<int:job_request_id>/finalize")
@login_required
def admin_finalize_job_request(job_request_id):
    """運営操作:メンバーの回答状況を踏まえ、最終的な結果(成立/不成立)を依頼者へ報告する。"""
    _require_admin()
    job_request = db.session.get(JobRequest, job_request_id)
    if job_request is None:
        abort(404, description="指定された依頼が見つかりません。")

    if job_request.status not in (JobRequest.STATUS_AWAITING_RESPONSES, JobRequest.STATUS_REVIEWING_RESPONSES):
        return jsonify({"error": "メンバーへ通知済みの依頼のみ、結果を報告できます。"}), 400

    data = request.get_json(silent=True) or {}
    result = data.get("result")
    if result not in ("success", "failure"):
        return jsonify({"error": "result は success / failure のいずれかにしてください。"}), 400

    job_request.status = JobRequest.STATUS_FINALIZED_SUCCESS if result == "success" else JobRequest.STATUS_FINALIZED_FAILURE
    job_request.finalized_at = _now()

    result_label = "成立" if result == "success" else "不成立"
    _notify(
        job_request.requester_id,
        "job_request_finalized",
        f"「{job_request.title}」の依頼結果が確定しました:{result_label}",
        job_request.id,
    )

    db.session.commit()
    return jsonify(job_request.to_dict(viewer_role="admin"))
