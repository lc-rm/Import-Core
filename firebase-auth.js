/**
 * Import Core - Firebase Auth Guard
 *
 * 使い方:
 *   各保護ページの <head> 内で <script type="module" src="firebase-auth.js"></script> を読み込む
 *   認証OKの場合のみページが表示される
 *   未ログイン or ドメイン違反 → login.html へ強制リダイレクト
 *
 *   グローバル変数:
 *     window.currentUser = { uid, email, displayName, photoURL }
 *     window.logout()
 *
 *   イベント:
 *     'user-ready' — currentUser がセットされた直後に発火
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyABGLA8_0qREKGRbbe0XYja914Ojnd18ZA",
  authDomain: "import-core.firebaseapp.com",
  projectId: "import-core",
  storageBucket: "import-core.firebasestorage.app",
  messagingSenderId: "449866396771",
  appId: "1:449866396771:web:b342a84f66ec8307903456"
};

const ALLOWED_DOMAIN = "link-core.co.jp";
const LOGIN_PAGE = "./login.html";
const SETUP_PAGE = "./setup.html";

// 初期化(重複初期化を防ぐ)
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  // 既に初期化済みなら無視
}
const auth = getAuth();

// ページ全体を初期は隠す(認証確定までチラ見せ防止)
document.documentElement.style.visibility = 'hidden';

// 認証状態を監視
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // 未ログイン → ログインページへ
    window.location.href = LOGIN_PAGE;
    return;
  }
  const email = user.email || '';
  if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
    // ドメイン違反 → 強制ログアウト → ログインページへ
    signOut(auth).then(() => {
      window.location.href = LOGIN_PAGE;
    });
    return;
  }

  // PAT が localStorage にあるかチェック
  // (GitHub APIアクセスにはPATが必要なので、なければsetup.htmlへ)
  const pat = localStorage.getItem('importcore.github.pat');
  if (!pat) {
    // 例外:setup.html自体に居る時はリダイレクトしない
    if (!window.location.pathname.endsWith('setup.html')) {
      window.location.href = SETUP_PAGE;
      return;
    }
  }

  // 認証OK → ページを表示
  document.documentElement.style.visibility = 'visible';

  // グローバル変数にユーザー情報をセット
  window.currentUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL
  };

  // 担当者メアドを localStorage にも保存(github-store.js が参照する)
  localStorage.setItem('importcore.operator.email', user.email);

  // ヘッダーのアバター画像とユーザー名を自動でセット
  // (各ページで個別にコードを書かなくてもOK)
  try {
    const avatarEl = document.getElementById('userAvatar');
    const fallbackEl = document.getElementById('userAvatarFallback');
    if (avatarEl && user.photoURL) {
      avatarEl.src = user.photoURL;
      avatarEl.style.display = 'inline-block';
      if (fallbackEl) fallbackEl.style.display = 'none';
      // 画像読み込み失敗時はフォールバック復活
      avatarEl.onerror = () => {
        avatarEl.style.display = 'none';
        if (fallbackEl) fallbackEl.style.display = 'inline-block';
      };
    }
  } catch (e) { /* ignore */ }

  // ユーザー情報が取得できたことを他のスクリプトに知らせる
  window.dispatchEvent(new CustomEvent('user-ready', { detail: window.currentUser }));
});

// グローバルにログアウト関数を公開
window.logout = async function() {
  try {
    await signOut(auth);
    // localStorage は残す(PATを毎回入れ直すと面倒なので)
    // ただし担当者メアドはクリア
    localStorage.removeItem('importcore.operator.email');
  } catch (e) {
    console.error('ログアウトエラー:', e);
  }
  window.location.href = LOGIN_PAGE;
};
