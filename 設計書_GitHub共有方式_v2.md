# Import Core - GitHub データ共有方式 設計書(v2)

作成日: 2026-05-08
更新: 担当者選択方式・個別PAT発行・UI要件・管理者ロールを反映

---

## 目的

社内メンバー(2〜5人、フルリモート)で **クライアント情報** と **取込履歴** をリアルタイム共有する。
現在の localStorage 暗号化方式から、GitHub Private Repository をデータストアとする方式に移行する。

## 確定要件サマリー

| 項目 | 内容 |
|---|---|
| 共有対象 | クライアント情報、取込履歴(重複チェックキー含む) |
| 共有方法 | GitHub Private Repository に JSON ファイルとして保存 |
| 認証方式 | 各社員が **個別の** Personal Access Token (PAT) を Import Core に入力 |
| 担当者管理 | **担当者選択画面**で名乗る運用(自己申告ベース) |
| 担当者の追加・削除 | 管理者のみ「設定」画面から実行可能 |
| 権限階層 | 絶対管理者 / 管理者 / 一般 の3階層(従来通り) |
| アクセス許可 | 管理者が users.json に追加した者のみログイン可能 |
| 取込履歴の移行 | 新運用から開始(既存履歴は捨てる) |
| 同時編集 | ほぼ発生しない前提、後勝ちで OK |
| リアルタイム性 | 数秒の遅延は許容 |

## アーキテクチャ概要

```
┌──────────────────────────────────────────────┐
│  GitHub Private Repository: Import-Core-Data │
│  ├─ data.json     (クライアント・取込履歴)    │
│  └─ users.json    (担当者一覧 + 権限)         │
└──────────────────────────────────────────────┘
                  ↑          ↑
                  │ GitHub API(各社員のPAT)
                  │
┌─────────┐  ┌──────────┐  ┌──────────┐
│ 村井PC  │  │ 向江村PC │  │  社員C   │
│PAT_村井 │  │PAT_向江村│  │  PAT_C   │
└─────────┘  └──────────┘  └──────────┘
```

## ユーザー体験フロー

### 初回ログイン(各社員1回だけ)

```
1. Import Core (https://lc-rm.github.io/Import-Core/) を開く
2. 「GitHubトークンでログイン」画面が表示
   - 取得方法へのリンクとガイド付き
3. PATを貼り付けて「ログイン」
4. PATを検証 + users.json から担当者リスト取得
5. localStorage にPATを保存
6. 「担当者を選択」画面へ自動遷移
```

### 2回目以降(普段)

```
1. Import Core を開く → 自動でPAT検証
2. 「担当者を選択」画面が表示
3. 自分の名前を選んで「開始」
4. 変換ページへ
```

### 担当者切替

```
画面右上「担当: 向江村 章 ▼」をクリック
→ プルダウンで別の担当者を選ぶ
→ 即座に切替
```

### ログアウト

```
画面右上「ログアウト」
→ localStorage から PAT を削除
→ ログイン画面へ
```

## 画面設計

### login.html(刷新)

シンプル&可愛い雰囲気で。コアラ画像 + あたたかい配色。

```
┌──────────────────────────────────────┐
│                                       │
│           🐨 (コアラ画像)              │
│                                       │
│      Import Core へようこそ           │
│                                       │
│   GitHubトークンでログインしてください  │
│                                       │
│   ┌────────────────────────────────┐ │
│   │ github_pat_xxxxxxxxxxxxxx     │ │
│   └────────────────────────────────┘ │
│                                       │
│   [ ログイン ]                        │
│                                       │
│   💡 トークンの取得方法はこちら →     │
│      (折りたたみガイド)                │
│                                       │
└──────────────────────────────────────┘
```

### operator-select.html(新規)担当者選択画面

`login.html` 完了後に表示。可愛いカード型UI。

```
┌──────────────────────────────────────┐
│                                       │
│           🐨 (コアラ画像)              │
│                                       │
│       担当者を選択してください          │
│                                       │
│   ┌──────────┐  ┌──────────┐        │
│   │   👩      │  │   👨      │        │
│   │  村井莉彩  │  │ 向江村 章 │        │
│   │ (管理者)  │  │           │        │
│   └──────────┘  └──────────┘        │
│   ┌──────────┐                       │
│   │   👤      │                       │
│   │  〇〇〇〇  │                       │
│   │           │                       │
│   └──────────┘                       │
│                                       │
└──────────────────────────────────────┘
```

各カードクリックで即座に変換ページへ遷移。

### ヘッダー(全画面共通、刷新)

```
🐨 Import Core   [変換][設定][アカウント]    担当: 村井 莉彩 ▼  [ログアウト]
```

「担当: 村井 莉彩 ▼」クリックで小さなドロップダウン:
- 担当者一覧表示 → 別担当者を選んで切替

### 設定画面(クライアント・履歴ページ)

既存の「クライアント管理」「取込履歴管理」セクションに加え、**「担当者管理」セクション**を新規追加。
**管理者のみが操作可能**(一般ユーザーには表示されない or 操作不可)。

