// =====================================================================
//  共通ユーティリティ & 変換コア(マルチエンコード対応)
// =====================================================================

const TEMPLATE_HEADERS = [
  "応募日","求人番号","求人名称","応募職種","勤務地","部署",
  "名前","ふりがな","メール","電話","性別","生年","月","日",
  "媒体名","人材紹介会社","ステータス","採用可否","コンタクト日",
  "1次面接日時","1次面接結果","2次面接日時","2次面接結果",
  "退職日","書類URL","メモ"
];

// 新規取込時の固定ステータス
const FIXED_STATUS = '未対応';

// ----- 文字列処理ユーティリティ -----
const norm = v => v == null ? '' : String(v).trim();
const onlyDigits = v => norm(v).replace(/\D/g, '');

// 電話番号: +81 90 1234 5678 / 09012345678 / 7012345678(0落ち)などすべて対応
function formatPhone(v){
  let s = norm(v);
  if (!s) return '';
  // 先頭に「'」が付いている場合(Excel出力でよくある)
  if (s.startsWith("'")) s = s.slice(1);
  // +81 を 0 に変換
  s = s.replace(/^\+?81[\s-]?/, '0');
  let d = onlyDigits(s);
  if (!d) return '';
  // 0 落ちの補完
  if (d.length === 10 && /^[789]/.test(d)) d = '0' + d;
  else if (d.length === 9) d = '0' + d;
  if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0,2)}-${d.slice(2,6)}-${d.slice(6)}`;
  return s;
}

function ymdFromBirth(v){
  const s = norm(v);
  if (!s) return ['', '', ''];
  // 「1961年03月13日」「1961/03/13」「1961-03-13」「19610313」など対応
  const m = s.match(/(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})/);
  if (m) return [m[1], String(+m[2]), String(+m[3])];
  const d = onlyDigits(s);
  if (d.length >= 8) return [d.slice(0,4), String(+d.slice(4,6)), String(+d.slice(6,8))];
  return ['', '', ''];
}

function dateOnly(v){
  const s = norm(v);
  const m = s.match(/(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : s;
}

function splitBySlash(v){
  const s = norm(v);
  if (!s) return { before: '', after: '' };
  const i = s.indexOf('/');
  if (i < 0) return { before: s, after: '' };
  return { before: s.slice(0, i).trim(), after: s.slice(i+1).trim() };
}

// 列名のゆらぎ吸収(末尾スペースなど)
function get(row, name){
  if (row[name] != null && row[name] !== '') return row[name];
  if (row[name + ' '] != null && row[name + ' '] !== '') return row[name + ' '];
  return '';
}

// ----- 重複判定キー(メールor電話) -----
function makeKeys(record){
  const keys = [];
  const email = norm(record['メール']).toLowerCase();
  const phone = onlyDigits(record['電話']);
  if (email) keys.push('e:' + email);
  if (phone) keys.push('p:' + phone);
  return keys;
}

// =====================================================================
//  ファイル読み込み(Excel / CSV、エンコード自動判別対応)
// =====================================================================
async function readFile(file, sourceMeta){
  const data = await file.arrayBuffer();
  const fname = (file.name || '').toLowerCase();

  // CSV はエンコード判定をしてから読む
  if (fname.endsWith('.csv') || fname.endsWith('.tsv')){
    const requested = (sourceMeta && sourceMeta.encoding) || 'auto';
    let text;
    if (requested === 'cp932' || requested === 'shift_jis' || requested === 'sjis'){
      text = decodeWithFallback(data, ['shift_jis', 'cp932', 'utf-8']);
    } else if (requested === 'utf-8' || requested === 'utf8'){
      text = decodeWithFallback(data, ['utf-8', 'shift_jis']);
    } else {
      // auto: BOMがあればUTF-8、なければ両方試す
      text = autoDecode(data);
    }
    const wb = XLSX.read(text, { type: 'string' });
    const first = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(first, { defval: '', raw: false });
  }

  // Excel は xlsx ライブラリにそのまま渡す
  const wb = XLSX.read(data, { type: 'array', cellDates: false });
  const first = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(first, { defval: '', raw: false });
}

// BOM/ヒューリスティックで自動判別
function autoDecode(arrayBuffer){
  const bytes = new Uint8Array(arrayBuffer);
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF){
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  // UTF-8として読んで化けがないかチェック
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return utf8;
  } catch(e){
    // UTF-8で読めなかったらShift-JIS
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

function decodeWithFallback(arrayBuffer, encodings){
  const bytes = new Uint8Array(arrayBuffer);
  // BOMチェック
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF){
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  for (const enc of encodings){
    try {
      const text = new TextDecoder(enc, { fatal: true }).decode(bytes);
      return text;
    } catch(e){ /* 次のエンコードを試す */ }
  }
  // 最後の手段:fatal=falseで読み込み
  return new TextDecoder(encodings[0]).decode(bytes);
}

// =====================================================================
//  変換 & CSV出力
// =====================================================================
function convertRows(rows, source, options){
  const ctx = { norm, onlyDigits, formatPhone, ymdFromBirth, dateOnly, splitBySlash, get };
  const fixedDate   = options.applyDate || '';
  const mediaName   = options.mediaName || source.mediaName;

  return rows.map(row => {
    const mapped = source.map(row, ctx);
    if (fixedDate) mapped['応募日'] = fixedDate;
    // 媒体名は必ず選択されたソースの mediaName を使う(バグ修正)
    mapped['媒体名'] = mediaName;
    // 新規取込時のステータスは「未対応」固定
    mapped['ステータス'] = FIXED_STATUS;
    return mapped;
  });
}

function makeCsv(records){
  const esc = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
  const rows = records.map(r => TEMPLATE_HEADERS.map(h => r[h] ?? ''));
  return '\uFEFF' + [TEMPLATE_HEADERS, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}
