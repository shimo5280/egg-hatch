# EGG HATCH データベース設計案(セキュリティ考慮版)

これまで作ったプロトタイプ(HTML/CSS/JS)は、すべてブラウザの中だけで動く「見た目だけの仮データ」でした。
ここでは、実際にサーバー・データベースを用意するときの**テーブル構成**と、**気をつけるべきセキュリティのポイント**を整理します。

---

## 1. 設計の基本方針

- **パスワードは絶対に平文で保存しない**(ハッシュ化して保存)
- **「誰が」「何を」見られるか・変更できるか**を、画面(フロント)ではなくサーバー側で必ずチェックする
- **個人情報(メールアドレスなど)は、他のユーザーには絶対に返さない**
- **ファイルは名前をそのまま信用しない**(中身の種類・サイズをサーバー側で確認する)
- 迷ったら「見せすぎない」「消さずに無効化する」を選ぶ

---

## 2. テーブル設計

### 2.1 `users`(会員・ログイン情報)

| カラム名 | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 会員ID |
| email | string, unique | ログイン用メールアドレス |
| password_hash | string | **bcrypt / argon2 でハッシュ化**したパスワード(平文は保存しない) |
| display_name | string | 表示名(例:紙谷 まひろ) |
| email_verified_at | datetime, null可 | メール認証済み日時 |
| created_at / updated_at | datetime | 作成・更新日時 |

🔒 **ポイント**:`password_hash`カラムに生パスワードを入れない。API のレスポンスにも`password_hash`は絶対に含めない。

---

### 2.2 `creator_profiles`(クリエイタープロフィール)

| カラム名 | 型 | 説明 |
|---|---|---|
| user_id | UUID (PK, FK→users.id) | 会員ID |
| worldview | text | 「私の世界観」(プロフィールの中心要素) |
| avatar_glyph_or_url | string | アイコン画像 or 仮アイコンの文字 |
| handle | string, unique | 表示用ID(例:@kamiya_mahiro) |

得意分野・やりたい役割・ジャンルは「複数選べる」ため、別テーブルに分けます(下記2.3)。

### 2.3 `creator_tags`(得意分野／やりたい役割／ジャンルのタグ)

| カラム名 | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | タグID |
| user_id | UUID (FK→users.id) | 誰のタグか |
| tag_type | enum('specialty','role_wanted','genre') | タグの種類 |
| label | string | タグの中身(例:「ネーム」「SF」) |

---

### 2.4 `works`(作品)

| カラム名 | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 作品ID |
| owner_id | UUID (FK→users.id) | **発案者**(この作品を編集・選考できる唯一の人) |
| title | string | タイトル |
| theme | string, null可 | テーマ |
| idea | text | 短いアイデア(必須) |
| synopsis | text, null可 | あらすじ |
| worldview | text, null可 | 世界観 |
| original_text | text, null可 | 原作本文・プロット |
| status | enum('idea','recruiting','in_progress','completed') | 今の段階 |
| application_task | text, null可 | 応募用課題 |
| deadline_type | enum('ongoing','date') | 常時募集 or 期限指定 |
| deadline_date | date, null可 | 期限 |
| created_at / updated_at | datetime | |

🔒 **ポイント**:「選考画面が見られるのは`owner_id`と一致する本人だけ」という権限チェックを、**サーバー側の全エンドポイントで**行う。フロント側でボタンを隠すだけでは、URLを直接叩かれると防げない。

### 2.5 `work_genres` / `work_characters` / `work_roles`

作品に紐づく「複数持てる」情報は、それぞれ別テーブルにします。

**`work_genres`**(ジャンル、多対多)
| work_id (FK) | genre_label |

**`work_characters`**(キャラクター設定)
| id (PK) | work_id (FK) | name | role | description |

**`work_roles`**(募集したい役割)
| id (PK) | work_id (FK) | role_name | description | is_open(募集中か) |

---

### 2.6 `applications`(応募)

| カラム名 | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 応募ID |
| work_id | UUID (FK→works.id) | どの作品への応募か |
| work_role_id | UUID (FK→work_roles.id) | どの役割への応募か |
| applicant_id | UUID (FK→users.id) | 応募者(=ログイン中の本人。なりすまし防止のため、フォーム入力の名前ではなく必ずログイン情報から取得する) |
| intent | text | 自分が担当したい内容 |
| comment | text, null可 | コメント |
| status | enum('pending','candidate','accepted','declined') | 選考状況 |
| created_at / updated_at | datetime | |

**`application_submissions`**(提出物:文章／ファイル／URL)
| id (PK) | application_id (FK) | submit_type(text/file/url) | text_content | file_id (FK→files.id, null可) | url |

🔒 **ポイント**:
- `applicant_id`は**ログインセッションから自動で決める**。フォームの「お名前」欄をそのまま信用しない(なりすまし防止)。
- 応募内容(`applications`・`application_submissions`)を見られるのは、**応募者本人**と**その作品の`owner_id`**だけに制限する。

---

