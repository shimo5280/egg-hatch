"""
EGG HATCH - HTML画面を配信するルート

これまでの works.py / files.py / profiles.py / auth.py は、すべてJSONを
返す「API」でした。このファイルは、これまで作ったプロトタイプの画面
(templates/ 以下のHTMLファイル)を、そのままFlaskで配信するためのものです。

画面自体の中身(データの表示・フォームの送信)は、各HTMLファイルが読み込む
JavaScript(static/js/*.js)側で、このあと作る fetch() 経由のAPI呼び出しに
差し替えていきます。ここでは「どのURLでどのHTMLを返すか」だけを決めています。

URLの形は、プロトタイプの頃から使っていた「?id=1」のようなクエリパラメータの
形をそのまま踏襲しています(JavaScript側の書き換えを最小限にするため)。
"""

from flask import Blueprint, render_template, current_app

pages_bp = Blueprint("pages", __name__)


@pages_bp.get("/")
@pages_bp.get("/egg-hatch.html")
def top_page():
    return render_template("egg-hatch.html")


@pages_bp.get("/egg-hatch-work.html")
def work_detail_page():
    return render_template("egg-hatch-work.html")


@pages_bp.get("/egg-hatch-apply.html")
def apply_page():
    return render_template("egg-hatch-apply.html")


@pages_bp.get("/egg-hatch-review.html")
def review_page():
    return render_template("egg-hatch-review.html")


@pages_bp.get("/egg-hatch-team.html")
def team_page():
    return render_template("egg-hatch-team.html")


@pages_bp.get("/egg-hatch-profile.html")
def profile_page():
    return render_template("egg-hatch-profile.html")


@pages_bp.get("/egg-hatch-submit.html")
def submit_page():
    return render_template("egg-hatch-submit.html")


@pages_bp.get("/egg-hatch-login.html")
def login_page():
    return render_template("egg-hatch-login.html", show_sample_hints=current_app.config["SHOW_SAMPLE_HINTS"])


# ---------------------------------------------------------------------------
# 番外編(リレー漫画) ― 本編とは別枠の画面
# ---------------------------------------------------------------------------

@pages_bp.get("/egg-hatch-relay.html")
def relay_top_page():
    return render_template("egg-hatch-relay.html")


@pages_bp.get("/egg-hatch-relay-detail.html")
def relay_detail_page():
    return render_template("egg-hatch-relay-detail.html")


@pages_bp.get("/egg-hatch-relay-submit.html")
def relay_submit_page():
    return render_template("egg-hatch-relay-submit.html")


@pages_bp.get("/egg-hatch-relay-review.html")
def relay_review_page():
    return render_template("egg-hatch-relay-review.html")


@pages_bp.get("/egg-hatch-relay-admin.html")
def relay_admin_page():
    return render_template("egg-hatch-relay-admin.html")


# ---------------------------------------------------------------------------
# お仕事依頼
# ---------------------------------------------------------------------------

@pages_bp.get("/egg-hatch-request.html")
def job_request_new_page():
    return render_template("egg-hatch-request.html")


@pages_bp.get("/egg-hatch-requests.html")
def job_request_list_page():
    return render_template("egg-hatch-requests.html")


@pages_bp.get("/egg-hatch-request-detail.html")
def job_request_detail_page():
    return render_template("egg-hatch-request-detail.html")


# ---------------------------------------------------------------------------
# 依頼者専用入口
# ---------------------------------------------------------------------------

@pages_bp.get("/egg-hatch-client.html")
def client_entry_page():
    return render_template("egg-hatch-client.html")


@pages_bp.get("/egg-hatch-client-login.html")
def client_login_page():
    return render_template("egg-hatch-client-login.html", show_sample_hints=current_app.config["SHOW_SAMPLE_HINTS"])
