"""
EGG HATCH - データベース初期化スクリプト

実行するとその場に egg_hatch.db（SQLiteファイル）が作られ、
users / creator_profiles / creator_tags / works / work_roles /
applications / team_members / files のテーブルが用意されます。

さらに、これまでのフロントエンド・プロトタイプ（egg-hatch-work.js /
egg-hatch-review.js / egg-hatch-profile.js）に出てきたサンプルと
同じ内容を最初から入れておきます。

使い方:
    python3 init_db.py
"""

from app import create_app
from models import (
    db, User, CreatorProfile, CreatorTag, Work, WorkRole, Application, TeamMember,
    File, RelayManga, RelayPart, RelayRecruitment, RelaySubmission, RelaySeason,
    JobRequest, JobRequestRecipient,
)


def seed(app):
    with app.app_context():
        db.drop_all()   # 何度実行してもまっさらな状態から作り直せるようにする（開発用）
        db.create_all()

        # --- ユーザー（パスワードは全員 "password123" だが、必ずハッシュ化して保存する） ---
        tachibana = User(email="tachibana@example.com", display_name="橘 悠", is_admin=True, account_type="admin")
        tachibana.set_password("password123")

        fukami = User(email="fukami@example.com", display_name="深海 律")
        fukami.set_password("password123")

        kamiya = User(email="kamiya@example.com", display_name="紙谷 まひろ")
        kamiya.set_password("password123")

        kitano = User(email="kitano@example.com", display_name="北野 燐")
        kitano.set_password("password123")

        yonaga = User(email="yonaga@example.com", display_name="夜長 ソラ")
        yonaga.set_password("password123")

        # --- 依頼者(client)アカウントのサンプル ---
        client_editor = User(
            email="client@example.com",
            display_name="今井 有紀",  # 担当者名
            account_type="client",
            company_name="株式会社アオバ出版",
            client_type="editor",
        )
        client_editor.set_password("password123")

        db.session.add_all([tachibana, fukami, kamiya, kitano, yonaga, client_editor])
        db.session.flush()  # ここで各ユーザーに id が振られる

        # --- クリエイタープロフィール（egg-hatch-profile.js の SAMPLE_PROFILES 相当） ---
        profiles = [
            CreatorProfile(
                user_id=fukami.id,
                handle="@fukami_ritsu",
                worldview="沈んだ町にも、そこで暮らす人の分だけ物語がある。",
            ),
            CreatorProfile(
                user_id=kamiya.id,
                handle="@kamiya_mahiro",
                worldview="コマとコマの間の、言葉にならない一瞬を描きたい。",
            ),
            CreatorProfile(
                user_id=kitano.id,
                handle="@kitano_rin",
                worldview="小さな生き物と大きな孤独を、同じ画面に置くのが好き。",
            ),
            CreatorProfile(
                user_id=yonaga.id,
                handle="@yonaga_sora",
                worldview="背景こそ、その世界の性格だと思っている。",
            ),
        ]
        db.session.add_all(profiles)

        tags = [
            CreatorTag(user_id=fukami.id, tag_type="specialty", label="物語／原作"),
            CreatorTag(user_id=fukami.id, tag_type="role_wanted", label="プロット"),
            CreatorTag(user_id=fukami.id, tag_type="genre", label="ヒューマンドラマ"),

            CreatorTag(user_id=kamiya.id, tag_type="specialty", label="ネーム"),
            CreatorTag(user_id=kamiya.id, tag_type="role_wanted", label="ネーム"),
            CreatorTag(user_id=kamiya.id, tag_type="genre", label="青春"),

            CreatorTag(user_id=kitano.id, tag_type="specialty", label="キャラクターデザイン"),
            CreatorTag(user_id=kitano.id, tag_type="role_wanted", label="作画"),
            CreatorTag(user_id=kitano.id, tag_type="genre", label="SF"),

            CreatorTag(user_id=yonaga.id, tag_type="specialty", label="背景"),
            CreatorTag(user_id=yonaga.id, tag_type="role_wanted", label="仕上げ"),
            CreatorTag(user_id=yonaga.id, tag_type="genre", label="ファンタジー"),
        ]
        db.session.add_all(tags)

        # --- 作品（プロトタイプの w101 / w201 / w301 に相当） ---
        work_idea = Work(
            owner_id=tachibana.id,
            title="夜行バスの終点",
            theme="一夜だけの匿名性",
            idea="終電を逃した見知らぬ5人が、始発を待つ間に語り出す小さな秘密の物語。",
            status="idea",
        )

        work_recruiting = Work(
            owner_id=tachibana.id,
            title="境界線のアリス",
            theme="現実と夢の境界に迷い込んだ姉妹の物語",
            idea="夢と現実の境界線上にある「あわい町」。姉が悪夢に迷い込んだ妹を連れ戻す旅の物語。",
            worldview=(
                "夢と現実の境界線上にある「あわい町」。姉妹はある晩、妹の見た悪夢の中に"
                "迷い込んでしまう。姉が妹を連れ戻すために、境界線をさまよう旅の物語。"
            ),
            status="recruiting",
        )

        work_in_progress = Work(
            owner_id=tachibana.id,
            title="灰色の惑星、青い庭",
            theme="地球を離れた最後の庭師の物語",
            idea="地球を捨てた人類が移住した灰色の惑星で、庭師が青い庭を再現しようとする物語。",
            worldview="地球を捨てた人類が移住した灰色の惑星。緑を知らない世代のために、たった一人残った「庭師」が青い庭を再現しようとする長編SF。",
            status="in_progress",
        )

        db.session.add_all([work_idea, work_recruiting, work_in_progress])
        db.session.flush()

        # --- 募集したい役割（work_roles） ---
        role_name_work = WorkRole(work_id=work_recruiting.id, role_name="ネーム", description="冒頭2話分の脚本をネームに")
        role_design_work = WorkRole(work_id=work_recruiting.id, role_name="キャラクターデザイン", description="姉妹・境界の番人のデザイン")
        role_story_progress = WorkRole(work_id=work_in_progress.id, role_name="物語／原作", description="プロット全体の構成", is_open=False)  # すでに採用済み
        db.session.add_all([role_name_work, role_design_work, role_story_progress])
        db.session.flush()

        # --- 応募（egg-hatch-review.js の SAMPLE_APPLICATIONS.w201 相当） ---
        applications = [
            Application(
                work_id=work_recruiting.id,
                applicant_id=kamiya.id,
                work_role_id=role_name_work.id,
                intent="姉妹の温度差が伝わるよう、視線の描写を中心にネームを組みたいです。",
                comment="初めての応募です。よろしくお願いします。",
                status="pending",
            ),
            Application(
                work_id=work_recruiting.id,
                applicant_id=kitano.id,
                work_role_id=role_design_work.id,
                intent="姉は直線的な衣装ライン、妹は曖昧に揺れる輪郭線でデザインしたいです。",
                comment="ラフのみですがご確認ください。",
                status="candidate",
            ),
            Application(
                work_id=work_recruiting.id,
                applicant_id=yonaga.id,
                work_role_id=role_design_work.id,
                intent="境界の番人のビジュアルを、背景と一体化した輪郭の薄いキャラクターとして提案したいです。",
                comment="",
                status="pending",
            ),
        ]
        db.session.add_all(applications)
        db.session.flush()

        # --- すでにチームが動いている作品には、採用済みの応募とチームメンバーを入れておく ---
        accepted_application = Application(
            work_id=work_in_progress.id,
            applicant_id=fukami.id,
            work_role_id=role_story_progress.id,
            intent="プロット全体の構成を担当しています。",
            comment="",
            status="accepted",
        )
        db.session.add(accepted_application)
        db.session.add(
            TeamMember(work_id=work_in_progress.id, user_id=fukami.id, role_name="物語／原作")
        )

        db.session.commit()

        # ==================================================================
        # 番外編(リレー漫画) ― 本編とは別枠のサンプルデータ
        # ==================================================================
        import os
        import base64

        # 1x1の透明PNG(デモ用のダミー画像)。実際のファイル保存の仕組みを
        # そのまま使うため、本物のファイルとしてディスクにも書き出す。
        _TINY_PNG = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
            "+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )

        def _seed_relay_file(uploader, display_name):
            upload_dir = app.config["UPLOAD_FOLDER"]
            os.makedirs(upload_dir, exist_ok=True)
            import secrets
            stored_filename = secrets.token_hex(16) + ".png"
            with open(os.path.join(upload_dir, stored_filename), "wb") as f:
                f.write(_TINY_PNG)
            record = File(
                uploaded_by=uploader.id,
                original_filename=display_name,
                stored_filename=stored_filename,
                mime_type="image/png",
                size_bytes=len(_TINY_PNG),
            )
            db.session.add(record)
            db.session.flush()
            return record

        part1_file = _seed_relay_file(tachibana, "夜明けの町_part1.png")

        from datetime import datetime
        current_season = RelaySeason(
            season_key="autumn",
            year=2026,
            theme="「変わっていく季節に、置いていかれるもの」",
            description=(
                "秋は、何かが静かに終わっていく季節。このテーマから、参加者みんなで"
                "1本の短編漫画をリレー形式でつないで完成させます。"
            ),
            starts_at=datetime(2026, 9, 1),
            ends_at=datetime(2026, 11, 30),
            status="current",
        )
        db.session.add(current_season)
        db.session.flush()

        relay_manga = RelayManga(
            season_id=current_season.id,
            title="夜明けの町",
            description=(
                "ある朝、時計台の針が止まった小さな町から始まる連作リレー漫画。"
                "誰が続きを描いてもいい、その先の物語はまだ誰も知りません。"
            ),
            status="open",
            stage_label="作画募集中",
            current_part_number=1,
        )
        db.session.add(relay_manga)
        db.session.flush()

        part1 = RelayPart(
            relay_manga_id=relay_manga.id,
            part_number=1,
            author_id=tachibana.id,
            file_id=part1_file.id,
        )
        db.session.add(part1)

        recruitment2 = RelayRecruitment(
            relay_manga_id=relay_manga.id,
            part_number=2,
            max_pages=5,
            is_open=True,
        )
        db.session.add(recruitment2)
        db.session.flush()

        # サンプルの応募を1件入れておく(選考画面をすぐ試せるように)
        submission_file = _seed_relay_file(kamiya, "夜明けの町_part2_案.png")
        sample_submission = RelaySubmission(
            relay_manga_id=relay_manga.id,
            target_part_number=2,
            applicant_id=kamiya.id,
            file_id=submission_file.id,
            comment="時計台の針が止まった理由を、次のページで少しだけ見せる展開にしてみました。",
            status="pending",
        )
        db.session.add(sample_submission)

        db.session.commit()

        print("✅ データベースを作成し、サンプルデータを入れました。")
        print(f"   users:            {User.query.count()} 件")
        print(f"   creator_profiles: {CreatorProfile.query.count()} 件")
        print(f"   works:            {Work.query.count()} 件")
        print(f"   work_roles:       {WorkRole.query.count()} 件")
        print(f"   applications:     {Application.query.count()} 件")
        print(f"   relay_seasons:    {RelaySeason.query.count()} 件")
        print(f"   relay_mangas:     {RelayManga.query.count()} 件")
        print(f"   relay_parts:      {RelayPart.query.count()} 件")
        print(f"   relay_submissions:{RelaySubmission.query.count()} 件")

        # --- お仕事依頼のサンプル(依頼者→複数クリエイターへの制作依頼) ---
        sample_job_request = JobRequest(
            requester_id=client_editor.id,
            title="読み切り短編の制作をお願いしたいです",
            message="キャラクターデザインと作画を、お二人のチームで担当していただけないでしょうか。詳細はご連絡の上お伝えします。",
        )
        db.session.add(sample_job_request)
        db.session.flush()
        db.session.add_all([
            JobRequestRecipient(job_request_id=sample_job_request.id, user_id=kitano.id),
            JobRequestRecipient(job_request_id=sample_job_request.id, user_id=kamiya.id),
        ])
        db.session.commit()
        print(f"   job_requests:     {JobRequest.query.count()} 件")


if __name__ == "__main__":
    app = create_app()
    seed(app)
