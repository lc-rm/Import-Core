// =====================================================================
// Import Core - Indeed 応募者ページ取込ブックマークレット
// ---------------------------------------------------------------------
// Indeed Employer の応募者詳細ページで実行すると、必要な情報を抽出して
// クリップボードにJSONコピー + アラート表示する
// =====================================================================
(function(){
  'use strict';

  // URL チェック(Indeed応募者ページ以外で動かないように)
  if (!location.hostname.includes('employers.indeed.com') ||
      !location.pathname.includes('/candidates/view')){
    alert('このブックマークレットは Indeed Employer の応募者詳細ページで使用してください。\n\n現在のURL:\n' + location.href);
    return;
  }

  try {
    const data = extractIndeedApplicant(document);

    // 必須項目チェック
    if (!data.name && !data.email && !data.phone){
      alert('応募者情報が見つかりませんでした。\nページを再読み込みしてから、応募者情報セクションが表示されている状態で再度クリックしてください。');
      return;
    }

    // クリップボードにコピー
    const json = JSON.stringify({
      _type: 'import-core-indeed',
      _version: 1,
      sourceUrl: location.href,
      capturedAt: new Date().toISOString(),
      data
    });

    copyToClipboard(json).then(() => {
      const summary =
        '✅ コピーしました!\n\n' +
        '名前: ' + (data.name || '(なし)') + '\n' +
        'メール: ' + (data.email || '(なし)') + '\n' +
        '電話: ' + (data.phone || '(なし)') + '\n' +
        '生年月日: ' + (data.birth || '(なし)') + '\n' +
        '応募職種: ' + (data.jobTitle || '(なし)') + '\n\n' +
        'Import Core の取込キュー画面に戻り、「クリップボードから追加」ボタンを押してください。';
      alert(summary);
    }).catch(err => {
      alert('コピーに失敗しました: ' + err.message);
    });

  } catch(err) {
    alert('エラーが発生しました:\n' + err.message);
    console.error('[ImportCore]', err);
  }

  // ===== クリップボードコピー =====
  function copyToClipboard(text){
    if (navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text);
    }
    // フォールバック
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand失敗'));
      } catch(e){ reject(e); }
    });
  }

  // ===== 抽出ロジック =====
  function extractIndeedApplicant(doc){
    function findApplicantInfoContainer(){
      const allH2 = Array.from(doc.querySelectorAll('h2'));
      const candidates = allH2.filter(h => (h.textContent || '').trim() === '応募者情報');
      for (const h of candidates){
        const parent = h.parentElement;
        if (parent && parent.children.length >= 5){
          return parent;
        }
      }
      return null;
    }

    function collectKeyValuePairs(container){
      const result = {};
      if (!container) return result;
      const children = Array.from(container.children);
      let i = 0;
      while (i < children.length){
        const el = children[i];
        const txt = (el.textContent || '').trim();
        const isLabel = (el.tagName === 'H2') && /[:：]$/.test(txt);
        if (isLabel){
          const label = txt.replace(/[:：]$/, '');
          const values = [];
          let j = i + 1;
          while (j < children.length){
            const next = children[j];
            const nt = (next.textContent || '')
              .replace(/&nbsp;/gi, '')
              .replace(/[\s\u00A0\u3000]/g, '');
            const isSeparator =
              (next.tagName === 'DIV' && nt === '') ||
              (next.getAttribute && next.getAttribute('role') === 'separator');
            if (isSeparator){ break; }
            if (next.tagName === 'H2' && /[:：]$/.test((next.textContent || '').trim())){ break; }
            values.push(next);
            j++;
          }
          result[label] = values;
          i = j;
        } else {
          i++;
        }
      }
      return result;
    }

    function textOf(elements){
      if (!elements || elements.length === 0) return '';
      return elements.map(e => (e.textContent || '').trim()).filter(Boolean).join(' ');
    }

    const container = findApplicantInfoContainer();
    const kv = collectKeyValuePairs(container);

    // 氏名・ふりがな
    const fullName = textOf(kv['姓名（ふりがな）'] || kv['姓名(ふりがな)']);
    let name = fullName, kana = '';
    const m = fullName.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/);
    if (m){ name = m[1].trim(); kana = m[2].trim(); }

    const phone = textOf(kv['電話番号']);
    const gender = textOf(kv['性別']);
    const birth = textOf(kv['生年月日']);

    // 住所
    let address = textOf(kv['住所']);
    address = address.replace(/〒(\d{3})(\d{4})/, '〒$1-$2');

    // メール: textノードからスキャン
    let email = '';
    const emails = [];
    const tw = doc.createTreeWalker(doc.body, 4); // SHOW_TEXT
    let node;
    while (node = tw.nextNode()){
      const t = node.nodeValue;
      if (!t) continue;
      const matches = t.match(/[A-Za-z0-9][A-Za-z0-9._-]*@indeedemail\.com/g);
      if (matches){
        for (const em of matches){
          if (!emails.includes(em)) emails.push(em);
        }
      }
    }
    email = emails[0] || '';

    // 応募職種・勤務地: 「Applied to:」の親要素から
    let jobTitle = '', location = '';
    doc.querySelectorAll('span').forEach(span => {
      if ((span.textContent || '').trim() === 'Applied to:'){
        const parent = span.parentElement;
        if (parent && !jobTitle){
          const fullText = parent.textContent.replace('Applied to:', '').trim();
          const parts = fullText.split(/[•・]/);
          jobTitle = (parts[0] || '').trim();
          location = (parts[1] || '').trim();
        }
      }
    });

    // 応募日
    let appliedDate = '';
    const strongs = doc.querySelectorAll('strong');
    for (const s of strongs){
      const t = (s.textContent || '').trim();
      const mm = t.match(/^(\d{4})年(\d+)月(\d+)日$/);
      if (mm){
        let p = s.parentElement;
        for (let d = 0; d < 5 && p; d++){
          if (p.textContent.includes('応募しました')){
            appliedDate = `${mm[1]}-${String(+mm[2]).padStart(2,'0')}-${String(+mm[3]).padStart(2,'0')}`;
            break;
          }
          p = p.parentElement;
        }
        if (appliedDate) break;
      }
    }

    return {
      name, kana, phone, gender, birth, address, email,
      jobTitle, location, appliedDate
    };
  }
})();
