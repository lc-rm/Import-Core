# GitHubの既存リポジトリを更新する手順

すでに `Import-Core` リポジトリは作成済みなので、ファイルだけ差し替えます。

## 手順

### 1. 既存ファイルをすべて削除

1. GitHubのリポジトリ画面(`https://github.com/arky8194/Import-Core`)を開く
2. 既存の各ファイル(index.html, settings.html, sources.js, converter.js, style.css, README.md, GITHUB_PAGES_手順.md)を**1つずつ削除**
   - ファイル名をクリック
   - 右上の **🗑️(ゴミ箱)アイコン** をクリック
   - 一番下の **「Commit changes」** をクリック
   - これを各ファイル繰り返す

⚠️ もしくは、もっと早い方法として:
- Settings(右上の歯車) → 一番下の「Danger Zone」 → 「Delete this repository」でリポジトリごと消して、`Import-Core` という名前で新規作成しなおす

### 2. 新しいファイル一式をアップロード

このZIPを解凍した `import-core` フォルダの中身を、まるごとアップロードします。

1. GitHubのリポジトリトップで **「Add file」 → 「Upload files」**
2. 解凍した `import-core` フォルダの **中身を全選択** してドラッグ&ドロップ
   - 中身は以下の通り:
     - login.html
     - setup.html
     - index.html
     - settings.html
     - account.html
     - style.css
     - auth.js
     - converter.js
     - sources.js
     - README.md
     - **assetsフォルダごと**(コアラ画像5枚)

⚠️ assetsフォルダはフォルダごとアップロードしてOK(GitHubは自動で展開してくれる)

3. 一番下の「Commit changes」をクリック

### 3. GitHub Pagesは自動で更新される

すでにPages設定済みなので、コミット後1〜2分で公開ページが更新されます。

URL: `https://arky8194.github.io/Import-Core/`

### 4. 初回アクセス時にやること

1. URLにアクセスすると、初回セットアップ画面が出る
2. ユーザーIDとパスワードを設定
3. ログイン後、「クライアント・履歴」ページでクライアントを追加
4. 「変換」ページで実際の変換を試す

⚠️ パスワードは絶対に忘れないでください(暗号化キーになっているため)

## ⚠️ 旧データについて

旧バージョンで登録したクライアント・履歴データは、暗号化方式が変わったため**引き継がれません**。
新バージョンで改めてクライアントを登録してください。
