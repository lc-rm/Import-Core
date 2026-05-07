// =====================================================================
//  認証 & データ暗号化
//  ---------------------------------------------------------------------
//  - ユーザー(ID/PW)を localStorage に保存(PWはハッシュ化)
//  - クライアント情報・履歴データはログインPWで暗号化して保存
//  - ログインしないと画面に入れない
//  - ログイン状態はsessionStorageに保持(ブラウザを閉じると消える)
//
//  使用技術: Web Crypto API (PBKDF2 + AES-GCM) - すべての主要ブラウザで標準対応
// =====================================================================

const LS_USERS = 'ic_users_v1';
const LS_ENC_DATA = 'ic_encdata_v1';
const SS_AUTH = 'ic_auth';

// ----- 文字列とArrayBufferの変換 -----
const enc = new TextEncoder();
const dec = new TextDecoder();

function bufToB64(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64){
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

// ----- パスワードからキーを派生 (PBKDF2) -----
async function deriveKey(password, salt){
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ----- パスワードのハッシュ化(認証用、復号には使わない) -----
// PBKDF2 で deriveBits を使って固定長のハッシュを得る(ソルト付き)
async function hashPassword(password, salt){
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    256
  );
  return bufToB64(bits);
}

// ----- データ暗号化/復号 -----
async function encryptData(plaintext, password){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return {
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    data: bufToB64(ciphertext)
  };
}

async function decryptData(encObj, password){
  const salt = new Uint8Array(b64ToBuf(encObj.salt));
  const iv = new Uint8Array(b64ToBuf(encObj.iv));
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    b64ToBuf(encObj.data)
  );
  return dec.decode(plaintext);
}

// =====================================================================
//  Auth API
// =====================================================================
const Auth = {
  // ---- ユーザー管理 ----
  loadUsers(){
    try {
      const raw = localStorage.getItem(LS_USERS);
      return raw ? JSON.parse(raw) : [];
    } catch(e){ return []; }
  },
  saveUsers(list){
    localStorage.setItem(LS_USERS, JSON.stringify(list));
  },

  async addUser(userId, password){
    const users = Auth.loadUsers();
    if (users.some(u => u.userId === userId)){
      throw new Error('同じIDのユーザーが既に存在します');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPassword(password, salt);
    users.push({
      userId,
      salt: bufToB64(salt),
      hash,
      createdAt: new Date().toISOString()
    });
    Auth.saveUsers(users);
    return true;
  },

  async deleteUser(userId){
    const users = Auth.loadUsers().filter(u => u.userId !== userId);
    Auth.saveUsers(users);
  },

  async changePassword(userId, oldPw, newPw){
    const ok = await Auth.verify(userId, oldPw);
    if (!ok) throw new Error('現在のパスワードが違います');

    // 既存の暗号化データを旧PWで復号 → 新PWで再暗号化
    const users = Auth.loadUsers();
    const enc = localStorage.getItem(LS_ENC_DATA);
    let plaintext = null;
    if (enc){
      try {
        plaintext = await decryptData(JSON.parse(enc), oldPw);
      } catch(e){ /* データなし or 別PWで暗号化されていた */ }
    }

    // 新しいPWでユーザーを更新
    const u = users.find(x => x.userId === userId);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    u.salt = bufToB64(salt);
    u.hash = await hashPassword(newPw, salt);
    Auth.saveUsers(users);

    if (plaintext !== null){
      const reEnc = await encryptData(plaintext, newPw);
      localStorage.setItem(LS_ENC_DATA, JSON.stringify(reEnc));
    }
  },

  async verify(userId, password){
    const users = Auth.loadUsers();
    const u = users.find(x => x.userId === userId);
    if (!u) return false;
    const salt = new Uint8Array(b64ToBuf(u.salt));
    const hash = await hashPassword(password, salt);
    return hash === u.hash;
  },

  // ---- ログインセッション ----
  // sessionStorage に「現在のユーザーIDとPW」を保持
  // (ブラウザを閉じると消える → 毎回ログイン)
  setSession(userId, password){
    sessionStorage.setItem(SS_AUTH, JSON.stringify({ userId, password }));
  },
  getSession(){
    try {
      const raw = sessionStorage.getItem(SS_AUTH);
      return raw ? JSON.parse(raw) : null;
    } catch(e){ return null; }
  },
  clearSession(){
    sessionStorage.removeItem(SS_AUTH);
  },
  getCurrentUserId(){
    const s = Auth.getSession();
    return s ? s.userId : null;
  },
  isLoggedIn(){
    return Auth.getSession() !== null;
  },

  // ---- ログイン必須チェック(各画面の冒頭で呼ぶ) ----
  requireLogin(){
    if (!Auth.isLoggedIn()){
      // 初回起動時(ユーザー未登録)はsetup画面、それ以外はlogin画面へ
      const users = Auth.loadUsers();
      if (users.length === 0){
        location.href = 'setup.html';
      } else {
        location.href = 'login.html';
      }
      return false;
    }
    return true;
  },

  // ---- 暗号化データのストレージ ----
  // SecureStore.load() / save() でアプリデータを読み書き
  // 中身は「{clients:[], history:{}}」のような構造
  async loadAppData(){
    const session = Auth.getSession();
    if (!session) throw new Error('未ログイン');
    const raw = localStorage.getItem(LS_ENC_DATA);
    if (!raw) return { clients: [], history: {} };
    try {
      const plaintext = await decryptData(JSON.parse(raw), session.password);
      return JSON.parse(plaintext);
    } catch(e){
      // 復号失敗 → 空データを返す(初回など)
      console.warn('Failed to decrypt, returning empty:', e.message);
      return { clients: [], history: {} };
    }
  },

  async saveAppData(data){
    const session = Auth.getSession();
    if (!session) throw new Error('未ログイン');
    const plaintext = JSON.stringify(data);
    const enc = await encryptData(plaintext, session.password);
    localStorage.setItem(LS_ENC_DATA, JSON.stringify(enc));
  },

  // ---- バックアップ/復元 ----
  async exportBackup(){
    const data = await Auth.loadAppData();
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      data
    };
  },

  async importBackup(backup){
    if (!backup || (backup.version !== 2 && backup.version !== 1)){
      throw new Error('対応していない形式のバックアップです');
    }
    let data;
    if (backup.version === 1){
      // v1 (旧形式) → 変換
      data = {
        clients: backup.clients || [],
        history: backup.history || {}
      };
    } else {
      data = backup.data;
    }
    await Auth.saveAppData(data);
  }
};

