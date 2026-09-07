"""
EGG HATCH - ファイルアップロード(設計ドキュメントの「4」に対応)

設計ドキュメントで挙げていた注意点を、それぞれ次のようにコードへ反映しています。

- 「ファイル名をそのまま保存先パスに使わない」
    → アップロードされたファイルは、中身に関係なく必ずランダムな名前
      (secrets.token_hex)で保存する。元のファイル名は表示用として
      データベースに文字列で残すだけで、パスの組み立てには一切使わない。

- 「拡張子だけでなく、実際のファイルの中身を見て種類を確認する」
    → 拡張子やブラウザが送ってくる Content-Type は自己申告にすぎず、
      偽装できてしまう。ここでは、ファイルの先頭数バイト(マジックナンバー)
      を直接読んで種類を判定している。

- 「許可する種類・サイズの上限を決める」
    → 画像(jpg/png/gif)とPDFのみ、10MBまでに制限。

- 「アップロード先は実行できない場所に置く」
    → 保存先フォルダ(uploads/)は静的配信の対象にしておらず、
      ダウンロードは必ずこのファイルの /files/<id>/download を経由する。
      ブラウザがファイルの中身をプログラムとして実行しないよう、
      ダウンロード時も判定済みの安全な mimetype で返す。
"""

import os
import secrets

from flask import Blueprint, request, jsonify, abort, send_from_directory, current_app
from flask_login import login_required, current_user

from models import db, File, Application

files_bp = Blueprint("files", __name__)

# --- 許可するファイル種類（先頭バイトの並び = マジックナンバーで判定する） ---
# key: 拡張子として保存するもの / value: (マジックナンバー, MIMEタイプ)
_MAGIC_NUMBERS = {
    b"\xff\xd8\xff": (".jpg", "image/jpeg"),
    b"\x89PNG\r\n\x1a\n": (".png", "image/png"),
    b"GIF87a": (".gif", "image/gif"),
    b"GIF89a": (".gif", "image/gif"),
    b"%PDF-": (".pdf", "application/pdf"),
}

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB


def _detect_safe_type(file_bytes: bytes):
    """
    ファイルの中身の先頭バイトを見て、許可された種類かどうか判定する。
    拡張子や Content-Type ヘッダは信用しない（詐称できるため）。
    一致するものが無ければ None を返す＝許可しないファイル種類。
    """
    for magic, (ext, mime) in _MAGIC_NUMBERS.items():
        if file_bytes.startswith(magic):
            return ext, mime
    return None


def _upload_folder():
    folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(folder, exist_ok=True)
    return folder


@files_bp.post("/uploads")
@login_required
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "file が指定されていません。"}), 400

    uploaded = request.files["file"]
    if uploaded.filename == "":
        return jsonify({"error": "ファイルが選択されていません。"}), 400

    file_bytes = uploaded.read()

    if len(file_bytes) == 0:
        return jsonify({"error": "空のファイルはアップロードできません。"}), 400
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        return jsonify({"error": f"ファイルサイズは{MAX_FILE_SIZE_BYTES // (1024*1024)}MBまでです。"}), 400

    detected = _detect_safe_type(file_bytes)
    if detected is None:
        # 拡張子が .jpg などになっていても、中身が対応していなければ拒否する
        return jsonify({"error": "対応していないファイル形式です。(画像 jpg/png/gif、またはPDFのみ)"}), 400

    ext, mime_type = detected
    stored_filename = secrets.token_hex(16) + ext  # ← 元のファイル名は一切使わない

    with open(os.path.join(_upload_folder(), stored_filename), "wb") as f:
        f.write(file_bytes)

    # 表示用の元ファイル名は、あくまで「文字列」として保存するだけ(パスには使わない)
    original_filename = os.path.basename(uploaded.filename)[:255]

    file_record = File(
        uploaded_by=current_user.id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        mime_type=mime_type,
        size_bytes=len(file_bytes),
    )
    db.session.add(file_record)
    db.session.commit()

    return jsonify(file_record.to_dict()), 201


def _can_access_file(file: File, user) -> bool:
    """このファイルを見てよい人かどうかを判定する"""
    if file.uploaded_by == user.id:
        return True  # 自分がアップロードした本人

    # 応募の提出物として使われている場合、その作品の発案者にも見せてよい
    application = Application.query.filter_by(submission_file_id=file.id).first()
    if application is not None and application.work.owner_id == user.id:
        return True

    return False


@files_bp.get("/files/<int:file_id>/download")
@login_required
def download_file(file_id):
    file_record = db.session.get(File, file_id)
    if file_record is None:
        abort(404, description="指定されたファイルが見つかりません。")

    if not _can_access_file(file_record, current_user):
        abort(403, description="このファイルにアクセスする権限がありません。")

    return send_from_directory(
        _upload_folder(),
        file_record.stored_filename,
        mimetype=file_record.mime_type,           # ← 自己申告ではなく、判定済みの安全な値を使う
        as_attachment=True,
        download_name=file_record.original_filename,  # 表示用のファイル名はここでだけ使う
    )
