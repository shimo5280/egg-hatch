"""
EGG HATCH - 最小構成のデータベースモデル

前回まとめた設計ドキュメント(egg-hatch-db-design.md)の項目のうち、
「1. まずは users・works・applications の3つだけ作ってみる」に対応するファイルです。

意図的に最小限にしてあります（creator_profiles・work_roles・files などは
まだ作っていません。困ったら少しずつ足していく前提です）。

セキュリティで押さえている点：
- パスワードは password_hash 列に「ハッシュ化した値」だけを保存する（平文は一切扱わない）
- to_dict() 系のメソッドは、外部に見せてよい項目だけを返す
  （password_hash など秘密の情報は絶対に含めない）
"""

from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin

db = SQLAlchemy()


def _now():
    return datetime.now(timezone.utc)


class User(UserMixin, db.Model):
    """会員（ログイン情報）"""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(80), nullable=False)
    # 番外編(リレー漫画)の選考など、運営側の操作を許可するフラグ。
    # 既存の本編機能には一切影響しない(本編は owner_id による権限チェックのみ使用)。
    is_admin = db.Column(db.Boolean, nullable=False, default=False)

    # --- お仕事依頼の「依頼者専用入口」のためのアカウント区分 ---
    # general : 通常のEGG HATCH参加者(既存ユーザーは全員これになる)
    # client  : 出版社・編集者・企業など、仕事を依頼する側
    # admin   : 運営
    # 既存のUserテーブル・ログインの仕組みはそのまま。区別のための列を追加しただけ。
    account_type = db.Column(db.String(20), nullable=False, default="general")
    # 以下2つは account_type == "client" のときだけ意味を持つ(他は基本 None)
    company_name = db.Column(db.String(200), nullable=True)  # 会社名・出版社名・編集部名など(任意)
    client_type = db.Column(db.String(20), nullable=True)  # publisher / editor / company / freelance / other
    # 依頼者(client)アカウントは、登録しただけではお仕事依頼を送れない。
    # 運営が承認(is_approved=True)して初めて送信できるようにする。
    # general / admin にとっては意味を持たない値(can_send_job_requestsの判定を参照)。
    is_approved = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    # このユーザーが発案した作品
    works = db.relationship("Work", back_populates="owner", foreign_keys="Work.owner_id")
    # このユーザーが送った応募
    applications = db.relationship("Application", back_populates="applicant")
    # プロフィール(1人につき1つ。無い場合もある)
    profile = db.relationship("CreatorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    # 得意分野／やりたい役割／ジャンルのタグ(複数持てる)
    tags = db.relationship("CreatorTag", back_populates="user", cascade="all, delete-orphan")

    # --- パスワードは必ずこの2つのメソッド経由で扱う（生パスワードを直接カラムに入れない） ---
    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    @property
    def can_send_job_requests(self) -> bool:
        """お仕事依頼を「送信」できるのは、admin か、運営に承認済みのclientのみ。
        (承認前のclientアカウントは、登録しただけでは送信できない)"""
        if self.is_admin or self.account_type == "admin":
            return True
        if self.account_type == "client":
            return self.is_approved
        return False

    def to_public_dict(self) -> dict:
        """他のユーザーにも見せてよい情報だけを返す（password_hash は絶対に含めない）"""
        return {
            "id": self.id,
            "display_name": self.display_name,
        }

    def __repr__(self):
        return f"<User id={self.id} email={self.email}>"


class CreatorProfile(db.Model):
    """クリエイタープロフィール(「私の世界観」など。1ユーザーにつき1件)"""

    __tablename__ = "creator_profiles"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    worldview = db.Column(db.Text)               # 「私の世界観」(プロフィールの中心要素)
    avatar_glyph_or_url = db.Column(db.String(255))
    handle = db.Column(db.String(50), unique=True)  # 表示用ID(例: @kamiya_mahiro)

    user = db.relationship("User", back_populates="profile")

    def to_dict(self) -> dict:
        return {
            "worldview": self.worldview,
            "avatar_glyph_or_url": self.avatar_glyph_or_url,
            "handle": self.handle,
        }

    def __repr__(self):
        return f"<CreatorProfile user_id={self.user_id} handle={self.handle!r}>"


class CreatorTag(db.Model):
    """得意分野／やりたい役割／ジャンルのタグ(1ユーザーにつき複数持てる)"""

    __tablename__ = "creator_tags"

    TAG_TYPES = ("specialty", "role_wanted", "genre")

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    tag_type = db.Column(db.String(20), nullable=False)  # specialty / role_wanted / genre
    label = db.Column(db.String(50), nullable=False)

    user = db.relationship("User", back_populates="tags")

    def to_dict(self) -> dict:
        return {"tag_type": self.tag_type, "label": self.label}

    def __repr__(self):
        return f"<CreatorTag user_id={self.user_id} tag_type={self.tag_type} label={self.label!r}>"


class Work(db.Model):
    """作品／アイデア"""

    __tablename__ = "works"

    STATUS_CHOICES = ("idea", "recruiting", "in_progress", "completed")

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    title = db.Column(db.String(120), nullable=False)
    theme = db.Column(db.String(255))
    idea = db.Column(db.Text, nullable=False)          # 短いアイデア（必須）
    synopsis = db.Column(db.Text)                       # あらすじ（任意）
    worldview = db.Column(db.Text)                       # 世界観（任意）
    original_text = db.Column(db.Text)                   # 原作本文・プロット（任意）

    status = db.Column(db.String(20), nullable=False, default="idea")

    created_at = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now, nullable=False)

    owner = db.relationship("User", back_populates="works", foreign_keys=[owner_id])
    applications = db.relationship("Application", back_populates="work", cascade="all, delete-orphan")
    team_members = db.relationship("TeamMember", back_populates="work", cascade="all, delete-orphan")
    roles = db.relationship("WorkRole", back_populates="work", cascade="all, delete-orphan")

    def to_dict(self, *, include_roles=True) -> dict:
        data = {
            "id": self.id,
            "owner_id": self.owner_id,
            "owner_name": self.owner.display_name,
            "title": self.title,
            "theme": self.theme,
            "idea": self.idea,
            "synopsis": self.synopsis,
            "worldview": self.worldview,
            "original_text": self.original_text,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            # 応募の中身は非公開だが、件数だけは公開情報として見せてよいと判断している
            "applications_count": len(self.applications),
        }
        if include_roles:
            data["roles"] = [r.to_dict() for r in self.roles]
        return data

    def __repr__(self):
        return f"<Work id={self.id} title={self.title!r} status={self.status}>"


