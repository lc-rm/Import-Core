/* ==========================================================================
 * github-store.js
 * --------------------------------------------------------------------------
 * GitHub Private Repository をデータバックエンドとして使う SecureStore 実装
 *
 * - data.json:  クライアント・取込履歴
 * - users.json: 担当者一覧 + 権限
 *
 * 既存の SecureStore と同じインターフェースを公開し、index.html / settings.html
 * の呼び出し箇所をほぼ書き換えずに使える。
 *
 * 認証: Fine-grained Personal Access Token (PAT)
 *       Contents: Read and write / Metadata: Read-only
 *
 * 重要: SHA を保持して PUT する楽観ロック方式。コンフリクト時は再取得して
 *       1回だけリトライ(さらに失敗したら呼び出し側に例外を投げる)。
 * ========================================================================== */

(function (global) {
  'use strict';

  // ------------------------------------------------------------------
  // 設定(コード固定値)
  // ------------------------------------------------------------------
  const GITHUB_CONFIG = {
    owner: 'lc-rm',
    repo: 'Import-Core-Data',
    dataFile: 'data.json',
    usersFile: 'users.json',
    branch: 'main'
  };

  const SUPER_ADMIN_EMAIL = 'r_murai@link-core.co.jp';

  // localStorage キー
  const LS_KEY_TOKEN = 'importcore.github.pat';
  const LS_KEY_OPERATOR = 'importcore.operator.email';

  // 取込履歴の最大保持件数(クライアント×媒体ごと)
  const MAX_HISTORY_PER_SOURCE = 5;

  // ------------------------------------------------------------------
  // ローカルキャッシュ(SHA含むファイル状態を保持)
  // ------------------------------------------------------------------
  const cache = {
    data: null,      // { content: <object>, sha: <string> } | null
    users: null      // { content: <object>, sha: <string> } | null
  };

  // sessionStorage キャッシュキー(タブ遷移後の即時表示用)
  const SS_CACHE_DATA = 'importcore.ssc.data';
  const SS_CACHE_USERS = 'importcore.ssc.users';
  const SS_CACHE_TTL_MS = 60 * 1000; // 60秒

  function ssCacheLoad(key){
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || !obj.payload) return null;
      if (Date.now() - obj.ts > SS_CACHE_TTL_MS) {
        sessionStorage.removeItem(key);
        return null;
      }
      return obj.payload; // { content, sha }
    } catch(e) { return null; }
  }
  function ssCacheSave(key, payload){
    try {
      sessionStorage.setItem(key, JSON.stringify({
        ts: Date.now(),
        payload: payload
      }));
    } catch(e) {}
  }
  function ssCacheClear(){
    try {
      sessionStorage.removeItem(SS_CACHE_DATA);
      sessionStorage.removeItem(SS_CACHE_USERS);
    } catch(e){}
  }

  // ------------------------------------------------------------------
  // 内部ユーティリティ
  // ------------------------------------------------------------------

  function getToken() {
    const t = localStorage.getItem(LS_KEY_TOKEN);
    if (!t) {
      throw new Error('NO_TOKEN: Personal Access Token が未設定です');
    }
    return t;
  }

  function setToken(token) {
    localStorage.setItem(LS_KEY_TOKEN, token);
  }

  function clearToken() {
    localStorage.removeItem(LS_KEY_TOKEN);
    cache.data = null;
    cache.users = null;
  }

  function getOperatorEmail() {
    return localStorage.getItem(LS_KEY_OPERATOR) || null;
  }

  function setOperatorEmail(email) {
    if (email) {
      localStorage.setItem(LS_KEY_OPERATOR, email);
    } else {
      localStorage.removeItem(LS_KEY_OPERATOR);
    }
  }

  // Base64 <-> UTF-8 文字列変換(日本語対応)
  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function base64ToUtf8(b64) {
    // GitHub API は base64 に改行を入れて返してくるので除去
    const cleaned = b64.replace(/\n/g, '');
    return decodeURIComponent(escape(atob(cleaned)));
  }

  function apiUrl(filePath) {
    const { owner, repo } = GITHUB_CONFIG;
    return `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  }

  /**
   * 指定ファイルを GitHub から取得して { content, sha } で返す。
   */
  async function fetchFile(filePath) {
    const token = getToken();
    const url = apiUrl(filePath) + `?ref=${GITHUB_CONFIG.branch}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (res.status === 401) {
      throw new Error('UNAUTHORIZED: PAT が無効または期限切れです');
    }
    if (res.status === 403) {
      throw new Error('FORBIDDEN: PAT の権限が不足しています(Contents: Read and write 必要)');
    }
    if (res.status === 404) {
      throw new Error(`NOT_FOUND: ${filePath} が見つかりません`);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();
    const text = base64ToUtf8(json.content);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`PARSE_ERROR: ${filePath} の JSON パース失敗: ${e.message}`);
    }

    return { content: parsed, sha: json.sha };
  }

  /**
   * 指定ファイルを GitHub に保存する(PUT)。SHA コンフリクト時は1回だけ再取得+リトライ。
   */
  async function saveFile(filePath, content, sha, commitMessage) {
    const token = getToken();
    const url = apiUrl(filePath);

    const body = {
      message: commitMessage || `Update ${filePath}`,
      content: utf8ToBase64(JSON.stringify(content, null, 2)),
      sha: sha,
      branch: GITHUB_CONFIG.branch
    };

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.status === 409 || res.status === 422) {
      // SHA コンフリクト: 最新を取り直して呼び出し側にリトライしてもらう
      throw new Error('SHA_CONFLICT');
    }
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED: PAT が無効または期限切れです');
    }
    if (res.status === 403) {
      throw new Error('FORBIDDEN: PAT に書き込み権限がありません');
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();
    return { sha: json.content.sha };
  }

  /**
   * data.json を取得してキャッシュに格納
   */
  async function loadData(forceRefresh) {
    if (!forceRefresh && cache.data) return cache.data.content;
    // メモリにない場合、まず sessionStorage を確認
    if (!forceRefresh) {
      const ssc = ssCacheLoad(SS_CACHE_DATA);
      if (ssc) {
        cache.data = ssc;
        return ssc.content;
      }
    }
    const result = await fetchFile(GITHUB_CONFIG.dataFile);
    cache.data = result;
    ssCacheSave(SS_CACHE_DATA, result);
    return result.content;
  }

  /**
   * users.json を取得してキャッシュに格納
   */
  async function loadUsers(forceRefresh) {
    if (!forceRefresh && cache.users) return cache.users.content;
    if (!forceRefresh) {
      const ssc = ssCacheLoad(SS_CACHE_USERS);
      if (ssc) {
        cache.users = ssc;
        return ssc.content;
      }
    }
    const result = await fetchFile(GITHUB_CONFIG.usersFile);
    cache.users = result;
    ssCacheSave(SS_CACHE_USERS, result);
    return result.content;
  }

  /**
   * data.json を更新する(SHAコンフリクト時は1回再取得してリトライ)
   * mutator(content) は content を受け取り、変更後の content を返す。
   */
  async function updateData(mutator, commitMessage) {
    if (!cache.data) await loadData();

    let attempts = 0;
    const MAX_ATTEMPTS = 2;
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      const current = cache.data.content;
      const newContent = mutator(JSON.parse(JSON.stringify(current)));
      newContent.lastModifiedAt = new Date().toISOString();
      newContent.lastModifiedBy = getCurrentOperatorDisplayName() || 'unknown';

      try {
        const { sha } = await saveFile(
          GITHUB_CONFIG.dataFile,
          newContent,
          cache.data.sha,
          commitMessage || 'Update data.json'
        );
        cache.data = { content: newContent, sha };
        ssCacheSave(SS_CACHE_DATA, cache.data);
        return newContent;
      } catch (e) {
        if (e.message === 'SHA_CONFLICT' && attempts < MAX_ATTEMPTS) {
          // 最新を取り直してリトライ
          await loadData(true);
          continue;
        }
        throw e;
      }
    }
  }

  /**
   * users.json を更新する(SHAコンフリクト時は1回再取得してリトライ)
   */
  async function updateUsers(mutator, commitMessage) {
    if (!cache.users) await loadUsers();

    let attempts = 0;
    const MAX_ATTEMPTS = 2;
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      const current = cache.users.content;
      const newContent = mutator(JSON.parse(JSON.stringify(current)));

      try {
        const { sha } = await saveFile(
          GITHUB_CONFIG.usersFile,
          newContent,
          cache.users.sha,
          commitMessage || 'Update users.json'
        );
        cache.users = { content: newContent, sha };
        ssCacheSave(SS_CACHE_USERS, cache.users);
        return newContent;
      } catch (e) {
        if (e.message === 'SHA_CONFLICT' && attempts < MAX_ATTEMPTS) {
          await loadUsers(true);
          continue;
        }
        throw e;
      }
    }
  }

  // ------------------------------------------------------------------
  // 担当者(オペレーター)関連
  // ------------------------------------------------------------------

  function getCurrentOperatorDisplayName() {
    const email = getOperatorEmail();
    if (!email || !cache.users) return null;
    const user = (cache.users.content.users || []).find(u => u.email === email);
    return user ? user.displayName : email;
  }

  function getCurrentOperator() {
    const email = getOperatorEmail();
    if (!email || !cache.users) return null;
    const user = (cache.users.content.users || []).find(u => u.email === email);
    return user || null;
  }

  function isSuperAdmin(email) {
    return (email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
  }

  function canManageUsers(operatorEmail) {
    if (!cache.users) return false;
    const op = (cache.users.content.users || []).find(u => u.email === operatorEmail);
    if (!op) return false;
    return op.role === 'super_admin' || op.role === 'admin';
  }

  function canEditUser(operatorEmail, targetEmail) {
    if (!canManageUsers(operatorEmail)) return false;
    // 絶対管理者は誰でも操作可能(自分以外)
    if (isSuperAdmin(operatorEmail)) {
      return targetEmail !== operatorEmail; // 自分自身は編集不可
    }
    // 通常 admin は絶対管理者を操作不可
    if (isSuperAdmin(targetEmail)) return false;
    return true;
  }

  // ------------------------------------------------------------------
  // 公開 API: SecureStore 互換
  // ------------------------------------------------------------------

  /**
   * 初期化: PAT を localStorage に保存し、data.json と users.json を読み込んで
   * ユーザー一覧を取得する。ログイン画面・担当者選択画面で使用。
   */
  async function authenticate(token) {
    setToken(token);
    try {
      // PAT が有効か検証するため両方ロード
      await loadUsers(true);
      await loadData(true);
      return cache.users.content.users || [];
    } catch (e) {
      // 認証失敗時はトークンをクリアしておく
      clearToken();
      throw e;
    }
  }

  /**
   * 担当者を選択(ヘッダーの「担当: ○○」表示用)
   */
  async function selectOperator(email) {
    if (!cache.users) await loadUsers();
    const user = (cache.users.content.users || []).find(u => u.email === email);
    if (!user) {
      throw new Error(`UNKNOWN_USER: ${email} は users.json に登録されていません`);
    }
    setOperatorEmail(email);
    return user;
  }

  function logout() {
    clearToken();
    setOperatorEmail(null);
    cache.data = null;
    cache.users = null;
    ssCacheClear();
  }

  // --- クライアント管理 -------------------------------------------------

  async function loadClients() {
    const data = await loadData();
    return data.clients || [];
  }

  async function addClient(client) {
    if (!client || !client.name) {
      throw new Error('client.name は必須です');
    }
    return updateData(content => {
      content.clients = content.clients || [];
      // ID が指定されていなければ自動採番(本番 settings.html 用)
      let id = client.id;
      if (!id) {
        const slug = String(client.name).toLowerCase()
          .replace(/[^\w]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 30) || 'client';
        let candidate = `cli_${slug}_${Date.now().toString(36)}`;
        // 念のため重複回避
        let counter = 1;
        while (content.clients.find(c => c.id === candidate)) {
          candidate = `cli_${slug}_${Date.now().toString(36)}_${counter++}`;
        }
        id = candidate;
      } else {
        const exists = content.clients.find(c => c.id === client.id);
        if (exists) {
          throw new Error(`クライアント ${client.id} は既に存在します`);
        }
      }
      content.clients.push({
        id,
        name: client.name,
        createdAt: client.createdAt || new Date().toISOString(),
        ...client,
        id  // 確定 ID で上書き
      });
      return content;
    }, `Add client: ${client.name}`);
  }

  async function updateClient(clientId, updates) {
    if (!clientId) throw new Error('clientId は必須です');
    return updateData(content => {
      content.clients = content.clients || [];
      const idx = content.clients.findIndex(c => c.id === clientId);
      if (idx < 0) throw new Error(`クライアント ${clientId} が見つかりません`);
      content.clients[idx] = {
        ...content.clients[idx],
        ...updates,
        id: clientId,  // ID は変更不可
        updatedAt: new Date().toISOString()
      };
      return content;
    }, `Update client: ${clientId}`);
  }

  async function deleteClient(clientId) {
    return updateData(content => {
      content.clients = (content.clients || []).filter(c => c.id !== clientId);
      if (content.history && content.history[clientId]) {
        delete content.history[clientId];
      }
      return content;
    }, `Delete client: ${clientId}`);
  }

  // --- 取込履歴 ---------------------------------------------------------

  /**
   * 履歴1件追加(最大5件まで保持)
   * @param {string} clientId
   * @param {string} sourceId
   * @param {string[]} keys 重複チェック用キー
   * @param {number} count 取込件数
   * @param {object} options { newCount, dupCount, csv, filename, totalCount }
   */
  async function appendHistory(clientId, sourceId, keys, count, options) {
    options = options || {};
    const operator = getCurrentOperator();
    const entry = {
      processedAt: new Date().toISOString(),
      operatorName: operator ? operator.displayName : (getOperatorEmail() || 'unknown'),
      operatorEmail: getOperatorEmail() || 'unknown',
      totalCount: options.totalCount != null ? options.totalCount : count,
      newCount: options.newCount != null ? options.newCount : count,
      dupCount: options.dupCount != null ? options.dupCount : 0,
      keys: keys || [],
      csv: options.csv || '',
      filename: options.filename || ''
    };

    return updateData(content => {
      content.history = content.history || {};
      content.history[clientId] = content.history[clientId] || {};
      content.history[clientId][sourceId] = content.history[clientId][sourceId] || [];

      // 新しいものを先頭に追加し、5件超過分を切り捨て
      content.history[clientId][sourceId].unshift(entry);
      if (content.history[clientId][sourceId].length > MAX_HISTORY_PER_SOURCE) {
        content.history[clientId][sourceId] = content.history[clientId][sourceId].slice(0, MAX_HISTORY_PER_SOURCE);
      }
      return content;
    }, `Append history: ${clientId}/${sourceId} (+${entry.newCount})`);
  }

  /**
   * 重複チェック用の既知キーを集合で返す
   */
  async function getKnownKeys(clientId, sourceId) {
    const data = await loadData();
    const list = ((data.history || {})[clientId] || {})[sourceId] || [];
    const set = new Set();
    list.forEach(entry => {
      (entry.keys || []).forEach(k => set.add(k));
    });
    return set;
  }

  /**
   * 全クライアント横断・全媒体の履歴を SecureStore 互換のオブジェクト形式で返す
   * 形式: { clientId: { sourceId: [entry, entry, ...] } }
   * 各 entry は時系列降順(新しい順)で格納されている。
   */
  async function getAllHistory() {
    const data = await loadData();
    return data.history || {};
  }

  /**
   * 全クライアント横断・全媒体の履歴をフラット配列で返す(時系列降順)
   * settings.html の取込履歴一覧表示用。
   */
  async function getAllHistoryFlat() {
    const data = await loadData();
    const clients = data.clients || [];
    const history = data.history || {};
    const all = [];

    Object.keys(history).forEach(clientId => {
      const client = clients.find(c => c.id === clientId);
      const clientName = client ? client.name : clientId;
      Object.keys(history[clientId] || {}).forEach(sourceId => {
        (history[clientId][sourceId] || []).forEach(entry => {
          all.push({
            ...entry,
            clientId,
            clientName,
            sourceId
          });
        });
      });
    });

    all.sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''));
    return all;
  }

  /**
   * 履歴1件を削除(processedAt で識別)
   */
  async function deleteHistoryEntry(clientId, sourceId, processedAt) {
    return updateData(content => {
      const list = ((content.history || {})[clientId] || {})[sourceId];
      if (!list) return content;
      content.history[clientId][sourceId] = list.filter(e => e.processedAt !== processedAt);
      return content;
    }, `Delete history: ${clientId}/${sourceId}/${processedAt}`);
  }

  // --- CSV変換済み行ハッシュ(全件・永続) ---------------------------------
  // 新設計: CSVに出力した行の SHA-256 ハッシュを蓄積し、過去の取込みを永久に
  //         覚えておく。これにより「過去5件より前」のデータも重複扱いできる。
  //         data.json 内に exportedHashes として保存。
  //         構造: { exportedHashes: { [clientId]: { [sourceId]: [hash, hash, ...] } } }

  /**
   * CSV変換済みハッシュをSetで返す(指定クライアント+媒体)
   */
  async function getExportedHashes(clientId, sourceId) {
    const data = await loadData();
    const list = ((data.exportedHashes || {})[clientId] || {})[sourceId] || [];
    return new Set(list);
  }

  /**
   * CSV変換済みハッシュを追記
   * @param {string} clientId
   * @param {string} sourceId
   * @param {string[]} hashes 追加するハッシュの配列(重複は自動除外)
   */
  async function appendExportedHashes(clientId, sourceId, hashes) {
    if (!hashes || hashes.length === 0) return;
    return updateData(content => {
      content.exportedHashes = content.exportedHashes || {};
      content.exportedHashes[clientId] = content.exportedHashes[clientId] || {};
      const existing = content.exportedHashes[clientId][sourceId] || [];
      const existingSet = new Set(existing);
      const merged = existing.slice();
      for (const h of hashes) {
        if (!existingSet.has(h)) {
          merged.push(h);
          existingSet.add(h);
        }
      }
      content.exportedHashes[clientId][sourceId] = merged;
      return content;
    }, `Append exported hashes: ${clientId}/${sourceId} (+${hashes.length})`);
  }

  /**
   * 統計用:クライアント+媒体ごとの変換済み件数を返す
   */
  async function getExportedCount(clientId, sourceId) {
    const data = await loadData();
    const list = ((data.exportedHashes || {})[clientId] || {})[sourceId] || [];
    return list.length;
  }

  /**
   * 統計用:クライアント全体(全媒体)の変換済み件数を返す
   */
  async function getExportedCountForClient(clientId) {
    const data = await loadData();
    const sources = (data.exportedHashes || {})[clientId] || {};
    let total = 0;
    Object.values(sources).forEach(list => { total += (list || []).length; });
    return total;
  }

  // --- ユーザー(担当者)管理 -------------------------------------------

  async function loadUserList() {
    const users = await loadUsers();
    return users.users || [];
  }

  async function addUser(newUser) {
    const operator = getOperatorEmail();
    if (!canManageUsers(operator)) {
      throw new Error('PERMISSION_DENIED: 担当者管理は管理者のみ可能です');
    }
    if (!newUser.email || !newUser.displayName) {
      throw new Error('email と displayName は必須です');
    }
    if (newUser.role === 'super_admin' && !isSuperAdmin(newUser.email)) {
      throw new Error('super_admin ロールは固定の絶対管理者にのみ付与されます');
    }

    return updateUsers(content => {
      content.users = content.users || [];
      const exists = content.users.find(u => u.email === newUser.email);
      if (exists) {
        throw new Error(`${newUser.email} は既に登録されています`);
      }
      content.users.push({
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role || 'admin',
        addedAt: new Date().toISOString(),
        addedBy: operator
      });
      return content;
    }, `Add user: ${newUser.displayName}`);
  }

  async function updateUserRole(targetEmail, newRole) {
    const operator = getOperatorEmail();
    if (!canEditUser(operator, targetEmail)) {
      throw new Error('PERMISSION_DENIED: このユーザーを編集する権限がありません');
    }
    if (newRole === 'super_admin') {
      throw new Error('super_admin への昇格はコード固定のため変更不可です');
    }
    if (isSuperAdmin(targetEmail)) {
      throw new Error('絶対管理者のロールは変更できません');
    }
    if (!['admin', 'member'].includes(newRole)) {
      throw new Error('role は admin か member のみ指定可能です');
    }

    return updateUsers(content => {
      const user = (content.users || []).find(u => u.email === targetEmail);
      if (!user) throw new Error(`${targetEmail} が見つかりません`);
      user.role = newRole;
      user.updatedAt = new Date().toISOString();
      user.updatedBy = operator;
      return content;
    }, `Update role: ${targetEmail} -> ${newRole}`);
  }

  async function deleteUser(targetEmail) {
    const operator = getOperatorEmail();
    if (!canEditUser(operator, targetEmail)) {
      throw new Error('PERMISSION_DENIED: このユーザーを削除する権限がありません');
    }
    if (isSuperAdmin(targetEmail)) {
      throw new Error('絶対管理者は削除できません');
    }

    return updateUsers(content => {
      content.users = (content.users || []).filter(u => u.email !== targetEmail);
      return content;
    }, `Delete user: ${targetEmail}`);
  }

  // ------------------------------------------------------------------
  // エクスポート
  // ------------------------------------------------------------------
  global.GitHubStore = {
    // 設定
    SUPER_ADMIN_EMAIL,
    config: GITHUB_CONFIG,

    // 認証・セッション
    authenticate,
    selectOperator,
    logout,
    getToken,
    setToken,
    clearToken,
    getOperatorEmail,
    getCurrentOperator,
    isSuperAdmin,
    canManageUsers,
    canEditUser,

    // データロード
    loadData,
    loadUsers,

    // SecureStore 互換 API
    loadClients,
    addClient,
    updateClient,
    deleteClient,
    appendHistory,
    getKnownKeys,
    getAllHistory,
    getAllHistoryFlat,
    deleteHistoryEntry,

    // CSV変換済みハッシュ(新設計)
    getExportedHashes,
    appendExportedHashes,
    getExportedCount,
    getExportedCountForClient,

    // ユーザー管理
    loadUserList,
    addUser,
    updateUserRole,
    deleteUser
  };

  // SecureStore 互換エイリアス
  // 本番の index.html / settings.html(既存版)は SecureStore.xxx() を呼んでいるため、
  // それらを書き換えずに動かすために GitHubStore と同じ実体を SecureStore としてもエクスポートする。
  global.SecureStore = global.GitHubStore;

  // Auth 互換オブジェクト
  // 本番の index.html は `Auth.requireLogin()` `Auth.getCurrentUserId()` `Auth.clearSession()` を呼ぶ。
  // 新システムでは認証チェックは header-bar.js が代行するため、ここでは互換 API だけ提供する。
  global.Auth = {
    /**
     * ログイン要求(互換):
     * 新システム(Firebase認証):
     * - 認証チェックは firebase-auth.js が担当
     * - ここでは PAT があるかだけチェック(PAT 必須)
     * - PAT がなければ setup.html へ
     */
    requireLogin: function () {
      const token = localStorage.getItem('importcore.github.pat');
      if (!token) {
        location.href = 'setup.html';
        return false;
      }
      return true;
    },

    /**
     * 現在のユーザーID(互換):
     * 旧 Auth.getCurrentUserId() はメールを返していた。新システムでは表示名を返したいので、
     * GitHubStore のキャッシュからユーザーを引き出す。未ロード時はメールを返す(後で
     * header-bar.js のキャッシュロードで更新される)。
     */
    getCurrentUserId: function () {
      const op = global.GitHubStore && global.GitHubStore.getCurrentOperator
        ? global.GitHubStore.getCurrentOperator()
        : null;
      if (op && op.displayName) return op.displayName;
      return localStorage.getItem('importcore.operator.email') || '';
    },

    /**
     * セッション破棄(互換):
     * 新システムでは window.logout() (Firebase 経由) が正規ルート。
     * 互換のため localStorage から担当者情報を消す程度。
     */
    clearSession: function () {
      localStorage.removeItem('importcore.operator.email');
      // Firebase のログアウトもしたい場合は window.logout() を呼ぶ
      if (typeof global.logout === 'function') {
        global.logout();
      }
    },

    /**
     * 完全ログアウト(互換):
     * PAT も含めて全部削除したい場合用。互換性のため別名でも提供。
     */
    fullLogout: function () {
      if (global.GitHubStore && global.GitHubStore.logout) {
        global.GitHubStore.logout();
      } else {
        localStorage.removeItem('importcore.github.pat');
        localStorage.removeItem('importcore.operator.email');
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
