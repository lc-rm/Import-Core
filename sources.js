// =====================================================================
//  媒体(ソース)定義
//  ---------------------------------------------------------------------
//  必須: id, label, mediaName, map(row, ctx)
//  任意: encoding ('utf-8' | 'cp932' | 'auto'), placeholder, fileTypes
// =====================================================================

const SOURCES = {

  // ---------------- ジョブオプ採用管理 / Indeed PLUS 出力 ----------------
  jobop: {
    id: 'jobop',
    label: 'ジョブオプ',
    mediaName: 'ジョブオプ',
    fileTypes: '.xls,.xlsx,.csv',
    map: (row, ctx) => {
      const get = (n) => ctx.get(row, n);
      const [by, bm, bd] = ctx.ymdFromBirth(get('生年月日'));
      const job = ctx.splitBySlash(get('表示用職種名'));

      return {
        '応募日':   ctx.dateOnly(get('応募受付日')),
        '求人番号': '',
        '求人名称': job.before,
        '応募職種': get('応募職種名') || get('掲載職種名称'),
        '勤務地':   '',
        '部署':     get('掲載社名') || get('店舗名'),
        '名前':     get('氏名'),
        'ふりがな': get('氏名かな'),
        'メール':   get('メールアドレス1') || get('自動生成メールアドレス'),
        '電話':     ctx.formatPhone(get('電話番号1')),
        '性別':     get('性別'),
        '生年': by, '月': bm, '日': bd,
        'メモ':     get('メモ') || get('応募者からの問い合わせ') || get('希望条件'),
      };
    }
  },

  // ---------------- Indeed (CSV直接ダウンロード) ----------------
  indeed: {
    id: 'indeed',
    label: 'Indeed',
    mediaName: 'Indeed',
    fileTypes: '.csv',
    encoding: 'utf-8',
    map: (row, ctx) => {
      const get = (n) => ctx.get(row, n);
      // Indeed CSVには生年月日列がない
      return {
        '応募日':   ctx.dateOnly(get('日付')),
        '求人番号': '',
        '求人名称': get('職種名'),
        '応募職種': '',
        '勤務地':   '',
        '部署':     '',
        '名前':     get('名前'),
        'ふりがな': '',
        'メール':   get('メールアドレス'),
        '電話':     ctx.formatPhone(get('電話番号')),
        '性別':     '',
        '生年': '', '月': '', '日': '',
        'メモ':     [
          get('応募者の居住地') ? '居住地: ' + get('応募者の居住地') : '',
          get('関連のある経験') ? '経験: ' + get('関連のある経験') : '',
          get('学歴') ? '学歴: ' + get('学歴') : '',
          get('応募経路') ? '経路: ' + get('応募経路') : ''
        ].filter(x => x).join(' / '),
      };
    }
  },

  // ---------------- Indeed (応募者ページからブックマークレット取込) ----------------
  // 内部用source: 媒体ドロップダウンには出さない(internal: true)。
  // 履歴・重複チェックは sId='indeed' に統合する(媒体名も「Indeed」で同じ)。
  // ブックマークレットが整形した {name, kana, phone, ...} オブジェクトをそのまま受け取る。
  indeed_page: {
    id: 'indeed_page',
    label: 'Indeed(応募者ページ)',
    mediaName: 'Indeed',
    internal: true, // ドロップダウンに表示しない
    map: (row, ctx) => {
      // row はブックマークレットからの整形済みオブジェクト
      // {name, kana, phone, gender, birth, address, email, jobTitle, location, appliedDate}
      const [by, bm, bd] = ctx.ymdFromBirth(row.birth || '');
      return {
        '応募日':   ctx.dateOnly(row.appliedDate || ''),
        '求人番号': '',
        '求人名称': row.jobTitle || '',
        '応募職種': '',
        '勤務地':   '',
        '部署':     '',
        '名前':     row.name || '',
        'ふりがな': row.kana || '',
        'メール':   row.email || '',
        '電話':     ctx.formatPhone(row.phone || ''),
        '性別':     row.gender || '',
        '生年': by, '月': bm, '日': bd,
        'メモ':     '',
      };
    }
  },

  // ---------------- engage (CP932/Shift-JIS) ----------------
  engage: {
    id: 'engage',
    label: 'engage',
    mediaName: 'engage',
    fileTypes: '.csv',
    encoding: 'cp932',
    map: (row, ctx) => {
      const get = (n) => ctx.get(row, n);
      const [by, bm, bd] = ctx.ymdFromBirth(get('生年月日'));
      // 氏名は姓+名で結合(get関数が全角/半角カッコ自動対応)
      const lastName  = ctx.norm(get('氏名(姓)'));
      const firstName = ctx.norm(get('氏名(名)'));
      const lastKana  = ctx.norm(get('氏名フリガナ(姓)'));
      const firstKana = ctx.norm(get('氏名フリガナ(名)'));

      const addr = [
        ctx.norm(get('都道府県')) + ctx.norm(get('市区町村')) + ctx.norm(get('以降の住所'))
      ].filter(x => x).join(' ');

      return {
        '応募日':   ctx.dateOnly(get('応募日')),
        '求人番号': '',
        '求人名称': get('応募求人-職種名'),
        '応募職種': '',
        '勤務地':   '',
        '部署':     '',
        '名前':     [lastName, firstName].filter(x => x).join(' '),
        'ふりがな': [lastKana, firstKana].filter(x => x).join(' '),
        'メール':   get('メールアドレス'),
        '電話':     ctx.formatPhone(get('電話番号')),
        '性別':     get('性別'),
        '生年': by, '月': bm, '日': bd,
        'メモ':     [
          get('郵便番号') ? '〒' + get('郵便番号') : '',
          addr ? '住所: ' + addr : '',
          get('自己PR') ? 'PR: ' + ctx.norm(get('自己PR')).slice(0, 200) : ''
        ].filter(x => x).join(' / '),
      };
    }
  },

  // ---------------- AirWORK ----------------
  airwork: {
    id: 'airwork',
    label: 'AirWORK',
    mediaName: 'AirWORK',
    fileTypes: '.csv',
    encoding: 'utf-8',
    map: (row, ctx) => {
      const get = (n) => ctx.get(row, n);
      const [by, bm, bd] = ctx.ymdFromBirth(get('生年月日'));
      // 住所末尾の「(国:日本)」のような付加情報を除去(全角・半角両対応)
      const addr = ctx.norm(get('住所')).replace(/\s*[(（]\s*国\s*[:：][^)）]*[)）]?.*$/, '').trim();

      return {
        '応募日':   ctx.dateOnly(get('応募日時')),
        '求人番号': '',
        '求人名称': get('職種名'),
        '応募職種': get('職種1'),
        '勤務地':   '',
        '部署':     '',
        '名前':     get('応募者名'),
        'ふりがな': '',
        'メール':   get('メールアドレス'),
        '電話':     ctx.formatPhone(get('電話番号')),
        '性別':     get('性別'),
        '生年': by, '月': bm, '日': bd,
        'メモ':     [
          get('郵便番号') ? '〒' + get('郵便番号') : '',
          addr ? '住所: ' + addr : '',
          get('応募雇用形態') ? '雇用: ' + get('応募雇用形態') : ''
        ].filter(x => x).join(' / '),
      };
    }
  },

  // ---------------- 求人ボックス ----------------
  kyujinbox: {
    id: 'kyujinbox',
    label: '求人ボックス',
    mediaName: '求人ボックス',
    fileTypes: '.csv',
    encoding: 'utf-8',
    map: (row, ctx) => {
      const get = (n) => ctx.get(row, n);

      // 氏名「福井儀一(ふくいよしかず)」→ 氏名+ふりがな に分離(全角/半角カッコ両対応)
      const rawName = ctx.norm(get('氏名'));
      let name = rawName, kana = '';
      const m = rawName.match(/^(.+?)\s*[(（]([^)）]+)[)）]\s*$/);
      if (m){
        name = m[1].trim();
        kana = m[2].trim();
      }

      // 生年月日「1961年03月13日 (65歳)」から日付部分のみ
      const birthStr = ctx.norm(get('生年月日')).replace(/\s*[(（]\d+\s*歳[)）]\s*/, '');
      const [by, bm, bd] = ctx.ymdFromBirth(birthStr);

      const workplace = ctx.norm(get('勤務先_1'));
      const workduty  = ctx.norm(get('役職・業務内容など_1'));

      return {
        '応募日':   ctx.dateOnly(get('応募日時')),
        '求人番号': '',
        '求人名称': get('求人タイトル'),
        '応募職種': '',
        '勤務地':   '',
        '部署':     '',
        '名前':     name,
        'ふりがな': kana,
        'メール':   get('メールアドレス'),
        '電話':     ctx.formatPhone(get('電話番号')),
        '性別':     get('性別'),
        '生年': by, '月': bm, '日': bd,
        'メモ':     [
          get('現在の職業') ? '現職: ' + get('現在の職業') : '',
          workplace ? '直近: ' + workplace + (workduty ? ' / ' + workduty : '') : '',
          get('備考・PR') ? 'PR: ' + ctx.norm(get('備考・PR')).slice(0, 200) : '',
          get('選考コメント') || ''
        ].filter(x => x).join(' / '),
      };
    }
  },

  // ---------------- その他(汎用カスタム枠) ----------------
  other: {
    id: 'other',
    label: 'その他',
    mediaName: 'その他',
    fileTypes: '.xls,.xlsx,.csv',
    placeholder: true,
    map: (row, ctx) => {
      const get = (n) => ctx.get(row, n);
      const [by, bm, bd] = ctx.ymdFromBirth(get('生年月日'));
      return {
        '応募日':   ctx.dateOnly(get('応募日') || get('応募日時') || get('日付')),
        '求人番号': '',
        '求人名称': get('求人名称') || get('求人名') || get('求人タイトル') || get('職種名'),
        '応募職種': get('応募職種') || get('職種') || get('職種名'),
        '勤務地':   '',
        '部署':     get('部署') || get('会社名'),
        '名前':     get('名前') || get('氏名') || get('応募者名'),
        'ふりがな': get('ふりがな') || get('カナ'),
        'メール':   get('メール') || get('メールアドレス'),
        '電話':     ctx.formatPhone(get('電話') || get('電話番号')),
        '性別':     get('性別'),
        '生年': by, '月': bm, '日': bd,
        'メモ':     get('メモ') || get('備考'),
      };
    }
  },

};