class WorkRole(db.Model):
    """作品が募集している役割(1作品に複数持てる)"""

    __tablename__ = "work_roles"

    id = db.Column(db.Integer, primary_key=True)
    work_id = db.Column(db.Integer, db.ForeignKey("works.id"), nullable=False, index=True)

    role_name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text)
    is_open = db.Column(db.Boolean, nullable=False, default=True)  # 募集中かどうか

    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    work = db.relationship("Work", back_populates="roles")
    applications = db.relationship("Application", back_populates="role")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "work_id": self.work_id,
            "role_name": self.role_name,
            "description": self.description,
            "is_open": self.is_open,
            "applications_count": len(self.applications),
        }

    def __repr__(self):
        return f"<WorkRole id={self.id} work_id={self.work_id} role_name={self.role_name!r}>"


class TeamMember(db.Model):
    """採用が確定し、作品の制作チームに加わった人（制作スペースへの入室許可の判定に使う）"""

    __tablename__ = "team_members"
    __table_args__ = (db.UniqueConstraint("work_id", "user_id", name="uq_team_member_work_user"),)

    id = db.Column(db.Integer, primary_key=True)
    work_id = db.Column(db.Integer, db.ForeignKey("works.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    role_name = db.Column(db.String(80), nullable=False)
    joined_at = db.Column(db.DateTime, default=_now, nullable=False)

    work = db.relationship("Work", back_populates="team_members")
    user = db.relationship("User")

    def to_dict(self) -> dict:
        return {
            "work_id": self.work_id,
            "role_name": self.role_name,
            "user": self.user.to_public_dict(),
        }

    def __repr__(self):
        return f"<TeamMember work_id={self.work_id} user_id={self.user_id} role={self.role_name}>"


class File(db.Model):
    """アップロードされたファイル（応募の提出物などで使う）"""

    __tablename__ = "files"

    id = db.Column(db.Integer, primary_key=True)
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    original_filename = db.Column(db.String(255), nullable=False)  # 表示用。パスとしては使わない
    stored_filename = db.Column(db.String(64), unique=True, nullable=False)  # ランダムな実ファイル名
    mime_type = db.Column(db.String(100), nullable=False)  # サーバー側で中身を確認した結果
    size_bytes = db.Column(db.Integer, nullable=False)

    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    uploader = db.relationship("User")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "original_filename": self.original_filename,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            # stored_filename(実際の保存名)は外部に見せる必要が無いので含めない
        }

    def __repr__(self):
        return f"<File id={self.id} original_filename={self.original_filename!r}>"


class Application(db.Model):
    """役割への応募"""

    __tablename__ = "applications"

    STATUS_CHOICES = ("pending", "candidate", "accepted", "declined")

    id = db.Column(db.Integer, primary_key=True)
    work_id = db.Column(db.Integer, db.ForeignKey("works.id"), nullable=False, index=True)
    applicant_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    work_role_id = db.Column(db.Integer, db.ForeignKey("work_roles.id"), nullable=False, index=True)

    intent = db.Column(db.Text, nullable=False)   # 自分が担当したい内容
    comment = db.Column(db.Text)                   # コメント（任意）
    submission_file_id = db.Column(db.Integer, db.ForeignKey("files.id"), nullable=True)  # 提出ファイル（任意）

    status = db.Column(db.String(20), nullable=False, default="pending")

    created_at = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now, nullable=False)

    work = db.relationship("Work", back_populates="applications")
    applicant = db.relationship("User", back_populates="applications")
    submission_file = db.relationship("File")
    role = db.relationship("WorkRole", back_populates="applications")

    def to_dict(self, *, include_applicant=True) -> dict:
        data = {
            "id": self.id,
            "work_id": self.work_id,
            "work_role_id": self.work_role_id,
            "role_name": self.role.role_name,  # ← work_roles から取得する(文字列で二重に持たない)
            "intent": self.intent,
            "comment": self.comment,
            "status": self.status,
            "submission_file": self.submission_file.to_dict() if self.submission_file else None,
        }
        if include_applicant:
            # 応募者の「公開してよい情報」だけを埋め込む（メールアドレス等は含めない）
            data["applicant"] = self.applicant.to_public_dict()
        return data

    def __repr__(self):
        return f"<Application id={self.id} work_id={self.work_id} status={self.status}>"