// =====================================================================
//  SecureStore: 既存コードから使いやすいAPI
//  Storeは converter.js で localStorage 直接アクセスだったが、
//  ログイン後はこちらを経由して暗号化データを読み書きする
// =====================================================================
let _appDataCache = null;

const SecureStore = {
  async _get(){
    if (_appDataCache) return _appDataCache;
    _appDataCache = await Auth.loadAppData();
    if (!_appDataCache.clients) _appDataCache.clients = [];
    if (!_appDataCache.history) _appDataCache.history = {};
    return _appDataCache;
  },

  async _save(){
    if (_appDataCache){
      await Auth.saveAppData(_appDataCache);
    }
  },

  invalidate(){ _appDataCache = null; },

  // ---- クライアント ----
  async loadClients(){
    const d = await SecureStore._get();
    return d.clients;
  },
  async addClient(client){
    const d = await SecureStore._get();
    if (!client.id) client.id = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    d.clients.push(client);
    await SecureStore._save();
    return client;
  },
  async updateClient(id, patch){
    const d = await SecureStore._get();
    const i = d.clients.findIndex(c => c.id === id);
    if (i < 0) return null;
    d.clients[i] = { ...d.clients[i], ...patch };
    await SecureStore._save();
    return d.clients[i];
  },
  async deleteClient(id){
    const d = await SecureStore._get();
    d.clients = d.clients.filter(c => c.id !== id);
    delete d.history[id];
    await SecureStore._save();
  },

  // ---- 履歴 ----
  async getHistory(clientId, sourceId){
    const d = await SecureStore._get();
    return (d.history[clientId] && d.history[clientId][sourceId]) || [];
  },
  async getKnownKeys(clientId, sourceId){
    const entries = await SecureStore.getHistory(clientId, sourceId);
    const set = new Set();
    for (const e of entries){
      for (const k of (e.keys || [])) set.add(k);
    }
    return set;
  },
  async appendHistory(clientId, sourceId, keys, count){
    const d = await SecureStore._get();
    if (!d.history[clientId]) d.history[clientId] = {};
    if (!d.history[clientId][sourceId]) d.history[clientId][sourceId] = [];
    const entry = {
      processedAt: new Date().toISOString(),
      count,
      keys: Array.from(new Set(keys))
    };
    d.history[clientId][sourceId].unshift(entry);
    if (d.history[clientId][sourceId].length > 5){
      d.history[clientId][sourceId] = d.history[clientId][sourceId].slice(0, 5);
    }
    await SecureStore._save();
  },
  async clearHistory(clientId, sourceId){
    const d = await SecureStore._get();
    if (d.history[clientId]) delete d.history[clientId][sourceId];
    await SecureStore._save();
  },
  async getAllHistory(){
    const d = await SecureStore._get();
    return d.history;
  }
};
