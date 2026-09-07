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


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()

    # user が存在しない場合も、パスワードが違う場合も、必ず同じエラーメッセージにする
    if user is None or not user.check_password(password):
        return jsonify({"error": "メールアドレスまたはパスワードが正しくありません。"}), 401

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
    # is_admin は「本人が今ログインしているか」の確認にだけ使うものなので、
    # ここ(自分自身の情報を返すエンドポイント)にだけ追加する。
    # 他人の情報を返す to_public_dict() には含めない(応募者・チームメンバー
    # などの一覧に運営フラグが混ざらないようにするため)。
    data = current_user.to_public_dict()
    data["is_admin"] = current_user.is_admin
    return jsonify(data), 200