# ==========================================================================
# 番外編（リレー漫画）
#
# 本編(Work/Application/TeamMember)とは別枠の機能として追加している。
# 本編の既存モデル・既存の権限ロジックには一切手を入れていない。
# ユーザー(User)・ファイル(File)は本編と共通のものをそのまま再利用する。
# ==========================================================================


class RelaySeason(db.Model):
    """
    番外編の「シーズン」(春/夏/秋/冬、約3か月ごと)。

    各シーズンに運営が1つのテーマを設定し、そのテーマをもとに参加者が
    短編漫画をリレー形式で作っていく(RelayManga)。1度に「current(開催中)」
    になれるのは基本的に1シーズンだけを想定しているが、データ構造上は
    複数あっても壊れないようにしている。
    """

    __tablename__ = "relay_seasons"

    SEASON_LABELS = {"spring": "春", "summer": "夏", "autumn": "秋", "winter": "冬"}

    id = db.Column(db.Integer, primary_key=True)
    season_key = db.Column(db.String(10), nullable=False)  # spring / summer / autumn / winter
    year = db.Column(db.Integer, nullable=False)
    theme = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    starts_at = db.Column(db.DateTime, nullable=False)
    ends_at = db.Column(db.DateTime, nullable=True)  # 未定の場合はNone
    status = db.Column(db.String(20), nullable=False, default="current")  # current / ended
    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    mangas = db.relationship("RelayManga", back_populates="season", order_by="RelayManga.id")

    @property
    def season_label(self):
        return self.SEASON_LABELS.get(self.season_key, self.season_key)

    @property
    def display_name(self):
        return f"{self.year}年 {self.season_label}の番外編"

    def to_dict(self, *, include_mangas=False) -> dict:
        data = {
            "id": self.id,
            "season_key": self.season_key,
            "season_label": self.season_label,
            "year": self.year,
            "display_name": self.display_name,
            "theme": self.theme,
            "description": self.description,
            "starts_at": self.starts_at.isoformat(),
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "status": self.status,
        }
        if include_mangas:
            data["mangas"] = [m.to_dict(include_parts=False) for m in self.mangas]
        return data

    def __repr__(self):
        return f"<RelaySeason id={self.id} {self.year}-{self.season_key} status={self.status}>"


