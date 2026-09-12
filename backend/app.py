"""
EGG HATCH - 最小構成の Flask アプリ

データベース(users / works / applications / TeamMember / File)、
ログイン機能(auth.py)、権限チェック付きの作品・選考・制作スペース関連の
ルート(works.py)、ファイルアップロード(files.py)をまとめています。

/db-check という確認用のルートだけ用意しています。これは開発中の
動作確認のためのものなので、本番では削除するか、管理者だけが見られる
ように制限してください。
"""

import os
import secrets
from flask import Flask, jsonify, session, request, abort
from flask_login import LoginManager, login_required, current_user
from models import db, User, Work
from auth import auth_bp
from works import works_bp
from files import files_bp
from profiles import profiles_bp
from pages import pages_bp
from relay import relay_bp
from job_requests import job_requests_bp


def create_app():
    basedir = os.path.abspath(os.path.dirname(__file__))
    # このプロジェクトは backend/ フォルダとは別の場所に templates/ と static/ を
    # 置く構成にしている(プロトタイプ時代のフォルダ構成をそのまま活かすため)。
    project_root = os.path.dirname(basedir)
    app = Flask(
        __name__,
        template_folder=os.path.join(project_root, "templates"),
        static_folder=os.path.join(project_root, "static"),
    )

    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(basedir, "egg_hatch.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # --- セッション(ログイン状態)を守るための設定 ---
    # SECRET_KEY はセッションCookieの署名に使われる、非常に重要な値。
    # 【重要】本番運用では必ず EGG_HATCH_SECRET_KEY 環境変数に、他人に推測できない
    # ランダムな値を設定すること。設定を忘れた場合、以前は固定文字列
    # "dev-only-change-me" にフォールバックしていたが、それだと万一そのまま
    # 公開してしまった際にログインセッションを偽造されてしまう。
    # そのため、環境変数が無い場合は毎回ランダムな値を生成するようにした
    # (この場合、アプリを再起動するたびに既存のログインは切れるが、
    #  固定の推測可能な鍵を使うよりはるかに安全なため)。
    _secret_key = os.environ.get("EGG_HATCH_SECRET_KEY")
    if not _secret_key:
        print(
            "[警告] EGG_HATCH_SECRET_KEY が設定されていません。"
            "一時的なランダム鍵で起動します(再起動するとログインは全員切れます)。"
            "本番公開前に、必ず環境変数 EGG_HATCH_SECRET_KEY を設定してください。"
        )
        _secret_key = secrets.token_hex(32)
    app.config["SECRET_KEY"] = _secret_key

    app.config["SESSION_COOKIE_HTTPONLY"] = True   # JavaScriptからCookieを読めないようにする
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"  # 他サイトからの勝手なリクエストで使われにくくする
    # 本番でHTTPS運用する場合、Cookieが平文のHTTP通信で漏れないようにする設定。
    # 【重要】公開環境(HTTPS)では、環境変数 EGG_HATCH_SECURE_COOKIES=1 を必ず設定すること。
    # ローカル開発(HTTPのみ)ではCookieが送られなくなってしまうため、既定値はFalseにしている。
    app.config["SESSION_COOKIE_SECURE"] = os.environ.get("EGG_HATCH_SECURE_COOKIES") == "1"

    # ログイン画面の「お試し用アカウント」のヒント表示を切り替えるフラグ。
    # サンプルデータを作っていない(=本番)ときに、存在しないアカウント情報を
    # 表示してしまわないよう、init_db.pyと同じ環境変数を参照する。
    app.config["SHOW_SAMPLE_HINTS"] = os.environ.get("EGG_HATCH_SEED_SAMPLE_DATA") == "1"

    # --- ファイルアップロード関連 ---
    # 保存先は static 配信の対象外のフォルダにする(直接URLで実行・閲覧できないように)
    app.config["UPLOAD_FOLDER"] = os.path.join(basedir, "uploads")
    # Flask自体にも上限を持たせておく(files.py側のチェックより前で弾く、二重の安全策)
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB

    db.init_app(app)

    # --- ログイン管理(Flask-Login) ---
    login_manager = LoginManager()
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        # デフォルトだとログインページへリダイレクトしようとするが、
        # このアプリはHTML画面を返すログインページを持たないAPIなので、
        # 代わりに401のJSONを返すようにする。
        return jsonify({"error": "ログインが必要です。"}), 401

    # -----------------------------------------------------------------
    # CSRF対策
    #
    # SameSite=Lax Cookie + JSON専用API(素のHTMLフォームでは再現できない)
    # という構成ですでに一定の防御にはなっているが、それだけに依存せず、
    # セッションに紐づく簡易なトークンを二重の対策として追加する。
    #
    # 仕組み:
    # 1. ページにアクセスした時点で、セッションにランダムなトークンを持たせる
    # 2. フロントは GET /csrf-token でそのトークンを取得し、
    #    以降のPOST/PUT/PATCH/DELETEには必ず X-CSRF-Token ヘッダーとして付与する
    #    (egg-hatch-auth.js の共通関数だけに実装。各画面のJSは変更不要)
    # 3. サーバー側は、状態を変更するリクエストのたびに
    #    「ヘッダーの値」と「セッションに保存された値」が一致するかを確認する
    #
    # 悪意のある別サイトは、このトークンの値を知りようがない
    # (別オリジンからはCookieの中身もレスポンスの中身も読めないため)。
    # -----------------------------------------------------------------

    CSRF_EXEMPT_PATHS = {"/csrf-token"}
    UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    @app.before_request
    def _ensure_csrf_token():
        if "csrf_token" not in session:
            session["csrf_token"] = secrets.token_hex(32)

    @app.before_request
    def _check_csrf_token():
        if request.method not in UNSAFE_METHODS:
            return
        if request.path in CSRF_EXEMPT_PATHS:
            return
        sent_token = request.headers.get("X-CSRF-Token")
        expected_token = session.get("csrf_token")
        if not sent_token or not expected_token or sent_token != expected_token:
            abort(403, description="CSRFトークンが正しくありません。ページを再読み込みしてから、もう一度お試しください。")

    @app.get("/csrf-token")
    def get_csrf_token():
        return jsonify({"csrf_token": session["csrf_token"]})

    app.register_blueprint(auth_bp)
    app.register_blueprint(works_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(profiles_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(relay_bp)
    app.register_blueprint(job_requests_bp)

    # abort(403, description=...) / abort(404, description=...) を、
    # HTMLのエラーページではなくJSONで返すようにする(このアプリはAPIのため)
    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": e.description or "権限がありません。"}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": e.description or "見つかりません。"}), 404

    @app.get("/db-check")
    @login_required
    def db_check():
        """
        開発中の動作確認用ルート。
        works テーブルの中身と、それぞれの応募件数を返すだけです。
        【修正】以前は誰でもアクセスできてしまっていたため、運営(is_admin)
        のみアクセスできるように制限した(挙動・レスポンス内容自体は変更していない)。
        """
        if not current_user.is_authenticated or not current_user.is_admin:
            return jsonify({"error": "この確認用ルートは運営のみ利用できます。"}), 403

        works = Work.query.all()
        result = []
        for w in works:
            result.append(
                {
                    "id": w.id,
                    "title": w.title,
                    "status": w.status,
                    "owner": w.owner.display_name,
                    "application_count": len(w.applications),
                }
            )
        return jsonify(result)

    return app


if __name__ == "__main__":
    app = create_app()
    # 【重要】Flaskのデバッグモードは、エラー発生時にソースコードや変数の中身を
    # 画面に表示してしまい、悪用されるとリモートでコードを実行されるおそれがある。
    # 本番では絶対に有効にしないこと。ローカル開発で使いたい場合のみ、
    # 環境変数 EGG_HATCH_DEBUG=1 を設定して起動すること。
    debug_mode = os.environ.get("EGG_HATCH_DEBUG") == "1"
    app.run(debug=debug_mode)
