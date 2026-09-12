"""
EGG HATCH - ログイン機能(設計ドキュメントの「2」に対応)

このファイルだけで完結する、認証まわりのルート集です。

含まれるもの:
- POST /register  会員登録
- POST /login      ログイン
- POST /logout     ログアウト
- GET  /me         今ログインしている本人の情報を返す(ログインしていなければ401)

セキュリティで意識したポイント:
- ログイン失敗時のメッセージを「メールアドレスが存在しない場合」と
  「パスワードが違う場合」で変えない(どちらのメールアドレスが登録されて
  いるかを外部から推測されないようにするため)
- パスワードは8文字以上を必須にする(最低限のルール)
- レスポンスに password_hash を絶対に含めない(User.to_public_dict() のみ使う)
- ログインセッションは Flask-Login が発行する署名付きCookieで管理する
  (Cookie自体は HttpOnly・SameSite=Lax にしてある。詳しくは app.py 参照)
"""

from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user

from models import db, User

auth_bp = Blueprint("auth", __name__)

MIN_PASSWORD_LENGTH = 8

# --- ログイン試行回数の制限(総当たり攻撃対策) ---
# 【追加】メールアドレスごとに、短時間での失敗回数が多すぎる場合はログインを
# 一時的に受け付けないようにする。プロセス内メモリで数えるだけの簡易な実装
# (アプリを再起動すると記録は消える。複数プロセスでの運用時は共有されない)だが、
# 一般公開前の最低限の対策として追加している。
import time
from collections import defaultdict

_LOGIN_MAX_ATTEMPTS = 10
_LOGIN_WINDOW_SECONDS = 15 * 60  # 15分
_login_failures = defaultdict(list)


def _is_login_rate_limited(email: str) -> bool:
    now = time.time()
    attempts = _login_failures[email]
    attempts[:] = [t for t in attempts if now - t < _LOGIN_WINDOW_SECONDS]
    return len(attempts) >= _LOGIN_MAX_ATTEMPTS


def _record_login_failure(email: str) -> None:
    _login_failures[email].append(time.time())


def _clear_login_failures(email: str) -> None:
    _login_failures.pop(email, None)


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    display_name = (data.get("display_name") or "").strip()

    # --- 入力チェック ---
    if not email or "@" not in email:
        return jsonify({"error": "メールアドレスの形式が正しくありません。"}), 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({"error": f"パスワードは{MIN_PASSWORD_LENGTH}文字以上にしてください。"}), 400
    if not display_name:
        return jsonify({"error": "表示名を入力してください。"}), 400

    if User.query.filter_by(email=email).first() is not None:
        # ここで「このメールアドレスは登録済みです」と言い切ってよいかは
        # 実は議論があります（他人のメールアドレスが登録済みか調べられてしまうため）。
        # 今回は分かりやすさを優先してそのまま伝えていますが、
        # 本番ではメール認証フローに寄せる方が安全です。
        return jsonify({"error": "このメールアドレスはすでに登録されています。"}), 409

    user = User(email=email, display_name=display_name)
    user.set_password(password)  # ← ここでハッシュ化される。生のpasswordはこの後どこにも残らない
    db.session.add(user)
    db.session.commit()

    login_user(user)  # 登録後、そのままログイン状態にする
    return jsonify(user.to_public_dict()), 201


VALID_CLIENT_TYPES = ("publisher", "editor", "company", "freelance", "other")