class RelayManga(db.Model):
    """リレー漫画本体(1つの連作)。複数のリレー漫画を同時に走らせられる想定。"""

    __tablename__ = "relay_mangas"

    id = db.Column(db.Integer, primary_key=True)
    # どのシーズンのテーマから生まれた作品か。既存データとの互換のためnullable。
    season_id = db.Column(db.Integer, db.ForeignKey("relay_seasons.id"), nullable=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    # open        : 現在いずれかのパートで募集中、または募集準備中
    # closed      : 一時停止中(募集していない)
    # completed   : 運営が完結扱いにした
    status = db.Column(db.String(20), nullable=False, default="open")
    # 参加者が見て「今この作品に何が必要か」がすぐ分かるようにするための表示ラベル。
    # 工程を固定のパイプラインにしないため、あえて自由記述の文字列にしている。
    # 例:「アイデア段階」「ストーリー制作中」「作画募集中」「制作中」「完成」など。
    stage_label = db.Column(db.String(50), nullable=False, default="アイデア段階")
    current_part_number = db.Column(db.Integer, nullable=False, default=0)  # 採用済みの最新パート番号(0=まだスタート作品のみ無い状態)
    created_at = db.Column(db.DateTime, default=_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=_now, onupdate=_now, nullable=False)

    season = db.relationship("RelaySeason", back_populates="mangas")
    parts = db.relationship(
        "RelayPart", back_populates="relay_manga", order_by="RelayPart.part_number",
        cascade="all, delete-orphan",
    )
    submissions = db.relationship(
        "RelaySubmission", back_populates="relay_manga", cascade="all, delete-orphan",
    )
    recruitments = db.relationship(
        "RelayRecruitment", back_populates="relay_manga",
        order_by="RelayRecruitment.part_number", cascade="all, delete-orphan",
    )

    def open_recruitment(self):
        """現在募集中(開いていて締切前)の募集を1件返す。無ければ None。"""
        now = _now()
        for r in self.recruitments:
            if r.is_open and (r.closes_at is None or r.closes_at > now):
                return r
        return None

    def to_dict(self, *, include_parts=True) -> dict:
        data = {
            "id": self.id,
            "season_id": self.season_id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "stage_label": self.stage_label,
            "current_part_number": self.current_part_number,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        recruitment = self.open_recruitment()
        data["recruitment"] = recruitment.to_dict() if recruitment else None
        if include_parts:
            data["parts"] = [p.to_dict() for p in self.parts]
        return data

    def __repr__(self):
        return f"<RelayManga id={self.id} title={self.title!r} current_part={self.current_part_number}>"


class RelayPart(db.Model):
    """採用され、正式な一部として確定したパート(スタート作品も part_number=1 として保存する)。"""

    __tablename__ = "relay_parts"
    __table_args__ = (
        db.UniqueConstraint("relay_manga_id", "part_number", name="uq_relay_part_number"),
    )

    id = db.Column(db.Integer, primary_key=True)
    relay_manga_id = db.Column(db.Integer, db.ForeignKey("relay_mangas.id"), nullable=False)
    part_number = db.Column(db.Integer, nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    file_id = db.Column(db.Integer, db.ForeignKey("files.id"), nullable=False)
    accepted_at = db.Column(db.DateTime, default=_now, nullable=False)

    relay_manga = db.relationship("RelayManga", back_populates="parts")
    author = db.relationship("User")
    file = db.relationship("File")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "relay_manga_id": self.relay_manga_id,
            "part_number": self.part_number,
            "author": self.author.to_public_dict(),
            "file": self.file.to_dict(),
            "accepted_at": self.accepted_at.isoformat(),
        }

    def __repr__(self):
        return f"<RelayPart id={self.id} relay_manga_id={self.relay_manga_id} part_number={self.part_number}>"


class RelayRecruitment(db.Model):
    """あるパート番号の「続き募集」1回分(募集期間・開閉状態)。"""

    __tablename__ = "relay_recruitments"

    id = db.Column(db.Integer, primary_key=True)
    relay_manga_id = db.Column(db.Integer, db.ForeignKey("relay_mangas.id"), nullable=False)
    part_number = db.Column(db.Integer, nullable=False)  # この募集で決まる「次のパート」の番号
    # 1回の応募で投稿できるページ数の目安(固定値にしない。運営が募集ごとに設定できる)
    max_pages = db.Column(db.Integer, nullable=False, default=5)
    opens_at = db.Column(db.DateTime, default=_now, nullable=False)
    closes_at = db.Column(db.DateTime, nullable=True)  # 無期限の場合は None
    is_open = db.Column(db.Boolean, nullable=False, default=True)

    relay_manga = db.relationship("RelayManga", back_populates="recruitments")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "relay_manga_id": self.relay_manga_id,
            "part_number": self.part_number,
            "max_pages": self.max_pages,
            "opens_at": self.opens_at.isoformat(),
            "closes_at": self.closes_at.isoformat() if self.closes_at else None,
            "is_open": self.is_open,
        }

    def __repr__(self):
        return f"<RelayRecruitment id={self.id} part_number={self.part_number} is_open={self.is_open}>"


class RelaySubmission(db.Model):
    """「続き」への応募1件。"""

    __tablename__ = "relay_submissions"

    id = db.Column(db.Integer, primary_key=True)
    relay_manga_id = db.Column(db.Integer, db.ForeignKey("relay_mangas.id"), nullable=False)
    target_part_number = db.Column(db.Integer, nullable=False)
    applicant_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    file_id = db.Column(db.Integer, db.ForeignKey("files.id"), nullable=False)
    comment = db.Column(db.Text, nullable=False, default="")
    # pending / accepted / rejected
    status = db.Column(db.String(20), nullable=False, default="pending")
    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    relay_manga = db.relationship("RelayManga", back_populates="submissions")
    applicant = db.relationship("User")
    file = db.relationship("File")

    def to_dict(self, *, include_applicant=True) -> dict:
        data = {
            "id": self.id,
            "relay_manga_id": self.relay_manga_id,
            "target_part_number": self.target_part_number,
            "comment": self.comment,
            "status": self.status,
            "file": self.file.to_dict(),
            "created_at": self.created_at.isoformat(),
        }
        if include_applicant:
            data["applicant"] = self.applicant.to_public_dict()
        return data

    def __repr__(self):
        return f"<RelaySubmission id={self.id} relay_manga_id={self.relay_manga_id} status={self.status}>"


# ==========================================================================
# お仕事依頼
#
# 本編・番外編とは別の、追加機能。既存の User(会員登録・ログイン)の仕組みを
# そのまま使う ― 新しいID体系は作らない。「誰が・誰(複数可)に依頼したか」
# だけを記録するシンプルな構造にしていて、通知・運営確認・契約処理といった
# 運用フローはあえて作り込んでいない(現段階のスコープ外のため)。
# ==========================================================================


class JobRequest(db.Model):
    """
    お仕事依頼 本体。1件の依頼に対して、依頼相手(受け手)は1人以上何人でも紐づけられる。

    【運営仲介フロー】依頼者→クリエイターへ直接届くのではなく、必ず運営を経由する。
      pending_review      : 依頼者が作成した直後。運営がまだ確認していない
      rejected            : 運営が内容を確認し、却下した(メンバーには一切通知されない)
      awaiting_responses  : 運営がメンバーへ通知した。メンバーの回答待ち
      reviewing_responses : メンバーが1人以上回答した。運営が最終判断を検討中
      finalized_success   : 運営が「成立」として依頼者へ結果報告した
      finalized_failure   : 運営が「不成立」として依頼者へ結果報告した
    """

    __tablename__ = "job_requests"

    STATUS_PENDING_REVIEW = "pending_review"
    STATUS_REJECTED = "rejected"
    STATUS_AWAITING_RESPONSES = "awaiting_responses"
    STATUS_REVIEWING_RESPONSES = "reviewing_responses"
    STATUS_FINALIZED_SUCCESS = "finalized_success"
    STATUS_FINALIZED_FAILURE = "finalized_failure"

    STATUS_LABELS = {
        STATUS_PENDING_REVIEW: "運営確認待ち",
        STATUS_REJECTED: "却下",
        STATUS_AWAITING_RESPONSES: "メンバー回答待ち",
        STATUS_REVIEWING_RESPONSES: "回答確認中",
        STATUS_FINALIZED_SUCCESS: "成立",
        STATUS_FINALIZED_FAILURE: "不成立",
    }
    # メンバー(受け手)に依頼の存在が見えるようになるのは、通知された後だけ
    STATUSES_VISIBLE_TO_RECIPIENTS = (
        STATUS_AWAITING_RESPONSES, STATUS_REVIEWING_RESPONSES,
        STATUS_FINALIZED_SUCCESS, STATUS_FINALIZED_FAILURE,
    )
    # メンバーが承諾/辞退を回答できるのは、この状態の間だけ
    STATUSES_ACCEPTING_RESPONSES = (STATUS_AWAITING_RESPONSES, STATUS_REVIEWING_RESPONSES)

    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(30), nullable=False, default=STATUS_PENDING_REVIEW)
    created_at = db.Column(db.DateTime, default=_now, nullable=False)
    notified_at = db.Column(db.DateTime, nullable=True)   # 運営がメンバーへ通知した日時
    finalized_at = db.Column(db.DateTime, nullable=True)  # 運営が依頼者へ結果報告した日時

    requester = db.relationship("User", foreign_keys=[requester_id])
    recipients = db.relationship(
        "JobRequestRecipient", back_populates="job_request",
        cascade="all, delete-orphan", order_by="JobRequestRecipient.id",
    )

    def to_dict(self, *, viewer_role="admin", viewer_user_id=None) -> dict:
        """
        viewer_role:
          "admin"     - 運営向け。各メンバーの回答状況まで全て見せる
          "requester" - 依頼者向け。全体のステータスのみ。各メンバーの細かい回答内容は見せない
          "recipient" - メンバー向け。指定メンバーの一覧は見せるが、他人の回答状況までは見せない
        """
        data = {
            "id": self.id,
            "requester": self.requester.to_public_dict(),
            "title": self.title,
            "message": self.message,
            "status": self.status,
            "status_label": self.STATUS_LABELS.get(self.status, self.status),
            # 複数人を指定した場合、この配列が2件以上になる
            # ＝「このメンバーの組み合わせへの制作依頼」として扱う
            "created_at": self.created_at.isoformat(),
            "notified_at": self.notified_at.isoformat() if self.notified_at else None,
            "finalized_at": self.finalized_at.isoformat() if self.finalized_at else None,
        }

        if viewer_role == "admin":
            data["recipients"] = [r.to_dict(include_response=True) for r in self.recipients]
        else:
            data["recipients"] = [r.to_dict(include_response=False) for r in self.recipients]

        if viewer_role == "recipient" and viewer_user_id is not None:
            mine = next((r for r in self.recipients if r.user_id == viewer_user_id), None)
            data["my_response_status"] = mine.response_status if mine else None

        return data

    def __repr__(self):
        return f"<JobRequest id={self.id} requester_id={self.requester_id} status={self.status}>"