### 2.7 `team_members`(採用後のチーム)

| カラム名 | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | |
| work_id | UUID (FK→works.id) | |
| user_id | UUID (FK→users.id) | |
| role_name | string | 担当役割 |
| joined_at | datetime | |

このテーブルに行があるかどうかで「その作品の制作スペースに入れるか」を判定します。

### 2.8 `team_chat_messages` / `team_submissions`(制作チャット・ラフ提出)

**`team_chat_messages`**
| id (PK) | work_id (FK) | sender_id (FK→users.id) | body | created_at |

**`team_submissions`**
| id (PK) | work_id (FK) | submitted_by (FK→users.id) | kind(ラフ/修正版) | title | comment | file_id (FK→files.id) | created_at |

🔒 **ポイント**:このチャット・提出物を見られるのは、`team_members`に登録されている人だけ。作品の発案者や関係ないユーザーからは見えないようにする。

### 2.9 `files`(共通ファイル管理)

応募の提出物・チーム制作のラフ・ファイル共有など、「ファイルが関わる場所」はすべてこの1テーブルにまとめます。

| カラム名 | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | |
| uploaded_by | UUID (FK→users.id) | |
| original_filename | string | 元のファイル名(表示用。**信用して実行・展開はしない**) |
| stored_path | string | 実際の保存先(ランダムな名前に変換して保存) |
| mime_type | string | サーバー側で中身を確認して記録 |
| size_bytes | integer | |
| created_at | datetime | |

🔒 **ポイント**(ファイルアップロードは特に事故が起きやすい場所です):
- ファイル名をそのまま保存先パスに使わない(`../../etc/passwd`のような細工を防ぐため、ランダムなIDに変換)
- 拡張子だけでなく、**実際のファイルの中身**を見て種類を確認する
- 許可する種類・サイズの上限を決める(画像・PDFのみ、◯MBまで、など)
- アップロード先は「実行できない」場所に置く(アップロードされたファイルがプログラムとして動いてしまわないように)

### 2.10 `sessions`(ログインセッション)

| カラム名 | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | セッションID(Cookieに入れる値) |
| user_id | UUID (FK→users.id) | |
| expires_at | datetime | 有効期限 |
| user_agent / ip(任意) | string | 不正利用に気づくための記録 |

🔒 **ポイント**:
- セッションIDは推測されない十分な長さのランダム値にする
- Cookieは`HttpOnly`(JavaScriptから読めない)・`Secure`(HTTPS限定)にする
- フォーム送信には**CSRFトークン**を必ず含める(他サイトから勝手に送信されるのを防ぐ)

---

## 3. セキュリティ設計まとめ(重要な5つ)

| 項目 | やること |
|---|---|
| パスワード | 平文で保存しない。bcrypt / argon2 でハッシュ化 |
| 権限チェック | 「発案者だけ」「チームメンバーだけ」が見られる情報は、**サーバー側で毎回**確認する(フロントの見た目だけで制御しない) |
| なりすまし防止 | 応募者名・発言者名などは、フォーム入力ではなく**ログイン中の本人情報**から取得する |
| SQLインジェクション対策 | 文字列をそのままSQLに埋め込まず、**プレースホルダ(パラメータ化クエリ)**を使う |
| ファイルアップロード | ファイル名を信用しない、中身の種類とサイズを確認する、実行できない場所に保存する |

このほか、XSS(悪意のあるスクリプトを他人の画面に埋め込む攻撃)対策として、ユーザーが入力した文章をそのまま画面に表示する箇所(コメント・チャットなど)は、表示前に必ずエスケープ処理をします。今のプロトタイプのJavaScriptでも`escapeHtml()`という関数で同じ考え方を使っているので、サーバー側でも同じ意識を引き継ぐ形になります。

---

## 4. 今のプロトタイプ(サンプルデータ)との対応

| プロトタイプ内のデータ | 対応するテーブル |
|---|---|
| `egg-hatch.js` の `SAMPLE_NEW_WORKS` など | `works` + `work_genres` |
| `egg-hatch-work.js` の `SAMPLE_WORK_DETAILS` | `works` + `work_characters` + `work_roles` |
| `egg-hatch-apply.js` の送信内容(payload) | `applications` + `application_submissions` |
| `egg-hatch-review.js` の応募一覧・ステータス | `applications`(status列) |
| `egg-hatch-team.js` の members / chat / submissions | `team_members` / `team_chat_messages` / `team_submissions` |
| `egg-hatch-profile.js` の私の世界観・タグ | `creator_profiles` / `creator_tags` |

---

## 5. 次にやるべきこと

1. まずは`users`(ログイン)・`works`(作品)・`applications`(応募)の3つだけを実際に作ってみる(最小構成)
2. パスワードのハッシュ化とログイン機能を先に作る(これが無いと「誰が発案者か」を判定できないため)
3. その後、選考画面・チーム制作ページの権限チェックを実装する
4. ファイルアップロードは一番最後で良い(最初はURL提出だけでも動く)
