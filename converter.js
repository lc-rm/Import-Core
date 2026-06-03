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

// 新規取込時の固定ステータス(全媒体共通で半角ハイフン)
const FIXED_STATUS = '-';

// ----- 文字列処理ユーティリティ -----
const norm = v => v == null ? '' : String(v).trim();
const onlyDigits = v => norm(v).replace(/\D/g, '');

// =====================================================================
//  日本の固定電話 4桁市外局番(0xxx)のセット
//  ---------------------------------------------------------------------
//  総務省「市外局番の一覧」(令和4年3月1日現在)を元に作成。
//  10桁の固定電話番号(03/06除く)で、ここに該当するものは 4-2-4 区切り、
//  該当しなければ 3-3-4 区切りとする。
// =====================================================================
const FOUR_DIGIT_AREA_CODES = new Set([
  '0123', '0124', '0125', '0126', '0133', '0134', '0135', '0136', '0137', '0138', '0139', '0142',
  '0143', '0144', '0145', '0146', '0152', '0153', '0154', '0155', '0156', '0157', '0158', '0162',
  '0163', '0164', '0165', '0166', '0167', '0172', '0173', '0174', '0175', '0176', '0178', '0179',
  '0182', '0183', '0184', '0185', '0186', '0187', '0191', '0192', '0193', '0194', '0195', '0197',
  '0198', '0220', '0223', '0224', '0225', '0226', '0228', '0229', '0233', '0234', '0235', '0237',
  '0238', '0240', '0241', '0242', '0243', '0244', '0246', '0247', '0248', '0250', '0254', '0255',
  '0256', '0257', '0258', '0259', '0260', '0261', '0263', '0264', '0265', '0266', '0267', '0268',
  '0269', '0270', '0274', '0276', '0277', '0278', '0279', '0280', '0282', '0283', '0284', '0285',
  '0287', '0288', '0289', '0291', '0293', '0294', '0295', '0296', '0297', '0299', '0422', '0428',
  '0436', '0438', '0439', '0460', '0463', '0465', '0466', '0467', '0470', '0475', '0476', '0478',
  '0479', '0480', '0493', '0494', '0495', '0531', '0532', '0533', '0536', '0537', '0538', '0539',
  '0544', '0545', '0547', '0548', '0550', '0551', '0553', '0554', '0555', '0556', '0557', '0558',
  '0561', '0562', '0563', '0564', '0565', '0566', '0567', '0568', '0569', '0572', '0573', '0574',
  '0575', '0576', '0577', '0578', '0581', '0584', '0585', '0586', '0587', '0594', '0595', '0596',
  '0597', '0598', '0599', '0721', '0725', '0735', '0736', '0737', '0738', '0739', '0740', '0742',
  '0743', '0744', '0745', '0746', '0747', '0748', '0749', '0761', '0763', '0765', '0766', '0767',
  '0768', '0770', '0771', '0772', '0773', '0774', '0776', '0778', '0779', '0790', '0791', '0794',
  '0795', '0796', '0797', '0798', '0799', '0820', '0823', '0824', '0826', '0827', '0829', '0833',
  '0834', '0835', '0836', '0837', '0838', '0845', '0846', '0847', '0848', '0852', '0853', '0854',
  '0855', '0856', '0857', '0858', '0859', '0863', '0865', '0866', '0867', '0868', '0869', '0875',
  '0877', '0879', '0880', '0883', '0884', '0885', '0887', '0889', '0892', '0893', '0894', '0895',
  '0896', '0897', '0898', '0920', '0930', '0940', '0942', '0943', '0944', '0946', '0947', '0948',
  '0949', '0950', '0952', '0954', '0955', '0956', '0957', '0959', '0964', '0965', '0966', '0967',
  '0968', '0969', '0972', '0973', '0974', '0977', '0978', '0979', '0980', '0982', '0983', '0984',
  '0985', '0986', '0987', '0993', '0994', '0995', '0996', '0997'
]);