class JobRequestRecipient(db.Model):
    """お仕事依頼の宛先1人分(依頼:宛先 = 1:多)。メンバーごとに回答を別管理する。"""

    __tablename__ = "job_request_recipients"
    __table_args__ = (
        db.UniqueConstraint("job_request_id", "user_id", name="uq_job_request_recipient"),
    )

    RESPONSE_PENDING = "pending"
    RESPONSE_ACCEPTED = "accepted"
    RESPONSE_DECLINED = "declined"

    id = db.Column(db.Integer, primary_key=True)
    job_request_id = db.Column(db.Integer, db.ForeignKey("job_requests.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    response_status = db.Column(db.String(20), nullable=False, default=RESPONSE_PENDING)
    responded_at = db.Column(db.DateTime, nullable=True)

    job_request = db.relationship("JobRequest", back_populates="recipients")
    user = db.relationship("User")

    def to_dict(self, *, include_response=True) -> dict:
        data = {**self.user.to_public_dict()}
        if include_response:
            data["response_status"] = self.response_status
            data["responded_at"] = self.responded_at.isoformat() if self.responded_at else None
        return data

    def __repr__(self):
        return f"<JobRequestRecipient job_request_id={self.job_request_id} user_id={self.user_id}>"


class Notification(db.Model):
    """
    EGG HATCH内部の通知ログ。お仕事依頼の運営仲介フローで発生するイベント
    (新規依頼が来た・メンバーに届いた・メンバーが回答した・結果が確定した)を記録する。

    今はアプリ内の画面表示にしか使っていないが、あとからメール送信などに
    拡張しやすいよう、「誰に」「何が起きたか」をシンプルなログとして残す形にしている。
    """

    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    kind = db.Column(db.String(40), nullable=False)  # 例: "job_request_new" など
    message = db.Column(db.Text, nullable=False)
    related_job_request_id = db.Column(db.Integer, db.ForeignKey("job_requests.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=_now, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "message": self.message,
            "related_job_request_id": self.related_job_request_id,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<Notification id={self.id} user_id={self.user_id} kind={self.kind}>"
