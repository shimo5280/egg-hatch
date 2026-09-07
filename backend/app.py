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
from flask import Flask, jsonify
from flask_login import LoginManager
from models import db, User, Work
from auth import auth_bp
from works import works_bp
from files import files_bp
from profiles import profiles_bp
from pages import pages_bp
from relay import relay_bp


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
    # 開発中はこの場しのぎの値で構わないが、本番では環境変数などから読み込み、
    # 誰にも見えない場所で管理すること（コードに直接書かない）。
    app.config["SECRET_KEY"] = os.environ.get("EGG_HATCH_SECRET_KEY", "dev-only-change-me")
    app.config["SESSION_COOKIE_HTTPONLY"] = True   # JavaScriptからCookieを読めないようにする
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"  # 他サイトからの勝手なリクエストで使われにくくする
    # 本番でHTTPS運用する場合は下記も True にする（開発中はHTTPなのでコメントアウト）
    # app.config["SESSION_COOKIE_SECURE"] = True

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

    app.register_blueprint(auth_bp)
    app.register_blueprint(works_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(profiles_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(relay_bp)

    # abort(403, description=...) / abort(404, description=...) を、
    # HTMLのエラーページではなくJSONで返すようにする(このアプリはAPIのため)
    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": e.description or "権限がありません。"}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": e.description or "見つかりません。"}), 404

    @app.get("/db-check")
    def db_check():
        """
        開発中の動作確認用ルート。
        works テーブルの中身と、それぞれの応募件数を返すだけです。
        （本番でこのまま公開しないよう注意）
        """
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
    app.run(debug=True)