```
┌──────────────────────────────────────────┐
│ 担当者管理(管理者専用)                     │
│                                           │
│ 新規担当者を追加                           │
│   名前: [_____________]                   │
│   メール: [_____________]                 │
│   権限: ○ 一般  ○ 管理者                  │
│   [追加]                                  │
│                                           │
│ 登録済み担当者                             │
│   ┌─────────────────────────────────┐   │
│   │ 村井 莉彩 (絶対管理者) - あなた   │   │
│   │ ─ ─ ─ 操作不可                   │   │
│   ├─────────────────────────────────┤   │
│   │ 向江村 章 (管理者)               │   │
│   │ [管理者解除] [削除]              │   │
│   ├─────────────────────────────────┤   │
│   │ 〇〇 〇〇 (一般)                 │   │
│   │ [管理者にする] [削除]            │   │
│   └─────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

## 権限階層(従来通り維持)

| ロール | 担当者管理 | クライアント管理 | 取込操作 |
|---|---|---|---|
| **絶対管理者**(村井さん、コードで固定) | ✅(自分以外を全操作) | ✅ | ✅ |
| **管理者** | ✅(絶対管理者以外を操作) | ✅ | ✅ |
| **一般** | ❌(表示なし) | ✅ | ✅ |

絶対管理者は users.json で `role: "super_admin"` かつ メアドが `r_murai@link-core.co.jp` の人。
コードで固定しているので、誤って権限変更できない。

## データ構造

### data.json

```json
{
  "version": 1,
  "lastModifiedAt": "2026-05-08T11:45:00Z",
  "lastModifiedBy": "村井 莉彩",
  "clients": [
    { "id": "cli_001", "name": "株式会社Link Core", "createdAt": "..." },
    { "id": "cli_002", "name": "株式会社セック", "createdAt": "..." }
  ],
  "history": {
    "cli_001": {
      "indeed": [
        {
          "processedAt": "2026-05-08T05:31:46Z",
          "operatorName": "村井 莉彩",
          "operatorEmail": "r_murai@link-core.co.jp",
          "totalCount": 1,
          "newCount": 1,
          "dupCount": 0,
          "keys": ["e:xxx@indeedemail.com", "p:09012345678"],
          "csv": "応募日,求人番号,...",
          "filename": "採用コア_株式会社Link_Core_Indeed_2026-05-08.csv"
        }
      ]
    }
  }
}
```

### users.json

```json
{
  "version": 1,
  "users": [
    {
      "email": "r_murai@link-core.co.jp",
      "displayName": "村井 莉彩",
      "role": "super_admin",
      "addedAt": "2026-05-08T00:00:00Z",
      "addedBy": "system"
    },
    {
      "email": "a_mukaemura@link-core.co.jp",
      "displayName": "向江村 章",
      "role": "admin",
      "addedAt": "2026-05-08T11:00:00Z",
      "addedBy": "r_murai@link-core.co.jp"
    },
    {
      "email": "someone@link-core.co.jp",
      "displayName": "〇〇 〇〇",
      "role": "member",
      "addedAt": "2026-05-08T12:00:00Z",
      "addedBy": "r_murai@link-core.co.jp"
    }
  ]
}
```

## ログイン認証フロー

### 検証ロジック

```javascript
async function login(pat) {
  // 1. PAT で GitHub に問い合わせ → メアドと GitHubログイン名を取得
  const userInfo = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${pat}` }
  });
  
  // 2. users.json を取得
  const users = await loadUsers(pat);
  
  // 3. メアド or GitHubログイン名で users.json と照合
  const matched = users.find(u => u.email === userInfo.email);
  
  // 4. 一致 → ログイン成功、PAT を localStorage に保存
  // 不一致 → エラー「アクセス権限がありません。管理者に追加してもらってください」
}
```

### セッション管理

```javascript
// localStorage に保存
{
  "import-core/pat": "github_pat_xxx",
  "import-core/userInfo": { email, displayName, role },
  "import-core/operatorName": "村井 莉彩"  // 担当者選択後
}
```

## ファイル構成

### 新規作成するファイル

| ファイル | 役割 |
|---|---|
| `github-store.js` | GitHub API ラッパー(SecureStore互換APIで実装) |
| `github-auth.js` | PAT認証、ユーザー検証 |
| `operator-select.html` | 担当者選択画面 |
| `assets/koala-greet.png` | 担当者選択画面用のコアラ画像(既存のkoala-*.pngを流用可能) |

### 書き換えるファイル

| ファイル | 変更内容 |
|---|---|
| `auth.js` | localStorage暗号化方式 → PAT認証方式に全面書き換え |
| `login.html` | パスワード入力 → PAT入力に変更、可愛いUIに |
| `setup.html` | **削除** |
| `index.html` | データ取得を非同期化、担当者表示、ヘッダー更新 |
| `settings.html` | 担当者管理セクション追加(管理者のみ表示)、データ取得方式変更 |
| `account.html` | パスワード変更機能廃止 or PAT再入力に変更 |
| `style.css` | 担当者選択画面・カード型UIのスタイル追加 |

### コードで固定する設定

```javascript
// github-config.js
const GITHUB_CONFIG = {
  owner: 'lc-rm',
  repo: 'Import-Core-Data',
  dataFile: 'data.json',
  usersFile: 'users.json',
  branch: 'main'
};

// 絶対管理者のメールアドレス(変更不可)
const SUPER_ADMIN_EMAIL = 'r_murai@link-core.co.jp';
```

## GitHub API 主要エンドポイント

| 操作 | メソッド | URL |
|---|---|---|
| ファイル取得 | GET | `https://api.github.com/repos/{owner}/{repo}/contents/{path}` |
| ファイル更新 | PUT | `https://api.github.com/repos/{owner}/{repo}/contents/{path}` |
| ユーザー情報取得 | GET | `https://api.github.com/user` |

リクエストヘッダ:
```
Authorization: Bearer {PAT}
Accept: application/vnd.github.v3+json
```

## エラーハンドリング

| ケース | 対処 |
|---|---|
| ネットワーク切断 | 「接続できません、後でリトライ」表示 |
| 401 Unauthorized | PATが無効 → ログアウト画面へ |
| 403 Forbidden | リポへのアクセス権がない → 管理者連絡を促す |
| 404 Not Found | ファイル不存在 → 初回扱いで空データ初期化 |
| 409 Conflict | SHA不一致(同時更新) → 自動リトライ(最大3回) |
| 422 Unprocessable | リクエスト不正 → エラーメッセージ表示 |
| レート制限超過 | 「1時間に5000回まで」案内 |

## セキュリティ考慮事項

### PATの取り扱い
- localStorage に保存(暗号化なし、ただしブラウザ・ドメイン単位で隔離)
- ログアウト時に削除
- 共有PCでは「使い終わったらログアウト」を案内

### 推奨されるPAT設定(村井さんが社員に案内)
- **Fine-grained personal access token** を使う
- Repository access: `Import-Core-Data` のみ
- Permissions:
  - Contents: Read and write
  - Metadata: Read-only
- Expiration: 90日推奨

### コードに含まれるもの
- リポジトリオーナー名・リポ名: 公開してOK
- API キー、シークレット: なし
- 絶対管理者メアド: コード内に定数で

## 実装ステップ(次セッション)

### Phase 1: 基盤実装(2〜3時間)
1. `github-store.js`: GitHub API ラッパー
   - `loadData()`, `saveData(data)`, `loadUsers()`, `saveUsers(users)`
   - SHA管理、リトライロジック
2. `github-auth.js`: PAT検証、ユーザー判定
3. 単体テスト

### Phase 2: 認証UI改修(2時間)
4. `login.html` 刷新(PAT入力UI、可愛いコアラデザイン)
5. `operator-select.html` 新規作成(カード型担当者選択)
6. `setup.html` 削除
7. ヘッダーの担当者表示・切替UI

### Phase 3: 設定画面改修(2時間)
8. `settings.html` に「担当者管理」セクション追加
9. 管理者のみ表示制御
10. 担当者の追加・編集・削除・権限変更

### Phase 4: 既存画面のデータ層更新(2時間)
11. `index.html`: データ取得をGitHub API化、担当者を取込履歴に記録
12. `settings.html`: クライアント管理・取込履歴の取得をGitHub API化
13. `account.html`: 不要部分削除、パスワード変更機能廃止

### Phase 5: 動作確認&運用準備(1時間)
14. 動作確認(村井さん環境で)
15. 社員配布手順書作成
16. デプロイ&運用切替

## 必要な事前準備(村井さんパート)

別ファイル `事前準備手順.md` を参照。

要点:
1. GitHubで `Import-Core-Data` リポジトリを Private で作成
2. 初期 `users.json` と `data.json` をコミット
3. 自分用 PAT を Fine-grained で発行(Import-Core-Data リポのみ Read/Write)

## 既知のリスクと対策

| リスク | 対策 |
|---|---|
| 同時編集の競合 | 409 Conflict検出 → 自動リトライ |
| PAT漏洩 | リポ単位の権限制限、有効期限設定 |
| API レート制限 | 5000/h で社員5人なら問題なし |
| ネットワーク不安定 | エラー表示 + 「リトライ」ボタン |
| データ肥大化 | 履歴は最大5件保持で自動削除(現状仕様維持) |
| 担当者の自己申告偽装 | 社内信頼ベース運用、必要なら後でPAT-担当者紐付けに進化 |

## 残課題

- [ ] 担当者と PAT(GitHub アカウント) の紐付けをするか? 当面は自己申告でOK
- [ ] 同時編集ロック機構が要るか? 当面は最終勝ちでOK
- [ ] PAT 期限切れに備えた更新フロー
- [ ] バックアップ・復旧手順(Gitコミット履歴頼みでOKか)

---

以上で設計書終了。次セッションでこの仕様に基づいて実装する。
