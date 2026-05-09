/**
 * Import Core - UX Helper
 *   - ローディングマスク(セクション内、コアラ浮遊型)
 *   - sessionStorage キャッシュ(タブ遷移高速化)
 *   - プリフェッチ
 */
(function(global){
  'use strict';

  // ============================================
  //   1. ローディングマスク (案C: コアラ浮遊型)
  // ============================================
  //
  // 使い方:
  //   const lock = LoadingMask.show(element, '読み込み中', '取込履歴を更新しています');
  //   ...await someAsyncWork();
  //   lock.hide();
  //
  //   または withMask ヘルパー:
  //   await LoadingMask.wrap(element, '読み込み中', async () => { ...処理... });

  const LOADING_STYLE_ID = '__importcore_loading_style__';

  function ensureStyles(){
    if (document.getElementById(LOADING_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = LOADING_STYLE_ID;
    style.textContent = `
      .ic-loading-host {
        position: relative !important;
      }
      .ic-loading-host > .ic-mask-content-wrap {
        filter: grayscale(60%) blur(1px) opacity(0.55);
        transition: filter 0.2s;
        pointer-events: none;
      }
      .ic-loading-mask {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 50;
        pointer-events: none;
        animation: ic-mask-fade-in 0.18s ease;
      }
      @keyframes ic-mask-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .ic-mask-pill {
        background: #ffffff;
        padding: 12px 18px;
        border-radius: 999px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.12);
        display: flex;
        align-items: center;
        gap: 12px;
        border: 1px solid rgba(167, 243, 208, 0.6); /* mint-200 */
        max-width: calc(100% - 32px);
      }
      .ic-mask-koala {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #ecfdf5, #ffffff);
        border-radius: 50%;
        border: 2px solid #6ee7b7;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        animation: ic-koala-bounce 1.4s ease-in-out infinite;
      }
      .ic-mask-koala img {
        width: 32px;
        height: 32px;
        object-fit: contain;
      }
      @keyframes ic-koala-bounce {
        0%, 100% { transform: translateY(0) rotate(-3deg); }
        50% { transform: translateY(-5px) rotate(3deg); }
      }
      .ic-mask-text-main {
        font-weight: 700;
        color: #047857;
        font-size: 14px;
        line-height: 1.3;
      }
      .ic-mask-text-sub {
        font-size: 11px;
        color: #6b7280;
        margin-top: 2px;
        line-height: 1.3;
      }
      .ic-mask-dots::after {
        content: '';
        display: inline-block;
        width: 18px;
        text-align: left;
        animation: ic-dot 1.5s steps(4) infinite;
      }
      @keyframes ic-dot {
        0% { content: ''; }
        25% { content: '.'; }
        50% { content: '..'; }
        75% { content: '...'; }
        100% { content: ''; }
      }
      /* トースト型(右上、軽い操作向け) */
      .ic-toast {
        position: fixed;
        top: 18px;
        right: 18px;
        background: #fff;
        border-radius: 999px;
        padding: 8px 14px 8px 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        border: 1px solid rgba(167, 243, 208, 0.6);
        z-index: 9999;
        animation: ic-toast-in 0.25s ease;
        font-size: 13px;
      }
      @keyframes ic-toast-in {
        from { transform: translateX(20px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .ic-toast-out {
        animation: ic-toast-out 0.25s ease forwards !important;
      }
      @keyframes ic-toast-out {
        to { transform: translateX(20px); opacity: 0; }
      }
      .ic-toast .ic-mask-koala {
        width: 28px;
        height: 28px;
      }
      .ic-toast .ic-mask-koala img {
        width: 22px;
        height: 22px;
      }
      .ic-toast-text {
        font-weight: 700;
        color: #047857;
      }
    `;
    document.head.appendChild(style);
  }

  // コアラ画像を選ぶ(操作の重さで使い分け)
  function pickKoala(weight){
    // weight: 'heavy' (取込みなど) | 'normal' (削除/追加) | 'light'
    if (weight === 'heavy') return 'assets/koala-pc.png';
    if (weight === 'light') return 'assets/koala-thumb.png';
    return 'assets/koala-pc.png'; // デフォルト
  }

  /**
   * セクション内ローディング(マスク)を表示
   * @param {HTMLElement} hostEl - マスクをかける対象の要素(カード等)
   * @param {string} mainText - 「読み込み中」など
   * @param {string} subText - 補助テキスト(任意)
   * @param {string} weight - 'heavy' | 'normal' | 'light'
   * @returns {{hide: ()=>void}}
   */
  function showMask(hostEl, mainText, subText, weight){
    if (!hostEl) return { hide: () => {} };
    ensureStyles();

    // 既存マスクがあれば削除(連続呼び出し対策)
    const existing = hostEl.querySelector(':scope > .ic-loading-mask');
    if (existing) existing.remove();

    // 中身を wrap で囲む(初回のみ)
    if (!hostEl.querySelector(':scope > .ic-mask-content-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'ic-mask-content-wrap';
      while (hostEl.firstChild) wrap.appendChild(hostEl.firstChild);
      hostEl.appendChild(wrap);
    }

    hostEl.classList.add('ic-loading-host');

    const mask = document.createElement('div');
    mask.className = 'ic-loading-mask';
    const koalaSrc = pickKoala(weight || 'normal');
    mask.innerHTML = `
      <div class="ic-mask-pill">
        <div class="ic-mask-koala">
          <img src="${koalaSrc}" alt="" onerror="this.style.display='none';this.parentNode.textContent='🐨';this.parentNode.style.fontSize='20px'">
        </div>
        <div>
          <div class="ic-mask-text-main">${escapeHtml(mainText || '読み込み中')}<span class="ic-mask-dots"></span></div>
          ${subText ? `<div class="ic-mask-text-sub">${escapeHtml(subText)}</div>` : ''}
        </div>
      </div>
    `;
    hostEl.appendChild(mask);

    return {
      hide: () => {
        try {
          mask.remove();
          // 他にマスクが残っていなければ wrap を解除
          if (!hostEl.querySelector(':scope > .ic-loading-mask')) {
            hostEl.classList.remove('ic-loading-host');
            const wrap = hostEl.querySelector(':scope > .ic-mask-content-wrap');
            if (wrap) {
              while (wrap.firstChild) hostEl.appendChild(wrap.firstChild);
              wrap.remove();
            }
          }
        } catch(e){ /* 既に削除済み */ }
      }
    };
  }

  /**
   * 軽い操作向けトースト表示(画面右上)
   * @returns {{hide: ()=>void}}
   */
  function showToast(text, weight){
    ensureStyles();
    const koalaSrc = pickKoala(weight || 'light');
    const el = document.createElement('div');
    el.className = 'ic-toast';
    el.innerHTML = `
      <div class="ic-mask-koala">
        <img src="${koalaSrc}" alt="" onerror="this.style.display='none';this.parentNode.textContent='🐨';this.parentNode.style.fontSize='14px'">
      </div>
      <div class="ic-toast-text">${escapeHtml(text)}<span class="ic-mask-dots"></span></div>
    `;
    document.body.appendChild(el);
    return {
      hide: () => {
        try {
          el.classList.add('ic-toast-out');
          setTimeout(() => el.remove(), 250);
        } catch(e){}
      }
    };
  }

  /**
   * 非同期処理をマスク付きで実行するヘルパー
   * @param {HTMLElement} hostEl
   * @param {string} mainText
   * @param {Function} asyncFn
   * @param {object} options - { subText, weight }
   */
  async function wrapMask(hostEl, mainText, asyncFn, options){
    options = options || {};
    const lock = showMask(hostEl, mainText, options.subText, options.weight);
    try {
      return await asyncFn();
    } finally {
      lock.hide();
    }
  }

  /**
   * 完了トースト(成功/失敗の結果通知、3秒で消える)
   */
  function showResult(text, type){
    // 軽量にinline alert風表示
    ensureStyles();
    const el = document.createElement('div');
    el.className = 'ic-toast';
    el.style.borderColor = type === 'error' ? '#fca5a5' : '#a7f3d0';
    const icon = type === 'error' ? '⚠️' : '✓';
    const color = type === 'error' ? '#b91c1c' : '#047857';
    el.innerHTML = `
      <div style="font-size:18px;color:${color};font-weight:700;width:24px;text-align:center">${icon}</div>
      <div class="ic-toast-text" style="color:${color}">${escapeHtml(text)}</div>
    `;
    document.body.appendChild(el);
    setTimeout(() => {
      el.classList.add('ic-toast-out');
      setTimeout(() => el.remove(), 250);
    }, 2500);
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }

  // 公開API
  global.LoadingMask = {
    show: showMask,
    showToast: showToast,
    showResult: showResult,
    wrap: wrapMask
  };

  // ============================================
  //   2. sessionStorage キャッシュ
  // ============================================
  //
  // GitHub APIの結果をブラウザのsessionStorageに保存。
  // タブ遷移後の戻りで即座に表示できる。
  // データの鮮度は max 60秒。それ以上経ったら破棄して再取得。

  const CACHE_PREFIX = 'importcore.cache.';
  const CACHE_TTL_MS = 60 * 1000; // 60秒

  function cacheGet(key){
    try {
      const raw = sessionStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts) return null;
      if (Date.now() - obj.ts > CACHE_TTL_MS) {
        sessionStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return obj.value;
    } catch(e) { return null; }
  }

  function cacheSet(key, value){
    try {
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        ts: Date.now(),
        value: value
      }));
    } catch(e) { /* quota exceeded などは無視 */ }
  }

  function cacheClear(keyOrPrefix){
    try {
      if (!keyOrPrefix) {
        // 全体クリア
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
        }
        keys.forEach(k => sessionStorage.removeItem(k));
      } else {
        // 個別 or プレフィックス
        const fullKey = CACHE_PREFIX + keyOrPrefix;
        if (sessionStorage.getItem(fullKey) !== null) {
          sessionStorage.removeItem(fullKey);
        } else {
          // プレフィックス削除
          const keys = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith(fullKey)) keys.push(k);
          }
          keys.forEach(k => sessionStorage.removeItem(k));
        }
      }
    } catch(e){}
  }

  global.UICache = {
    get: cacheGet,
    set: cacheSet,
    clear: cacheClear,
  };

})(window);
