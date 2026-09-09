"""
EGG HATCH - お仕事依頼

本編・番外編とは別の追加機能。既存の User(会員登録・ログイン)をそのまま使い、
新しいID体系は作らない。ユーザーIDで依頼相手を1人、または複数人指定できる。

含まれるもの:
- POST /job-requests        依頼を作成する(ログイン必須)
- GET  /job-requests         自分が関わる依頼の一覧(送った/受け取った)を見る
- GET  /job-requests/<id>    依頼の詳細を見る(依頼者本人か、宛先の1人のみ)

今回作っていないもの(意図的にスコープ外):
- 通知(メール等)の送信
- 運営による依頼内容の確認・承認フロー
- 契約・金銭のやり取りにまつわる処理
- 依頼の承諾/辞退といったステータス管理
"""

from flask import Blueprint, request, jsonify, abort
from flask_login import login_required, current_user

from models import db, User, JobRequest, JobRequestRecipient

job_requests_bp = Blueprint("job_requests", __name__)


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

    # 重複を取り除きつつ、整数IDのみ受け付ける
    try:
        recipient_ids = sorted({int(uid) for uid in recipient_ids})
    except (TypeError, ValueError):
        return jsonify({"error": "ユーザーIDの指定が正しくありません。"}), 400

    if len(recipient_ids) > 20:
        return jsonify({"error": "一度に指定できる依頼相手は20人までです。"}), 400

    # 指定されたIDが、実在する登録ユーザーかどうかを1件ずつ確認する
    # (存在しないIDが1つでも混ざっていたら、依頼相手を間違えている可能性が高いので弾く)
    users = User.query.filter(User.id.in_(recipient_ids)).all()
    found_ids = {u.id for u in users}
    missing_ids = [uid for uid in recipient_ids if uid not in found_ids]
    if missing_ids:
        return jsonify({
            "error": f"指定されたユーザーIDの一部が見つかりません: {', '.join(str(i) for i in missing_ids)}"
        }), 400

    job_request = JobRequest(
        requester_id=current_user.id,
        title=title,
        message=message,
    )
    db.session.add(job_request)
    db.session.flush()  # job_request.id を確定させる

    for uid in recipient_ids:
        db.session.add(JobRequestRecipient(job_request_id=job_request.id, user_id=uid))

    db.session.commit()
    return jsonify(job_request.to_dict()), 201


def _require_involved(job_request):
    """依頼者本人か、宛先(受け手)の1人でなければ403にする。"""
    is_requester = job_request.requester_id == current_user.id
    is_recipient = any(r.user_id == current_user.id for r in job_request.recipients)
    if not (is_requester or is_recipient):
        abort(403, description="この依頼に関わっていないため、閲覧できません。")


@job_requests_bp.get("/job-requests")
@login_required
def list_my_job_requests():
    """自分が「依頼した」ものと「依頼された」ものの両方を、新しい順にまとめて返す。"""
    sent = JobRequest.query.filter_by(requester_id=current_user.id)
    received = (
        JobRequest.query.join(JobRequestRecipient)
        .filter(JobRequestRecipient.user_id == current_user.id)
    )
    combined = {jr.id: jr for jr in list(sent) + list(received)}
    ordered = sorted(combined.values(), key=lambda jr: jr.created_at, reverse=True)
    return jsonify([jr.to_dict() for jr in ordered])


@job_requests_bp.get("/job-requests/<int:job_request_id>")
@login_required
def get_job_request(job_request_id):
    job_request = db.session.get(JobRequest, job_request_id)
    if job_request is None:
        abort(404, description="指定された依頼が見つかりません。")
    _require_involved(job_request)
    return jsonify(job_request.to_dict())