// 5桁市外局番(0xxxx) 主に北海道僻地・離島・山間部
const FIVE_DIGIT_AREA_CODES = new Set([
  '01267', '01372', '01374', '01377', '01392', '01397', '01398', '01456', '01457', '01466',
  '01547', '01558', '01564', '01586', '01587', '01632', '01634', '01635', '01648', '01654',
  '01655', '01656', '01658', '04992', '04994', '04996', '04998', '05769', '05979', '07468',
  '08387', '08388', '08396', '08477', '08512', '08514', '09802', '09912', '09913', '09969'
]);

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
  // 0 落ちの補完(携帯番号のみ)
  if (d.length === 10 && /^[789]/.test(d)) d = '0' + d;
  else if (d.length === 9) d = '0' + d;

  // 11桁: 携帯(070/080/090) or IP電話(050) → 3-4-4
  if (d.length === 11){
    return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  }
  // 10桁: 固定電話 → 市外局番の桁数で区切り判定
  if (d.length === 10){
    // 5桁市外局番 (0xxxx) → 5-1-4
    const code5 = d.slice(0, 5);
    if (FIVE_DIGIT_AREA_CODES.has(code5)){
      return `${d.slice(0,5)}-${d.slice(5,6)}-${d.slice(6)}`;
    }
    // 4桁市外局番 (0xxx) → 4-2-4
    const code4 = d.slice(0, 4);
    if (FOUR_DIGIT_AREA_CODES.has(code4)){
      return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`;
    }
    // 03/06 (東京・大阪) → 2-4-4
    const code2 = d.slice(0, 2);
    if (code2 === '03' || code2 === '06'){
      return `${d.slice(0,2)}-${d.slice(2,6)}-${d.slice(6)}`;
    }
    // それ以外の3桁市外局番 (075, 045, 052 など) → 3-3-4
    return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  }
  // 桁数が想定外 → 元の文字列を返す
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

// 列名のゆらぎ吸収(末尾スペース、全角/半角カッコ、全角/半角コロン)
function get(row, name){
  if (row[name] != null && row[name] !== '') return row[name];
  if (row[name + ' '] != null && row[name + ' '] !== '') return row[name + ' '];
  // 全角カッコ ↔ 半角カッコ、全角コロン ↔ 半角コロンの相互変換
  // 文字コードでマッピング(正規表現の特殊文字問題を回避)
  const FW_OPEN = String.fromCharCode(0xFF08);   // (全角左カッコ)
  const FW_CLOSE = String.fromCharCode(0xFF09);  // (全角右カッコ)
  const FW_COLON = String.fromCharCode(0xFF1A);  // :(全角コロン)
  const HW_OPEN = '(';
  const HW_CLOSE = ')';
  const HW_COLON = ':';
  const swap = (s, a, b) => s.split(a).join(b);

  const variants = [
    swap(swap(name, HW_OPEN, FW_OPEN), HW_CLOSE, FW_CLOSE),    // 半角→全角カッコ
    swap(swap(name, FW_OPEN, HW_OPEN), FW_CLOSE, HW_CLOSE),    // 全角→半角カッコ
    swap(name, HW_COLON, FW_COLON),                             // 半角→全角コロン
    swap(name, FW_COLON, HW_COLON),                             // 全角→半角コロン
  ];
  for (const c of variants){
    if (row[c] != null && row[c] !== '') return row[c];
    if (row[c + ' '] != null && row[c + ' '] !== '') return row[c + ' '];
  }
  return '';
}

// ----- 重複判定キー(メールor電話) -----
// 旧:過去5回履歴との重複チェック用(後方互換)
function makeKeys(record){
  const keys = [];
  const email = norm(record['メール']).toLowerCase();
  const phone = onlyDigits(record['電話']);
  if (email) keys.push('e:' + email);
  if (phone) keys.push('p:' + phone);
  return keys;
}

// ----- 行ハッシュ用ヘッダー(採用コア側で変更されない項目のみ) -----
// 採用コアで運用すると「ステータス」「採用可否」「面接結果」などが応募者ごとに更新される。
// それらをハッシュに含めると、採用コアからエクスポートしたCSVと
// Import Coreが出力するCSVのハッシュが一致しなくなり、重複検出が効かなくなる。
// → 「応募者の素データ」だけでハッシュ計算する。
// 除外項目:
//   ステータス、採用可否、コンタクト日、1次/2次面接日時・結果、退職日、書類URL
const HASH_HEADERS = [
  "応募日","求人番号","求人名称","応募職種","勤務地","部署",
  "名前","ふりがな","メール","電話","性別","生年","月","日",
  "媒体名","人材紹介会社","メモ"
];

// ----- 行ハッシュ(応募者素データのみを結合してSHA-256) -----
// 新:CSV出力済みデータの永続記録用
// HASH_HEADERS の項目を所定の順序で結合してハッシュ化することで、
// 1行分の応募データを一意に識別する。
// 同じ人の別応募(時刻違い、別案件、別の項目1つでも違う)は別ハッシュになる。
// 採用コア側でステータス等が更新されても、ハッシュは変わらない。
async function makeRowHash(record){
  // HASH_HEADERS の全カラムを順番に結合(空欄は空文字に統一して表記揺れ吸収)
  const parts = HASH_HEADERS.map(h => norm(record[h]));
  // メールは小文字に統一、電話は数字のみに統一して表記揺れ吸収
  const idxEmail = HASH_HEADERS.indexOf('メール');
  const idxPhone = HASH_HEADERS.indexOf('電話');
  if (idxEmail >= 0) parts[idxEmail] = parts[idxEmail].toLowerCase();
  if (idxPhone >= 0) parts[idxPhone] = onlyDigits(parts[idxPhone]);
  const joined = parts.join('\u0001'); // 区切り文字に制御文字を使う(データに出現しない)

  // SHA-256でハッシュ化(Web Crypto API)
  const encoder = new TextEncoder();
  const data = encoder.encode(joined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  // Uint8Array → 16進文字列
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 複数レコードを並行でハッシュ化
async function makeRowHashes(records){
  return Promise.all(records.map(r => makeRowHash(r)));
}

// ----- CSVテキストをレコード配列に変換(過去履歴/採用コアCSV取込み用) -----
// CSV本体(ヘッダー行を含む)をパースし、TEMPLATE_HEADERS にマップされたレコード配列を返す。
// 元のparseCsv はヘッダーをそのまま使うので、出力されたCSVのカラム名(=TEMPLATE_HEADERS)に
// 対応する形でレコード化される。
function csvTextToRecords(csvText){
  if (!csvText) return [];
  // 先頭BOM除去
  let text = csvText;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return parseCsv(text, ',');
}

// =====================================================================
//  ファイル読み込み(Excel / CSV、エンコード自動判別対応)
//  ---------------------------------------------------------------------
//  注意: CSVは xlsx ライブラリを通すと「2026/04/30」のような日付っぽい
//  文字列が「4/30/26」のような米国式に勝手に変換されるバグがあるため、
//  自前のCSVパーサで読む。Excel はそのまま xlsx に任せる。
// =====================================================================
async function readFile(file, sourceMeta){
  const data = await file.arrayBuffer();
  const fname = (file.name || '').toLowerCase();

  // CSV/TSV はエンコード判定 → 自前パーサで読み込み(日付の勝手な変換を防ぐ)
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
    const delimiter = fname.endsWith('.tsv') ? '\t' : ',';
    return parseCsv(text, delimiter);
  }

  // Excel は xlsx ライブラリにそのまま渡す(従来通り)
  const wb = XLSX.read(data, { type: 'array', cellDates: false });
  const first = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(first, { defval: '', raw: false });
}

// =====================================================================
//  自前のCSVパーサ
//  ---------------------------------------------------------------------
//  - RFC 4180 準拠(ダブルクォート、エスケープ "" )
//  - 改行コード \r\n / \n / \r すべて対応
//  - フィールド内の改行(クォート内)対応
//  - 1行目をヘッダーとして使う
//  - 全フィールドを文字列のまま返す(日付の自動変換なし)
// =====================================================================
function parseCsv(text, delimiter = ','){
  // BOM除去(decodeで除去済みのはずだが念のため)
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  let i = 0;
  const len = text.length;

  while (i < len){
    const c = text[i];

    if (inQuote){
      if (c === '"'){
        if (text[i+1] === '"'){
          // エスケープされたダブルクォート
          field += '"';
          i += 2;
          continue;
        }
        // クォート終了
        inQuote = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    // クォート外
    if (c === '"'){
      inQuote = true;
      i++;
      continue;
    }
    if (c === delimiter){
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r'){
      // \r\n は \n と同じ扱い、\r 単独もレコード区切り
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (text[i+1] === '\n') i += 2;
      else i++;
      continue;
    }
    if (c === '\n'){
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // 最後のフィールド/行を回収
  if (field !== '' || row.length > 0){
    row.push(field);
    rows.push(row);
  }

  // 空行を除去
  const filtered = rows.filter(r => r.some(v => v !== ''));
  if (filtered.length === 0) return [];

  // 1行目をヘッダーとして dictリストに変換
  const headers = filtered[0].map(h => norm(h));
  const result = [];
  for (let r = 1; r < filtered.length; r++){
    const obj = {};
    const cells = filtered[r];
    for (let c = 0; c < headers.length; c++){
      obj[headers[c]] = cells[c] != null ? cells[c] : '';
    }
    result.push(obj);
  }
  return result;
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
    // 新規取込時のステータスは半角ハイフン固定(全媒体共通)
    mapped['ステータス'] = FIXED_STATUS;
    return mapped;
  });
}

function makeCsv(records){
  const esc = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
  const rows = records.map(r => TEMPLATE_HEADERS.map(h => r[h] ?? ''));
  return '\uFEFF' + [TEMPLATE_HEADERS, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}
