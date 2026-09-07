"""
EGG HATCH - クリエイタープロフィール関連のルート

含まれるもの:
- GET /users/<id>/profile   誰でも見られる(公開プロフィール)
- PUT /me/profile           自分のプロフィールを更新(本人のみ)
- PUT /me/tags              自分のタグ(得意分野／やりたい役割／ジャンル)をまとめて更新(本人のみ)

セキュリティで意識したポイント:
- 更新系のエンドポイントは、URLやリクエストボディで「誰のプロフィールを
  更新するか」を指定させず、必ず current_user（ログイン中の本人）だけを
  対象にする。これにより「他人のプロフィールIDを指定して書き換える」
  という攻撃(IDOR)がそもそも起こり得ない設計にしている。
"""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from models import db, User, CreatorProfile, CreatorTag

profiles_bp = Blueprint("profiles", __name__)


def _profile_dict_for(user: User) -> dict:
    profile = user.profile
    tags = CreatorTag.query.filter_by(user_id=user.id).all()
    return {
        "user": user.to_public_dict(),
        "worldview": profile.worldview if profile else None,
        "avatar_glyph_or_url": profile.avatar_glyph_or_url if profile else None,
        "handle": profile.handle if profile else None,
        "specialties": [t.label for t in tags if t.tag_type == "specialty"],
        "roles_wanted": [t.label for t in tags if t.tag_type == "role_wanted"],
        "genres": [t.label for t in tags if t.tag_type == "genre"],
    }


@profiles_bp.get("/users/<int:user_id>/profile")
def get_profile(user_id):
    user = db.session.get(User, user_id)
    if user is None:
        return jsonify({"error": "指定されたユーザーが見つかりません。"}), 404
    return jsonify(_profile_dict_for(user))


@profiles_bp.get("/creators")
def list_creators():
    """
    新着クリエイター一覧など、フロントの「クリエイターを探す」系の画面で使う。
    プロフィールを作っている人だけを対象にする(からっぽの会員情報だけの人は含めない)。
    """
    profiles = CreatorProfile.query.order_by(CreatorProfile.user_id.desc()).all()
    return jsonify([_profile_dict_for(p.user) for p in profiles])


@profiles_bp.put("/me/profile")
@login_required
def update_my_profile():
    """自分のプロフィールを更新する。current_user 以外は絶対に書き換えられない"""
    data = request.get_json(silent=True) or {}

    profile = current_user.profile
    if profile is None:
        profile = CreatorProfile(user_id=current_user.id)
        db.session.add(profile)

    if "worldview" in data:
        profile.worldview = (data.get("worldview") or "").strip() or None
    if "avatar_glyph_or_url" in data:
        profile.avatar_glyph_or_url = (data.get("avatar_glyph_or_url") or "").strip() or None
    if "handle" in data:
        handle = (data.get("handle") or "").strip() or None
        if handle is not None:
            duplicate = CreatorProfile.query.filter(
                CreatorProfile.handle == handle, CreatorProfile.user_id != current_user.id
            ).first()
            if duplicate is not None:
                return jsonify({"error": "そのハンドル名はすでに使われています。"}), 409
        profile.handle = handle

    db.session.commit()
    return jsonify(_profile_dict_for(current_user))


@profiles_bp.put("/me/tags")
@login_required
def update_my_tags():
    """
    得意分野／やりたい役割／ジャンルのタグを、まとめて置き換える。
    (今回は「編集のたびに全部作り直す」簡単な方式にしている)
    """
    data = request.get_json(silent=True) or {}

    def _clean_list(key):
        raw = data.get(key) or []
        if not isinstance(raw, list):
            return []
        return [str(v).strip() for v in raw if str(v).strip()][:20]  # 念のため上限20個

    specialties = _clean_list("specialties")
    roles_wanted = _clean_list("roles_wanted")
    genres = _clean_list("genres")

    # 自分のタグだけを消して作り直す(他人のタグ行には一切触れない)
    CreatorTag.query.filter_by(user_id=current_user.id).delete()

    new_tags = (
        [CreatorTag(user_id=current_user.id, tag_type="specialty", label=v) for v in specialties]
        + [CreatorTag(user_id=current_user.id, tag_type="role_wanted", label=v) for v in roles_wanted]
        + [CreatorTag(user_id=current_user.id, tag_type="genre", label=v) for v in genres]
    )
    db.session.add_all(new_tags)
    db.session.commit()

    return jsonify(_profile_dict_for(current_user))
