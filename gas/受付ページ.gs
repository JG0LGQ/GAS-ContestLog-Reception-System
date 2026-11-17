// 受付ページ（GAS用・1ファイルにまとめたもの。審査ツールとは別のスクリプト）
// 受付ページ専用のスプレッドシートのスクリプトに貼り付け、ウェブアプリとして公開する
// 元のファイル: src/public/ フォルダ。編集は src/public/ で行い、node tools/build_gas.js でこの1ファイルを作り直す

// ===== 01_util.js =====
/**
 * 共通の小さな関数（GASとNodeの両方で動く書き方にしている）
 */

/** 'YYYY-MM-DD' と 'hh:mm'（または 'hhmm'）をJSTとして、1970年からの分数に変換する */
function jstToMinutes(dateStr, timeStr) {
  const d = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(String(dateStr || '').trim());
  const t = /^(\d{1,2}):?(\d{2})(?::\d{2})?$/.exec(String(timeStr || '').trim());
  if (!d || !t) return null;
  const h = +t[1], m = +t[2];
  if (h > 24 || m > 59) return null;
  return Date.UTC(+d[1], +d[2] - 1, +d[3], h, m) / 60000 - 9 * 60;
}

/** 'YYYY-MM-DD hh:mm' 形式（JST）を分数に変換する */
function jstStringToMinutes(s) {
  const p = String(s || '').trim().split(/\s+/);
  return jstToMinutes(p[0], p[1] || '00:00');
}

/** 分数をJSTの 'YYYY-MM-DD hh:mm' に戻す */
function minutesToJst(min) {
  const dt = new Date((min + 9 * 60) * 60000);
  const z = function (n) { return (n < 10 ? '0' : '') + n; };
  return dt.getUTCFullYear() + '-' + z(dt.getUTCMonth() + 1) + '-' + z(dt.getUTCDate()) +
    ' ' + z(dt.getUTCHours()) + ':' + z(dt.getUTCMinutes());
}

/** 文字列の編集距離（呼出符号の打ち間違い検出に使う） */
function editDistance(a, b) {
  a = String(a); b = String(b);
  const dp = [];
  for (let i = 0; i <= a.length; i++) { dp.push([i]); }
  for (let j = 1; j <= b.length; j++) { dp[0][j] = j; }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** 全角英数字・記号を半角にする */
function toHankaku(s) {
  return String(s || '').replace(/[！-～]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  }).replace(/　/g, ' ');
}

const ERA_START = { '明治': 1868, '大正': 1912, '昭和': 1926, '平成': 1989, '令和': 2019, M: 1868, T: 1912, S: 1926, H: 1989, R: 2019 };

/** 漢数字（「二十二」「二〇一〇」「十」など）を数にする */
function kanjiNumber(k) {
  const digit = function (c) { return '〇一二三四五六七八九'.indexOf(c); };
  const t = k.indexOf('十');
  if (t < 0) return +k.split('').map(digit).join('');
  return (t === 0 ? 1 : digit(k.charAt(t - 1))) * 10 + (t === k.length - 1 ? 0 : digit(k.charAt(t + 1)));
}

/**
 * 文中の日付をすべて取り出す（全角は半角にしてから読む）。戻り値: [{date:'YYYY-MM-DD', index:文中の位置}]
 * 読める書き方：2008-04-02、2008/4/2、2008.4.2、2008年4月2日、平成20年4月2日、H20.4.2、H.20.4.2、平成元年…、20080402、
 * 平成二十年四月二日（年・月・日の前の漢数字）
 */
function findDatesInText(text) {
  const s = toHankaku(text).replace(/([〇一二三四五六七八九十]+)(?=\s*[年月日])/g, function (m, k) { return String(kanjiNumber(k)); });
  const out = [];
  const z = function (n) { return (n < 10 ? '0' : '') + n; };
  const push = function (y, m, d, idx) {
    y = +y; m = +m; d = +d;
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return; // 2月30日など
    out.push({ date: y + '-' + z(m) + '-' + z(d), index: idx });
  };
  let m;
  const era = /(明治|大正|昭和|平成|令和|[MTSHR])\.?\s*(元|\d{1,2})\s*[年.\/\-]\s*(\d{1,2})\s*[月.\/\-]\s*(\d{1,2})\s*日?/gi;
  while ((m = era.exec(s)) !== null) {
    const base = ERA_START[m[1].length === 1 ? m[1].toUpperCase() : m[1]];
    push(base + (m[2] === '元' ? 1 : +m[2]) - 1, m[3], m[4], m.index);
  }
  const west = /(?:^|[^\d])((?:19|20)\d{2})\s*[年.\/\-]\s*(\d{1,2})\s*[月.\/\-]\s*(\d{1,2})\s*日?/g;
  while ((m = west.exec(s)) !== null) push(m[1], m[2], m[3], m.index + m[0].indexOf(m[1]));
  const packed = /(?:^|[^\d])((?:19|20)\d{2})(\d{2})(\d{2})(?!\d)/g;
  while ((m = packed.exec(s)) !== null) push(m[1], m[2], m[3], m.index + m[0].indexOf(m[1]));
  return out.sort(function (a, b) { return a.index - b.index; });
}

/** 1つの日付の文字列（シートの値など）を 'YYYY-MM-DD' にする。読めなければ null */
function parseDateText(s) {
  const d = findDatesInText(s);
  return d.length ? d[0].date : null;
}

// ===== 02_callsign.js =====
/**
 * 呼出符号の正規化
 *  full   : 大文字・空白なしの全体（移動表示を含む）例 JR0ZAX/0
 *  base   : 移動表示を除いた本体 例 JR0ZAX
 *  suffix : 移動表示 例 '0'（なければ ''）
 *  area   : 本体のエリア数字 例 '0'
 *  opArea : 運用エリア（移動表示が数字ならそれ、なければ area）
 *  valid  : 日本のアマチュア局の呼出符号として形式が正しいか
 */
const JA_CALL_RE = /^(J[A-S]|7[J-N]|8[J-N])([0-9])([A-Z]{1,4})$/;

function normalizeCall(raw) {
  const full = toHankaku(raw).toUpperCase().replace(/\s+/g, '');
  const parts = full.split('/').filter(function (p) { return p !== ''; });
  let base = '', suffix = '', prefixPart = '';
  // 本体は日本の呼出符号の形をしている部分
  for (let i = 0; i < parts.length; i++) {
    if (JA_CALL_RE.test(parts[i])) { base = parts[i]; }
  }
  if (base) {
    const idx = parts.indexOf(base);
    prefixPart = parts.slice(0, idx).join('/');
    suffix = parts.slice(idx + 1).join('/');
  } else {
    base = parts.length ? parts.reduce(function (a, b) { return b.length > a.length ? b : a; }) : '';
  }
  const m = JA_CALL_RE.exec(base);
  const area = m ? m[2] : '';
  const opArea = /^[0-9]$/.test(suffix) ? suffix : area;
  return {
    full: full,
    base: base,
    suffix: suffix,
    area: area,
    opArea: opArea,
    valid: !!m && prefixPart === '' && (suffix === '' || /^[0-9]$/.test(suffix))
  };
}

// ===== 03_master.js =====
/**
 * マスタデータ（市郡区ナンバー・都府県支庁ナンバー・エリア）
 *
 * ナンバーの種類は桁数で決まる。
 *   2〜3桁 : 都府県支庁（都府県は2桁、北海道の地域は101〜114）
 *   4桁    : 市（JCC）
 *   5桁    : 郡（JCG）
 *   6桁    : 区（政令指定都市の区）
 */

/** 都府県番号と名称。本番ではJARLの shicho-list.txt から取り込んだものに置き換わる */
const PREF_TABLE = {
  '01': '北海道', '02': '青森県', '03': '岩手県', '04': '秋田県', '05': '山形県', '06': '宮城県',
  '07': '福島県', '08': '新潟県', '09': '長野県', '10': '東京都', '11': '神奈川県', '12': '千葉県',
  '13': '埼玉県', '14': '茨城県', '15': '栃木県', '16': '群馬県', '17': '山梨県', '18': '静岡県',
  '19': '岐阜県', '20': '愛知県', '21': '三重県', '22': '京都府', '23': '滋賀県', '24': '奈良県',
  '25': '大阪府', '26': '和歌山県', '27': '兵庫県', '28': '富山県', '29': '福井県', '30': '石川県',
  '31': '岡山県', '32': '島根県', '33': '山口県', '34': '鳥取県', '35': '広島県', '36': '香川県',
  '37': '徳島県', '38': '愛媛県', '39': '高知県', '40': '福岡県', '41': '佐賀県', '42': '長崎県',
  '43': '熊本県', '44': '大分県', '45': '宮崎県', '46': '鹿児島県', '47': '沖縄県', '48': '小笠原'
};

/** エリア数字と都府県番号の対応 */
const AREA_PREFS = {
  '0': ['08', '09'],
  '1': ['10', '11', '12', '13', '14', '15', '16', '17'],
  '2': ['18', '19', '20', '21'],
  '3': ['22', '23', '24', '25', '26', '27'],
  '4': ['31', '32', '33', '34', '35'],
  '5': ['36', '37', '38', '39'],
  '6': ['40', '41', '42', '43', '44', '45', '46', '47'],
  '7': ['02', '03', '04', '05', '06', '07'],
  '8': ['01'],
  '9': ['28', '29', '30']
};

/** 桁数からナンバーの種類を返す */
function numberKind(no) {
  if (!/^\d+$/.test(no)) return null;
  if (no.length === 2) return '都府県支庁';
  if (no.length === 3) return /^1(0[1-9]|1[0-4])$/.test(no) ? '都府県支庁' : null;
  if (no.length === 4) return '市';
  if (no.length === 5) return '郡';
  if (no.length === 6) return '区';
  return null;
}

/** ナンバーの都府県番号 */
function numberPref(no) {
  if (numberKind(no) === '都府県支庁') return no.length === 3 ? '01' : no;
  return no.substring(0, 2);
}

/**
 * ナンバーマスタ
 * entries: [{no, kind, pref, name, validFrom(分数 or null), validTo(分数 or null)}]
 */
function NumberMaster(entries) {
  this.map = {};
  const self = this;
  (entries || []).forEach(function (e) {
    (self.map[e.no] = self.map[e.no] || []).push(e);
  });
}

/** 指定時点で有効なナンバーを返す（なければ null） */
NumberMaster.prototype.lookup = function (no, atMinutes) {
  const list = this.map[no];
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if ((e.validFrom == null || atMinutes >= e.validFrom) &&
        (e.validTo == null || atMinutes <= e.validTo)) return e;
  }
  return null;
};

/** 有効期間を問わず、登録があるか */
NumberMaster.prototype.exists = function (no) { return !!this.map[no]; };

/** 都府県支庁ナンバーを PREF_TABLE から作る（取り込み前の仮データ） */
function defaultPrefEntries() {
  const list = [];
  Object.keys(PREF_TABLE).forEach(function (k) {
    if (k === '01') return; // 北海道は地域ナンバー
    list.push({ no: k, kind: '都府県支庁', pref: k, name: PREF_TABLE[k], validFrom: null, validTo: null });
  });
  for (let n = 101; n <= 114; n++) {
    list.push({ no: String(n), kind: '都府県支庁', pref: '01', name: '北海道の地域', validFrom: null, validTo: null });
  }
  return list;
}

/**
 * zLogのマルチ定義ファイル（.DAT）を読む。
 * 1行目は見出し（例 "non-aja JA0VHF.DAT for ZLOGCG.EXE"）、最後は "end of file ..."。
 * データ行の例: "080101     新潟市北区"  "0802       長岡市"  "16         群馬県"
 * 文字コードはShift_JIS。GASでは getContentText('Shift_JIS') などで文字列にしてから渡す。
 * DATには有効期間がないため、validFrom・validTo は null（その時点で有効なものだけが載っている前提）。
 */
function parseZlogDat(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach(function (line) {
    const m = /^\s*(\d{2,6})\s+(.*?)\s*$/.exec(line);
    if (!m) return;
    const kind = numberKind(m[1]);
    if (!kind) return;
    out.push({ no: m[1], kind: kind, pref: numberPref(m[1]), name: m[2], validFrom: null, validTo: null });
  });
  return out;
}

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

/**
 * JARLの市郡区番号リスト（jcc-list.txt / jcg-list.txt / ku-list.txt）を読む。
 * データ行の例:
 *   "  0901   Nagano               長野"
 *   "* 0716   Wakamatsu            若松      \"Dec.31,1954\""   ← 行頭*は消滅、日付は消滅日
 * 文字コードはShift_JIS。GASでは blob.getDataAsString('Shift_JIS') で文字列にしてから渡す。
 */
function parseJarlNumberList(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach(function (line) {
    const m = /^\s*(\*)?\s*(\d{4,6})\s+(.*)$/.exec(line);
    if (!m) return;
    const no = m[2];
    const kind = numberKind(no);
    if (!kind || kind === '都府県支庁') return;
    let rest = m[3];
    let validTo = null;
    const dm = /"\s*([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2}),\s*(\d{4})\s*"/.exec(rest);
    if (dm) {
      const mon = MONTHS[dm[1].toUpperCase()];
      if (mon) validTo = Date.UTC(+dm[3], mon - 1, +dm[2], 23, 59) / 60000 - 9 * 60;
      rest = rest.replace(dm[0], '');
    }
    out.push({
      no: no, kind: kind, pref: no.substring(0, 2), name: rest.trim().replace(/\s+/g, ' '),
      validFrom: null, validTo: m[1] ? (validTo == null ? 0 : validTo) : null
    });
  });
  return out;
}

/**
 * 登録クラブ番号をそろえる（全角→半角、区切りの「ー－」→「-」、数字の頭の0を取る）。
 * 例：「０８－１－０２」→「08-1-2」、「09-01-01」→「09-1-1」、「01A-1-1」→「01A-1-1」。読めなければ null
 */
function normalizeClubNumber(s) {
  const t = toHankaku(s).toUpperCase().replace(/[\s　]/g, '').replace(/[ー－‐−―]/g, '-');
  const m = /^(\d{2}[A-H]?)-(0?\d)-(\d{1,4})$/.exec(t);
  return m ? m[1] + '-' + (+m[2]) + '-' + (+m[3]) : null;
}

/** 登録クラブ番号の都府県番号（先頭の2桁） */
function clubPref(no) { return no ? no.substring(0, 2) : null; }

/**
 * 登録クラブの一覧のページ（JARL本部の「登録クラブ一覧」や、支部のページ）から、登録番号とクラブ名を取り出す。
 * HTMLの表（<tr><td>…）でも、文字だけの一覧でも読める。1列目が登録番号、2列目がクラブ名の行を拾う。
 * prefs を渡すと、その都府県番号のクラブだけを返す（例：['08','09']）。
 * 戻り値: [{no, name, pref}]（番号の順。同じ番号は最初のもの）
 */
function parseClubList(html, prefs) {
  const decode = function (s) {
    return String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, function (a, n) { return String.fromCharCode(+n); })
      .replace(/[\s　]+/g, ' ').trim();
  };
  const rows = [];
  const src = String(html || '');
  // HTMLの表
  const trs = src.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  trs.forEach(function (tr) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(decode);
    if (cells.length >= 2) rows.push(cells);
  });
  // 表がなければ、文字の行（「|」区切り・タブ区切り・2つ以上の空白区切り）
  if (!rows.length) {
    decode(src.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/\n/g, '\u0001')).split('\u0001').forEach(function (line) {
      const cells = line.indexOf('|') >= 0 ? line.split('|') : line.split(/\t|\s{2,}/);
      const c = cells.map(function (x) { return x.trim(); }).filter(function (x) { return x !== ''; });
      if (c.length >= 2) rows.push(c);
    });
  }
  const out = [], seen = {};
  rows.forEach(function (c) {
    const no = normalizeClubNumber(c[0]);
    if (!no || seen[no]) return;
    if (prefs && prefs.indexOf(clubPref(no)) < 0) return;
    seen[no] = true;
    out.push({ no: no, name: c[1], pref: clubPref(no) });
  });
  return out.sort(function (a, b) {
    const pa = a.no.split('-'), pb = b.no.split('-');
    return pa[0] < pb[0] ? -1 : pa[0] > pb[0] ? 1 : (+pa[1] - +pb[1]) || (+pa[2] - +pb[2]);
  });
}

// ===== 04_parser.js =====
/**
 * JARL形式電子ログ（R1.0・R2.0・R2.1）の読み取り
 *
 * 版による違い（見本ログで確認したもの）
 *   R1.0 : CATEGORYNAME・LICENSECLASS・POWERTYPE・EQUIPMENT などのタグがある。
 *          <SCORE BAND=144MHz>交信数,得点,マルチ</SCORE> のように属性付きのタグがある。
 *          住所や宣誓文が1行に書かれている。文字コードはShift_JISが多い。
 *   R2.0 : R2.1とほぼ同じ。ログ部の見出しの下に「-----」の区切り線がある場合がある
 *          （HLTSTなど）。見出しの列名も RCVNo・Multi・PT などソフトによって違う。
 *   共通 : ログ部の1行の書き方（JARL形式）は同じ。属性付きのタグは「タグ名 属性」の名前で保存する。
 *
 * 戻り値:
 * {
 *   version, summary: {タグ名: 値}, logType,
 *   qsos: [{lineNo, line, date, time, band, mode, call, sentRst, sentNo, sentPower,
 *           rcvdRst, rcvdNo, rcvdPower, mlt, pts, sentMissing?, rcvdMissing?}],
 *   problems: [{level:'不備'|'注意', message}],
 *   columns: 見出しの行から読んだ列の位置 {sent, rcvd, mlt}（文字の位置。見出しがなければ null）,
 *   missingSent: [送ったナンバーの欄が空の交信の行番号], missingRcvd: [受けたナンバーの欄が空の交信の行番号]
 * }
 * 列の位置がそろった形のログ（CTESTWIN など）で、見出しの行（DATE … SENTNo … RCVDNo …）の「送ったナンバー」「受けたナンバー」の
 * 列の範囲が交信の行で全部空白なら、その欄を空として読む（ほかの欄がずれない。申し送り No.98）。そのときだけ、欄が空の交信に
 * sentMissing・rcvdMissing を付け、行番号を missingSent・missingRcvd に入れる（受付が不備の返事に使う）
 */
const SUPPORTED_VERSIONS = ['R1.0', 'R2.0', 'R2.1'];
const REQUIRED_TAGS = ['CONTESTNAME', 'CATEGORYCODE', 'CALLSIGN', 'TOTALSCORE', 'ADDRESS',
  'NAME', 'EMAIL', 'POWER', 'OATH', 'DATE', 'SIGNATURE'];

const TAG_LABELS = {
  CONTESTNAME: 'コンテスト名', CATEGORYCODE: '参加種目コード', CALLSIGN: '呼出符号',
  TOTALSCORE: '総得点', ADDRESS: '住所', NAME: '氏名', EMAIL: 'メールアドレス', POWER: '空中線電力',
  OATH: '宣誓文', DATE: '宣誓の日付', SIGNATURE: '署名'
};

function parseJarlLog(text) {
  const res = { version: null, summary: {}, logType: null, qsos: [], problems: [], columns: null, missingSent: [], missingRcvd: [] };
  const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  // ---- サマリー部 ----
  const sm = /<SUMMARYSHEET\s+VERSION\s*=\s*"?([^>"\s]+)"?\s*>([\s\S]*?)<\/SUMMARYSHEET>/i.exec(src);
  if (!sm) {
    res.problems.push({ level: '不備', message: 'サマリーシート（<SUMMARYSHEET VERSION=R2.1> 〜 </SUMMARYSHEET>）が見つかりません' });
  } else {
    res.version = sm[1].toUpperCase();
    if (SUPPORTED_VERSIONS.indexOf(res.version) < 0) {
      res.problems.push({ level: '注意', message: 'VERSION=' + res.version + ' のログです。対応している版は ' + SUPPORTED_VERSIONS.join('・') + ' です。読み取り結果を確かめてください' });
    }
    // タグ。属性付きのタグ（R1.0の <SCORE BAND=144MHz>）は「SCORE BAND=144MHz」の名前で保存する
    const tagRe = /<([A-Z][A-Z0-9]*)(\s+[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let t;
    while ((t = tagRe.exec(sm[2])) !== null) {
      const key = t[1].toUpperCase() + (t[2] ? ' ' + t[2].trim().replace(/\s+/g, ' ').toUpperCase() : '');
      res.summary[key] = t[3].replace(/^\n+|\n+$/g, '').trim();
    }
    REQUIRED_TAGS.forEach(function (tag) {
      if (!res.summary[tag]) {
        res.problems.push({ level: '不備', message: (TAG_LABELS[tag] || tag) + '（' + tag + '）が記入されていません' });
      }
    });
  }

  // ---- ログ部 ----
  const lm = /<LOGSHEET(?:\s+TYPE\s*=\s*"?([^>"]*)"?)?\s*>([\s\S]*?)<\/LOGSHEET>/i.exec(src);
  if (!lm) {
    res.problems.push({ level: '不備', message: 'ログシート（<LOGSHEET> 〜 </LOGSHEET>）が見つかりません' });
    return res;
  }
  res.logType = lm[1] || '';
  const startLine = src.substring(0, lm.index).split('\n').length; // <LOGSHEET> の行番号
  // 年のない日付（「M DD」）や2桁の年（YY/MM/DD）に使う年：宣誓の日付（DATE）の年。なければ今の年
  const oathDate = parseDateText(res.summary.DATE || '');
  const defaultYear = oathDate ? +oathDate.substring(0, 4) : new Date().getFullYear();
  // 1件の交信が2行に分かれている書き方（例：得点だけが次の行）があるので、日付で始まる行から次の日付の行の前までを1件にまとめる。
  // 日付で始まらない行（見出し・区切り線・ソフト名など）は、前の交信の続きの数字の行でなければ読み飛ばす
  const records = [];
  let cur = null, cols = null;
  lm[2].split('\n').forEach(function (line, i) {
    const lineNo = startLine + i;
    const s = toHankaku(line).trim();
    if (!s) return;
    const toks = splitLogTokens(s);
    if (!records.length && !cols) cols = logColumns(toHankaku(line)); // 最初の交信より前の見出しの行
    if (startsWithDate(toks)) {
      cur = { lineNo: lineNo, lines: [line.replace(/\s+$/, '')], toks: toks };
      records.push(cur);
      return;
    }
    // 前の交信の続き（数字や「-」だけの行。例：「1」「,,,,,,,,1」）
    if (cur && toks.length && toks.every(function (t) { return /^(\d+[A-Z]?|-|DUP)$/i.test(t); })) {
      cur.lines.push(line.replace(/\s+$/, ''));
      cur.toks = cur.toks.concat(toks);
      return;
    }
    cur = null;
    // 見出しやソフト名などは読み飛ばす。ただし、時刻と呼出符号がある行は交信の書き間違いとして知らせる
    const up = toks.map(function (t) { return t.toUpperCase(); });
    if (up.some(function (t) { return TIME_TOKEN_RE.test(t); }) && up.some(function (t) { return LOG_CALL_RE.test(t) && LOG_MODES.indexOf(t) < 0; }) &&
        up.some(function (t) { return LOG_MODES.indexOf(t) >= 0; })) {
      res.problems.push({ level: '不備', message: lineNo + '行目：年月日がYYYY-MM-DD（またはYYYY/MM/DD、YY/MM/DD、M DD）の形ではありません「' + line.trim() + '」' });
    }
  });
  res.columns = cols;
  records.forEach(function (r) {
    const fields = cols && r.lines.length === 1 ? blankFields(toHankaku(r.lines[0]), cols) : null;
    const q = parseJarlQsoTokens(r.toks, defaultYear, fields);
    const shown = r.lines.map(function (l) { return l.trim(); }).join(' ');
    if (q.error) {
      res.problems.push({ level: '不備', message: r.lineNo + '行目：' + q.error + '「' + shown + '」' });
      return;
    }
    if (q.badBand) {
      res.problems.push({ level: '不備', badBand: true, message: r.lineNo + '行目：バンド「' + q.band + '」が周波数として正しくありません。この交信は対象バンド外（得点対象外）として審査します「' + shown + '」' });
    }
    q.lineNo = r.lineNo;
    q.line = r.lines.length === 1 ? r.lines[0] : r.lines.map(function (l) { return l.trim(); }).join('  ');
    if (fields && !q.sentNo) { q.sentMissing = true; res.missingSent.push(r.lineNo); }
    if (fields && !q.rcvdNo) { q.rcvdMissing = true; res.missingRcvd.push(r.lineNo); }
    res.qsos.push(q);
  });
  if (res.qsos.length === 0) {
    res.problems.push({ level: '不備', message: '交信データが1件もありません' });
  }
  return res;
}

/**
 * 見出しの行から、列の位置を読む。DATE・TIME・BAND・MODE・CALL（CALLSIGN）・送ったナンバー（SENTNO・SENT・SNTNO など）・
 * 受けたナンバー（RCVDNO・RCVNO・RCVD など）がこの順にある、タブを使っていない行のときだけ {sent, rcvd, mlt}（文字の位置。
 * マルチの列がなければ mlt は -1）を返す。そうでなければ null。マルチ・得点の見出しは次の行に分かれていてもよい（その列は欄を順に読む）
 */
function logColumns(line) {
  if (/\t/.test(line)) return null;
  const up = String(line).toUpperCase();
  const at = function (re) { const m = re.exec(up); return m ? m.index + m[0].length - m[0].replace(/^\s+/, '').length : -1; };
  const date = at(/(^|\s)DATE\b/), time = at(/\sTIME\b/), band = at(/\sBAND\b/), mode = at(/\sMODE\b/),
    call = at(/\sCALL(SIGN)?\b/), sent = at(/\sS(E)?NT(-?NO|-?NR)?\b/), rcvd = at(/\sRC(V|VD)(-?NO|-?NR)?\b/), mlt = at(/\sMULTI?\b|\sMLT\b/);
  if ([date, time, band, mode, call, sent, rcvd].some(function (x) { return x < 0; })) return null;
  if (!(date < time && time < band && band < mode && mode < call && call < sent && sent < rcvd)) return null;
  return { sent: sent, rcvd: rcvd, mlt: mlt > rcvd ? mlt : -1 };
}

/**
 * 交信の行（1行）で、見出しの「送ったナンバー」「受けたナンバー」の列の範囲が全部空白か（その欄が空か）。{sent, rcvd}。
 * どちらも空でなければ null（欄を順に読む）。値が見出しの位置からはみ出して書かれたログも多いので、
 * 列の範囲が全部空白のときだけ「欄が空」とみなす（はみ出しているときは空白にならないので、今までどおり順に読む）
 */
function blankFields(line, cols) {
  const s = String(line).replace(/\s+$/, '');
  if (s.length <= cols.rcvd) return null;
  const blank = function (a, b) { return a < b && !/\S/.test(s.substring(a, b)); };
  const sent = blank(cols.sent, cols.rcvd);
  const rcvd = cols.mlt > cols.rcvd && s.length > cols.mlt && blank(cols.rcvd, cols.mlt);
  return sent || rcvd ? { sent: sent, rcvd: rcvd } : null;
}

/** 1行を項目に分ける：タブ区切り・カンマ区切り・空白区切り（空の項目は捨てる） */
function splitLogTokens(s) {
  let t;
  if (s.indexOf('\t') >= 0) t = s.split('\t');
  else if (s.indexOf(',') >= 0 && s.split(/\s+/).length < 9) t = s.split(',');
  else t = s.split(/\s+/);
  // タブ・カンマ区切りでも、1つの欄に「59 13」「2024-05-12 08:50」のように数字が空白で並んでいるときは分ける
  const out = [];
  t.forEach(function (x) {
    x = x.trim();
    if (/^[\d\-\/:.]+J?(\s+[\d\-\/:.]+J?)+$/i.test(x)) x.split(/\s+/).forEach(function (y) { out.push(y); });
    else if (x !== '') out.push(x);
  });
  return out;
}

const DATE_TOKEN_RE = /^(\d{4}|\d{2})[-\/](\d{1,2})[-\/](\d{1,2})$/;
const TIME_TOKEN_RE = /^(\d{1,2}):?(\d{2})(?::\d{2})?J?$/i;

/** 交信の行（日付で始まる行）か。「M DD 時刻」も日付とみなす */
function startsWithDate(toks) {
  if (DATE_TOKEN_RE.test(toks[0] || '')) return true;
  return /^\d{1,2}$/.test(toks[0] || '') && /^\d{1,2}$/.test(toks[1] || '') && TIME_TOKEN_RE.test(toks[2] || '');
}

/** モードとして読む語 */
const LOG_MODES = ['CW', 'SSB', 'LSB', 'USB', 'FM', 'AM', 'DV', 'RTTY', 'FSK', 'PSK', 'PSK31', 'FT8', 'FT4', 'JT65', 'DATA', 'DIG',
  'SSTV', 'ATV', 'PH', 'PHONE', 'C4FM', 'DMR', 'DSTAR', 'D-STAR', 'MIX', 'FAX', 'TV'];
/** 呼出符号らしい語（英字と数字がまじり、数字の後に英字がある） */
const LOG_CALL_RE = /^([A-Z0-9]{1,4}\/)?[A-Z0-9]*[A-Z][A-Z0-9]*\d+[A-Z]+[A-Z0-9]*(\/[A-Z0-9]{1,4})?$|^\d[A-Z]\d[A-Z]+(\/[A-Z0-9]{1,4})?$/i;
/** バンドらしい語（周波数の数字。単位が付いてもよい。0で始まる数字はナンバーなので除く） */
const LOG_BAND_RE = /^([1-9]\d*(\.\d+)?|0\.\d+)(K|KHZ|M|MHZ|G|GHZ)?$/i;
/** アマチュアバンドの周波数（MHz）の範囲 */
const HAM_BAND_RANGES_MHZ = [[1.8, 2], [3.5, 3.8], [4.6, 4.7], [7, 7.3], [10, 10.2], [14, 14.4], [18, 18.2], [21, 21.5], [24, 25], [28, 29.7],
  [50, 54], [144, 146], [430, 440], [1200, 1300], [2300, 2450], [5600, 5900], [10000, 10500], [24000, 24250], [47000, 47200], [75000, 81000]];
/** バンドの語を周波数（MHz）にする（例：144→144、1.2G→1200、10G→10000、7MHz→7）。数字でなければ null */
function bandTokenMHz(t) {
  const m = /^([0-9]+(?:\.[0-9]+)?)(K|KHZ|M|MHZ|G|GHZ)?$/i.exec(String(t).trim());
  if (!m || /^0\d/.test(m[1])) return null;
  let v = +m[1];
  const u = (m[2] || '').toUpperCase();
  if (u === 'K' || u === 'KHZ') v = v / 1000;
  else if (u === 'G' || u === 'GHZ') v = v * 1000;
  return v;
}

/** バンドとして読める語か（例：50、144、432、1295、1.2G、10G、7MHz、2400） */
function isBandToken(t) {
  const v = bandTokenMHz(t);
  return v != null && HAM_BAND_RANGES_MHZ.some(function (r) { return v >= r[0] && v <= r[1]; });
}

/** RSTだけの語（電話 59 など2桁、電信 599 など3桁） */
const LOG_RST_RE = /^[1-5][1-9][1-9]?$/;

/**
 * 交信1件を読む。項目の並び順は書き方（ソフト）によって違うので、項目の中身から決める。
 *   JARL形式 : 年月日 時分 バンド モード 相手局 送信RST 送信No 受信RST 受信No [マルチ] [得点]
 *   ハムログ : YY/MM/DD 時分 バンド モード 相手局 送信RST+No 受信RST+No [マルチ] [得点] [運用者]
 *   zLog     : 月 日 時分 相手局 送信RST+No 受信RST+No [マルチ] バンド モード [得点] [メモ]
 *   手入力など: 年月日 時分 相手局 RST No RST No [マルチ] バンド モード [得点（次の行でもよい）]
 * 決め方
 *   ・最初の2つ（または「月 日 時分」の3つ）が日付と時刻
 *   ・相手局：最初の呼出符号らしい語（あとの呼出符号らしい語は運用者などとして無視）
 *   ・モード：モードの語。バンド：モードのすぐ前（なければすぐ後）の周波数の数字
 *   ・残りの数字を順に、送信（RST＋No）、受信（RST＋No）、マルチ、得点とする。
 *     RSTとNoが別の項目ならそのまま、つながっていれば（590813 など）電信は3桁・それ以外は2桁でRSTを分ける
 *   ・マルチと得点の片方しかないとき、1桁の数字か「DUP」なら得点、それ以外はマルチ
 * 読んだあと、年月日は YYYY-MM-DD、時分は hh:mm にそろえる（元の行はそのまま）。
 * 年のない日付・2桁の年は defaultYear（宣誓の日付の年など）を使い、年のない日付には yearGuessed を付ける（審査で開催期間の年に合わせ直す）
 * fields（blankFields の戻り値）で、送ったナンバー・受けたナンバーの欄が空と分かっていれば、その欄は空にして残りを順に読む
 */
function parseJarlQsoTokens(tokIn, defaultYear, fields) {
  const tok = tokIn.slice();
  const z2 = function (n) { return (+n < 10 ? '0' : '') + (+n); };
  let date, yearGuessed = false, i;
  const dm = DATE_TOKEN_RE.exec(tok[0]);
  if (dm) {
    let y = dm[1];
    if (y.length === 2) y = String(Math.floor((defaultYear || new Date().getFullYear()) / 100) * 100 + +y);
    if (+dm[2] < 1 || +dm[2] > 12 || +dm[3] < 1 || +dm[3] > 31) return { error: '年月日「' + tok[0] + '」が正しくありません' };
    date = y + '-' + z2(dm[2]) + '-' + z2(dm[3]); i = 1;
  } else if (/^\d{1,2}$/.test(tok[0]) && /^\d{1,2}$/.test(tok[1] || '')) {
    if (+tok[0] < 1 || +tok[0] > 12 || +tok[1] < 1 || +tok[1] > 31) return { error: '月日「' + tok[0] + ' ' + tok[1] + '」が正しくありません' };
    date = (defaultYear || new Date().getFullYear()) + '-' + z2(tok[0]) + '-' + z2(tok[1]); yearGuessed = true; i = 2;
  } else return { error: '年月日がYYYY-MM-DD（またはYYYY/MM/DD、YY/MM/DD、M DD）の形ではありません' };
  const tm = TIME_TOKEN_RE.exec(tok[i] || '');
  if (!tm) return { error: '時分がhh:mm（またはhhmm、hh:mmJ）の形ではありません' };
  const time = z2(tm[1]) + ':' + tm[2];
  const rest = tok.slice(i + 1).map(function (t) { return t.toUpperCase(); });
  // 相手局
  let callIdx = -1;
  for (let k = 0; k < rest.length; k++) if (LOG_MODES.indexOf(rest[k]) < 0 && LOG_CALL_RE.test(rest[k])) { callIdx = k; break; }
  // モード（知っている語。なければ、英字だけの語）
  let modeIdx = -1;
  for (let k = 0; k < rest.length; k++) if (k !== callIdx && LOG_MODES.indexOf(rest[k]) >= 0) { modeIdx = k; break; }
  if (modeIdx < 0) for (let k = 0; k < rest.length; k++) if (k !== callIdx && /^[A-Z][A-Z0-9\-]{1,5}$/.test(rest[k]) && !/\d[A-Z]/.test(rest[k])) { modeIdx = k; break; }
  if (callIdx < 0) {
    // 呼出符号の形をしていない（誤記など）：英字を含む語のうち、モード以外の最初の語
    for (let k = 0; k < rest.length; k++) if (k !== modeIdx && /[A-Z]/.test(rest[k]) && /\d/.test(rest[k]) && !LOG_BAND_RE.test(rest[k])) { callIdx = k; break; }
    // 数字のない呼出符号（数字の0が英字のOになっている JROAZO など）。審査で無効な呼出符号（B）にする
    if (callIdx < 0) for (let k = 0; k < rest.length; k++) if (k !== modeIdx && LOG_MODES.indexOf(rest[k]) < 0 && /^[A-Z][A-Z0-9\/]{3,}$/.test(rest[k]) && rest[k] !== 'DUP') { callIdx = k; break; }
  }
  if (callIdx < 0) return { error: '相手局の呼出符号が見つかりません' };
  if (modeIdx < 0) return { error: 'モード（FM・SSB・CW など）が見つかりません' };
  // バンド：モードのすぐ前、なければすぐ後の、アマチュアバンドの周波数の数字（得点の「1」やRSTの「599」はバンドにしない）
  let bandIdx = -1;
  [modeIdx - 1, modeIdx + 1].forEach(function (k) {
    if (bandIdx < 0 && k >= 0 && k < rest.length && k !== callIdx && isBandToken(rest[k])) bandIdx = k;
  });
  // アマチュアバンドの周波数でない数字（例：「200」）がモードの隣にあるときは、バンドの書き間違いとして読み、審査で対象バンド外（O）にする
  let badBand = false;
  if (bandIdx < 0) {
    [modeIdx - 1, modeIdx + 1].forEach(function (k) {
      if (bandIdx < 0 && k >= 0 && k < rest.length && k !== callIdx && bandTokenMHz(rest[k]) != null) { bandIdx = k; badBand = true; }
    });
  }
  if (bandIdx < 0) return { error: 'バンド（周波数）が見つかりません' };
  const mode = rest[modeIdx], cw = mode === 'CW';
  // 残り（ナンバー・マルチ・得点）。2つ目からの呼出符号らしい語（運用者）や文字の語（メモ）は除く
  const ex = rest.filter(function (t, k) {
    if (k === callIdx || k === modeIdx || k === bandIdx) return false;
    return /^(\d+[A-Z]*|-|\*|DUP)$/.test(t);
  });
  let e = 0;
  const takeNumber = function () {
    const t = ex[e];
    if (t == null) return null;
    if (LOG_RST_RE.test(t) && ex[e + 1] != null && /^\d+[A-Z]*$/.test(ex[e + 1])) { e += 2; return { rst: t, no: ex[e - 1] }; }
    e += 1;
    const n = cw ? 3 : 2;
    const m = /^(\d+)([A-Z]*)$/.exec(t);
    if (m && m[1].length > n && LOG_RST_RE.test(m[1].substring(0, n))) return { rst: m[1].substring(0, n), no: m[1].substring(n) + m[2] };
    return { rst: '', no: t };
  };
  // 見出しの列で、送ったナンバー・受けたナンバーの欄が空と分かっているときは、その欄を空にして残りを順に読む
  const none = { rst: '', no: '' };
  const sentX = fields && fields.sent ? none : takeNumber();
  const rcvdX = fields && fields.rcvd ? none : takeNumber();
  if (!sentX || !rcvdX || (!sentX.no && !rcvdX.no)) return { error: '項目が足りません（送信・受信のナンバーが見つかりません）' };
  const left = ex.slice(e);
  let mlt = '', pts = '';
  if (left.length >= 2) { mlt = left[0]; pts = left[1]; }
  else if (left.length === 1) { if (/^(\d|DUP)$/.test(left[0])) pts = left[0]; else mlt = left[0]; }
  const sent = splitNumber(sentX.no), rcvd = splitNumber(rcvdX.no);
  const q = {
    date: date, time: time, band: rest[bandIdx], mode: mode, call: rest[callIdx],
    sentRst: sentX.rst, sentNo: sent.no, sentPower: sent.power,
    rcvdRst: rcvdX.rst, rcvdNo: rcvd.no, rcvdPower: rcvd.power,
    mlt: mlt, pts: pts
  };
  if (yearGuessed) q.yearGuessed = true;
  if (badBand) q.badBand = true;
  return q;
}

/** 1行（文字列）を読む（前の版との互換。テストなどで使う） */
function parseJarlQsoLine(s, defaultYear) {
  return parseJarlQsoTokens(splitLogTokens(toHankaku(s).trim()), defaultYear);
}

/** '09M' → {no:'09', power:'M'} */
function splitNumber(s) {
  const m = /^(\d+)([A-Z]*)$/i.exec(String(s || ''));
  return m ? { no: m[1], power: m[2].toUpperCase() } : { no: String(s || '').toUpperCase(), power: '' };
}

// ===== 05_intake.js =====
/**
 * メール受付の中身（GASとNodeの両方で動く部分）
 *   ・メール本文からログを取り出す
 *   ・件名の呼出符号を調べる
 *   ・1つの提出ログを評価して、状態（受付済み・不備あり・受付不可・締切後）と不備の内容を決める
 *   ・同じ局の提出が複数あるとき、どれを採用するかを決める
 * Gmail・ドライブ・スプレッドシートを使う部分は 96_gas_intake.js にある。
 */

const INTAKE_STATUS = {
  OK: '受付済み',          // 不備なし
  PROBLEM: '不備あり',     // 不備はあるが審査はできる（仮に採用し、再提出を頼む）
  REJECT: '受付不可',      // 件名に呼出符号がない・呼出符号が読めない・交信がない・ログが見つからない（採用しない）
  LATE: '締切後'           // 締切より後に届いた（委員会が「採用」にしない限り採用しない）
};

/**
 * 半角で書くべきサマリーシートの項目（タグ → 返信に出す名前）。参加種目コードは別に調べる。
 * 住所・氏名・署名・宣誓文・意見欄・コンテスト名などは日本語で書くので対象外。
 * SCORE は R1.0 の <SCORE BAND=…>（バンドごとの得点）。
 */
const HANKAKU_TAGS = {
  CALLSIGN: '呼出符号', OPCALLSIGN: 'ゲストオペの呼出符号', TOTALSCORE: '総得点', EMAIL: 'メールアドレス',
  POWER: '空中線電力', DATE: '宣誓の日付', TEL: '電話番号', REGCLUBNUMBER: '登録クラブ番号',
  LICENSEDATE: '局免許年月日', AGE: '年齢', FDCOEFF: '局種係数', MULTIOPLIST: 'マルチオペの運用者', SCORE: 'バンドごとの得点'
};

/**
 * 半角で書くべき文字が全角で入っているか：全角の数字・英字、＠．－／：，＋＿＃、全角の空白。
 * 日本語の文で普通に使う全角のかっこ（）や読点などは見ない（電話番号の「（自宅）」などで不備にしないため）。
 */
function hasZenkaku(s) {
  return /[０-９Ａ-Ｚａ-ｚ＠．－／：，＋＿＃\u3000]/.test(String(s || ''));
}

/** 文中から日本の呼出符号らしいものを取り出す（大文字・半角にして、移動表示つきのまま返す） */
function findCallsInText(text) {
  const s = toHankaku(text).toUpperCase();
  const re = /(?:^|[^A-Z0-9])((?:J[A-S]|7[J-N]|8[J-N])[0-9][A-Z]{1,4}(?:\/[0-9A-Z]{1,4})?)(?![A-Z0-9])/g;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    if (out.indexOf(m[1]) < 0) out.push(m[1]);
    re.lastIndex = m.index + m[0].length;
  }
  return out;
}

/** 本文などの文字列から <SUMMARYSHEET> 〜 </LOGSHEET> を取り出す。なければ null */
function extractLogFromText(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n');
  const start = src.search(/<SUMMARYSHEET\b/i);
  if (start < 0) return null;
  const rest = src.substring(start);
  const end = /<\/LOGSHEET\s*>/i.exec(rest);
  return end ? rest.substring(0, end.index + end[0].length) : rest;
}

/** 文字列にログ（サマリーシート）が入っているか */
function looksLikeLog(text) {
  return /<SUMMARYSHEET\b/i.test(String(text || ''));
}

/**
 * 1つの提出ログを評価する。
 *   parsed      : parseJarlLog の戻り値
 *   info        : {subject, receivedMinutes, deadlineMinutes(null可)}
 *   cfg         : コンテスト設定（configJa0Vhf2026 の形）
 * 戻り値: {call(正規化), callText, category, section（開催部門。開催部門のないコンテストは ''）, qsoCount, declaredTotal, status,
 *          problems:[{level,message}], judgeable}
 */
function evaluateSubmission(parsed, info, cfg) {
  const problems = parsed.problems.slice();
  const s = parsed.summary;
  const call = normalizeCall(s.CALLSIGN || '');
  const code = String(s.CATEGORYCODE || '').toUpperCase().trim();
  const add = function (lv, m) { problems.push({ level: lv, message: m }); };

  if (s.CALLSIGN && !call.valid) add('不備', '呼出符号「' + s.CALLSIGN + '」の形式が正しくありません');
  // 半角で書くべき項目に全角の英数字・記号が入っていないか（参加種目コードは下で別に調べる）
  Object.keys(s).forEach(function (key) {
    const tag = key.split(' ')[0];
    if (!HANKAKU_TAGS[tag] || !hasZenkaku(s[key])) return;
    const han = String(s[key]).replace(/[０-９Ａ-Ｚａ-ｚ＠．－／：，＋＿＃]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, ' ');
    add('不備', HANKAKU_TAGS[tag] + '「' + s[key] + '」に全角の文字が入っています。' +
      HANKAKU_TAGS[tag] + 'が全角文字になっていませんか？（半角の「' + han + '」で書いてください）');
  });
  // ログ部（交信データ）の全角
  const zLines = parsed.qsos.filter(function (q) { return hasZenkaku(q.line); }).map(function (q) { return q.lineNo + '行目'; });
  if (zLines.length) {
    add('不備', 'ログシートの交信データ ' + zLines.length + ' 行に全角の文字が入っています（' +
      zLines.slice(0, 5).join('、') + (zLines.length > 5 ? ' ほか' : '') + '）。交信データが全角文字になっていませんか？（日付・時刻・呼出符号・ナンバーなどは半角で書いてください）');
  }
  if (code && cfg.checklogCodes.indexOf(code) < 0 &&
      !cfg.categories.some(function (c) { return c.code === code; })) {
    let msg = '参加種目コード「' + code + '」は、このコンテストの種目にありません。';
    // 全角の英数字が入っているときは、全角になっていないか尋ねる
    const han = toHankaku(code).toUpperCase().replace(/\s+/g, '');
    if (han !== code.replace(/\s+/g, '')) {
      const ok = cfg.checklogCodes.indexOf(han) >= 0 || cfg.categories.some(function (c) { return c.code === han; });
      msg += '参加種目コードが全角文字になっていませんか？' + (ok ? '（半角の「' + han + '」で書いてください）' : '（半角の英数字で書いてください）');
    }
    add('不備', msg);
  }
  // 開催部門（開催部門のあるコンテストだけ。審査の judgeContestSections と同じ決め方：intakeSection）
  const sec = intakeSection(parsed, cfg);
  const knownCode = !code || cfg.checklogCodes.indexOf(code) >= 0 || cfg.categories.some(function (c) { return c.code === code; });
  if (sec.unknown && knownCode) {
    add('不備', '参加種目コード「' + (code || '（空欄）') + '」は、どの開催部門（' + cfg.sections.map(function (x) { return x.name; }).join('・') +
      '）の種目にも当たりません。参加した開催部門の種目コードで書いてください');
  }
  // 種目にモードがあれば（電信の種目など）、ほかのモードの交信を知らせる（審査で得点に入れないので、不備にはしない。No.146 の 2a）
  const cat = cfg.categories.filter(function (c) { return c.code === code; })[0];
  if (cat && cat.mode) {
    const other = parsed.qsos.filter(function (q) { const m = intakeModeClass(q, cfg); return m && m !== cat.mode; }).map(function (q) { return q.lineNo; });
    if (other.length) {
      add('注意', '参加種目「' + code + '」は' + cat.mode + 'の種目ですが、' + cat.mode + 'でない交信が ' + other.length + ' 行あります（' +
        lineRangesText(other) + '）。この交信は得点に入りません');
    }
  }

  // 件名の呼出符号（必須。なければ受付不可）
  const ignore = contestNameCallLikes(cfg);
  const subjCalls = findCallsInText(info.subject || '').filter(function (c) { return ignore.indexOf(contestNameKey(c)) < 0; });
  const noSubjectCall = subjCalls.length === 0;
  if (noSubjectCall) {
    add('不備', '件名に呼出符号が書かれていないため、受け付けられません（件名に貴局の呼出符号を入れて、もう一度送ってください）');
  } else if (call.base && !subjCalls.some(function (c) { return normalizeCall(c).base === call.base; })) {
    add('注意', '件名の呼出符号（' + subjCalls.join('、') + '）と、ログの呼出符号（' + call.full + '）が違います');
  }

  // コンテスト名（審査と同じ照合：20_judge.js の contestNameMatches。「ＪＡφ－ＶＨＦ」も「JA0VHF」として比べ、
  // contestNameKeywords は全部、contestNameAnyOf はまとまりごとにどれか1つが入っていればよい。申し送り No.144）
  if (s.CONTESTNAME && !contestNameMatches(s.CONTESTNAME, cfg)) {
    add('注意', 'コンテスト名「' + s.CONTESTNAME + '」が、このコンテストと違う可能性があります');
  }

  // 送ったナンバー・受けたナンバーの欄が空の交信（列の位置がそろった形のログだけ分かる。04_parser.js の missingSent・missingRcvd）。
  // 書類の不備として出し直しを頼む（申し送り No.99。文はユーザーが決めた）。得点の欄が空・マルチが「-」は、注意も出さない
  [['送信', parsed.missingSent], ['受信', parsed.missingRcvd]].forEach(function (m) {
    if (!m[1] || !m[1].length) return;
    add('不備', m[0] + 'ナンバーに不備があります（' + lineRangesText(m[1]) + '）。直したログを出し直してください。' +
      '出し直しがない場合は、委員会の判断で失格になることがあります');
  });

  // 交信の日時がすべて開催期間外（別の年のログなど）。開催部門が分かれば、その開催部門の開催期間で。時報まで（endExclusive）なら終了の分ちょうどは外
  const periods = sec.section ? cfg.sections.filter(function (x) { return x.name === sec.section; })[0].periods : cfg.periods;
  if (parsed.qsos.length && periods && periods.length) {
    const inside = parsed.qsos.some(function (q) {
      const m = jstToMinutes(q.date, q.time);
      return m != null && inPeriods(periods, m, cfg.endExclusive);
    });
    if (!inside) add('注意', '交信の日時がすべて開催期間の外です（別の年や別のコンテストのログではありませんか）');
  }

  const judgeable = call.valid && parsed.qsos.length > 0;
  let status;
  if (noSubjectCall) status = INTAKE_STATUS.REJECT;
  else if (info.deadlineMinutes != null && info.receivedMinutes > info.deadlineMinutes) status = INTAKE_STATUS.LATE;
  else if (!judgeable) status = INTAKE_STATUS.REJECT;
  else if (problems.some(function (p) { return p.level === '不備'; })) status = INTAKE_STATUS.PROBLEM;
  else status = INTAKE_STATUS.OK;

  const tot = String(s.TOTALSCORE || '').trim();
  return {
    call: call, callText: call.full || '', category: code, section: sec.section, qsoCount: parsed.qsos.length,
    declaredTotal: /^\d+$/.test(tot) ? +tot : (tot || ''),
    status: status, problems: sortProblems(problems), judgeable: judgeable
  };
}

/** 不備を先、注意を後に並べる */
function sortProblems(list) {
  const order = { '不備': 0, '要確認': 1, '注意': 2 };
  return list.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) {
    return ((order[a.p.level] == null ? 3 : order[a.p.level]) - (order[b.p.level] == null ? 3 : order[b.p.level])) || a.i - b.i;
  }).map(function (x) { return x.p; });
}

/** 不備の内容を「・〜」の行にする */
function problemsText(problems) {
  return problems.map(function (p) { return '・【' + p.level + '】' + p.message; }).join('\n');
}

/**
 * 局ごとに採用する提出を決める。
 * rows: [{key, base(移動表示を除いた呼出符号), receivedAt('YYYY-MM-DD hh:mm:ss'), status, decision('採用'|'不採用'|'')}]
 * 決まり：
 *   decision は adoptDecision()（局の一覧の「採用する受付番号」から）で「採用」「不採用」「」にしたもの
 *   1. 「採用」のものがあれば、そのうち一番新しいもの
 *   2. なければ、「不採用」以外で状態が 受付済み・不備あり のもののうち一番新しいもの（後の提出を採用）
 *   受付不可・締切後は、委員会が「採用」にしない限り採用しない
 * 戻り値: {base: key}
 */
function chooseAdopted(rows) {
  const byBase = {};
  rows.forEach(function (r) { if (r.base) (byBase[r.base] = byBase[r.base] || []).push(r); });
  const out = {};
  Object.keys(byBase).forEach(function (b) {
    const list = byBase[b].slice().sort(function (x, y) { return x.receivedAt < y.receivedAt ? 1 : x.receivedAt > y.receivedAt ? -1 : 0; });
    const forced = list.filter(function (r) { return r.decision === '採用'; })[0];
    const auto = list.filter(function (r) {
      return r.decision !== '不採用' && (r.status === INTAKE_STATUS.OK || r.status === INTAKE_STATUS.PROBLEM);
    })[0];
    const pick = forced || auto;
    if (pick) out[b] = pick.key;
  });
  return out;
}

/**
 * 局の一覧の「採用する受付番号」（adoptNo）から、受付番号 intakeNo の提出の扱いを決める。
 *   「採用」：adoptNo がこの受付番号（全角・小文字・空白は問わない。「12」「012」のように数字だけでも、通し番号が同じならよい）
 *   「不採用」：adoptNo が「なし」（その局は1つも採用しない。「無し」「☓」「×」「不採用」も同じ）
 *   「」：adoptNo が空（自動の決まり）、または別の受付番号
 */
function adoptDecision(adoptNo, intakeNo) {
  const a = adoptNoKey_(adoptNo), b = adoptNoKey_(intakeNo);
  if (!a) return '';
  if (adoptNoIsNone(adoptNo)) return '不採用';
  if (!b) return '';
  if (a === b) return '採用';
  const m = /(\d+)$/.exec(b);
  if (/^\d+$/.test(a) && m && +a === +m[1]) return '採用';
  return '';
}

/** 「採用する受付番号」が「なし」（その局は採用しない）か */
function adoptNoIsNone(adoptNo) {
  return /^(なし|無し|☓|×|✕|✖|X|不採用)$/.test(adoptNoKey_(adoptNo));
}

function adoptNoKey_(v) {
  return toHankaku(String(v == null ? '' : v)).replace(/\s+/g, '').toUpperCase();
}

/** 返信文面の {差し込み} を置き換える */
function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{([^{}]+)\}/g, function (all, k) {
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : all;
  });
}

/** ミリ秒（Dateの値）をJSTの 'YYYY-MM-DD hh:mm:ss' にする */
function msToJstSeconds(ms) {
  const dt = new Date(ms + 9 * 3600000);
  const z = function (n) { return (n < 10 ? '0' : '') + n; };
  return dt.getUTCFullYear() + '-' + z(dt.getUTCMonth() + 1) + '-' + z(dt.getUTCDate()) + ' ' +
    z(dt.getUTCHours()) + ':' + z(dt.getUTCMinutes()) + ':' + z(dt.getUTCSeconds());
}

/** 自動返信してはいけないメールか（エラー通知・自動応答・メーリングリストなど） */
function isAutoMail(from, headers) {
  const f = String(from || '').toLowerCase();
  if (/mailer-daemon|postmaster|no-?reply|do-?not-?reply/.test(f)) return true;
  const h = function (k) { return String((headers && headers[k]) || '').toLowerCase().trim(); };
  if (h('Auto-Submitted') && h('Auto-Submitted') !== 'no') return true;
  if (/^(bulk|list|junk|auto_reply)$/.test(h('Precedence'))) return true;
  if (h('X-Autoreply') || h('X-Autorespond') || h('List-Id')) return true;
  return false;
}


// ------------------------------------------------------------------ Webの提出（「提出ログ/Web受付」の箱）
/**
 * 「Web受付」のファイルの説明欄（JSON）を読む。箱の決まりの形でなければ null。
 * 決まり：{"web":1, "submittedAt":"2026-05-12 21:34:05", "email":"…", "paper":false, "arrivedDate":"", "id":"W20260512213405-xxxx"}
 */
function parseWebIntakeMeta(desc) {
  let m;
  try { m = JSON.parse(String(desc || '')); } catch (e) { return null; }
  if (!m || typeof m !== 'object' || +m.web !== 1 || !m.id) return null;
  if (jstStringToMinutes(String(m.submittedAt || '')) == null) return null;
  return { submittedAt: String(m.submittedAt).trim(), email: String(m.email || '').trim(), paper: m.paper === true || m.paper === 'true',
    arrivedDate: String(m.arrivedDate || '').trim(), id: String(m.id).trim() };
}

/**
 * Webの提出の受付日時・送信元・件名の列・返信の列を決める（parseWebIntakeMeta の戻り値から）
 *   受付日時：submittedAt。紙ログで届いた日（YYYY-MM-DD）があれば、その日の 00:00:00（締切の判定もこれ。ログ入力フォームの判定と同じ）
 *   送信元：email。紙ログでメールアドレスが空なら「紙ログ（郵送）」
 *   返信：メールアドレスがあれば「未送信」（そのアドレスに受付のメールを送る）。なければ送らない
 * 戻り値 {received, receivedMinutes, from, subject, reply}
 */
function webIntakeInfo(meta) {
  const ad = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(meta.arrivedDate);
  const z = function (n) { return ('0' + n).slice(-2); };
  const arrived = meta.paper && ad ? ad[1] + '-' + z(ad[2]) + '-' + z(ad[3]) : '';
  const received = arrived ? arrived + ' 00:00:00' : meta.submittedAt;
  const sec = /:(\d{2}):(\d{2})$/.exec(received);
  const receivedMinutes = jstStringToMinutes(received) + (sec ? +sec[2] / 60 : 0);
  const from = meta.email || (meta.paper ? '紙ログ（郵送）' : '（メールアドレスなし）');
  const subject = meta.paper ? '紙ログ（届いた日 ' + (arrived || '記入なし') + '、委員がフォームで入力 ' + meta.submittedAt + '）'
    : 'Webで提出（' + meta.submittedAt + '）';
  const reply = meta.email ? '未送信' : meta.paper ? '送らない（紙ログ）' : '送らない（メールアドレスなし）';
  return { received: received, receivedMinutes: receivedMinutes, from: from, subject: subject, reply: reply };
}

/**
 * 受付で受信トレイを探す Gmail の検索の文。to（受け付けるメールの宛先）が空なら、受信トレイの全部（自分が送ったものを除く）。
 * 書いてあれば、その宛先に届いたメールだけ。宛先は Delivered-To（実際に届いた宛先）・To・Cc のどれかに入っていればよい
 * （Gmail の { } は「どれか」の意味）
 */
function intakeMailQuery(to) {
  const t = String(to || '').trim().replace(/[\s"{}()]/g, '');
  return 'in:inbox -from:me' + (t ? ' {deliveredto:' + t + ' to:' + t + ' cc:' + t + '}' : '');
}

/** 行番号の配列を「29〜45行目、50行目」のように、続いている所をまとめた文にする（6つ目のまとまりから先は「ほか」） */
function lineRangesText(lines) {
  const ns = (lines || []).map(Number).filter(function (n) { return n > 0; }).sort(function (a, b) { return a - b; });
  const parts = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    parts.push(j > i ? ns[i] + '〜' + ns[j] + '行目' : ns[i] + '行目');
    i = j;
  }
  return parts.slice(0, 5).join('、') + (parts.length > 5 ? ' ほか' : '');
}

/**
 * 件名で呼出符号のように見えても、コンテスト名の語なので呼出符号として扱わないもの（例：「JA0」「VHF」→「JA0VHF」）。
 * contestNameKeywords（全部入る語）をつなげたものと、contestNameAnyOf（まとまりごとにどれか1つ）の語を1つずつ選んでつなげたもの。
 * どれも contestNameKey（20_judge.js）の形（全角は半角、大文字、空白・ハイフンなし）で返す
 */
function contestNameCallLikes(cfg) {
  let list = [(cfg.contestNameKeywords || []).join('')];
  (cfg.contestNameAnyOf || []).forEach(function (g) {
    if (!g || !g.length) return;
    const next = [];
    list.forEach(function (head) { g.forEach(function (w) { next.push(head + w); }); });
    if (next.length <= 50) list = next; // 組み合わせが多すぎるときは足さない
  });
  return list.map(function (x) { return contestNameKey(x); }).filter(function (x) { return x; });
}

/** 分 min が開催期間 periods（[{start, end}]）のどれかに入るか。exclusive（時報まで）なら終了の分ちょうどは入らない */
function inPeriods(periods, min, exclusive) {
  return (periods || []).some(function (p) {
    const st = jstStringToMinutes(p.start), en = jstStringToMinutes(p.end);
    return st != null && en != null && min >= st && (exclusive ? min < en : min <= en);
  });
}

/** 交信のモードの分け方（'電信'・'電話'・null）。審査（20_judge.js）と同じ：cwModes、RSTが3桁なら電信（cwIfRst3）、phoneModes */
function intakeModeClass(q, cfg) {
  const mode = String(q.mode || '').toUpperCase();
  if ((cfg.cwModes || []).indexOf(mode) >= 0 || (cfg.cwIfRst3 && /^\d{3}$/.test(String(q.rcvdRst || '')))) return '電信';
  return (cfg.phoneModes || []).indexOf(mode) >= 0 ? '電話' : null;
}

/**
 * ログの開催部門（審査の judgeContestSections と同じ決め方）。{section（開催部門名。分からなければ ''）, unknown（開催部門があるのに当たらない）}
 *   開催部門のないコンテスト（cfg.sections が空）は {section: '', unknown: false}
 *   申告の種目コードの開催部門（cfg.categories[].section）。チェックログの種目コードは、交信の日時がいちばん多く入る開催部門
 */
function intakeSection(parsed, cfg) {
  const secs = cfg.sections || [];
  if (!secs.length) return { section: '', unknown: false };
  const code = String(parsed.summary.CATEGORYCODE || '').toUpperCase().trim();
  const cat = cfg.categories.filter(function (c) { return c.code === code; })[0];
  let sec = cat && cat.section ? cat.section : '';
  if (!sec && cfg.checklogCodes.indexOf(code) >= 0) {
    const count = {};
    parsed.qsos.forEach(function (q) {
      const m = jstToMinutes(q.date, q.time);
      if (m == null) return;
      secs.forEach(function (x) { if (inPeriods(x.periods, m, cfg.endExclusive)) count[x.name] = (count[x.name] || 0) + 1; });
    });
    sec = secs.map(function (x) { return x.name; }).filter(function (n) { return count[n]; }).sort(function (a, b) { return count[b] - count[a]; })[0] || '';
  }
  return { section: sec, unknown: !sec };
}
// ===== 10_config_ja0vhf2026.js =====
/**
 * 設定例：JA0 VHFコンテスト2026
 *
 * 本番では設定ブック（スプレッドシート）の日本語の表から、この形のデータを作る。
 * 規約：https://www.jarl.com/zerocontest/rule2026/ja0vhf2026.pdf
 */
function configJa0Vhf2026() {
  return {
    contestName: 'JA0 VHFコンテスト',           // 年は入れない（開催期間から自動で付く）
    contestNumber: '',                          // 開催回（例 73）。空なら表示しない
    contestNameKeywords: ['JA0', 'VHF'],         // CONTESTNAMEにこの語が全部含まれていなければ注意
    contestNameAnyOf: [],                       // どれか1つが入っていればよい語のまとまり（例：[['ギガヘルツ', 'GHZ']]）。規約_基本で「ギガヘルツ／GHZ」と書く
    periods: [{ start: '2026-05-09 21:00', end: '2026-05-10 12:00' }], // JST
    timeToleranceMin: 5,                        // クロスチェックの時刻の許容誤差（前後の分）

    // バンド：ログ上の表記 → バンド名。mhz は周波数の範囲（ログに 145・432 などの周波数で書かれていても、この範囲ならそのバンド）。group は部門のまとまり
    bands: [
      { name: '50MHz', labels: ['50', '50M', '50MHZ'], mhz: [50, 54] },
      { name: '144MHz', labels: ['144', '144M', '144MHZ'], mhz: [144, 146] },
      { name: '430MHz', labels: ['430', '430M', '430MHZ', '433'], mhz: [430, 440] },
      { name: '1200MHz', labels: ['1200', '1.2G', '1.2GHZ', '1295'], mhz: [1200, 1300], group: '1200MHz以上' },
      { name: '2400MHz', labels: ['2400', '2.4G', '2.4GHZ'], mhz: [2300, 2450], group: '1200MHz以上' },
      { name: '5600MHz', labels: ['5600', '5.6G', '5.6GHZ'], mhz: [5600, 5900], group: '1200MHz以上' },
      { name: '10GHz以上', labels: ['10G', '10GHZ', '10.1G', '10.4G', '24G', '47G', '75G', '77G', '10000', '10100', '10400', '24000', '47000', '75000', '77000'], mhz: [10000, 300000], group: '1200MHz以上' }
    ],

    // モード：電信／電話の区分
    cwModes: ['CW'],
    phoneModes: ['SSB', 'AM', 'FM', 'DV'],
    cwIfRst3: true,                             // RSTが3桁なら電信とみなす

    // 局区分
    homePrefs: ['08', '09'],                    // 信越（新潟県・長野県）
    homeArea: '0',
    homeName: '信越',
    homeStationBy: 'addressAndOperation',      // 管内局の決め方：'operation'＝管内で運用した局、'addressAndOperation'＝管内に住所があり、管内で運用した局（JA0 VHF）
    opTerms: 'individualClub',                 // シングルオペ・マルチオペの呼び方：'individualClub'＝個人／社団（JA0 VHF の規約）、'singleMulti'＝シングルオペ／マルチオペ

    // 送るナンバーの種類：管内から＝市郡区、管外から＝都府県支庁
    insideNumberKinds: ['市', '郡', '区'],
    outsideNumberKinds: ['都府県支庁'],
    sendPower: false,                           // 電力記号を送らない

    // 種目
    categories: [
      { code: 'NNSM', name: '長野県内局 個人 マルチバンド', cls: '管内局', pref: '09', op: '個人', bands: null, mode: '', section: '' },
      { code: 'NNS50', name: '長野県内局 個人 50MHz', cls: '管内局', pref: '09', op: '個人', bands: ['50MHz'], mode: '', section: '' },
      { code: 'NNS144', name: '長野県内局 個人 144MHz', cls: '管内局', pref: '09', op: '個人', bands: ['144MHz'], mode: '', section: '' },
      { code: 'NNS430', name: '長野県内局 個人 430MHz', cls: '管内局', pref: '09', op: '個人', bands: ['430MHz'], mode: '', section: '' },
      { code: 'NNS1200', name: '長野県内局 個人 1200MHz以上', cls: '管内局', pref: '09', op: '個人', bandGroup: '1200MHz以上', mode: '', section: '' },
      { code: 'NNCM', name: '長野県内局 社団 マルチバンド', cls: '管内局', pref: '09', op: '社団', bands: null, mode: '', section: '' },
      { code: 'NISM', name: '新潟県内局 個人 マルチバンド', cls: '管内局', pref: '08', op: '個人', bands: null, mode: '', section: '' },
      { code: 'NIS50', name: '新潟県内局 個人 50MHz', cls: '管内局', pref: '08', op: '個人', bands: ['50MHz'], mode: '', section: '' },
      { code: 'NIS144', name: '新潟県内局 個人 144MHz', cls: '管内局', pref: '08', op: '個人', bands: ['144MHz'], mode: '', section: '' },
      { code: 'NIS430', name: '新潟県内局 個人 430MHz', cls: '管内局', pref: '08', op: '個人', bands: ['430MHz'], mode: '', section: '' },
      { code: 'NIS1200', name: '新潟県内局 個人 1200MHz以上', cls: '管内局', pref: '08', op: '個人', bandGroup: '1200MHz以上', mode: '', section: '' },
      { code: 'NICM', name: '新潟県内局 社団 マルチバンド', cls: '管内局', pref: '08', op: '社団', bands: null, mode: '', section: '' },
      { code: 'SGSM', name: '管外局 個人 マルチバンド', cls: '管外局', pref: null, op: '個人', bands: null, mode: '', section: '' },
      { code: 'SGCM', name: '管外局 社団 マルチバンド', cls: '管外局', pref: null, op: '社団', bands: null, mode: '', section: '' }
    ],
    // 種目の mode：'電話'・'電信'、空なら両方（MIX）。section：開催部門名（「規約_開催部門」。新潟の「7MHz部門」など）。JA0 VHF は使わない
    checklogCodes: ['CHECKLOG', 'CHECK', 'CL'],

    // 開催部門：[{ name: '7MHz部門', periodLabels: ['開催期間1'], order: 1 }]。periods は「基本設定」から loadConfigFor_ が入れる。JA0 VHF は使わない
    sections: [],

    // 交信相手：信越の外から参加した局は、信越の市郡区ナンバーを送る局とだけ交信できる
    outsideMayWorkOnlyHome: true,

    // マルチ：局区分ごとに数えるナンバー（バンドごと）
    multiRules: {
      '管内局': { home: ['市', '郡', '区'], other: ['都府県支庁'] },
      '管外局': { home: ['市', '郡', '区'], other: [] }
    },

    pointsPerQso: 1,
    dupUnit: 'band',                            // 'band'・'bandmode'（電信と電話）・'bandrawmode'（ログのモード欄ごと）
    dupPreferCw: true,                          // 重複のときは電信を優先する（規約_基本。審査担当が使う。申し送り No.102）
    endExclusive: false,                        // true＝終了の分ちょうどの交信は時間外（時報まで）
    checkSentChange: false,                     // true＝1通のログの中で送ったナンバーが変わっていたら要確認
    pointRules: [],                             // バンドごとの得点 [{ band: '2400MHz', points: 2 }]（「規約_得点」）。書いていないバンドは pointsPerQso
    scoreFormula: 'sumPointsTimesSumMulti',     // 各バンドの得点の合計 × 各バンドのマルチの合計
    tieBreak: 'earlierLastQso',                 // 同点は最終交信時刻が早い局が上位

    // 別枠部門：電信部門（各種目の参加局の電信の交信だけを抜き出して集計。マルチバンドのみ）
    divisions: [
      { name: '電信部門', modeClass: '電信', applyKeyword: '電信部門', opOnly: '個人',
        applyMode: 'declaredOrLog', // 'declared'＝意見欄の申告がある局だけ、'declaredOrLog'＝申告がなくても電信の交信があれば対象
        includeOtherBands: true,    // シングルバンド種目の局の、他バンド（参加種目外）の電信交信も含める
        rankBy: '都府県と管外' }    // 順位の単位：'全体'、'局区分'（管内局・管外局）、'都府県と管外'（長野県・新潟県・管外局）
    ],

    // 申告で入る部門：ジュニア部門（本来の種目の審査後総得点で、県ごとに種目をまぜて順位を付ける）
    entryDivisions: [
      { name: 'ジュニア部門', applyKeyword: 'ジュニア部門', // 意見欄にこの語がある局だけが対象（申告が必要）
        opOnly: '個人', clsOnly: '管内局',
        rankBy: '都府県',            // 順位の単位：'全体' または '都府県'（種目の県＝長野県・新潟県ごと）
        needBirthDate: false,        // true＝意見欄の生年月日を確かめる、false＝申告を信用する（規約のファイルの「規約_部門と表彰」の「生年月日の確認」）
        bornOnOrAfter: '' }          // この日以降に生まれた方（'YYYY-MM-DD'）。生年月日を確かめるときだけ使う。「基本設定」の値で上書きする
    ],

    // 登録クラブ対抗：サマリーシートの登録クラブ番号（REGCLUBNUMBER）が同じ局の、審査後総得点を合計する
    clubCompetition: {
      name: '登録クラブ対抗',
      tag: 'REGCLUBNUMBER',
      clsOnly: '管内局',              // この局区分の局だけを数える（チェックログは数えない）
      homeClubsOnly: true,            // 信越（homePrefs）の登録クラブだけが対象
      rankBy: '都府県'                // 順位の単位：'全体' または '都府県'（登録番号の頭の県＝長野県・新潟県ごと）
    },

    // 表彰：順位表で、表彰する局（クラブ）に色を付ける
    awards: {
      rule: '5局まで1位、10局まで2位、それ以上3位', // 参加局数（順位に入った局・クラブの数）と表彰する順位（規約のファイルの「規約_部門と表彰」の「表彰の基準」）
      top: { name: '信越総合通信局長賞', cls: '管内局', op: '個人', show: 5 }, // 両県を通じて最高得点の個人局（1局）。show＝参考に載せる局数
      rounding: 'ceil',               // 「参加10局につき1局」の書き方の端数：'floor'・'ceil'・'round'（JA0 VHF はこの書き方を使わない）
      areaFirstCls: ''                // この局区分の種目は、上位局のほかにエリア別1位も表彰する（例：'管外局'）。JA0 VHFは管外局全体の順位だけなので使わない
    },

    // 意見欄の案内：ログ入力フォームの意見欄の上に出す文（規約のファイルの「規約_部門と表彰」の「意見欄の案内」。空なら出さない）
    commentGuide: '電信部門・ジュニア部門に申し込む方は、ここに「電信部門」「ジュニア部門」と書いてください。ジュニア部門は生年月日も書いてください（例：ジュニア部門 生年月日 2010年4月5日）',

    // 使うチェックコード
    checks: { D: true, X: true, B: true, N: true, I: true, A: true, O: true, T: true, Q: false, U: true, C: true },

    // 呼出符号の移動表示だけが違う場合（例：相手ログに JA0RL、自局ログに JA0RL/0）の扱い
    portableMismatch: 'X'                       // 'X'＝呼出符号の誤り、'OK'＝一致とみなす
  };
}

// ===== 11_settings.js =====
/**
 * 規約のファイル：規約を書いた日本語の表（シート）から、設定（cfg）を作る・確かめる
 *
 * Googleのサービスを使わない（Node.jsのテスト test/run_settings.js でも動く）。
 * 規約のファイル（審査用とは別のスプレッドシート）とシートを作る・読むのは 92_gas_settings.js。
 *   settingsTablesFromConfig(cfg) … 設定 → 表（「1. 初期設定」でシートに書く中身）
 *   configFromSettingsTables(tables) … 表 → 設定。おかしい値は、シート名・行・直し方を日本語でエラーにする
 * 表は {シート名: 2次元の配列（1行目は見出し）}。列は見出しの名前で探す（列の順番を入れ替えても読める）。
 * コンテスト名・開催回・開催期間・表彰の基準・ジュニア部門の生年月日は、ここでは読まない
 * （今までどおり「基本設定」「開催期間」から 90_gas_main.js の loadConfig_ が入れる）。
 */

const SETTINGS_SHEETS = {
  basic: '規約_基本',
  bands: '規約_バンド',
  categories: '規約_種目',
  multi: '規約_マルチ',
  checks: '規約_チェック',
  divisions: '規約_部門と表彰',
  sections: '規約_開催部門', // 新潟コンテストの「7MHz部門」など（docs/決定_新潟・ギガヘルツ対応.md の 0.）。使わないコンテストは見出しだけ
  points: '規約_得点'        // バンドごとの得点（同 10.）。空なら「規約_基本」の「1交信の得点」
};
// 前の版の規約のファイルにはないシート（なければ空として読む。「1. 初期設定」で作られる）
const SETTINGS_OPTIONAL_SHEETS = ['規約_開催部門', '規約_得点'];
// 前の版のシートにはない列（なければ空として読む。「1. 初期設定」で右の端に足される）
const SETTINGS_OPTIONAL_COLUMNS = { '規約_種目': ['モード', '開催部門'] };
// 「コンテスト名の照合の語」で、どれか1つが入っていればよい語をつなぐ記号（例：ギガヘルツ／GHZ）
const SETTINGS_ANY_OF_MARK = /[／\/]/;

// 選ぶ値：[表の表示, 設定の値]
const SETTINGS_CHOICES = {
  yesNo: [['する', true], ['しない', false]],
  cls: [['管内局', '管内局'], ['管外局', '管外局']],
  op: [['シングルオペ', '個人'], ['マルチオペ', '社団']], // 読むときの言葉（「個人」「社団」も SETTINGS_CHOICE_ALIASES で読む）。中の値は前のまま。書く・出す言葉は呼び方（opTerms）で決める
  opTerms: [['個人／社団', 'individualClub'], ['シングルオペ／マルチオペ', 'singleMulti']],
  numberKind: [['市', '市'], ['郡', '郡'], ['区', '区'], ['都府県支庁', '都府県支庁']],
  dupUnit: [['バンドごと', 'band'], ['バンドとモードごと', 'bandmode'], ['バンドとモード欄ごと', 'bandrawmode']],
  scoreFormula: [['各バンドの得点の合計×各バンドのマルチの合計', 'sumPointsTimesSumMulti']],
  tieBreak: [['最終交信時刻が早い局が上位', 'earlierLastQso'], ['同じ順位にする', 'sameRank']],
  endMinute: [['時間内', false], ['時間外（時報まで）', true]],
  rounding: [['切り捨て', 'floor'], ['切り上げ', 'ceil'], ['四捨五入', 'round']],
  catMode: [['電話', '電話'], ['電信', '電信'], ['電信・電話', '']], // 「電信・電話」は空と同じ（両方）
  homeStationBy: [['管内で運用した局', 'operation'], ['管内に住所があり、管内で運用した局', 'addressAndOperation']],
  clubRankBy: [['全体', '全体'], ['都府県', '都府県'], ['管内と管外', '管内と管外']],
  portableMismatch: [['呼出符号の誤り', 'X'], ['一致とみなす', 'OK']],
  applyMode: [['意見欄の申告がある局だけ', 'declared'], ['申告がなくても電信の交信があれば対象', 'declaredOrLog']],
  divisionRankBy: [['全体', '全体'], ['局区分', '局区分'], ['都府県と管外', '都府県と管外']],
  prefRankBy: [['全体', '全体'], ['都府県', '都府県']]
};

// 選ぶ値の、前の版の言葉・ほかの書き方（表の言葉 → 設定の値）。プルダウンには出さないが、読める
const SETTINGS_CHOICE_ALIASES = {
  op: { '個人': '個人', '社団': '社団' },  // 呼び方が「個人／社団」のときの言葉（どちらの呼び方の言葉でも読む）
  catMode: { 'MIX': '' }                   // 新潟の規約の書き方
};
// 見出しの、もう一つの呼び方の名前（プログラムの中の名前 → もう一つの名前）。どちらでも読む（「1. 初期設定」で、選んだ呼び方の名前に書き換える）
const SETTINGS_HEADER_ALIASES = { '規約_種目': { 'シングルオペ／マルチオペ': '個人／社団' } };
// 「県」の列で、管外局の種目に書いてよい言葉（空と同じ）
const SETTINGS_OUTSIDE_PREF = '県外';

/**
 * 「シングルオペ・マルチオペの呼び方」（「規約_基本」。cfg.opTerms）ごとの言葉（2026-11-03。指示書_準本番で見つけた点の直し_2 の 1.）。
 * 2つの言い方は意味が違う（ゲストオペで個人局がマルチオペになることもある）ので、規約の書き方に合わせて選ぶ
 */
const SETTINGS_OP_TERMS = {
  individualClub: { name: '個人／社団', words: { '個人': '個人', '社団': '社団' } },             // JA0 VHF・ギガヘルツ。行がない・空のときも
  singleMulti: { name: 'シングルオペ／マルチオペ', words: { '個人': 'シングルオペ', '社団': 'マルチオペ' } } // 新潟
};
const SETTINGS_OP_TERMS_DEFAULT = 'individualClub';

/** cfg の呼び方（opTerms）。ない・知らない値なら「個人／社団」 */
function settingsOpTerms(cfg) {
  const t = cfg && cfg.opTerms;
  return SETTINGS_OP_TERMS[t] ? t : SETTINGS_OP_TERMS_DEFAULT;
}

/**
 * 種目の「個人」「社団」（中の値）を、画面・結果・LCRに出す言葉にする。cfg の呼び方（opTerms）に合わせて、
 * 「個人／社団」なら「個人」「社団」、「シングルオペ／マルチオペ」なら「シングルオペ」「マルチオペ」。ほかの値はそのまま。
 * cfg を渡さないときは、前の版（2026-11-01）と同じ「シングルオペ」「マルチオペ」を返す（審査担当が cfg を渡すように直すまでの間。No.165）
 */
function settingsOpLabel(op, cfg) {
  const terms = cfg ? settingsOpTerms(cfg) : 'singleMulti';
  return SETTINGS_OP_TERMS[terms].words[op] || (op || '');
}

/** 「シングルオペ／マルチオペ」を含む見出し・項目の名前を、呼び方 terms の言葉にする（例：「局長賞の個人／社団」） */
function settingsOpText(text, terms) {
  return String(text).replace(SETTINGS_OP_TERMS.singleMulti.name, (SETTINGS_OP_TERMS[terms] || SETTINGS_OP_TERMS[SETTINGS_OP_TERMS_DEFAULT]).name);
}

// 「規約_基本」の項目。type：list＝「、」区切り、number＝数、text＝文字、prefs＝都府県名の「、」区切り、kinds＝ナンバーの種類の「、」区切り、choice＝選ぶ
const SETTINGS_BASIC_ITEMS = [
  { key: 'contestNameKeywords', label: 'コンテスト名の照合の語', type: 'list', upper: true,
    help: 'サマリーシートのコンテスト名に、この語が全部含まれていなければ「注意」にする。「、」で区切る。「ギガヘルツ／GHZ」のように「／」でつないだ語は、どれか1つが入っていればよい' },
  { key: 'timeToleranceMin', label: 'クロスチェックの時刻の許容誤差（分）', type: 'number',
    help: '相手局のログと交信時刻が、前後この分だけずれていても同じ交信とみなす' },
  { key: 'cwModes', label: '電信のモード', type: 'list', upper: true, help: 'ログのモード欄がこれなら電信。「、」で区切る' },
  { key: 'phoneModes', label: '電話のモード', type: 'list', upper: true, help: 'ログのモード欄がこれなら電話。「、」で区切る' },
  { key: 'cwIfRst3', label: 'RSTが3桁なら電信とみなす', type: 'choice', choices: 'yesNo',
    help: '「する」＝モード欄が読めなくても、RSTが3桁（599など）なら電信とみなす' },
  { key: 'homePrefs', label: '管内の都府県', type: 'prefs', help: '管内局になる都府県。「新潟県、長野県」のように「、」で区切る' },
  { key: 'homeArea', label: '管内のエリア', type: 'text', help: '管内のエリアの数字（例：0）' },
  { key: 'homeName', label: '管内の呼び名', type: 'text', help: '審査結果やLCRで使う、管内の呼び名（例：信越）' },
  { key: 'homeStationBy', label: '管内局の決め方', type: 'choice', choices: 'homeStationBy', optional: true, ifMissing: 'addressAndOperation',
    help: '「管内で運用した局」＝運用地（送ったナンバー）が管内なら管内局（地方コンテストのほとんどはこれ）。「管内に住所があり、管内で運用した局」＝住所も管内であることを確かめる（JA0 VHF）。空なら後のほう' },
  { key: 'opTerms', label: 'シングルオペ・マルチオペの呼び方', type: 'choice', choices: 'opTerms', optional: true, ifMissing: SETTINGS_OP_TERMS_DEFAULT,
    help: '規約の書き方に合わせて選ぶ。「個人／社団」（個人局・社団局）と「シングルオペ／マルチオペ」は意味が違う（ゲストオペで個人局がマルチオペになることもある）。結果・LCRなどに出る言葉と、「規約_種目」の見出し・「規約_部門と表彰」の項目の名前がこの言葉になる（「1. 初期設定」で書き換わる）。空なら「個人／社団」' },
  { key: 'insideNumberKinds', label: '管内局が送るナンバー', type: 'kinds', help: '市・郡・区・都府県支庁から選び、「、」で区切る' },
  { key: 'outsideNumberKinds', label: '管外局が送るナンバー', type: 'kinds', help: '市・郡・区・都府県支庁から選び、「、」で区切る' },
  { key: 'sendPower', label: '電力記号を送る', type: 'choice', choices: 'yesNo', help: 'ナンバーの後ろに電力記号（P・L・M・Hなど）を付けるか' },
  { key: 'checklogCodes', label: 'チェックログの種目コード', type: 'list', upper: true,
    help: 'サマリーシートの種目欄がこれならチェックログ。「、」で区切る。最初のものを「種目の変更」で使う' },
  { key: 'outsideMayWorkOnlyHome', label: '管外局は管内局とだけ交信できる', type: 'choice', choices: 'yesNo',
    help: '「する」＝管外局どうしの交信は得点にならない' },
  { key: 'pointsPerQso', label: '1交信の得点', type: 'number', help: '1交信あたりの得点' },
  { key: 'dupUnit', label: '重複交信の単位', type: 'choice', choices: 'dupUnit',
    help: '同じ局との2回目以降を重複とする単位。「バンドとモードごと」なら電信と電話で別に交信できる。「バンドとモード欄ごと」ならログのモード欄（CW・SSB・FM など）が違えば別に交信できる' },
  { key: 'dupPreferCw', label: '重複のときは電信を優先する', type: 'choice', choices: 'yesNo', optional: true, ifMissing: false,
    help: '「する」＝同じ局との重複の交信のうち、ほかの理由で無効にならない交信の中で、いちばん先の電信の交信を残す（電信がなければ、いちばん先の交信）。「しない」・空＝いちばん先の交信を残す' },
  { key: 'endExclusive', label: '終了の分の交信', type: 'choice', choices: 'endMinute', optional: true, ifMissing: false,
    help: '開催期間の終了日時ちょうどの分の交信。「時間内」・空＝時間内（例：終了 12:00 なら 12:00 の交信は有効）。「時間外（時報まで）」＝時間外（12:00 の交信は無効。11:59 まで）' },
  { key: 'scoreFormula', label: '総得点の計算', type: 'choice', choices: 'scoreFormula', help: '総得点の出し方' },
  { key: 'tieBreak', label: '同点のとき', type: 'choice', choices: 'tieBreak', help: '同点の局の順位の決め方。「同じ順位にする」＝総得点が同じなら同じ順位' },
  { key: 'portableMismatch', label: '移動表示だけが違う呼出符号', type: 'choice', choices: 'portableMismatch',
    help: '相手局のログに JA0RL、自局のログに JA0RL/0 のように、移動表示だけが違うときの扱い' },
  { key: 'checkSentChange', label: '運用場所の変更を確かめる', type: 'choice', choices: 'yesNo', optional: true, ifMissing: false,
    help: '「する」＝1通のログの中で送ったナンバーが途中で変わっていたら「要確認」に出す（開催部門があれば開催部門ごと）。「しない」・空＝確かめない' },
  // ここから下は設定（cfg）に入れない。取り込みのメニューが読むURL（settingsRegulationValue_。92_gas_settings.js）
  { key: 'zlogDatUrl', label: 'マルチ一覧（zLogのDAT）', type: 'text', optional: true, noCfg: true,
    value: 'http://ja6ycu.in.coocan.jp/ZLOG/ja0vhfi.dat',
    help: '「マルチ一覧を取り込む」で読む、zLogのマルチ定義ファイルのURL（またはドライブに置いたDATファイルのURL）。管内局用を指定する' },
  { key: 'clubListUrl', label: '登録クラブ一覧のURL', type: 'text', optional: true, noCfg: true,
    value: 'https://www.jarl.org/Japanese/A_Shiryo/A-B_Club/list.htm',
    help: '「登録クラブ一覧を取り込む」で読む一覧のページ（JARL本部の「登録クラブ一覧」、または支部のページ）。ドライブに置いたHTMLファイルのURLでもよい' }
];

// 「規約_部門と表彰」の部門と項目。使う（する／しない）が「しない」なら、その部門は設定に入れない。optional＝空でもよい
const SETTINGS_DIVISION_BLOCKS = [
  { block: '電信部門', help: '各種目の参加局の電信の交信だけを抜き出して集計する別枠の部門（マルチバンドのみ）', items: [
    { key: 'applyKeyword', label: '申告の語', type: 'text', help: '意見欄にこの語があれば、電信部門の申告とみなす' },
    { key: 'opOnly', label: 'シングルオペ／マルチオペ', altLabel: '個人／社団', type: 'choice', choices: 'op', optional: true, help: '参加できる局。空なら両方' },
    { key: 'applyMode', label: '対象', type: 'choice', choices: 'applyMode', help: '申告のない局も対象にするか' },
    { key: 'includeOtherBands', label: 'シングルバンドの局の、ほかのバンドの電信交信も含める', type: 'choice', choices: 'yesNo',
      help: 'シングルバンド種目の局が、参加種目の外のバンドで交信した電信の交信も数えるか' },
    { key: 'rankBy', label: '順位の単位', type: 'choice', choices: 'divisionRankBy',
      help: '「全体」、「局区分」（管内局・管外局）、「都府県と管外」（管内の都府県ごとと、管外局）' }
  ] },
  { block: 'ジュニア部門', help: '意見欄で申告した局を、本来の種目の審査後総得点で、種目をまぜて順位を付ける部門', items: [
    { key: 'applyKeyword', label: '申告の語', type: 'text', help: '意見欄にこの語がある局だけが対象' },
    { key: 'opOnly', label: 'シングルオペ／マルチオペ', altLabel: '個人／社団', type: 'choice', choices: 'op', optional: true, help: '参加できる局。空なら両方' },
    { key: 'clsOnly', label: '局区分', type: 'choice', choices: 'cls', optional: true, help: '参加できる局区分。空なら両方' },
    { key: 'rankBy', label: '順位の単位', type: 'choice', choices: 'prefRankBy', help: '「全体」、または「都府県」（種目の県ごと）' },
    { key: 'needBirthDate', label: '生年月日の確認', type: 'choice', choices: 'yesNo',
      help: '「しない」＝意見欄に申告の語があれば対象にする（申告を信用する）。「する」＝意見欄の生年月日も確かめる（区切りの日は「基本設定」の「ジュニア部門の生年月日の区切り」）' }
  ] },
  { block: '登録クラブ対抗', help: 'サマリーシートの登録クラブ番号が同じ局の、審査後総得点を合計する', items: [
    { key: 'tag', label: 'サマリーシートの項目', type: 'text', upper: true, help: '登録クラブ番号を書くサマリーシートの項目名' },
    { key: 'clsOnly', label: '局区分', type: 'choice', choices: 'cls', optional: true, help: 'この局区分の局だけを数える。空なら両方' },
    { key: 'homeClubsOnly', label: '管内の登録クラブだけ', type: 'choice', choices: 'yesNo', help: '「する」＝管内の都府県の登録クラブだけが対象' },
    { key: 'rankBy', label: '順位の単位', type: 'choice', choices: 'clubRankBy',
      help: '「全体」、「都府県」（登録番号の頭の県ごと）、または「管内と管外」（登録番号の頭が管内の都府県かどうか）' }
  ] },
  { block: '表彰', help: '順位表で、表彰する局（クラブ）に色を付ける', items: [
    { key: 'rule', label: '表彰の基準', type: 'text', optional: true,
      help: '種目・部門ごとの参加局数（順位に入った局の数。クラブ対抗はクラブの数）と、表彰する順位。例：「5局まで1位、10局まで2位、それ以上3位」、一律なら「3位まで」、参加局数の割合なら「参加10局につき1局、最大6位」（端数は下の「表彰の端数」）。空なら表彰の印を付けない。局長賞は、いつも1位だけ' },
    { key: 'rounding', label: '表彰の端数', type: 'choice', choices: 'rounding', optional: true, ifMissing: 'ceil',
      help: '「参加10局につき1局」の書き方のときの端数（例：15局なら、切り捨て＝1位まで、切り上げ・四捨五入＝2位まで）。空なら切り上げ' },
    { key: 'topName', label: '局長賞の名前', type: 'text', optional: true, help: '全体で最高得点の1局に出す賞の名前。空なら局長賞はない' },
    { key: 'topCls', label: '局長賞の局区分', type: 'choice', choices: 'cls', optional: true, help: '局長賞の対象の局区分。空なら両方' },
    { key: 'topOp', label: '局長賞のシングルオペ／マルチオペ', altLabel: '局長賞の個人／社団', type: 'choice', choices: 'op', optional: true, help: '局長賞の対象。空なら両方' },
    { key: 'topShow', label: '局長賞の参考に載せる局数', type: 'number', help: '局長賞の欄に、参考として上位何局まで載せるか' },
    { key: 'areaFirstCls', label: 'エリア別1位も表彰する局区分', type: 'choice', choices: 'cls', optional: true,
      help: 'この局区分の種目は、上位局のほかにエリア別1位も表彰する。空なら使わない' }
  ] },
  // 部門ではないが、申し込み（電信部門・ジュニア部門）の書き方の案内なので、ここに置く。「使う」の行はない（noUse）
  { block: '意見欄', noUse: true, help: '参加者が意見欄に書く、部門の申し込みの案内', items: [
    { key: 'commentGuide', label: '意見欄の案内', type: 'text', optional: true,
      help: 'ログ入力フォームの意見欄の上に出す文。審査は意見欄の「電信部門」「ジュニア部門」の語で申し込みを読む（全角・半角・間の空白は問わない）。空なら出さない' }
  ] }
];

// 「規約_チェック」のコードと内容
const SETTINGS_CHECK_CODES = [
  ['D', '重複交信（無得点）'], ['X', '呼出符号の誤り（相手局のログとの照合。無得点）'],
  ['B', '呼出符号の形式の誤り、交信対象外の局（無得点）'], ['N', 'ナンバーの誤り（無得点）'],
  ['I', 'バンドの記載の誤り（無得点）'], ['A', '参加種目外の交信（得点対象外）'],
  ['O', 'コンテストの対象外のバンド（得点対象外）'], ['T', 'コンテスト時間外（無得点）'],
  ['Q', '10分間ルール違反（無得点）'], ['U', 'このログだけに記載されている呼出符号（減点なし）'],
  ['C', 'チェックログ（得点対象外）']
];

// 表の見出しと、見出しの説明（シートの見出しのメモに書く）
const SETTINGS_HEADERS = {
  '規約_基本': [['項目', '設定の名前（変えない）'], ['値', '設定の値'], ['説明', '値の書き方']],
  '規約_バンド': [
    ['バンド名', '審査結果やLCRに出るバンドの名前。種目の「対象バンド」にもこの名前を書く'],
    ['ログ上の表記', 'ログのバンド欄にこう書かれていたら、このバンドとみなす。「、」で区切る'],
    ['周波数の下限（MHz）', 'ログに周波数（145.00 など）で書かれていたとき、この範囲ならこのバンドとみなす'],
    ['周波数の上限（MHz）', '同上'],
    ['まとまり', '「1200MHz以上」のように、いくつかのバンドをまとめて1つの種目にするときの名前。なければ空'],
    ['メモ', '自由に書いてよい（読み込みには使わない）']],
  '規約_種目': [
    ['種目コード', 'サマリーシートの種目欄に書くコード'],
    ['種目名', '審査結果やLCRに出る種目の名前'],
    ['局区分', '管内局・管外局から選ぶ'],
    ['県', '管内局の種目は県を選ぶ（空なら管内のどの県でもよい）。管外局は「県外」か空'],
    ['シングルオペ／マルチオペ', 'シングルオペ・マルチオペから選ぶ'],
    ['対象バンド', '空＝全バンド（マルチバンド）。「50MHz」のようなバンド名、または「1200MHz以上」のようなまとまりの名前'],
    ['メモ', '自由に書いてよい（読み込みには使わない）'],
    ['モード', '電話・電信・電信・電話から選ぶ。「電信・電話」か空なら両方。違うモードの交信は参加種目外になる'],
    ['開催部門', '「規約_開催部門」の開催部門名。開催部門を使わないコンテストは空']],
  '規約_マルチ': [
    ['局区分', '管内局・管外局から選ぶ（両方の行が要る）'],
    ['管内のナンバー', '管内局から受けたナンバーで、マルチに数える種類（市・郡・区・都府県支庁）。「、」で区切る'],
    ['管外のナンバー', '管外局から受けたナンバーで、マルチに数える種類。数えないなら空'],
    ['メモ', '自由に書いてよい（読み込みには使わない）']],
  '規約_チェック': [['コード', 'チェックコード（変えない）'], ['内容', 'チェックの内容'], ['使う', '「する」＝このチェックをする']],
  '規約_部門と表彰': [['部門', '部門の名前（変えない）'], ['項目', '設定の名前（変えない）'], ['値', '設定の値'], ['説明', '値の書き方']],
  '規約_開催部門': [
    ['開催部門名', '画面・結果・LCRに出る名前（例：7MHz部門）。開催部門を使わないコンテストは、行を書かない'],
    ['開催期間', '「基本設定」の開催期間の行の名前（例：開催期間1）。2つ以上なら「、」で区切る'],
    ['並び順', '審査結果・結果ページに並べる順（1、2、3…）'],
    ['メモ', '自由に書いてよい（読み込みには使わない）']],
  '規約_得点': [
    ['バンド', '「規約_バンド」のバンド名か、まとまりの名前。ここに書いたバンドの1交信の得点。書いていないバンドは「規約_基本」の「1交信の得点」'],
    ['モード', '（まだ使えない。空にする）'],
    ['相手の局区分', '（まだ使えない。空にする）'],
    ['得点', '1交信の得点（0以上の数）'],
    ['メモ', '自由に書いてよい（読み込みには使わない）']]
};

/**
 * マスの値を文字に直す。シートの値は、文字のほか、数・true/false・日付で入っていることがあるので、
 * どの形でも同じ文字になるようにする（数 50 も 50.0 も「50」、true は「する」、日付は「2026-05-09」）
 */
function settingsCellText(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'する' : 'しない';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    const z = function (n) { return (n < 10 ? '0' : '') + n; };
    const d = v.getFullYear() + '-' + z(v.getMonth() + 1) + '-' + z(v.getDate());
    return v.getHours() || v.getMinutes() ? d + ' ' + z(v.getHours()) + ':' + z(v.getMinutes()) : d;
  }
  return String(v).trim();
}

// 「する／しない」で、ほかの書き方も受け付ける（全角は半角に、英字は大文字にしてから比べる）
const SETTINGS_YES_NO_WORDS = { 'TRUE': true, 'FALSE': false, 'はい': true, 'いいえ': false, '○': true, '◯': true, '×': false,
  'YES': true, 'NO': false, 'ON': true, 'OFF': false, '1': true, '0': false };

/** 設定 → 表（{シート名: 2次元の配列}）。値はすべて文字 */
function settingsTablesFromConfig(cfg) {
  const label = function (choices, value) {
    const c = SETTINGS_CHOICES[choices].filter(function (x) { return x[1] === value; })[0];
    return c ? c[0] : '';
  };
  const cell = function (item, value) {
    if (value == null) return '';
    if (item.type === 'choice') return item.choices === 'op' ? settingsOpLabel(value, cfg) : label(item.choices, value);
    if (item.type === 'prefs') return value.map(function (p) { return PREF_TABLE[p] || p; }).join('、');
    if (item.type === 'list' || item.type === 'kinds') return value.join('、');
    return String(value);
  };
  const terms = settingsOpTerms(cfg); // 「規約_種目」の見出し・値、「規約_部門と表彰」の項目の名前・値は、この呼び方の言葉で書く
  const headers = function (name) { return SETTINGS_HEADERS[name].map(function (h) { return settingsOpText(h[0], terms); }); };
  const out = {};

  out[SETTINGS_SHEETS.basic] = [headers(SETTINGS_SHEETS.basic)].concat(SETTINGS_BASIC_ITEMS.map(function (it) {
    if (it.key === 'contestNameKeywords') { // どれか1つでよい語（contestNameAnyOf）は「／」でつないで、同じマスに書く
      return [it.label, (cfg.contestNameKeywords || []).concat((cfg.contestNameAnyOf || []).map(function (g) { return g.join('／'); })).join('、'), it.help];
    }
    return [it.label, it.noCfg ? (it.key in cfg ? cfg[it.key] : it.value) : cell(it, cfg[it.key]), it.help];
  }));

  out[SETTINGS_SHEETS.bands] = [headers(SETTINGS_SHEETS.bands)].concat(cfg.bands.map(function (b) {
    return [b.name, b.labels.join('、'), String(b.mhz[0]), String(b.mhz[1]), b.group || '', ''];
  }));

  out[SETTINGS_SHEETS.categories] = [headers(SETTINGS_SHEETS.categories)].concat(cfg.categories.map(function (c) {
    return [c.code, c.name, c.cls, c.pref ? PREF_TABLE[c.pref] : (c.cls === '管外局' ? SETTINGS_OUTSIDE_PREF : ''), settingsOpLabel(c.op, cfg), c.bandGroup || (c.bands || []).join('、'), '', c.mode || '', c.section || ''];
  }));

  out[SETTINGS_SHEETS.sections] = [headers(SETTINGS_SHEETS.sections)].concat((cfg.sections || []).map(function (sec) {
    return [sec.name, (sec.periodLabels || []).join('、'), String(sec.order), ''];
  }));

  out[SETTINGS_SHEETS.points] = [headers(SETTINGS_SHEETS.points)].concat((cfg.pointRules || []).map(function (pr) {
    return [pr.band, '', '', String(pr.points), ''];
  }));

  out[SETTINGS_SHEETS.multi] = [headers(SETTINGS_SHEETS.multi)].concat(Object.keys(cfg.multiRules).map(function (cls) {
    return [cls, cfg.multiRules[cls].home.join('、'), cfg.multiRules[cls].other.join('、'), ''];
  }));

  out[SETTINGS_SHEETS.checks] = [headers(SETTINGS_SHEETS.checks)].concat(SETTINGS_CHECK_CODES.map(function (c) {
    return [c[0], c[1], cfg.checks[c[0]] ? 'する' : 'しない'];
  }));

  const aw = cfg.awards;
  const blockValues = {
    '電信部門': (cfg.divisions || []).filter(function (d) { return d.name === '電信部門'; })[0],
    'ジュニア部門': (cfg.entryDivisions || []).filter(function (d) { return d.name === 'ジュニア部門'; })[0],
    '登録クラブ対抗': cfg.clubCompetition,
    '表彰': aw ? { rule: aw.rule || '', topName: aw.top ? aw.top.name : '', topCls: aw.top ? aw.top.cls : '', topOp: aw.top ? aw.top.op : '',
      topShow: aw.top ? aw.top.show : 0, areaFirstCls: aw.areaFirstCls || '', rounding: aw.rounding || 'ceil' } : null,
    '意見欄': { commentGuide: cfg.commentGuide || '' }
  };
  const rows = [headers(SETTINGS_SHEETS.divisions)];
  SETTINGS_DIVISION_BLOCKS.forEach(function (b) {
    const v = blockValues[b.block];
    if (!b.noUse) rows.push([b.block, '使う', v ? 'する' : 'しない', b.help]);
    b.items.forEach(function (it) { rows.push([b.block, settingsOpText(it.label, terms), v ? cell(it, v[it.key]) : '', it.help]); });
  });
  out[SETTINGS_SHEETS.divisions] = rows;
  return out;
}

/** 表 → 設定。おかしい値があれば、全部まとめて1つのエラーにする */
function configFromSettingsTables(tables) {
  const errors = [];
  const err = function (sheet, row, msg) { errors.push('規約のファイルの「' + sheet + '」シート' + (row ? 'の' + row + '行目' : '') + '：' + msg); };
  const text = settingsCellText;
  const num = function (v) { const t = toHankaku(text(v)).replace(/[,\s]/g, ''); return t === '' ? NaN : Number(t); }; // 「1,200」も読む
  const norm = function (v) { return toHankaku(text(v)).replace(/\s+/g, '').toUpperCase(); };
  const split = function (v) { return text(v).split(/[、,，]/).map(function (s) { return s.trim(); }).filter(String); };
  const prefNames = {};
  Object.keys(PREF_TABLE).forEach(function (k) { prefNames[PREF_TABLE[k]] = k; });
  const pref = function (s) { s = toHankaku(s).trim(); return PREF_TABLE[s] ? s : (prefNames[s] || null); };

  // 1つのマスを読む。読めなければ undefined（エラーは足してある）
  const readCell = function (sheet, row, item, raw) {
    const v = text(raw);
    const what = item.label + '「' + v + '」';
    if (!v) {
      if (item.optional) return item.type === 'number' ? 0 : '';
      if (item.type === 'kinds' || item.type === 'list' && item.optional) return [];
      err(sheet, row, item.label + 'が空です。' + (item.type === 'choice' ? choiceHint(item.choices) : '値を入れてください'));
      return undefined;
    }
    if (item.type === 'number') {
      const n = num(v);
      if (v === '' || !isFinite(n) || n < 0) { err(sheet, row, what + 'は、0以上の数にしてください'); return undefined; }
      return n;
    }
    if (item.type === 'choice') {
      let c = SETTINGS_CHOICES[item.choices].filter(function (x) { return norm(x[0]) === norm(v); })[0];
      if (!c && item.choices === 'yesNo' && norm(v) in SETTINGS_YES_NO_WORDS) c = [v, SETTINGS_YES_NO_WORDS[norm(v)]];
      const alias = SETTINGS_CHOICE_ALIASES[item.choices] || {};
      if (!c) Object.keys(alias).forEach(function (a) { if (!c && norm(a) === norm(v)) c = [v, alias[a]]; });
      if (!c) { err(sheet, row, what + 'は、' + choiceHint(item.choices)); return undefined; }
      return c[1];
    }
    if (item.type === 'list') return split(v).map(function (s) { return item.upper ? toHankaku(s).toUpperCase() : s; });
    if (item.type === 'prefs') {
      const out = [];
      split(v).forEach(function (s) {
        const p = pref(s);
        if (p) out.push(p); else err(sheet, row, item.label + 'の「' + s + '」が分かりません。「長野県」のように都府県名で書いてください');
      });
      return out;
    }
    if (item.type === 'kinds') return readKinds(sheet, row, item.label, v);
    return item.upper ? toHankaku(v).toUpperCase() : v;
  };
  const choiceHint = function (choices) {
    let list = SETTINGS_CHOICES[choices].map(function (x) { return x[0]; });
    if (list.some(function (x) { return x.indexOf('・') >= 0; })) list = list.map(function (x) { return '「' + x + '」'; }); // 「電信・電話」のように「・」を含む言葉があるとき
    return (list.length === 2 ? list.join('・') + 'のどちらか' : list.join('・') + 'のどれか') + 'にしてください';
  };
  const readKinds = function (sheet, row, label, v) {
    const ok = SETTINGS_CHOICES.numberKind.map(function (x) { return x[0]; });
    return split(v).filter(function (s) {
      if (ok.indexOf(s) >= 0) return true;
      err(sheet, row, label + 'の「' + s + '」は、' + ok.join('・') + 'のどれかにしてください');
      return false;
    });
  };

  // 表を見出しで読む。{rows: [{row: シートの行番号, get: function(見出し)}]}。読めなければ null
  const readTable = function (sheet, needed) {
    const t = tables[sheet];
    if (!t || !t.length) {
      if (SETTINGS_OPTIONAL_SHEETS.indexOf(sheet) >= 0) return []; // 前の版の規約のファイルにはないシート（空として読む）
      err(sheet, 0, 'シートがないか、空です。メニューの「1. 初期設定」を実行すると作られます'); return null;
    }
    const head = t[0].map(text);
    const col = {};
    const optionalCols = SETTINGS_OPTIONAL_COLUMNS[sheet] || [];
    let ok = true;
    const aliases = SETTINGS_HEADER_ALIASES[sheet] || {};
    needed.forEach(function (h) {
      col[h] = head.indexOf(h);
      if (col[h] < 0 && aliases[h]) col[h] = head.indexOf(aliases[h]); // 前の版の見出しの名前
      if (col[h] < 0 && optionalCols.indexOf(h) < 0) { err(sheet, 1, '見出し「' + h + '」がありません。見出しの名前は変えないでください'); ok = false; }
    });
    if (!ok) return null;
    const rows = [];
    const cellOf = function (r, h) { return col[h] < 0 ? '' : text(r[col[h]]); }; // 前の版にない列は空
    for (let i = 1; i < t.length; i++) {
      const r = t[i];
      if (!needed.some(function (h) { return cellOf(r, h); })) continue; // 空の行
      rows.push({ row: i + 1, get: function (h) { return cellOf(r, h); } });
    }
    return rows;
  };
  const headersOf = function (sheet) {
    return SETTINGS_HEADERS[sheet].map(function (h) { return h[0]; }).filter(function (h) { return h !== '説明' && h !== 'メモ' && h !== '内容'; });
  };

  const cfg = { contestName: '', contestNumber: '' };

  // 規約_基本
  const sb = SETTINGS_SHEETS.basic;
  const basicRows = readTable(sb, headersOf(sb));
  if (basicRows) {
    const byLabel = {};
    basicRows.forEach(function (r) { if (!byLabel[r.get('項目')]) byLabel[r.get('項目')] = r; });
    SETTINGS_BASIC_ITEMS.forEach(function (it) {
      if (it.noCfg) return; // 設定に入れない行（取り込みのURL）。なくてもよい
      const r = byLabel[it.label];
      if (!r && 'ifMissing' in it) { cfg[it.key] = it.ifMissing; return; } // 後から足した行（前の版の規約のファイルにはない）
      if (!r) { err(sb, 0, '「' + it.label + '」の行がありません。メニューの「1. 初期設定」を実行すると足されます'); return; }
      cfg[it.key] = readCell(sb, r.row, it, r.get('値'));
      if (cfg[it.key] === '' && 'ifMissing' in it) cfg[it.key] = it.ifMissing;
    });
    if (cfg.homeArea !== undefined && !/^[0-9]$/.test(toHankaku(cfg.homeArea))) err(sb, byLabel['管内のエリア'].row, '管内のエリア「' + cfg.homeArea + '」は、0～9の数字1つにしてください');
    else if (cfg.homeArea !== undefined) cfg.homeArea = toHankaku(cfg.homeArea);
    // 「ギガヘルツ／GHZ」のように「／」でつないだ語は、どれか1つが入っていればよい（contestNameAnyOf）。ほかは今までどおり全部
    const words = cfg.contestNameKeywords || [];
    cfg.contestNameKeywords = words.filter(function (w) { return !SETTINGS_ANY_OF_MARK.test(w); });
    cfg.contestNameAnyOf = words.filter(function (w) { return SETTINGS_ANY_OF_MARK.test(w); }).map(function (w) {
      return w.split(SETTINGS_ANY_OF_MARK).map(function (x) { return x.trim(); }).filter(String);
    }).filter(function (g) { return g.length; });
  }
  cfg.periods = [];

  // 規約_バンド
  const sbd = SETTINGS_SHEETS.bands;
  const bandRows = readTable(sbd, headersOf(sbd));
  cfg.bands = [];
  if (bandRows) {
    bandRows.forEach(function (r) {
      const name = r.get('バンド名');
      if (!name) { err(sbd, r.row, 'バンド名が空です'); return; }
      if (cfg.bands.some(function (b) { return b.name === name; })) { err(sbd, r.row, 'バンド名「' + name + '」が2回書かれています'); return; }
      const labels = split(r.get('ログ上の表記')).map(function (s) {
        return toHankaku(s).toUpperCase().replace(/^(\d+)\.0+$/, '$1'); // 数の表示の「50.00」は「50」
      });
      if (!labels.length) err(sbd, r.row, 'バンド「' + name + '」のログ上の表記が空です（例：144、144M）');
      const lo = num(r.get('周波数の下限（MHz）')), hi = num(r.get('周波数の上限（MHz）'));
      if (!r.get('周波数の下限（MHz）') || !r.get('周波数の上限（MHz）') || !isFinite(lo) || !isFinite(hi)) {
        err(sbd, r.row, 'バンド「' + name + '」の周波数の下限・上限は、MHzの数にしてください（例：144 と 146）'); return;
      }
      if (lo >= hi) { err(sbd, r.row, 'バンド「' + name + '」の周波数の上限は、下限より大きくしてください'); return; }
      const b = { name: name, labels: labels, mhz: [lo, hi] };
      if (r.get('まとまり')) b.group = r.get('まとまり');
      cfg.bands.push(b);
    });
    if (!bandRows.length) err(sbd, 0, 'バンドが1つもありません');
  }

  // 規約_開催部門（新潟コンテストの「7MHz部門」など。使わないコンテストは行がない）
  const ss = SETTINGS_SHEETS.sections;
  const secRows = readTable(ss, headersOf(ss));
  cfg.sections = [];
  if (secRows) {
    secRows.forEach(function (r, i) {
      const name = r.get('開催部門名');
      if (!name) { err(ss, r.row, '開催部門名が空です'); return; }
      if (cfg.sections.some(function (x) { return x.name === name; })) { err(ss, r.row, '開催部門名「' + name + '」が2回書かれています'); return; }
      const labels = split(r.get('開催期間')).map(function (x) { return toHankaku(x).replace(/\s+/g, ''); });
      if (!labels.length) err(ss, r.row, '開催部門「' + name + '」の開催期間が空です（例：開催期間1）');
      labels.forEach(function (x) { if (!/^開催期間\d+$/.test(x)) err(ss, r.row, '開催期間「' + x + '」は、「基本設定」の開催期間の行の名前（例：開催期間1）にしてください'); });
      const o = r.get('並び順');
      const order = o ? num(o) : i + 1;
      if (!isFinite(order)) err(ss, r.row, '並び順「' + o + '」は、数にしてください');
      cfg.sections.push({ name: name, periodLabels: labels, order: order });
    });
    cfg.sections.sort(function (a, b) { return a.order - b.order; });
  }

  // 規約_種目
  const sc = SETTINGS_SHEETS.categories;
  const catRows = readTable(sc, headersOf(sc));
  cfg.categories = [];
  if (catRows) {
    const bandNames = cfg.bands.map(function (b) { return b.name; });
    const groups = cfg.bands.map(function (b) { return b.group; }).filter(Boolean);
    catRows.forEach(function (r) {
      const code = toHankaku(r.get('種目コード')).toUpperCase();
      if (!code) { err(sc, r.row, '種目コードが空です'); return; }
      if (cfg.categories.some(function (c) { return c.code === code; })) { err(sc, r.row, '種目コード「' + code + '」が2回書かれています'); return; }
      const c = { code: code, name: r.get('種目名') };
      if (!c.name) err(sc, r.row, '種目「' + code + '」の種目名が空です');
      c.cls = readCell(sc, r.row, { label: '局区分', type: 'choice', choices: 'cls' }, r.get('局区分'));
      const p = r.get('県');
      const outside = toHankaku(p).replace(/\s+/g, '') === SETTINGS_OUTSIDE_PREF;
      if (c.cls === '管外局') {
        if (p && !outside) err(sc, r.row, '管外局の種目「' + code + '」は、県を「' + SETTINGS_OUTSIDE_PREF + '」か空にしてください');
        c.pref = null;
      } else if (c.cls === '管内局' && outside) {
        err(sc, r.row, '管内局の種目「' + code + '」は、県を「' + SETTINGS_OUTSIDE_PREF + '」にできません。管内の県を選ぶか、空（管内のどの県でもよい）にしてください');
        c.pref = null;
      } else if (c.cls === '管内局') {
        c.pref = p ? pref(p) : null; // 空なら、管内のどの県でもよい（ギガヘルツコンテストの管内局の種目など）
        if (p && !c.pref) err(sc, r.row, '県「' + p + '」が分かりません。「長野県」のように都府県名で書いてください');
        else if (c.pref && cfg.homePrefs && cfg.homePrefs.indexOf(c.pref) < 0) err(sc, r.row, '県「' + p + '」は、「規約_基本」の管内の都府県に入っていません');
      }
      c.op = readCell(sc, r.row, { label: 'シングルオペ／マルチオペ', type: 'choice', choices: 'op' }, r.get('シングルオペ／マルチオペ'));
      const target = split(r.get('対象バンド'));
      if (!target.length) c.bands = null;
      else if (target.length === 1 && groups.indexOf(target[0]) >= 0 && bandNames.indexOf(target[0]) < 0) c.bandGroup = target[0];
      else {
        target.forEach(function (t) {
          if (bandNames.indexOf(t) < 0) err(sc, r.row, '対象バンド「' + t + '」が「規約_バンド」にありません。バンド名かまとまりの名前を書いてください（全バンドなら空）');
        });
        c.bands = target;
      }
      c.mode = readCell(sc, r.row, { label: 'モード', type: 'choice', choices: 'catMode', optional: true }, r.get('モード')); // 空なら両方（MIX）
      c.section = r.get('開催部門');
      if (c.section && !cfg.sections.some(function (x) { return x.name === c.section; })) {
        err(sc, r.row, '開催部門「' + c.section + '」が「規約_開催部門」にありません');
      }
      cfg.categories.push(c);
    });
    if (!catRows.length) err(sc, 0, '種目が1つもありません');
  }

  // 規約_得点（今はバンドの列だけ読む。モード・相手の局区分は、ほかのコンテストへの汎用化で読む）
  const sp = SETTINGS_SHEETS.points;
  const pointRows = readTable(sp, headersOf(sp));
  cfg.pointRules = [];
  if (pointRows) {
    const bandNames = cfg.bands.map(function (b) { return b.name; });
    const groups = cfg.bands.map(function (b) { return b.group; }).filter(Boolean);
    pointRows.forEach(function (r) {
      const band = r.get('バンド');
      if (!band) { err(sp, r.row, 'バンドが空です'); return; }
      if (bandNames.indexOf(band) < 0 && groups.indexOf(band) < 0) { err(sp, r.row, 'バンド「' + band + '」が「規約_バンド」にありません。バンド名かまとまりの名前を書いてください'); return; }
      if (cfg.pointRules.some(function (x) { return x.band === band; })) { err(sp, r.row, 'バンド「' + band + '」が2回書かれています'); return; }
      ['モード', '相手の局区分'].forEach(function (h) {
        if (r.get(h)) err(sp, r.row, h + 'の列は、まだ使えません。空にしてください（バンドごとの得点だけ読みます）');
      });
      const n = num(r.get('得点'));
      if (!r.get('得点') || !isFinite(n) || n < 0) { err(sp, r.row, 'バンド「' + band + '」の得点は、0以上の数にしてください'); return; }
      cfg.pointRules.push({ band: band, points: n });
    });
  }

  // 規約_マルチ
  const sm = SETTINGS_SHEETS.multi;
  const multiRows = readTable(sm, headersOf(sm));
  cfg.multiRules = {};
  if (multiRows) {
    multiRows.forEach(function (r) {
      const cls = readCell(sm, r.row, { label: '局区分', type: 'choice', choices: 'cls' }, r.get('局区分'));
      if (cls === undefined) return;
      if (cfg.multiRules[cls]) { err(sm, r.row, '局区分「' + cls + '」が2回書かれています'); return; }
      cfg.multiRules[cls] = { home: readKinds(sm, r.row, '管内のナンバー', r.get('管内のナンバー')),
        other: readKinds(sm, r.row, '管外のナンバー', r.get('管外のナンバー')) };
    });
    ['管内局', '管外局'].forEach(function (cls) { if (!cfg.multiRules[cls]) err(sm, 0, '局区分「' + cls + '」の行がありません'); });
  }

  // 規約_チェック
  const sk = SETTINGS_SHEETS.checks;
  const checkRows = readTable(sk, headersOf(sk));
  cfg.checks = {};
  if (checkRows) {
    const codes = SETTINGS_CHECK_CODES.map(function (c) { return c[0]; });
    checkRows.forEach(function (r) {
      const code = toHankaku(r.get('コード')).toUpperCase();
      if (codes.indexOf(code) < 0) { err(sk, r.row, 'コード「' + code + '」は、' + codes.join('・') + 'のどれかにしてください'); return; }
      if (code in cfg.checks) { err(sk, r.row, 'コード「' + code + '」が2回書かれています'); return; }
      cfg.checks[code] = readCell(sk, r.row, { label: '使う', type: 'choice', choices: 'yesNo' }, r.get('使う'));
    });
    const sorted = {};
    codes.forEach(function (c) {
      if (!(c in cfg.checks)) err(sk, 0, 'コード「' + c + '」の行がありません');
      sorted[c] = cfg.checks[c];
    });
    cfg.checks = sorted;
  }

  // 規約_部門と表彰
  const sv = SETTINGS_SHEETS.divisions;
  const divRows = readTable(sv, headersOf(sv));
  cfg.divisions = [];
  cfg.entryDivisions = [];
  cfg.clubCompetition = null;
  cfg.awards = null;
  cfg.commentGuide = '';
  if (divRows) {
    const byKey = {};
    divRows.forEach(function (r) { const k = r.get('部門') + '|' + r.get('項目'); if (!byKey[k]) byKey[k] = r; });
    const blockValue = function (b) {
      const items = (b.noUse ? [] : [{ key: 'use', label: '使う', type: 'choice', choices: 'yesNo' }]).concat(b.items);
      const v = b.noUse ? { use: true } : {};
      let missing = false;
      items.forEach(function (it) {
        const r = byKey[b.block + '|' + it.label] || (it.altLabel ? byKey[b.block + '|' + it.altLabel] : null); // もう一つの呼び方の名前でも読む
        if (!r && 'ifMissing' in it) { v[it.key] = it.ifMissing; return; } // 後から足した行（前の版の規約のファイルにはない）
        if (!r) { err(sv, 0, '部門「' + b.block + '」の「' + it.label + '」の行がありません。メニューの「1. 初期設定」を実行すると足されます'); missing = true; return; }
        if (it.key === 'use' || v.use) v[it.key] = readCell(sv, r.row, it, r.get('値'));
        if (v[it.key] === '' && 'ifMissing' in it) v[it.key] = it.ifMissing;
      });
      return missing || !v.use ? null : v;
    };
    const blocks = {};
    SETTINGS_DIVISION_BLOCKS.forEach(function (b) { blocks[b.block] = blockValue(b); });
    const cw = blocks['電信部門'];
    if (cw) {
      cfg.divisions.push({ name: '電信部門', modeClass: '電信', applyKeyword: cw.applyKeyword, opOnly: cw.opOnly,
        applyMode: cw.applyMode, includeOtherBands: cw.includeOtherBands, rankBy: cw.rankBy });
    }
    const jr = blocks['ジュニア部門'];
    if (jr) {
      cfg.entryDivisions.push({ name: 'ジュニア部門', applyKeyword: jr.applyKeyword, opOnly: jr.opOnly, clsOnly: jr.clsOnly,
        rankBy: jr.rankBy, needBirthDate: jr.needBirthDate, bornOnOrAfter: '' }); // 生年月日の区切りは loadConfigFor_ が「基本設定」から入れる
    }
    if (blocks['意見欄']) cfg.commentGuide = blocks['意見欄'].commentGuide;
    const cc = blocks['登録クラブ対抗'];
    if (cc) cfg.clubCompetition = { name: '登録クラブ対抗', tag: cc.tag, clsOnly: cc.clsOnly, homeClubsOnly: cc.homeClubsOnly, rankBy: cc.rankBy };
    const aw = blocks['表彰'];
    if (aw) {
      cfg.awards = { rule: aw.rule,
        top: aw.topName ? { name: aw.topName, cls: aw.topCls, op: aw.topOp, show: aw.topShow } : null,
        areaFirstCls: aw.areaFirstCls, rounding: aw.rounding };
    }
  }

  if (errors.length) throw new Error('規約のファイルに、直すところがあります。\n' + errors.join('\n'));
  return cfg;
}

// 比べるときの項目の日本語の名前（「規約_基本」の項目は SETTINGS_BASIC_ITEMS の名前を使う）
const SETTINGS_DIFF_TOP_NAMES = {
  bands: 'バンド', categories: '種目', multiRules: 'マルチ', checks: 'チェックコード', divisions: '別枠部門（電信部門など）',
  entryDivisions: '申告で入る部門（ジュニア部門など）', clubCompetition: '登録クラブ対抗', awards: '表彰', commentGuide: '意見欄の案内',
  sections: '開催部門', pointRules: '得点の表', contestNameAnyOf: 'コンテスト名の照合の語（どれか1つ）'
};
const SETTINGS_DIFF_NAMES = {
  name: '名前', bands: '対象バンド', labels: 'ログ上の表記', mhz: '周波数の範囲', group: 'まとまり', code: '種目コード', cls: '局区分', pref: '県',
  op: 'シングルオペ／マルチオペ', bandGroup: '対象バンド（まとまり）', home: '管内のナンバー', other: '管外のナンバー',
  applyKeyword: '申告の語', opOnly: 'シングルオペ／マルチオペ', clsOnly: '局区分', applyMode: '対象', includeOtherBands: 'ほかのバンドの交信も含める',
  rankBy: '順位の単位', modeClass: 'モード', tag: 'サマリーシートの項目', homeClubsOnly: '管内の登録クラブだけ', top: '局長賞',
  show: '参考に載せる局数', rule: '表彰の基準', areaFirstCls: 'エリア別1位も表彰する局区分', needBirthDate: '生年月日の確認', bornOnOrAfter: '生年月日の区切り',
  mode: 'モード', section: '開催部門', periodLabels: '開催期間', order: '並び順', band: 'バンド', points: '得点', rounding: '表彰の端数'
};
// 「基本設定」「開催期間」から読むので比べないもの
const SETTINGS_DIFF_SKIP = ['contestName', 'contestNumber', 'periods', 'entryDivisions.bornOnOrAfter', 'sections.periods'];

/**
 * 2つの設定を項目ごとに比べ、違う所を返す。[{item: 項目（日本語）, actual: 読んだ値, expected: 比べる値}]
 * 値の形が違うとき（数の 1 と文字の "1" など）は、形も書く。「基本設定」「開催期間」から読む項目は比べない
 */
function diffConfigs(actual, expected) {
  const out = [];
  const topNames = {};
  SETTINGS_BASIC_ITEMS.forEach(function (it) { topNames[it.key] = it.label; });
  Object.keys(SETTINGS_DIFF_TOP_NAMES).forEach(function (k) { topNames[k] = SETTINGS_DIFF_TOP_NAMES[k]; });
  const typeName = function (v) {
    if (v === undefined) return 'なし';
    if (v === null) return '空（null）';
    if (Array.isArray(v)) return '一覧';
    return { number: '数', string: '文字', boolean: 'true/false', object: 'まとまり' }[typeof v] || typeof v;
  };
  const show = function (v, other) {
    if (v === undefined) return '（なし）';
    if (v === null) return '空（null）';
    return typeName(v) !== typeName(other) && other !== undefined ? typeName(v) + 'の ' + JSON.stringify(v) : JSON.stringify(v);
  };
  const isObj = function (v) { return v && typeof v === 'object' && !Array.isArray(v); };
  const idOf = function (v) { return isObj(v) ? (v.code != null ? v.code : v.name) : undefined; };
  const add = function (item, a, e) { out.push({ item: item, actual: show(a, e), expected: show(e, a) }); };
  const walk = function (a, e, label, keyPath) {
    if (SETTINGS_DIFF_SKIP.indexOf(keyPath) >= 0) return;
    if (Array.isArray(a) && Array.isArray(e) && e.some(function (x) { return idOf(x) != null; })) {
      // 名前・コードで対応を付けて比べる
      const ids = function (list) { return list.map(idOf); };
      const ia = ids(a), ie = ids(e);
      e.forEach(function (x, i) {
        const j = ia.indexOf(ie[i]);
        const name = label + '「' + ie[i] + '」';
        if (j < 0) out.push({ item: name, actual: '（ありません）', expected: '（あります）' }); else walk(a[j], x, name, keyPath);
      });
      a.forEach(function (x, j) { if (ie.indexOf(ia[j]) < 0) out.push({ item: label + '「' + ia[j] + '」', actual: '（あります）', expected: '（ありません）' }); });
      const common = ia.filter(function (x) { return ie.indexOf(x) >= 0; });
      if (common.join('\n') !== ie.filter(function (x) { return ia.indexOf(x) >= 0; }).join('\n')) {
        out.push({ item: label + 'の並び順', actual: common.join('、'), expected: ie.filter(function (x) { return ia.indexOf(x) >= 0; }).join('、') });
      }
      return;
    }
    if (isObj(a) && isObj(e)) {
      const keys = Object.keys(e).concat(Object.keys(a).filter(function (k) { return !(k in e); }));
      keys.forEach(function (k) {
        const sub = keyPath ? keyPath + '.' + k : k;
        const name = (keyPath ? SETTINGS_DIFF_NAMES[k] : topNames[k]) || k;
        walk(a[k], e[k], label ? label + 'の' + name : name, sub);
      });
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(e) || typeName(a) !== typeName(e)) add(label, a, e);
  };
  walk(actual, expected, '', '');
  return out;
}

/** 表の中で、文字でない形（数・true/false・日付）で入っているマスの一覧（例：「規約_バンド」の C2：数の 50） */
function settingsNonTextCells(tables) {
  const out = [];
  const col = function (n) { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  Object.keys(tables).forEach(function (name) {
    (tables[name] || []).forEach(function (r, i) {
      r.forEach(function (v, j) {
        if (v == null || v === '' || typeof v === 'string') return;
        const kind = typeof v === 'number' ? '数' : typeof v === 'boolean' ? 'true/false' :
          Object.prototype.toString.call(v) === '[object Date]' ? '日付' : typeof v;
        out.push('「' + name + '」の ' + col(j) + (i + 1) + '：' + kind + 'の ' + settingsCellText(v));
      });
    });
  });
  return out;
}

const SETTINGS_PERIOD_MAX_DAYS = 2; // 開催期間がこれより長ければ注意（設定 cfg には入れない）

/**
 * 開催期間（cfg.periods の形 [{start, end}]）の気になる所を、注意の文の一覧で返す（メニュー「設定の読み込みを確かめる」で使う）。
 *   ・開催期間の年が今年（todayYear）と違う … 前の年の設定のままかもしれない
 *   ・1行の期間が SETTINGS_PERIOD_MAX_DAYS 日より長い
 */
function periodNotes(periods, todayYear) {
  const out = [];
  const years = [];
  (periods || []).forEach(function (p) {
    [p.start, p.end].forEach(function (t) {
      const y = /^(\d{4})/.exec(String(t || '').trim());
      if (y && +y[1] !== +todayYear && years.indexOf(y[1]) < 0) years.push(y[1]);
    });
    const s = jstStringToMinutes(p.start), e = jstStringToMinutes(p.end);
    if (s != null && e != null && e - s > SETTINGS_PERIOD_MAX_DAYS * 24 * 60) {
      out.push('開催期間（' + p.start + '〜' + p.end + '）が' + SETTINGS_PERIOD_MAX_DAYS + '日より長くなっています。日付を確かめてください');
    }
  });
  if (years.length) {
    out.unshift('開催期間の年（' + years.join('・') + '年）が、今年（' + todayYear + '年）と違います。前の年の設定のままではありませんか');
  }
  return out;
}

// ------------------------------------------------------------------ 開催期間（「基本設定」の「開催期間1」「開催期間2」…）

/**
 * 日時の書き方をそろえる（'YYYY-MM-DD hh:mm'）。全角の数字・全角のスペース・「/」区切り・秒つきも読む。読めなければ null。
 * 例：「２０２６/5/9　21:00」→「2026-05-09 21:00」
 */
function settingsDateTimeText(s) {
  const t = toHankaku(settingsCellText(s)).replace(/\s+/g, ' ').trim();
  const m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2}) (\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d || h > 23 || mi > 59) return null; // 13月・2月30日・25時など
  const z = function (n) { return (n < 10 ? '0' : '') + n; };
  return m[1] + '-' + z(mo) + '-' + z(d) + ' ' + z(h) + ':' + z(mi);
}

/**
 * 「基本設定」の表（1行目は見出し。A 項目｜B 値（開始）｜C 終了日時）から、開催期間を読む。
 * 項目が「開催期間」で始まる行を、上から順に全部読む（「開催期間4」などを手で足してもよい）。B・C が両方空の行は使わない。
 * 戻り値 {periods: [{start, end}], errors: [読めない行の日本語の文], byLabel: {開催期間1: {start, end}}}。periods の形は cfg.periods と同じ
 */
function periodsFromBasicRows(rows) {
  const periods = [], errors = [], byLabel = {}; // byLabel：{開催期間1: {start, end}}（開催部門が名前で指す）
  let first = '';
  (rows || []).slice(1).forEach(function (r) {
    const label = toHankaku(settingsCellText(r[0])).replace(/\s+/g, '');
    if (!/^開催期間/.test(label)) return;
    first = first || label;
    const b = settingsCellText(r[1]), c = settingsCellText(r[2]);
    if (!b && !c) return;
    const where = '「基本設定」の「' + label + '」';
    if (!b || !c) { errors.push(where + 'は、開始日時（B列）と終了日時（C列）の両方を入れてください'); return; }
    const start = settingsDateTimeText(b), end = settingsDateTimeText(c);
    if (!start) errors.push(where + 'の開始日時「' + b + '」が読み取れません。日付と時刻の間は半角スペースで書いてください（例：2026-05-09 21:00）');
    if (!end) errors.push(where + 'の終了日時「' + c + '」が読み取れません。日付と時刻の間は半角スペースで書いてください（例：2026-05-10 12:00）');
    if (!start || !end) return;
    if (jstStringToMinutes(start) >= jstStringToMinutes(end)) { errors.push(where + 'は、終了日時が開始日時より前になっています'); return; }
    periods.push({ start: start, end: end });
    byLabel[label] = { start: start, end: end };
  });
  if (!periods.length && !errors.length) {
    errors.push('「基本設定」の「' + (first || '開催期間1') + '」に、開始日時（B列）と終了日時（C列）を入れてください（例：2026-05-09 21:00）');
  }
  return { periods: periods, errors: errors, byLabel: byLabel };
}


// ------------------------------------------------------------------ 規約のテキストファイル（指示書_規約のテキストファイル。申し送り No.171）
//
// 規約のシート8枚を、1つのテキストファイル（UTF-8・タブ区切り）にする・テキストファイルから読む。形はこのとおり（README の「規約のテキストファイル」）：
//   1行目            SETTINGS_TEXT_MAGIC（形の版。違えば読まない）
//   「#」で始まる行   説明（読み飛ばす）。どこに書いてもよい。空の行も読み飛ばす
//   [規約_基本]       まとまりの見出し。次の見出しまでの行が、そのシートの行（最初の行はシートの見出しの行）
//   行               マスをタブで区切る。マスの中の改行は \n、タブは \t、「\」は \\ と書く。行の右の端の空のマスは書かなくてよい
// マルチ一覧・登録クラブ一覧は入れない（今までどおり取り込みで入れる）

const SETTINGS_TEXT_MAGIC = '# コンテスト審査システム 規約のファイル 形式1';
// テキストファイルに入れるシート（この順に書く）
const SETTINGS_TEXT_SHEETS = ['規約_基本', '規約_種目', '規約_部門と表彰', '規約_開催部門', '規約_得点', '規約_マルチ', '規約_バンド', '規約_チェック']; // 規約のファイルのシートの並びと同じ（よく変える順）

/** マスの文字を、テキストファイルの1つのマスの書き方にする（改行・タブ・「\」を書き換える） */
function settingsTextCell_(v) {
  return settingsCellText(v).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/\t/g, '\\t');
}

/**
 * 表（{シート名: 2次元の配列}）を、テキストファイルの中身にする。
 * notes：最初に「#」で書く説明の行（文字の一覧）。commentFor(sheet, row)：その行の前に「#」で書く説明（なければ ''）。どちらも省いてよい
 */
function settingsTablesToText(tables, notes, commentFor) {
  const out = [SETTINGS_TEXT_MAGIC];
  (notes || []).forEach(function (n) { String(n).split(/\r?\n/).forEach(function (l) { out.push('# ' + l); }); });
  SETTINGS_TEXT_SHEETS.forEach(function (name) {
    out.push('', '[' + name + ']');
    (tables[name] || []).forEach(function (row, i) {
      const cells = (row || []).map(settingsTextCell_);
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (i > 0 && !cells.length) return; // 空の行は書かない
      const c = commentFor && i > 0 ? commentFor(name, row) : '';
      if (c) String(c).split(/\r?\n/).forEach(function (l) { out.push('# ' + l); });
      out.push(cells.join('\t'));
    });
  });
  return out.join('\n') + '\n';
}

/**
 * テキストファイルの中身から、表（{シート名: 2次元の配列}）を作る。値の確かめはしない（configFromSettingsTables で行う）。
 * 戻り値 {tables, errors}。errors は形の誤り（1行目が違う・知らないまとまり・まとまりが足りない・2回ある）の日本語の文
 */
function settingsTablesFromText(text) {
  const errors = [];
  const tables = {};
  const lines = String(text || '').replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const first = lines.findIndex(function (l) { return l.trim() !== ''; });
  if (first < 0 || lines[first].trim() !== SETTINGS_TEXT_MAGIC) {
    errors.push('1行目が「' + SETTINGS_TEXT_MAGIC + '」ではありません。このシステムの規約のテキストファイルではないか、形の版が違います' +
      (first >= 0 ? '（1行目：「' + lines[first].trim().slice(0, 60) + '」）' : '（ファイルが空です）'));
    return { tables: tables, errors: errors };
  }
  const unescape = function (s) {
    return s.replace(/\\(\\|n|t)/g, function (m, c) { return c === 'n' ? '\n' : c === 't' ? '\t' : '\\'; });
  };
  let cur = null;
  for (let i = first + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    const m = /^\s*\[(.+)\]\s*$/.exec(line);
    if (m) {
      const name = m[1].trim();
      if (SETTINGS_TEXT_SHEETS.indexOf(name) < 0) { errors.push((i + 1) + '行目：まとまり「[' + name + ']」は知りません。' + SETTINGS_TEXT_SHEETS.map(function (n) { return '[' + n + ']'; }).join('・') + 'のどれかにしてください'); cur = null; continue; }
      if (tables[name]) { errors.push((i + 1) + '行目：まとまり「[' + name + ']」が2回あります'); cur = null; continue; }
      tables[name] = [];
      cur = name;
      continue;
    }
    if (!cur) { errors.push((i + 1) + '行目：まとまりの見出し（[規約_基本] など）より前に行があります'); continue; }
    tables[cur].push(line.split('\t').map(function (c) { return unescape(c.trim()); }));
  }
  SETTINGS_TEXT_SHEETS.forEach(function (name) {
    if (!tables[name]) errors.push('まとまり「[' + name + ']」がありません');
    else if (!tables[name].length) errors.push('まとまり「[' + name + ']」に、見出しの行がありません');
  });
  // 行の長さをそろえる（右の端の空のマスを書かなくてよいように）
  Object.keys(tables).forEach(function (name) {
    const t = tables[name];
    const w = Math.max.apply(null, t.map(function (r) { return r.length; }).concat([1]));
    t.forEach(function (r) { while (r.length < w) r.push(''); });
  });
  return { tables: tables, errors: errors };
}

/**
 * テキストファイルの中身を読んで、設定（cfg）を作る（configFromSettingsTables と同じ確かめ）。誤りがあればエラー。
 * 戻り値 {tables, cfg}。エラーの文の「○行目」は、そのまとまりの中の行（見出しの行を1行目とし、「#」の行と空の行は数えない）
 */
function settingsConfigFromText(text) {
  const r = settingsTablesFromText(text);
  if (r.errors.length) throw new Error('規約のテキストファイルの形に、直すところがあります。\n' + r.errors.join('\n'));
  let cfg;
  try { cfg = configFromSettingsTables(r.tables); } catch (e) {
    throw new Error(String(e.message).replace(/^規約のファイルに、直すところがあります。/, '規約のテキストファイルの中身に、直すところがあります。')
      .replace(/規約のファイルの「(規約_[^」]+)」シート/g, 'テキストファイルの [$1] のまとまり') +
      '\n（行目は、まとまりの中で数えた行です。見出しの行を1行目とし、「#」の行と空の行は数えません）');
  }
  return { tables: r.tables, cfg: cfg };
}

// ------------------------------------------------------------------ 空のテンプレート（指示書_テンプレートを空から始める の 2.2。申し送り No.178）

/**
 * テンプレートの規約のファイル（「1. 初期設定」で新しく作るもの）の設定。コンテストごとに違う所は空。規約は「規約をテキストから読み込む」で入れる。
 * どのコンテストでもほぼ同じ値の行（許容誤差・モード・チェックログの種目コード・1交信の得点・チェックコード など）は JA0 VHF の値のまま。
 * 選ぶ行のうち「行がないとき」の値（ifMissing）がある行は、その値。テストと見本の作り直しは configJa0Vhf2026() を使う
 */
function settingsTemplateConfig() {
  const c = configJa0Vhf2026();
  c.contestName = ''; c.contestNumber = ''; c.periods = [];
  c.contestNameKeywords = []; c.contestNameAnyOf = [];
  c.homePrefs = []; c.homeArea = ''; c.homeName = '';
  c.insideNumberKinds = []; c.outsideNumberKinds = [];
  c.bands = []; c.categories = []; c.sections = []; c.pointRules = []; c.multiRules = {};
  c.divisions = []; c.entryDivisions = []; c.clubCompetition = null;
  c.awards = { rule: '', top: null, areaFirstCls: '', rounding: 'ceil' };
  c.commentGuide = '';
  SETTINGS_BASIC_ITEMS.forEach(function (it) { if ('ifMissing' in it) c[it.key] = it.ifMissing; });
  c.zlogDatUrl = ''; // 「規約_基本」の「マルチ一覧（zLogのDAT）」も空（登録クラブ一覧のURLは JARL の一覧のまま）
  return c;
}

/** 規約がまだ入っていないか（「規約_種目」と「規約_バンド」に、見出しのほかの行がない）。表は readSettingsTables_ の形 */
function settingsTablesEmpty(tables) {
  const has = function (name) {
    return (tables[name] || []).slice(1).some(function (r) { return (r || []).some(function (v) { return settingsCellText(v) !== ''; }); });
  };
  return !has(SETTINGS_SHEETS.categories) && !has(SETTINGS_SHEETS.bands);
}

// 規約がまだ入っていないときの知らせ（「設定の読み込みを確かめる」「1. 初期設定」）
const SETTINGS_EMPTY_MESSAGE = '規約がまだ入っていません。「規約をテキストから読み込む」で、コンテストの規約のテキストファイルを読み込んでください' +
  '（見本：JA0 VHF・新潟・ギガヘルツ。リポジトリの「規約の見本」）。';
// ===== 20_judge.js =====
/**
 * 審査エンジン
 *   judgeContest(parsedLogs, config, master, options) → 審査結果
 *
 * parsedLogs : [{id, parsed（parseJarlLogの戻り値）, receivedAt}]
 * options    : {exceptions: [{call, cls:'管内局'|'管外局', memo}],
 *               categoryOverrides: {呼出符号: 種目コード}}
 */

const CODE_INFO = {
  D: { label: '重複交信', kind: '無得点' },
  X: { label: 'コールサインエラー', kind: '無得点' },
  B: { label: '無効なコールサイン', kind: '無得点' },
  N: { label: 'ナンバーエラー', kind: '無得点' },
  I: { label: 'バンド記載間違い', kind: '無得点' },
  A: { label: '参加種目外交信', kind: '得点対象外' },
  O: { label: 'コンテスト対象バンド外交信', kind: '得点対象外' },
  T: { label: 'コンテスト時間外交信', kind: '無得点' },
  Q: { label: '10分間ルール違反', kind: '無得点' },
  U: { label: 'ユニークコールサイン', kind: '減点なし' },
  C: { label: 'チェックログ', kind: '得点対象外' }
};

function judgeContest(parsedLogs, config, master, options) {
  // 開催部門のあるコンテスト（新潟）は、開催部門ごとに審査してまとめる（申し送り No.145）。ないコンテストは今までどおり
  if (config.sections && config.sections.length) return judgeContestSections(parsedLogs, config, master, options || {});
  return judgeContestOne(parsedLogs, config, master, options);
}

/** 1つのまとまり（開催部門のないコンテスト全体、または1つの開催部門）の審査。options.section：開催部門名（log.section に入れる） */
function judgeContestOne(parsedLogs, config, master, options) {
  options = options || {};
  const ctx = buildContext(config, master, options);
  const logs = parsedLogs.map(function (pl) { return prepareLog(pl, ctx); });
  logs.forEach(function (l, i) { l.key = (options.section ? options.section + ':' : '') + 'k' + i; l.section = options.section || ''; }); // ファイル名が重なっても区別できる内部の番号
  logs.forEach(function (log) { singleChecks(log, ctx); });
  crossCheck(logs, ctx);
  ctx.kindAlerts = judgeKindErrors(logs, ctx);
  if (config.dupPreferCw) logs.forEach(function (log) { markDuplicatesPreferCw(log, ctx); }); // 無効でない交信の中で電信を優先（申し送り No.102）
  logs.forEach(function (log) { scoreLog(log, ctx); scoreDivisions(log, ctx); scoreEntryDivisions(log, ctx); });
  logs.forEach(function (log) { clubOf(log, ctx); });
  const globalAlerts = collectAlerts(logs, ctx);
  periodAlerts(logs, ctx).reverse().forEach(function (a) { globalAlerts.unshift(a); }); // 「要確認」シートのいちばん上に出す
  importDateAlerts(options.importDates, config).forEach(function (a) { globalAlerts.push(a); });
  const rankings = rankLogs(logs, ctx), clubRankings = rankClubs(logs, ctx);
  const awards = markAwards(rankings, clubRankings, config);
  if (awards.error) globalAlerts.push({ level: '要確認', message: awards.error });
  return { config: config, logs: logs, rankings: rankings, clubRankings: clubRankings, awardGroups: awards.groups, alerts: globalAlerts,
    specialAwards: specialAwardNames(logs), // 特別賞の名前（局の一覧の「特別賞」。No.139）
    suggestions: suggestSheetEntries(logs, ctx) };
}

/**
 * 開催部門のあるコンテスト（新潟）の審査（申し送り No.145。設計の案の 1.3）。
 *   ・ログの開催部門は、種目コード（局の一覧の「種目の変更」があればその種目）の「規約_種目」の開催部門。
 *     チェックログの種目コード（CHECKLOG など）は、交信の日時がいちばん多く入る開催部門にする
 *   ・どの開催部門にも当たらないログは、どの開催部門にも入れない（順位・照合・クラブ対抗に使わない）。「要確認」に出す
 *   ・開催部門ごとに、その開催部門の開催期間・種目だけの設定で judgeContestOne を動かす。照合は同じ開催部門のログの中だけ
 *   ・局の一覧の委員の判断（options の categoryOverrides・publicReasons・specialAwards）は「呼出符号の本体|開催部門」の鍵で読む
 *     （90_gas_main.js の stationKey_。行は「局と開催部門」ごと）。局区分（options.exceptions）は全部の開催部門に使う
 *   ・クラブ対抗は、全部の開催部門のログで数える（同じ局は1局。得点は開催部門ごとの審査後総得点の合計）
 * 戻り値：judgeContest と同じ形に、sections:[{name, order, periods, result（その開催部門の judgeContestOne の戻り値）}] を足したもの
 */
function judgeContestSections(parsedLogs, config, master, options) {
  const catSection = {};
  config.categories.forEach(function (c) { catSection[c.code] = c.section || ''; });
  const sectionNames = config.sections.map(function (x) { return x.name; });
  const keyOf = function (base, sec) { return sec ? base + '|' + sec : base; };
  const from = function (map, base, sec) { map = map || {}; const k = keyOf(base, sec); return map[k] != null ? map[k] : null; };
  const inSection = function (sec, min) {
    return sec.periods.some(function (p) {
      const st = jstStringToMinutes(p.start), en = jstStringToMinutes(p.end);
      return min >= st && (config.endExclusive ? min < en : min <= en);
    });
  };
  // ログごとに開催部門を決める
  const assigned = {}, unknown = [];
  config.sections.forEach(function (x) { assigned[x.name] = []; });
  parsedLogs.forEach(function (pl) {
    const s = pl.parsed.summary;
    const call = normalizeCall(s.CALLSIGN || '');
    const declared = String(s.CATEGORYCODE || '').toUpperCase().trim();
    let declSec = catSection[declared];
    let how = '';
    if (declSec == null && config.checklogCodes.indexOf(declared) >= 0) {
      // チェックログ：交信の日時から開催部門を決める
      const count = {};
      pl.parsed.qsos.forEach(function (q) {
        const m = jstToMinutes(q.date, q.time);
        if (m == null) return;
        config.sections.forEach(function (x) { if (inSection(x, m)) count[x.name] = (count[x.name] || 0) + 1; });
      });
      const best = sectionNames.filter(function (n) { return count[n]; }).sort(function (a, b) { return count[b] - count[a]; })[0];
      if (best) { declSec = best; how = 'checklog'; }
    }
    const override = from(options.categoryOverrides, call.base, declSec || '');
    let sec = declSec;
    if (override && catSection[override] != null && catSection[override] !== '') sec = catSection[override];
    const item = { pl: pl, call: call, declared: declared, declSec: declSec, override: override, how: how,
      publicReason: from(options.publicReasons, call.base, declSec || ''), specialAward: from(options.specialAwards, call.base, declSec || '') };
    if (sec && assigned[sec]) { item.sec = sec; assigned[sec].push(item); } else unknown.push(item);
  });
  // 開催部門ごとに審査する
  const sections = [], logs = [], rankings = [], alerts = [];
  const suggestions = { categoryChanges: [], exceptions: [], checklogs: [] };
  const runOptions = function (items, sec) {
    const o = Object.assign({}, options, { section: sec, importDates: null, categoryOverrides: {}, publicReasons: {}, specialAwards: {} });
    items.forEach(function (it) {
      if (it.override) o.categoryOverrides[it.call.base] = it.override;
      if (it.publicReason) o.publicReasons[it.call.base] = it.publicReason;
      if (it.specialAward) o.specialAwards[it.call.base] = it.specialAward;
    });
    return o;
  };
  const addSuggestions = function (r, sec) {
    ['categoryChanges', 'exceptions', 'checklogs'].forEach(function (k) {
      (r.suggestions[k] || []).forEach(function (x) { x.section = sec; suggestions[k].push(x); });
    });
  };
  config.sections.forEach(function (x) {
    const items = assigned[x.name];
    const cfg = Object.assign({}, config, { periods: x.periods, sections: [],
      categories: config.categories.filter(function (c) { return c.section === x.name; }) });
    const r = judgeContestOne(items.map(function (it) { return it.pl; }), cfg, master, runOptions(items, x.name));
    r.logs.forEach(function (l, i) {
      const it = items[i];
      if (it.how === 'checklog') l.alerts.push({ level: '情報', message: 'チェックログの種目コードなので、交信の日時から「' + x.name + '」のログとして扱っています' });
      if (it.override && it.declSec != null && it.declSec !== x.name) {
        l.alerts.push({ level: '要確認', message: '「種目の変更」で、別の開催部門の種目にしています（申告 ' + (it.declared || '（空欄）') + '＝' + (it.declSec || '開催部門なし') +
          ' → ' + it.override + '＝' + x.name + '）。「' + x.name + '」として審査しています' });
      }
    });
    r.rankings.forEach(function (rk) { rk.section = x.name; });
    r.alerts.forEach(function (a) { alerts.push({ level: a.level, message: a.message, section: x.name }); });
    addSuggestions(r, x.name);
    sections.push({ name: x.name, order: x.order, periods: x.periods, result: r });
    Array.prototype.push.apply(logs, r.logs);
    Array.prototype.push.apply(rankings, r.rankings);
  });
  // どの開催部門にも当たらないログ：全部の開催期間で読み、順位・クラブ対抗には入れない
  if (unknown.length) {
    const cfg = Object.assign({}, config, { sections: [], categories: [] });
    const r = judgeContestOne(unknown.map(function (it) { return it.pl; }), cfg, master, runOptions(unknown, ''));
    r.logs.forEach(function (l, i) {
      const it = unknown[i];
      l.sectionUnknown = true;
      l.alerts.unshift({ level: '要確認', message: '種目コード「' + (it.override || it.declared || '（空欄）') + '」が、どの開催部門（' + sectionNames.join('・') +
        '）の種目にも当たりません。どの開催部門の審査にも入れていません。局の一覧の「種目の変更」で、正しい種目コードを入れてください' });
      if (l.club) { l.club.counted = false; l.club.note = '開催部門が分からないため数えません'; }
      suggestions.categoryChanges.push({ call: l.call.full, reason: '種目コードがどの開催部門にも当たりません', section: '' });
    });
    Array.prototype.push.apply(logs, r.logs);
  }
  importDateAlerts(options.importDates, config).forEach(function (a) { alerts.push(a); });
  // クラブ対抗は全部の開催部門をまたいで数える
  const ctx = buildContext(config, master, options);
  const clubRankings = rankClubs(logs, ctx);
  const awards = markAwards([], clubRankings, config);
  if (awards.error && !alerts.some(function (a) { return a.message === awards.error; })) alerts.push({ level: '要確認', message: awards.error });
  return { config: config, logs: logs, rankings: rankings, clubRankings: clubRankings, awardGroups: awards.groups, alerts: alerts,
    specialAwards: [], suggestions: suggestions, sections: sections };
}

/**
 * 委員会が「種目の変更」「局区分の例外リスト」で扱いを決める必要がある局を選ぶ（シートに呼出符号を自動で入れるため）。
 * 戻り値：{categoryChanges: [{call, reason}], exceptions: [{call, reason}], checklogs: [{call, certain, code}]}
 *   categoryChanges … 種目コードが種目表にない・チェックログの扱いがはっきりしない・種目の県と送信ナンバーの県が違う など
 *   exceptions      … 管内局の種目だが、0エリア以外の呼出符号、または住所欄が管内の外（JARLへの照会が必要）
 *   checklogs       … サマリーシートに「チェックログ」とあるログ（種目コードが CHECKLOG のものも）。全部、局の一覧に足す（申し送り No.125）。
 *                     certain は、ログ全体がチェックログと確かに読めたもの（種目コードが CHECKLOG、または「チェックログ」とあって
 *                     申告総得点が0か空）。局の一覧に新しく足すときだけ、「種目の変更」に code（CHECKLOG）を入れる。
 *                     一部チェックログ・申告総得点があるのに「チェックログ」とあるものなど、はっきりしないものは空のまま足す
 */
function suggestSheetEntries(logs, ctx) {
  const cfg = ctx.config, out = { categoryChanges: [], exceptions: [], checklogs: [] };
  logs.forEach(function (log) {
    const call = log.call.full;
    if (!call) return;
    const cat = [];
    if (!log.category && !log.isChecklog) cat.push('参加種目コード「' + log.categoryCode + '」が種目表にありません');
    if (log.checklogDoubt) cat.push('申告総得点がありますが、' + log.checklogBy.join('・') + 'に「チェックログ」とあるため、全体をチェックログとして扱っています');
    if (log.partialChecklog && !log.partialChecklog.evidence) cat.push('「チェックログ」の記載が、参加種目外のバンドのことか、ログ全体のことか、はっきりしません');
    if (log.cls === '管内局' && log.situation === '管外から') cat.push('管内局の種目ですが、送信ナンバーが' + cfg.homeName + 'の外のものです');
    if (log.category && log.category.pref && log.sentPref && log.category.pref !== log.sentPref && cfg.homePrefs.indexOf(log.sentPref) >= 0) {
      cat.push('種目は' + PREF_TABLE[log.category.pref] + '内局ですが、送信ナンバーは' + PREF_TABLE[log.sentPref] + 'のものです');
    }
    if (log.sentMissing && !log.overridden) cat.push('送ったナンバーの欄が空の交信があります（順位に入れるか、チェックログにするかを決める）');
    // 記念局（8J・8N）：いったん局の一覧で保留にし、委員会が JARL の開設か調べて決める（「種目の変更」は空のまま足す。No.170）
    if (isMemorialCall(log.call) && !log.overridden) cat.push('記念局：JARL の開設か調べて、開設ならチェックログ（種目の変更に ' + cfg.checklogCodes[0] + '）');
    if (cat.length) out.categoryChanges.push({ call: call, reason: cat.join('。') });
    if (!log.overridden && (log.declaredChecklog || log.checklogMentioned.length)) {
      const certain = log.declaredChecklog || (log.isChecklog && !log.checklogDoubt && !log.declaredTotal);
      out.checklogs.push({ call: call, certain: !!certain, code: cfg.checklogCodes[0] });
    }
    // 「管内局の決め方」が「管内で運用した局」（cfg.homeStationBy 'operation'）なら、住所・呼出符号のエリアでは確かめない（JARLへの照会は要らない。No.154）
    if (!log.exception && log.cls === '管内局' && cfg.homeStationBy !== 'operation') {
      const ap = log.addressPref;
      if (log.call.area !== cfg.homeArea) out.exceptions.push({ call: call, reason: cfg.homeArea + 'エリア以外の呼出符号で、管内局の種目です（JARLへの照会が必要）' });
      else if (ap.home === false) out.exceptions.push({ call: call, reason: '住所欄が' + cfg.homeName + 'の外（' + (ap.pref ? PREF_TABLE[ap.pref] : ap.how + 'で判定') + '）です（JARLへの照会が必要）' });
    }
  });
  return out;
}

// ------------------------------------------------------------------ 準備
function buildContext(config, master, options) {
  const bandByLabel = {};
  config.bands.forEach(function (b) {
    b.labels.concat([b.name.toUpperCase()]).forEach(function (l) { bandByLabel[l.toUpperCase()] = b; });
  });
  const exceptions = {}, previous = {};
  (options.exceptions || []).forEach(function (e) { exceptions[normalizeCall(e.call).base] = e; });
  (options.previousExceptions || []).forEach(function (e) { previous[normalizeCall(e.call).base] = e; });
  return {
    config: config, master: master, bandByLabel: bandByLabel, exceptions: exceptions, previous: previous,
    categoryOverrides: options.categoryOverrides || {},
    publicReasons: options.publicReasons || {}, // 委員会がチェックログにした理由（局の一覧の「公開する理由」。呼出符号の本体 → 文。No.100）
    specialAwards: options.specialAwards || {}, // 委員が局を選んで付ける賞（局の一覧の「特別賞」。呼出符号の本体 → 文。「、」で2つ以上。No.139）
    clubs: options.clubs || null, // 登録クラブ一覧 {登録番号: {no, name, pref}}。取り込んでいなければ null
    periods: config.periods.map(function (p) {
      return { start: jstStringToMinutes(p.start), end: jstStringToMinutes(p.end) };
    })
  };
}

function prepareLog(pl, ctx) {
  const cfg = ctx.config, s = pl.parsed.summary;
  const call = normalizeCall(s.CALLSIGN || '');
  let code = String(s.CATEGORYCODE || '').toUpperCase().trim();
  const overridden = ctx.categoryOverrides[call.full] || ctx.categoryOverrides[call.base];
  const log = {
    id: pl.id, parsed: pl.parsed, receivedAt: pl.receivedAt || null,
    call: call, declaredCategory: code, alerts: [], qsos: []
  };
  log.declaredChecklog = cfg.checklogCodes.indexOf(code) >= 0; // 申告の種目コードが CHECKLOG
  log.checklogMentioned = checklogMentions(s); // サマリーシートで「チェックログ」とある場所（局の一覧に足すため。No.125）
  log.listChange = overridden || ''; // 局の一覧の「種目の変更」（確定結果に入れる。No.125）
  log.publicReason = String(ctx.publicReasons[call.full] || ctx.publicReasons[call.base] || '').trim(); // 局の一覧の「公開する理由」
  log.specialAwards = String(ctx.specialAwards[call.full] || ctx.specialAwards[call.base] || '').split(/[、,，;；\n]/)
    .map(function (x) { return x.trim(); }).filter(function (x, i, all) { return x && all.indexOf(x) === i; }); // 局の一覧の「特別賞」（No.139）
  if (overridden) {
    log.overridden = true;
    // 申告と同じ種目コード（CHECKLOG を自動で入れた局など）なら、変更の知らせは出さない
    if (overridden !== code) log.alerts.push({ level: '情報', message: '参加種目を ' + code + ' から ' + overridden + ' に変更しています（委員会の変更）' });
    code = overridden;
  }
  log.categoryCode = code;
  log.isChecklog = cfg.checklogCodes.indexOf(code) >= 0;
  // 委員会が「種目の変更」でチェックログにした局：公開する理由（審査結果・確定結果・結果のページの「チェックログとした理由」に出す。No.100）
  if (overridden && log.isChecklog) log.committeeChecklog = { publicReason: log.publicReason };
  // 「チェックログ」の記載の場所（全体か一部かは、交信を読んだあとで決める）
  const checklogWhere = overridden || log.isChecklog ? [] : log.checklogMentioned;
  log.category = cfg.categories.filter(function (c) { return c.code === code; })[0] || null;
  log.cls = log.category ? log.category.cls : null;
  const ex = ctx.exceptions[call.base];
  if (ex) { log.exception = ex; log.cls = ex.cls; }

  const doubled = [];
  pl.parsed.qsos.forEach(function (raw) {
    if (raw.yearGuessed) fitYearToPeriods(raw, ctx);
    const band = bandOfLabel(raw.band, ctx);
    const min = jstToMinutes(raw.date, raw.time);
    const isCw = cfg.cwModes.indexOf(raw.mode) >= 0 || (cfg.cwIfRst3 && /^\d{3}$/.test(raw.rcvdRst));
    const isPhone = !isCw && cfg.phoneModes.indexOf(raw.mode) >= 0;
    log.qsos.push({
      raw: raw, band: band, bandName: band ? band.name : raw.band, minutes: min,
      modeClass: isCw ? '電信' : (isPhone ? '電話' : null),
      call: normalizeCall(raw.call),
      sent: numberInfo(undoubleRst(raw.sentRst, raw.sentNo, ctx, doubled), min, ctx),
      rcvd: numberInfo(undoubleRst(raw.rcvdRst, raw.rcvdNo, ctx, doubled), min, ctx),
      code: null, reason: '', unique: false, nil: false, match: null,
      sentMissing: !!raw.sentMissing // 送ったナンバーの欄が空（04_parser.js が見出しの列で分かったとき。申し送り No.98）
    });
  });

  log.sentMissing = log.qsos.filter(function (q) { return q.sentMissing; }).length;
  if (checklogWhere.length) decideChecklog(log, checklogWhere, s, cfg);
  if (doubled.length) {
    log.alerts.push({ level: '注意', message: 'ナンバーの前に、RSTがもう一度書かれている交信が ' + doubled.length +
      ' 件あります（例：「' + doubled[0].from + '」）。RSTを除いたナンバー（例：「' + doubled[0].to + '」）として審査しました' });
  }

  // 送信ナンバーから、どこから参加したかを判断する（多数決）
  let inside = 0, outside = 0;
  log.qsos.forEach(function (q) {
    if (q.sent.home && cfg.insideNumberKinds.indexOf(q.sent.kind) >= 0) inside++;
    else if (!q.sent.home && cfg.outsideNumberKinds.indexOf(q.sent.kind) >= 0) outside++;
  });
  log.situation = inside === 0 && outside === 0 ? '不明' : (inside >= outside ? '管内から' : '管外から');
  const prefCount = {};
  log.qsos.forEach(function (q) { if (q.sent.pref) prefCount[q.sent.pref] = (prefCount[q.sent.pref] || 0) + 1; });
  log.sentPref = Object.keys(prefCount).sort(function (a, b) { return prefCount[b] - prefCount[a]; })[0] || null;
  log.addressPref = addressPref(s.ADDRESS || '', cfg);
  return log;
}

/**
 * ナンバー欄にRSTが重ねて書かれているとき（例：RST「59」、ナンバー「590809」や「5928」）、RSTを除いたナンバーを返す。
 * そのままでは都府県の番号として読めず（「59」で始まる都府県はない）、RSTを除くと読めるときだけ読み替える
 */
function undoubleRst(rst, no, ctx, doubled) {
  no = String(no || '');
  if (!rst || !/^\d+$/.test(no)) return no;
  const readable = function (n) { return !!(numberKind(n) && PREF_TABLE[numberPref(n)]); };
  if (readable(no)) return no;
  const len = rst.length, head = no.substring(0, len), rest = no.substring(len);
  if (!/^[1-5][1-9][1-9]?$/.test(head) || !readable(rest)) return no;
  doubled.push({ from: rst + ' ' + no, to: rest });
  return rest;
}

/**
 * 年のない日付（「M DD」）の年を、開催期間に合わせる。開催期間の開始・終了の年のうち、
 * その日時が開催期間に入る年があればその年、なければ最初の開催期間の開始の年にする
 */
function fitYearToPeriods(raw, ctx) {
  const md = raw.date.substring(4);
  const years = [];
  ctx.config.periods.forEach(function (p) {
    [p.start, p.end].forEach(function (x) { const y = String(x).substring(0, 4); if (/^\d{4}$/.test(y) && years.indexOf(y) < 0) years.push(y); });
  });
  if (!years.length) return;
  const hit = years.filter(function (y) { return inPeriod(jstToMinutes(y + md, raw.time), ctx); })[0];
  raw.date = (hit || years[0]) + md;
}

/** ログのバンドの表記からバンドを決める。表記の一覧になければ、周波数の範囲（mhz）で決める（例：145→144MHz、432→430MHz） */
function bandOfLabel(label, ctx) {
  const L = String(label || '').toUpperCase();
  if (ctx.bandByLabel[L]) return ctx.bandByLabel[L];
  const v = bandTokenMHz(L.replace(/MHZ$/, ''));
  if (v == null) return null;
  return ctx.config.bands.filter(function (b) { return b.mhz && v >= b.mhz[0] && v <= b.mhz[1]; })[0] || null;
}

/** 種目の対象バンドか */
function bandInCategory(cat, band) {
  if (!cat || !band) return true;
  return cat.bandGroup ? band.group === cat.bandGroup : (!cat.bands || cat.bands.indexOf(band.name) >= 0);
}

/**
 * サマリーシートに「チェックログ」とあるとき、ログ全体をチェックログにするか、
 * 参加種目外のバンドの交信だけをチェックログの意味で書いたもの（一部チェックログ）とみなすかを決める。
 *
 * 一部チェックログとみなす条件（すべて満たす）
 *   ・種目コードが種目表にある種目（シングルバンド種目など、対象外のバンドがある種目）
 *   ・参加種目外のバンドの交信がある
 *   ・申告総得点が0より大きい
 * そのうえで、次のどちらかがあれば根拠ありとして「情報」、なければ「要確認」を出す
 *   ・「チェックログ」と書かれた欄に、参加種目外のバンド名（例：50MHz、50M、50）が書かれている
 *   ・参加種目外のバンドの交信の得点欄がすべて0で、種目内の交信には1以上がある
 * 一部チェックログのログは、種目の順位に入る。参加種目外のバンドの交信はもともと得点対象外（A）で、照合には使う。
 * 委員会は「種目の変更」シートで、どちらの扱いにも直せる。
 */
function decideChecklog(log, where, s, cfg) {
  const cat = log.category;
  const outside = cat ? log.qsos.filter(function (q) { return q.band && !bandInCategory(cat, q.band); }) : [];
  const ts = toHankaku(s.TOTALSCORE || '').replace(/[,\s]/g, '');
  const declared = /^\d+$/.test(ts) ? +ts : 0;
  if (cat && outside.length && declared > 0) {
    const bandsOut = [];
    outside.forEach(function (q) { if (bandsOut.indexOf(q.band) < 0) bandsOut.push(q.band); });
    // バンド名を探すのは「チェックログ」と書かれた欄だけ（住所の番地などを拾わないように）
    const text = Object.keys(s).filter(function (k) {
      return k !== 'OATH' && /チェックログ|CHECK\s*LOG/i.test(toHankaku(s[k] || ''));
    }).map(function (k) { return toHankaku(s[k]).toUpperCase(); }).join(' ');
    const named = bandsOut.some(function (b) {
      return [b.name].concat(b.labels).some(function (l) {
        const L = String(l).toUpperCase().replace(/MHZ$/, '');
        return new RegExp('(^|[^0-9.])' + L.replace(/\./g, '\\.') + '(\\s*(MHZ|M|G|GHZ))?([^0-9]|$)').test(text);
      });
    });
    const inside = log.qsos.filter(function (q) { return q.band && bandInCategory(cat, q.band); });
    const zeroOut = outside.every(function (q) { return q.raw.pts === '0'; }) &&
      inside.some(function (q) { return /^[1-9]\d*$/.test(q.raw.pts); });
    log.partialChecklog = {
      where: where, bands: bandsOut.map(function (b) { return b.name; }), count: outside.length,
      evidence: named ? '記載にバンド名あり' : (zeroOut ? '参加種目外のバンドの得点欄が0' : '')
    };
    return;
  }
  log.isChecklog = true;
  log.checklogBy = where;
  if (!log.categoryCode) log.categoryCode = 'CHECKLOG';
  if (cat && declared > 0) log.checklogDoubt = true; // 申告総得点があるのに全体がチェックログ扱い
}

const SUMMARY_TAG_NAMES = { COMMENTS: '意見欄', CATEGORYCODE: '種目コード', CATEGORYNAME: '種目名', NAME: '氏名欄', ADDRESS: '住所欄' };

/** サマリーシートで「チェックログ」と書かれている場所（タグの日本語名）を返す。宣誓文は見ない */
function checklogMentions(summary) {
  const out = [];
  Object.keys(summary).forEach(function (k) {
    if (k === 'OATH') return;
    if (/チェックログ|CHECK\s*LOG/i.test(toHankaku(summary[k] || ''))) out.push(SUMMARY_TAG_NAMES[k] || k);
  });
  return out;
}

function numberInfo(no, minutes, ctx) {
  const kind = numberKind(no);
  const pref = kind ? numberPref(no) : null;
  return {
    no: no, kind: kind, pref: pref,
    home: pref ? ctx.config.homePrefs.indexOf(pref) >= 0 : false,
    entry: kind && minutes != null ? ctx.master.lookup(no, minutes) : null,
    exists: kind ? ctx.master.exists(no) : false
  };
}

/** 住所欄から都府県を推定する。{pref, home, how} */
function addressPref(addr, cfg) {
  const a = toHankaku(addr);
  const names = Object.keys(PREF_TABLE);
  for (let i = 0; i < names.length; i++) {
    const nm = PREF_TABLE[names[i]];
    if (nm !== '小笠原' && a.indexOf(nm) >= 0) {
      return { pref: names[i], home: cfg.homePrefs.indexOf(names[i]) >= 0, how: '県名' };
    }
  }
  const pm = /〒?\s*(\d{3})-?\d{4}/.exec(a);
  if (pm) {
    const p3 = +pm[1];
    if (p3 >= 940 && p3 <= 959) return { pref: '08', home: true, how: '郵便番号' };
    if (p3 >= 380 && p3 <= 399) return { pref: '09', home: true, how: '郵便番号' };
    return { pref: null, home: false, how: '郵便番号' };
  }
  return { pref: null, home: null, how: '判定できず' };
}

// ------------------------------------------------------------------ 単独チェック
/** 判定コードを付ける。最初に付いたものが主なコード。ほかの問題も q.codes に残す */
function setCode(q, code, reason, ctx) {
  if (ctx && !ctx.config.checks[code]) return;
  q.codes = q.codes || [];
  if (q.codes.indexOf(code) < 0) q.codes.push(code);
  if (q.code) return;
  q.code = code; q.reason = reason;
}

function inPeriod(min, ctx) {
  if (min == null) return false;
  // 「終了の分の交信」が「時間外（時報まで）」なら、終了の分ちょうどの交信は時間外（新潟・ギガヘルツ。申し送り No.139）
  const exclusive = !!ctx.config.endExclusive;
  return ctx.periods.some(function (p) { return min >= p.start && (exclusive ? min < p.end : min <= p.end); });
}

function singleChecks(log, ctx) {
  const cfg = ctx.config, cat = log.category;
  log.qsos.forEach(function (q) {
    if (!inPeriod(q.minutes, ctx)) setCode(q, 'T', q.minutes == null ? '日時が読み取れません' : 'コンテスト時間外です', ctx);
    // コンテストの対象バンドでない周波数（「200」のようにアマチュアバンドでない数字も含む）は、対象バンド外（O）
    if (!q.band) setCode(q, 'O', 'バンド「' + q.raw.band + '」はこのコンテストの対象外です', ctx);
    if (q.band && cat) {
      const okBand = cat.bandGroup ? q.band.group === cat.bandGroup
        : (!cat.bands || cat.bands.indexOf(q.band.name) >= 0);
      if (!okBand) { setCode(q, 'A', '参加種目（' + cat.code + '）の対象外のバンドです', ctx); q.aBand = true; }
    }
    // 種目のモードの制限（「規約_種目」の「モード」。電話・電信。空なら両方＝MIX。新潟。申し送り No.139）
    if (cat && cat.mode && q.modeClass && q.modeClass !== cat.mode) setCode(q, 'A', '参加種目（' + cat.code + '）の対象外のモードです', ctx);
    if (!q.modeClass) setCode(q, 'A', 'モード「' + q.raw.mode + '」は対象外です', ctx);
    if (!q.call.valid) setCode(q, 'B', '呼出符号の形式が正しくありません' + zeroHint(q.call.full), ctx);
    else if (q.call.base === log.call.base) setCode(q, 'B', '自局との交信です', ctx);

    // 送信ナンバー（送った側の誤り）。欄が空の交信は確かめない（受けたナンバーで審査し、送ったナンバーは相手局のログから読む）
    const sentErr = q.sentMissing ? null : numberProblem(q.sent, q.minutes, ctx, '送信');
    if (sentErr) setCode(q, 'N', sentErr, ctx);
    // 受信ナンバー
    const rcvdErr = numberProblem(q.rcvd, q.minutes, ctx, '受信');
    if (rcvdErr) { setCode(q, 'N', rcvdErr, ctx); q.kindError = /種類/.test(rcvdErr); q.rcvdErr = rcvdErr; }
    // 交信相手の条件
    if (cfg.outsideMayWorkOnlyHome && log.situation === '管外から' && q.rcvd.kind && !q.rcvd.home) {
      setCode(q, 'B', '交信対象外の局です（' + cfg.homeName + 'の外から参加した局は、' +
        cfg.homeName + 'の' + numberKindsText(cfg.insideNumberKinds) + 'ナンバーを送る局とだけ交信できます）', ctx);
    }
  });

  // 重複（時間外・対象バンド外・種目外の交信は数えない）。電信を優先する決まりのときは、クロスチェックのあとで決める（markDuplicatesPreferCw）
  if (cfg.dupPreferCw) return;
  const seen = {};
  log.qsos.slice().sort(function (a, b) {
    return (a.minutes || 0) - (b.minutes || 0) || a.raw.lineNo - b.raw.lineNo;
  }).forEach(function (q) {
    if (q.code === 'T' || q.code === 'O' || q.code === 'A') return;
    const key = dupKey(q, cfg);
    if (seen[key]) setCode(q, 'D', '重複交信です（初回 ' + q.raw.date + ' ' + seen[key].raw.time + '）', ctx);
    else seen[key] = q;
  });
}

/**
 * 重複を見るときの鍵。「重複交信の単位」が「バンドごと」ならバンドと相手、「バンドとモードごと」なら電信／電話も、
 * 「バンドとモード欄ごと」ならログのモード欄（CW・SSB・FM など）も使う（ギガヘルツ。申し送り No.139）
 */
function dupKey(q, cfg) {
  const mode = cfg.dupUnit === 'bandmode' ? q.modeClass + '|' : cfg.dupUnit === 'bandrawmode' ? String(q.raw.mode || '').toUpperCase() + '|' : '';
  return q.bandName + '|' + mode + q.call.full;
}

/**
 * 重複（規約の「重複のときは電信を優先する」が「する」のとき。申し送り No.102）。クロスチェックのあとで呼ぶ。
 * 同じ局・同じバンド（重複交信の単位が「バンドとモードごと」ならモードも）の交信のうち、時間外・対象バンド外・種目外を除き、
 * ほかの理由で無効になっていない交信の中から、いちばん先の電信を残す（電信がなければ、いちばん先の交信）。
 * 残すはずの電信がほかの理由（ナンバーの不一致など）で無効なら、無効でない電話の交信を残す。
 * 全部が無効なら、いちばん先の交信を残す（重複の印は付けない）。残さない交信は重複（D）。
 * 理由の文は、残した交信が電信なら「重複交信です（電信の交信（5/11 23:50）を残しました）」、そうでなければ今までどおり「（初回 …）」
 */
function markDuplicatesPreferCw(log, ctx) {
  const cfg = ctx.config, groups = {}, order = [];
  log.qsos.slice().sort(function (a, b) {
    return (a.minutes || 0) - (b.minutes || 0) || a.raw.lineNo - b.raw.lineNo;
  }).forEach(function (q) {
    if (q.code === 'T' || q.code === 'O' || q.code === 'A') return;
    const key = dupKey(q, cfg);
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(q);
  });
  order.forEach(function (key) {
    const list = groups[key];
    if (list.length < 2) return;
    const valid = list.filter(function (q) { return !q.code; });
    const keep = valid.filter(function (q) { return q.modeClass === '電信'; })[0] || valid[0] || list[0];
    const why = keep.modeClass === '電信' && list.some(function (q) { return q !== keep && q.minutes != null && keep.minutes != null && q.minutes < keep.minutes; })
      ? '重複交信です（電信の交信（' + (+keep.raw.date.substring(5, 7)) + '/' + (+keep.raw.date.substring(8, 10)) + ' ' + keep.raw.time + '）を残しました）'
      : '重複交信です（初回 ' + keep.raw.date + ' ' + keep.raw.time + '）';
    list.forEach(function (q) { if (q !== keep) setCode(q, 'D', why, ctx); });
  });
}

/** 英字のO（オー）を数字の0（ゼロ）にすると正しい呼出符号になるとき、その説明（例：「（数字の0が英字のOになっていませんか：JR0ZAX）」） */
function zeroHint(full) {
  const f = String(full || '');
  if (f.indexOf('O') < 0) return '';
  for (let i = 0; i < f.length; i++) {
    if (f[i] !== 'O') continue;
    const t = f.substring(0, i) + '0' + f.substring(i + 1);
    if (normalizeCall(t).valid) return '（数字の0が英字のOになっていませんか：' + t + '）';
  }
  return '';
}

/** ナンバーの問題点を返す（問題なければ null） */
/** 送るナンバーの種類の呼び方（['市', '郡', '区'] → 「市郡区」、['都府県支庁'] → 「都府県支庁」）。ギガヘルツは管外局も市郡区（No.139） */
function numberKindsText(kinds) {
  return (kinds || []).join('') || '市郡区';
}

function numberProblem(info, minutes, ctx, side) {
  const cfg = ctx.config;
  if (!info.kind) return side + 'ナンバー「' + info.no + '」の形が正しくありません';
  const allowed = info.home ? cfg.insideNumberKinds : cfg.outsideNumberKinds;
  if (allowed.indexOf(info.kind) < 0) {
    return side + 'ナンバー「' + info.no + '」は送るべき種類のナンバーではありません（' +
      (info.home ? cfg.homeName + 'の局は' : cfg.homeName + 'の外の局は') + numberKindsText(allowed) + 'ナンバーを送ります）';
  }
  if (!info.exists) return side + 'ナンバー「' + info.no + '」はナンバー一覧にありません（存在しない、または消滅した市郡区）';
  if (minutes != null && !info.entry) return side + 'ナンバー「' + info.no + '」はコンテスト時点で有効なナンバーではありません';
  return null;
}

// ------------------------------------------------------------------ クロスチェック
function crossCheck(logs, ctx) {
  const cfg = ctx.config, tol = cfg.timeToleranceMin;
  const byFull = {}, byBase = {};
  logs.forEach(function (l) {
    byFull[l.call.full] = l;
    (byBase[l.call.base] = byBase[l.call.base] || []).push(l);
  });
  // ユニーク判定用：バンドごとに、どのログに現れたか
  const appear = {};
  logs.forEach(function (l) {
    l.qsos.forEach(function (q) {
      const k = q.bandName + '|' + q.call.full;
      (appear[k] = appear[k] || {})[l.key] = true;
    });
  });
  const sameCall = function (a, b) {
    return a.full === b.full || (cfg.portableMismatch === 'OK' && a.base === b.base);
  };
  const near = function (a, b) { return a.minutes != null && b.minutes != null && Math.abs(a.minutes - b.minutes) <= tol; };

  // 索引：交信相手の呼出符号 → その局と交信した記録（どのログのどの交信か）。
  // 全ログを毎回見直さずに済むようにして、提出局が多くても処理時間が延びすぎないようにする
  const workedFull = {}, workedBase = {};
  logs.forEach(function (L) {
    L.qsos.forEach(function (c) {
      if (!c.band || c.minutes == null) return;
      const e = { log: L, qso: c };
      (workedFull[c.call.full] = workedFull[c.call.full] || []).push(e);
      (workedBase[c.call.base] = workedBase[c.call.base] || []).push(e);
    });
  });
  /** 自局 A と交信した記録（呼出符号の照合は sameCall と同じ） */
  const workedWith = function (A) {
    return cfg.portableMismatch === 'OK' ? (workedBase[A.call.base] || []) : (workedFull[A.call.full] || []);
  };

  logs.forEach(function (A) {
    const toA = workedWith(A);
    const toAByLog = {};
    toA.forEach(function (e) { (toAByLog[e.log.key] = toAByLog[e.log.key] || []).push(e); });
    A.qsos.forEach(function (q) {
      if (!q.band || q.minutes == null) return;
      let B = byFull[q.call.full];
      if (!B && cfg.portableMismatch === 'OK' && byBase[q.call.base]) B = byBase[q.call.base][0];
      if (B && B !== A) {
        const cands = (toAByLog[B.key] || []).filter(function (e) { return sameCall(e.qso.call, A.call) && near(e.qso, q); })
          .map(function (e) { return e.qso; });
        const same = cands.filter(function (c) { return c.band === q.band; })
          .sort(function (a, b) { return Math.abs(a.minutes - q.minutes) - Math.abs(b.minutes - q.minutes); });
        if (same.length) {
          const c = same[0];
          q.match = { log: B, qso: c };
          if (c.sentMissing) {
            // 相手局（B）のログに送ったナンバーがない：この局（A）が受けたナンバーを、B が送ったナンバーとして扱う（A に迷惑をかけない。No.98）
            if (!c.sentFromPartner) c.sentFromPartner = q.rcvd.no;
          } else if (q.rcvd.no !== c.sent.no) {
            setCode(q, 'N', '受信ナンバー「' + q.rcvd.no + '」が、相手局の送信ナンバー「' + c.sent.no + '」と違います', ctx);
          }
        } else if (cands.length) {
          setCode(q, 'I', 'バンドが相手局のログ（' + cands[0].bandName + '）と違います', ctx);
        } else {
          q.nil = true; // 相手のログに記録なし（暫定で有効）
        }
        return;
      }
      if (B === A) return;
      // 呼出符号の誤り：提出局のうち、似た呼出符号の局が同じ時刻・バンドに自局と交信している
      let L = null;
      for (let i = 0; i < toA.length && !L; i++) {
        const e = toA[i];
        if (e.log === A || e.log.call.full === q.call.full) continue;
        if (e.qso.band !== q.band || !near(e.qso, q) || !sameCall(e.qso.call, A.call)) continue;
        if (e.log.call.base === q.call.base || editDistance(e.log.call.base, q.call.base) <= 1) L = e.log;
      }
      if (L) {
        const why = L.call.base === q.call.base ? '移動表示の誤りです' : '呼出符号の誤りです';
        setCode(q, 'X', why + '（相手局のログとの照合では ' + L.call.full + '）', ctx);
        if (q.code === 'X') q.correctCall = L.call.full; // 正しい呼出符号（LCRの「>」の後に出す。30_lcr.js）
        return;
      }
      // ユニークコールサイン
      const ap = appear[q.bandName + '|' + q.call.full] || {};
      const others = Object.keys(ap).filter(function (id) { return id !== A.key; });
      if (others.length === 0) q.unique = true;
    });
  });
}

// ------------------------------------------------------------------ 種類の違うナンバー
/**
 * 受け取ったナンバーが送るべき種類と違う交信について、送った側の誤りか、受け取った側の誤りかを見分ける。
 *  1. 相手局のログに、その交信の正しい送信ナンバーがある → 受け取った側の誤り（受け取った側の交信だけ無効）
 *  2. 相手局のログで、受け取ったとおりのナンバーを送っている → 送った側の誤り（委員会の判断に任せる）
 *  3. 相手局のログで照らし合わせられない → ほかの局がその局から受け取ったナンバーで判断する
 *     （正しいナンバーを受け取った局のほうが多ければ、受け取った側の誤り）
 *  4. どれでも分からない → 送るべき種類と違うナンバーを受け取ったので、受信の誤りとする（受け取った側の交信だけ無効）
 * 戻り値：{ sender: {呼出符号: [交信の説明]} }
 */
function judgeKindErrors(logs, ctx) {
  const out = { sender: {} };
  const targets = [];
  logs.forEach(function (log) { log.qsos.forEach(function (q) { if (q.kindError) targets.push({ log: log, q: q }); }); });
  if (!targets.length) return out;
  // ほかの局が、その局から受け取ったナンバー（呼出符号ごと）
  const got = {};
  logs.forEach(function (log) {
    log.qsos.forEach(function (q) {
      (got[q.call.full] = got[q.call.full] || []).push({ log: log, no: q.rcvd.no, ok: !numberProblem(q.rcvd, q.minutes, ctx, '受信') });
    });
  });
  const note = function (q, text) { if (q.code === 'N' && q.reason === q.rcvdErr) q.reason = q.rcvdErr + '。' + text; };
  targets.forEach(function (t) {
    const q = t.q, desc = t.log.call.full + '：' + q.raw.date + ' ' + q.raw.time + ' ' + q.bandName + ' 「' + q.rcvd.no + '」';
    const c = q.match && !q.match.qso.sentMissing ? q.match.qso : null; // 相手局の送ったナンバーの欄が空なら、相手局のログでは確かめられない
    if (c && c.sent.no !== q.rcvd.no && !numberProblem(c.sent, c.minutes, ctx, '送信')) {
      q.receiveError = true;
      note(q, '相手局のログでは「' + c.sent.no + '」を送っています（受信の誤り）');
      return;
    }
    if (c && c.sent.no === q.rcvd.no) { (out.sender[q.call.full] = out.sender[q.call.full] || []).push(desc); return; }
    const count = {}; let same = 0;
    (got[q.call.full] || []).forEach(function (g) {
      if (g.log === t.log) return;
      if (g.no === q.rcvd.no) same++;
      else if (g.ok) count[g.no] = (count[g.no] || 0) + 1;
    });
    const best = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0];
    if (best && count[best] > same) {
      q.receiveError = true;
      note(q, 'ほかの局は「' + best + '」と受け取っています（' + count[best] + '局。受信の誤り）');
      return;
    }
    // 照らし合わせられなくても、送るべき種類と違うナンバーを受け取ったのは受信の誤りとする（委員会の確認には出さない）
    q.receiveError = true;
    note(q, '相手局のログやほかの局の記録では確かめられませんが、受信の誤りとして無効にしています');
  });
  return out;
}

// ------------------------------------------------------------------ 得点計算
/**
 * 1交信の得点。「規約_得点」（cfg.pointRules。[{band（バンド名かまとまりの名前）, points}]）に当てはまる行があればその得点、
 * なければ「規約_基本」の「1交信の得点」（ギガヘルツ：1200MHz 1点・2400MHz 2点・5600MHz以上 5点。申し送り No.139）。
 * 上から順に見て、最初に当てはまった行を使う。モード・相手の局区分で得点を変えるのは、汎用化のときに足す
 */
function pointsOf(q, ctx) {
  return pointsForBand(q.band || { name: q.bandName }, ctx.config);
}

/** バンド（cfg.bands の1つ。{name, group}）の1交信の得点（pointsOf の中身。ログ入力フォームなど、交信がないときにも使える） */
function pointsForBand(band, cfg) {
  const rules = cfg.pointRules || [];
  for (let i = 0; i < rules.length; i++) {
    const b = rules[i].band;
    if (!b || (band && (band.name === b || band.group === b))) return rules[i].points;
  }
  return cfg.pointsPerQso;
}

function scoreLog(log, ctx) {
  const cfg = ctx.config;
  const rule = cfg.multiRules[log.cls] || null;
  const bands = {};
  const row = function (name) {
    return bands[name] = bands[name] || {
      band: name,
      pre: { qsos: 0, points: 0, multi: 0, cw: 0, phone: 0 },
      post: { qsos: 0, points: 0, multi: 0, cw: 0, phone: 0, multiSet: {} }
    };
  };
  let lastValid = null;
  log.qsos.forEach(function (q) {
    const r = row(q.bandName);
    // 審査前（申告どおり）
    r.pre.qsos++;
    r.pre.points += /^\d+$/.test(q.raw.pts) ? +q.raw.pts : (q.raw.pts ? 0 : pointsOf(q, ctx)); // 「DUP」などは0点、空なら1交信の点数
    if (q.raw.mlt && q.raw.mlt !== '-' && q.raw.mlt !== '0') r.pre.multi++;
    if (q.modeClass === '電信') r.pre.cw++; else if (q.modeClass === '電話') r.pre.phone++;
    // 審査後
    q.valid = !log.isChecklog && !q.code;
    if (!q.valid) return;
    r.post.qsos++;
    r.post.points += pointsOf(q, ctx);
    if (q.modeClass === '電信') r.post.cw++; else r.post.phone++;
    if (rule) {
      const kinds = q.rcvd.home ? rule.home : rule.other;
      if (kinds.indexOf(q.rcvd.kind) >= 0) r.post.multiSet[q.rcvd.no] = true;
    }
    if (lastValid == null || q.minutes > lastValid) lastValid = q.minutes;
  });
  const order = cfg.bands.map(function (b) { return b.name; });
  log.bandRows = Object.keys(bands).sort(function (a, b) {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }).map(function (k) {
    const r = bands[k];
    r.post.multi = Object.keys(r.post.multiSet).length;
    return r;
  });
  const sum = function (side, f) { return log.bandRows.reduce(function (a, r) { return a + r[side][f]; }, 0); };
  log.pre = { qsos: sum('pre', 'qsos'), points: sum('pre', 'points'), multi: sum('pre', 'multi'), cw: sum('pre', 'cw'), phone: sum('pre', 'phone') };
  log.pre.total = log.pre.points * log.pre.multi;
  const ts = toHankaku(log.parsed.summary.TOTALSCORE || '').replace(/[,\s]/g, '');
  log.declaredTotal = /^\d+$/.test(ts) ? +ts : null;
  log.post = { qsos: sum('post', 'qsos'), points: sum('post', 'points'), multi: sum('post', 'multi'), cw: sum('post', 'cw'), phone: sum('post', 'phone') };
  log.post.total = log.post.points * log.post.multi;
  log.lastValidMinutes = lastValid;
  // チェックコード別の件数
  log.counts = {};
  Object.keys(CODE_INFO).forEach(function (k) { log.counts[k] = 0; });
  log.qsos.forEach(function (q) {
    if (q.code) log.counts[q.code]++;
    if (q.unique && !q.code) log.counts.U++; // 重複など得点にならない交信は数えない（LCR の「ユニークコールサイン」の一覧と同じ数。No.154・No.155）
  });
  if (log.isChecklog) log.counts.C = log.qsos.length;
  log.nilCount = log.qsos.filter(function (q) { return q.nil && !q.code; }).length;
  log.invalidCount = log.qsos.filter(function (q) { return !q.valid; }).length;
}

// ------------------------------------------------------------------ 別枠部門（電信部門など）
/**
 * ログの中の電信の交信だけを有効として、得点を数え直す（マルチバンドのみ）。電話の交信はないものとして扱う。
 * includeOtherBands のときは、シングルバンド種目の対象外バンド（コードA）の交信も含める。
 */
function scoreDivisions(log, ctx) {
  const cfg = ctx.config;
  log.divisions = [];
  (cfg.divisions || []).forEach(function (dv) {
    const declared = !dv.applyKeyword || commentHasKeyword(log.parsed.summary.COMMENTS, dv.applyKeyword);
    const hasMode = log.qsos.some(function (q) { return q.modeClass === dv.modeClass; });
    if (!declared && !(dv.applyMode === 'declaredOrLog' && hasMode)) return;
    const d = { name: dv.name, rankBy: dv.rankBy || '全体', declared: declared, eligible: true, note: '', bandRows: [], points: 0, multi: 0, total: 0, qsos: 0, dupes: 0 };
    if (log.isChecklog) { d.eligible = false; d.note = 'チェックログのため対象外です'; }
    else if (dv.opOnly && (!log.category || log.category.op !== dv.opOnly)) {
      d.eligible = false; d.note = settingsOpLabel(dv.opOnly, cfg) + '局だけが参加できる部門です（種目 ' + log.categoryCode + '）'; // 言葉は規約の呼び方（個人／社団、シングルオペ／マルチオペ。No.165）
    }
    if (!declared && !d.eligible) return; // 申告のない対象外の局は載せない
    const rule = cfg.multiRules[log.cls] || null;
    // 電信の交信だけを有効として数え直す。電話の交信はないものとして扱うので、
    // 同じ局・同じバンドで先に電話で交信していても、電信の交信は重複にならない（重複は電信の交信どうしで判定）。
    // 本来の審査で付いた D（重複）は数え直すので無視する。A（参加種目外のバンド）は includeOtherBands のとき無視する。
    const ignorable = function (c) { return c === 'D' || (c === 'A' && dv.includeOtherBands); };
    const included = function (q) {
      if (q.modeClass !== dv.modeClass) return false;
      if (q.codes && q.codes.some(function (c) { return !ignorable(c); })) return false;
      if (q.codes && q.codes.indexOf('A') >= 0 && !q.aBand) return false; // モードによるAは含めない
      return true;
    };
    const rows = {}, seen = {};
    let last = null;
    d.dupes = 0;
    log.qsos.filter(included).sort(function (a, b) {
      return (a.minutes || 0) - (b.minutes || 0) || a.raw.lineNo - b.raw.lineNo;
    }).forEach(function (q) {
      const key = q.bandName + '|' + q.call.full;
      if (seen[key]) { d.dupes++; return; }
      seen[key] = true;
      const r = rows[q.bandName] = rows[q.bandName] || { band: q.bandName, qsos: 0, points: 0, multiSet: {} };
      r.qsos++; r.points += pointsOf(q, ctx);
      if (rule) {
        const kinds = q.rcvd.home ? rule.home : rule.other;
        if (kinds.indexOf(q.rcvd.kind) >= 0) r.multiSet[q.rcvd.no] = true;
      }
      if (last == null || q.minutes > last) last = q.minutes;
    });
    const order = cfg.bands.map(function (b) { return b.name; });
    d.bandRows = Object.keys(rows).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }).map(function (k) {
      const r = rows[k]; r.multi = Object.keys(r.multiSet).length; return r;
    });
    d.qsos = d.bandRows.reduce(function (a, r) { return a + r.qsos; }, 0);
    d.logQsos = log.qsos.filter(function (q) { return q.modeClass === dv.modeClass; }).length; // ログに書かれた、その部門のモードの交信の数（審査結果シートの「交信局数（ログ）」。No.132）
    d.points = d.bandRows.reduce(function (a, r) { return a + r.points; }, 0);
    d.multi = d.bandRows.reduce(function (a, r) { return a + r.multi; }, 0);
    d.total = d.eligible ? d.points * d.multi : 0;
    d.lastMinutes = last;
    log.divisions.push(d);
  });
}

// ------------------------------------------------------------------ 申告で入る部門（ジュニア部門など）
/**
 * 意見欄に申告がある局を、本来の種目の審査後総得点のまま、別の順位に入れる（得点は数え直さない）。
 * log.entryDivisions に {name, eligible, note, birthDate, birthProblem, prefName, qsos, points, multi, total, lastMinutes} を入れる。
 *   eligible=false … 順位に入れない（チェックログ・社団局・管外局・生年月日が区切りより前）
 *   birthProblem   … 順位には入れるが、委員会が確かめること（生年月日が見つからない・区切りの日が設定されていない）
 * 生年月日は needBirthDate のときだけ確かめる（「基本設定」の「ジュニア部門の生年月日の確認」が「する」のとき）。
 * 確かめないときは、意見欄の申告を信用して順位に入れる
 */
function scoreEntryDivisions(log, ctx) {
  const cfg = ctx.config;
  log.entryDivisions = [];
  (cfg.entryDivisions || []).forEach(function (dv) {
    const comments = toHankaku(log.parsed.summary.COMMENTS || '');
    if (dv.applyKeyword && !commentHasKeyword(log.parsed.summary.COMMENTS, dv.applyKeyword)) return;
    const pref = (log.category && log.category.pref) || log.sentPref || null;
    const d = { name: dv.name, eligible: true, note: '', birthDate: null, birthProblem: '',
      pref: pref, prefName: pref ? PREF_TABLE[pref] : '',
      qsos: log.post.qsos, points: log.post.points, multi: log.post.multi, total: log.post.total, lastMinutes: log.lastValidMinutes };
    // 対象外の局（チェックログ・社団局・管外局など）は、もともと参加できない部門なので「要確認」にしない（noteだけ残す）
    if (log.isChecklog) { d.eligible = false; d.note = 'チェックログのため対象外です'; }
    else if (!log.category) { d.eligible = false; d.note = '種目コードが種目表にないため対象外です'; }
    else if (dv.opOnly && log.category.op !== dv.opOnly) { d.eligible = false; d.note = settingsOpLabel(dv.opOnly, ctx.config) + '局だけが参加できる部門です（種目 ' + log.categoryCode + '）'; }
    else if (dv.clsOnly && log.cls !== dv.clsOnly) { d.eligible = false; d.note = dv.clsOnly + 'だけが参加できる部門です（' + (log.cls || '局区分不明') + '）'; }
    if (dv.needBirthDate) {
      d.birthDate = birthDateFromText(comments, cfg);
      const limit = dv.bornOnOrAfter ? parseDateText(dv.bornOnOrAfter) : null;
      if (!d.birthDate) d.birthProblem = '意見欄に生年月日が見つかりません';
      else if (!limit) d.birthProblem = '「基本設定」に' + dv.name + 'の生年月日の区切りが入っていないため、年齢を確かめていません（生年月日 ' + d.birthDate + '）';
      else if (d.birthDate < limit && d.eligible) {
        d.eligible = false; d.note = '生年月日 ' + d.birthDate + ' は、' + limit + ' より前です（' + limit + ' 以降に生まれた方が対象）';
        d.birthOut = true; // 生年月日で対象外にしたもの（これだけは「要確認」）
      }
    }
    if (!d.eligible) d.total = 0;
    log.entryDivisions.push(d);
  });
}

/**
 * 意見欄に部門の申し込みの語（例：「電信部門」）があるか。全角・半角（半角カナも）と、間の空白の違いは気にしない
 * （「電信 部門」「ｼﾞｭﾆｱ部門」「ＪＵＮＩＯＲ」なども読む）
 */
function commentHasKeyword(comments, keyword) {
  const norm = function (s) { return String(s || '').normalize('NFKC').replace(/\s+/g, '').toUpperCase(); };
  return norm(comments).indexOf(norm(keyword)) >= 0;
}

/**
 * 意見欄から生年月日を取り出す。「生年月日」「生まれ」「誕生」の近くの日付を優先し、
 * なければ、開催年より5年以上前の日付のうち最初のもの（コンテストの日付などを拾わないため）
 */
function birthDateFromText(text, cfg) {
  const s = toHankaku(text);
  const dates = findDatesInText(s);
  if (!dates.length) return null;
  const kw = /生年月日|生まれ|誕生|birth/gi;
  let m;
  const kws = [];
  while ((m = kw.exec(s)) !== null) kws.push(m.index);
  const near = dates.filter(function (d) { return kws.some(function (k) { return Math.abs(d.index - k) <= 15; }); });
  if (near.length) return near[0].date;
  const y = +(/^(\d{4})/.exec(String((cfg.periods[0] || {}).start || '')) || [0, 9999])[1];
  const old = dates.filter(function (d) { return +d.date.substring(0, 4) <= y - 5; });
  return old.length ? old[0].date : null;
}

// ------------------------------------------------------------------ 登録クラブ対抗
/**
 * サマリーシートの登録クラブ番号を読み、log.club に入れる（記入がなければ null）。
 *   {raw, no（そろえた番号。読めなければ null）, name, pref, prefName, counted, note, problem}
 *   counted=false … クラブの得点に入れない（note に理由。管外局・チェックログ・信越の外のクラブなど）
 *   problem       … 委員会が確かめること（番号が読めない・一覧にない）
 */
function clubOf(log, ctx) {
  const cc = ctx.config.clubCompetition;
  log.club = null;
  if (!cc) return;
  const raw = String(log.parsed.summary[cc.tag] || '').trim();
  // 「無」「なし」「-」などは、記入なしと同じに扱う
  if (!raw || /^(無|無し|なし|ナシ|NONE|NO|NIL|N\/A|-+|ー+|－+|―+)$/i.test(toHankaku(raw).replace(/[\s　]/g, ''))) return;
  const no = normalizeClubNumber(raw);
  const c = { raw: raw, no: no, name: '', pref: no ? clubPref(no) : null, prefName: '', counted: true, note: '', problem: '' };
  c.prefName = c.pref ? (PREF_TABLE[c.pref] || '') : '';
  const listed = no && ctx.clubs ? ctx.clubs[no] : null;
  if (listed) c.name = listed.name;
  if (!no) { c.counted = false; c.problem = '登録クラブ番号「' + raw + '」が読めません（例：09-1-3）'; }
  else if (cc.homeClubsOnly && ctx.config.homePrefs.indexOf(c.pref) < 0) { c.counted = false; c.note = ctx.config.homeName + 'の外の登録クラブ（' + no + '）です'; }
  else if (log.isChecklog) { c.counted = false; c.note = 'チェックログのため数えません'; }
  else if (cc.clsOnly && log.cls !== cc.clsOnly) { c.counted = false; c.note = cc.clsOnly + 'だけを数えます（' + (log.cls || '局区分不明') + '）'; }
  else if (ctx.clubs && !listed) c.problem = '登録クラブ番号「' + no + '」が「登録クラブ一覧」にありません（番号の書き間違い、または一覧が古い）。クラブ名なしで数えています';
  log.club = c;
}

/**
 * クラブ対抗の順位のまとまり。[{key, name, has(クラブ)}]（審査結果の表 buildRankingTable も使う）
 *   「都府県」＝管内の都府県ごと、「管内と管外」＝登録番号の頭が管内の都府県かどうかで2つ（ギガヘルツ。No.139）、「全体」＝1つ
 */
function clubRankGroups(cfg) {
  const cc = cfg.clubCompetition;
  const home = function (c) { return cfg.homePrefs.indexOf(c.pref) >= 0; };
  if (cc.rankBy === '都府県') {
    return cfg.homePrefs.map(function (p) { return { key: p, name: cc.name + '（' + PREF_TABLE[p] + '）', has: function (c) { return c.pref === p; } }; });
  }
  if (cc.rankBy === '管内と管外') {
    return [{ key: 'home', name: cc.name + '（' + cfg.homeName + '管内）', has: home },
      { key: 'other', name: cc.name + '（' + cfg.homeName + '管外）', has: function (c) { return !home(c); } }];
  }
  return [{ key: null, name: cc.name, has: function () { return true; } }];
}

/**
 * クラブごとに、数える局の審査後総得点を合計して順位を付ける。同点は同順位。
 * 戻り値: [{group, groupName, rank, no, name, count, total, members:[{call, total, categoryCode}]}]
 */
function rankClubs(logs, ctx) {
  const cc = ctx.config.clubCompetition;
  if (!cc) return [];
  const byNo = {};
  // 同じ局（呼出符号の本体）は1局と数え、開催部門ごとの審査後総得点を合計する（新潟。members[].totals に開催部門ごとの得点。No.145）
  logs.forEach(function (l) {
    if (!l.club || !l.club.counted) return;
    const k = l.club.no;
    const c = byNo[k] = byNo[k] || { no: k, name: l.club.name, pref: l.club.pref, count: 0, total: 0, members: [], byCall: {} };
    c.total += l.post.total;
    let m = c.byCall[l.call.base];
    if (!m) { m = c.byCall[l.call.base] = { call: l.call.full, total: 0, totals: [], categoryCode: l.categoryCode }; c.members.push(m); c.count++; }
    m.total += l.post.total; m.totals.push(l.post.total);
  });
  const clubs = Object.keys(byNo).map(function (k) {
    const c = byNo[k];
    delete c.byCall;
    c.members.sort(function (a, b) { return b.total - a.total || a.call.localeCompare(b.call); });
    return c;
  });
  const groups = clubRankGroups(ctx.config);
  const out = [];
  groups.forEach(function (g) {
    const list = clubs.filter(g.has)
      .sort(function (a, b) { return b.total - a.total || a.no.localeCompare(b.no); });
    let rank = 0, prev = null;
    list.forEach(function (c, i) {
      if (prev === null || c.total !== prev) rank = i + 1;
      prev = c.total;
      out.push({ group: g.key, groupName: g.name, rank: rank, no: c.no, name: c.name, count: c.count, total: c.total, members: c.members });
    });
  });
  return out;
}

/**
 * コンテスト名を比べやすい形にする：全角を半角にし、大文字にし、空白・ハイフン類を除き、
 * 「0」の代わりに使われる文字（ギリシャ文字のφ・Φ、Ø・ø、∅）を数字の0にする。例：「ＪＡφ－ＶＨＦ」→「JA0VHF」
 */
function contestNameKey(s) {
  return toHankaku(s || '').toUpperCase().replace(/[φΦϕØø∅]/g, '0').replace(/[\s\-ー－‐−―‑]/g, '');
}

/**
 * サマリーシートのコンテスト名が、このコンテストのものらしいか。
 * 「コンテスト名の照合の語」（cfg.contestNameKeywords）は全部、「／」で書いたまとまり（cfg.contestNameAnyOf。例：[['ギガヘルツ', 'GHZ']]）は
 * どれか1つが入っていればよい（申し送り No.139）。受付の確かめでも使える
 */
function contestNameMatches(name, cfg) {
  const cn = contestNameKey(name);
  const has = function (k) { return cn.indexOf(contestNameKey(k)) >= 0; };
  return (cfg.contestNameKeywords || []).every(has) && (cfg.contestNameAnyOf || []).every(function (g) { return !g.length || g.some(has); });
}

/**
 * 呼出符号から分かる局の種類の「要確認」（申し送り No.165。指示書_準本番で見つけた点の直し_2 の 2.2・2.3）。移動表示は除いて見る（call.base）
 *   ・記念局（8J・8N で始まる）：呼び方にかかわらず知らせる。JARL が開設した局ならチェックログ（委員が決める。自動では変えない）。
 *     委員が局の一覧の「種目の変更」を入れた局（委員が決めた）は、「要確認」ではなく「情報」で知らせる（No.170 の案。ユーザーが決めた）
 *   ・社団局かどうか：「シングルオペ・マルチオペの呼び方」が「個人／社団」（cfg.opTerms が 'singleMulti' でない）ときだけ。
 *     エリア番号の後ろの3文字の頭が Y・Z なら社団局。個人の種目で社団局の呼出符号、社団の種目で社団局でない呼出符号なら知らせる
 *     （失格・種目の変更は委員が決める）。2文字・4文字のサフィックス、チェックログ、種目表にない種目は確かめない
 * 戻り値：[{level（'要確認'・'情報'）, message}]
 */
/**
 * 委員が決める知らせ（社団局・運用場所の変更・送ったナンバーが空）。局の一覧のその行の「種目の変更」に何か入っていれば（委員が決めた）、
 * 「要確認」ではなく「情報」にし、文の終わりに「委員会が種目を ○○ にしています」を付ける（申し送り No.176。記念局と同じ考え方）。
 * 申告どおりでよいと決めたときは、「種目の変更」に申告と同じ種目コードを入れれば「情報」になる
 */
function decidedAlert(log, text, shortText) {
  if (log.overridden) return { level: '情報', message: (shortText || text) + '。委員会が種目を ' + log.categoryCode + ' にしています' };
  return { level: '要確認', message: text };
}

/** 記念局（8J・8N で始まる呼出符号。移動表示は除いて見る）か */
function isMemorialCall(call) {
  const m = JA_CALL_RE.exec(call.base);
  return !!m && /^8[JN]$/.test(m[1]);
}

function callsignKindAlerts(log, cfg) {
  const m = JA_CALL_RE.exec(log.call.base);
  if (!m) return [];
  if (isMemorialCall(log.call)) {
    if (log.overridden) return [{ level: '情報', message: '記念局：委員会が種目を ' + log.categoryCode + ' にしています' }];
    return [{ level: '要確認', message: '記念局です。JARL が開設した局ならチェックログにしてください（局の一覧の「種目の変更」に ' + cfg.checklogCodes[0] + '）' }];
  }
  if (cfg.opTerms === 'singleMulti' || m[3].length !== 3 || log.isChecklog || !log.category) return [];
  const club = /^[YZ]/.test(m[3]);
  const text = club && log.category.op === '個人' ? '社団局の呼出符号（サフィックスが Y・Z で始まる）ですが、個人の種目（' + log.categoryCode + '）で参加しています'
    : !club && log.category.op === '社団' ? '社団局の呼出符号（サフィックスが Y・Z で始まる）ではありませんが、社団の種目（' + log.categoryCode + '）で参加しています' : '';
  return text ? [decidedAlert(log, text)] : [];
}

// ------------------------------------------------------------------ 要確認のアラート
function collectAlerts(logs, ctx) {
  const cfg = ctx.config, global = [];
  logs.forEach(function (log) {
    const s = log.parsed.summary, add = function (lv, m) { log.alerts.push({ level: lv, message: m }); };
    log.parsed.problems.forEach(function (p) {
      if (log.checklogBy && /CATEGORYCODE/.test(p.message)) return;
      // 対象バンドでない周波数の交信は、対象バンド外（O）として減点するだけで、要確認シートには出さない（LCRには載る）
      if (p.badBand) return;
      add(p.level, p.message);
    });
    // 公開する理由が空でも知らせない（空なら結果のページの理由も空。No.125 で No.100 の決まりを変えた）
    // 送ったナンバーの欄が空の交信（申し送り No.98）：受けたナンバーで審査し、送ったナンバーは相手局のログから読んだ
    if (log.sentMissing) {
      const miss = log.qsos.filter(function (q) { return q.sentMissing; });
      const got = miss.filter(function (q) { return q.sentFromPartner; }).length;
      const head = '送ったナンバーの欄が空の交信が ' + miss.length + ' 件あります（例：' + miss[0].raw.lineNo + '行目）。送ったナンバーがないログとして、' +
        '受けたナンバーで審査し、送ったナンバーは相手局のログから読みました（読めたもの ' + got + ' 件）';
      const a = decidedAlert(log, head + '。相手局の交信は不一致にしていません。' +
        '順位に入れるか、チェックログにするかは委員会で決めてください（局の一覧の「種目の変更」で ' + cfg.checklogCodes[0] + ' にできます。決まっていなければ順位に入れます）', head);
      add(a.level, a.message);
    }
    // 運用場所の変更（「規約_基本」の「運用場所の変更を確かめる」。1通のログの中で、送ったナンバーが変わっていないか。申し送り No.139）
    if (cfg.checkSentChange) {
      const runs = [];
      log.qsos.slice().sort(function (a, b) { return (a.minutes || 0) - (b.minutes || 0) || a.raw.lineNo - b.raw.lineNo; }).forEach(function (q) {
        const no = q.sentMissing || !q.sent ? '' : String(q.sent.no || '').trim();
        if (!no) return;
        const last = runs[runs.length - 1];
        if (last && last.no === no) last.to = q; else runs.push({ no: no, from: q, to: q });
      });
      if (runs.length > 1) {
        const list = runs.slice(0, 5).map(function (r) { return r.no + '（' + r.from.raw.time + '〜' + r.to.raw.time + '）'; }).join('、') + (runs.length > 5 ? ' ほか' : '');
        const a = decidedAlert(log, '送ったナンバーが途中で変わっています（運用場所を変えていないか確かめてください）：' + list, '送ったナンバーが途中で変わっています：' + list);
        add(a.level, a.message);
      }
    }
    if (log.partialChecklog) {
      const pc = log.partialChecklog;
      add(pc.evidence ? '情報' : '要確認', pc.where.join('・') + 'の「チェックログ」は、参加種目外のバンド（' + pc.bands.join('・') + '、' + pc.count +
        '交信）の交信のことと判断しました。種目 ' + log.categoryCode + ' として順位に入れ、' + pc.bands.join('・') + 'の交信は照合だけに使います' +
        (pc.evidence ? '（根拠：' + pc.evidence + '）' : '（根拠がはっきりしないので確かめてください。ログ全体をチェックログにする場合は、局の一覧の「種目の変更」に CHECKLOG を入れます）'));
    }
    if (log.checklogDoubt) {
      add('要確認', '申告総得点がありますが、' + log.checklogBy.join('・') + 'に「チェックログ」とあるため、ログ全体をチェックログとして扱っています。' +
        '参加として扱う場合は、局の一覧の「種目の変更」に種目コードを入れてください');
    }
    if (log.checklogBy) {
      add('情報', (log.declaredCategory && log.declaredCategory !== 'CHECKLOG' ? '種目 ' + log.declaredCategory + ' の申告ですが、' : '') +
        log.checklogBy.join('・') + 'に「チェックログ」とあるため、チェックログとして扱っています（照合には使い、順位には入れません）');
    }
    if (!contestNameMatches(s.CONTESTNAME, cfg)) {
      add('注意', 'コンテスト名「' + (s.CONTESTNAME || '') + '」が、このコンテストと違う可能性があります');
    }
    if (!log.category && !log.isChecklog) add('要確認', '参加種目コード「' + log.categoryCode + '」が種目表にありません');
    if (!log.call.valid) add('要確認', '呼出符号「' + log.call.full + '」の形式が正しくありません');
    callsignKindAlerts(log, cfg).forEach(function (a) { add(a.level, a.message); });
    const ap = log.addressPref;
    const byAddress = cfg.homeStationBy !== 'operation'; // 「管内に住所があり、管内で運用した局」（JA0 VHF）なら住所・エリアも確かめる（No.154）
    if (log.exception) {
      add('情報', '局の一覧の「局区分」により' + log.exception.cls + 'として扱っています' + (log.exception.memo ? '（' + log.exception.memo + '）' : ''));
    } else if (log.cls === '管内局' && byAddress) {
      if (log.call.area !== cfg.homeArea) {
        add('要確認', cfg.homeArea + 'エリア以外の呼出符号で、管内局の種目です。JARLへの照会結果を、局の一覧の「局区分（管内局／管外局）」で選んでください');
      } else if (ap.home === false) {
        add('要確認', '住所欄が' + cfg.homeName + 'の外（' + (ap.pref ? PREF_TABLE[ap.pref] : ap.how + 'で判定') + '）です。管内局かどうかJARLへの照会が必要です（照会の結果は、局の一覧の「局区分（管内局／管外局）」で選んでください）');
      }
      const prev = ctx.previous[log.call.base];
      if (prev && log.alerts.some(function (a) { return a.level === '要確認' && /JARLへの照会/.test(a.message); })) {
        add('参考', '前年の確認結果では' + prev.cls + 'でした' + (prev.memo ? '（' + prev.memo + '）' : '') + '。今年の照会結果を、局の一覧の「局区分（管内局／管外局）」で選んでください');
      }
    } else if (log.cls === '管外局' && byAddress && log.call.area === cfg.homeArea && ap.home === true) {
      add('参考', '住所欄が' + cfg.homeName + 'の' + cfg.homeArea + 'エリア局が、管外局の種目で提出しています');
    }
    if (ap.home === null && byAddress) add('注意', '住所欄から都府県を判定できません');
    if (log.cls === '管内局' && log.situation === '管外から') {
      add('要確認', '管内局の種目ですが、送信ナンバーが' + cfg.homeName + 'の外のものです');
    }
    if (log.category && log.category.pref && log.sentPref && log.category.pref !== log.sentPref && cfg.homePrefs.indexOf(log.sentPref) >= 0) {
      add('要確認', '種目は' + PREF_TABLE[log.category.pref] + '内局ですが、送信ナンバーは' + PREF_TABLE[log.sentPref] + 'のものです');
    }
    (log.divisions || []).forEach(function (d) {
      // 対象外（チェックログ・社団局）は、もともと参加できない部門なので「要確認」にせず、理由だけ「情報」に出す
      if (!d.eligible) add('情報', d.name + 'の申告がありますが、' + d.note + '（順位には入れません）');
      else if (d.qsos === 0) add('注意', d.name + 'の申告がありますが、有効な電信の交信がありません');
      else if (!d.declared) add('情報', d.name + 'の申告はありませんが、電信の交信があるため' + d.name + 'として集計しています');
    });
    (log.entryDivisions || []).forEach(function (d) {
      if (!d.eligible) add(d.birthOut ? '要確認' : '情報', d.name + 'の申告がありますが、' + d.note + (d.birthOut ? '' : '（順位には入れません）'));
      else if (d.birthProblem) add('要確認', d.name + 'の申告があります。' + d.birthProblem + '（順位には入れています。対象外にする場合は意見欄の扱いを委員会で決めてください）');
      else add('情報', d.name + 'として集計しています（' + (d.birthDate ? '生年月日 ' + d.birthDate + '、' : '意見欄の申告による、') + d.prefName + '）');
    });
    if (log.club) {
      const c = log.club;
      if (c.problem) add('要確認', c.problem);
      else if (!c.counted) add('情報', '登録クラブ番号 ' + (c.no || c.raw) + ' の記入がありますが、' + c.note + '（クラブ対抗には入れません）');
    }
    if (log.declaredTotal != null && log.declaredTotal !== log.post.total) {
      add('情報', '申告総得点 ' + log.declaredTotal + ' 点 → 審査後 ' + log.post.total + ' 点（無得点の交信 ' + log.invalidCount + ' 件）');
    }
  });
  // 種類の違うナンバー（受け取った側の誤りと分かったものは、受け取った側の交信を無効にするだけで、ここには出さない）
  const kindAlerts = ctx.kindAlerts || { sender: {} };
  // 登録クラブ一覧を取り込んでいないとき
  if (cfg.clubCompetition && !ctx.clubs && logs.some(function (l) { return l.club; })) {
    global.push({ level: '注意', message: '「登録クラブ一覧」が取り込まれていないので、クラブ対抗にクラブ名が出ません（メニューの「登録クラブ一覧を取り込む」を実行してください）' });
  }
  // 生年月日の区切りの日が、開催年に合っているか（前年の設定のままになっていないか）
  (cfg.entryDivisions || []).forEach(function (dv) {
    if (!dv.needBirthDate) return; // 生年月日を確かめないときは、区切りの日も見ない
    const limit = dv.bornOnOrAfter ? parseDateText(dv.bornOnOrAfter) : null;
    const y = /^(\d{4})/.exec(String((cfg.periods[0] || {}).start || ''));
    if (dv.bornOnOrAfter && !limit) global.push({ level: '要確認', message: '「基本設定」の' + dv.name + 'の生年月日の区切り「' + dv.bornOnOrAfter + '」が日付として読めません（例：2008-04-02）' });
    else if (limit && y && +limit.substring(0, 4) !== +y[1] - 18) {
      global.push({ level: '注意', message: dv.name + 'の生年月日の区切りが ' + limit + ' になっています。開催年（' + y[1] + '年）の規約の日付か確かめてください（前年の設定のままではありませんか）' });
    }
  });
  Object.keys(kindAlerts.sender).forEach(function (call) {
    const msg = call + ' が、送るべき種類と違うナンバーを送っています（' + kindAlerts.sender[call].join('、') +
      '。この局のログでも、そのナンバーを送っています）。この局の扱いは委員会で判断してください';
    global.push({ level: '要確認', message: msg });
    logs.forEach(function (l) { if (l.call.full === call) l.alerts.push({ level: '要確認', message: msg }); });
  });
  return global;
}

// ------------------------------------------------------------------ マルチ一覧・登録クラブ一覧を取り込んだ日
/**
 * マルチ一覧・登録クラブ一覧を取り込んだ日が、開催の年より前なら、全体の「注意」を出す（シートの整理 E。市町村の合併・クラブの増減の見落としを防ぐ）。
 *   dates：{シートの名前: 取り込んだ日（'YYYY-MM-DD' など）}（options.importDates）。開催の年は開催期間の最初の開始日時の年
 */
function importDateAlerts(dates, cfg) {
  const y = /^(\d{4})/.exec(String(((cfg && cfg.periods) || [])[0] ? cfg.periods[0].start : ''));
  if (!y) return [];
  return Object.keys(dates || {}).map(function (name) {
    const d = parseDateText(dates[name]);
    if (!d || +d.substring(0, 4) >= +y[1]) return null;
    const p = d.split('-');
    return { level: '注意', message: name + 'は ' + p[0] + '年' + (+p[1]) + '月' + (+p[2]) + '日に取り込んだものです。新しくしなくてよいか確かめてください' +
      '（取り込み直すと、この注意は出なくなります）' };
  }).filter(function (a) { return a; });
}

// ------------------------------------------------------------------ 開催期間の設定まちがいの見張り
const PERIOD_ALERT_RATIO = 0.9;    // 開催期間の外の交信がこの割合以上なら知らせる
const PERIOD_ALERT_MIN_QSOS = 20;  // 全体の見張りは、交信がこの件数以上あるときだけ

/**
 * 「開催期間」シートの入力まちがい・書き換え忘れに気づけるようにする。
 * 全部のログの交信の9割以上が開催期間の外なら、全体の「要確認」を返す（戻り値）。
 * それが出ないときは、交信の9割以上が開催期間の外のログに「注意」を付ける。
 * 交信の日時が読み取れないものは数えない（日時の読み取りの不備として、別に出る）。チェックログも数える
 */
function periodAlerts(logs, ctx) {
  const stats = logs.map(function (log) {
    const st = { log: log, total: 0, out: 0, dates: {} };
    log.qsos.forEach(function (q) {
      if (q.minutes == null) return;
      st.total++;
      if (inPeriod(q.minutes, ctx)) return;
      st.out++;
      st.dates[q.raw.date] = (st.dates[q.raw.date] || 0) + 1;
    });
    return st;
  }).filter(function (st) { return st.total > 0; });
  const topDates = function (list) {
    const count = {};
    list.forEach(function (st) { Object.keys(st.dates).forEach(function (d) { count[d] = (count[d] || 0) + st.dates[d]; }); });
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a] || (a < b ? -1 : 1); }).slice(0, 3).join('、');
  };
  const pct = function (out, total) { return Math.floor(out * 100 / total) + '%'; };
  const comma = function (n) { return String(n).replace(/\B(?=(\d{3})+$)/g, ','); };
  const total = stats.reduce(function (n, st) { return n + st.total; }, 0);
  const out = stats.reduce(function (n, st) { return n + st.out; }, 0);
  if (total >= PERIOD_ALERT_MIN_QSOS && out >= total * PERIOD_ALERT_RATIO) {
    const periods = ctx.config.periods.map(function (p) { return p.start + '〜' + p.end; }).join('、');
    return [{ level: '要確認', message: '開催期間の外の交信が全体の ' + pct(out, total) + '（' + comma(total) + '件中 ' + comma(out) + '件）あります。' +
      '「基本設定」の「開催期間1〜」を確かめてください（設定：' + periods + '。ログの交信日で多いもの：' + topDates(stats) + '）' }];
  }
  stats.forEach(function (st) {
    if (st.out < st.total * PERIOD_ALERT_RATIO) return;
    st.log.alerts.push({ level: '注意', message: '交信の ' + pct(st.out, st.total) + ' が開催期間の外です。' +
      '別の年や別のコンテストのログではありませんか（ログの交信日：' + topDates([st]) + '）' });
  });
  return [];
}

// ------------------------------------------------------------------ 順位
/** 別枠部門の順位のまとまり。[{key, cls, pref}] */
function divisionGroups(dv, cfg) {
  if (dv.rankBy === '局区分') return [{ key: dv.name + '（管内局）', cls: '管内局' }, { key: dv.name + '（管外局）', cls: '管外局' }];
  if (dv.rankBy === '都府県と管外') {
    return cfg.homePrefs.map(function (p) { return { key: dv.name + '（' + PREF_TABLE[p] + '）', cls: '管内局', pref: p }; })
      .concat([{ key: dv.name + '（管外局）', cls: '管外局' }]);
  }
  return [{ key: dv.name }];
}

/** 局のエリア（送信ナンバーの都府県から。分からなければ呼出符号の運用エリア。それも分からなければ '?'） */
function stationArea(log) {
  const p = log.sentPref;
  if (p) for (const a of Object.keys(AREA_PREFS)) if (AREA_PREFS[a].indexOf(p) >= 0) return a;
  return log.call.opArea || '?';
}
function areaOrder(a) { return a === '?' ? 99 : (a === '0' ? 10 : +a); }

/**
 * 「表彰の基準」（規約のファイルの「規約_部門と表彰」の表彰の行）の文を読む。書き方は2つ
 *   段階：「5局まで1位、10局まで2位、それ以上3位」「3位まで」
 *   割合：「参加10局につき1局、最大6位」（新潟・ギガヘルツ。最大はなくてもよい。端数は rounding。申し送り No.139）
 * 空なら表彰の印を付けない（エラーにもしない。ギガヘルツは委員会が決める）。
 * 戻り値: {steps:[{upTo(局数。null＝それ以上), places}], per:{stations, places, max}|null, rounding, error}
 *   rounding：端数（'floor' 切り捨て・'ceil' 切り上げ・'round' 四捨五入。なければ 'ceil'）
 */
function parseAwardRule(text, rounding) {
  const s = toHankaku(text || '').replace(/\s+/g, '');
  const out = { steps: [], per: null, rounding: rounding || 'ceil', error: '' };
  if (!s) return out;
  const where = '規約のファイルの「規約_部門と表彰」の「表彰の基準」';
  let bad = '', max = null;
  s.split(/[、,;；／\/。]/).filter(String).forEach(function (part) {
    let m = /^参加(\d+)局(?:に|ごとに)?(?:つき)?(\d+)局(?:\(.*\))?$/.exec(part);
    if (m && +m[1] > 0) { out.per = { stations: +m[1], places: +m[2], max: null }; return; }
    m = /^(?:最大|最高|上限)(\d+)位(?:まで)?$/.exec(part);
    if (m) { max = +m[1]; return; }
    m = /^(\d+)局(?:まで|以下)(?:は)?(\d+)位(?:まで)?$/.exec(part);
    if (m) { out.steps.push({ upTo: +m[1], places: +m[2] }); return; }
    m = /^(?:それ以上|以上|それより多い|その他|ほか|\d+局以上)(?:は)?(\d+)位(?:まで)?$/.exec(part) || /^(\d+)位まで$/.exec(part);
    if (m) { out.steps.push({ upTo: null, places: +m[1] }); return; }
    bad = bad || part;
  });
  if (out.per) out.per.max = max;
  if (bad || (!out.steps.length && !out.per) || (out.per && out.steps.length) || (max != null && !out.per)) {
    return { steps: [], per: null, rounding: out.rounding, error: where + 'の「' + (bad || s) + '」が読めません（例：5局まで1位、10局まで2位、それ以上3位／参加10局につき1局、最大6位）。表彰の色は付けていません' };
  }
  out.steps.sort(function (a, b) { return (a.upTo == null ? 1e9 : a.upTo) - (b.upTo == null ? 1e9 : b.upTo); });
  return out;
}

/** 参加局数 n のとき、何位まで表彰するか。rule は parseAwardRule の戻り値（前の形の steps の配列でもよい） */
function awardPlaces(n, rule) {
  const r = Array.isArray(rule) ? { steps: rule, per: null } : rule;
  if (!n) return 0;
  if (r.per) {
    const x = n * r.per.places / r.per.stations;
    const k = r.rounding === 'floor' ? Math.floor(x) : r.rounding === 'round' ? Math.round(x) : Math.ceil(x);
    return r.per.max != null ? Math.min(k, r.per.max) : k;
  }
  const steps = r.steps || [];
  if (!steps.length) return 0;
  for (let i = 0; i < steps.length; i++) if (steps[i].upTo == null || n <= steps[i].upTo) return steps[i].places;
  return steps[steps.length - 1].places; // 「それ以上」がないときは、最後の段の順位
}

/**
 * 順位に表彰の印を付ける（r.award = true）。順位が同じなら、どちらも表彰する。
 *   awardKind 'rank'  … 「表彰の基準」の順位まで（参加局数は、その順位に入った局・クラブの数）
 *   awardKind 'first' … 1位だけ（局長賞・エリア別1位）
 *   awardKind 'all'   … 載っている局の全部（特別賞。委員が局の一覧に書いた局。No.139）
 * 戻り値: {groups: {順位のまとまりの名前: {count, places, kind}}, error}
 */
function markAwards(rankings, clubRankings, cfg) {
  const rule = parseAwardRule((cfg.awards || {}).rule, (cfg.awards || {}).rounding);
  const groups = {};
  const mark = function (list, keyOf, kindOf, countOf) {
    list.forEach(function (r) {
      const k = keyOf(r);
      if (!groups[k]) {
        const kind = kindOf(r), n = countOf(r);
        groups[k] = { count: n, kind: kind, places: kind === 'first' ? (n ? 1 : 0) : kind === 'all' ? n : awardPlaces(n, rule) };
      }
      r.award = groups[k].places > 0 && r.rank <= groups[k].places;
    });
  };
  mark(rankings, function (r) { return r.category; }, function (r) { return r.awardKind; }, function (r) { return r.count; });
  const clubCount = {};
  (clubRankings || []).forEach(function (c) { clubCount[c.groupName] = (clubCount[c.groupName] || 0) + 1; });
  mark(clubRankings || [], function (c) { return c.groupName; }, function () { return 'rank'; }, function (c) { return clubCount[c.groupName]; });
  return { groups: groups, error: rule.error };
}

/** 特別賞の名前（局の一覧に書かれた順。同じ名前は1つ） */
function specialAwardNames(logs) {
  const out = [];
  logs.forEach(function (l) { (l.specialAwards || []).forEach(function (n) { if (out.indexOf(n) < 0) out.push(n); }); });
  return out;
}

function rankLogs(logs, ctx) {
  const out = [];
  // 総得点の高い順。同点は最終交信時刻の早い順。両方同じなら同順位
  // opt.award：表彰の付け方。'rank'＝「表彰の基準」の順位まで、'first'＝1位だけ。opt.parent：表を並べるときに続ける種目
  // 「同点のとき」が「同じ順位にする」（cfg.tieBreak 'sameRank'）なら、総得点が同じ局は同じ順位（並びは呼出符号の順。申し送り No.139）
  const sameRank = ctx.config.tieBreak === 'sameRank';
  const assign = function (list, key, name, statsOf, opt) {
    opt = opt || {};
    list.sort(function (a, b) {
      const sa = statsOf(a), sb = statsOf(b);
      return sb.total - sa.total || (sameRank ? a.call.full.localeCompare(b.call.full) : (sa.last || 0) - (sb.last || 0));
    });
    let prev = null, rank = 0;
    list.forEach(function (l, i) {
      const st = statsOf(l);
      if (!prev || prev.total !== st.total || (!sameRank && (prev.last || 0) !== (st.last || 0))) rank = i + 1;
      prev = st;
      if (opt.show && rank > opt.show) return;
      const tied = list.some(function (o) { return o !== l && statsOf(o).total === st.total; });
      out.push({ category: key, categoryName: name, rank: rank, call: l.call.full, total: st.total, stats: st, tied: tied, log: l,
        awardKind: opt.award || 'rank', awardName: opt.awardName || '', parent: opt.parent || null, count: list.length, special: !!opt.special });
    });
  };
  const postStats = function (l) {
    return { qsos: l.post.qsos, points: l.post.points, multi: l.post.multi, total: l.post.total, last: l.lastValidMinutes };
  };
  const aw = ctx.config.awards || {};
  // 両県を通じて最高得点の個人局（局長賞）。種目をまたいで、審査後総得点の順
  if (aw.top) {
    const t = aw.top;
    const g = logs.filter(function (l) { return !l.isChecklog && l.category && (!t.cls || l.cls === t.cls) && (!t.op || l.category.op === t.op); });
    assign(g, t.name, t.name, function (l) { const st = postStats(l); st.categoryCode = l.categoryCode; return st; },
      { award: 'first', awardName: t.name, show: t.show || 0 });
  }
  // 特別賞（局の一覧の「特別賞」。委員が書いた局の全部。チェックログの局にも付ける。賞の名前ごとの表。並びは審査後総得点の順。No.139）
  specialAwardNames(logs).forEach(function (name) {
    const g = logs.filter(function (l) { return l.specialAwards.indexOf(name) >= 0; });
    assign(g, name, name, function (l) { const st = postStats(l); st.categoryCode = l.categoryCode; return st; },
      { award: 'all', awardName: name, special: true });
  });
  ctx.config.categories.forEach(function (c) {
    const g = logs.filter(function (l) { return !l.isChecklog && l.category && l.category.code === c.code; });
    assign(g, c.code, c.name, postStats);
    // 管外局の種目は、エリア別1位も表彰する
    if (aw.areaFirstCls && c.cls === aw.areaFirstCls) {
      const byArea = {};
      g.forEach(function (l) { const a = stationArea(l); (byArea[a] = byArea[a] || []).push(l); });
      Object.keys(byArea).sort(function (a, b) { return areaOrder(a) - areaOrder(b); }).forEach(function (a) {
        const key = c.code + '（' + (a === '?' ? 'エリア不明' : a + 'エリア') + '）';
        assign(byArea[a], key, c.name + '　エリア別', postStats, { award: 'first', awardName: 'エリア別1位', parent: c.code });
      });
    }
  });
  // 別枠部門（全体、局区分ごと、または都府県と管外）
  (ctx.config.divisions || []).forEach(function (dv) {
    const prefOf = function (l) { return (l.category && l.category.pref) || l.sentPref || null; };
    const groups = divisionGroups(dv, ctx.config);
    const of = function (l) { return (l.divisions || []).filter(function (x) { return x.name === dv.name; })[0]; };
    const el = logs.filter(function (l) { const d = of(l); return d && d.eligible; });
    if (dv.rankBy === '都府県と管外') {
      // 管内局なのに県が分からない局（種目表にない種目など）
      el.forEach(function (l) {
        if (l.cls !== '管外局' && ctx.config.homePrefs.indexOf(prefOf(l)) < 0 && !groups.some(function (g) { return g.pref === '?'; })) {
          groups.push({ key: dv.name + '（県不明）', cls: '管内局', pref: '?' });
        }
      });
    }
    groups.forEach(function (g) {
      const list = el.filter(function (l) {
        if (g.cls && (g.cls === '管外局' ? l.cls !== '管外局' : l.cls === '管外局')) return false;
        if (g.pref === '?') return ctx.config.homePrefs.indexOf(prefOf(l)) < 0;
        return !g.pref || prefOf(l) === g.pref;
      });
      assign(list, g.key, g.key, function (l) {
        const d = of(l);
        return { qsos: d.qsos, logQsos: d.logQsos, points: d.points, multi: d.multi, total: d.total, last: d.lastMinutes, division: true };
      });
    });
  });
  // 申告で入る部門（都府県ごと、または全体）。得点は本来の種目の審査後総得点
  (ctx.config.entryDivisions || []).forEach(function (dv) {
    const of = function (l) { return (l.entryDivisions || []).filter(function (x) { return x.name === dv.name; })[0]; };
    const el = logs.filter(function (l) { const d = of(l); return d && d.eligible; });
    const groups = [];
    if (dv.rankBy === '都府県') {
      ctx.config.homePrefs.forEach(function (p) { groups.push({ key: p, name: dv.name + '（' + PREF_TABLE[p] + '）' }); });
      el.forEach(function (l) { const p = of(l).pref; if (!groups.some(function (g) { return g.key === p; })) groups.push({ key: p, name: dv.name + '（' + (PREF_TABLE[p] || '県不明') + '）' }); });
    } else groups.push({ key: null, name: dv.name });
    groups.forEach(function (g) {
      const list = el.filter(function (l) { return dv.rankBy !== '都府県' || of(l).pref === g.key; });
      assign(list, g.name, g.name, function (l) {
        const d = of(l);
        return { qsos: d.qsos, points: d.points, multi: d.multi, total: d.total, last: d.lastMinutes, entry: true, categoryCode: l.categoryCode };
      });
    });
  });
  return out;
}

// ===== 91_gas_books.js =====
/**
 * 3つのファイル・シートの一覧・「基本設定」の行の一覧（GAS専用。設定担当。シートの整理 段階1：申し送り No.75）
 *
 * 決まりは docs/指示書_シートの整理.md（決まったこと B・C・D・G）と docs/ドライブのフォルダの作り.md。
 *   審査のファイル（このファイル。審査_XXX）：基本設定・局の一覧・要確認・審査結果・局別一覧・確定結果・変更履歴
 *   規約のファイル（規約_XXX）：規約_ の6枚・マルチ一覧・登録クラブ一覧
 *   メールのファイル（メール_XXX）：案内メール・受付履歴・LCR送信・参加証送信・返信文面
 * ほかの2つのファイルは、審査のファイルと同じフォルダに作り、「基本設定」にURLを書いてつなぐ。
 *
 *   book_(kind) / bookFor_(ss, kind) … ファイルを開く（kind：BOOK_JUDGE・BOOK_SETTINGS・BOOK_MAIL）。
 *                                      bookFor_ は「このファイル」がない所（Webページ）で、審査のファイル ss を渡して使う
 *   bookSheet_(kind, name) / bookSheetFor_(ss, kind, name) … シートを取る。なければ、シートの一覧で決めた場所・色で作る。
 *                                      処理がシートを作ったり動かしたりするのは、この関数（と「1. 初期設定」）だけにする
 *   setupBooks_() … 「1. 初期設定」で呼ぶ。基本設定を決めた順で作り、3つのファイルを用意し、全部のシートを並べ、守り方をかける。
 *                   「ログのフォルダ」が空なら「提出ログ」のフォルダを入れ、「編集できる委員」に共有を付ける
 *   requireSetupAccount_(what) … 「1. 初期設定」「新年度の準備」の初めに呼ぶ。管理用アカウント（空なら持ち主）でなければ止める
 *   bookShareCommittee_(ss) … 「編集できる委員」に共有を付ける（審査・規約のファイルは編集者、メールのファイルは閲覧者）。
 *                   メニュー「委員の共有をそろえる」（menuShareCommittee）も
 * このファイルには onOpen・doGet を作らない（Webページの組み立てにも入れられるように）。
 */

const BOOK_JUDGE = 'judge';
const BOOK_SETTINGS = 'settings';
const BOOK_MAIL = 'mail';

// 審査のファイル以外の2つ：「基本設定」の行の名前と、ファイルの名前の頭（「審査_2027」なら「規約_2027」）
const BOOK_FILES = {
  settings: { label: '規約のファイル', prefix: '規約' },
  mail: { label: 'メールのファイル', prefix: 'メール' }
};

// タブの色：緑＝委員が書く、青＝プログラムが書く（見るだけ）、灰＝記録、橙＝メールのファイル
const BOOK_TAB_COLORS = { green: '#6aa84f', blue: '#3d85c6', gray: '#999999', orange: '#e69138' };
const BOOK_PROTECT_DESC = 'シートの整理（91_gas_books.js）';
const BOOK_NOT_JUDGED = 'まだ審査していません';

/**
 * シートの一覧（決まったこと C・D）。ファイルごとに、この順に並べる。
 *   color：タブの色。protect：守り方（none＝守らない、warning＝警告だけ、owner＝持ち主と管理用アカウントだけ、basic＝基本設定の決まり）
 *   header：見出しの行（ないシートを作るときに書く）。今の見出しの定数があればそれを使う（段階2で各担当が書き足す）
 *   empty：ないシートを作るときに、見出しの代わりに入れる1行
 */
const BOOK_SHEETS = {
  judge: [
    { name: '基本設定', color: 'green', protect: 'basic' },
    { name: '局の一覧', color: 'green', protect: 'none', header: function () { return typeof STATION_LIST_HEADER !== 'undefined' ? STATION_LIST_HEADER : null; } }, // 見出しは審査担当（90_gas_main.js）。左側だけの警告は protectStationLeft_（90_gas_main.js）
    { name: '要確認', color: 'blue', protect: 'warning', empty: BOOK_NOT_JUDGED },
    { name: '審査結果', color: 'blue', protect: 'warning', empty: BOOK_NOT_JUDGED },
    { name: '局別一覧', color: 'blue', protect: 'warning', empty: BOOK_NOT_JUDGED },
    { name: '確定結果', color: 'blue', protect: 'owner' },
    { name: '変更履歴', color: 'gray', protect: 'warning', header: function () { return ['日時', '操作した委員', '内容']; } }
  ],
  // 規約のファイル：よく変える順に左から（緑）、ほとんど変えないシートは右に（灰）。2026-11-07、指示書_テンプレートを空から始める の 2.4
  settings: [
    { name: '規約_基本', color: 'green', protect: 'none' },
    { name: '規約_種目', color: 'green', protect: 'none' },
    { name: '規約_部門と表彰', color: 'green', protect: 'none' },
    { name: '規約_開催部門', color: 'green', protect: 'none' }, // 新潟・ギガヘルツ対応（docs/指示書_新潟・ギガヘルツ対応_1.md の 1.）
    { name: '規約_得点', color: 'green', protect: 'none' },
    { name: '規約_マルチ', color: 'gray', protect: 'none' },
    { name: '規約_バンド', color: 'gray', protect: 'none' },
    { name: '規約_チェック', color: 'gray', protect: 'none' },
    { name: 'マルチ一覧', color: 'blue', protect: 'owner', header: function () { return typeof MASTER_HEADER !== 'undefined' ? MASTER_HEADER : null; } }, // 見出しは審査担当（90_gas_main.js）
    { name: '登録クラブ一覧', color: 'blue', protect: 'owner', header: function () { return typeof CLUBS_HEADER !== 'undefined' ? CLUBS_HEADER : null; } } // 見出しは審査担当（90_gas_main.js）
  ],
  mail: [
    { name: '案内メール', color: 'orange', protect: 'owner', header: function () { return typeof GUIDE_HEADER !== 'undefined' ? GUIDE_HEADER : null; } },
    { name: '受付履歴', color: 'orange', protect: 'owner', header: function () { return typeof INTAKE_HEADER !== 'undefined' ? INTAKE_HEADER : null; } },
    { name: 'LCR送信', color: 'orange', protect: 'owner', header: function () { return typeof LCRMAIL_HEADER !== 'undefined' ? LCRMAIL_HEADER : null; } },
    { name: '参加証送信', color: 'orange', protect: 'owner', header: function () { return typeof CERTMAIL_HEADER !== 'undefined' ? CERTMAIL_HEADER : null; } },
    { name: '返信文面', color: 'orange', protect: 'owner', header: function () { return typeof REPLY_HEADER !== 'undefined' ? REPLY_HEADER : null; } } // 見出しは受付担当（96_gas_intake.js）
  ]
};

// ------------------------------------------------------------------ 「基本設定」の行の一覧（決まったこと B）

const BASIC_HEADER = ['項目', '値', '終了日時', '説明'];
const BASIC_GROUP_YEAR = '■ その年のコンテストの情報（毎年書き換える）';
const BASIC_GROUP_FILES = '■ ファイルの場所など（ほとんど自動で入る。管理用アカウントだけが書ける）';
const BASIC_COLORS = { group: '#d9d9d9', auto: '#e8f0fe', unusedC: '#efefef' };
const BASIC_DATETIME_FORMAT = 'yyyy-mm-dd hh:mm';
const COMMITTEE_LABEL = '編集できる委員';
const BOOK_ADMIN_LABEL = '管理用アカウント'; // 受付担当の MAIL_ACCOUNT_LABEL と同じ（このファイルは Webページにも入るので、ここにも持つ）
const BOOK_LOG_LABEL = 'ログのフォルダ';
const BOOK_LOG_FOLDER = '提出ログ'; // docs/ドライブのフォルダの作り.md（新年度の準備の LOG_FOLDER_NAME と同じ）

/**
 * 行の一覧。group：まとまりの見出しの行。label：項目。value：はじめの値（行がないときだけ入れる）。
 * sample・endSample：JA0 VHF の値（テストのときだけ使う。settingsTemplateIsJa0_。コンテストごとに違う行は、テンプレートでは空にする）。
 * auto：自動で入る行（値の列の色を変える）。period：開催期間の行（B 開始・C 終了）。help：説明（D 列）
 * 行の名前は、ほかの担当の定数と同じにする（ORGANIZER_LABEL・MAIL_ACCOUNT_LABEL・CERT_SAMPLE_LABEL・GUIDE_*_LABEL・PUBLIC_REGISTRY_LABEL など）
 */
const BASIC_ROWS = [
  { group: BASIC_GROUP_YEAR },
  { label: 'コンテスト名', value: '', sample: 'JA0 VHFコンテスト', help: 'LCR・メール・Webページに出す名前。年は入れない（開催期間の年が自動で付く）' },
  { label: '開催回', value: '', help: '例：73 と入れると「第73回」と表示する。空なら表示しない。新年度の準備で入る' },
  { label: '開催期間1', value: '', end: '', sample: '2026-05-09 21:00', endSample: '2026-05-10 12:00', period: true,
    help: 'B 列に開始日時、C 列に終了日時（日本時間）。日付と時刻の間は半角スペース（例：2026-05-09 21:00）' },
  { label: '開催期間2', value: '', end: '', period: true, help: '期間が分かれているときだけ入れる（B 開始・C 終了）。空なら使わない' },
  { label: '開催期間3', value: '', end: '', period: true, help: '同上。もっと要るときは「開催期間4」の行を手で足せば読む（「1. 初期設定」で、この行のすぐ下に並ぶ）' },
  { label: '主催者', value: '', sample: 'JA0 VHFコンテスト委員会', help: '受付ページ・メールの差出人名・結びに出す主催者の名前' },
  { label: '受付締切', value: '', help: 'これより後に届いたログは「締切後」として受け付ける（例：2026-06-10 23:59）。空なら締切なし' },
  { label: 'ジュニア部門の生年月日の区切り', value: '', sample: '2008-04-02',
    help: 'この日以降に生まれた方がジュニア部門の対象（例：2026年は 2008-04-02）。生年月日の確認は「規約のファイル」の「規約_部門と表彰」で決める。新年度の準備で1年進む' },
  { label: '問い合わせ先', value: '', help: '受付ページ（ログの提出画面）とメールに出す問い合わせ先。受付用のメールの宛先とは別のものにする。空なら出さない' },
  { label: '委員会URL', value: '', help: '委員会の公式ホームページのURL。メールの文面と参加証の {委員会URL} に入る' },
  { label: '委員の合言葉', value: '', help: '紙で届いたログを委員がフォームで入れるときの合言葉。空ならこの機能は使えない' },
  // 次の2行の名前は受付担当の INTAKE_MAIL_USE_LABEL・INTAKE_MAIL_TO_LABEL（96_gas_intake.js）と同じ。このファイルは Webページにも入るので文字で書く（申し送り No.120）
  { label: 'メールでの受付', value: '使わない', help: '初めは「使わない」（受付ページの提出だけを受け付ける。申し送り No.135）。「使う」なら、管理用アカウントのGmailに届いたメールのログを受け付ける。「使わない」なら受信トレイを読まず、受付ページ（ログ入力フォーム・アップロード）の提出だけを受け付ける' },
  { label: '受け付けるメールの宛先', value: '', help: '空なら、このGmailの受信トレイに届いたメールをすべて受け付ける（このアカウントでほかのコンテストも受け付けていると、そのログも取り込んでしまう）。ほかのコンテストと同じアカウントを使うときは、コンテストごとの宛先（例：ja0rl+ja0vhf@gmail.com）を入れると、その宛先に送られたメールだけを受け付ける' },
  { label: '受付番号の頭', value: '', sample: 'JA0VHF', help: '受付番号の「-」の前に付ける文字（例：JA0VHF とすると JA0VHF-001）。空なら 001 のように数字だけ' },
  { group: BASIC_GROUP_FILES },
  { label: 'ファイルの種類', value: 'テンプレート', auto: true, help: 'テンプレートなら「テンプレート」、年ごとの審査用なら「審査用」。新年度の準備で作ったファイルには自動で「審査用」が入る' },
  { label: '管理用アカウント', value: '', auto: true, help: 'メールの処理・確定・初期設定などを動かせるアカウント（Googleアカウントのメールアドレス）。このファイルの持ち主と同じアカウントにする。空なら「1. 初期設定」で持ち主のアドレスが入る' },
  { label: COMMITTEE_LABEL, value: '', help: '審査・規約のファイルを編集できる委員（Googleアカウントのメールアドレス）。読点・カンマ・改行で区切って並べる。メールのファイルは閲覧だけになる。「1. 初期設定」「新年度の準備」「委員の共有をそろえる」で共有が付く。管理用アカウントだけが書ける' },
  { label: BOOK_FILES.settings.label, value: '', auto: true, help: '規約・マルチ一覧・登録クラブ一覧のスプレッドシート（規約_XXX）のURL。空なら「1. 初期設定」で、このファイルと同じフォルダに作られる' },
  { label: BOOK_FILES.mail.label, value: '', auto: true, help: '受付履歴・返信文面・LCR送信などのスプレッドシート（メール_XXX）のURL。空なら「1. 初期設定」で、このファイルと同じフォルダに作られる' },
  { label: 'ログのフォルダ', value: '', auto: true, help: '提出ログのフォルダ（このファイルと同じフォルダの「提出ログ」）のURL。空なら「1. 初期設定」で入る（なければ作る）。新年度の準備でも入る' },
  { label: '年度フォルダの置き場所', value: '', auto: true, help: 'テンプレートで1回だけ入れる：親フォルダ「コンテスト自動審査システム」のURL。新年度の準備で、年度フォルダがここにできる' },
  { label: '前年の審査用スプレッドシート', value: '', auto: true, help: '前の年の審査のファイルのURL。新年度の準備で入る（案内メールの送り先を読む）' },
  { label: '参加証の見本', value: '', auto: true, help: '参加証の見本（Googleスライド）のURL。「参加証の見本を作る」・新年度の準備で入る' },
  { label: '受付ページのスプレッドシート', value: '', auto: true, help: '受付ページのスプレッドシート（「登録」の表がある）のURL。受付ページのメニューで入る' },
  { label: '受付ページのURL', value: '', auto: true, help: '受付ページのURL。受付ページのメニューで入る。メールの {受付ページのURL} に入る' },
  { label: '結果のページのURL', value: '', auto: true, help: '結果のページのURL。結果ページのメニューで入る。メールの {結果のページのURL} に入る' },
  { label: 'レコードのページのURL', value: '', auto: true, help: 'コンテストレコードのページのURL。レコードのページのメニューで入る。メールの {レコードのページのURL} に入る' }
];

/**
 * テンプレート（「1. 初期設定」で新しく作る「基本設定」の行・規約のファイル）を、JA0 VHF の値で作るか。ふだんは false（コンテストごとに
 * 違う所を空にして作る。規約は「規約をテキストから読み込む」で入れる。指示書_テンプレートを空から始める）。
 * テストのときだけ、この関数を true を返すように置きかえて、今までどおり JA0 VHF の値で作る（ほかの担当のテストが JA0 VHF の値を前提にしている）
 */
function settingsTemplateIsJa0_() {
  return false;
}

// ------------------------------------------------------------------ ファイルを開く

/** 審査のファイル ss から、kind のファイルを開く（BOOK_JUDGE なら ss そのもの）。URLが空・開けないときはエラー */
function bookFor_(ss, kind) {
  if (kind === BOOK_JUDGE) return ss;
  if (kind === BOOK_SETTINGS) return settingsSpreadsheetFor_(ss); // 92_gas_settings.js（Webページにも入っている）
  const info = BOOK_FILES[kind];
  if (!info) throw new Error('ファイルの種類「' + kind + '」が分かりません');
  settingsSpreadsheetCache_ = settingsSpreadsheetCache_ || {};
  const key = kind + ':' + ss.getId();
  if (settingsSpreadsheetCache_[key]) return settingsSpreadsheetCache_[key];
  const url = settingsBasicValue_(ss, info.label);
  if (!url) throw new Error('「基本設定」の「' + info.label + '」にURLがありません。「1. 初期設定」を実行すると作られます');
  const id = /[-\w]{25,}/.exec(url);
  try {
    if (!id) throw new Error('URLにファイルのIDがない');
    settingsSpreadsheetCache_[key] = SpreadsheetApp.openById(id[0]);
  } catch (e) {
    throw new Error(info.label + 'を開けません。「基本設定」の「' + info.label + '」のURLと、ファイルを見る権限を確かめてください：' + url);
  }
  return settingsSpreadsheetCache_[key];
}

/** このファイル（審査のファイル）から、kind のファイルを開く */
function book_(kind) {
  return bookFor_(SpreadsheetApp.getActiveSpreadsheet(), kind);
}

/** シートを取る。なければ、シートの一覧で決めた場所・色で作る（一覧にないシートは、いちばん後ろに作る） */
function bookSheetFor_(ss, kind, name) {
  const book = bookFor_(ss, kind);
  const sh = book.getSheetByName(name);
  if (sh) return sh;
  const list = BOOK_SHEETS[kind] || [];
  const def = list.filter(function (d) { return d.name === name; })[0];
  // 決めた順で、前にあるシートの数だけ前に置く（前のシートが消されていても、順は崩れない）
  const index = def ? list.slice(0, list.indexOf(def)).filter(function (d) { return book.getSheetByName(d.name); }).length : book.getSheets().length;
  return bookCreateSheet_(book, def || { name: name }, index);
}

/** このファイルから、kind のファイルのシートを取る */
function bookSheet_(kind, name) {
  return bookSheetFor_(SpreadsheetApp.getActiveSpreadsheet(), kind, name);
}

/** シートを作り、見出し（または空のときの1行）と色を付ける */
function bookCreateSheet_(book, def, index) {
  const sh = book.insertSheet(def.name, index);
  const header = def.header ? def.header() : null;
  if (header) {
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (def.empty) {
    sh.getRange(1, 1).setValue(def.empty);
  }
  if (def.color) bookTry_(function () { sh.setTabColor(BOOK_TAB_COLORS[def.color]); });
  return sh;
}

/**
 * シートの中身を空にする（シートは消さない。並び・色・守り方はそのまま）。新年度の準備が使う。
 * シートの一覧で「空のときの1行」があるシートはその1行に戻し、見出しがあるシートは1行目を残す。どちらもなければ全部消す
 */
function bookClearSheetFor_(ss, kind, name) {
  const book = bookFor_(ss, kind);
  const sh = book.getSheetByName(name);
  if (!sh) return;
  const def = (BOOK_SHEETS[kind] || []).filter(function (d) { return d.name === name; })[0] || {};
  if (def.empty) { sh.clear(); sh.getRange(1, 1).setValue(def.empty); return; }
  const header = def.header ? def.header() : null;
  if (!header) { sh.clear(); return; }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), header.length)).clearContent();
}

/** 見た目・守り方の失敗で、処理を止めない（失敗の文を返す。成功なら ''） */
function bookTry_(fn) {
  try { fn(); return ''; } catch (e) { return e && e.message ? e.message : String(e); }
}

// ------------------------------------------------------------------ 「1. 初期設定」

/**
 * 「1. 初期設定」から呼ぶ。基本設定を決めた順で作り、規約のファイルとメールのファイルを用意し（なければ同じフォルダに作る）、
 * 3つのファイルの全部のシートを決めた順・色で並べ、守り方をかけ、何も入っていない「シート1」を消す。
 * 戻り値：うまくいかなかったこと（守り方をかけられないなど）の文の一覧
 */
function setupBooks_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const warnings = [];
  setupBasicSheet_(ss);
  bookFillAdmin_(ss);
  const logWarn = bookTry_(function () { const m = bookEnsureLogFolder_(ss); if (m) warnings.push(m); });
  if (logWarn) warnings.push('「' + BOOK_LOG_FOLDER + '」のフォルダを用意できませんでした（' + logWarn + '）。「' + BOOK_LOG_LABEL + '」に手でURLを入れてください');
  [BOOK_SETTINGS, BOOK_MAIL].forEach(function (kind) { bookEnsureFile_(ss, kind); });
  setupSettingsSheets_(bookFor_(ss, BOOK_SETTINGS)); // 規約_ の6枚の中身（92_gas_settings.js）
  [BOOK_JUDGE, BOOK_SETTINGS, BOOK_MAIL].forEach(function (kind) {
    const book = bookFor_(ss, kind);
    bookArrange_(book, kind, warnings);
    bookProtect_(ss, book, kind, warnings);
  });
  return warnings.concat(bookShareCommittee_(ss));
}

/**
 * 「1. 初期設定」「新年度の準備」の初めに呼ぶ（指示書_シートの整理_追加 3.）。「管理用アカウント」に値があれば、そのアカウントだけ
 * （受付担当の requireMailAccount_）。空なら（いちばん最初の初期設定）、このファイルの持ち主だけ。持ち主が分からないとき
 * （共有ドライブなど）は止めない
 */
function requireSetupAccount_(what) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (settingsBasicValue_(ss, BOOK_ADMIN_LABEL)) { requireMailAccount_(what); return; } // 96_gas_intake.js
  let owner = '';
  bookTry_(function () { owner = String(DriveApp.getFileById(ss.getId()).getOwner().getEmail() || '').trim().toLowerCase(); });
  if (!owner) return;
  const me = currentMailUser_(); // 96_gas_intake.js
  if (me === owner) return;
  try { logHistory_('止めました：' + what + '（実行したアカウント：' + (me || '不明') + '、持ち主：' + owner + '）'); } catch (e) { /* 履歴に書けなくても止める */ }
  throw new Error(what + 'は、このファイルの持ち主（' + owner + '）で実行してください。「基本設定」の「' + BOOK_ADMIN_LABEL + '」が空のときは、持ち主だけが実行できます。' +
    (me ? '今のアカウント（' + me + '）では実行できません。' : '今のアカウントのアドレスが分からないため、実行できません。'));
}

/**
 * 「ログのフォルダ」が空なら、審査のファイルと同じフォルダの「提出ログ」を入れる（なければ作る。指示書_シートの整理_追加 12.）。
 * 値が入っていれば何もしない。戻り値：知らせの文（何もしなければ ''）
 */
function bookEnsureLogFolder_(ss) {
  if (settingsBasicValue_(ss, BOOK_LOG_LABEL)) return '';
  const parents = DriveApp.getFileById(ss.getId()).getParents();
  if (!parents.hasNext()) return '';
  const parent = parents.next();
  const it = parent.getFoldersByName(BOOK_LOG_FOLDER);
  const found = it.hasNext();
  const folder = found ? it.next() : parent.createFolder(BOOK_LOG_FOLDER);
  bookSetBasicValue_(ss, BOOK_LOG_LABEL, folder.getUrl());
  return '「' + BOOK_LOG_FOLDER + '」のフォルダを' + (found ? '見つけ' : '作り') + '、「' + BOOK_LOG_LABEL + '」に入れました';
}

/** 「編集できる委員」のアドレスの一覧（小文字。読点・カンマ・空白・改行で区切る。同じものは1つ） */
function bookCommitteeList_(ss) {
  return String(settingsBasicValue_(ss, COMMITTEE_LABEL) || '').split(/[、,，;；\s]+/)
    .map(function (x) { return x.trim().toLowerCase(); })
    .filter(function (x, i, a) { return x && a.indexOf(x) === i; });
}

/**
 * 「編集できる委員」に共有を付ける（指示書_シートの整理_追加 2.）。審査のファイル・規約のファイルは編集者、メールのファイルは閲覧者。
 * 権限は足すだけで、消さない。一覧にない人が共有されていれば知らせる（持ち主・管理用アカウントは除く）。メールのファイルの編集者に
 * 委員がいれば知らせる。「編集できる委員」が空なら何もしない。戻り値：知らせの文の一覧
 */
function bookShareCommittee_(ss) {
  const list = bookCommitteeList_(ss);
  if (!list.length) return [];
  const admin = String(settingsBasicValue_(ss, BOOK_ADMIN_LABEL) || '').trim().toLowerCase();
  const msgs = [];
  [[BOOK_JUDGE, '審査のファイル', true], [BOOK_SETTINGS, BOOK_FILES.settings.label, true], [BOOK_MAIL, BOOK_FILES.mail.label, false]].forEach(function (t) {
    const label = t[1], edit = t[2];
    const w = bookTry_(function () {
      const file = DriveApp.getFileById(bookFor_(ss, t[0]).getId());
      const emails = function (users) { return users.map(function (u) { return String(u.getEmail() || '').trim().toLowerCase(); }); };
      const editors = emails(file.getEditors()), viewers = emails(file.getViewers());
      let owner = '';
      bookTry_(function () { owner = String(file.getOwner().getEmail() || '').trim().toLowerCase(); });
      const added = [];
      list.forEach(function (m) {
        if (m === owner) return;
        if (edit) {
          if (editors.indexOf(m) < 0) { file.addEditor(m); added.push(m); }
        } else if (editors.indexOf(m) >= 0) {
          msgs.push(label + 'で、' + m + ' が編集者になっています。メールのファイルは、委員には閲覧だけにします。共有の設定で「閲覧者」に変えてください（親フォルダを編集者で共有していると、ここでは変えられません）');
        } else if (viewers.indexOf(m) < 0) { file.addViewer(m); added.push(m); }
      });
      if (added.length) msgs.push(label + 'を、' + added.join('、') + ' と共有しました（' + (edit ? '編集者' : '閲覧者') + '）');
      const extra = editors.concat(viewers).filter(function (m, i, a) {
        return m && a.indexOf(m) === i && m !== owner && m !== admin && list.indexOf(m) < 0;
      });
      if (extra.length) msgs.push(label + 'は、「' + COMMITTEE_LABEL + '」にいない人とも共有しています：' + extra.join('、') + '。要らなければ、共有の設定で手で外してください');
    });
    if (w) msgs.push(label + 'の共有を付けられませんでした（' + w + '）');
  });
  return msgs;
}

/** メニュー「委員の共有をそろえる」（管理用アカウントだけ）：「編集できる委員」に足りない権限を付け、そろっていない所を知らせる */
function menuShareCommittee() {
  requireMailAccount_('委員の共有をそろえる'); // 96_gas_intake.js
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  if (!bookCommitteeList_(ss).length) {
    ui.alert('「基本設定」の「' + COMMITTEE_LABEL + '」が空です。委員のGoogleアカウントのメールアドレスを、読点・カンマ・改行で区切って入れてから、もう一度実行してください。');
    return;
  }
  const msgs = bookShareCommittee_(ss);
  try { logHistory_('委員の共有をそろえました' + (msgs.length ? '（' + msgs.join('／') + '）' : '（変えた所なし）')); } catch (e) { /* 履歴に書けなくても続ける */ }
  ui.alert(msgs.length ? msgs.join('\n\n') : '委員の共有はそろっています（審査・規約のファイルは編集者、メールのファイルは閲覧者）。');
}

/**
 * 「基本設定」の「管理用アカウント」が空なら、審査のファイルの持ち主のメールアドレスを入れる（決まったこと D：管理用アカウント＝持ち主）。
 * 持ち主が分からないとき（取れないとき）は空のまま
 */
function bookFillAdmin_(ss) {
  if (settingsBasicValue_(ss, '管理用アカウント')) return;
  let owner = '';
  bookTry_(function () { owner = DriveApp.getFileById(ss.getId()).getOwner().getEmail(); });
  if (owner) bookSetBasicValue_(ss, '管理用アカウント', owner);
}

/** 「基本設定」の kind のファイルが空なら、審査のファイルと同じフォルダに作って、URLを書く */
function bookEnsureFile_(ss, kind) {
  const info = BOOK_FILES[kind];
  if (settingsBasicValue_(ss, info.label)) return;
  const m = /^審査_(.+)$/.exec(ss.getName());
  const book = SpreadsheetApp.create(m ? info.prefix + '_' + m[1] : info.prefix);
  const parents = DriveApp.getFileById(ss.getId()).getParents();
  if (parents.hasNext()) DriveApp.getFileById(book.getId()).moveTo(parents.next());
  bookSetBasicValue_(ss, info.label, book.getUrl());
  settingsSpreadsheetCache_ = settingsSpreadsheetCache_ || {};
  settingsSpreadsheetCache_[kind === BOOK_SETTINGS ? ss.getId() : kind + ':' + ss.getId()] = book;
}

/** 「基本設定」の label の行の値（B 列）を書く。行がなければ何もしない（行は setupBasicSheet_ が作る） */
function bookSetBasicValue_(ss, label, value) {
  const sh = ss.getSheetByName(SETTINGS_BASIC_SHEET);
  if (!sh) return;
  const v = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]).trim() === label) { sh.getRange(i + 1, 2).setValue(value); return; }
}

/** シートの一覧の順・色で並べ、ないシートを作る。何も入っていない「シート1」を消す */
function bookArrange_(book, kind, warnings) {
  const list = BOOK_SHEETS[kind];
  list.forEach(function (def, i) {
    let sh = book.getSheetByName(def.name);
    if (!sh) sh = bookCreateSheet_(book, def, i);
    const w = bookTry_(function () {
      sh.setTabColor(BOOK_TAB_COLORS[def.color]);
      if (sh.getIndex() !== i + 1) { book.setActiveSheet(sh); book.moveActiveSheet(i + 1); }
    });
    if (w) warnings.push('「' + def.name + '」の並び・色を付けられませんでした（' + w + '）');
  });
  const names = list.map(function (d) { return d.name; });
  book.getSheets().forEach(function (sh) {
    const n = sh.getName();
    if (names.indexOf(n) < 0 && /^(シート|Sheet)\d+$/.test(n) && sh.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(sh);
  });
}

/** 守り方をかける（前にこの関数がかけたものは外してかけ直す）。「持ち主だけ」で書けるのは、持ち主と管理用アカウント */
function bookProtect_(ss, book, kind, warnings) {
  const admin = settingsBasicValue_(ss, '管理用アカウント');
  const owner = function (p) {
    p.removeEditors(p.getEditors()); // 持ち主と、実行している人は外せない（そのまま残る）
    if (admin) p.addEditor(admin);
    if (p.canDomainEdit()) p.setDomainEdit(false);
  };
  BOOK_SHEETS[kind].forEach(function (def) {
    const sh = book.getSheetByName(def.name);
    if (!sh) return;
    const w = bookTry_(function () {
      sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).concat(sh.getProtections(SpreadsheetApp.ProtectionType.RANGE))
        .forEach(function (p) { if (p.getDescription() === BOOK_PROTECT_DESC) p.remove(); });
      if (def.protect === 'warning') sh.protect().setDescription(BOOK_PROTECT_DESC).setWarningOnly(true);
      else if (def.protect === 'owner') owner(sh.protect().setDescription(BOOK_PROTECT_DESC));
      else if (def.protect === 'basic') {
        // 「ファイルの場所など」のまとまりの値の列（B 列）を、持ち主と管理用アカウントだけにする
        const r = basicGroupRows_(sh, BASIC_GROUP_FILES);
        if (r) owner(sh.getRange(r.first, 2, r.last - r.first + 1, 1).protect().setDescription(BOOK_PROTECT_DESC));
      }
    });
    if (w) warnings.push('「' + def.name + '」に守り方をかけられませんでした（' + w + '）');
  });
}

/** 「基本設定」で、まとまりの見出しの次の行から、次の見出しの前（または最後）の行まで。{first, last}（シートの行番号）。なければ null */
function basicGroupRows_(sh, group) {
  const v = sh.getDataRange().getDisplayValues();
  let first = 0, last = 0;
  for (let i = 1; i < v.length; i++) {
    const a = String(v[i][0]).trim();
    if (a === group) { first = i + 2; last = i + 1; continue; }
    if (!first) continue;
    if (/^■/.test(a)) break;
    if (a) last = i + 1;
  }
  return first && last >= first ? { first: first, last: last } : null;
}

/**
 * 「基本設定」を、行の一覧（BASIC_ROWS）の順で作り直す（4列：A 項目｜B 値｜C 終了日時｜D 説明）。
 * 今ある行の値（B・C）は、項目の名前で見つけて残す。一覧にない行も消さずに、いちばん後ろに残す。
 * 見出しの行・自動で入る行・C 列を使わない行に色を付け、開催期間の B・C を日時の書式にする
 */
function setupBasicSheet_(ss) {
  let sh = ss.getSheetByName(SETTINGS_BASIC_SHEET);
  if (!sh) sh = bookCreateSheet_(ss, BOOK_SHEETS.judge[0], 0);
  const old = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 4)).getDisplayValues() : [];
  const have = {};
  const oldHeader = sh.getLastRow() >= 1 ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues()[0] : [];
  const fourCols = String(oldHeader[2] || '').trim() === BASIC_HEADER[2]; // 前の版（3列：項目・値・説明）なら C 列は説明
  old.forEach(function (r) {
    const label = String(r[0]).trim();
    if (label && !/^■/.test(label) && !have[label]) have[label] = { b: r[1], c: fourCols ? r[2] : '', d: fourCols ? r[3] : r[2] };
  });
  const known = {};
  const rows = [BASIC_HEADER];
  const isPeriod = function (label) { return /^開催期間\d+$/.test(label); };
  const lastPeriod = BASIC_ROWS.filter(function (d) { return d.period; }).slice(-1)[0].label;
  BASIC_ROWS.forEach(function (def) {
    if (def.group) { rows.push([def.group, '', '', '']); return; }
    known[def.label] = true;
    const h = have[def.label];
    const ja0 = settingsTemplateIsJa0_(); // テストのときだけ JA0 VHF の値（sample）で作る
    const value = ja0 && 'sample' in def ? def.sample : def.value, end = ja0 && 'endSample' in def ? def.endSample : def.end;
    rows.push([def.label, h ? h.b : value, def.period ? (h ? h.c : end) : '', def.help]);
    if (def.label !== lastPeriod) return;
    // 手で足した「開催期間4」などは、開催期間3のすぐ下に、番号の順で残す（開催部門が4つ以上のコンテスト。指示書_新潟・ギガヘルツ対応_1 の 1. の 7.）
    Object.keys(have).filter(function (l) { return isPeriod(l) && !BASIC_ROWS.some(function (d) { return d.label === l; }); })
      .sort(function (a, b) { return Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')); })
      .forEach(function (l) { known[l] = true; rows.push([l, have[l].b, have[l].c, have[l].d || '同上（手で足した開催期間の行。B 開始・C 終了）']); });
  });
  Object.keys(have).forEach(function (label) {
    if (!known[label]) rows.push([label, have[label].b, have[label].c, have[label].d]); // 一覧にない行（消さない）
  });
  bookTry_(function () { sh.getDataRange().clearDataValidations(); });
  sh.clear();
  const n = rows.length;
  sh.getRange(1, 1, n, 4).setNumberFormat('@');
  rows.forEach(function (r, i) { if (isPeriod(r[0])) sh.getRange(i + 1, 2, 1, 2).setNumberFormat(BASIC_DATETIME_FORMAT); });
  sh.getRange(1, 1, n, 4).setValues(rows);
  sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  sh.setFrozenRows(1);
  bookTry_(function () {
    rows.forEach(function (r, i) {
      const def = BASIC_ROWS.filter(function (d) { return (d.group || d.label) === r[0]; })[0];
      if (!def) return;
      if (def.group) { sh.getRange(i + 1, 1, 1, 4).setBackground(BASIC_COLORS.group).setFontWeight('bold'); return; }
      if (def.auto) sh.getRange(i + 1, 2).setBackground(BASIC_COLORS.auto);
      if (!def.period) sh.getRange(i + 1, 3).setBackground(BASIC_COLORS.unusedC);
    });
  });
  return sh;
}

// ===== 92_gas_settings.js =====
/**
 * 規約のファイル（規約_ で始まるシートを入れた、審査のファイルとは別のスプレッドシート。規約_XXX）を読む・規約のシートを作る
 * （GAS専用。Node.jsのテストでは使わない）
 *
 * 審査のファイルの「基本設定」の「規約のファイル」に、そのファイルのURLを書いておく。
 * ファイルを作る・シートを並べるのは 91_gas_books.js（「1. 初期設定」の setupBooks_）。表と設定の変換は 11_settings.js。
 *   setupSettingsSheets_(sss) … 規約_ の6枚を JA0 VHF 2026 の値（configJa0Vhf2026()）で作る。あれば、足りない行だけ足す
 *   loadConfigFor_(ss) … 審査のファイル ss の規約のファイルと「基本設定」（開催期間1〜3も）から設定（cfg）を作る。
 *                        loadConfig_（90_gas_main.js）と、公開ページのログ入力フォーム（Web担当）が使う。
 *                        公開ページには 90_gas_main.js が入らないので、ここから先は basicValue_ などを使わない
 *   loadSettingsConfig_() … このファイルの規約のファイルを読んで、規約の分だけの設定を作る
 *   menuOpenSettingsFile() … メニュー「規約のファイルを開く」
 *   menuCheckSettings() … メニュー「設定の読み込みを確かめる」（読めるか・開催期間・開催部門を出す）
 */

const SETTINGS_FILE_LABEL = '規約のファイル'; // 「基本設定」の行の名前（91_gas_books.js の BOOK_FILES.settings.label と同じ）
const SETTINGS_BASIC_SHEET = '基本設定';      // 90_gas_main.js の SHEET_BASIC と同じシート（公開ページでは 90 が使えないので別に持つ）

// 1回の実行の中では、開いたファイルを使い回す（{審査のファイルのID: 規約のファイル, 'mail:'＋ID: メールのファイル}。null なら空）
let settingsSpreadsheetCache_ = null;

/** 審査用スプレッドシート ss の「基本設定」の値（basicValue_ と同じ読み方） */
function settingsBasicValue_(ss, label) {
  const sh = ss.getSheetByName(SETTINGS_BASIC_SHEET);
  if (!sh) return '';
  const v = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === label) return String(v[i][1]).trim();
  return '';
}

/** 審査用スプレッドシート ss の規約のファイルを開く。URLが空・開けないときはエラー */
function settingsSpreadsheetFor_(ss) {
  settingsSpreadsheetCache_ = settingsSpreadsheetCache_ || {};
  const key = ss.getId();
  if (settingsSpreadsheetCache_[key]) return settingsSpreadsheetCache_[key];
  const url = settingsBasicValue_(ss, SETTINGS_FILE_LABEL);
  if (!url) throw new Error('「基本設定」の「' + SETTINGS_FILE_LABEL + '」にURLがありません。「1. 初期設定」を実行すると作られます');
  const id = /[-\w]{25,}/.exec(url);
  try {
    if (!id) throw new Error('URLにファイルのIDがない');
    settingsSpreadsheetCache_[key] = SpreadsheetApp.openById(id[0]);
  } catch (e) {
    throw new Error('規約のファイルを開けません。URLと、ファイルを見る権限を確かめてください：' + url);
  }
  return settingsSpreadsheetCache_[key];
}

/** このファイル（審査のファイル）の規約のファイルを開く */
function settingsSpreadsheet_() {
  return settingsSpreadsheetFor_(SpreadsheetApp.getActiveSpreadsheet());
}

/**
 * 審査のファイル ss から設定（cfg）を作る。形は configJa0Vhf2026() と同じ。
 * 規約は ss の「基本設定」の「規約のファイル」から読む。コンテスト名・開催回・ジュニア部門の生年月日の区切り・
 * 開催期間（開催期間1〜3）は ss の「基本設定」から読む。読めない値はエラー（審査・受付などを始めない）
 */
function loadConfigFor_(ss) {
  return settingsConfigWithBasic_(ss, configFromSettingsTables(readSettingsTables_(settingsSpreadsheetFor_(ss))));
}

/** 審査のファイル ss の「基本設定」の表（1行目は見出し。表示のとおりの文字）。シートがなければ [] */
function settingsBasicRows_(ss) {
  const sh = ss.getSheetByName(SETTINGS_BASIC_SHEET);
  return sh ? sh.getDataRange().getDisplayValues() : [];
}

/** 審査のファイル ss の開催期間（「基本設定」の「開催期間1」…）。{periods, errors}（11_settings.js の periodsFromBasicRows） */
function settingsPeriodsFor_(ss) {
  return periodsFromBasicRows(settingsBasicRows_(ss));
}

/**
 * 審査のファイル ss の「基本設定」の開催期間の行（「開催期間1」…）に、periods（[{start, end}]）を上から書く。
 * 余った行は空にする。行が足りないときは書けない分を返す（行は「1. 初期設定」が作る）。新年度の準備が使う
 */
function settingsWritePeriods_(ss, periods) {
  const sh = ss.getSheetByName(SETTINGS_BASIC_SHEET);
  if (!sh) return periods.length;
  const v = sh.getDataRange().getDisplayValues();
  let k = 0;
  for (let i = 1; i < v.length; i++) {
    if (!/^開催期間/.test(toHankaku(String(v[i][0])).replace(/\s+/g, ''))) continue;
    const p = periods[k++];
    sh.getRange(i + 1, 2, 1, 2).setValues([[p ? p.start : '', p ? p.end : '']]);
  }
  return Math.max(0, periods.length - k);
}

/** 規約から作った設定（cfg）に、審査のファイル ss の「基本設定」の値を入れる（loadConfigFor_・loadConfig_ が使う） */
function settingsConfigWithBasic_(ss, cfg) {
  const rows = settingsBasicRows_(ss);
  const basic = function (label) {
    for (let i = 1; i < rows.length; i++) if (rows[i][0] === label) return String(rows[i][1]).trim();
    return '';
  };
  const name = basic('コンテスト名');
  if (!name) throw new Error('「基本設定」シートに、コンテスト名を入れてください');
  cfg.contestName = name;
  cfg.contestNumber = basic('開催回');
  (cfg.entryDivisions || []).forEach(function (dv) {
    if (dv.needBirthDate) dv.bornOnOrAfter = basic(dv.name + 'の生年月日の区切り');
  });
  const per = periodsFromBasicRows(rows);
  if (per.errors.length) throw new Error(per.errors.join('\n'));
  cfg.periods = per.periods;
  // 開催部門の開催期間：「規約_開催部門」が名前で指す「基本設定」の開催期間の行（docs/決定_新潟・ギガヘルツ対応.md の 1.）
  (cfg.sections || []).forEach(function (sec) {
    sec.periods = sec.periodLabels.map(function (label) {
      if (!per.byLabel[label]) throw new Error('規約のファイルの「規約_開催部門」の「' + sec.name + '」が指す「' + label + '」に、「基本設定」で開始日時と終了日時を入れてください');
      return per.byLabel[label];
    });
  });
  return cfg;
}

/**
 * このファイルの規約のファイルの「規約_基本」の、設定（cfg）に入れない行の値（マルチ一覧（zLogのDAT）・登録クラブ一覧のURL）。
 * 取り込みのメニューが使う。行がない・空なら ''
 */
function settingsRegulationValue_(label) {
  const rows = readSettingsTables_(settingsSpreadsheet_())[SETTINGS_SHEETS.basic] || [];
  const head = (rows[0] || []).map(settingsCellText);
  const a = head.indexOf('項目'), b = head.indexOf('値');
  for (let i = 1; i < rows.length; i++) if (settingsCellText(rows[i][a]) === label) return settingsCellText(rows[i][b]);
  return '';
}

/** 規約のファイル（ss）に、ないシートを作る。あるシートは、委員が入れた値を変えない（「規約_基本」「規約_部門と表彰」は足りない行だけ足す） */
function setupSettingsSheets_(ss) {
  const terms = settingsOpTermsOfBook_(ss); // 「シングルオペ・マルチオペの呼び方」。この呼び方の言葉で作る・書き換える
  const cfg = settingsTemplateIsJa0_() ? configJa0Vhf2026() : settingsTemplateConfig(); // ふだんは空のテンプレート（91_gas_books.js・11_settings.js）
  cfg.opTerms = terms;
  const tables = settingsTablesFromConfig(cfg);
  Object.keys(tables).forEach(function (name) {
    const rows = tables[name];
    let sh = ss.getSheetByName(name);
    if (sh) migrateSettingsWords_(sh, name, terms); // もう一つの呼び方の言葉を、選んだ呼び方の言葉にする。足りない行を足す前に行う
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows);
      sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
      sh.setFrozenRows(1);
      SETTINGS_HEADERS[name].forEach(function (h, i) { sh.getRange(1, i + 1).setNote(h[1]); });
    } else if (name === SETTINGS_SHEETS.basic || name === SETTINGS_SHEETS.divisions) {
      addMissingSettingsRows_(sh, rows, name === SETTINGS_SHEETS.basic ? ['項目'] : ['部門', '項目']);
    } else if (SETTINGS_OPTIONAL_COLUMNS[name]) {
      addMissingSettingsColumns_(sh, name); // 前の版の「規約_種目」に「モード」「開催部門」の列を足す（11_settings.js）
    }
    setupSettingsDropdowns_(sh, name, terms);
  });
}

/** 規約のファイル（ss）の「規約_基本」の「シングルオペ・マルチオペの呼び方」（'individualClub'・'singleMulti'）。行がない・空・読めないなら「個人／社団」 */
function settingsOpTermsOfBook_(ss) {
  const sh = ss.getSheetByName(SETTINGS_SHEETS.basic);
  if (!sh || sh.getLastRow() < 2) return SETTINGS_OP_TERMS_DEFAULT;
  const v = sh.getDataRange().getDisplayValues();
  const head = v[0].map(function (h) { return String(h).trim(); });
  const a = head.indexOf('項目'), b = head.indexOf('値');
  if (a < 0 || b < 0) return SETTINGS_OP_TERMS_DEFAULT;
  const norm = function (x) { return toHankaku(String(x)).replace(/\s+/g, ''); };
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][a]).trim() !== 'シングルオペ・マルチオペの呼び方') continue;
    const c = SETTINGS_CHOICES.opTerms.filter(function (x) { return norm(x[0]) === norm(v[i][b]); })[0];
    return c ? c[1] : SETTINGS_OP_TERMS_DEFAULT;
  }
  return SETTINGS_OP_TERMS_DEFAULT;
}

/**
 * 「個人／社団」と「シングルオペ／マルチオペ」の言葉を、選んだ呼び方 terms の言葉に書き換える（どちらの向きでも。中身は消さない。
 * 指示書_準本番で見つけた点の直し_1 の 1. の 3.・その2 の 1.）
 *   「規約_種目」：見出し（「個人／社団」・「シングルオペ／マルチオペ」）と、その列の値（個人・社団・シングルオペ・マルチオペ）
 *   「規約_部門と表彰」：項目の名前（label・altLabel）と、その行の値
 */
function migrateSettingsWords_(sh, name, terms) {
  if (sh.getLastRow() < 1) return;
  terms = SETTINGS_OP_TERMS[terms] ? terms : SETTINGS_OP_TERMS_DEFAULT;
  const v = sh.getDataRange().getDisplayValues();
  const head = v[0].map(function (h) { return String(h).trim(); });
  const allWords = {}; // どちらの呼び方の言葉も → 中の値
  Object.keys(SETTINGS_OP_TERMS).forEach(function (t) {
    const w = SETTINGS_OP_TERMS[t].words;
    Object.keys(w).forEach(function (op) { allWords[w[op]] = op; });
  });
  const word = function (x) { // 値を選んだ呼び方の言葉にする。変えなくてよい・知らない値なら null
    const t = String(x).trim();
    if (!(t in allWords)) return null;
    const w = SETTINGS_OP_TERMS[terms].words[allWords[t]];
    return w === t ? null : w;
  };
  const names = Object.keys(SETTINGS_OP_TERMS).map(function (t) { return SETTINGS_OP_TERMS[t].name; });
  const want = SETTINGS_OP_TERMS[terms].name;
  if (name === SETTINGS_SHEETS.categories) {
    const c = head.findIndex(function (h) { return names.indexOf(h) >= 0; });
    if (c < 0) return;
    if (head[c] !== want) sh.getRange(1, c + 1).setValue(want);
    for (let i = 1; i < v.length; i++) { const w = word(v[i][c]); if (w) sh.getRange(i + 1, c + 1).setValue(w); }
  } else if (name === SETTINGS_SHEETS.divisions) {
    const cb = head.indexOf('部門'), ci = head.indexOf('項目'), cv = head.indexOf('値');
    if (cb < 0 || ci < 0 || cv < 0) return;
    for (let i = 1; i < v.length; i++) {
      const b = SETTINGS_DIVISION_BLOCKS.filter(function (x) { return x.block === String(v[i][cb]).trim(); })[0];
      const label = String(v[i][ci]).trim();
      const it = b && b.items.filter(function (x) { return x.altLabel && (x.label === label || x.altLabel === label); })[0];
      if (!it) continue;
      const to = settingsOpText(it.label, terms);
      if (label !== to) {
        if (v.some(function (r) { return String(r[cb]).trim() === b.block && String(r[ci]).trim() === to; })) continue; // 選んだ呼び方の名前の行もある
        sh.getRange(i + 1, ci + 1).setValue(to);
      }
      const w = word(v[i][cv]);
      if (w) sh.getRange(i + 1, cv + 1).setValue(w);
    }
  }
}

/** 後から足した列（SETTINGS_OPTIONAL_COLUMNS）が見出しになければ、右の端に足す。委員が入れた中身は変えない */
function addMissingSettingsColumns_(sh, name) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  let col = sh.getLastColumn();
  SETTINGS_OPTIONAL_COLUMNS[name].forEach(function (h) {
    if (head.indexOf(h) >= 0) return;
    col++;
    const help = (SETTINGS_HEADERS[name].filter(function (x) { return x[0] === h; })[0] || [h, ''])[1];
    sh.getRange(1, col).setValue(h).setFontWeight('bold').setNote(help);
  });
}

/** 項目の行が足りなければ、シートの最後に足す（見出しの並びに合わせる） */
function addMissingSettingsRows_(sh, rows, keyHeaders) {
  const v = sh.getDataRange().getDisplayValues();
  const head = v[0].map(function (h) { return String(h).trim(); });
  const keyOf = function (r, hd) { return keyHeaders.map(function (h) { return String(r[hd.indexOf(h)] || '').trim(); }).join('|'); };
  if (keyHeaders.some(function (h) { return head.indexOf(h) < 0; })) return; // 見出しが変えられている（読み込みでエラーになる）
  const have = v.slice(1).map(function (r) { return keyOf(r, head); });
  rows.slice(1).forEach(function (r) {
    if (have.indexOf(keyOf(r, rows[0])) >= 0) return;
    const row = head.map(function (h) { const i = rows[0].indexOf(h); return i >= 0 ? r[i] : ''; });
    sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  });
}

/** 選ぶ値のマスにプルダウンを付ける */
function setupSettingsDropdowns_(sh, name, terms) {
  if (sh.getMaxRows() < 2) return;
  terms = SETTINGS_OP_TERMS[terms] ? terms : SETTINGS_OP_TERMS_DEFAULT;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  const rule = function (choices, help) {
    const list = choices === 'op' ? [SETTINGS_OP_TERMS[terms].words['個人'], SETTINGS_OP_TERMS[terms].words['社団']] // 選んだ呼び方の言葉
      : SETTINGS_CHOICES[choices].map(function (x) { return x[0]; });
    return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).setHelpText(help).build();
  };
  const column = function (header, choices, help) {
    const c = head.indexOf(header);
    if (c >= 0) sh.getRange(2, c + 1, sh.getMaxRows() - 1, 1).setDataValidation(rule(choices, help));
  };
  // 1行ずつ項目を見て、その行の「値」のマスに付ける
  const perRow = function (findItem) {
    const cv = head.indexOf('値');
    if (cv < 0 || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getDisplayValues().forEach(function (r, i) {
      const it = findItem(r);
      if (it && it.type === 'choice') sh.getRange(i + 2, cv + 1).setDataValidation(rule(it.choices, it.help));
    });
  };
  if (name === SETTINGS_SHEETS.basic) {
    const ci = head.indexOf('項目');
    perRow(function (r) { return SETTINGS_BASIC_ITEMS.filter(function (it) { return it.label === String(r[ci]).trim(); })[0]; });
  } else if (name === SETTINGS_SHEETS.divisions) {
    const cb = head.indexOf('部門'), ci = head.indexOf('項目');
    perRow(function (r) {
      const b = SETTINGS_DIVISION_BLOCKS.filter(function (x) { return x.block === String(r[cb]).trim(); })[0];
      if (!b) return null;
      const label = String(r[ci]).trim();
      if (label === '使う') return { type: 'choice', choices: 'yesNo', help: '「しない」なら、この部門は使わない' };
      return b.items.filter(function (it) { return it.label === label || it.altLabel === label; })[0];
    });
  } else if (name === SETTINGS_SHEETS.categories) {
    column('局区分', 'cls', '管内局・管外局から選ぶ');
    column(SETTINGS_OP_TERMS[terms].name, 'op', SETTINGS_OP_TERMS[terms].name.replace('／', '・') + 'から選ぶ（呼び方は「規約_基本」の「シングルオペ・マルチオペの呼び方」）');
    column('モード', 'catMode', '電話・電信・電信・電話から選ぶ。「電信・電話」か空なら両方');
    const c = head.indexOf('県');
    if (c >= 0) {
      const prefs = Object.keys(PREF_TABLE).map(function (k) { return PREF_TABLE[k]; }).concat([SETTINGS_OUTSIDE_PREF]);
      sh.getRange(2, c + 1, sh.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(prefs, true).setAllowInvalid(false).setHelpText('管内局の種目は県を選ぶ（空なら管内のどの県でもよい）。管外局は「県外」か空').build());
    }
  } else if (name === SETTINGS_SHEETS.multi) {
    column('局区分', 'cls', '管内局・管外局から選ぶ');
  } else if (name === SETTINGS_SHEETS.checks) {
    column('使う', 'yesNo', '「する」＝このチェックをする');
  }
}

/**
 * 規約のファイルのシートを読む。{シート名: 2次元の配列}（シートがなければ null）。
 * 表示の形（小数点の桁・3けた区切り・日付の書き方）に左右されないように、入っている値そのもの（getValues）を読む。
 * 数・true/false・日付は、11_settings.js の settingsCellText で文字に直してから使う
 */
function readSettingsTables_(ss) {
  const tables = {};
  Object.keys(SETTINGS_SHEETS).forEach(function (k) {
    const sh = ss.getSheetByName(SETTINGS_SHEETS[k]);
    tables[SETTINGS_SHEETS[k]] = sh ? sh.getDataRange().getValues() : null;
  });
  return tables;
}

/** 規約のファイルのシートを読んで、設定（cfg）を作る。おかしい値があればエラー（11_settings.js） */
function loadSettingsConfig_() {
  return configFromSettingsTables(readSettingsTables_(settingsSpreadsheet_()));
}

/** 今日の年（日本時間） */
function settingsTodayYear_() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
}

/**
 * メニュー「設定の読み込みを確かめる」：loadConfig_() で規約のファイルを読めるかを確かめる（読めなければエラーの文を出す）。
 * JA0 VHF 2026 の値との比較は出さない（2026-11-01、ユーザーが決めた。比べるのはテストだけ）。
 * あわせて、今の開催期間と、その気になる所（年が今年と違う・2日より長い。periodNotes）、
 * 規約のシートで文字でない形（数・true/false・日付）で入っているマスも出す
 */
function menuCheckSettings() {
  let body;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const basicNotes = [];
  if (!settingsBasicValue_(ss, 'コンテスト名')) basicNotes.push('「基本設定」の「コンテスト名」が空です');
  if (!(settingsBasicRows_(ss).filter(function (r) { return String(r[0]).trim() === '開催期間1'; })[0] || [])[1]) basicNotes.push('「基本設定」の「開催期間1」が空です（B 列に開始、C 列に終了）');
  let empty = false;
  try { empty = settingsTablesEmpty(readSettingsTables_(settingsSpreadsheet_())); } catch (e) { /* 開けないときは、下の読み込みのエラーに出る */ }
  if (empty) { // 規約がまだ入っていない（空のテンプレート）：エラーの一覧ではなく、読み込むことを知らせる
    SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput('<div style="font-family:sans-serif;font-size:14px;line-height:1.8">' +
      '<p><b>' + escapeHtml_(SETTINGS_EMPTY_MESSAGE) + '</b></p>' +
      (basicNotes.length ? '<ul>' + basicNotes.map(function (n) { return '<li>' + escapeHtml_(n) + '</li>'; }).join('') + '</ul>' : '') +
      '</div>').setWidth(560).setHeight(260), '設定の読み込みを確かめる');
    return;
  }
  try {
    const cfg = loadConfig_();
    const notes = periodNotes(cfg.periods, settingsTodayYear_());
    body = '<p><b>開催期間（「基本設定」の「開催期間1」〜）</b><br>' +
      cfg.periods.map(function (p) { return escapeHtml_(p.start + ' 〜 ' + p.end); }).join('<br>') + '</p>' +
      (notes.length ? '<ul class="w">' + notes.map(function (n) { return '<li>' + escapeHtml_(n) + '</li>'; }).join('') + '</ul>'
        : '<p class="n">開催期間に気になる所はありません。</p>');
    if ((cfg.sections || []).length) { // 開催部門（「規約_開催部門」）と、それぞれの開催期間
      body += '<p><b>開催部門（「規約_開催部門」）</b><br>' + cfg.sections.map(function (sec) {
        const cats = cfg.categories.filter(function (c) { return c.section === sec.name; }).map(function (c) { return c.code; });
        return escapeHtml_(sec.name + '：' + sec.periods.map(function (p) { return p.start + ' 〜 ' + p.end; }).join('、') +
          '（種目 ' + (cats.length ? cats.join('・') : 'なし') + '）');
      }).join('<br>') + '</p>';
    }
    // JA0 VHF 2026 の値との比較は出さない（ユーザーが決めた。2026-11-01。比べるのはテストだけ）
    body += '<p><b>規約のファイルを読めました。</b>（種目 ' + cfg.categories.length + '・バンド ' + cfg.bands.length + '）</p>';
  } catch (e) {
    body = '<p><b style="color:#c00">設定の読み込みでエラーになりました。</b></p><pre>' + escapeHtml_(e.message) + '</pre>';
  }
  if (basicNotes.length) body = '<ul class="w">' + basicNotes.map(function (n) { return '<li>' + escapeHtml_(n) + '</li>'; }).join('') + '</ul>' + body;
  let cells = [];
  try { cells = settingsNonTextCells(readSettingsTables_(settingsSpreadsheet_())); } catch (e) { /* 開けないときは、上のエラーに出ている */ }
  if (cells.length) {
    body += '<p><b>文字でない形で入っているマス（' + cells.length + ' か所）</b><br>' +
      '<span class="n">読み込みでは文字に直して使います。値が思ったものと違っていないか確かめてください。</span></p><ul>' +
      cells.slice(0, 200).map(function (c) { return '<li>' + escapeHtml_(c) + '</li>'; }).join('') +
      (cells.length > 200 ? '<li>…ほか ' + (cells.length - 200) + ' か所</li>' : '') + '</ul>';
  }
  const html = HtmlService.createHtmlOutput('<div style="font-family:sans-serif;font-size:13px;line-height:1.6">' +
    '<style>table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 6px;vertical-align:top;text-align:left}' +
    'th{background:#eee}.n{color:#555;font-size:12px}.w{color:#b45309;font-weight:bold}pre{white-space:pre-wrap}</style>' + body + '</div>') // escapeHtml_ は 95_gas_newyear.js
    .setWidth(760).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, '設定の読み込みを確かめる');
}

/** メニュー「規約のファイルを開く」：規約のファイルへのリンクを出す */
function menuOpenSettingsFile() {
  const ui = SpreadsheetApp.getUi();
  const url = basicValue_(SETTINGS_FILE_LABEL);
  if (!url) {
    ui.alert('「基本設定」の「' + SETTINGS_FILE_LABEL + '」にURLがありません。「1. 初期設定」を実行すると作られます。');
    return;
  }
  const html = HtmlService.createHtmlOutput('<div style="font-family:sans-serif;font-size:14px;line-height:1.8">' +
    '規約（バンド・種目・マルチなど）は、別のスプレッドシートに書いてあります。<br>' +
    '<a href="' + escapeHtml_(url) + '" target="_blank">規約のファイルを開く</a></div>').setWidth(400).setHeight(120); // escapeHtml_ は 95_gas_newyear.js
  ui.showModalDialog(html, '規約のファイル');
}


// ------------------------------------------------------------------ 規約のテキストファイル（指示書_規約のテキストファイル。申し送り No.171）
// 形・読み方は 11_settings.js の settingsTablesToText・settingsConfigFromText。README の「規約のテキストファイル」

/**
 * URL の中身（文字）を読む。GitHub のファイル（https://github.com/…/blob/…、raw.githubusercontent.com）、
 * ドライブに置いたファイル（…/d/ファイルのID/…、?id=…）、ほかの http・https の URL を読む
 */
function settingsFetchText_(url) {
  url = String(url || '').trim();
  if (!url) throw new Error('URL が空です');
  const gh = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(?:blob|raw)\/(.+)$/.exec(url.split(/[?#]/)[0]);
  if (gh) url = 'https://raw.githubusercontent.com/' + gh[1] + '/' + gh[2] + '/' + gh[3];
  if (/^https?:\/\/(drive|docs)\.google\.com\//.test(url)) {
    const id = /\/d\/([-\w]{25,})/.exec(url) || /[?&]id=([-\w]{25,})/.exec(url);
    if (!id) throw new Error('ドライブの URL から、ファイルの番号が読み取れません：' + url);
    return DriveApp.getFileById(id[1]).getBlob().getDataAsString('UTF-8');
  }
  if (!/^https?:\/\//.test(url)) throw new Error('URL は https:// で始めてください：' + url);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('読めませんでした（' + res.getResponseCode() + '）：' + url + '\nURL と、ファイルが公開されているかを確かめてください');
  return res.getContentText('UTF-8');
}

/** 「規約_基本」の「マルチ一覧（zLogのDAT）」の値（表から。なければ ''） */
function settingsZlogUrlOf_(tables) {
  const t = tables[SETTINGS_SHEETS.basic] || [];
  const head = (t[0] || []).map(settingsCellText);
  const a = head.indexOf('項目'), b = head.indexOf('値');
  for (let i = 1; i < t.length; i++) if (settingsCellText(t[i][a]) === 'マルチ一覧（zLogのDAT）') return settingsCellText(t[i][b]);
  return '';
}

/**
 * 規約のファイル sss の規約のシート8枚を、表 tables の中身で置き換える。シートの並び・色・プルダウン・守り・言葉（呼び方）は
 * 「1. 初期設定」と同じにする（setupSettingsSheets_・bookArrange_・bookProtect_）。戻り値：うまくいかなかったことの文の一覧
 */
function settingsWriteTables_(ss, sss, tables) {
  SETTINGS_TEXT_SHEETS.forEach(function (name) {
    const rows = tables[name];
    let sh = sss.getSheetByName(name) || sss.insertSheet(name);
    bookTry_(function () { sh.getDataRange().clearDataValidations(); });
    sh.clear();
    const w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const vals = rows.map(function (r) { const x = r.map(settingsCellText); while (x.length < w) x.push(''); return x; });
    sh.getRange(1, 1, vals.length, w).setNumberFormat('@').setValues(vals);
    sh.getRange(1, 1, 1, w).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  settingsSpreadsheetCache_ = null;
  setupSettingsSheets_(sss); // 足りない行・列、言葉（呼び方）、プルダウン
  const warnings = [];
  bookArrange_(sss, BOOK_SETTINGS, warnings); // 並び・色（91_gas_books.js）
  bookProtect_(ss, sss, BOOK_SETTINGS, warnings); // 守り
  return warnings;
}

/** メニュー「規約をテキストから読み込む」（管理用アカウントだけ） */
function menuImportSettingsText() {
  requireMailAccount_('規約をテキストから読み込む'); // 96_gas_intake.js
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sss = settingsSpreadsheet_();
  const ask = ui.prompt('規約をテキストから読み込む',
    '規約のテキストファイルの URL を入れてください。\n（GitHub のファイルの URL、またはドライブに置いたテキストファイルの URL）', ui.ButtonSet.OK_CANCEL);
  if (ask.getSelectedButton() !== ui.Button.OK) return;
  const url = String(ask.getResponseText() || '').trim();
  let read;
  try {
    read = settingsConfigFromText(settingsFetchText_(url)); // 11_settings.js。誤りがあれば、ここで止まる（何も書き換えない）
  } catch (e) {
    ui.alert('規約をテキストから読み込む', '読み込めませんでした。規約のファイルは書き換えていません。\n\n' + e.message, ui.ButtonSet.OK);
    return;
  }
  const stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
  const backupName = sss.getName() + '_読み込み前_' + stamp;
  const ok = ui.alert('規約をテキストから読み込む',
    '規約のファイル（' + sss.getName() + '）の規約のシート' + SETTINGS_TEXT_SHEETS.length + '枚を、読み込んだ中身で置き換えます。' +
    '今の中身は「' + backupName + '」として同じフォルダに残します。よろしいですか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  const before = settingsZlogUrlOf_(readSettingsTables_(sss));
  const file = DriveApp.getFileById(sss.getId());
  const parents = file.getParents();
  const backup = parents.hasNext() ? file.makeCopy(backupName, parents.next()) : file.makeCopy(backupName);
  const warnings = settingsWriteTables_(ss, sss, read.tables);
  try { logHistory_('規約をテキストから読み込みました（' + url + '。前の中身は「' + backupName + '」）'); } catch (e) { /* 履歴に書けなくても続ける */ }
  const next = [];
  if (settingsZlogUrlOf_(read.tables) !== before) next.push('「マルチ一覧（zLogのDAT）」の URL が変わりました。「2. マルチ一覧（zLogのDAT）を取り込む」を実行してください');
  if (read.cfg.clubCompetition) next.push('登録クラブ対抗を使います。「登録クラブ一覧を取り込む（JARLのWebページから）」を実行してください');
  next.push('「設定の読み込みを確かめる」で、開催期間（「基本設定」）と開催部門を確かめてください');
  let basicNote = '';
  try { settingsConfigWithBasic_(ss, JSON.parse(JSON.stringify(read.cfg))); } catch (e) { basicNote = '\n\n※「基本設定」に直す所があります：' + e.message; }
  ui.alert('規約をテキストから読み込む', '読み込みました（規約のシート ' + SETTINGS_TEXT_SHEETS.length + '枚・種目 ' + read.cfg.categories.length + '）。' +
    '前の中身は「' + backup.getName() + '」に残しました。\n\n続けてすること：\n・' + next.join('\n・') +
    (warnings.length ? '\n\n※' + warnings.join('\n※') : '') + basicNote, ui.ButtonSet.OK);
}

/** メニュー「規約をテキストに書き出す」（管理用アカウントだけ）：規約のシート8枚を、規約のファイルと同じフォルダにテキストファイルで書き出す */
function menuExportSettingsText() {
  requireMailAccount_('規約をテキストに書き出す'); // 96_gas_intake.js
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sss = settingsSpreadsheet_();
  const tables = readSettingsTables_(sss);
  SETTINGS_TEXT_SHEETS.forEach(function (name) { tables[name] = (tables[name] || [[]]).map(function (r) { return r.map(settingsCellText); }); });
  const contest = settingsBasicValue_(ss, 'コンテスト名') || 'コンテスト';
  const per = settingsPeriodsFor_(ss).periods[0];
  const year = per ? per.start.slice(0, 4) : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy');
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const text = settingsTablesToText(tables, ['コンテスト名：' + contest + '（' + year + '年）', '書き出した日：' + today + '（規約のファイル「' + sss.getName() + '」から）',
    '「#」で始まる行は説明で、読み込みでは読み飛ばします。値のわけなどを「#」の行で書いておけます。マスはタブで区切ります（形は README の「規約のテキストファイル」）。']);
  const name = '規約_' + contest.replace(/[\s\/\\:*?"<>|]+/g, '') + '_' + year + '.txt';
  const parents = DriveApp.getFileById(sss.getId()).getParents();
  const folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const out = folder.createFile(name, text, MimeType.PLAIN_TEXT);
  try { logHistory_('規約をテキストに書き出しました（' + name + '）'); } catch (e) { /* 履歴に書けなくても続ける */ }
  const html = HtmlService.createHtmlOutput('<div style="font-family:sans-serif;font-size:14px;line-height:1.8">' +
    '規約のシート' + SETTINGS_TEXT_SHEETS.length + '枚を書き出しました（規約のファイルと同じフォルダ）。<br>' +
    '<a href="' + escapeHtml_(out.getUrl()) + '" target="_blank">' + escapeHtml_(name) + '</a></div>').setWidth(460).setHeight(140);
  SpreadsheetApp.getUi().showModalDialog(html, '規約をテキストに書き出す');
}
// ===== 60_public_page.js =====
/**
 * 受付ページの中身（GASとNodeの両方で動く部分）
 *   ・「登録」の表から年の一覧を作り、表示する年を選ぶ
 *   ・審査用スプレッドシートの「受付履歴」から、載せる局（採用するログ）を選んで並べる
 *   ・ページのHTMLを作る
 * スプレッドシートを開く・ウェブアプリとして返す部分は 61_gas_public_page.js にある。
 *
 * 載せるのは、受付履歴の「採用」が ◯ で、状態が 受付済み・不備あり の行だけ（1局1行）。
 * 受付不可・締切後のログは、委員会が採用にしていても載せない（2026-10-20 ユーザーと決めた）。
 * 呼出符号・受付日時・種目・申告総得点のほかの項目（メールアドレス・不備の内容・委員会の扱いなど）は出さない。
 */

// 「登録」の表の見出し（審査ツールの 98_gas_public_register.js の PUBLIC_REGISTRY_HEADER と同じにする）
const PUBLIC_REGISTRY_COLUMNS = ['年', '開催回', 'コンテスト名', '審査用スプレッドシートのURL'];
const PUBLIC_SHEET_REGISTRY = '登録'; // 受付ページのスプレッドシートの「登録」シート（結果のページも、ここから年の一覧を読む）
// 受付ページのスプレッドシートの「設定」シート（テンプレートのURLと、結果ページのメニューが書く結果のページのURLを覚えておく）
const PUBLIC_SETTINGS_SHEET = '設定';
const PUBLIC_TEMPLATE_LABEL = 'テンプレートのURL';
// 審査用スプレッドシートの「基本設定」の「結果のページのURL」（案内メールで使う。申し送り No.56）。受付ページの「設定」シートでも同じ名前
const RESULT_PAGE_URL_LABEL = '結果のページのURL';
const RESULT_PAGE_URL_HELP = '結果のページのURL（案内メールの本文に入れる。結果ページのメニュー「1. 受付ページの登録表をつなぐ」で書かれる）';
// 審査用スプレッドシートの「基本設定」の「レコードのページのURL」（案内メールで使う。シートの整理 追記2）。受付ページの「設定」シートでも同じ名前
const RECORD_PAGE_URL_LABEL = 'レコードのページのURL';
const RECORD_PAGE_URL_HELP = 'コンテストレコードのページのURL（レコードのページのメニュー「2. 受付ページの登録表をつなぐ」で書かれる）';
// 結果ページ・レコードの「設定」シートの、受付ページのスプレッドシートの行（前の名前は「公開ページのスプレッドシート」。メニュー・ページで自動で付け替える）
const PUBLIC_BOOK_LABEL = '受付ページのスプレッドシート';
const PUBLIC_BOOK_LABEL_OLD = '公開ページのスプレッドシート';

// 審査用スプレッドシートのシート名と、受付履歴の読む列（受付担当の 96_gas_intake.js と同じ名前）
const PUBLIC_SRC_BASIC = '基本設定';
const PUBLIC_SRC_INTAKE = '受付履歴';
const PUBLIC_INTAKE_COLUMNS = ['受付日時', '呼出符号', '種目', '申告総得点', '状態', '採用'];
const PUBLIC_OK_STATUS = ['受付済み', '不備あり'];

const PUBLIC_NOTE_OPEN = '受付の状況です。ログを出し直した局は、採用するログの受付日時を出しています。<br>' +
  'メールを送信してから、このリストに載るまでに30分程度かかります。<br>' +
  '載っていない場合や、種目が違う場合は、委員会にお問い合わせください。';
// 「基本設定」の「メールでの受付」が「使わない」のとき（受付ページの提出だけ。シートの整理の追加 17.）は、メールの文を出さない
const PUBLIC_NOTE_OPEN_NO_MAIL = '受付の状況です。ログを出し直した局は、採用するログの受付日時を出しています。<br>' +
  'ログを提出してから、このリストに載るまでに30分程度かかります。<br>' +
  '載っていない場合や、種目が違う場合は、委員会にお問い合わせください。';
// 規約がまだ入っていないとき（空のテンプレートから作った年で、規約を読み込む前。申し送り No.182）
const PUBLIC_NOT_READY = '受付の準備中です。ログの入力・提出は、準備ができてから、このページでできるようになります。';
const PUBLIC_NOTE_CLOSED = 'Rawスコアは、参加者がサマリーシートに書いた申告総得点のままです。審査で変わることがあります。';

/** 「項目・値」の表のシートから、項目の値を読む（なければ空） */
function publicSheetValue(sh, label) {
  return publicBasicMap(sh.getDataRange().getDisplayValues())[label] || '';
}

/** 「項目・値・説明」の表のシートに値を書く（行がなければ足す） */
function publicSetBasic_(sh, label, value, help) {
  const v = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === label) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  // 審査のファイルの「基本設定」は4列（項目・値・終了日時・説明。シートの整理 段階1）。説明は4列目に入れる
  sh.appendRow(String((v[0] || [])[3] || '').trim() === '説明' ? [label, value, '', help] : [label, value, help]);
}

/**
 * 「項目・値」の表のシートで、前の名前の行を新しい名前に付け替える（シートの整理：「公開ページ」→「受付ページ」）。
 * 新しい名前の行がなければ、前の行の項目の名前を書き換える。あれば、新しい行の値が空のときだけ値を写し、前の行を消す。
 * 何かしたら true を返す
 */
function publicRenameRow(sh, oldLabel, newLabel) {
  const v = sh.getDataRange().getDisplayValues();
  let oi = -1, ni = -1;
  for (let i = 1; i < v.length; i++) {
    const k = String(v[i][0]).trim();
    if (k === oldLabel) oi = i; else if (k === newLabel) ni = i;
  }
  if (oi < 0) return false;
  if (ni < 0) { sh.getRange(oi + 1, 1).setValue(newLabel); return true; }
  if (!String(v[ni][1]).trim() && String(v[oi][1]).trim()) sh.getRange(ni + 1, 2).setValue(v[oi][1]);
  sh.deleteRow(oi + 1);
  return true;
}

/**
 * 「基本設定」などのシートの label の行にURLを書く（行がなければ作る）。url が空・同じURLが入っているときは何もしない。
 * ほかのURLが入っていれば書き換えない（委員が手で入れたものを残すため）。結果の文を返す（何もしなければ空）
 */
function publicWriteUrlIfEmpty(sh, label, url, help, what) {
  if (!url) return '';
  const cur = publicSheetValue(sh, label).trim();
  if (cur === url) return '';
  if (cur) return '\n（「' + label + '」には別のURLが入っているので、書き換えていません）';
  publicSetBasic_(sh, label, url, help);
  return '\n「' + label + '」に、' + what + 'を書きました。';
}

/**
 * 結果のページ・レコードのページのURLを書き込む（案内メールで使う。申し送り No.56・シートの整理 追記2）。
 * 結果ページ・レコードのページのメニュー「受付ページの登録表をつなぐ」から呼ぶ。
 *   ・受付ページのスプレッドシート pub の「設定」シート（受付ページで、あとから登録した年・テンプレートにも書かれるように）
 *   ・pub の「登録」にある各年の審査のファイルと、テンプレート（pub の「設定」の「テンプレートのURL」）の「基本設定」
 * どれも、行がなければ作り、ほかのURLが入っていれば書き換えない。url が空（ウェブアプリとしてまだ公開していない）なら書かない。
 * open(id) でスプレッドシートを開く（SpreadsheetApp.openById）。結果の文を返す
 */
function publicWriteUrlEverywhere(pub, url, label, help, what, open) {
  if (!url) return what + 'は、まだ書いていません。ウェブアプリとして公開（デプロイ）してから、もう一度このメニューを実行してください。';
  let ps = pub.getSheetByName(PUBLIC_SETTINGS_SHEET);
  if (!ps) {
    ps = pub.insertSheet(PUBLIC_SETTINGS_SHEET);
    ps.getRange(1, 1, 1, 3).setValues([['項目', '値', '説明']]).setFontWeight('bold');
  }
  publicSetBasic_(ps, label, url, what + '（メニューで書かれる。受付ページで登録するときに「基本設定」に書く）');
  const targets = parsePublicRegistry(pub.getSheetByName(PUBLIC_SHEET_REGISTRY).getDataRange().getDisplayValues())
    .map(function (e) { return { name: e.year + ' 年', url: e.url }; });
  const tmpl = publicSheetValue(ps, PUBLIC_TEMPLATE_LABEL);
  if (tmpl) targets.push({ name: 'テンプレート', url: tmpl });
  const lines = targets.map(function (t) {
    try {
      const m = /[-\w]{25,}/.exec(String(t.url || ''));
      if (!m) return t.name + '：URLが読み取れません';
      const bs = open(m[0]).getSheetByName(PUBLIC_SRC_BASIC);
      if (!bs) return t.name + '：「' + PUBLIC_SRC_BASIC + '」シートがありません';
      const msg = publicWriteUrlIfEmpty(bs, label, url, help, what).replace(/^\n/, '');
      return t.name + '：' + (msg || '入っています');
    } catch (err) {
      return t.name + '：書けませんでした（' + (err && err.message || err) + '。「ファイルの場所など」の行は、管理用アカウントだけが書けます）';
    }
  });
  return '「基本設定」の「' + label + '」（' + url + '）\n' + lines.join('\n') +
    (tmpl ? '' : '\n※テンプレートのURLが分かりません。受付ページのメニュー「2. 審査用スプレッドシートを登録する」でテンプレートを登録すると、テンプレートにも書かれます');
}

/**
 * 受付ページ・結果ページ・コンテストレコードのメニューを、そのスプレッドシートの持ち主だけが使えるようにする
 * （シートの整理の追加 3.。管理用アカウント＝持ち主の決まりのため。この3つは別のスクリプトで requireMailAccount_ が使えない）。
 * 持ち主のときは true。違うとき・分からないときは、画面に知らせて false を返す（何もしない）
 */
function publicOwnerOnly_(what) {
  const msg = publicOwnerProblem_(what);
  if (!msg) return true;
  SpreadsheetApp.getUi().alert(msg);
  return false;
}

/** 実行した人がこのスプレッドシートの持ち主なら空、違う・分からないときは知らせる文（画面から呼ぶ所は、この文を返す） */
function publicOwnerProblem_(what) {
  let owner = '', me = '';
  try { const o = SpreadsheetApp.getActiveSpreadsheet().getOwner(); owner = o ? String(o.getEmail() || '') : ''; } catch (err) { owner = ''; }
  try { me = String(Session.getActiveUser().getEmail() || ''); } catch (err) { me = ''; }
  if (owner && me && owner.toLowerCase() === me.toLowerCase()) return '';
  return '「' + what + '」は、このスプレッドシートの持ち主（管理用アカウント' + (owner ? '：' + owner : '') + '）だけが使えます。\n' +
    (me ? '今のアカウントは ' + me + ' です。' : '今のアカウントが分かりませんでした。') + '持ち主のアカウントで開いて、もう一度実行してください。';
}

/**
 * スプレッドシートを作ったときにできる、何も入っていない「シート1」（英語の画面で作ったときは「Sheet1」）を消す
 * （シートの整理の追加 11.。審査のファイルの 91_gas_books.js の bookArrange_ と同じ考え方）。
 * 必要なシートを作ってから呼ぶ（シートが0枚にならないよう、ほかのシートがあるときだけ消す）。何か書いてあれば残す
 */
function publicRemoveBlankSheet1_(ss) {
  ss.getSheets().forEach(function (sh) {
    if (/^(シート|Sheet)1$/.test(sh.getName()) && sh.getLastRow() === 0 && sh.getLastColumn() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

// 自動で受け取ったアドレスを使うときの知らせ（申し送り No.133）
const PUBLIC_URL_CHECK_NOTE = 'このアドレスは自動で受け取ったものです。Apps Script の画面の「デプロイ」→「デプロイを管理」に出ているウェブアプリのURLと同じか確かめてください。';

/**
 * このページ（ウェブアプリ）のアドレス（申し送り No.133）。
 * スプレッドシートのメニューから ScriptApp.getService().getUrl() を呼ぶと、実際に表示できるアドレスと違うものが返ることがある
 * （「/macros/s/」と「/exec」の間が違う。Apps Script の V8 で知られている動き。ページを表示しているときではなく、メニューから呼ぶため）。
 * そこで、審査のファイルの「基本設定」に書いてあるそのページのURL（ユーザーが開けることを確かめたもの）を先に使う。
 *   pub：受付ページのスプレッドシート（「登録」の表と「設定」がある）。label：「基本設定」の行の名前（受付ページのURL など）
 *   auto：ScriptApp.getService().getUrl() の値。open(id)：スプレッドシートを開く
 * 「登録」の新しい年から順に「基本設定」を見て、ウェブアプリのURLの形のものがあれば使う。なければテンプレートの「基本設定」。
 * どこにもなければ auto を使う（auto: true。画面に PUBLIC_URL_CHECK_NOTE を出す）。戻り値 {url, auto, from（どこから読んだか）}
 */
function publicPageUrl_(pub, label, auto, open) {
  const ok = function (v) { return /^https:\/\/script\.google\.com\/\S+\/exec$/.test(String(v || '').trim()); };
  const read = function (url) {
    const m = /[-\w]{25,}/.exec(String(url || ''));
    if (!m) return '';
    try {
      const bs = open(m[0]).getSheetByName(PUBLIC_SRC_BASIC);
      return bs ? String(publicSheetValue(bs, label) || '').trim() : '';
    } catch (err) { return ''; }
  };
  try {
    const reg = pub && pub.getSheetByName(PUBLIC_SHEET_REGISTRY);
    const list = reg ? parsePublicRegistry(reg.getDataRange().getDisplayValues()) : [];
    for (let i = 0; i < list.length; i++) {
      const v = read(list[i].url);
      if (ok(v)) return { url: v, auto: false, from: list[i].year + ' 年の「基本設定」の「' + label + '」' };
    }
    const ps = pub && pub.getSheetByName(PUBLIC_SETTINGS_SHEET);
    const v = read(ps ? publicSheetValue(ps, PUBLIC_TEMPLATE_LABEL) : '');
    if (ok(v)) return { url: v, auto: false, from: 'テンプレートの「基本設定」の「' + label + '」' };
  } catch (err) { /* 読めなければ、自動で受け取ったものを使う */ }
  return { url: auto || '', auto: true, from: '' };
}

/**
 * 埋め込み用のHTML（ほかのページに枠で入れる1行。申し送り No.123）。url：ウェブアプリのURL（?page=form などを付けてもよい）
 * 委員がそのままコピーして貼るので、短く、むずかしくない形にする。高さは数字を変えて合わせられる
 */
function publicEmbedTag(url, height) {
  return '<iframe src="' + String(url || '').replace(/"/g, '%22') + '" width="100%" height="' + (height || 1500) + '" style="border:0"></iframe>';
}

/**
 * 「埋め込み用のHTMLを出す」の画面（受付ページ・結果ページ・コンテストレコードで使う）。
 * items：[{name（何のページか）, url}]。行ごとに、コピーして貼る1行と「コピーする」のボタンを出す
 */
function publicEmbedDialogHtml(items, note) {
  const e = publicEscape;
  return '<!DOCTYPE html><html><head><base target="_top"><style>body{font-family:sans-serif;font-size:14px;margin:0 4px;line-height:1.6}' +
    'h3{font-size:15px;margin:14px 0 4px}textarea{width:100%;box-sizing:border-box;font-family:monospace;font-size:13px;height:58px}' +
    'button{margin-top:4px;padding:4px 14px;font-size:14px}.ok{color:#245c24;margin-left:8px}ul{padding-left:20px;margin:6px 0}</style></head><body>' +
    '<p>下の1行をコピーして、委員会のホームページなどに貼ると、このページがその中に出ます（上に出る警告の帯は出ません）。</p>' +
    '<ul><li>Googleサイト：「挿入」→「埋め込む」→「埋め込みコード」に貼る</li>' +
    '<li>ブログ：記事を「HTMLの編集」にして貼る（アメーバブログ・note など、貼れないブログもあります）</li>' +
    '<li>高さ（height="1500" の数字）は、ページに合わせて変えてかまいません</li></ul>' +
    (note ? '<p style="background:#fff8e1;border-left:4px solid #e0b000;padding:6px 10px">' + e(note) + '</p>' : '') +
    items.map(function (x, i) {
      return '<h3>' + e(x.name) + '</h3><textarea id="t' + i + '" readonly onclick="this.select()">' + e(publicEmbedTag(x.url)) + '</textarea>' +
        '<button onclick="cp(' + i + ')">コピーする</button><span class="ok" id="m' + i + '"></span>';
    }).join('') +
    '<script>function cp(i){var t=document.getElementById("t"+i),m=document.getElementById("m"+i);t.focus();t.select();var ok=false;' +
    'try{ok=document.execCommand("copy");}catch(e){ok=false;}' +
    'm.textContent=ok?"コピーしました":"選んだ状態にしました。Ctrl＋C（スマートフォンは長押し）でコピーしてください";}</script></body></html>';
}

/** HTMLの特殊文字を置き換える */
function publicEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/**
 * 「登録」の表（見出しの行を含む2次元の配列）から、年の一覧を作る。新しい年が先。
 * 年が4桁の数字でない行・URLのない行は使わない。同じ年が2行あれば、下の行を使う
 * 戻り値: [{year, num, name, url}]
 */
function parsePublicRegistry(values) {
  const byYear = {};
  (values || []).slice(1).forEach(function (r) {
    const year = String(r[0] == null ? '' : r[0]).trim();
    const url = String(r[3] == null ? '' : r[3]).trim();
    if (!/^\d{4}$/.test(year) || !url) return;
    byYear[year] = { year: year, num: String(r[1] == null ? '' : r[1]).trim().replace(/^第|回$/g, ''),
      name: String(r[2] == null ? '' : r[2]).trim(), url: url };
  });
  return Object.keys(byYear).sort().reverse().map(function (y) { return byYear[y]; });
}

/** 表示する年を選ぶ。year の指定がなければ（または登録にない年なら null）いちばん新しい年 */
function pickPublicYear(list, year) {
  const y = String(year == null ? '' : year).trim();
  if (!y) return list[0] || null;
  return list.filter(function (e) { return e.year === y; })[0] || null;
}

/**
 * 日時の文字を、JSTとしてミリ秒にする。読めなければ null
 * 読める形：2026-06-10 23:59、2026/6/10 23:59:00、2026-06-10 2359、2026年6月10日 23時59分、日付だけ（0:00）。
 * 全角の数字・記号・空白も読む（「基本設定」に手で入れた値のため。受付の jstStringToMinutes が読む形はすべて読む）
 * 後ろの「JST」「、JST」「（JST）」は読み飛ばす（説明の例「2026-06-10 23:59、JST」を、そのまま写したときのため）
 */
function publicJstToMs(s) {
  const t = String(s == null ? '' : s)
    .replace(/[０-９：／－]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[\s、,，]*[（(]?\s*JST\s*[)）]?\s*$/i, '').replace(/[年月]/g, '-').replace(/日/g, ' ').replace(/時/g, ':').replace(/分/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):?(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +(m[4] || 0) > 24 || +(m[5] || 0) > 59) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - 9 * 3600000;
}

/** ミリ秒を JST の「YYYY-MM-DD hh:mm」にする */
function publicMsToJst(ms) {
  const d = new Date(ms + 9 * 3600000);
  const z = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate()) + ' ' + z(d.getUTCHours()) + ':' + z(d.getUTCMinutes());
}

/** 「基本設定」の表（項目・値）を {項目: 値} にする */
function publicBasicMap(values) {
  const o = {};
  (values || []).slice(1).forEach(function (r) { if (r[0]) o[String(r[0]).trim()] = String(r[1] == null ? '' : r[1]).trim(); });
  return o;
}

/** 受付日時を「YYYY-MM-DD hh:mm」にそろえる（秒は出さない） */
function publicMinute(s) {
  const t = String(s == null ? '' : s).trim();
  const m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[ T]+(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const z = function (n) { return (String(n).length < 2 ? '0' : '') + n; };
  return m[1] + '-' + z(+m[2]) + '-' + z(+m[3]) + ' ' + z(+m[4]) + ':' + m[5];
}

/**
 * 受付履歴（見出しの行を含む2次元の配列）から、載せる局を選ぶ。
 * 列は見出しの名前で探す。足りない列があればエラー
 * 戻り値: {stations: [{call, received, category, score}]（呼出符号の順）, lastReceived: 最後にログが届いた受付日時}
 */
function selectPublicStations(values) {
  const head = (values && values[0] || []).map(function (h) { return String(h).trim(); });
  const col = {};
  PUBLIC_INTAKE_COLUMNS.forEach(function (h) {
    col[h] = head.indexOf(h);
    if (col[h] < 0) throw new Error('「' + PUBLIC_SRC_INTAKE + '」シートに「' + h + '」の列がありません');
  });
  const cell = function (r, h) { return String(r[col[h]] == null ? '' : r[col[h]]).trim(); };
  // 「開催部門」の列（受付担当の No.152。開催部門のあるコンテストは、採用を「局と開催部門」ごとに決めるので、同じ局に ◯ が2つ以上付く）
  const secCol = head.indexOf('開催部門');
  const secOf = function (r) { return secCol >= 0 ? String(r[secCol] == null ? '' : r[secCol]).trim() : ''; };
  let last = '';
  const seen = {}, stations = [];
  values.slice(1).forEach(function (r) {
    const received = cell(r, '受付日時');
    if (received && publicMinute(received) > last) last = publicMinute(received);
    const call = cell(r, '呼出符号').toUpperCase();
    if (!call || !/^(◯|○|〇)$/.test(cell(r, '採用'))) return;
    if (PUBLIC_OK_STATUS.indexOf(cell(r, '状態')) < 0) return;
    // 1局1行（開催部門のあるコンテストは、1局・1開催部門で1行。受付局リストを作り直す前の、古い ◯ が残っていたときのため）
    const key = call + '|' + secOf(r);
    if (seen[key]) return;
    seen[key] = true;
    stations.push({ call: call, section: secOf(r), received: publicMinute(received), category: cell(r, '種目'), score: cell(r, '申告総得点') });
  });
  stations.sort(function (a, b) {
    return a.call < b.call ? -1 : a.call > b.call ? 1 : a.section < b.section ? -1 : a.section > b.section ? 1 : 0;
  });
  return { stations: stations, lastReceived: last, hasSection: stations.some(function (x) { return x.section; }) };
}

/** 受付局数（同じ局が開催部門ごとに2行以上あっても1局と数える） */
function publicStationCount(stations) {
  const seen = {};
  (stations || []).forEach(function (s) { seen[s.call] = true; });
  return Object.keys(seen).length;
}

/** 申告総得点を表示用にする（数字だけなら3桁ごとにカンマを入れる。ほかは書かれたまま） */
function publicScore(s) {
  const t = String(s == null ? '' : s).trim();
  return /^\d+$/.test(t) ? t.replace(/\B(?=(\d{3})+$)/g, ',') : t;
}

/**
 * ページに出すものをまとめる
 * a: {list（年の一覧）, entry（表示する年）, basic（基本設定の表）, intake（受付履歴の表）, now（ミリ秒）}
 * 戻り値: buildPublicPageHtml に渡すもの
 */
function buildPublicData(a) {
  const basic = publicBasicMap(a.basic);
  const sel = selectPublicStations(a.intake);
  const deadline = basic['受付締切'] || '';
  const dms = publicJstToMs(deadline);
  if (deadline && dms == null) throw new Error('「基本設定」の「受付締切」が読み取れません：「' + deadline + '」（例：2026-06-10 23:59）');
  const num = a.entry.num || String(basic['開催回'] || '').replace(/^第|回$/g, '');
  const name = a.entry.name || basic['コンテスト名'] || '';
  return {
    years: a.list.map(function (e) { return e.year; }), year: a.entry.year,
    title: ((num ? '第' + num + '回 ' : '') + name).trim(), name: name, // コンテスト名が空でも後ろに空白を残さない（No.182）
    // ページの下に出す主催者。「基本設定」の「主催者」（審査担当が足す。申し送り No.30）。空なら「コンテスト名＋委員会」
    organizer: basic['主催者'] || (name ? name + '委員会' : ''),
    closed: dms != null && a.now > dms, deadline: dms != null ? publicMsToJst(dms) : '',
    // 「メールでの受付」（受付担当の INTAKE_MAIL_USE_LABEL）：「使わない」「しない」なら false。空・行がないときは使う
    mailUse: !/^(使わない|しない)$/.test(String(basic['メールでの受付'] || '').trim()),
    lastReceived: sel.lastReceived, stations: sel.stations, hasSection: !!sel.hasSection
  };
}

/** ページのタイトル（ブラウザのタブに出る） */
function publicPageTitle(d) {
  return (d && d.title ? d.title + ' ' : '') + '受付局リスト';
}

/**
 * ページのHTML（<body> の中身と <style>）を作る
 * d: buildPublicData の戻り値。baseUrl: 受付ページのURL（年のリンクに使う）
 */
function buildPublicPageHtml(d, baseUrl) {
  const e = publicEscape;
  const H = [publicStyle_()]; // ほかの年へのリンクは出さない（いちばん新しい年だけを出す。シートの整理の追加 16.）
  H.push('<h1>' + e(publicPageTitle(d)) + '</h1>');
  H.push('<div class="meta"><span class="state' + (d.closed ? ' end">受付終了' : '">受付中') + '</span>' +
    (d.deadline ? '　受付締切：' + e(d.deadline) : '') + '</div>');
  H.push('<div class="meta">最終更新：' + (d.lastReceived ? e(d.lastReceived) : '（まだ受付がありません）') +
    '　／　受付局数：' + publicStationCount(d.stations) + ' 局' + (d.hasSection ? '（のべ ' + d.stations.length + ' 件）' : '') + '</div>');
  H.push('<div class="note">' + (d.notReady ? publicEscape(PUBLIC_NOT_READY) : d.closed ? PUBLIC_NOTE_CLOSED : d.mailUse === false ? PUBLIC_NOTE_OPEN_NO_MAIL : PUBLIC_NOTE_OPEN) + '</div>');
  // 電子ログのアップロードとログ入力フォームへの切り替え（受付期間中だけ。formReady はフォームが使えるときに 61_gas_public_page.js が入れる）。
  // ページは移らずに、同じページの中の見える中身を入れ替える（buildPublicTabsHtml。申し送り No.129）
  if (publicShowForms(d)) {
    H.push('<div class="form-link"><a class="tablink" data-tab="upload" role="button" tabindex="0">電子ログのファイルを提出する</a>' +
      '<span class="hint">（パソコンでロギングした方）</span></div>');
    H.push('<div class="form-link"><a class="tablink" data-tab="form" role="button" tabindex="0">ログを入力して提出する</a>' +
      '<span class="hint">（紙でロギングした方）</span></div>');
  }
  if (!d.stations.length) {
    H.push('<p>受け付けた局は、まだありません。</p>');
  } else {
    // 開催部門のあるコンテスト（新潟など）は、呼出符号の右に「部門」（同じ局が開催部門ごとの行に出る。申し送り No.148 の 2b・No.152）
    const sh = d.hasSection ? '<th>部門</th>' : '';
    H.push('<table><thead><tr>' + (d.closed ? '<th>呼出符号</th>' + sh + '<th>種目</th><th class="n">Rawスコア</th>'
      : '<th>呼出符号</th>' + sh + '<th>受付日時</th><th>種目</th>') + '</tr></thead><tbody>');
    d.stations.forEach(function (s) {
      H.push('<tr><td>' + e(s.call) + '</td>' + (d.hasSection ? '<td>' + e(s.section) + '</td>' : '') + (d.closed
        ? '<td>' + e(s.category) + '</td><td class="n">' + e(publicScore(s.score)) + '</td>'
        : '<td>' + e(s.received) + '</td><td>' + e(s.category) + '</td>') + '</tr>');
    });
    H.push('</tbody></table>');
  }
  if (d.organizer) H.push('<div class="foot">' + e(d.organizer) + '</div>');
  return '<div class="page">' + H.join('\n') + '</div>';
}

/** ログ入力フォーム・アップロードのボタンを出すか（受付締切の前で、フォームが使えるとき。締め切りの後などは出さない） */
function publicShowForms(d) {
  return !!(d && d.formReady && !d.closed && !d.notReady);
}

/**
 * 受付ページ（1つのページ）。受付局リスト・ログ入力フォーム・電子ログのファイルの提出を、上のボタン（タブ）で切り替える。
 * ページは移らずに、見える中身を入れ替える（埋め込んだ枠の外に出ない・警告の帯が出ない。申し送り No.129）
 * a: {list（受付局リストのページ。buildPublicPageHtml）, form（ログ入力フォームのページ）, upload（アップロードのページ）,
 *     showForms（フォーム・アップロードのボタンを出すか）, initial（はじめに見せるもの：'list'・'form'・'upload'）}
 * showForms が false でも、initial に選んだもの（?page=form などで開いたとき）のボタンは出す（委員が締め切りの後に紙ログを入れるため）
 */
function buildPublicTabsHtml(a) {
  const initial = a.initial === 'form' || a.initial === 'upload' ? a.initial : 'list';
  const tabs = [['list', '受付局リスト', a.list], ['form', 'ログを入力して提出する', a.form], ['upload', '電子ログのファイルを提出する', a.upload]];
  const shown = function (k) { return k === 'list' || k === initial || a.showForms; };
  return publicStyle_() + publicTabsStyle_() +
    '<div class="tabs" role="tablist">' + tabs.map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t[0] + '"' + (t[0] === initial ? ' class="on"' : '') + (shown(t[0]) ? '' : ' hidden') + '>' +
        publicEscape(t[1]) + '</button>';
    }).join('') + '</div>' +
    tabs.map(function (t) { return '<div class="tabp" id="tab-' + t[0] + '"' + (t[0] === initial ? '' : ' hidden') + '>' + t[2] + '</div>'; }).join('') +
    '<script>(' + publicTabsClient_.toString() + ')(' + JSON.stringify(initial) + ');</script>';
}

/** タブの切り替え（ブラウザで動く）。data-tab を持つもの（上のボタン・中身の中のリンク）を押すと、その中身を見せる */
function publicTabsClient_(initial) {
  function show(t) {
    ['list', 'form', 'upload'].forEach(function (x) {
      var p = document.getElementById('tab-' + x), b = document.querySelector('.tabs [data-tab="' + x + '"]');
      if (p) p.hidden = x !== t;
      if (b) { if (x === t) { b.className = 'on'; b.hidden = false; } else b.className = ''; }
    });
  }
  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-tab]') : null;
    if (!el) return;
    ev.preventDefault();
    show(el.getAttribute('data-tab'));
    window.scrollTo(0, 0);
  });
  document.addEventListener('keydown', function (ev) { // リンクの形のものも、Enter で押せるように
    if (ev.key === 'Enter' && ev.target && ev.target.getAttribute && ev.target.getAttribute('data-tab') && ev.target.tagName === 'A') ev.target.click();
  });
  show(initial);
}

function publicTabsStyle_() {
  return '<style>' +
    '.tabs{display:flex;flex-wrap:wrap;gap:4px;max-width:1100px;margin:8px auto 0;padding:0 16px;box-sizing:border-box;border-bottom:2px solid #1d4f91}' +
    '.tabs button{flex:0 1 auto;padding:8px 14px;font-size:14px;border:1px solid #c5d3e8;border-bottom:0;border-radius:6px 6px 0 0;background:#f4f7fb;color:#1d4f91;cursor:pointer;margin:0}' +
    '.tabs button.on{background:#1d4f91;color:#fff;font-weight:bold;border-color:#1d4f91}' +
    '.tabs button[hidden],.tabp[hidden]{display:none}' +
    '@media (max-width:600px){.tabs{padding:0 8px}.tabs button{flex:1 1 30%;padding:8px 4px;font-size:13px}}' +
    '</style>';
}

/** 表示できないときのページ（くわしい理由は出さない）。heading：ページの見出し（空なら「受付局リスト」） */
function buildPublicErrorHtml(message, years, year, baseUrl, heading) {
  return '<div class="page">' + publicStyle_() + publicYearLinks_(years || [], year, baseUrl) +
    '<h1>' + publicEscape(heading || '受付局リスト') + '</h1><p>' + publicEscape(message) + '</p></div>';
}

/**
 * ページの上の、年のリンク（結果のページで使う）。見出しは「年ごとの記録」、今見ている年は太字でリンクにしない（シートの整理の追加 16.）。
 * リンクはページを移らずに、同じページの中でその年の結果に入れ替える（data-year。結果ページの resultYearClient_。2026-10-28 から。
 * 埋め込んだ枠の外に出ない・警告の帯が出ない）。受付ページは、ほかの年へのリンクを出さない
 */
function publicYearLinks_(years, year, baseUrl) {
  if (!years.length) return '';
  return '<div class="years">年ごとの記録：' + years.map(function (y) {
    if (y === year) return '<b>' + publicEscape(y) + '</b>';
    return '<a class="yearlink" data-year="' + publicEscape(y) + '" role="button" tabindex="0">' + publicEscape(y) + '</a>';
  }).join('') + '</div>';
}

function publicStyle_() {
  return '<style>' +
    'body{margin:0;background:#fff;color:#222;font-family:sans-serif}' +
    // パソコンの幅では広く使う（埋め込んだ枠は横幅100%のため。申し送り No.129）。スマートフォンでは画面の幅に合わせる
    '.page{max-width:1100px;margin:0 auto;padding:12px 16px 24px;box-sizing:border-box}' +
    '.years{font-size:14px;margin-bottom:8px}.years a{color:#1d4f91;margin-right:12px;text-decoration:underline;cursor:pointer}.years b{margin-right:12px}' +
    'h1{font-size:20px;margin:6px 0;line-height:1.4}' +
    '.meta{font-size:14px;color:#555;margin:4px 0}' +
    '.state{display:inline-block;font-size:13px;padding:2px 8px;border-radius:10px;background:#e3f1e3;color:#245c24}' +
    '.state.end{background:#f3e7d6;color:#7a4a10}' +
    '.note{font-size:13px;background:#f8f8f8;border-left:4px solid #bbb;padding:6px 10px;margin:10px 0;line-height:1.6}' +
    'table{border-collapse:collapse;width:100%;font-size:15px}' +
    'th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;white-space:nowrap}' +
    'th{background:#f2f5f9}.n{text-align:right}' +
    '.foot{font-size:12px;color:#666;margin-top:12px}' +
    '.form-link{margin:10px 0;font-size:15px}.form-link a{color:#1d4f91;font-weight:bold}.form-link .hint{font-size:12px;color:#666;margin-left:6px}' +
    'a.tablink{color:#1d4f91;text-decoration:underline;cursor:pointer}' +
    '</style>';
}
// ===== 61_gas_public_page.js =====
/**
 * 受付ページ（GAS専用）
 *
 * 受付ページ専用のスプレッドシート（「受付ページ」）のスクリプト。ウェブアプリとして一度だけ公開する。
 * 以後プログラムを直したときは「デプロイを管理」で新しいバージョンにする（URLは変わらない）。
 *
 *   受付ページのスプレッドシート
 *     登録  ← 年・開催回・コンテスト名・審査用スプレッドシートのURL（1年1行）
 *
 * ページを開くと（doGet）、「登録」のいちばん新しい年の審査用スプレッドシートの「基本設定」と「受付履歴」を読んで、受付局リストを出す。
 * ほかの年は出さない（前の年は結果のページで見る。シートの整理の追加 16.。?year= を付けても、いちばん新しい年を出す）。
 * 読んだ結果は5分だけ覚えておく（開くたびにスプレッドシートを読まないように）。
 * 受付局リスト・ログ入力フォーム・電子ログのファイルのアップロード（63_gas_public_form.js）は1つのページにまとめ、上のボタン（タブ）で
 * 切り替える（ページを移らない。埋め込んだ枠の外に出ない。申し送り No.129）。?page=form・?page=upload で開くと、それを選んだ状態で開く。
 *
 * 毎年の登録は、審査ツールの「新年度の準備」が自動で行う（98_gas_public_register.js の registerPublicYear_）。
 * そのため、テンプレートの「基本設定」の「受付ページのスプレッドシート」に、このスプレッドシートのURLを入れておく
 * （メニュー「審査用スプレッドシートを登録する」でテンプレートのURLを入れると、自動で書く）。
 * メニューは、このスプレッドシートの持ち主（管理用アカウント）だけが使える（シートの整理の追加 3.。publicOwnerOnly_）。
 */

const PUBLIC_REGISTRY_LABEL_IN_JUDGE = '受付ページのスプレッドシート'; // 審査用スプレッドシートの「基本設定」の項目（シートの整理 段階1で名前を付け替えた。設定担当、申し送り No.75）
const PUBLIC_PAGE_URL_LABEL = '受付ページのURL'; // 審査用スプレッドシートの「基本設定」の項目（送信担当の GUIDE_PUBLIC_URL_LABEL と同じ名前）（シートの整理 段階1で名前を付け替えた。設定担当、申し送り No.75）
const PUBLIC_CACHE_SECONDS = 300;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('受付ページ')
    .addItem('1. 登録の表を作る', 'menuPublicSetup')
    .addItem('2. 審査用スプレッドシートを登録する（URLを入れる）', 'menuPublicRegister')
    .addItem('表示を確かめる（いちばん新しい年）', 'menuPublicPreview')
    .addItem('すぐに新しい内容にする（覚えた表示を消す）', 'menuPublicClearCache')
    .addItem('埋め込み用のHTMLを出す', 'menuPublicEmbed')
    .addToUi();
}

/** ウェブアプリとして開かれたとき */
function doGet(e) {
  const q = e && e.parameter || {};
  // ログ入力フォーム（?page=form）と電子ログのアップロード（?page=upload）も同じページの中（それを選んだ状態で開く）
  const p = publicPage_(q.page);
  // ほかのページ（委員会のホームページなど）に枠（iframe）で埋め込めるようにする（警告の帯を出さない方法を試すため。申し送り No.97。
  // 案A。作り込みはユーザーとPL担当が決めてから）。ページは見るだけのものと提出のフォームで、委員の合言葉などはページに出さない
  return HtmlService.createHtmlOutput(p.html).setTitle(p.title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 受付ページ（いちばん新しい年）。受付局リスト・ログ入力フォーム・アップロードを1つのページにまとめる（buildPublicTabsHtml）。
 * tab：はじめに見せるもの（'form'・'upload'。ほかは受付局リスト）。戻り値 {html, title}
 */
function publicPage_(tab) {
  const t = tab === 'form' || tab === 'upload' ? tab : 'list';
  const forms = publicFormsPanels_();
  const list = publicListPage_(!!forms.notReady); // 規約がまだ入っていなければ「受付の準備中です」（No.182）
  return { title: t === 'form' ? forms.formTitle : t === 'upload' ? forms.uploadTitle : list.title,
    html: buildPublicTabsHtml({ list: list.html, form: forms.form, upload: forms.upload, showForms: !!list.showForms, initial: t }),
    error: list.error || (t !== 'list' ? forms.error : undefined) };
}

/** 受付局リスト（いちばん新しい年）。戻り値 {html, title, showForms（フォーム・アップロードのボタンを出すか）} */
function publicListPage_(notReady) {
  const baseUrl = publicServiceUrl_();
  let list = [];
  try {
    list = parsePublicRegistry(publicRegistrySheet_().getDataRange().getDisplayValues());
    const entry = list[0] || null;
    if (!entry) return { title: '受付局リスト', html: buildPublicErrorHtml('受付局リストは、まだありません。', [], '', baseUrl) };
    const cache = CacheService.getScriptCache();
    const key = 'public:' + entry.year + (notReady ? ':notready' : '');
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);
    const ss = SpreadsheetApp.openById(publicFileId_(entry.url));
    // 受付履歴はメールのファイル（シートの整理 段階2。審査のファイルの「基本設定」の「メールのファイル」から開く。91_gas_books.js）
    const basic = ss.getSheetByName(PUBLIC_SRC_BASIC), intake = bookFor_(ss, BOOK_MAIL).getSheetByName(PUBLIC_SRC_INTAKE);
    if (!basic || !intake) throw new Error('審査のファイルの「' + PUBLIC_SRC_BASIC + '」か、メールのファイルの「' + PUBLIC_SRC_INTAKE + '」のシートがありません：' + entry.url);
    const d = buildPublicData({ list: list, entry: entry, basic: publicBasicValues_(ss, basic),
      intake: intake.getDataRange().getDisplayValues(), now: Date.now() });
    d.formReady = typeof loadConfigFor_ === 'function'; // 規約の読み込み（設定担当 No.37）が入るまでは、フォームのリンクを出さない
    d.notReady = !!notReady;
    const out = { title: publicPageTitle(d), html: buildPublicPageHtml(d, baseUrl), showForms: publicShowForms(d) };
    try { cache.put(key, JSON.stringify(out), PUBLIC_CACHE_SECONDS); } catch (err) { /* 大きすぎて覚えられないときは、毎回作る */ }
    return out;
  } catch (err) {
    console.error(err && err.stack || err); // くわしい理由は、Apps Script の「実行数」で見る（ページには出さない）
    return { title: '受付局リスト', html: buildPublicErrorHtml('ただいま表示できません。しばらくしてから、もう一度開いてください。', [], '', baseUrl),
      error: String(err && err.message || err) };
  }
}

/**
 * 「基本設定」の表を読む。日付として入っているセル（受付締切に 2026-06-10 23:59 と入れると、日付になることがある）は、
 * 表示の形によらず「YYYY-MM-DD hh:mm」にする（スプレッドシートのタイムゾーンで、入れたとおりの日時）
 */
function publicBasicValues_(ss, sh) {
  const range = sh.getDataRange();
  const shown = range.getDisplayValues(), raw = range.getValues();
  const tz = ss.getSpreadsheetTimeZone();
  return shown.map(function (r, i) {
    return r.map(function (v, j) {
      const x = raw[i][j];
      return Object.prototype.toString.call(x) === '[object Date]' && !isNaN(x.getTime()) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd HH:mm') : v;
    });
  });
}

/** この受付ページのアドレス（審査のファイルの「基本設定」の「受付ページのURL」を先に使う。No.133。60_public_page.js の publicPageUrl_） */
function publicKnownUrl_() {
  return publicPageUrl_(SpreadsheetApp.getActiveSpreadsheet(), PUBLIC_PAGE_URL_LABEL, publicServiceUrl_(), function (id) { return SpreadsheetApp.openById(id); });
}

function publicServiceUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (err) { return ''; }
}

function publicFileId_(url) {
  const m = /[-\w]{25,}/.exec(String(url || ''));
  if (!m) throw new Error('スプレッドシートのURLが読み取れません：' + url);
  return m[0];
}

/** この受付ページのスプレッドシートの「設定」シート（なければ作る。テンプレートのURL・結果のページのURLを覚えておく） */
function publicSettingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PUBLIC_SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PUBLIC_SETTINGS_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([['項目', '値', '説明']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 「登録」シート（なければ作る） */
function publicRegistrySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PUBLIC_SHEET_REGISTRY);
  if (!sh) {
    sh = ss.insertSheet(PUBLIC_SHEET_REGISTRY);
    sh.getRange(1, 1, 1, PUBLIC_REGISTRY_COLUMNS.length).setValues([PUBLIC_REGISTRY_COLUMNS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), PUBLIC_REGISTRY_COLUMNS.length).setNumberFormat('@');
  }
  return sh;
}

function menuPublicSetup() {
  if (!publicOwnerOnly_('1. 登録の表を作る')) return;
  publicRegistrySheet_();
  publicSettingsSheet_();
  publicRemoveBlankSheet1_(SpreadsheetApp.getActiveSpreadsheet()); // 何も入っていない「シート1」を消す（シートの整理の追加 11.）
  SpreadsheetApp.getUi().alert('「' + PUBLIC_SHEET_REGISTRY + '」「' + PUBLIC_SETTINGS_SHEET + '」シートを作りました。\n' +
    '次に「2. 審査用スプレッドシートを登録する」で、今年の審査用スプレッドシートと、テンプレートのスプレッドシートのURLを入れてください。');
}

/**
 * 審査用スプレッドシート（またはテンプレート）のURLを入れて登録する。
 *   審査用：「登録」に年を足し（同じ年があれば書き換え）、その「基本設定」の「受付ページのスプレッドシート」にこのファイルのURLを書く
 *   テンプレート：「基本設定」の「受付ページのスプレッドシート」だけ書く（新年度の準備で、新しい年が自動で登録されるように）
 */
function menuPublicRegister() {
  if (!publicOwnerOnly_('2. 審査用スプレッドシートを登録する')) return;
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('審査用スプレッドシートを登録する',
    '審査用スプレッドシート（またはテンプレート）のURLを入れてください', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  try {
    ui.alert(publicRegisterJudge_(res.getResponseText()));
  } catch (err) {
    ui.alert('登録できませんでした：' + (err && err.message || err));
  }
}

/** 登録する。結果の文を返す */
function publicRegisterJudge_(url) {
  const judge = SpreadsheetApp.openById(publicFileId_(url));
  const basicSheet = judge.getSheetByName(PUBLIC_SRC_BASIC);
  if (!basicSheet) throw new Error('「' + PUBLIC_SRC_BASIC + '」シートがありません。審査用スプレッドシートのURLか確かめてください');
  const basic = publicBasicMap(basicSheet.getDataRange().getDisplayValues());
  const me = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  let pageMsg;
  try {
    publicSetBasic_(basicSheet, PUBLIC_REGISTRY_LABEL_IN_JUDGE, me,
      '受付ページの「登録」の表があるスプレッドシートのURL。新年度の準備で、新しい年をここに登録する');
    pageMsg = publicWritePageUrl_(basicSheet) + publicWriteResultUrl_(basicSheet);
  } catch (err) {
    // 「基本設定」の「ファイルの場所など」の行は、管理用アカウントだけが書ける（シートの整理 D）
    throw new Error('「基本設定」に書けませんでした。「ファイルの場所など」の行は、管理用アカウントだけが書けます。管理用アカウントで実行してください（' + (err && err.message || err) + '）');
  }
  if (basic['ファイルの種類'] === 'テンプレート') {
    // テンプレートのURLを覚えておく（結果ページのメニューが、テンプレートにも結果のページのURLを書くため）
    publicSetBasic_(publicSettingsSheet_(), PUBLIC_TEMPLATE_LABEL, judge.getUrl(), 'テンプレートのスプレッドシートのURL（「2. 審査用スプレッドシートを登録する」でテンプレートを入れると書かれる）');
    return 'テンプレート「' + judge.getName() + '」の「基本設定」に、このファイルのURLを書きました。' + pageMsg + '\n' +
      'これから「新年度の準備」で作った年は、自動で登録されます。';
  }
  const start = basic['開催期間1'] || ''; // 「基本設定」の「開催期間1」の開始日時（B 列。シートの整理 段階1で「開催期間」シートから移した）
  const year = (/^(\d{4})/.exec(String(start).trim()) || [])[1];
  if (!start) throw new Error('「基本設定」の「開催期間1」が空です。開催期間1の開始日時（例：2027-05-08 21:00）を入れてから、もう一度登録してください');
  if (!year) throw new Error('「基本設定」の「開催期間1」の開始日時から年が読み取れません：' + start);
  publicUpsertRegistry_(year, basic['開催回'] || '', basic['コンテスト名'] || '', judge.getUrl());
  CacheService.getScriptCache().removeAll(['public:' + year, 'public:' + year + ':notready', PUBLIC_FORM_CACHE_KEY]);
  return year + ' 年（' + judge.getName() + '）を登録しました。' + pageMsg;
}

/**
 * 審査用スプレッドシートの「基本設定」の「受付ページのURL」（送信担当の案内メールで使う。申し送り No.50）に、
 * この受付ページのURL（ウェブアプリのURL）を書く。まだ公開していないとき・別のURLが入っているときは書かない。結果の文を返す
 */
function publicWritePageUrl_(basicSheet) {
  // ほかの年の「基本設定」に正しいURLがあれば、それを書く（メニューから自動で受け取るアドレスは違うことがある。No.133）
  const u = publicKnownUrl_();
  const msg = publicWriteUrlIfEmpty(basicSheet, PUBLIC_PAGE_URL_LABEL, u.url, '受付ページのURL（案内メールの本文に入れる）', '受付ページのURL');
  return msg + (msg && u.auto && /書きました/.test(msg) ? '\n' + PUBLIC_URL_CHECK_NOTE : '');
}

/**
 * 審査用スプレッドシートの「基本設定」の「結果のページのURL」（案内メールで使う。申し送り No.56）と「レコードのページのURL」に、
 * この受付ページの「設定」シートに覚えてあるURL（結果ページ・レコードのページのメニューで書かれる）を書く。結果の文を返す
 */
function publicWriteResultUrl_(basicSheet) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PUBLIC_SETTINGS_SHEET);
  return publicWriteUrlIfEmpty(basicSheet, RESULT_PAGE_URL_LABEL, sh ? publicSheetValue(sh, RESULT_PAGE_URL_LABEL) : '',
    RESULT_PAGE_URL_HELP, '結果のページのURL') +
    // レコードのページのURL（シートの整理 追記2）も、レコードのページのメニューで「設定」に覚えてあれば書く
    publicWriteUrlIfEmpty(basicSheet, RECORD_PAGE_URL_LABEL, sh ? publicSheetValue(sh, RECORD_PAGE_URL_LABEL) : '',
      RECORD_PAGE_URL_HELP, 'レコードのページのURL');
}

/** 「登録」に1年分を書く（同じ年があれば書き換える） */
function publicUpsertRegistry_(year, num, name, url) {
  const sh = publicRegistrySheet_();
  const row = [String(year), String(num).replace(/^第|回$/g, ''), String(name), String(url)];
  const v = sh.getDataRange().getDisplayValues();
  for (let i = v.length - 1; i >= 1; i--) {
    if (String(v[i][0]).trim() === row[0]) { sh.getRange(i + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]); return; }
  }
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
}

function menuPublicPreview() {
  if (!publicOwnerOnly_('表示を確かめる')) return;
  const ui = SpreadsheetApp.getUi();
  const y = (parsePublicRegistry(publicRegistrySheet_().getDataRange().getDisplayValues())[0] || {}).year || '';
  CacheService.getScriptCache().removeAll(['public:' + y, 'public:' + y + ':notready', PUBLIC_FORM_CACHE_KEY]);
  const p = publicPage_();
  if (p.error) { ui.alert('表示できませんでした：' + p.error); return; }
  const url = publicKnownUrl_().url;
  ui.showModalDialog(HtmlService.createHtmlOutput(p.html + '<p style="font-size:12px;color:#666;padding:0 16px">' +
    (url ? '受付ページのURL：' + publicEscape(url) : 'まだウェブアプリとして公開していません') + '</p>').setWidth(760).setHeight(560), p.title);
}

/** メニュー「埋め込み用のHTMLを出す」（持ち主だけ。申し送り No.123）。受付ページは1行（No.129） */
function menuPublicEmbed() {
  if (!publicOwnerOnly_('埋め込み用のHTMLを出す')) return;
  // アドレスは「基本設定」の「受付ページのURL」を先に使う（メニューから自動で受け取るアドレスは違うことがある。No.133）
  const ui = SpreadsheetApp.getUi(), u = publicKnownUrl_();
  if (!u.url) { ui.alert('まだウェブアプリとして公開（デプロイ）していません。Apps Script の画面で「デプロイ」→「新しいデプロイ」で公開してから、もう一度実行してください。'); return; }
  // 受付局リスト・ログ入力フォーム・アップロードは1つのページの中で切り替えるので、1行だけ（申し送り No.129）
  ui.showModalDialog(HtmlService.createHtmlOutput(publicEmbedDialogHtml([{ name: '受付ページ（受付局リスト・ログ入力フォーム・電子ログの提出）', url: u.url }],
    u.auto ? PUBLIC_URL_CHECK_NOTE : ''))
    .setWidth(640).setHeight(420), '埋め込み用のHTML');
}

function menuPublicClearCache() {
  if (!publicOwnerOnly_('すぐに新しい内容にする')) return;
  const years = [];
  parsePublicRegistry(publicRegistrySheet_().getDataRange().getDisplayValues()).forEach(function (e) { years.push('public:' + e.year, 'public:' + e.year + ':notready'); });
  years.push(PUBLIC_FORM_CACHE_KEY); // フォームに出すもの（63_gas_public_form.js）
  CacheService.getScriptCache().removeAll(years);
  SpreadsheetApp.getUi().alert('覚えていた表示を消しました。次に開いたときから、新しい内容になります。');
}
// ===== 62_public_form.js =====
/**
 * ログ入力フォームの中身（GASとNodeの両方で動く部分。Web担当）
 *   ・フォームに出すもの（種目・バンド・モード・日付・意見欄の案内）を規約から作る
 *   ・入れた内容を半角にそろえ、足りないところを調べる
 *   ・JARL形式（R2.1）の電子ログを作り、メール受付と同じ判定（parseJarlLog・evaluateSubmission）で確かめる
 *   ・参考の得点を、審査のプログラム（judgeContest）で、この1局だけで計算する
 *   ・フォームのHTML（画面は ①サマリー → ②ログ → ③確認 → ④完了。画面の動きは publicFormClient_）
 * 電子ログのファイルのアップロードは 64_public_upload.js（スタイルや提出の決まりは、ここのものを使う）
 * 提出のファイルを置く・合言葉を比べるなど、Googleのサービスを使う部分は 63_gas_public_form.js にある。
 *
 * 提出は「提出ログ/Web受付」フォルダに1提出1ファイルで置き、受付は受付担当の受付処理が行う
 * （箱の決まり：docs/指示書_ログ入力フォーム.md の「2.」）。
 */

const PUBLIC_FORM_MAX_QSOS = 3000;          // 1回に入れられる交信の数
const PUBLIC_FORM_MAX_CHARS = 400000;       // 1回の提出の大きさ（文字数）
const PUBLIC_FORM_TEXT_MAX = 1000;          // 住所・意見など1つの欄の文字数
const PUBLIC_FORM_OATH = '私は、JARL制定のコンテスト規約および電波法令にしたがい運用した結果、ここに提出するサマリーシートおよびログシートなどが事実と相違ないものであることを、私の名誉において誓います。';

/**
 * 開催期間にふくまれる日（'YYYY-MM-DD'）の一覧。
 * endExclusive（規約の「終了の分の交信」が「時間外（時報まで）」。cfg.endExclusive）なら、終了の分ちょうどは入れない
 * （例：終了が 2026-05-10 00:00 なら 5月10日は選べない。申し送り No.148 の 2a）
 */
function publicFormDates(periods, endExclusive) {
  const out = [];
  (periods || []).forEach(function (p) {
    const em = publicJstToMs(p.end);
    const s = publicJstToMs(String(p.start).substring(0, 10));
    const e = em == null ? null : publicJstToMs(publicMsToJst(em - (endExclusive ? 60000 : 0)).substring(0, 10));
    if (s == null || e == null) return;
    for (let t = s; t <= e && out.length < 60; t += 86400000) {
      const d = publicMsToJst(t).substring(0, 10);
      if (out.indexOf(d) < 0) out.push(d);
    }
  });
  return out.sort();
}

/**
 * フォームが開いているか：開催期間の始まり 〜 「基本設定」の「受付締切」（空なら終わりなし）
 * 戻り値: {open, reason（閉じているときの文）}
 */
function publicFormOpenState(cfg, deadlineText, now) {
  const start = publicJstToMs(((cfg.periods || [])[0] || {}).start);
  const dl = deadlineText ? publicJstToMs(deadlineText) : null;
  if (start == null) return { open: false, reason: '開催期間が決まっていません' };
  if (now < start) return { open: false, reason: 'ログの受付は、コンテストの始まり（' + publicMsToJst(start) + '）からです' };
  if (dl != null && now > dl) return { open: false, reason: 'ログの受付は締め切りました（受付締切：' + publicMsToJst(dl) + '）' };
  return { open: true, reason: '' };
}

/**
 * フォームに出すものをまとめる
 * a: {cfg, basic（{項目: 値}）, title, year, now}
 */
function publicFormInfo(a) {
  const cfg = a.cfg, basic = a.basic || {};
  const st = publicFormOpenState(cfg, basic['受付締切'] || '', a.now);
  const dl = basic['受付締切'] ? publicJstToMs(basic['受付締切']) : null;
  const start = publicJstToMs(((cfg.periods || [])[0] || {}).start);
  // 種目のモード（'電話'・'電信'・''）と開催部門（新潟など。なければ ''）も渡す（入力中の注意と、開催部門ごとの日付。No.148）
  const cats = (cfg.categories || []).map(function (c) { return { code: c.code, name: c.name, mode: c.mode || '', section: c.section || '' }; });
  const sectionDates = {};
  (cfg.sections || []).forEach(function (x) { sectionDates[x.name] = publicFormDates(x.periods, cfg.endExclusive); });
  if ((cfg.checklogCodes || []).length) cats.push({ code: cfg.checklogCodes[0], name: 'チェックログ（順位に入らない）' });
  return {
    year: a.year, title: a.title, open: st.open, closedReason: st.reason,
    deadline: dl != null ? publicMsToJst(dl) : '',
    openFrom: start != null ? publicMsToJst(start) : '',
    organizer: basic['主催者'] || '', contact: basic['問い合わせ先'] || '',
    categories: cats,
    bands: (cfg.bands || []).map(function (b) { return { name: b.name, label: (b.labels || [])[0] || b.name }; }),
    modes: (cfg.cwModes || []).concat(cfg.phoneModes || []),
    cwModes: cfg.cwModes || [],
    dates: publicFormDates(cfg.periods, cfg.endExclusive),
    sectionDates: sectionDates, // 開催部門ごとの日付（種目を選ぶと、その開催部門の日から選ぶ）
    guide: cfg.commentGuide || basic['意見欄の案内'] || '', // 規約の「意見欄の案内」（シートの整理 段階1で基本設定から移した）
    oath: PUBLIC_FORM_OATH,
    maxQsos: PUBLIC_FORM_MAX_QSOS
  };
}

/** 全角の英数字・記号を半角にし、前後の空白を取る */
function publicHan(s) {
  return String(s == null ? '' : s).replace(/[！-～]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  }).replace(/　/g, ' ').trim();
}

/** 電子ログのタグの中に入れる文（タグの記号を全角にし、長すぎる分を切る） */
function publicTagText(s, max) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/</g, '＜').replace(/>/g, '＞').trim().substring(0, max || PUBLIC_FORM_TEXT_MAX);
}

/** 入れた内容を半角・大文字にそろえる（フォームの文字は、そろえてから電子ログにする） */
function publicFormNormalize(f) {
  f = f || {};
  const up = function (s) { return publicHan(s).toUpperCase().replace(/\s+/g, ''); };
  const num = function (s) { return publicHan(s).replace(/[\s,]/g, ''); };
  return {
    category: up(f.category), call: up(f.call), name: publicTagText(f.name, 100), address: publicTagText(f.address),
    email: publicHan(f.email).replace(/\s+/g, ''), email2: publicHan(f.email2).replace(/\s+/g, ''),
    power: num(f.power).replace(/W$/i, ''), total: num(f.total), place: publicTagText(f.place, 200), club: up(f.club),
    comments: publicTagText(f.comments), oath: f.oath === true,
    arrivedDate: publicHan(f.arrivedDate).replace(/\//g, '-'),
    qsos: (Array.isArray(f.qsos) ? f.qsos : []).slice(0, PUBLIC_FORM_MAX_QSOS + 1).map(function (q) {
      q = q || {};
      return { date: publicHan(q.date), time: num(q.time).replace(/:/g, ''), band: publicHan(q.band), mode: up(q.mode),
        call: up(q.call), sentRst: num(q.sentRst), sentNo: up(q.sentNo), rcvdRst: num(q.rcvdRst), rcvdNo: up(q.rcvdNo) };
    })
  };
}

/**
 * ナンバーの欄の先頭に、その行の RST まで入れてしまったとき（例：RST「59」・ナンバー「590902」）に、RST を取る（申し送り No.129 の 7.）。
 * 取るのは、ナンバーがその行の RST と同じ数字で始まり、そのままではマルチ一覧になく、取るとマルチ一覧にあるナンバーになるときだけ。
 * has(no)：マルチ一覧にあるか。戻り値 {no（直したナンバー）, stripped（取った RST。取らなければ ''）}
 */
function publicStripRst(no, rst, has) {
  no = String(no == null ? '' : no); rst = String(rst == null ? '' : rst);
  if (!rst || !has || no.length <= rst.length || no.indexOf(rst) !== 0) return { no: no, stripped: '' };
  const rest = no.substring(rst.length);
  if (has(no) || !has(rest)) return { no: no, stripped: '' };
  return { no: rest, stripped: rst };
}

/**
 * フォームならではの不備（入れ忘れ・メールアドレスの食い違いなど）を調べる。f は publicFormNormalize したもの
 * info: publicFormInfo の戻り値。staff: 委員の合言葉が合っているか
 * 戻り値: [{level:'不備', message}]
 */
function publicFormProblems(f, info, staff) {
  const P = [];
  const add = function (m) { P.push({ level: '不備', message: m }); };
  if (!info.categories.some(function (c) { return c.code === f.category; })) add('参加種目を選んでください');
  if (!f.call) add('呼出符号を入れてください');
  else if (!/^[A-Z0-9\/]+$/.test(f.call)) add('呼出符号「' + f.call + '」に、英数字と「/」のほかの文字が入っています');
  if (!f.name) add('氏名を入れてください');
  if (!f.address) add('住所を入れてください');
  if (!f.email && !staff) add('メールアドレスを入れてください');
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) add('メールアドレス「' + f.email + '」の形が正しくありません');
  if (f.email !== f.email2) add('メールアドレスが、確かめのために入れたものと違います');
  if (!f.power) add('空中線電力（W）を入れてください');
  else if (!/^\d+(\.\d+)?$/.test(f.power)) add('空中線電力は、数字で入れてください（例：10、0.5）');
  if (!f.total) add('総得点を入れてください（ご自分で計算した値）');
  else if (!/^\d+$/.test(f.total)) add('総得点は、数字で入れてください');
  if (!f.oath) add('宣誓に同意してください（同意のチェックを付けてください）');
  if (staff && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(f.arrivedDate)) add('届いた日（消印の日）を入れてください（例：2027-06-08）');
  if (!f.qsos.length) add('交信を1つ以上入れてください');
  if (f.qsos.length > PUBLIC_FORM_MAX_QSOS) add('交信が多すぎます（1回に ' + PUBLIC_FORM_MAX_QSOS + ' 交信まで）');
  f.qsos.slice(0, PUBLIC_FORM_MAX_QSOS).forEach(function (q, i) {
    const miss = [];
    if (info.dates.indexOf(q.date) < 0) miss.push('日付');
    const t = /^(\d{1,2})(\d{2})$/.exec(q.time);
    if (!t || +t[1] > 23 || +t[2] > 59) miss.push('時刻（4けた。例：2105）');
    if (!info.bands.some(function (b) { return b.label === q.band; })) miss.push('バンド');
    if (info.modes.indexOf(q.mode) < 0) miss.push('モード');
    if (!q.call || !/^[A-Z0-9\/]+$/.test(q.call)) miss.push('相手局');
    if (!/^\d{2,3}$/.test(q.sentRst) || !/^[0-9A-Z]+$/.test(q.sentNo)) miss.push('送ったRST・No');
    if (!/^\d{2,3}$/.test(q.rcvdRst) || !/^[0-9A-Z]+$/.test(q.rcvdNo)) miss.push('受けたRST・No');
    if (miss.length) add('ログの ' + (i + 1) + ' 番目：' + miss.join('・') + 'を確かめてください');
  });
  return P;
}

/** 'YYYY-MM-DD' → 'YYYY年M月D日' */
function publicJaDate(d) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(d);
  return m ? m[1] + '年' + (+m[2]) + '月' + (+m[3]) + '日' : d;
}

/**
 * JARL形式（R2.1）の電子ログを作る。f は publicFormNormalize したもの
 * a: {title（コンテスト名）, date（宣誓の日付 'YYYY-MM-DD'）}
 * marks: 交信ごとの [{mlt, pts}]（publicFormMarks）。あれば「Mlt」「Pts」の欄を書く（得点・マルチの欄を空にしない。シートの整理の追加 9. の 2.）
 */
function publicFormLogText(f, a, marks) {
  const L = [];
  const tag = function (name, v, block) { L.push('<' + name + '>' + (block ? '\n' + v + '\n' : v) + '</' + name + '>'); };
  L.push('<SUMMARYSHEET VERSION=R2.1>');
  tag('CONTESTNAME', publicTagText(a.title, 200));
  tag('CATEGORYCODE', f.category);
  tag('CALLSIGN', f.call);
  tag('TOTALSCORE', f.total);
  tag('ADDRESS', f.address, true);
  tag('NAME', f.name);
  tag('EMAIL', f.email);
  tag('POWER', f.power);
  if (f.place) tag('OPPLACE', f.place);
  if (f.club) tag('REGCLUBNUMBER', f.club);
  if (f.comments) tag('COMMENTS', f.comments, true);
  tag('OATH', PUBLIC_FORM_OATH, true);
  tag('DATE', publicJaDate(a.date));
  tag('SIGNATURE', f.name);
  L.push('</SUMMARYSHEET>');
  L.push('<LOGSHEET TYPE=GAS_CLR_WEBFORM>'); // 2026-10-28 に WEBFORM から名前を変えた（申し送り No.129 の 6.。受付・審査は TYPE で見分けていない）
  L.push('DATE (JST) TIME   BAND MODE  CALLSIGN      SENTNo      RCVDNo' + (marks ? '      Mlt    Pts' : ''));
  f.qsos.forEach(function (q, i) {
    const t = q.time.length === 3 ? '0' + q.time : q.time;
    const m = marks && marks[i] ? [marks[i].mlt, marks[i].pts] : [];
    L.push([q.date, t.substring(0, 2) + ':' + t.substring(2), q.band, q.mode, q.call, q.sentRst, q.sentNo, q.rcvdRst, q.rcvdNo].concat(m).join(' '));
  });
  L.push('</LOGSHEET>');
  return L.join('\n') + '\n';
}

/**
 * ログの「Mlt」（マルチ）「Pts」（得点）の欄に入れるもの（シートの整理の追加 9. の 2.。得点・マルチの欄を空にしない）。
 * text：欄のない電子ログ。審査のプログラム（judgeContest）をこの1局だけで動かし、規約で数える：
 *   重複（D）は 得点0・マルチ「-」（規約の「重複のときは電信を優先する」も、審査と同じに入る）。
 *   ほかの交信は 得点＝そのバンドの1交信の点数（審査の pointsForBand。2400MHz は2点などの決まりも入る。申し送り No.142）、マルチ＝そのバンドで初めての、マルチに数えるナンバーならそのナンバー、ほかは「-」
 *   （時間外などの無効は、参加者のログとしては数えて書く。審査で数え直す）
 * 審査のプログラムで数えられないとき（マルチ一覧がないなど）は、同じ局・同じバンドの2つ目からを重複とし、
 * そのバンドで初めての受けたナンバーをマルチにする。戻り値：交信ごとの [{mlt, pts}]
 */
function publicFormMarks(text, cfg, master) {
  const parsed = parseJarlLog(text);
  // バンドの1交信の点数（審査担当の pointsForBand。band は cfg.bands の1つ。バンドが分からなければ1交信の点数）
  const ptsOf = function (band) {
    const v = typeof pointsForBand === 'function' ? pointsForBand(band || null, cfg) : cfg && cfg.pointsPerQso;
    return String(v != null ? v : 1);
  };
  const bandOfLabel = function (label) {
    const l = String(label || '');
    return ((cfg && cfg.bands) || []).filter(function (b) { return b.name === l || (b.labels || []).indexOf(l) >= 0; })[0] || null;
  };
  let lg = null;
  if (master && parsed.qsos.length) {
    try { lg = judgeContest([{ id: 'web', parsed: parsed, receivedAt: '' }], cfg, master, {}).logs[0]; } catch (e) { lg = null; }
  }
  const seen = {};
  if (lg && lg.qsos.length === parsed.qsos.length) {
    const rule = (cfg.multiRules || {})[lg.cls] || null;
    return lg.qsos.map(function (q) {
      if (q.code === 'D') return { mlt: '-', pts: '0' };
      const r = q.rcvd || {};
      const ok = rule && r.no && (r.home ? rule.home : rule.other).indexOf(r.kind) >= 0;
      const key = q.bandName + '|' + r.no, pts = ptsOf(q.band);
      if (!ok || seen[key]) return { mlt: '-', pts: pts };
      seen[key] = true;
      return { mlt: r.no, pts: pts };
    });
  }
  const done = {};
  return parsed.qsos.map(function (q) {
    const call = String(q.call || '').toUpperCase().split('/')[0], band = String(q.band || '');
    if (done[call + '|' + band]) return { mlt: '-', pts: '0' };
    done[call + '|' + band] = true;
    const key = band + '|' + q.rcvdNo, pts = ptsOf(bandOfLabel(band));
    if (!q.rcvdNo || seen[key]) return { mlt: '-', pts: pts };
    seen[key] = true;
    return { mlt: q.rcvdNo, pts: pts };
  });
}

/**
 * フォームの内容を確かめる（確認の画面と、提出のときの両方で使う）
 * a: {form（フォームの内容）, info（publicFormInfo）, cfg, master（NumberMaster。なければ参考の得点を出さない）,
 *     staff（合言葉が合っているか）, now（ミリ秒）, deadlineText}
 * 戻り値: {form（そろえたもの）, text（電子ログ）, problems:[{level, message}], canSubmit, score:{points, multi, total}|null, status}
 */
function publicFormCheck(a) {
  const f = publicFormNormalize(a.form);
  // ナンバーの欄の先頭の RST を取る（画面でも取っているが、念のためサーバーでも同じに直す）
  if (a.master) {
    const has = function (no) { return a.master.exists(no); };
    f.qsos.forEach(function (q) { q.sentNo = publicStripRst(q.sentNo, q.sentRst, has).no; q.rcvdNo = publicStripRst(q.rcvdNo, q.rcvdRst, has).no; });
  }
  const problems = publicFormProblems(f, a.info, a.staff);
  const today = publicMsToJst(a.now).substring(0, 10);
  const plain = publicFormLogText(f, { title: a.info.title, date: today });
  const text = f.qsos.length ? publicFormLogText(f, { title: a.info.title, date: today }, publicFormMarks(plain, a.cfg, a.master)) : plain;
  const parsed = parseJarlLog(text);
  const dl = a.deadlineText ? publicJstToMs(a.deadlineText) : null;
  const received = a.staff && /^\d{4}-\d{1,2}-\d{1,2}$/.test(f.arrivedDate) ? publicJstToMs(f.arrivedDate) : a.now;
  const ev = evaluateSubmission(parsed, { subject: f.call, receivedMinutes: Math.floor(received / 60000),
    deadlineMinutes: dl != null ? Math.floor(dl / 60000) : null }, a.cfg);
  ev.problems.forEach(function (p) {
    if (a.staff && !f.email && /EMAIL/.test(p.message)) return; // 委員が入れる紙ログは、メールアドレスがなくてよい
    if (/件名/.test(p.message)) return;                          // フォームには件名がない（呼出符号を件名として渡している）
    if (/が記入されていません$/.test(p.message)) return;          // 入れ忘れは、上のフォームの不備で出している
    if (problems.some(function (x) { return x.message === p.message; })) return;
    problems.push(p);
  });
  if (ev.status === INTAKE_STATUS.LATE) {
    problems.push({ level: '注意', message: a.staff ? '届いた日が受付締切より後です（「締切後」として受け付けます。扱いは委員会で決めます）'
      : '受付締切を過ぎています' });
  }
  const score = publicRefScore(parsed, a.cfg, a.master);
  const sorted = sortProblems(problems);
  return { form: f, text: text, problems: sorted, score: score, scoreText: publicRefScoreText(score), status: ev.status,
    canSubmit: !sorted.some(function (p) { return p.level === '不備'; }) && text.length <= PUBLIC_FORM_MAX_CHARS };
}

/**
 * 参考の得点：審査のプログラム（judgeContest）を、この1局だけで動かす（相手局のログと照らし合わせる前の目安）
 * 戻り値: {points, multi, total, checklog（チェックログとして扱う）, notes:['コンテスト時間外交信 16件', …]（得点にならない交信の内訳）}
 *         計算できなければ null（参考なので、提出は止めない）
 */
function publicRefScore(parsed, cfg, master) {
  if (!master || !parsed.qsos.length) return null;
  try {
    const lg = judgeContest([{ id: 'web', parsed: parsed, receivedAt: '' }], cfg, master, {}).logs[0];
    const n = {};
    lg.qsos.forEach(function (q) { if (q.code) n[q.code] = (n[q.code] || 0) + 1; });
    return { points: lg.post.points, multi: lg.post.multi, total: lg.post.total, checklog: !!lg.isChecklog,
      notes: Object.keys(n).map(function (k) { return ((CODE_INFO[k] || {}).label || k) + ' ' + n[k] + '件'; }) };
  } catch (e) { return null; }
}

/** 参考の得点の表示の文（確認の画面に、この文をそのまま出す） */
function publicRefScoreText(sc) {
  if (!sc) return '（計算できませんでした）';
  return sc.points + '点 × マルチ' + sc.multi + ' ＝ ' + sc.total +
    (sc.checklog ? '（チェックログとして扱うため、得点になりません）' : '') +
    (sc.notes && sc.notes.length ? '。得点にならない交信：' + sc.notes.join('、') : '');
}

/** 提出の番号：W＋提出日時（14けた）＋「-」＋4文字（rand は 0〜1 の数を返す関数） */
function publicFormId(nowMs, rand) {
  const t = publicMsToJstSeconds(nowMs).replace(/\D/g, '');
  const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += cs.charAt(Math.floor(rand() * cs.length));
  return 'W' + t + '-' + s;
}

/** ミリ秒を JST の 'YYYY-MM-DD hh:mm:ss' にする */
function publicMsToJstSeconds(ms) {
  const d = new Date(ms + 9 * 3600000);
  const z = function (n) { return (n < 10 ? '0' : '') + n; };
  return publicMsToJst(ms) + ':' + z(d.getUTCSeconds());
}

/** 箱に置くファイルの名前（提出日時_呼出符号.txt。「/」は「_」） */
function publicFormFileName(submittedAt, call) {
  return submittedAt.replace(/-/g, '').replace(' ', '_').replace(/:/g, '') + '_' + String(call).replace(/[\/\\]/g, '_') + '.txt';
}

/** 箱に置くファイルの説明欄（JSON） */
function publicFormMeta(submittedAt, f, staff, id) {
  return JSON.stringify({ web: 1, submittedAt: submittedAt, email: f.email || '', paper: !!staff,
    arrivedDate: staff ? f.arrivedDate.replace(/-(\d)(?!\d)/g, '-0$1') : '', id: id });
}

// ------------------------------------------------------------------ フォームのHTML
/**
 * フォームのページ（<body> の中身）を作る。画面の動きは publicFormClient_ をそのままページに入れる
 * info: publicFormInfo の戻り値。受付ページの1つのページ（buildPublicTabsHtml）の中の「ログを入力して提出する」に入る。
 * 画面の中身は id="app-form" に作る（同じページのアップロードの画面とぶつからないように）
 */
function buildPublicFormHtml(info) {
  const data = JSON.stringify({ info: info, appId: 'app-form' }).replace(/</g, '\\u003c');
  return '<div class="page">' + publicFormStyle_() + '<div class="narrow">' +
    '<h1>' + (info.title ? publicEscape(info.title) + '　' : '') + 'ログの入力と提出</h1>' +
    '<div class="sub">' + publicFormPeriodText(info) + '紙でロギングした方のための入力画面です</div>' +
    '<div id="app-form"><p>読み込んでいます…</p></div>' + publicFormFootHtml(info) +
    '<script>(' + publicFormClient_.toString() + ')(' + data + ');</script></div></div>';
}

/** ページの上の受付期間（JARL本部の提出ページにならう） */
function publicFormPeriodText(info) {
  if (!info.openFrom && !info.deadline) return '';
  return '受付期間：' + publicEscape(info.openFrom) + ' 〜 ' + publicEscape(info.deadline || '（締切なし）') + '<br>';
}

/** ページの下の問い合わせ先（「基本設定」の「問い合わせ先」。空なら出さない）と主催者 */
function publicFormFootHtml(info) {
  if (!info.contact && !info.organizer) return '';
  return '<div class="foot">' + (info.contact ? 'お問い合わせは、' + publicEscape(info.contact) + ' までお願いします。' : '') +
    (info.organizer ? (info.contact ? '<br>' : '') + publicEscape(info.organizer) : '') + '</div>';
}

function publicFormStyle_() {
  return '<style>' +
    '.narrow{max-width:760px;margin:0 auto}' + // フォームは、パソコンの幅でも読みやすい幅にする
    '.sub{font-size:13px;color:#666;margin-bottom:10px}' +
    '.rstnote{font-size:11px;color:#2e7d32;min-height:0}' +
    '.steps{display:flex;gap:4px;margin:8px 0 14px;font-size:12px}.steps span{flex:1;text-align:center;padding:5px 0;background:#eef1f5;border-radius:4px;color:#666}' +
    '.steps span.on{background:#1d4f91;color:#fff;font-weight:bold}' +
    'label{display:block;font-weight:bold;font-size:14px;margin-top:12px}.hint{font-weight:normal;font-size:12px;color:#666}' +
    'input,select,textarea{width:100%;box-sizing:border-box;padding:8px;font-size:16px;border:1px solid #bbb;border-radius:4px;margin-top:3px;font-family:inherit;background:#fff}' +
    '.row2{display:flex;gap:8px}.row2>div{flex:1;min-width:0}' +
    '.guide{font-size:13px;background:#fff8e1;border-left:4px solid #e0b000;padding:6px 10px;margin-top:4px;white-space:pre-wrap}' +
    '.oath{font-size:13px;background:#f8f8f8;padding:8px 10px;margin-top:12px;line-height:1.6}' +
    'label.chk{display:flex;gap:8px;align-items:flex-start;font-weight:normal}label.chk input{width:auto;margin-top:3px}' +
    '.btns{display:flex;justify-content:space-between;gap:8px;margin-top:18px}' +
    'button{padding:10px 18px;font-size:16px;border-radius:4px;border:1px solid #1d4f91;background:#1d4f91;color:#fff;cursor:pointer}' +
    'button.sec{background:#fff;color:#1d4f91}button[disabled]{background:#aaa;border-color:#aaa;cursor:default}' +
    '.qso{border:1px solid #ddd;border-radius:6px;padding:8px;margin-top:8px}.qh{display:flex;justify-content:space-between;font-size:12px;color:#666}' +
    '.qh a{color:#a33;cursor:pointer}' +
    '.g4{display:grid;grid-template-columns:1.75fr 0.95fr 1.3fr 1fr;gap:5px}.g3{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:6px;margin-top:6px}' +
    '.g4>div,.g3>div{min-width:0}' +
    '.g4 input,.g4 select,.g3 input{padding:6px 3px;font-size:15px}.g4 select[data-f=date],.g4 select[data-f=band]{font-size:14px;padding:6px 1px}.cap{font-size:11px;color:#666}' +
    '.pair{display:flex;gap:3px}.pair input:first-child{flex:0 0 3.2em;padding:6px 1px;text-align:center}.pair input:last-child{flex:1;min-width:0}' +
    'button.add{width:100%;margin-top:10px;background:#fff;color:#1d4f91}' +
    '.err{background:#fdecea;border-left:4px solid #c62828;padding:6px 10px;font-size:14px;margin:6px 0}' +
    '.warn{background:#fff8e1;border-left:4px solid #e0b000;padding:6px 10px;font-size:14px;margin:6px 0}' +
    '.ok{background:#e3f1e3;border-left:4px solid #2e7d32;padding:6px 10px;font-size:14px;margin:6px 0}' +
    '.kv th{width:40%;white-space:normal}.kv td{white-space:normal}' +
    'details{margin-top:12px;font-size:14px}pre{font-size:11px;background:#f6f6f6;padding:8px;overflow-x:auto;white-space:pre}' +
        '.hp{position:absolute;left:-5000px;width:1px;height:1px;overflow:hidden}' +
    '</style>';
}

/**
 * フォームの画面の動き（ブラウザで動く）。この関数の中身が、そのままページに入る
 * （外の関数は使えない。サーバーは google.script.run で呼ぶ：publicFormStaff・publicFormCheckRemote・publicFormSubmit）
 */
function publicFormClient_(D) {
  var info = D.info, app = document.getElementById(D.appId || 'app');
  var nums = {}; (info.numbers || []).forEach(function (n) { nums[n] = true; }); // マルチ一覧のナンバー（先頭の RST を取るときに使う）
  // 受付局リストへ戻るリンク（ページを移らずに、同じページの中で切り替える。buildPublicTabsHtml）
  var LIST = '<a class="tablink" data-tab="list" role="button" tabindex="0">受付局リストを見る</a>';
  var KEY = 'jarl-logform-' + info.year;
  var st = { step: 1, f: blank(), staffPass: '', staff: false, check: null, done: null, busy: false, msg: '' };
  try { var saved = JSON.parse(window.localStorage.getItem(KEY) || 'null'); if (saved && saved.qsos) st.f = Object.assign(blank(), saved); } catch (e) { /* 残せないときは、残さずに動く */ }
  function blank() {
    return { category: '', call: '', name: '', address: '', email: '', email2: '', power: '', total: '', place: '', club: '', comments: '',
      oath: false, arrivedDate: '', qsos: [] };
  }
  function save() { try { window.localStorage.setItem(KEY, JSON.stringify(st.f)); } catch (e) { /* 残せなくても動く */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function han(s) { return String(s == null ? '' : s).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/　/g, ' '); }
  function rstFor(mode) { return info.cwModes.indexOf(mode) >= 0 ? '599' : '59'; }
  // 選んだ種目（モード・開催部門）。開催部門のある種目なら、その開催部門の日だけを選べる（No.148）
  function catOf() { var c = null; info.categories.forEach(function (x) { if (x.code === st.f.category) c = x; }); return c; }
  function datesFor() { var c = catOf(); return c && c.section && info.sectionDates && info.sectionDates[c.section] ? info.sectionDates[c.section] : info.dates; }
  // 種目にモードがあり、その行のモードが違うときの注意（審査で数えないので、入れられる）
  function modeNote(q) {
    var c = catOf(); if (!c || !c.mode) return '';
    var m = info.cwModes.indexOf(q.mode) >= 0 ? '電信' : '電話';
    return m !== c.mode ? '参加種目「' + c.code + '」は' + c.mode + 'の種目です。この交信は審査で数えません' : '';
  }
  function opts(list, cur, label) {
    return list.map(function (x) { var v = typeof x === 'string' ? x : x.v; var t = typeof x === 'string' ? x : x.t;
      return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
  }
  function newQso() {
    var p = st.f.qsos[st.f.qsos.length - 1];
    var mode = p ? p.mode : (info.modes.indexOf('FM') >= 0 ? 'FM' : info.modes[0]);
    var ds = datesFor();
    return { date: p && ds.indexOf(p.date) >= 0 ? p.date : ds[0], time: '', band: p ? p.band : info.bands[0].label, mode: mode, call: '',
      sentRst: rstFor(mode), sentNo: p ? p.sentNo : '', rcvdRst: rstFor(mode), rcvdNo: '' };
  }
  function steps() {
    return '<div class="steps">' + ['① サマリー', '② ログ', '③ 確認', '④ 完了'].map(function (s, i) {
      return '<span' + (st.step === i + 1 ? ' class="on"' : '') + '>' + s + '</span>'; }).join('') + '</div>';
  }
  function field(key, label, hint, type, extra) {
    return '<label>' + label + (hint ? ' <span class="hint">（' + hint + '）</span>' : '') + '</label>' +
      (type === 'area' ? '<textarea rows="3" data-k="' + key + '">' + esc(st.f[key]) + '</textarea>'
        : '<input data-k="' + key + '" value="' + esc(st.f[key]) + '"' + (extra || '') + '>');
  }
  function render() {
    var h = '';
    if (!info.open && !st.staff) {
      h = '<div class="warn">今は受け付けていません。' + esc(info.closedReason) + '</div>' + staffBox() +
        '<div class="btns">' + LIST + '</div>';
    } else if (st.step === 1) {
      h = steps() +
        '<label>参加種目</label><select data-k="category"><option value="">（選んでください）</option>' +
        opts(info.categories.map(function (c) { return { v: c.code, t: c.code + '　' + c.name }; }), st.f.category) + '</select>' +
        field('call', '呼出符号', '例：JA0RL、移動は JA0RL/0', '', ' autocapitalize="characters"') +
        field('name', '氏名') + field('address', '住所', '郵便番号から', 'area') +
        field('email', 'メールアドレス', st.staff ? '紙ログで分からなければ空でよい' : '受付のメールが届きます', '', ' type="email" autocomplete="email"') +
        field('email2', 'メールアドレス（確かめのため、もう一度）', '', '', ' type="email" autocomplete="off"') +
        '<div class="row2"><div>' + field('power', '空中線電力（W）', '', '', ' inputmode="decimal"') + '</div><div>' +
        field('total', '総得点', 'ご自分で計算した値', '', ' inputmode="numeric"') + '</div></div>' +
        '<div class="row2"><div>' + field('place', '運用地') + '</div><div>' + field('club', '登録クラブ番号', 'あれば') + '</div></div>' +
        '<label>意見</label>' + (info.guide ? '<div class="guide">' + esc(info.guide) + '</div>' : '') +
        '<textarea rows="3" data-k="comments">' + esc(st.f.comments) + '</textarea>' +
        '<div class="oath">' + esc(info.oath) + '</div>' +
        '<label class="chk"><input type="checkbox" data-k="oath"' + (st.f.oath ? ' checked' : '') + '>上の宣誓に同意します（宣誓の日付は提出した日、署名は氏名になります）</label>' +
        (st.staff ? '<div class="ok">委員の合言葉が合いました。メールアドレスは空でもよく、届いた日で締切を決めます。</div>' +
          field('arrivedDate', '届いた日（消印の日）', '例：2027-06-08', '', ' type="date"') : staffBox()) +
        '<div class="hp" aria-hidden="true"><input id="hp" tabindex="-1" autocomplete="off" value="' + esc(st.hp || '') + '"></div>' +
        '<div class="btns"><span></span><button data-go="2">次へ（ログ）</button></div>' +
        '<p class="sub" style="margin-top:16px">電子ログのファイルがある方は、<a class="tablink" data-tab="upload" role="button" tabindex="0">電子ログの提出</a>から提出できます。</p>';
    } else if (st.step === 2) {
      if (!st.f.qsos.length) st.f.qsos.push(newQso());
      h = steps() + '<div class="sub">時刻は4けた（21時05分なら 2105）。入れかけの内容は、このブラウザに残ります。</div>' +
        st.f.qsos.map(function (q, i) {
          return '<div class="qso"><div class="qh"><span>' + (i + 1) + '</span><a data-del="' + i + '">削除</a></div>' +
            '<div class="g4"><div><div class="cap">日付</div><select data-q="' + i + '" data-f="date">' + opts(datesFor().indexOf(q.date) >= 0 || !q.date ? datesFor() : [q.date].concat(datesFor()), q.date) + '</select></div>' +
            '<div><div class="cap">時刻</div><input data-q="' + i + '" data-f="time" value="' + esc(q.time) + '" inputmode="numeric" maxlength="5"></div>' +
            '<div><div class="cap">バンド</div><select data-q="' + i + '" data-f="band">' + opts(info.bands.map(function (b) { return { v: b.label, t: b.name }; }), q.band) + '</select></div>' +
            '<div><div class="cap">モード</div><select data-q="' + i + '" data-f="mode">' + opts(info.modes, q.mode) + '</select></div></div>' +
            '<div class="g3"><div><div class="cap">相手局</div><input data-q="' + i + '" data-f="call" value="' + esc(q.call) + '" autocapitalize="characters"></div>' +
            '<div><div class="cap">送ったRST・No</div><div class="pair"><input data-q="' + i + '" data-f="sentRst" value="' + esc(q.sentRst) + '" inputmode="numeric">' +
            '<input data-q="' + i + '" data-f="sentNo" value="' + esc(q.sentNo) + '" autocapitalize="characters" placeholder="例：0902（RSTは入れない）"></div>' +
            '<div class="rstnote" data-note="' + i + '-sentNo"></div></div>' +
            '<div><div class="cap">受けたRST・No</div><div class="pair"><input data-q="' + i + '" data-f="rcvdRst" value="' + esc(q.rcvdRst) + '" inputmode="numeric">' +
            '<input data-q="' + i + '" data-f="rcvdNo" value="' + esc(q.rcvdNo) + '" autocapitalize="characters" placeholder="例：0902（RSTは入れない）"></div>' +
            '<div class="rstnote" data-note="' + i + '-rcvdNo"></div></div></div>' +
            (modeNote(q) ? '<div class="warn" style="margin:6px 0 0;font-size:12px">' + esc(modeNote(q)) + '</div>' : '') + '</div>';
        }).join('') +
        '<button class="add" data-add="1">＋ 交信を足す</button><div class="sub" style="margin-top:8px">交信数：' + st.f.qsos.length + '</div>' +
        '<div class="btns"><button class="sec" data-go="1">戻る</button><button data-go="3">次へ（確認）</button></div>';
    } else if (st.step === 3) {
      var c = st.check;
      h = steps();
      if (!c) h += '<p>' + esc(st.msg || '確かめています…') + '</p>';
      else {
        h += c.problems.map(function (p) { return '<div class="' + (p.level === '不備' ? 'err' : 'warn') + '">【' + esc(p.level) + '】' + esc(p.message) + '</div>'; }).join('') +
          (c.problems.length ? '' : '<div class="ok">不備はありません。内容を確かめて「提出する」を押してください。</div>') +
          '<table class="kv"><tr><th>参加種目</th><td>' + esc(c.form.category) + '</td></tr><tr><th>呼出符号</th><td>' + esc(c.form.call) + '</td></tr>' +
          '<tr><th>交信数</th><td>' + c.form.qsos.length + '</td></tr><tr><th>総得点（ご自分の値）</th><td>' + esc(c.form.total) + '</td></tr>' +
          '<tr><th>参考：フォームが計算した得点</th><td>' + esc(c.scoreText) + '<br><span class="hint">相手局のログと照らし合わせる前の目安です。最終の得点は審査で決まります</span></td></tr></table>' +
          '<details><summary>できた電子ログ（JARL形式）を見る</summary><pre>' + esc(c.text) + '</pre></details>' +
          (st.msg ? '<div class="err">' + esc(st.msg) + '</div>' : '');
      }
      h += '<div class="btns"><button class="sec" data-go="2">戻って直す</button><button data-submit="1"' +
        (!c || !c.canSubmit || st.busy ? ' disabled' : '') + '>' + (st.busy ? '送っています…' : '提出する') + '</button></div>';
    } else {
      h = steps() + '<div class="ok">ログを提出しました。ありがとうございました。</div>' +
        (st.staff ? '<p>紙ログとして受け付けます（受付のメールは送りません）。</p>'
          : '<p>15分以内に、入力したメールアドレスに受付のメールが届きます。受付番号は、受付のメールでお知らせします。<br>' +
            '届かないときは、迷惑メールのフォルダを確かめてから、呼出符号と提出した日時を書いて委員会にお問い合わせください。</p>') +
        '<p>受付局リストに載るまでに、30分程度かかります。</p>' +
        '<div class="btns">' + LIST +
        (st.staff ? '<button class="sec" data-again="1">続けて次の紙ログを入れる</button>' : '') + '</div>';
    }
    app.innerHTML = h;
  }
  function staffBox() {
    return '<details><summary>委員の方へ（紙で届いたログを入れるとき）</summary><label>委員の合言葉</label>' +
      '<input id="pass" type="password" autocomplete="off"><div class="btns"><span class="hint">' + esc(st.msg) + '</span>' +
      '<button class="sec" data-staff="1">合言葉を確かめる</button></div></details>';
  }
  function run(name, arg, ok) {
    if (!window.google || !google.script) { st.msg = 'この画面は、受付ページのURLから開いてください'; render(); return; }
    google.script.run.withSuccessHandler(ok).withFailureHandler(function (e) {
      st.busy = false; st.msg = 'うまくいきませんでした。しばらくしてから、もう一度お試しください（' + (e && e.message || e) + '）'; render();
    })[name](arg);
  }
  function check() {
    st.check = null; st.msg = ''; render();
    run('publicFormCheckRemote', { form: st.f, pass: st.staffPass }, function (r) { st.check = r; render(); });
  }
  app.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'hp') { st.hp = t.value; return; }
    if (t.dataset.k) st.f[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
    else if (t.dataset.q != null) {
      var q = st.f.qsos[+t.dataset.q], k = t.dataset.f, old = q[k];
      q[k] = t.value;
      if (k === 'mode') { // RSTが前のモードの決まりの値のままなら、新しいモードの値にする
        ['sentRst', 'rcvdRst'].forEach(function (r) { if (q[r] === rstFor(old)) q[r] = rstFor(t.value); });
        render();
      }
    }
    save();
  });
  app.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.dataset.k && t.type === 'checkbox') { st.f[t.dataset.k] = t.checked; save(); return; }
    // 全角は半角に、呼出符号・ナンバーは大文字に、その場で直す
    if (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'password' && t.id !== 'hp') {
      var k = t.dataset.k || t.dataset.f;
      if (['name', 'address', 'place', 'comments'].indexOf(k) >= 0) return;
      var v = han(t.value).trim();
      if (['call', 'sentNo', 'rcvdNo', 'club', 'category'].indexOf(k) >= 0) v = v.toUpperCase().replace(/\s+/g, '');
      // ナンバーの欄の先頭に RST まで入れたとき（例：590902）は、取るとマルチ一覧にあるナンバーになるときだけ取る（申し送り No.129 の 7.）
      if ((k === 'sentNo' || k === 'rcvdNo') && t.dataset.q != null) {
        var q = st.f.qsos[+t.dataset.q], rst = q ? String(q[k === 'sentNo' ? 'sentRst' : 'rcvdRst'] || '') : '';
        var nt = app.querySelector('[data-note="' + t.dataset.q + '-' + k + '"]');
        if (rst && v.length > rst.length && v.indexOf(rst) === 0 && !nums[v] && nums[v.substring(rst.length)]) {
          v = v.substring(rst.length);
          if (nt) nt.textContent = '先頭の' + rst + 'を取りました';
        } else if (nt) nt.textContent = '';
      }
      if (v !== t.value) { t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  });
  app.addEventListener('click', function (ev) {
    var t = ev.target, d = t.dataset;
    if (d.go) {
      st.step = +d.go; st.msg = '';
      if (st.step === 2 && st.f.qsos.length === 0) st.f.qsos.push(newQso());
      render(); window.scrollTo(0, 0);
      if (st.step === 3) check();
    } else if (d.add) {
      if (st.f.qsos.length >= info.maxQsos) return;
      st.f.qsos.push(newQso()); save(); render();
      var ins = app.querySelectorAll('input[data-f="time"]'); if (ins.length) ins[ins.length - 1].focus();
    } else if (d.del != null) {
      st.f.qsos.splice(+d.del, 1); save(); render();
    } else if (d.staff) {
      var p = app.querySelector('#pass').value;
      st.msg = '確かめています…'; render();
      run('publicFormStaff', p, function (ok) {
        st.msg = ok ? '' : '合言葉が違います';
        if (ok) { st.staff = true; st.staffPass = p; if (!info.open) st.step = 1; }
        render();
      });
    } else if (d.submit) {
      if (st.busy) return;
      st.busy = true; st.msg = ''; render();
      run('publicFormSubmit', { form: st.f, pass: st.staffPass, hp: st.hp || '' }, function (r) {
        st.busy = false;
        if (r && r.ok) { st.done = r; st.step = 4; try { window.localStorage.removeItem(KEY); } catch (e) { /* 消せなくてもよい */ } }
        else { if (r && r.check) st.check = r.check; st.msg = (r && r.message) || '提出できませんでした'; }
        render(); window.scrollTo(0, 0);
      });
    } else if (d.again) {
      st.f = blank(); st.check = null; st.done = null; st.step = 1; render(); window.scrollTo(0, 0);
    }
  });
  render();
}
// ===== 63_gas_public_form.js =====
/**
 * ログ入力フォーム（GAS専用。Web担当）
 *
 * 受付ページの1つのページ（61_gas_public_page.js の publicPage_）の「ログを入力して提出する」「電子ログのファイルを提出する」。
 * ?page=form・?page=upload で開くと、それを選んだ状態で開く。登録の表でいちばん新しい年の審査用スプレッドシートを使う。
 *   publicFormsPanels_()     … フォームとアップロードの中身（フォームに出すものは5分覚えておく）
 *   publicFormStaff(pass)    … 委員の合言葉が合っているか（合言葉はページに書き出さず、ここで比べる）
 *   publicFormCheckRemote()  … 確認の画面（電子ログを作り、メール受付と同じ判定で確かめる。参考の得点）
 *   publicFormSubmit()       … 提出。「提出ログ/Web受付」フォルダに1提出1ファイルで置く（受付は受付担当の受付処理）
 *   publicUploadCheckRemote()・publicUploadSubmit() … 電子ログのファイルのアップロード（中身は 64_public_upload.js）
 *
 * 規約は設定担当の loadConfigFor_(ss)（申し送り No.37）で読む。ナンバーは規約のファイルの「マルチ一覧」シートを読む（シートの整理 段階2）。
 * いたずらへの備え：受付期間中だけ開く・同じ呼出符号は1日10回まで・1回の大きさの上限・人には見えない入力欄。
 */

const PUBLIC_FORM_BOX = 'Web受付';            // 「基本設定」のログのフォルダの中のフォルダ
const PUBLIC_FORM_DAILY_LIMIT = 10;          // 同じ呼出符号の1日の提出の数
const PUBLIC_FORM_COUNT_KEY = 'webFormCount'; // 1日の提出の数を覚えておく所（スクリプトのプロパティ）
const PUBLIC_FORM_STAFF_TRIES = 20;          // 合言葉を10分間にまちがえてよい数（全体で）

/** フォームで使うもの（その年の審査用スプレッドシート・基本設定・規約・フォームに出すもの） */
function publicFormContext_() {
  const list = parsePublicRegistry(publicRegistrySheet_().getDataRange().getDisplayValues());
  const entry = list[0];
  if (!entry) throw new Error('「登録」に年がありません');
  const ss = SpreadsheetApp.openById(publicFileId_(entry.url));
  const bs = ss.getSheetByName(PUBLIC_SRC_BASIC);
  if (!bs) throw new Error('「' + PUBLIC_SRC_BASIC + '」シートがありません：' + entry.url);
  const basic = publicBasicMap(publicBasicValues_(ss, bs));
  if (typeof loadConfigFor_ !== 'function') {
    throw new Error('規約の読み込み（設定担当の loadConfigFor_。申し送り No.37）が、まだ受付ページに入っていません');
  }
  let cfg;
  try { cfg = loadConfigFor_(ss); } catch (err) {
    // 規約がまだ入っていない（空のテンプレートから作った年で、「規約をテキストから読み込む」をまだしていない。申し送り No.182）
    if (publicRulesEmpty_(ss)) { const e = new Error(PUBLIC_NOT_READY); e.notReady = true; throw e; }
    throw err;
  }
  const num = entry.num || String(basic['開催回'] || '').replace(/^第|回$/g, '');
  const title = ((num ? '第' + num + '回 ' : '') + (entry.name || basic['コンテスト名'] || '')).trim(); // コンテスト名が空でも後ろに空白を残さない（No.182）
  const info = publicFormInfo({ cfg: cfg, basic: basic, title: title, year: entry.year, now: Date.now() });
  return { ss: ss, basic: basic, cfg: cfg, info: info, year: entry.year };
}

/** 規約がまだ入っていないか（設定担当の settingsTablesEmpty。種目もバンドもない）。調べられないときは false */
function publicRulesEmpty_(ss) {
  try { return settingsTablesEmpty(readSettingsTables_(settingsSpreadsheetFor_(ss))); } catch (err) { return false; }
}

/** ナンバーマスタ（参考の得点に使う）。読めなければ null（参考の得点を出さない） */
function publicFormMaster_(ss) {
  // マルチ一覧は規約のファイル（シートの整理 段階2。審査担当の申し送り No.88。読み方は 2行目から A〜F 列で今までと同じ）
  let sh = null;
  try { sh = bookFor_(ss, BOOK_SETTINGS).getSheetByName('マルチ一覧'); } catch (err) { sh = null; }
  if (!sh || sh.getLastRow() < 2) return null;
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues();
  return new NumberMaster(v.map(function (r) {
    return { no: r[0], kind: r[1], pref: r[2], name: r[3],
      validFrom: r[4] ? jstStringToMinutes(r[4]) : null, validTo: r[5] ? jstStringToMinutes(r[5]) : null };
  }));
}

const PUBLIC_FORM_CACHE_KEY = 'publicform:info'; // フォームに出すもの（publicFormInfo とマルチ一覧のナンバー）を覚えておく所

/**
 * ログ入力フォームとアップロードの中身。戻り値 {form, upload（どちらも HTML）, formTitle, uploadTitle}
 * フォームに出すもの（規約・マルチ一覧のナンバー）を読むのは時間がかかるので、5分だけ覚えておく
 * （受付期間の始まり・締切の表示は5分おくれることがあるが、確かめ・提出のときはサーバーで改めて調べる）
 */
function publicFormsPanels_() {
  try {
    const cache = CacheService.getScriptCache();
    let info = null;
    const hit = cache.get(PUBLIC_FORM_CACHE_KEY);
    if (hit) info = JSON.parse(hit);
    if (info && info.notReady) return publicNotReadyPanels_();
    if (!info) {
      const c = publicFormContext_();
      const master = publicFormMaster_(c.ss);
      info = c.info;
      info.numbers = master ? Object.keys(master.map) : []; // ナンバーの欄の先頭の RST を取るときに使う（No.129 の 7.）
      try { cache.put(PUBLIC_FORM_CACHE_KEY, JSON.stringify(info), PUBLIC_CACHE_SECONDS); } catch (err) { /* 大きすぎて覚えられないときは、毎回読む */ }
    }
    const t = info.title ? info.title + ' ' : ''; // コンテスト名が空でも、見出しの頭に空白を付けない
    return { form: buildPublicFormHtml(info), upload: buildPublicUploadHtml(info),
      formTitle: t + 'ログの入力と提出', uploadTitle: t + '電子ログの提出' };
  } catch (err) {
    if (err && err.notReady) { // 規約がまだ入っていない：「受付の準備中です」（5分覚えておく）
      try { CacheService.getScriptCache().put(PUBLIC_FORM_CACHE_KEY, JSON.stringify({ notReady: true }), PUBLIC_CACHE_SECONDS); } catch (e2) { /* 覚えられなくてもよい */ }
      return publicNotReadyPanels_();
    }
    console.error(err && err.stack || err);
    const msg = function (what) { return '<div class="page"><p>ただいま、' + what + 'の画面を表示できません。しばらくしてから、もう一度開いてください。</p></div>'; };
    return { form: msg('ログの入力'), upload: msg('電子ログの提出'), formTitle: 'ログの入力と提出', uploadTitle: '電子ログの提出', error: String(err && err.message || err) };
  }
}

/** 規約がまだ入っていないときの、フォームとアップロードの中身（ボタンは出さない。?page=form などで開いたときだけ見える） */
function publicNotReadyPanels_() {
  const msg = '<div class="page"><p>' + publicEscape(PUBLIC_NOT_READY) + '</p></div>';
  return { form: msg, upload: msg, formTitle: 'ログの入力と提出', uploadTitle: '電子ログの提出', notReady: true };
}

/** 合言葉が合っているか（「基本設定」の「委員の合言葉」が空なら、いつも合わない） */
function publicFormIsStaff_(basic, pass) {
  const want = String(basic['委員の合言葉'] || '').trim();
  return !!want && String(pass || '').trim() === want;
}

/** ページから呼ぶ：委員の合言葉を確かめる */
function publicFormStaff(pass) {
  const cache = CacheService.getScriptCache();
  const fails = +(cache.get('webFormStaffFails') || 0);
  if (fails >= PUBLIC_FORM_STAFF_TRIES) return false; // まちがいが続いたら、しばらく受け付けない
  const ok = publicFormIsStaff_(publicFormContext_().basic, pass);
  if (!ok) cache.put('webFormStaffFails', String(fails + 1), 600);
  return ok;
}

/** 送られてきた内容が大きすぎないか */
function publicFormTooLarge_(arg) {
  return JSON.stringify(arg || {}).length > PUBLIC_FORM_MAX_CHARS * 2;
}

/** ページから呼ぶ：確認の画面 */
function publicFormCheckRemote(arg) {
  if (publicFormTooLarge_(arg)) return publicFormRefused_('入れた内容が大きすぎます');
  const c = publicFormContext_();
  const staff = publicFormIsStaff_(c.basic, arg && arg.pass);
  if (!c.info.open && !staff) return publicFormRefused_('今は受け付けていません。' + c.info.closedReason);
  return publicFormCheck({ form: arg && arg.form, info: c.info, cfg: c.cfg, master: publicFormMaster_(c.ss), staff: staff,
    now: Date.now(), deadlineText: c.basic['受付締切'] || '' });
}

/** 確かめられないときの、確認の画面の中身 */
function publicFormRefused_(message) {
  return { form: publicFormNormalize({}), text: '', problems: [{ level: '不備', message: message }], score: null, scoreText: '', canSubmit: false };
}

/** ページから呼ぶ：提出する。戻り値 {ok, id} または {ok:false, message, check} */
function publicFormSubmit(arg) {
  return publicSubmit_(arg, function (c, staff, now) {
    const res = publicFormCheck({ form: arg.form, info: c.info, cfg: c.cfg, master: publicFormMaster_(c.ss), staff: staff,
      now: now, deadlineText: c.basic['受付締切'] || '' });
    return { check: res, call: res.form.call, email: res.form.email, arrivedDate: res.form.arrivedDate };
  });
}

/**
 * 提出の共通の部分（ログ入力フォームと、電子ログのアップロード：64_public_upload.js）
 *   人には見えない欄・大きさ・受付期間・同じ呼出符号の1日の数を調べ、「Web受付」に1ファイル置く
 * checker(c, staff, now) は {check（canSubmit・text を持つ確認の結果）, call, email, arrivedDate} を返す
 */
function publicSubmit_(arg, checker) {
  if (!arg || arg.hp) return { ok: false, message: '受け付けられませんでした' }; // 人には見えない欄に入っていた（機械の入力）
  if (publicFormTooLarge_(arg)) return { ok: false, message: '入れた内容が大きすぎます' };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const c = publicFormContext_();
    const staff = publicFormIsStaff_(c.basic, arg.pass);
    const now = Date.now();
    if (!publicFormOpenState(c.cfg, c.basic['受付締切'] || '', now).open && !staff) {
      return { ok: false, message: '受付締切を過ぎたため、提出できませんでした（締切は「提出する」を押した時刻で決めます）' };
    }
    const r = checker(c, staff, now);
    if (!r.check.canSubmit) return { ok: false, message: '不備があるため、提出できませんでした', check: r.check };
    const submittedAt = publicMsToJstSeconds(now);
    const day = submittedAt.substring(0, 10);
    const props = PropertiesService.getScriptProperties();
    let count = {};
    try { count = JSON.parse(props.getProperty(PUBLIC_FORM_COUNT_KEY) || '{}'); } catch (e) { count = {}; }
    if (count.day !== day) count = { day: day, calls: {} }; // 日が変わったら数え直す
    const n = count.calls[r.call] || 0;
    if (!staff && n >= PUBLIC_FORM_DAILY_LIMIT) {
      return { ok: false, message: '同じ呼出符号の提出は、1日に ' + PUBLIC_FORM_DAILY_LIMIT + ' 回までです。あしたもう一度お試しください' };
    }
    // 提出の番号は、受付処理が同じ提出を2回受け付けないための目印（画面には出さない。受付番号は受付のメールで知らせる）
    const id = publicFormId(now, Math.random);
    const file = publicFormBoxFolder_(c.basic).createFile(publicFormFileName(submittedAt, r.call), r.check.text, MimeType.PLAIN_TEXT);
    file.setDescription(publicFormMeta(submittedAt, { email: r.email, arrivedDate: r.arrivedDate }, staff, id));
    count.calls[r.call] = n + 1;
    props.setProperty(PUBLIC_FORM_COUNT_KEY, JSON.stringify(count));
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------------ 電子ログのファイルのアップロード（中身は 64_public_upload.js）

/** アップロードの確かめ（publicUploadCheck に渡す） */
function publicUploadCheckWith_(c, arg, staff, now) {
  return publicUploadCheck({ text: arg.text, fileName: arg.fileName, email: arg.email, email2: arg.email2, arrivedDate: arg.arrivedDate,
    info: c.info, cfg: c.cfg, master: publicFormMaster_(c.ss), staff: staff, now: now, deadlineText: c.basic['受付締切'] || '' });
}

/** ページから呼ぶ：アップロードの確認の画面 */
function publicUploadCheckRemote(arg) {
  const refused = function (m) { return { text: '', call: '', category: '', total: '', qsoCount: 0, email: '', problems: [{ level: '不備', message: m }], score: null, scoreText: '', canSubmit: false }; };
  if (publicFormTooLarge_(arg)) return refused('ファイルが大きすぎます');
  const c = publicFormContext_();
  const staff = publicFormIsStaff_(c.basic, arg && arg.pass);
  if (!c.info.open && !staff) return refused('今は受け付けていません。' + c.info.closedReason);
  return publicUploadCheckWith_(c, arg || {}, staff, Date.now());
}

/** ページから呼ぶ：アップロードしたファイルを提出する */
function publicUploadSubmit(arg) {
  return publicSubmit_(arg, function (c, staff, now) {
    const res = publicUploadCheckWith_(c, arg, staff, now);
    return { check: res, call: res.call, email: res.email, arrivedDate: res.arrivedDate };
  });
}

/** 「基本設定」のログのフォルダの中の「Web受付」フォルダ（なければ作る） */
function publicFormBoxFolder_(basic) {
  const parent = DriveApp.getFolderById(publicFileId_(basic['ログのフォルダ']));
  const it = parent.getFoldersByName(PUBLIC_FORM_BOX);
  return it.hasNext() ? it.next() : parent.createFolder(PUBLIC_FORM_BOX);
}
// ===== 64_public_upload.js =====
/**
 * 電子ログのファイルのアップロード（GASとNodeの両方で動く部分。Web担当。2026-10-20 ユーザーが決めた）
 *
 * パソコンでロギングした人が、JARL形式の電子ログのファイルを、そのまま受付ページ（?page=upload）から提出する。
 * JARL本部の電子ログ提出フォーム（https://contest.jarl.org/upload/）にならった。
 *   画面：①ファイルを選ぶ（または電子ログのテキストを貼り付ける） → ②確認 → ③完了
 *   確認は、メール受付と同じ判定（parseJarlLog・evaluateSubmission）。不備があれば提出できない（直したファイルを選び直す）
 *   ファイルの文字コード（UTF-8・Shift_JIS）は、ブラウザで読むときに見分けて、文字にしてから送る
 *   提出の決まり（「Web受付」の箱・受付期間・1日の数・委員の合言葉）は、ログ入力フォームと同じ（63_gas_public_form.js の publicSubmit_）
 */

const PUBLIC_UPLOAD_MAX_BYTES = 1000000; // 選べるファイルの大きさ（1MB）

/**
 * アップロードされた電子ログを確かめる
 * a: {text（ファイルの中身）, fileName, email, email2, arrivedDate, info（publicFormInfo）, cfg, master, staff, now, deadlineText}
 * 戻り値: {text, call, category, total, qsoCount, email（受付のメールの送り先）, arrivedDate, problems, canSubmit, score, status}
 *   受付のメールの送り先は、入れたメールアドレス。空なら、ログのサマリーの EMAIL
 */
function publicUploadCheck(a) {
  const text = String(a.text == null ? '' : a.text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const email = publicHan(a.email).replace(/\s+/g, ''), email2 = publicHan(a.email2).replace(/\s+/g, '');
  const arrivedDate = publicHan(a.arrivedDate).replace(/\//g, '-');
  const P = [];
  const add = function (lv, m) { P.push({ level: lv, message: m }); };
  if (!text.trim()) add('不備', 'ファイルを選んでください');
  else if (!looksLikeLog(text)) add('不備', 'JARL形式の電子ログではないようです（<SUMMARYSHEET VERSION=R2.1> 〜 </SUMMARYSHEET> と <LOGSHEET> 〜 </LOGSHEET> がありません）');
  if (text.length > PUBLIC_FORM_MAX_CHARS) add('不備', 'ファイルが大きすぎます');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) add('不備', 'メールアドレス「' + email + '」の形が正しくありません');
  if (email !== email2) add('不備', 'メールアドレスが、確かめのために入れたものと違います');
  if (a.staff && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(arrivedDate)) add('不備', '届いた日（消印の日）を入れてください（例：2027-06-08）');
  const parsed = parseJarlLog(text);
  const s = parsed.summary;
  const to = email || publicHan(s.EMAIL || '').replace(/\s+/g, '');
  if (!to && !a.staff) add('不備', '受付のメールの送り先がありません（メールアドレスを入れるか、ログのサマリーの EMAIL に書いてください）');
  if (P.length && !text.trim()) return publicUploadResult_(text, parsed, null, P, null, '', to, arrivedDate);
  const dl = a.deadlineText ? publicJstToMs(a.deadlineText) : null;
  const received = a.staff && /^\d{4}-\d{1,2}-\d{1,2}$/.test(arrivedDate) ? publicJstToMs(arrivedDate) : a.now;
  const ev = evaluateSubmission(parsed, { subject: s.CALLSIGN || '', receivedMinutes: Math.floor(received / 60000),
    deadlineMinutes: dl != null ? Math.floor(dl / 60000) : null }, a.cfg);
  ev.problems.forEach(function (p) {
    if (/件名/.test(p.message)) return; // アップロードには件名がない（ログの呼出符号を件名として渡している）
    if (a.staff && !s.EMAIL && /EMAIL/.test(p.message)) return;
    if (P.some(function (x) { return x.message === p.message; })) return;
    P.push(p);
  });
  if (!s.CALLSIGN) add('不備', 'ログのサマリーに呼出符号（CALLSIGN）がありません');
  else if (!ev.judgeable) add('不備', 'ログシートに交信がありません');
  if (ev.status === INTAKE_STATUS.LATE) {
    add('注意', a.staff ? '届いた日が受付締切より後です（「締切後」として受け付けます。扱いは委員会で決めます）' : '受付締切を過ぎています');
  }
  const score = publicRefScore(parsed, a.cfg, a.master); // 62_public_form.js
  return publicUploadResult_(text, parsed, ev, P, score, ev.status, to, arrivedDate);
}

function publicUploadResult_(text, parsed, ev, problems, score, status, email, arrivedDate) {
  const sorted = sortProblems(problems);
  return {
    text: text, call: ev ? ev.callText : '', category: ev ? ev.category : '', total: String(parsed.summary.TOTALSCORE || ''),
    qsoCount: parsed.qsos.length, version: parsed.version || '', email: email, arrivedDate: arrivedDate,
    problems: sorted, score: score, scoreText: publicRefScoreText(score), status: status,
    canSubmit: !!ev && !!ev.callText && !sorted.some(function (p) { return p.level === '不備'; })
  };
}

/**
 * アップロードのページ（<body> の中身）を作る。画面の動きは publicUploadClient_。
 * 受付ページの1つのページ（buildPublicTabsHtml）の中の「電子ログのファイルを提出する」に入る。画面の中身は id="app-upload" に作る
 */
function buildPublicUploadHtml(info) {
  const data = JSON.stringify({ info: info, appId: 'app-upload', maxBytes: PUBLIC_UPLOAD_MAX_BYTES }).replace(/</g, '\\u003c');
  return '<div class="page">' + publicFormStyle_() + '<div class="narrow">' +
    '<h1>' + (info.title ? publicEscape(info.title) + '　' : '') + '電子ログの提出</h1>' +
    '<div class="sub">' + publicFormPeriodText(info) + 'JARL形式の電子ログのファイルを、そのまま提出できます（テキストの貼り付けでもよい）</div>' +
    '<div id="app-upload"><p>読み込んでいます…</p></div>' + publicFormFootHtml(info) +
    '<script>(' + publicUploadClient_.toString() + ')(' + data + ');</script></div></div>';
}

/**
 * アップロードの画面の動き（ブラウザで動く）。この関数の中身が、そのままページに入る
 * （サーバーは google.script.run で呼ぶ：publicFormStaff・publicUploadCheckRemote・publicUploadSubmit）
 */
function publicUploadClient_(D) {
  var info = D.info, app = document.getElementById(D.appId || 'app');
  // 受付局リストへ戻るリンク（ページを移らずに、同じページの中で切り替える。buildPublicTabsHtml）
  var LIST = '<a class="tablink" data-tab="list" role="button" tabindex="0">受付局リストを見る</a>';
  var st = { step: 1, text: '', fileName: '', pasted: '', email: '', email2: '', arrivedDate: '', hp: '', staff: false, staffPass: '',
    check: null, busy: false, msg: '', fileMsg: '' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function steps() {
    return '<div class="steps">' + ['① ファイルを選ぶ', '② 確認', '③ 完了'].map(function (s, i) {
      return '<span' + (st.step === i + 1 ? ' class="on"' : '') + '>' + s + '</span>'; }).join('') + '</div>';
  }
  function staffBox() {
    return '<details><summary>委員の方へ（郵送などで届いたファイルを入れるとき）</summary><label>委員の合言葉</label>' +
      '<input id="pass" type="password" autocomplete="off"><div class="btns"><span class="hint">' + esc(st.msg) + '</span>' +
      '<button class="sec" data-staff="1">合言葉を確かめる</button></div></details>';
  }
  function render() {
    var h = '';
    if (!info.open && !st.staff) {
      h = '<div class="warn">今は受け付けていません。' + esc(info.closedReason) + '</div>' + staffBox() +
        '<div class="btns">' + LIST + '</div>';
    } else if (st.step === 1) {
      h = steps() +
        '<label>電子ログのファイル <span class="hint">（JARL形式。R2.1・R2.0・R1.0。文字コードは UTF-8・Shift_JIS のどちらでもよい）</span></label>' +
        '<input type="file" id="file" accept=".txt,.log,.jlog,text/plain">' +
        '<div class="sub" id="fname">' + (st.fileName ? '選んだもの：' + esc(st.fileName) : '') + '</div>' +
        (st.fileMsg ? '<div class="err">' + esc(st.fileMsg) + '</div>' : '') +
        '<label>または、電子ログのテキストを貼り付ける <span class="hint">（ファイルのかわりに、中身をこの欄に貼り付けてもよい）</span></label>' +
        '<textarea id="paste" rows="6" style="font-family:monospace;font-size:13px">' + esc(st.pasted) + '</textarea>' +
        '<label>受付のメールの送り先 <span class="hint">（空なら、ログのサマリーの EMAIL あてに送ります）</span></label>' +
        '<input data-k="email" type="email" autocomplete="email" value="' + esc(st.email) + '">' +
        '<label>メールアドレス（確かめのため、もう一度）</label><input data-k="email2" type="email" autocomplete="off" value="' + esc(st.email2) + '">' +
        (st.staff ? '<div class="ok">委員の合言葉が合いました。届いた日で締切を決めます。</div>' +
          '<label>届いた日（消印の日） <span class="hint">（例：2027-06-08）</span></label><input data-k="arrivedDate" type="date" value="' + esc(st.arrivedDate) + '">'
          : staffBox()) +
        '<div class="hp" aria-hidden="true"><input id="hp" tabindex="-1" autocomplete="off" value="' + esc(st.hp) + '"></div>' +
        '<div class="btns"><span></span><button data-go="2"' + (st.text ? '' : ' disabled') + '>次へ（確認）</button></div>' +
        '<p class="sub" style="margin-top:16px">紙でロギングした方は、<a class="tablink" data-tab="form" role="button" tabindex="0">ログの入力画面</a>から提出できます。</p>';
    } else if (st.step === 2) {
      var c = st.check;
      h = steps();
      if (!c) h += '<p>' + esc(st.msg || '確かめています…') + '</p>';
      else {
        h += c.problems.map(function (p) { return '<div class="' + (p.level === '不備' ? 'err' : 'warn') + '">【' + esc(p.level) + '】' + esc(p.message) + '</div>'; }).join('') +
          (c.canSubmit ? (c.problems.length ? '' : '<div class="ok">不備はありません。内容を確かめて「提出する」を押してください。</div>')
            : '<div class="warn">不備を直したファイルを、選び直してください。</div>') +
          '<table class="kv"><tr><th>ファイル</th><td>' + esc(st.fileName) + '</td></tr>' +
          '<tr><th>参加種目</th><td>' + esc(c.category) + '</td></tr><tr><th>呼出符号</th><td>' + esc(c.call) + '</td></tr>' +
          '<tr><th>交信数</th><td>' + c.qsoCount + '</td></tr><tr><th>総得点（申告）</th><td>' + esc(c.total) + '</td></tr>' +
          '<tr><th>参考：フォームが計算した得点</th><td>' + esc(c.scoreText) + '<br><span class="hint">相手局のログと照らし合わせる前の目安です。最終の得点は審査で決まります</span></td></tr>' +
          '<tr><th>受付のメールの送り先</th><td>' + esc(c.email || '（送りません）') + '</td></tr></table>' +
          '<details><summary>ファイルの中身を見る</summary><pre>' + esc(c.text) + '</pre></details>' +
          (st.msg ? '<div class="err">' + esc(st.msg) + '</div>' : '');
      }
      h += '<div class="btns"><button class="sec" data-go="1">ファイルを選び直す</button><button data-submit="1"' +
        (!c || !c.canSubmit || st.busy ? ' disabled' : '') + '>' + (st.busy ? '送っています…' : '提出する') + '</button></div>';
    } else {
      h = steps() + '<div class="ok">電子ログを提出しました。ありがとうございました。</div>' +
        (st.check && st.check.email ? '<p>15分以内に、' + esc(st.check.email) + ' あてに受付のメールが届きます。受付番号は、受付のメールでお知らせします。<br>' +
          '届かないときは、迷惑メールのフォルダを確かめてから、呼出符号と提出した日時を書いて委員会にお問い合わせください。</p>'
          : '<p>受付のメールは送りません。</p>') +
        '<p>受付局リストに載るまでに、30分程度かかります。</p>' +
        '<div class="btns">' + LIST +
        '<button class="sec" data-again="1">ほかのファイルを提出する</button></div>';
    }
    app.innerHTML = h;
  }
  function run(name, arg, ok) {
    if (!window.google || !google.script) { st.msg = 'この画面は、受付ページのURLから開いてください'; render(); return; }
    google.script.run.withSuccessHandler(ok).withFailureHandler(function (e) {
      st.busy = false; st.msg = 'うまくいきませんでした。しばらくしてから、もう一度お試しください（' + (e && e.message || e) + '）'; render();
    })[name](arg);
  }
  function args() { return { text: st.text, fileName: st.fileName, email: st.email, email2: st.email2, arrivedDate: st.arrivedDate, pass: st.staffPass, hp: st.hp }; }
  // ファイルを読む：UTF-8 として読めなければ Shift_JIS として読む
  function readFile(f) {
    st.fileMsg = ''; st.text = ''; st.fileName = f.name; st.pasted = '';
    if (f.size > D.maxBytes) { st.fileMsg = 'ファイルが大きすぎます（' + Math.round(D.maxBytes / 1000) + 'KB まで）'; render(); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var buf = new Uint8Array(rd.result), t;
      try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) {
        try { t = new TextDecoder('shift_jis').decode(buf); } catch (e2) { t = ''; }
      }
      if (!t) st.fileMsg = 'ファイルを読めませんでした';
      st.text = t; render();
    };
    rd.onerror = function () { st.fileMsg = 'ファイルを読めませんでした'; render(); };
    rd.readAsArrayBuffer(f);
  }
  app.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'file' && t.files && t.files[0]) readFile(t.files[0]);
  });
  app.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'hp') st.hp = t.value;
    else if (t.id === 'paste') { // 貼り付けたテキストを使う（ファイルを選んでいたら、そちらはやめる）
      st.pasted = t.value; st.text = t.value; st.fileName = t.value ? '（貼り付けたテキスト）' : ''; st.fileMsg = '';
      var b = app.querySelector('[data-go="2"]'); if (b) b.disabled = !st.text;
      var fn = app.querySelector('#fname'); if (fn) fn.textContent = st.fileName ? '選んだもの：' + st.fileName : ''; // 書き直さない（入れている途中のため）
    }
    else if (t.dataset.k) st[t.dataset.k] = t.value;
  });
  app.addEventListener('click', function (ev) {
    var d = ev.target.dataset;
    if (d.go) {
      st.step = +d.go; st.msg = ''; render(); window.scrollTo(0, 0);
      if (st.step === 2) { st.check = null; render(); run('publicUploadCheckRemote', args(), function (r) { st.check = r; render(); }); }
    } else if (d.staff) {
      var p = app.querySelector('#pass').value;
      st.msg = '確かめています…'; render();
      run('publicFormStaff', p, function (ok) {
        st.msg = ok ? '' : '合言葉が違います';
        if (ok) { st.staff = true; st.staffPass = p; st.step = 1; }
        render();
      });
    } else if (d.submit) {
      if (st.busy) return;
      st.busy = true; st.msg = ''; render();
      run('publicUploadSubmit', args(), function (r) {
        st.busy = false;
        if (r && r.ok) st.step = 3;
        else { if (r && r.check) st.check = r.check; st.msg = (r && r.message) || '提出できませんでした'; }
        render(); window.scrollTo(0, 0);
      });
    } else if (d.again) {
      st.text = ''; st.fileName = ''; st.pasted = ''; st.check = null; st.step = 1; st.msg = ''; render(); window.scrollTo(0, 0);
    }
  });
  render();
}