@auth_bp.post("/register-client")
def register_client():
    """
    依頼者(出版社・編集者・企業など)専用の会員登録。

    既存の /register とは別のエンドポイントにして、既存の一般ユーザー登録には
    一切手を触れていない。作られるUser行自体は同じテーブル・同じ仕組みで、
    account_type="client" になる点だけが違う。
    """
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    display_name = (data.get("display_name") or "").strip()  # 担当者名
    company_name = (data.get("company_name") or "").strip() or None  # 任意(個人編集者などもいるため)
    client_type = (data.get("client_type") or "").strip()

    if not email or "@" not in email:
        return jsonify({"error": "メールアドレスの形式が正しくありません。"}), 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({"error": f"パスワードは{MIN_PASSWORD_LENGTH}文字以上にしてください。"}), 400
    if not display_name:
        return jsonify({"error": "担当者名を入力してください。"}), 400
    if client_type not in VALID_CLIENT_TYPES:
        return jsonify({"error": "依頼者種別を選択してください。"}), 400

    if User.query.filter_by(email=email).first() is not None:
        return jsonify({"error": "このメールアドレスはすでに登録されています。"}), 409

    user = User(
        email=email,
        display_name=display_name,
        account_type="client",
        company_name=company_name,
        client_type=client_type,
        is_approved=False,  # 【追加】登録しただけでは未承認。運営の承認が必要
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    login_user(user)
    data = user.to_public_dict()
    data["account_type"] = user.account_type
    data["is_approved"] = user.is_approved
    return jsonify(data), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email:
        return jsonify({"error": "メールアドレスまたはパスワードが正しくありません。"}), 401

    # 【追加】短時間に失敗が続いている場合は、パスワードの正誤を見る前に止める
    if _is_login_rate_limited(email):
        return jsonify({"error": "ログイン試行の回数が多すぎます。しばらく時間をおいて再度お試しください。"}), 429

    user = User.query.filter_by(email=email).first()

    # user が存在しない場合も、パスワードが違う場合も、必ず同じエラーメッセージにする
    if user is None or not user.check_password(password):
        _record_login_failure(email)
        return jsonify({"error": "メールアドレスまたはパスワードが正しくありません。"}), 401

    _clear_login_failures(email)
    login_user(user)
    return jsonify(user.to_public_dict()), 200


@auth_bp.post("/logout")
@login_required
def logout():
    logout_user()
    return jsonify({"message": "ログアウトしました。"}), 200


@auth_bp.get("/me")
@login_required
def me():
    # is_admin / account_type などは「本人が今ログインしているか」の確認にだけ
    # 使うものなので、ここ(自分自身の情報を返すエンドポイント)にだけ追加する。
    # 他人の情報を返す to_public_dict() には含めない。
    data = current_user.to_public_dict()
    data["is_admin"] = current_user.is_admin
    data["account_type"] = current_user.account_type
    data["company_name"] = current_user.company_name
    data["client_type"] = current_user.client_type
    data["is_approved"] = current_user.is_approved
    data["can_send_job_requests"] = current_user.can_send_job_requests
    return jsonify(data), 200


# ---------------------------------------------------------------------------
# 依頼者アカウントの承認(運営のみ)
#
# register-client で作られたアカウントは is_approved=False の状態で始まる。
# ここで運営が承認して初めて、お仕事依頼を送信できるようになる
# (実際の送信可否の判定は User.can_send_job_requests / job_requests.py 側)。
# 既存のリレー漫画管理画面(唯一の管理画面)から呼び出す想定の、最小限のAPI。
# ---------------------------------------------------------------------------

def _require_admin_user():
    if not current_user.is_authenticated or not (current_user.is_admin or current_user.account_type == "admin"):
        from flask import abort
        abort(403, description="この操作は運営のみ行えます。")


@auth_bp.get("/admin/clients")
@login_required
def list_clients_for_approval():
    _require_admin_user()
    status = request.args.get("status")  # "pending" だけに絞りたい場合に使う

    query = User.query.filter_by(account_type="client")
    if status == "pending":
        query = query.filter_by(is_approved=False)
    elif status == "approved":
        query = query.filter_by(is_approved=True)

    clients = query.order_by(User.created_at.desc()).all()
    return jsonify([
        {
            "id": u.id,
            "display_name": u.display_name,
            "email": u.email,
            "company_name": u.company_name,
            "client_type": u.client_type,
            "is_approved": u.is_approved,
            "created_at": u.created_at.isoformat(),
        }
        for u in clients
    ])


@auth_bp.patch("/admin/clients/<int:user_id>")
@login_required
def update_client_approval(user_id):
    _require_admin_user()

    target = db.session.get(User, user_id)
    if target is None or target.account_type != "client":
        return jsonify({"error": "指定された依頼者アカウントが見つかりません。"}), 404

    data = request.get_json(silent=True) or {}
    if "is_approved" not in data:
        return jsonify({"error": "is_approved を指定してください。"}), 400

    target.is_approved = bool(data["is_approved"])
    db.session.commit()
    return jsonify({
        "id": target.id,
        "display_name": target.display_name,
        "is_approved": target.is_approved,
    })
