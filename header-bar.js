(function () {
  'use strict';

  if (typeof window.GitHubStore === 'undefined') {
    console.warn('[header-bar] GitHubStore is not loaded. Include github-store.js first.');
    return;
  }

  if (document.getElementById('importcore-header-bar')) return;

  const fileName = (location.pathname.split('/').pop() || '').toLowerCase();
  if (fileName === 'login.html' ||
      fileName === 'operator-select.html' ||
      fileName === 'setup.html') {
    return;
  }

  const token = localStorage.getItem('importcore.github.pat');
  const operatorEmail = localStorage.getItem('importcore.operator.email');

  if (!token) {
    location.href = 'login.html';
    return;
  }
  if (!operatorEmail) {
    location.href = 'operator-select.html';
    return;
  }

  const style = document.createElement('style');
  style.textContent = `
    #importcore-header-bar {
      position: fixed;
      top: 14px;
      right: 16px;
      z-index: 9998;
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
    }
    #importcore-header-bar .ic-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px 7px 8px;
      background: rgba(255, 255, 255, 0.92);
      border: 1.5px solid #e0c89e;
      border-radius: 22px;
      font-size: 13px;
      color: #6b4a20;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(150, 100, 40, 0.12);
      transition: border-color 0.2s, background 0.2s;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    #importcore-header-bar .ic-badge:hover {
      border-color: #c98b3f;
      background: #fff;
    }
    #importcore-header-bar .ic-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: linear-gradient(135deg, #fbe6c0, #d4ad6a);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: #6b4a20;
    }
    #importcore-header-bar .ic-name {
      font-weight: 600;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #importcore-header-bar .ic-arrow {
      font-size: 10px;
      color: #8a7560;
    }
    #importcore-header-bar .ic-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 6px);
      background: #fff;
      border: 1px solid #e0c89e;
      border-radius: 12px;
      box-shadow: 0 6px 20px rgba(150, 100, 40, 0.18);
      min-width: 220px;
      overflow: hidden;
      display: none;
    }
    #importcore-header-bar .ic-menu.open { display: block; }
    #importcore-header-bar .ic-menu-item {
      padding: 10px 16px;
      font-size: 13px;
      color: #4a3520;
      cursor: pointer;
      transition: background 0.15s;
      border: 0;
      width: 100%;
      text-align: left;
      background: transparent;
      font-family: inherit;
    }
    #importcore-header-bar .ic-menu-item:hover {
      background: #fdf6e8;
    }
    #importcore-header-bar .ic-menu-item.danger {
      color: #a83838;
      border-top: 1px solid #f0e3cb;
    }
    #importcore-header-bar .ic-menu-info {
      padding: 10px 16px 8px;
      font-size: 11px;
      color: #8a7560;
      border-bottom: 1px solid #f0e3cb;
      line-height: 1.5;
    }
    #importcore-header-bar .ic-role-tag {
      display: inline-block;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 10px;
      margin-top: 4px;
      font-weight: 600;
    }
    #importcore-header-bar .ic-role-tag.super_admin {
      background: #fce8d2; color: #a8631e;
    }
    #importcore-header-bar .ic-role-tag.admin {
      background: #e3eef8; color: #2d5680;
    }
    #importcore-header-bar .ic-role-tag.member {
      background: #ebebe6; color: #5a5448;
    }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.id = 'importcore-header-bar';
  wrap.innerHTML = `
    <div class="ic-badge" id="ic-badge">
      <div class="ic-avatar" id="ic-avatar">?</div>
      <span class="ic-name" id="ic-name">読込中...</span>
      <span class="ic-arrow">▼</span>
    </div>
    <div class="ic-menu" id="ic-menu">
      <div class="ic-menu-info" id="ic-menu-info">
        <div id="ic-menu-email">—</div>
        <span class="ic-role-tag" id="ic-menu-role">—</span>
      </div>
      <button class="ic-menu-item" id="ic-switch">担当者を切り替え</button>
      <button class="ic-menu-item danger" id="ic-logout">ログアウト</button>
    </div>
  `;
  document.body.appendChild(wrap);

  async function refresh() {
    try {
      await GitHubStore.loadUsers();
      const op = GitHubStore.getCurrentOperator();
      if (!op) {
        location.href = 'operator-select.html';
        return;
      }
      const initial = (op.displayName || op.email || '?').trim().charAt(0);
      const roleLabel = op.role === 'super_admin' ? '絶対管理者'
                       : op.role === 'admin' ? '管理者'
                       : 'メンバー';

      document.getElementById('ic-avatar').textContent = initial;
      document.getElementById('ic-name').textContent = op.displayName || op.email;
      document.getElementById('ic-menu-email').textContent = op.email;
      const roleTag = document.getElementById('ic-menu-role');
      roleTag.textContent = roleLabel;
      roleTag.className = 'ic-role-tag ' + op.role;
    } catch (e) {
      console.error('[header-bar] failed to load operator:', e);
      if (/UNAUTHORIZED|FORBIDDEN|NOT_FOUND/.test(e.message)) {
        sessionStorage.setItem('importcore.force.login', '1');
        GitHubStore.logout();
        location.href = 'login.html';
      }
    }
  }
  refresh();

  const badge = document.getElementById('ic-badge');
  const menu = document.getElementById('ic-menu');

  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) menu.classList.remove('open');
  });

  document.getElementById('ic-switch').addEventListener('click', () => {
    localStorage.removeItem('importcore.operator.email');
    location.href = 'operator-select.html';
  });

  document.getElementById('ic-logout').addEventListener('click', () => {
    if (!confirm('ログアウトしますか?\n再度ログインするには ID とパスワードが必要です。')) return;
    // 担当者情報だけ消して、PAT は残す(初期設定済みの状態を保持)
    localStorage.removeItem('importcore.operator.email');
    sessionStorage.setItem('importcore.force.login', '1');
    location.href = 'login.html';
  });
})();
