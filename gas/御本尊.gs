// コンテストログ集計・審査ツール（GAS用・1ファイルにまとめたもの。メール受付・LCRのメール送信を含む）
// 元のファイル: src/ フォルダ。編集は src/ で行い、build_gas.sh でこの1ファイルを作り直す

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

// ===== 30_lcr.js =====
/**
 * LCR（ログチェックレポート）の文面を作る。構成はJARLコンテストのLCRに合わせている。
 */
function padLeft(v, n) { v = String(v); while (v.length < n) v = ' ' + v; return v; }
function padRight(v, n) { v = String(v); while (strWidth(v) < n) v = v + ' '; return v; }
/** 全角を2文字分として数える */
function strWidth(s) { let w = 0; for (const ch of String(s)) w += /[ -~]/.test(ch) ? 1 : 2; return w; }

/** '2023-05-13 21:00' → '2023/5/13 21:00'（JARLのLCRと同じ書き方） */
function lcrDate(s) {
  const m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}:\d{2})/.exec(String(s).trim());
  return m ? m[1] + '/' + (+m[2]) + '/' + (+m[3]) + ' ' + m[4] : String(s);
}

/**
 * 開催期間の文：「2026/5/17 13:00～2026/5/17 16:00」。2つ以上は「、」でつなぐ。
 * 終了の分の交信が時間外（cfg.endExclusive。「時報まで」）なら、終わりの時刻に「（時報まで）」を付ける（新潟・ギガヘルツの決まったことの 9.）
 */
function lcrPeriodText(periods, endExclusive) {
  return (periods || []).map(function (p) { return lcrDate(p.start) + '～' + lcrDate(p.end) + (endExclusive ? '（時報まで）' : ''); }).join('、');
}

/** その開催部門の開催期間（cfg.sections）。開催部門がない・見つからなければ、コンテスト全体の開催期間（cfg.periods） */
function lcrSectionPeriods(cfg, section) {
  const s = section ? (cfg.sections || []).filter(function (x) { return x.name === section; })[0] : null;
  return s && s.periods && s.periods.length ? s.periods : cfg.periods;
}

/**
 * コンテストの表示名。「第N回 」＋コンテスト名。開催年はLCRでは開催期間の日付で示す。
 * コンテスト名に開催期間と違う年（例：前年の設定の残り）が入っていたら、開催期間の年に直す。
 */
function contestTitle(cfg) {
  const num = String(cfg.contestNumber || '').trim().replace(/^第|回$/g, '');
  const y = /^(\d{4})/.exec(String((cfg.periods[0] || {}).start || ''));
  let name = String(cfg.contestName || '').trim();
  if (y) name = name.replace(/(19|20)\d{2}/, y[1]);
  return (num ? '第' + num + '回 ' : '') + name;
}

function buildLcr(log, result, opts) {
  opts = opts || {};
  const cfg = result.config, L = [];
  // 開催部門のあるコンテスト（新潟）は、LCR を開催部門ごとに作る。見出しに開催部門名と、その開催部門の開催期間（申し送り No.147）
  const periodText = lcrPeriodText(lcrSectionPeriods(cfg, log.section), cfg.endExclusive) + '(JST)';
  L.push('<START-OF-REPORT>');
  L.push('********************** ログチェックレポート ********************');
  L.push('コンテスト: ' + contestTitle(cfg) + (log.section ? ' ' + log.section : '') + ' ' + periodText);
  L.push('コールサイン: ' + log.call.full);
  L.push('参加部門種目: ' + log.categoryCode); // JARLのLCRと同じく種目コードだけ（申し送り No.12）
  if (log.partialChecklog) L.push('  ※' + log.partialChecklog.bands.join('・') + 'の交信は、チェックログ（参加種目外）として照合だけに使いました');
  if (log.checklogBy) L.push('  ※サマリーシートの' + log.checklogBy.join('・') + 'に「チェックログ」とあるため、チェックログとして扱いました');
  else if (log.declaredCategory !== log.categoryCode) L.push('  ※申告の種目 ' + log.declaredCategory + ' から委員会が変更しました');
  L.push('');
  // 集計の表の列：[見出し, 幅]。数字も見出しも右の端をそろえる（全角は半角2文字分。申し送り No.127）
  const cols = [['バンド', 9], ['交信局数', 10], ['得点', 6], ['マルチ', 8], ['電信', 7], ['電話', 6]];
  const padW = function (v, n) { v = String(v); while (strWidth(v) < n) v = ' ' + v; return v; };
  const tableRow = function (head, cells, widths) {
    return head + cells.map(function (c, i) { return padW(c, widths[i][1]); }).join('');
  };
  L.push('*********************** バンド毎の集計結果 *********************');
  L.push(tableRow('         ', cols.map(function (c) { return c[0]; }), cols));
  // 「審査後」の交信局数・電信・電話は、「審査前」と同じ（ログに書かれた交信の数。JARL本部のLCRと同じ）。審査で変わるのは得点・マルチ・総得点
  const counts = function (pre, post) { return [pre.qsos, post.points, post.multi, pre.cw, pre.phone]; };
  log.bandRows.forEach(function (r) {
    L.push(tableRow('   審査前', [r.band].concat(counts(r.pre, r.pre)), cols));
    L.push(tableRow('   審査後', [r.band].concat(counts(r.pre, r.post)), cols));
  });
  L.push('');
  const decl = log.declaredTotal != null ? log.declaredTotal : log.pre.total; // 審査前の総得点は申告総得点
  L.push(tableRow('   審査前', ['合計'].concat(counts(log.pre, log.pre)), cols) + '   総得点 ' + decl);
  L.push(tableRow('   審査後', ['合計'].concat(counts(log.pre, log.post)), cols) + '   総得点 ' + log.post.total);
  if (log.isChecklog) L.push('   ※チェックログのため得点は計算しません');
  L.push('');
  L.push('********************* ログチェック結果まとめ *******************');
  const summaryOrder = [
    ['D', '重複交信 (無得点)'], ['A', '参加種目外交信 (得点対象外)'], ['O', 'コンテスト対象バンド外交信 (得点対象外)'],
    ['X', 'コールサインエラー (無得点)', 'B'], ['N', 'ナンバーエラー (無得点)'], ['I', 'バンド記載間違い (無得点)'],
    ['T', 'コンテスト時間外ログ (無得点)'], ['Q', '10分間ルール違反 (無得点)'],
    ['U', 'このログだけに記載されているコールサイン (減点なし)'], ['C', 'チェックログ (得点対象外)']
  ];
  summaryOrder.forEach(function (s) {
    if (!cfg.checks[s[0]]) return;
    const n = log.counts[s[0]] + (s[2] ? log.counts[s[2]] : 0);
    L.push(padLeft(n, 5) + ' ' + s[1]);
  });
  L.push(' (注)頭の数字は各チェック項目のカウント数です。');
  L.push('     無得点および得点対象外に該当する交信がスコア集計から除外されます。');
  L.push('');
  L.push('********************* チェックコードの説明 *********************');
  const desc = {
    X: ['コールサインの誤り（無得点）', '相手局ログとのクロスチェックにより、誤りと判定されたコールサイン。'],
    B: ['無効なコールサイン（無得点）', 'コールサイン文字列の冗長・不足・不完全、交信対象外または存在しない局のコールサインなど、有効と認定されなかったコールサイン。'],
    N: ['ナンバーの不一致または無効なナンバー（無得点）'],
    I: ['バンド記載間違い（無得点）'],
    A: ['参加種目外交信（得点対象外）'],
    O: ['コンテスト対象バンド外交信（得点対象外）'],
    D: ['重複交信（無得点）'],
    T: ['コンテスト時間外交信（無得点）'],
    Q: ['10分間ルール違反（無得点）'],
    U: ['ユニークコールサイン（減点なし）', 'ユニークコールサインは、当該バンドにおいて貴局のログだけに記載されており他のログ提出局のログには現れないコールサインのこと。ユニークコールサインは有効な交信として得点計上される。']
  };
  ['X', 'B', 'N', 'I', 'A', 'O', 'D', 'T', 'Q', 'U'].forEach(function (k) {
    if (!cfg.checks[k]) return;
    L.push(k + ' ' + desc[k][0]);
    if (desc[k][1]) L.push('  ' + desc[k][1]);
  });
  L.push('');
  // コールサインエラー・ユニークコールサインの欄は、JARLのLCRと同じく
  // 「X  144   FM 2026-05-09 2120 JA0BBX/0 > JA0BBB/0」のように、バンド・モード・日時・呼出符号を列にそろえる
  const bandLabel = function (q) {
    const n = q.band ? q.band.name : '';
    return /^[\d.]+MHz$/.test(n) ? n.replace(/MHz$/, '') : String(q.raw.band || '');
  };
  const callOf = function (q) { return q.call.full || String(q.raw.call || ''); };
  const columns = function (q, w) {
    return (q.code || 'U') + ' ' + padLeft(bandLabel(q), 4) + ' ' + padLeft(q.raw.mode || '', 4) + ' ' +
      q.raw.date + ' ' + String(q.raw.time || '').replace(':', '') + ' ' + padRight(callOf(q), w);
  };
  // 正しい呼出符号。審査の結果に correctCall がなければ、理由の文の「（相手局のログとの照合では JA0RL/0）」から読む
  const correctCallOf = function (q) {
    if (q.correctCall) return q.correctCall;
    const m = /照合では ([^\s）]+)）/.exec(q.reason || '');
    return m ? m[1] : '';
  };
  const section = function (title, filter, write) {
    L.push('************************** ' + title + ' **************************');
    const list = log.qsos.filter(filter);
    if (!list.length) L.push('なし');
    const w = list.reduce(function (a, q) { return Math.max(a, strWidth(callOf(q))); }, 8);
    write(list, w);
    L.push('');
  };
  const withReason = function (list) {
    list.forEach(function (q) {
      L.push((q.code || 'U') + ' ' + q.raw.line.trim());
      if (q.reason) L.push('    → ' + q.reason);
    });
  };
  section('コールサインエラー', function (q) { return q.code === 'X' || q.code === 'B'; }, function (list, w) {
    if (list.length) L.push('ログデータ > 正');
    list.forEach(function (q) {
      const ok = q.code === 'X' ? correctCallOf(q) : '';
      L.push(ok ? columns(q, w) + ' > ' + ok : columns(q, w).replace(/\s+$/, ''));
      // 正しい呼出符号が分からないもの（無効な呼出符号 B など）は、理由を添える
      if (!ok && q.reason) L.push('    → ' + q.reason);
    });
  });
  section('ナンバーエラー', function (q) { return q.code === 'N'; }, withReason);
  section('その他の注意交信', function (q) { return q.code && 'XBNU'.indexOf(q.code) < 0; }, withReason);
  section('ユニークコールサイン', function (q) { return !q.code && q.unique; }, function (list, w) {
    list.forEach(function (q) { L.push(columns(q, w) + ' ' + (q.rcvd.no || '')); });
  });
  (log.divisions || []).forEach(function (d) {
    L.push('************************** ' + d.name + 'の集計 **************************');
    if (!d.eligible) { L.push('対象外：' + d.note); L.push(''); return; }
    if (!d.declared) L.push('（サマリーシートに申告はありませんが、ログに電信の交信があるため集計しました）');
    const dcols = cols.slice(0, 4);
    L.push(tableRow('         ', dcols.map(function (c) { return c[0]; }), dcols));
    d.bandRows.forEach(function (r) {
      L.push(tableRow('         ', [r.band, r.qsos, r.points, r.multi], dcols));
    });
    L.push(tableRow('         ', ['合計', d.qsos, d.points, d.multi], dcols) + '   総得点 ' + d.total);
    L.push('   ※電信の交信だけを有効として数え直した得点です（電話の交信は数えません）');
    // 交信の行の欄はログのままなので、電信部門のマルチと食い違って見えることがある（申し送り No.117）
    L.push('   ※交信の行（上の各欄）は、提出されたログの行のままです（マルチの欄も、ログに書かれたもの）。');
    L.push('     電信部門のマルチは、電信の交信だけで数え直しています');
    if (d.dupes) L.push('   ※同じ局・同じバンドで電信の交信が重複していたため数えなかった交信：' + d.dupes + '件');
    L.push('');
  });
  L.push('<END-OF-REPORT>');
  return L.join('\n');
}

/** 委員会用：局ごとの一覧（申告総得点・審査後総得点・無得点件数・アラート） */
function buildCommitteeTable(result) {
  const divNames = (result.config.divisions || []).map(function (d) { return d.name; });
  const entryNames = (result.config.entryDivisions || []).map(function (d) { return d.name; });
  const clubCol = result.config.clubCompetition ? [result.config.clubCompetition.name] : [];
  const head = ['呼出符号', '種目', '申告総得点', '審査後総得点', '差', '無得点の交信', 'NIL（参考）', '要確認の件数'].concat(divNames, entryNames, clubCol, ['表彰']);
  // 局ごとの表彰（例：「NNSM 1位、電信部門（長野県）1位」）
  const awardsOf = {};
  (result.rankings || []).forEach(function (r) {
    if (!r.award) return;
    (awardsOf[r.log.key] = awardsOf[r.log.key] || []).push(r.awardName && r.awardName !== 'エリア別1位' ? r.awardName : r.category + ' ' + r.rank + '位');
  });
  const rows = result.logs.map(function (l) {
    const decl = l.declaredTotal != null ? l.declaredTotal : '';
    return [l.call.full, l.categoryCode, decl, l.post.total, decl === '' ? '' : l.post.total - decl,
      l.invalidCount, l.nilCount, l.alerts.filter(function (a) { return a.level === '要確認'; }).length].concat(divNames.map(function (n) {
        const d = (l.divisions || []).filter(function (x) { return x.name === n; })[0];
        return !d ? '' : (d.eligible ? d.total : '対象外');
      }), entryNames.map(function (n) {
        const d = (l.entryDivisions || []).filter(function (x) { return x.name === n; })[0];
        return !d ? '' : (d.eligible ? d.prefName || '対象' : '対象外');
      }), clubCol.map(function () {
        const c = l.club;
        return !c ? '' : (c.counted ? c.no + (c.name ? ' ' + c.name : '') : '対象外（' + (c.no || c.raw) + '）');
      }), [(awardsOf[l.key] || []).join('、')]);
  });
  // 開催部門のあるコンテスト（新潟）は、呼出符号の右に列「開催部門」（どの開催部門にも当たらないログは空。No.145）
  if (result.sections && result.sections.length) {
    head.splice(1, 0, '開催部門');
    rows.forEach(function (r, i) { r.splice(1, 0, result.logs[i].section || ''); });
  }
  return [head].concat(rows);
}

/**
 * 部門ごとの順位表（スプレッドシートの「審査結果」に書く。確定結果もこの表から作る）
 *   options.sheet：true なら「審査結果」シート用。順位の表の「交信局数」を「交信局数（ログ）」（ログに書かれた交信の数。LCR と同じ）と
 *     「交信局数（審査後）」（無効の交信を除いた数）の2列にする（申し送り No.132）。確定結果（結果のページ・コンテストレコード・参加証が
 *     列の名前で読む）は、options なしで作り、今までどおり「交信局数」1列（無効の交信を除いた数）
 * 戻り値: {rows: 2次元配列, titleRows: [行番号], headerRows: [行番号], awardRows: [行番号]}（行番号は0から）
 * awardRows は表彰する局・クラブの行（色を付ける）
 */
function buildRankingTable(result, options) {
  options = options || {};
  const split = !!options.sheet;
  const W = split ? 15 : 14;
  // 開催部門のあるコンテスト（新潟）：開催部門ごとに「■ 7MHz部門」の見出しの行を置き、その下にその開催部門の表（種目・チェックログ）。
  // 種目の表の見出しは今と同じく種目コードで始める（参加証が見分けに使う）。最後にクラブ対抗と、開催部門の分からない局（No.145）
  if (result.sections && result.sections.length && !options.part) {
    const out = { rows: [], titleRows: [], headerRows: [], awardRows: [] };
    const add = function (t) {
      const off = out.rows.length;
      t.rows.forEach(function (r) { out.rows.push(r); });
      ['titleRows', 'headerRows', 'awardRows'].forEach(function (k) { t[k].forEach(function (i) { out[k].push(i + off); }); });
    };
    result.sections.forEach(function (sec) {
      const r = []; for (let i = 0; i < W; i++) r.push('');
      r[0] = '■ ' + sec.name;
      out.titleRows.push(out.rows.length); out.rows.push(r);
      add(buildRankingTable(sec.result, Object.assign({}, options, { part: 'section' })));
    });
    add(buildRankingTable(result, Object.assign({}, options, { part: 'clubs' })));
    return out;
  }
  const showMain = options.part !== 'clubs', showClubs = options.part !== 'section';
  const head = ['順位', '呼出符号'].concat(split ? ['交信局数（ログ）', '交信局数（審査後）'] : ['交信局数'],
    ['得点', 'マルチ', '総得点', '最終交信（JST）', '申告総得点', '差', '無得点の交信', 'NIL（参考）', '要確認', '種目', '表彰']);
  const rows = [], titleRows = [], headerRows = [], awardRows = [];
  const ag = result.awardGroups || {};
  // 見出しに付ける「（12局・3位まで表彰）」
  const countText = function (key, n, unit) {
    const g = ag[key];
    if (!n) return '（' + n + unit + '）';
    if (!g || !g.places || g.kind === 'all') return '（' + n + unit + '）'; // 特別賞は載っている局の全部（No.139）
    return '（' + n + unit + '・' + (g.kind === 'first' ? '1位を表彰' : g.places + '位まで表彰') + '）';
  };
  const awardMark = function (r) {
    if (!r.award) return '';
    return r.awardName || '表彰';
  };
  const blank = function () { const r = []; for (let i = 0; i < W; i++) r.push(''); return r; };
  const title = function (text) { const r = blank(); r[0] = text; titleRows.push(rows.length); rows.push(r); };
  const header = function () { headerRows.push(rows.length); rows.push(head.slice()); };
  const alertsOf = function (l) { return l.alerts.filter(function (a) { return a.level === '要確認'; }).length; };
  const line = function (rank, l, st, isDiv, mark) {
    const decl = !isDiv && l.declaredTotal != null ? l.declaredTotal : '';
    const qsos = split ? [st.division ? st.logQsos : l.pre.qsos, st.qsos] : [st.qsos];
    return [rank, l.call.full].concat(qsos, [st.points, st.multi, st.total, st.last != null ? minutesToJst(st.last) : '',
      decl, decl === '' ? '' : st.total - decl, isDiv ? '' : l.invalidCount, isDiv ? '' : l.nilCount, alertsOf(l) || '', l.categoryCode || '', mark || '']);
  };
  const groups = [];
  result.rankings.forEach(function (r) {
    let g = groups.filter(function (x) { return x.key === r.category; })[0];
    if (!g) { g = { key: r.category, name: r.categoryName, parent: r.parent, list: [] }; groups.push(g); }
    g.list.push(r);
  });
  // 参加者のいない種目・部門も見出しだけ出す
  const cfg = result.config;
  const all = [];
  const aw = cfg.awards || {};
  if (aw.top) all.push({ key: aw.top.name, name: aw.top.name + '（両県を通じて最高得点の' + (aw.top.op ? settingsOpLabel(aw.top.op, cfg) : '') + '局。上位' + (aw.top.show || '') + '局を参考に表示）' });
  // 特別賞（局の一覧の「特別賞」）は局長賞の表の後。名前の付いた賞の形（確定結果では表彰の種類「賞」）。No.139
  (result.specialAwards || []).forEach(function (name) { all.push({ key: name, name: name }); });
  cfg.categories.forEach(function (c) {
    all.push({ key: c.code, name: c.name });
    // エリア別（管外局の種目）は、その種目のすぐ後に並べる
    groups.forEach(function (g) { if (g.parent === c.code) all.push({ key: g.key, name: g.name }); });
  });
  (cfg.divisions || []).forEach(function (dv) {
    divisionGroups(dv, cfg).forEach(function (g) { all.push({ key: g.key, name: g.key }); });
  });
  (cfg.entryDivisions || []).forEach(function (dv) {
    (dv.rankBy === '都府県' ? cfg.homePrefs.map(function (p) { return '（' + PREF_TABLE[p] + '）'; }) : ['']).forEach(function (s) {
      all.push({ key: dv.name + s, name: dv.name + s + (dv.rankBy === '都府県' ? '　種目をまぜた審査後総得点の順' : '') });
    });
  });
  (showMain ? all.concat(groups.filter(function (g) { return !all.some(function (c) { return c.key === g.key; }); })) : [])
    .forEach(function (c) {
      const g = groups.filter(function (x) { return x.key === c.key; })[0];
      const n = g ? g.list[0].count : 0;
      title('■ ' + (c.name.indexOf(c.key) === 0 ? c.name : c.key + '　' + c.name) + countText(c.key, n, '局'));
      if (n) {
        header();
        g.list.forEach(function (r) {
          if (r.award) awardRows.push(rows.length);
          rows.push(line(r.rank, r.log, r.stats, !!r.stats.division, awardMark(r)));
        });
      } else {
        const r = blank(); r[0] = '参加なし'; rows.push(r);
      }
      rows.push(blank());
    });
  // 登録クラブ対抗（順位の単位ごと）。参加局は得点の高い順に「呼出符号(得点)」で並べる
  const cc = cfg.clubCompetition;
  if (cc && showClubs) {
    const groupsC = clubRankGroups(cfg); // 都府県ごと・管内と管外・全体（20_judge.js）
    groupsC.forEach(function (g) {
      const list = (result.clubRankings || []).filter(function (c) { return c.group === g.key; });
      title('■ ' + g.name + countText(g.name, list.length, 'クラブ'));
      if (list.length) {
        const h = blank(); h[0] = '順位'; h[1] = '登録番号'; h[2] = 'クラブ名'; h[3] = '参加局数'; h[4] = '総得点'; h[5] = '参加局（審査後総得点）'; h[W - 1] = '表彰';
        headerRows.push(rows.length); rows.push(h);
        list.forEach(function (c) {
          const r = blank();
          r[0] = c.rank; r[1] = c.no; r[2] = c.name || '（一覧にない番号）'; r[3] = c.count; r[4] = c.total;
          r[5] = c.members.map(function (m) { return m.call + '(' + (m.totals || [m.total]).join('・') + ')'; }).join('、'); // 開催部門ごとの得点は「・」でつなぐ（No.145）
          if (c.award) { r[W - 1] = '表彰'; awardRows.push(rows.length); }
          rows.push(r);
        });
      } else {
        const r = blank(); r[0] = '参加なし'; rows.push(r);
      }
      rows.push(blank());
    });
  }
  // チェックログ（順位なし。呼出符号の順）
  // 参加種目外のバンドの交信だけをチェックログとした局（一部チェックログ）も載せる。交信局数はそのバンドの交信数
  const cl = result.logs.filter(function (l) { return l.isChecklog || l.partialChecklog; })
    .sort(function (a, b) { return a.call.full.localeCompare(b.call.full); });
  if (showMain) title('■ チェックログ（' + cl.length + '局）');
  if (!showMain) { /* 開催部門ごとの表に出した */ } else if (cl.length) {
    const h = blank(); h[0] = '番号'; h[1] = '呼出符号'; h[2] = '交信局数'; h[3] = '申告の種目'; h[4] = 'チェックログとした理由';
    headerRows.push(rows.length); rows.push(h);
    cl.forEach(function (l, i) {
      const r = blank();
      const pc = l.isChecklog ? null : l.partialChecklog;
      r[0] = i + 1; r[1] = l.call.full; r[2] = pc ? pc.count : l.qsos.length;
      r[3] = l.declaredCategory || '（空欄）';
      // 委員会が「種目の変更」でチェックログにした局は「委員会の判断：（局の一覧の公開する理由）」（No.100）
      const byCommittee = l.committeeChecklog ? '委員会の判断' + (l.committeeChecklog.publicReason ? '：' + l.committeeChecklog.publicReason : '') : '';
      r[4] = pc ? pc.bands.join('・') + 'チェックログ'
        : (byCommittee || (l.checklogBy ? l.checklogBy.join('・') + 'に「チェックログ」' : '種目コードがCHECKLOG'));
      rows.push(r);
    });
  } else {
    const r = blank(); r[0] = 'なし'; rows.push(r);
  }
  if (showMain) rows.push(blank());
  // 順位の付かない局（開催部門のあるコンテストでは、最後に開催部門の分からない局）
  const others = options.part === 'clubs'
    ? [['■ 開催部門の分からない局（要確認）', result.logs.filter(function (l) { return l.sectionUnknown; })]]
    : [['■ 種目コードが種目表にない局（要確認）', result.logs.filter(function (l) { return !l.isChecklog && !l.category; })]];
  others.forEach(function (o) {
    if (!o[1].length) return;
    title(o[0] + '（' + o[1].length + '局）');
    header();
    o[1].forEach(function (l) {
      const r = line('', l, { qsos: l.post.qsos, points: l.post.points, multi: l.post.multi, total: l.post.total, last: l.lastValidMinutes }, false);
      if (l.isChecklog) { r[5] = ''; }
      r[0] = l.categoryCode;
      rows.push(r);
    });
    rows.push(blank());
  });
  return { rows: rows, titleRows: titleRows, headerRows: headerRows, awardRows: awardRows };
}

/**
 * 「審査結果」シートの表（buildRankingTable の rows。シートから読んだ文字でもよい）から、「確定結果」シートの中身を作る
 * （結果のページ src/result/ が読む。形は docs/指示書_結果の公開ページ.md の「2.」）。
 *   1行目：['確定日時', confirmedAt]
 *   2行目から：[行の種類, 表彰の種類, 賞の名前, …「審査結果」の表と同じ列]
 *     行の種類：見出し（「■」で始まる行）・列名・局・クラブ（列名に「登録番号」がある表の行）・文（「参加なし」など文字が1つだけの行）・空
 *     表彰の種類：「表彰」の列が空なら空、「表彰」なら 順位、ほかの文字（awardName。例：信越総合通信局長賞）なら 賞
 *     賞の名前：賞 のときの「表彰」の列の文字
 *   result（judgeContest の戻り値。なくてもよい）があれば、「■ チェックログ」の表の右の端に2列を足す（申し送り No.125。結果のページが使う）：
 *     「局の一覧の種目の変更」… 局の一覧の「種目の変更」が CHECKLOG ならその文字（ほかは空）
 *     「公開する理由」………… 局の一覧の「公開する理由」の文（そのまま。空なら空）
 *     列名の行に列の名前、局の行に中身。「審査結果」シートには、この2列は出さない
 * 戻り値は、どの行も同じ列の数にした2次元の配列
 */
const CONFIRMED_CHECKLOG_COLUMNS = ['局の一覧の種目の変更', '公開する理由'];

function buildConfirmedResult(values, confirmedAt, result) {
  const out = [];
  const extra = {}; // 呼出符号 → [種目の変更, 公開する理由]
  if (result) {
    result.logs.forEach(function (l) {
      const ch = result.config.checklogCodes.indexOf(l.listChange) >= 0 ? l.listChange : '';
      extra[l.call.full] = [ch, l.publicReason || ''];
    });
  }
  let head = null, checklogTable = false, extraAt = 0;
  (values || []).forEach(function (r) {
    const cells = (r || []).map(function (v) { return v == null ? '' : String(v); });
    const filled = cells.filter(function (c) { return c.trim() !== ''; });
    let kind, award = '', prize = '';
    if (!filled.length) kind = '空';
    else if (/^■/.test(cells[0].trim())) { kind = '見出し'; head = null; checklogTable = /^■\s*チェックログ/.test(cells[0].trim()); }
    else if (cells[0] === '順位' || cells[0] === '番号') { kind = '列名'; head = cells; }
    else if (!head || filled.length === 1) kind = '文';
    else {
      kind = head.indexOf('登録番号') >= 0 ? 'クラブ' : '局';
      const mark = String(cells[head.indexOf('表彰')] || '').trim();
      if (mark === '表彰') award = '順位';
      else if (mark) { award = '賞'; prize = mark; }
    }
    if (result && checklogTable && (kind === '列名' || kind === '局')) {
      // 表の右の端（列名のある最後の列の右）に足す
      if (kind === '列名') { extraAt = head.length; while (extraAt > 0 && head[extraAt - 1].trim() === '') extraAt--; }
      const add = kind === '列名' ? CONFIRMED_CHECKLOG_COLUMNS : (extra[cells[head.indexOf('呼出符号')]] || ['', '']);
      add.forEach(function (v, k) { while (cells.length <= extraAt + k) cells.push(''); cells[extraAt + k] = v; });
    }
    out.push([kind, award, prize].concat(cells));
  });
  const width = Math.max(3, Math.max.apply(null, out.map(function (r) { return r.length; })));
  return [['確定日時', confirmedAt]].concat(out).map(function (r) {
    const x = r.slice(); while (x.length < width) x.push(''); return x;
  });
}

// ===== 31_lcrmail.js =====
/**
 * LCRのメール送信の中身（GASとNodeの両方で動く部分）
 *   ・送り先のメールアドレスを決める（サマリーのEMAIL欄を優先し、だめなら受付メールの送信元）
 *   ・「LCR送信」シートの行を、最新の審査結果（_LCRデータ.json）に合わせて作り直す
 * Gmail・ドライブ・スプレッドシートを使う部分は 97_gas_lcrmail.js にある。
 */

const LCRMAIL_STATUS = {
  PENDING: '未送信',
  SENT: '送信済み',
  SKIP: '送らない',       // 委員が選ぶ
  NOADDR: '送り先なし',   // EMAIL欄も受付メールもない（委員が「送り先の指定」に入れると未送信に戻る）
  PAPER: 'メールアドレスなし（紙ログ）', // 委員がフォームで入れた紙ログで、メールアドレスがない。委員会が郵送などで送る（申し送り No.39）
  FAILED: '送信できず'    // 自動ではやり直さない（委員が「未送信」に戻すと、もう一度送る）
};

const LCRMAIL_HEADER = ['呼出符号', '種目', '送り先', '送り先の根拠', '送り先の指定', '状態', '送信日時', 'メモ', 'LCRファイル名'];
const LC = {}; LCRMAIL_HEADER.forEach(function (h, i) { LC[h] = i; });
// 受付履歴の送信元が、メールアドレスのない紙ログ（受付が「紙ログ（郵送）」と書く。05_intake.js）
const LCRMAIL_PAPER_SENDER_RE = /^紙ログ/;

/** 文字列から最初のメールアドレスを取り出す（全角は半角にする）。なければ '' */
function pickEmail(s) {
  const t = toHankaku(s).replace(/[　\s]+/g, ' ');
  const m = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/.exec(t);
  return m ? m[0] : '';
}

/**
 * 送り先を決める。
 *   item   : {email(サマリーのEMAIL欄), sender(受付メールの送信元。なければ '')}
 *   manual : 「送り先の指定」の欄（入っていれば最優先）
 * 戻り値: {to, how, paper}。paper は、送り先がなく、受付履歴の送信元が紙ログ（メールアドレスなし）のとき true
 * Webで提出されたログは、送信元が入力されたメールアドレスだけなので、そのまま送り先にできる
 */
function chooseLcrAddress(item, manual) {
  const m = pickEmail(manual);
  if (m) return { to: m, how: '委員が指定' };
  if (String(manual || '').trim()) return { to: '', how: '指定のアドレスが読めません' };
  const e = pickEmail(item.email);
  if (e) return { to: e, how: 'EMAIL欄' + (String(item.email).trim() !== e ? '（書き方を直して使用）' : '') };
  const s = pickEmail(item.sender);
  if (s) return { to: s, how: '受付メールの送信元' + (String(item.email || '').trim() ? '（EMAIL欄が読めないため）' : '（EMAIL欄が空のため）') };
  if (LCRMAIL_PAPER_SENDER_RE.test(String(item.sender || '').trim())) {
    return { to: '', how: '紙ログ（メールアドレスがありません。郵送などで送ってください）', paper: true };
  }
  return { to: '', how: 'EMAIL欄も受付メールもありません' };
}

/**
 * 「LCR送信」シートの行を作り直す。
 *   items : _LCRデータ.json の items（{name, call, category, email, sender}）
 *   old   : 今のシートの行（LCRMAIL_HEADER の並び。表示どおりの文字列）
 * 決まり：
 *   ・LCRファイル名で前の行と対応づけ、状態・送信日時・送り先の指定・メモは引き継ぐ
 *   ・「送り先なし」だった行に送り先ができれば「未送信」に戻す。送り先がなくなれば「送り先なし」
 *     （紙ログでメールアドレスがないときは「メールアドレスなし（紙ログ）」。扱いは「送り先なし」と同じ）
 *   ・今の審査結果にない行は、送信済みのものだけ残し、メモに印を付ける（それ以外は消す）
 * 戻り値: 2次元配列（見出しを除く）
 */
function mergeLcrMailRows(items, old) {
  const byName = {};
  (old || []).forEach(function (r) { if (r[LC['LCRファイル名']]) byName[r[LC['LCRファイル名']]] = r; });
  const used = {};
  const GONE = '（今の審査結果にはありません）';
  const rows = items.map(function (it) {
    const prev = byName[it.name];
    used[it.name] = true;
    const manual = prev ? prev[LC['送り先の指定']] : '';
    const a = chooseLcrAddress(it, manual);
    const noAddr = a.paper ? LCRMAIL_STATUS.PAPER : LCRMAIL_STATUS.NOADDR;
    let status = prev ? String(prev[LC['状態']] || '').trim() : '';
    if (!status || status === LCRMAIL_STATUS.NOADDR || status === LCRMAIL_STATUS.PAPER) status = a.to ? LCRMAIL_STATUS.PENDING : noAddr;
    else if (!a.to && status === LCRMAIL_STATUS.PENDING) status = noAddr;
    const memo = prev ? String(prev[LC['メモ']] || '').replace(GONE, '') : '';
    const r = [];
    r[LC['呼出符号']] = it.call; r[LC['種目']] = it.category || ''; r[LC['送り先']] = a.to; r[LC['送り先の根拠']] = a.how;
    r[LC['送り先の指定']] = manual || ''; r[LC['状態']] = status; r[LC['送信日時']] = prev ? prev[LC['送信日時']] : '';
    r[LC['メモ']] = memo; r[LC['LCRファイル名']] = it.name;
    return r;
  });
  (old || []).forEach(function (r) {
    const name = r[LC['LCRファイル名']];
    if (!name || used[name] || String(r[LC['状態']]).indexOf(LCRMAIL_STATUS.SENT) !== 0) return;
    const c = r.slice();
    if (String(c[LC['メモ']] || '').indexOf(GONE) < 0) c[LC['メモ']] = String(c[LC['メモ']] || '') + GONE;
    rows.push(c);
  });
  return rows;
}
// ===== 32_guidemail.js =====
/**
 * 前年の参加者への案内メールの中身（GASとNodeの両方で動く部分）
 *   ・前の年の「受付履歴」から、送る局の一覧（1局1通）を作る
 *   ・「案内メール」シートの行に、足りない局だけ足す（送信済み・「送る／送らない」の選びは消さない）
 * Gmail・スプレッドシートを使う部分は 99_gas_guidemail.js にある。全体の決まりは docs/指示書_案内メール.md
 */

const GUIDE_HEADER = ['呼出符号', '送り先', '送る／送らない', '状態'];
const GC = {}; GUIDE_HEADER.forEach(function (h, i) { GC[h] = i; });
const GUIDE_SEND = '送る';
const GUIDE_SKIP = '送らない';
const GUIDE_STATUS = {
  PENDING: '未送信',
  SENT: '送信済み',     // 「送信済み 2027-04-01 10:00」のように日時を付ける
  FAILED: '送信できず'  // 「送信できず：理由」。自動ではやり直さない（委員が「未送信」に戻すと、もう一度送る）
};

/** 呼出符号を局ごとにまとめるときの印（移動の「/0」などを除く。JA0RL/0 → JA0RL） */
function guideStationKey(call) {
  const c = normalizeCall(call);
  return c.base || c.full;
}

/**
 * 前の年の「受付履歴」の行から、案内を送る局の一覧を作る。
 *   rows : [{call, sender, adopted}]（adopted は「採用」の列が ◯ のとき true）
 * 決まり：採用の局だけ。送信元にメールアドレスがない行（紙ログ（郵送）など）は入れない。
 *         同じ局は1通（後の行のアドレスを使う）。並びは最初に出てきた順
 * 戻り値: [{call, to}]（call は移動の表示を除いた呼出符号）
 */
function guideStationsFromIntake(rows) {
  const byKey = {}, order = [];
  (rows || []).forEach(function (r) {
    if (!r.adopted) return;
    const to = pickEmail(r.sender);
    const key = guideStationKey(r.call);
    if (!to || !key) return;
    if (!byKey[key]) order.push(key);
    byKey[key] = { call: key, to: to };
  });
  return order.map(function (k) { return byKey[k]; });
}

/**
 * 「案内メール」シートの行に、一覧の局のうち、まだない局だけを足す。
 *   stations : guideStationsFromIntake の戻り値
 *   old      : 今のシートの行（GUIDE_HEADER の並び。表示どおりの文字列）。そのまま残す
 *   prevSkip : 前の年の「案内メール」シートで「送らない」にした局の印（guideStationKey）の一覧。足す局の初めの値を「送らない」にする
 * 戻り値: {rows（見出しを除く）, added（足した局の数）}
 */
function mergeGuideRows(stations, old, prevSkip) {
  const rows = (old || []).map(function (r) { return r.slice(); });
  const have = {};
  rows.forEach(function (r) { have[guideStationKey(r[GC['呼出符号']])] = true; });
  const skip = {};
  (prevSkip || []).forEach(function (k) { skip[k] = true; });
  let added = 0;
  (stations || []).forEach(function (s) {
    if (have[s.call]) return;
    have[s.call] = true;
    const r = [];
    r[GC['呼出符号']] = s.call; r[GC['送り先']] = s.to;
    r[GC['送る／送らない']] = skip[s.call] ? GUIDE_SKIP : GUIDE_SEND;
    r[GC['状態']] = GUIDE_STATUS.PENDING;
    rows.push(r);
    added++;
  });
  return { rows: rows, added: added };
}

/** この行に送るか（「送る」で、状態が空か「未送信」、送り先がある） */
function isGuideTarget(r) {
  const st = String(r[GC['状態']] || '').trim();
  return String(r[GC['送る／送らない']] || '').trim() !== GUIDE_SKIP && (st === '' || st === GUIDE_STATUS.PENDING) &&
    !!pickEmail(r[GC['送り先']]);
}

function guideStats(rows) {
  const st = { total: rows.length, sent: 0, pending: 0, skip: 0, failed: 0 };
  rows.forEach(function (r) {
    const s = String(r[GC['状態']] || '').trim();
    if (s.indexOf(GUIDE_STATUS.SENT) === 0) st.sent++;
    else if (String(r[GC['送る／送らない']] || '').trim() === GUIDE_SKIP) st.skip++;
    else if (s.indexOf(GUIDE_STATUS.FAILED) === 0) st.failed++;
    else if (isGuideTarget(r)) st.pending++;
  });
  return st;
}

function guideStatsText(st) {
  return '全 ' + st.total + ' 局：送信済み ' + st.sent + '、未送信 ' + st.pending + '、送らない ' + st.skip + '、送信できず ' + st.failed;
}

/** 文面の中で使っている差し込み（{…}）のうち、値が空のものの名前 */
function emptyTemplateVars(texts, vars) {
  const out = [];
  texts.join('\n').replace(/\{([^{}]+)\}/g, function (m, k) {
    if (Object.prototype.hasOwnProperty.call(vars, k) && !String(vars[k] || '').trim() && out.indexOf(k) < 0) out.push(k);
    return m;
  });
  return out;
}
// ===== 33_certificate.js =====
/**
 * 参加証の中身（GASとNodeの両方で動く部分。メール送信担当）
 *   ・「確定結果」シートの表から、参加証を作る局の一覧と、局ごとの種目・得点・順位を読む
 *   ・見本の差し込み口（{呼出符号} など）に入れる値を作る。{得点|―} のように書くと、空のときに「―」が入る
 *   ・「参加証の見本を作る」で使う、ハガキの大きさの見本のファイル（.pptx）の中身を作る
 *   ・「参加証送信」シートの行を、局の一覧に合わせて作り直す
 * Googleスライド・ドライブ・Gmail を使う部分は 94_gas_certificate.js にある。全体の決まりは docs/指示書_参加証.md
 */

const CERT_STATUS = {
  PENDING: '未送信',
  SENT: '送信済み',     // 「送信済み 2026-06-20 10:00」のように日時を付ける
  SKIP: '送らない',     // 委員が選ぶ
  NOADDR: '送り先なし', // 委員が「送り先の指定」に入れると未送信に戻る
  PAPER: 'メールアドレスなし（紙ログ）', // 送らない。PDFは「参加証」フォルダにあるので、委員会が印刷などで扱う
  FAILED: '送信できず'  // 「送信できず：理由」。自動ではやり直さない（委員が「未送信」に戻すと、もう一度送る）
};
// 開催部門：新潟の「7MHz部門」など。開催部門のあるコンテストは、同じ局が開催部門ごとに1行（参加証も1枚ずつ。申し送り No.147）。なければ空
const CERTMAIL_HEADER = ['呼出符号', '送り先', '送り先の根拠', '送り先の指定', '状態', 'メモ', '開催部門'];
const CC = {}; CERTMAIL_HEADER.forEach(function (h, i) { CC[h] = i; });

/** 参加証のPDFのファイル名：「JA0RL.pdf」、開催部門があれば「JA0RL_7MHz部門.pdf」（ファイル名に使えない文字は「_」） */
function certFileName(call, section) {
  const part = function (x) { return String(x).replace(/[\/\\:*?"<>|\s]/g, '_'); };
  return part(call) + (section ? '_' + part(section) : '') + '.pdf';
}

/**
 * 「確定結果」シートの値（2次元の配列。1行目は ['確定日時', 日時]）から、参加証を作る局の一覧を作る。
 *   cfg : 規約の設定（種目コード・種目名、電信部門などの名前に使う）
 * 決まり：
 *   ・種目ごとの表に出ている局：種目・総得点・順位（「3位（12局中）」）
 *   ・電信部門・ジュニア部門の表に出ている局：そのほかの順位（「電信部門（長野県）2位」）
 *   ・チェックログの表にだけ出ている局：種目名は「チェックログ」、得点・順位は空（一部チェックログの局は、種目の表のほうを使う）
 *   ・局長賞・特別賞（局の一覧の「特別賞」）などの賞の表・登録クラブ対抗は使わない（参加証は表彰ではないため）
 *   ・開催部門のあるコンテスト（新潟）：「■ 7MHz部門」の見出しの行（中に表はない）から次の開催部門の見出しまでが、その開催部門。
 *     局は「局と開催部門」ごとに1つ（3つの開催部門に出た局は3つ。参加証も3枚）。開催部門の分からない局の表は使わない
 * 戻り値: {confirmedAt, stations: [{call, section, code, catName, checklog, total, qsos, multi, rank, count, others: [文字]}]}。
 *         確定していなければ confirmedAt は ''
 */
function certStationsFromConfirmed(values, cfg) {
  const out = { confirmedAt: '', stations: [] };
  if (!values || !values.length || String(values[0][0]).trim() !== '確定日時') return out;
  out.confirmedAt = String(values[0][1] || '').trim();
  if (!out.confirmedAt) return out;
  const catName = {};
  (cfg.categories || []).forEach(function (c) { catName[c.code] = c.name; });
  const sideNames = (cfg.divisions || []).concat(cfg.entryDivisions || []).map(function (d) { return d.name; });
  const sectionNames = (cfg.sections || []).map(function (x) { return x.name; });
  const byKey = {};
  let section = ''; // 今読んでいる開催部門（開催部門のないコンテストは ''）
  const station = function (call) {
    const key = section + '|' + call;
    if (!byKey[key]) {
      byKey[key] = { call: call, section: section, code: '', catName: '', checklog: false, inCategory: false, total: '', qsos: '', multi: '', rank: '', count: '', others: [] };
      out.stations.push(byKey[key]);
    }
    return byKey[key];
  };
  let sec = null, head = null;
  values.slice(1).forEach(function (r) {
    const kind = String(r[0] || '').trim();
    const cells = r.slice(3).map(function (v) { return v == null ? '' : String(v).trim(); });
    if (kind === '見出し') {
      // 「■ NNSM　長野県内局 個人 マルチバンド（12局・3位まで表彰）」「■ 電信部門（長野県）（1局・…）」「■ チェックログ（2局）」
      const t = cells[0].replace(/^■\s*/, '');
      const m = /^(.*?)（(\d+)局/.exec(t);
      const label = (m ? m[1] : t).split('　')[0].trim();
      const count = m ? m[2] : '';
      if (sectionNames.indexOf(t.trim()) >= 0) { section = t.trim(); sec = null; head = null; return; } // 「■ 7MHz部門」（No.150）
      if (/^チェックログ/.test(label)) sec = { type: 'checklog' };
      else if (catName[label] !== undefined) sec = { type: 'category', code: label, count: count };
      // 電信部門・ジュニア部門の表は「電信部門（長野県）」のように、名前そのものか「名前（…）」のときだけ。
      // 委員会が付ける特別賞（例「電信部門奨励賞」）の表と取り違えないように（申し送り No.143）
      else if (sideNames.some(function (n) { return label === n || label.indexOf(n + '（') === 0; })) sec = { type: 'side', label: label };
      else if (/種目表にない/.test(t)) sec = { type: 'unknown' };
      else sec = null; // 局長賞などの賞の表・登録クラブ対抗
      head = null;
      return;
    }
    if (kind === '列名') { head = cells; return; }
    if (kind !== '局' || !sec || !head) return;
    const col = function (h) { const i = head.indexOf(h); return i < 0 ? '' : cells[i] || ''; };
    const call = col('呼出符号');
    if (!call) return;
    const s = station(call);
    if (sec.type === 'category') {
      s.inCategory = true; s.checklog = false;
      s.code = sec.code; s.catName = catName[sec.code] || '';
      s.total = col('総得点'); s.qsos = col('交信局数'); s.multi = col('マルチ');
      s.rank = col('順位'); s.count = sec.count;
    } else if (sec.type === 'side') {
      if (col('順位')) s.others.push(sec.label + col('順位') + '位');
    } else if (sec.type === 'checklog') {
      if (!s.inCategory) s.checklog = true;
    } else if (sec.type === 'unknown' && !s.inCategory) {
      s.code = col('種目'); s.total = col('総得点'); s.qsos = col('交信局数'); s.multi = col('マルチ');
    }
  });
  out.stations.forEach(function (s) {
    if (s.checklog) { s.code = ''; s.catName = 'チェックログ'; s.total = ''; s.qsos = ''; s.multi = ''; s.rank = ''; s.count = ''; }
    delete s.inCategory;
  });
  return out;
}

/** '2026-05-09 21:00' の並び（periods）から「2026年5月9日 21:00 ～ 5月10日 12:00」。endExclusive（時報まで）なら「12:00（時報まで）」 */
function certPeriodText(periods, endExclusive) {
  const j = function (s, withYear) {
    const m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{1,2}:\d{2})/.exec(String(s).trim());
    return m ? (withYear ? m[1] + '年' : '') + (+m[2]) + '月' + (+m[3]) + '日 ' + m[4] : String(s);
  };
  return (periods || []).map(function (p) {
    const sameYear = String(p.start).substring(0, 4) === String(p.end).substring(0, 4);
    return j(p.start, true) + ' ～ ' + j(p.end, !sameYear) + (endExclusive ? '（時報まで）' : '');
  }).join('、');
}

/** 'yyyy-MM-dd' などから「2026年6月20日」 */
function certDateText(s) {
  const m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(String(s).trim());
  return m ? m[1] + '年' + (+m[2]) + '月' + (+m[3]) + '日' : String(s);
}

/**
 * 1局分の差し込みの値。
 *   s      : certStationsFromConfirmed の stations の1つ
 *   name   : 氏名（サマリーのNAME）
 *   common : {コンテスト名, 開催回, 開催期間, 主催者, 発行日}
 */
function certVars(s, name, common) {
  const v = {
    '呼出符号': s.call, '氏名': name || '', '種目コード': s.code, '種目名': s.catName,
    '種目': (s.code + ' ' + s.catName).trim(),
    '得点': s.total, '交信局数': s.qsos, 'マルチ': s.multi,
    '順位': s.rank ? s.rank + '位' + (s.count ? '（' + s.count + '局中）' : '') : '',
    'そのほかの順位': s.others.join('、')
  };
  Object.keys(common || {}).forEach(function (k) { v[k] = common[k]; });
  v['部門'] = s.section || ''; // 開催部門名（新潟の「7MHz部門」など。なければ空。申し送り No.147）
  return v;
}

/** 文の中の差し込み口を置き換える。{名前|空のときの文字} も使える。知らない名前はそのまま残す */
function fillCertText(text, vars) {
  return String(text).replace(/\{([^{}|]+)(?:\|([^{}]*))?\}/g, function (m, k, dflt) {
    if (!Object.prototype.hasOwnProperty.call(vars, k)) return m;
    const v = String(vars[k] == null ? '' : vars[k]);
    return v.trim() === '' && dflt !== undefined ? dflt : v;
  });
}

/** 文の中の差し込み口（{呼出符号}、{得点|―} など）を、書かれたままの形で集める */
function certPlaceholders(text) {
  const out = [];
  String(text).replace(/\{[^{}]+\}/g, function (m) { if (out.indexOf(m) < 0) out.push(m); return m; });
  return out;
}

// ------------------------------------------------------------------ 見本のファイル（.pptx）
// ハガキ（100×148mm）。1mm ＝ 36000（.pptx の長さの単位）
const CERT_MM = 36000;
const CERT_FONT = 'Noto Serif JP';
// 見本の文字の箱：[上からの位置mm, 高さmm, 文字の大きさpt, 太字, 寄せ（ctr・l・r）, 文（行ごと）]。左右は用紙の幅いっぱい（余白あり）
const CERT_SAMPLE_BOXES = {
  縦: { w: 100, h: 148, side: 10, boxes: [
    [10, 16, 28, true, 'ctr', ['参　加　証']],
    [31, 7, 12, false, 'ctr', ['{コンテスト名} {部門}']],
    [38, 6, 8, false, 'ctr', ['{開催期間}']],
    [50, 12, 24, true, 'ctr', ['{呼出符号}']],
    [63, 8, 13, false, 'ctr', ['{氏名} 様']],
    [77, 28, 10, false, 'l', ['参加種目　{種目}', '総 得 点　{得点|―}', '順　　位　{順位|―}', '　　　　　{そのほかの順位}']],
    [108, 10, 9, false, 'ctr', ['上記のとおり本コンテストに参加されたことを', '証明します。']],
    [122, 6, 10, false, 'r', ['{発行日}']],
    [130, 8, 11, false, 'r', ['{主催者}']]
  ] },
  横: { w: 148, h: 100, side: 14, boxes: [
    [6, 13, 24, true, 'ctr', ['参　加　証']],
    [20, 7, 12, false, 'ctr', ['{コンテスト名} {部門}']],
    [27, 5, 8, false, 'ctr', ['{開催期間}']],
    [34, 11, 22, true, 'ctr', ['{呼出符号}']],
    [45, 7, 12, false, 'ctr', ['{氏名} 様']],
    [55, 22, 10, false, 'l', ['参加種目　{種目}', '総 得 点　{得点|―}', '順　　位　{順位|―}', '　　　　　{そのほかの順位}']],
    [77, 5, 9, false, 'ctr', ['上記のとおり本コンテストに参加されたことを証明します。']],
    [84, 5, 10, false, 'r', ['{発行日}']],
    [90, 6, 11, false, 'r', ['{主催者}']]
  ] }
};

function certXmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * ハガキの大きさの見本の .pptx の中身（ファイル名と文字の並び）。GASでは Utilities.zip で1つにまとめ、
 * Googleスライドに変えて取り込む（Googleスライドは、プログラムからはページの大きさを決められないため）。
 *   orient : '縦' か '横'
 * 戻り値: [{name, content}]
 */
function certSamplePptxParts(orient) {
  const L = CERT_SAMPLE_BOXES[orient] || CERT_SAMPLE_BOXES['縦'];
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const rels = function (list) {
    return X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      list.map(function (x, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + REL + x[0] + '" Target="' + x[1] + '"/>'; }).join('') + '</Relationships>';
  };
  const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
  const ct = 'application/vnd.openxmlformats-officedocument.';
  const shapes = L.boxes.map(function (b, i) {
    const runs = b[5].map(function (line) {
      return '<a:p><a:pPr algn="' + b[4] + '"/><a:r><a:rPr lang="ja-JP" sz="' + (b[2] * 100) + '"' + (b[3] ? ' b="1"' : '') + '>' +
        '<a:latin typeface="' + CERT_FONT + '"/><a:ea typeface="' + CERT_FONT + '"/></a:rPr><a:t>' + certXmlEscape(line) + '</a:t></a:r></a:p>';
    }).join('');
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + (i + 2) + '" name="TextBox ' + (i + 1) + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + (L.side * CERT_MM) + '" y="' + (b[0] * CERT_MM) + '"/><a:ext cx="' + ((L.w - L.side * 2) * CERT_MM) + '" cy="' + (b[1] * CERT_MM) + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>' + runs + '</p:txBody></p:sp>';
  }).join('');
  const color = function (n, v) { return '<a:' + n + '><a:srgbClr val="' + v + '"/></a:' + n + '>'; };
  const fill3 = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const theme = X + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Certificate"><a:themeElements>' +
    '<a:clrScheme name="Certificate"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    color('dk2', '1F1F1F') + color('lt2', 'EEEEEE') + color('accent1', '4472C4') + color('accent2', 'ED7D31') + color('accent3', 'A5A5A5') +
    color('accent4', 'FFC000') + color('accent5', '5B9BD5') + color('accent6', '70AD47') + color('hlink', '0563C1') + color('folHlink', '954F72') + '</a:clrScheme>' +
    '<a:fontScheme name="Certificate"><a:majorFont><a:latin typeface="' + CERT_FONT + '"/><a:ea typeface="' + CERT_FONT + '"/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="' + CERT_FONT + '"/><a:ea typeface="' + CERT_FONT + '"/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="Certificate"><a:fillStyleLst>' + fill3 + fill3 + fill3 + '</a:fillStyleLst>' +
    '<a:lnStyleLst>' + [6350, 12700, 19050].map(function (w) { return '<a:ln w="' + w + '">' + fill3 + '</a:ln>'; }).join('') + '</a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst>' + fill3 + fill3 + fill3 + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
  return [
    { name: '[Content_Types].xml', content: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="' + ct + 'presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' + ct + 'presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' + ct + 'presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/slides/slide1.xml" ContentType="' + ct + 'presentationml.slide+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="' + ct + 'theme+xml"/></Types>' },
    { name: '_rels/.rels', content: rels([['officeDocument', 'ppt/presentation.xml']]) },
    { name: 'ppt/presentation.xml', content: X + '<p:presentation ' + NS + '>' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' +
      '<p:sldSz cx="' + (L.w * CERT_MM) + '" cy="' + (L.h * CERT_MM) + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>' },
    { name: 'ppt/_rels/presentation.xml.rels', content: rels([['slideMaster', 'slideMasters/slideMaster1.xml'], ['slide', 'slides/slide1.xml'], ['theme', 'theme/theme1.xml']]) },
    { name: 'ppt/slideMasters/slideMaster1.xml', content: X + '<p:sldMaster ' + NS + '><p:cSld><p:spTree>' + grp + '</p:spTree></p:cSld>' +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>' },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', content: rels([['slideLayout', '../slideLayouts/slideLayout1.xml'], ['theme', '../theme/theme1.xml']]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', content: X + '<p:sldLayout ' + NS + ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' + grp +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>' },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', content: rels([['slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { name: 'ppt/slides/slide1.xml', content: X + '<p:sld ' + NS + '><p:cSld><p:spTree>' + grp + shapes +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>' },
    { name: 'ppt/slides/_rels/slide1.xml.rels', content: rels([['slideLayout', '../slideLayouts/slideLayout1.xml']]) },
    { name: 'ppt/theme/theme1.xml', content: theme }
  ];
}

// ------------------------------------------------------------------ 「参加証送信」シート
/**
 * 「参加証送信」シートの行を作り直す。
 *   items : [{call, section(開催部門名。なければ ''), email(サマリーのEMAIL欄), sender(受付履歴の送信元)}]（確定結果の局の順）
 *   old   : 今のシートの行（CERTMAIL_HEADER の並び）
 * 決まり：呼出符号で前の行と対応づけ、送り先の指定・状態・メモは引き継ぐ。送り先の決め方はLCRと同じ（chooseLcrAddress）。
 *         今の確定結果にない行は、送信済みのものだけ残す
 */
function mergeCertMailRows(items, old) {
  // 行は「呼出符号＋開催部門」で見分ける（開催部門のないコンテストは開催部門が空なので、今までどおり呼出符号だけ）
  const keyOf = function (call, section) { return String(call) + '|' + String(section || ''); };
  const byCall = {};
  (old || []).forEach(function (r) { if (r[CC['呼出符号']]) byCall[keyOf(r[CC['呼出符号']], r[CC['開催部門']])] = r; });
  const used = {};
  const GONE = '（今の確定結果にはありません）';
  const rows = items.map(function (it) {
    const key = keyOf(it.call, it.section);
    const prev = byCall[key];
    used[key] = true;
    const manual = prev ? String(prev[CC['送り先の指定']] || '') : '';
    const a = chooseLcrAddress(it, manual);
    const noAddr = a.paper ? CERT_STATUS.PAPER : CERT_STATUS.NOADDR;
    let status = prev ? String(prev[CC['状態']] || '').trim() : '';
    if (!status || status === CERT_STATUS.NOADDR || status === CERT_STATUS.PAPER) status = a.to ? CERT_STATUS.PENDING : noAddr;
    else if (!a.to && status === CERT_STATUS.PENDING) status = noAddr;
    const r = [];
    r[CC['呼出符号']] = it.call; r[CC['送り先']] = a.to; r[CC['送り先の根拠']] = a.how; r[CC['送り先の指定']] = manual;
    r[CC['状態']] = status; r[CC['メモ']] = prev ? String(prev[CC['メモ']] || '').replace(GONE, '') : '';
    r[CC['開催部門']] = it.section || '';
    return r;
  });
  (old || []).forEach(function (r) {
    const call = r[CC['呼出符号']];
    if (!call || used[keyOf(call, r[CC['開催部門']])] || String(r[CC['状態']]).indexOf(CERT_STATUS.SENT) !== 0) return;
    const c = r.slice();
    while (c.length < CERTMAIL_HEADER.length) c.push('');
    if (String(c[CC['メモ']] || '').indexOf(GONE) < 0) c[CC['メモ']] = String(c[CC['メモ']] || '') + GONE;
    rows.push(c);
  });
  return rows;
}

function certMailStats(rows) {
  const st = { total: rows.length, sent: 0, pending: 0, skip: 0, noaddr: 0, paper: 0, failed: 0 };
  rows.forEach(function (r) {
    const s = String(r[CC['状態']] || '').trim();
    if (s.indexOf(CERT_STATUS.SENT) === 0) st.sent++;
    else if (s === CERT_STATUS.PENDING) st.pending++;
    else if (s === CERT_STATUS.SKIP) st.skip++;
    else if (s === CERT_STATUS.NOADDR) st.noaddr++;
    else if (s === CERT_STATUS.PAPER) st.paper++;
    else if (s.indexOf(CERT_STATUS.FAILED) === 0) st.failed++;
  });
  return st;
}

function certMailStatsText(st) {
  return '全 ' + st.total + ' 局：送信済み ' + st.sent + '、未送信 ' + st.pending + '、送らない ' + st.skip +
    '\n送り先なし ' + st.noaddr + '、送信できず ' + st.failed +
    (st.paper ? '\nメールアドレスなし（紙ログ） ' + st.paper + '（メールでは送りません。PDFは「参加証」フォルダにあるので、印刷などで送ってください）' : '');
}
// ===== 90_gas_main.js =====
/**
 * スプレッドシートから使うための入口（GAS専用。Node.jsのテストでは使わない）
 *
 * スプレッドシートを開くと、メニューに「コンテスト審査」が出る。
 *   1. 初期設定（シートを作る）
 *   規約のファイルを開く・設定の読み込みを確かめる … 92_gas_settings.js
 *   2. マルチ一覧（zLogのDAT）を取り込む
 *   3. フォルダのログを審査する
 *   メールでの受付 … 96_gas_intake.js
 *   LCRのメール送信 … 97_gas_lcrmail.js
 *   予備：JARLのナンバー一覧を取り込む
 *   新年度の準備（テンプレートから）… 95_gas_newyear.js
 *
 * ※コンテスト名と開催期間（開催期間1〜3）は「基本設定」から読む。
 *   規約（バンド・種目・マルチなど）は、規約のファイル（別のスプレッドシート）から読む（92_gas_settings.js）。
 *   3つのファイル（審査・規約・メール）とシートの並びは 91_gas_books.js（docs/指示書_シートの整理.md）。
 *   年が変わったら、テンプレートのスプレッドシートから「新年度の準備」を実行して、その年のフォルダを作る。
 */

const SHEET_BASIC = '基本設定';
const SHEET_MASTER = 'マルチ一覧';     // 規約のファイル（シートの整理 G。前は審査のファイルの「ナンバーマスタ」）
const SHEET_STATION_LIST = '局の一覧'; // 審査のファイルの2枚目（シートの整理 G）
const SHEET_RESULT = '審査結果';
const SHEET_ALERTS = '要確認';
const SHEET_HISTORY = '変更履歴';
const SHEET_STATIONS = '局別一覧';
const SHEET_CLUBS = '登録クラブ一覧';                 // 規約のファイル（シートの整理 G）
const SHEET_CONFIRMED = '確定結果'; // 結果のページ（src/result/）が読む。メニュー「審査結果を確定する」で作る

// マルチ一覧・登録クラブ一覧の見出し（91_gas_books.js のシートの一覧も、これを使う）。「取り込んだ日」は取り込みのたびに書く
const IMPORT_DATE_LABEL = '取り込んだ日';
const MASTER_HEADER = ['ナンバー', '種類', '都府県番号', '名称', '有効開始', '有効終了', IMPORT_DATE_LABEL];
const CLUBS_HEADER = ['登録番号', 'クラブ名', '県', '取り込み元', IMPORT_DATE_LABEL];

// 局の一覧の見出し。左の7列はプログラムが書く（見るだけ）、右の7列は委員が書く（91_gas_books.js のシートの一覧も、これを使う）
// 「開催部門」は、開催部門のあるコンテスト（新潟）で、その行のログの開催部門。行は「局と開催部門」ごと（No.145）。ないコンテストは空
// 「理由」は委員会の中だけのメモ。「公開する理由」は、委員会がチェックログにした局の「チェックログとした理由」として
// 審査結果・確定結果（結果のページ）に出す（申し送り No.100）。「特別賞」は、委員が局を選んで付ける賞の名前（「、」で2つ以上。No.139）
const STATION_LIST_HEADER = ['呼出符号', '開催部門', '提出回数', '採用中の受付番号', '受付の状態', '申告の種目', '前年の局区分（参考）',
  '局区分（管内局／管外局）', '種目の変更', '採用する受付番号', '理由', '決めた委員', '公開する理由', '特別賞'];
const STATION_LEFT_COLS = 7;

/** 局の一覧の行の鍵：呼出符号の本体、開催部門があれば「呼出符号の本体|開催部門」（審査の judgeContestSections も同じ鍵で読む。No.145） */
function stationKey_(base, section) {
  return section ? base + '|' + section : base;
}
const SC = {}; STATION_LIST_HEADER.forEach(function (h, i) { SC[h] = i; });
const STATION_COLORS = { left: '#cfe2f3', right: '#d9ead3' }; // 見出しの色：青＝プログラムが書く、緑＝委員が書く

const JARL_LIST_URLS = [
  'https://www.jarl.org/Japanese/A_Shiryo/A-2_jcc-jcg/jcc-list.txt',
  'https://www.jarl.org/Japanese/A_Shiryo/A-2_jcc-jcg/jcg-list.txt',
  'https://www.jarl.org/Japanese/A_Shiryo/A-2_jcc-jcg/ku-list.txt'
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('コンテスト審査')
    .addItem('1. 初期設定（シートを作る）', 'menuSetup')
    .addItem('規約のファイルを開く', 'menuOpenSettingsFile')
    .addItem('設定の読み込みを確かめる', 'menuCheckSettings')
    .addItem('規約をテキストから読み込む', 'menuImportSettingsText')
    .addItem('規約をテキストに書き出す', 'menuExportSettingsText')
    .addItem('委員の共有をそろえる', 'menuShareCommittee')
    .addItem('2. マルチ一覧（zLogのDAT）を取り込む', 'menuImportZlogDat')
    .addItem('登録クラブ一覧を取り込む（JARLのWebページから）', 'menuImportClubs')
    .addItem('3. フォルダのログを審査する', 'menuJudgeFolder')
    .addItem('4. LCRをファイルに書き出す', 'menuWriteLcrFiles')
    .addItem('審査結果を確定する', 'menuConfirmResult')
    .addItem('確定を取り消す', 'menuCancelConfirm')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('メールでの受付')
      .addItem('受付用のシートを作る', 'menuIntakeSetup')
      .addItem('受付の自動実行を始める（15分ごと）', 'menuIntakeStart')
      .addItem('受付の自動実行を止める', 'menuIntakeStop')
      .addItem('今すぐ受付処理をする', 'menuIntakeNow')
      .addItem('採用するログを決め直す（局の一覧の「採用する受付番号」を反映）', 'menuIntakeRebuild'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('5. LCRをメールで送る')
      .addItem('送信リストを作る（送り先を確かめる）', 'menuLcrMailList')
      .addItem('試しに1通、自分に送る', 'menuLcrMailTest')
      .addItem('今すぐ送る（1日の上限まで）', 'menuLcrMailNow')
      .addItem('毎日の自動送信を始める', 'menuLcrMailStart')
      .addItem('毎日の自動送信を止める', 'menuLcrMailStop'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('6. 案内メール（前年の参加者へ）')
      .addItem('案内メールの一覧を作る', 'menuGuideList')
      .addItem('案内メールを試しに自分に送る', 'menuGuideTest')
      .addItem('案内メールを送る', 'menuGuideSend'))
    .addSubMenu(SpreadsheetApp.getUi().createMenu('7. 参加証')
      .addItem('参加証の見本を作る', 'menuCertSample')
      .addItem('参加証を作る（続きから）', 'menuCertMake')
      .addItem('参加証を全部作り直す', 'menuCertRemake')
      .addItem('参加証を試しに自分に送る', 'menuCertTest')
      .addItem('参加証を送る', 'menuCertSend'))
    .addSeparator()
    .addItem('予備：JARLのナンバー一覧を取り込む', 'menuImportMaster')
    .addSeparator()
    .addItem('新年度の準備（テンプレートから）', 'menuNewYear')
    .addToUi();
}

function getOrCreateSheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (header) { sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold'); sh.setFrozenRows(1); }
  }
  return sh;
}

function menuSetup() {
  requireSetupAccount_('「1. 初期設定」'); // 管理用アカウント（空なら持ち主）だけ（91_gas_books.js。指示書_シートの整理_追加 3.）
  const basic = getOrCreateSheet_(SHEET_BASIC, ['項目', '値', '説明']);
  moveSenderNameToOrganizer_(basic); // 前の版の「返信の差出人名」を「主催者」に移す（基本設定を並べ直す前に）
  // 基本設定（決めた順・4列）、規約のファイルとメールのファイル、3つのファイルの全部のシートの並び・色・守り方（91_gas_books.js）
  const bookWarnings = setupBooks_();
  stationSheet_(); // 局の一覧の見出し（審査担当。シートは setupBooks_ が決まった場所に作る）
  const stationWarning = protectStationLeft_(); // 局の一覧の左側（プログラムが書く列）に「警告だけ」の守り
  if (stationWarning) bookWarnings.push(stationWarning);
  setupIntakeSheets_(); // メールでの受付に使うシート（96_gas_intake.js）
  moveSenderNameToOrganizer_(basic); // 受付の前の版が「返信の差出人名」の行を作ったときは、ここで消す
  const dropdownError = setupJudgeDropdowns_(); // 規約のファイルを作ったあとに付ける（種目コードをそこから読むため）
  let settingsEmpty = false; // 規約がまだ入っていない（空のテンプレート。11_settings.js・92_gas_settings.js）
  try { settingsEmpty = settingsTablesEmpty(readSettingsTables_(settingsSpreadsheet_())); } catch (e) { /* 読めないときは下の注意に出る */ }
  SpreadsheetApp.getUi().alert('シートを作りました。「基本設定」の「その年のコンテストの情報」を確かめてください。' +
    (settingsEmpty ? '\n\n' + SETTINGS_EMPTY_MESSAGE + '\n\n続けてすること：\n1. 「規約をテキストから読み込む」で、規約のテキストファイルを読み込む\n' +
      '2. 「基本設定」の「その年のコンテストの情報」（コンテスト名・開催期間など）を書く\n3. 「2. マルチ一覧（zLogのDAT）を取り込む」を実行する' : '') +
    (bookWarnings.length ? '\n\n※' + bookWarnings.join('\n※') : '') +
    (dropdownError && !settingsEmpty ? '\n\n※規約のファイルの設定が読めなかったので、「種目の変更」の種目コードなどのプルダウンは付けていません。' +
      '設定を直してから、もう一度「1. 初期設定」を実行してください。\n' + dropdownError : ''));
}

const ORGANIZER_LABEL = '主催者';
const OLD_SENDER_NAME_LABEL = '返信の差出人名'; // 2026-10-20 に「主催者」にまとめた（申し送り No.31）

/**
 * 「基本設定」の「返信の差出人名」の行を「主催者」に移して消す（前の版で作ったスプレッドシートのため）。
 * 「主催者」が空（または行がない）なら「返信の差出人名」の値を写す。「主催者」に値があれば、そのままにする。
 * 「返信の差出人名」の行がなければ何もしない
 */
function moveSenderNameToOrganizer_(basic) {
  if (basic.getLastRow() < 2) return;
  const labels = function () { return basic.getRange(2, 1, basic.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); }); };
  const oldRow = labels().indexOf(OLD_SENDER_NAME_LABEL) + 2;
  if (oldRow < 2) return;
  const oldValue = String(basic.getRange(oldRow, 2).getDisplayValues()[0][0]).trim();
  const orgRow = labels().indexOf(ORGANIZER_LABEL) + 2;
  if (orgRow < 2) {
    basic.appendRow([ORGANIZER_LABEL, oldValue, '受付局リストの公開ページ、メールの差出人名・結びに出す主催者の名前']);
    basic.getRange(basic.getLastRow(), 2).setNumberFormat('@');
  } else if (oldValue && !String(basic.getRange(orgRow, 2).getDisplayValues()[0][0]).trim()) {
    basic.getRange(orgRow, 2).setValue(oldValue);
  }
  basic.deleteRow(oldRow);
}

/** zLogのDATファイルを取り込み、規約のファイルの「マルチ一覧」シートに書く（管理用アカウントだけ） */
function menuImportZlogDat() {
  requireMailAccount_('マルチ一覧の取り込み'); // 管理用アカウントだけ（96_gas_intake.js。シートの整理 D）
  const url = settingsRegulationValue_('マルチ一覧（zLogのDAT）'); // 規約のファイルの「規約_基本」（92_gas_settings.js。シートの整理 段階1）
  if (!url) throw new Error('規約のファイルの「規約_基本」の「マルチ一覧（zLogのDAT）」に、URLを入れてください');
  let text;
  const id = /drive\.google\.com/.test(url) ? /[-\w]{25,}/.exec(url) : null;
  if (id) text = DriveApp.getFileById(id[0]).getBlob().getDataAsString('Shift_JIS');
  else text = UrlFetchApp.fetch(url).getContentText('Shift_JIS');
  const entries = parseZlogDat(text);
  if (entries.length === 0) throw new Error('DATファイルからナンバーを読み取れませんでした');
  writeMaster_(entries);
  logHistory_('マルチ一覧（zLogのDAT）を取り込みました（' + entries.length + '件）：' + url);
  SpreadsheetApp.getUi().alert('ナンバーを ' + entries.length + ' 件取り込みました。必要なら、規約のファイルの「' + SHEET_MASTER + '」シートで直してください。');
}

/** 今日の日付（日本時間、YYYY-MM-DD）。マルチ一覧・登録クラブ一覧の「取り込んだ日」に書く */
function importDateToday_() {
  return minutesToJst(Math.floor(Date.now() / 60000)).substring(0, 10);
}

/** 規約のファイルのシート name を、見出し header の形にして中身を空にする（取り込み直すとき） */
function resetImportSheet_(name, header) {
  const sh = bookSheet_(BOOK_SETTINGS, name); // 91_gas_books.js（なければ決まった場所に作る）
  sh.clear();
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function writeMaster_(entries) {
  const sh = resetImportSheet_(SHEET_MASTER, MASTER_HEADER);
  const today = importDateToday_();
  const rows = entries.map(function (e) {
    return [e.no, e.kind, e.pref, e.name, e.validFrom == null ? '' : minutesToJst(e.validFrom), e.validTo == null ? '' : minutesToJst(e.validTo), today];
  });
  sh.getRange(2, 1, rows.length, MASTER_HEADER.length).setNumberFormat('@').setValues(rows);
}

/**
 * 登録クラブ一覧（JARLのWebページ）を取り込み、規約のファイルの「登録クラブ一覧」シートに書く。
 * 登録クラブ対抗の「管内の登録クラブだけ」が「する」なら管内の都府県（homePrefs）のクラブだけ、「しない」なら全国（ギガヘルツ。No.139）。
 * 取り込んだあと、管理用アカウントがシートで直してもよい（次に取り込むと上書きされる）
 */
function menuImportClubs() {
  requireMailAccount_('登録クラブ一覧の取り込み'); // 管理用アカウントだけ（シートの整理 D）
  const url = settingsRegulationValue_('登録クラブ一覧のURL'); // 規約のファイルの「規約_基本」（92_gas_settings.js。シートの整理 段階1）
  if (!url) throw new Error('規約のファイルの「規約_基本」の「登録クラブ一覧のURL」に、URLを入れてください');
  const id = /drive\.google\.com/.test(url) ? /[-\w]{25,}/.exec(url) : null;
  let blob;
  if (id) blob = DriveApp.getFileById(id[0]).getBlob();
  else {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) throw new Error('登録クラブ一覧のページを読めませんでした（' + res.getResponseCode() + '）：' + url);
    blob = res.getBlob();
  }
  const cfg = loadConfig_();
  const homeOnly = !cfg.clubCompetition || cfg.clubCompetition.homeClubsOnly !== false;
  const clubs = parseClubList(decodeLogBlob_(blob), homeOnly ? cfg.homePrefs : null); // decodeLogBlob_ は 96_gas_intake.js（UTF-8で読めなければShift_JIS）
  if (!clubs.length) throw new Error('ページから登録クラブを読み取れませんでした。ページの形が変わった可能性があります：' + url);
  writeClubs_(clubs, url);
  const n = {};
  clubs.forEach(function (c) { n[c.pref] = (n[c.pref] || 0) + 1; });
  const inHome = cfg.homePrefs.reduce(function (a, p) { return a + (n[p] || 0); }, 0);
  const detail = cfg.homePrefs.map(function (p) { return PREF_TABLE[p] + ' ' + (n[p] || 0) + 'クラブ'; }).join('、') +
    (homeOnly ? '' : '、ほかの都道府県 ' + (clubs.length - inHome) + 'クラブ（全国）');
  logHistory_('登録クラブ一覧を取り込みました（' + detail + '）：' + url);
  SpreadsheetApp.getUi().alert('登録クラブを取り込みました（' + detail + '）。\n規約のファイルの「' + SHEET_CLUBS + '」シートで確かめてください。足りないクラブは行を足して入れられます。');
}

function writeClubs_(clubs, url) {
  const sh = resetImportSheet_(SHEET_CLUBS, CLUBS_HEADER);
  const today = importDateToday_();
  const rows = clubs.map(function (c, i) { return [c.no, c.name, PREF_TABLE[c.pref] || '', i === 0 ? url : '', today]; });
  sh.getRange(2, 1, rows.length, CLUBS_HEADER.length).setNumberFormat('@').setValues(rows);
}

/** 規約のファイルのシート name を読む（シートがなければ null。作らない） */
function settingsBookSheet_(name) {
  return book_(BOOK_SETTINGS).getSheetByName(name); // 91_gas_books.js
}

/** 「登録クラブ一覧」シート（規約のファイル）を読む。{登録番号: {no, name, pref}}。シートがない・空なら null */
function loadClubs_() {
  const sh = settingsBookSheet_(SHEET_CLUBS);
  if (!sh || sh.getLastRow() < 2) return null;
  const out = {};
  let n = 0;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
    const no = normalizeClubNumber(r[0]);
    if (no && !out[no]) { out[no] = { no: no, name: String(r[1]).trim(), pref: clubPref(no) }; n++; }
  });
  return n ? out : null;
}

/** 予備：JARLの市郡区番号リストを取り込み、規約のファイルの「マルチ一覧」シートに書く（管理用アカウントだけ） */
function menuImportMaster() {
  requireMailAccount_('JARLのナンバー一覧の取り込み'); // 管理用アカウントだけ（シートの整理 D）
  let entries = defaultPrefEntries();
  JARL_LIST_URLS.forEach(function (url) {
    const text = UrlFetchApp.fetch(url).getContentText('Shift_JIS');
    entries = entries.concat(parseJarlNumberList(text));
  });
  writeMaster_(entries);
  logHistory_('JARLのナンバー一覧を取り込みました（' + entries.length + '件）');
  SpreadsheetApp.getUi().alert('ナンバーを ' + entries.length + ' 件取り込みました。');
}

/** 「マルチ一覧」シート（規約のファイル）を読む。A〜F 列（ナンバー｜種類｜都府県番号｜名称｜有効開始｜有効終了） */
function loadMaster_() {
  const sh = settingsBookSheet_(SHEET_MASTER);
  if (!sh || sh.getLastRow() < 2) throw new Error('規約のファイルの「' + SHEET_MASTER + '」が空です。先に「2. マルチ一覧（zLogのDAT）を取り込む」を実行してください');
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues();
  return new NumberMaster(v.map(function (r) {
    return { no: r[0], kind: r[1], pref: r[2], name: r[3],
      validFrom: r[4] ? jstStringToMinutes(r[4]) : null, validTo: r[5] ? jstStringToMinutes(r[5]) : null };
  }));
}

/**
 * マルチ一覧・登録クラブ一覧を取り込んだ日（「取り込んだ日」の列のいちばん新しい日）。{シート名: 'YYYY-MM-DD'}。
 * 中身がない・日が書かれていないシートは入れない。審査で、開催の年より前なら「要確認」の全体の欄に注意を出す（importDateAlerts。20_judge.js）
 */
function loadImportDates_() {
  const out = {};
  [[SHEET_MASTER, MASTER_HEADER], [SHEET_CLUBS, CLUBS_HEADER]].forEach(function (x) {
    const sh = settingsBookSheet_(x[0]);
    if (!sh || sh.getLastRow() < 2) return;
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
    const col = head.indexOf(IMPORT_DATE_LABEL);
    if (col < 0) return;
    let last = '';
    sh.getRange(2, col + 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
      const d = parseDateText(r[0]);
      if (d && d > last) last = d;
    });
    if (last) out[x[0]] = last;
  });
  return out;
}

// ------------------------------------------------------------------ 局の一覧（シートの整理 G。審査担当）
/**
 * 「局の一覧」シート（審査のファイルの2枚目。1局1行）。左側はプログラムが書き（見るだけ）、右側は委員が書く。
 * 前の「局区分の例外リスト」「種目の変更」「受付局リスト」「前年の確認結果（参考）」と、受付履歴の「委員会の扱い」をまとめたもの。
 * 行は呼出符号の本体（移動表示を除いたもの。normalizeCall の base）と開催部門で見つける（stationKey_。開催部門のないコンテストは呼出符号の本体だけ）。
 *   stationListWriteLeft_(entries) … 左側を書く（受付担当も使う）。右側は消さない
 *   stationListRead_() … 全部の行を読む（右側の委員の判断を使うとき。受付担当は「採用する受付番号」を読む）
 */
function stationSheet_() {
  const sh = bookSheet_(BOOK_JUDGE, SHEET_STATION_LIST); // 91_gas_books.js
  let head = sh.getLastRow() >= 1 ? sh.getRange(1, 1, 1, STATION_LIST_HEADER.length).getDisplayValues()[0] : [];
  // 前の版の局の一覧（2列めが「開催部門」でない）：呼出符号の右に列を差し込む（中身は右へずれるだけで消えない。No.145）
  if (String(head[0]).trim() === STATION_LIST_HEADER[0] && String(head[1]).trim() !== STATION_LIST_HEADER[1]) {
    sh.insertColumnAfter(1);
    sh.getRange(1, 2).setValue(STATION_LIST_HEADER[1]).setFontWeight('bold');
    bookTry_(function () { sh.getRange(1, 2).setBackground(STATION_COLORS.left); });
    head = sh.getRange(1, 1, 1, STATION_LIST_HEADER.length).getDisplayValues()[0];
  }
  if (String(head[0]).trim() !== STATION_LIST_HEADER[0]) {
    if (sh.getLastRow() > 1) throw new Error('「' + SHEET_STATION_LIST + '」シートの1行目の見出しが違います。1行目に見出し（' + STATION_LIST_HEADER.join('｜') + '）を入れてください');
    sh.clear(); // 何もないか、「1. 初期設定」が入れた案内の1行だけ
    sh.getRange(1, 1, 1, STATION_LIST_HEADER.length).setValues([STATION_LIST_HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
    bookTry_(function () {
      sh.getRange(1, 1, 1, STATION_LEFT_COLS).setBackground(STATION_COLORS.left);
      sh.getRange(1, STATION_LEFT_COLS + 1, 1, STATION_LIST_HEADER.length - STATION_LEFT_COLS).setBackground(STATION_COLORS.right);
    });
  } else {
    // 前の版で作ったシートには、あとから足した右側の列（「公開する理由」など）の見出しがない。空いていれば足す
    STATION_LIST_HEADER.forEach(function (h, i) {
      if (i < STATION_LEFT_COLS || String(head[i] == null ? '' : head[i]).trim() !== '') return;
      sh.getRange(1, i + 1).setValue(h).setFontWeight('bold');
      bookTry_(function () { sh.getRange(1, i + 1).setBackground(STATION_COLORS.right); });
    });
  }
  return sh;
}

const STATION_PROTECT_DESC = '局の一覧の左側（プログラムが書く列。90_gas_main.js）';

/**
 * 「局の一覧」の左側（プログラムが書く6列）に「警告だけ」の守りをかける（前にかけたものは外してかけ直す。シートの整理 D）。
 * 右側（委員が書く列）は守らない。かけられないときは止めずに、その文を返す（かけられたら ''）
 */
function protectStationLeft_() {
  const sh = stationSheet_();
  const w = bookTry_(function () {
    sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { if (p.getDescription() === STATION_PROTECT_DESC) p.remove(); });
    sh.getRange(1, 1, sh.getMaxRows(), STATION_LEFT_COLS).protect().setDescription(STATION_PROTECT_DESC).setWarningOnly(true);
  });
  return w ? '「' + SHEET_STATION_LIST + '」の左側に守り方をかけられませんでした（' + w + '）' : '';
}

/** 「局の一覧」の全部の行。[{row（シートの行番号）, call, base, section（開催部門）, key（stationKey_）, count, adoptedNo, status, category, prevCls, cls, change, adoptNo, reason, by, publicReason, specialAward}] */
function stationListRead_() {
  const sh = stationSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const t = function (v) { return String(v == null ? '' : v).trim(); };
  return sh.getRange(2, 1, n, STATION_LIST_HEADER.length).getDisplayValues().map(function (r, i) {
    const c = normalizeCall(r[0]);
    const section = t(r[SC['開催部門']]);
    return { row: i + 2, call: t(r[0]), base: c.base, section: section, key: stationKey_(c.base, section), count: t(r[SC['提出回数']]), adoptedNo: t(r[SC['採用中の受付番号']]),
      status: t(r[SC['受付の状態']]), category: t(r[SC['申告の種目']]), prevCls: t(r[SC['前年の局区分（参考）']]),
      cls: t(r[SC['局区分（管内局／管外局）']]), change: t(r[SC['種目の変更']]).toUpperCase(), adoptNo: t(r[SC['採用する受付番号']]),
      reason: t(r[SC['理由']]), by: t(r[SC['決めた委員']]), publicReason: t(r[SC['公開する理由']]), specialAward: t(r[SC['特別賞']]) };
  }).filter(function (x) { return x.base; });
}

/**
 * 「局の一覧」の左側（プログラムが書く列）を書く。受付担当も使う。
 *   entries：[{call, section, count, adoptedNo, status, category}]。call のほかは書き換える項目だけ渡す（undefined・null の項目は今のまま）
 *     section＝開催部門名（開催部門のあるコンテストだけ。行は「局と開催部門」ごと。空・なしなら呼出符号だけで見つける。No.145）
 *     count＝提出回数、adoptedNo＝採用中の受付番号、status＝受付の状態、category＝申告の種目
 * 呼出符号の本体と開催部門で行を見つけ、なければ最後に足す（足した行の「前年の局区分（参考）」は、前の年の局の一覧から入れる）。
 * 右側（委員が書く列）は書かない。戻り値：{added（足した行の数）, updated（書き換えた行の数）, addedRows（足した行。{stationKey_: シートの行番号}）}
 */
function stationListWriteLeft_(entries) {
  const sh = stationSheet_();
  const L = STATION_LEFT_COLS;
  const n = sh.getLastRow() - 1;
  const left = n > 0 ? sh.getRange(2, 1, n, L).getDisplayValues() : [];
  const index = {};
  left.forEach(function (r, i) {
    const k = stationKey_(normalizeCall(r[0]).base, String(r[SC['開催部門']] || '').trim());
    if (normalizeCall(r[0]).base && index[k] == null) index[k] = i;
  });
  let prev = null, added = 0;
  const touched = {}, addedRows = {};
  (entries || []).forEach(function (e) {
    const c = normalizeCall(e && e.call);
    if (!c.base) return;
    const section = String((e && e.section) || '').trim();
    const key = stationKey_(c.base, section);
    let i = index[key];
    if (i == null) {
      if (!prev) prev = previousStationClasses_();
      const row = []; for (let k = 0; k < L; k++) row.push('');
      row[0] = String(e.call).trim().toUpperCase();
      row[SC['開催部門']] = section;
      row[SC['前年の局区分（参考）']] = prev[c.base] || '';
      i = index[key] = left.length;
      left.push(row);
      added++;
      addedRows[key] = i + 2;
    }
    const row = left[i];
    const set = function (col, v) { if (v !== undefined && v !== null) row[SC[col]] = String(v); };
    set('提出回数', e.count); set('採用中の受付番号', e.adoptedNo); set('受付の状態', e.status); set('申告の種目', e.category);
    touched[i] = true;
  });
  if (left.length) sh.getRange(2, 1, left.length, L).setNumberFormat('@').setValues(left);
  return { added: added, updated: Object.keys(touched).length - added, addedRows: addedRows };
}

/**
 * 前の年の「局の一覧」の局区分（委員が決めたもの）。{呼出符号の本体: '管内局'|'管外局'}。
 * 前の年のファイルは「基本設定」の「前年の審査用スプレッドシート」。空・開けない・局の一覧がないときは {}（参考なので止めない）
 */
function previousStationClasses_() {
  const out = {};
  try {
    const m = /[-\w]{25,}/.exec(basicValue_(GUIDE_PREV_LABEL)); // 99_gas_guidemail.js（「前年の審査用スプレッドシート」）
    if (!m) return out;
    const sh = SpreadsheetApp.openById(m[0]).getSheetByName(SHEET_STATION_LIST);
    if (!sh || sh.getLastRow() < 2) return out;
    const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
    const col = v[0].map(function (h) { return String(h).trim(); }).indexOf('局区分（管内局／管外局）');
    if (col < 0) return out;
    v.slice(1).forEach(function (r) {
      const b = normalizeCall(r[0]).base, cls = String(r[col]).trim();
      if (b && (cls === '管内局' || cls === '管外局')) out[b] = cls;
    });
  } catch (e) { /* 参考なので、読めなくても止めない */ }
  return out;
}

// 次の load…_(rows) の rows は stationListRead_() の戻り値。審査では1回だけ読んで渡す（なければ読む。申し送り No.106 の案B）
// 種目の変更・公開する理由・特別賞の鍵は stationKey_（開催部門のあるコンテストは「呼出符号の本体|開催部門」。No.145）。
// 局区分（loadExceptions_）は、同じ局のどれか1つの行に書けば全部の開催部門に使う

/** 委員会が決めた局区分（局の一覧の右側の「局区分」）。judgeContest の options.exceptions の形 */
function loadExceptions_(rows) {
  return (rows || stationListRead_()).filter(function (x) { return x.cls === '管内局' || x.cls === '管外局'; })
    .map(function (x) { return { call: x.call, cls: x.cls, memo: [x.reason, x.by].filter(String).join(' ') }; });
}

/** 前の年の局区分（局の一覧の左側の「前年の局区分（参考）」）。judgeContest の options.previousExceptions の形（参考のアラートだけに使う） */
function loadPreviousExceptions_(rows) {
  return (rows || stationListRead_()).filter(function (x) { return x.prevCls === '管内局' || x.prevCls === '管外局'; })
    .map(function (x) { return { call: x.call, cls: x.prevCls, memo: '前の年の局の一覧' }; });
}

/** 委員会による種目の変更（局の一覧の右側の「種目の変更」。呼出符号の本体 → 種目コード）。チェックログへの変更にも使う */
function loadCategoryChanges_(rows) {
  const out = {};
  (rows || stationListRead_()).forEach(function (x) { if (x.change) out[x.key] = x.change; });
  return out;
}

/** 局の一覧の「公開する理由」。{呼出符号の本体: 文}（委員会がチェックログにした局の理由として、結果に出す。申し送り No.100） */
function loadPublicReasons_(rows) {
  const out = {};
  (rows || stationListRead_()).forEach(function (x) { if (x.publicReason) out[x.key] = x.publicReason; });
  return out;
}

/** 局の一覧の「特別賞」。{呼出符号の本体: 書いた文（「、」で2つ以上）}（委員が局を選んで付ける賞。分けるのは審査の buildContext。No.139） */
function loadSpecialAwards_(rows) {
  const out = {};
  (rows || stationListRead_()).forEach(function (x) { if (x.specialAward) out[x.key] = x.specialAward; });
  return out;
}

/**
 * コンテストの設定を作る。規約は規約のファイル（別のスプレッドシート。92_gas_settings.js）から読む。
 * コンテスト名・開催回・ジュニア部門の生年月日の区切り・開催期間（開催期間1〜3）は「基本設定」から読む
 */
function loadConfig_() {
  return settingsConfigWithBasic_(SpreadsheetApp.getActiveSpreadsheet(), loadSettingsConfig_()); // 92_gas_settings.js
}

function basicValue_(label) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BASIC);
  if (!sh) return '';
  const v = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === label) return String(v[i][1]).trim();
  return '';
}

/** 文字コードを判定して読む（UTF-8で読めなければShift_JIS） */
function readLogText_(file) {
  return decodeLogBlob_(file.getBlob()); // 96_gas_intake.js
}

const LCR_FOLDER_NAME = 'LCR';
const LCR_DATA_FILE = '_LCRデータ.json';
const TIME_BUDGET_MS = 4.5 * 60 * 1000; // 1回の実行の上限（6分）より手前で区切る

/**
 * 審査・確定を始めてよいか（ログを読む前に確かめる。申し送り No.179）。始められなければ、委員に見せる文を返す（始めてよければ ''）。
 *   ・規約がまだ入っていない（空のテンプレート。種目もバンドもない。settingsTablesEmpty・SETTINGS_EMPTY_MESSAGE は 11_settings.js）
 *   ・「基本設定」のコンテスト名・開催期間1が空
 * 規約の中身のまちがい（種目の書き方など）は、ここでは見ない（審査の中の loadConfig_ が分かる言葉で止める）
 */
function judgeNotReady_(what) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let empty = false;
  try { empty = settingsTablesEmpty(readSettingsTables_(settingsSpreadsheet_())); } catch (e) { /* 規約のファイルが開けないときは、審査の中で分かる言葉で止まる */ }
  if (empty) return what + 'ができません。' + SETTINGS_EMPTY_MESSAGE + '（「規約をテキストから読み込む」は管理用アカウントで実行します）';
  const notes = [];
  if (!settingsBasicValue_(ss, 'コンテスト名')) notes.push('「基本設定」の「コンテスト名」が空です');
  const p1 = settingsBasicRows_(ss).filter(function (r) { return String(r[0]).trim() === '開催期間1'; })[0] || [];
  if (!String(p1[1] == null ? '' : p1[1]).trim() || !String(p1[2] == null ? '' : p1[2]).trim()) {
    notes.push('「基本設定」の「開催期間1」が空です（B 列に開始日時、C 列に終了日時。例：2026-05-09 21:00）');
  }
  return notes.length ? what + 'ができません。' + notes.join('。') + '。書いてから、もう一度実行してください。' : '';
}

function menuJudgeFolder() {
  const startedAt = Date.now();
  const notReady = judgeNotReady_('審査');
  if (notReady) { SpreadsheetApp.getUi().alert(notReady); return; }
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) {
    SpreadsheetApp.getUi().alert('ほかの委員が審査の処理をしています。終わってから、もう一度実行してください。');
    return;
  }
  try {
    const j = judgeFolderNow_(startedAt, '審査', true);
    writeResult_(j.result);
    const added = addSuggestedCalls_(j.result.suggestions);
    saveLcrData_(j.result, j.folder);
    logHistory_('ログ ' + j.logs.length + ' 件を審査しました（' + judgeTimes_(j, startedAt) + '）');
    if (added) logHistory_('委員会の確認が必要な局を「' + SHEET_STATION_LIST + '」に足しました（' + added + ' 局）');
    SpreadsheetApp.getUi().alert('ログ ' + j.logs.length + ' 件を審査しました。「審査結果」（部門別の順位）、「局別一覧」、「要確認」のシートを見てください。\n\n' +
      (added ? '委員会の確認が必要な局を、「' + SHEET_STATION_LIST + '」に ' + added + ' 局、新しく足しました。確かめることは「要確認」シートにあります。' +
        '右側の「局区分」「種目の変更」をプルダウンで選んでから、もう一度審査してください（空欄のままなら今までどおりの扱いです）。\n\n' : '') +
      'LCRのファイルは、続けて「4. LCRをファイルに書き出す」を実行すると作られます。');
  } finally {
    lock.releaseLock();
  }
}

/**
 * 提出ログのフォルダのログを読んで審査する（シートには書かない）。「3. フォルダのログを審査する」と「審査結果を確定する」で使う。
 *   startedAt：メニューを始めた時刻（確定の確かめの画面を待つ間も、1回の実行の時間に入る）、what：履歴に書く処理の名前
 *   dropdowns：true なら、局の一覧のプルダウンを付け直す（「3.」だけ。確定では付け直さない。申し送り No.106 の案B）
 * 時間が足りなくなりそうなら（TIME_BUDGET_MS）、シートを書き換える前にやめて、履歴に書き、エラーで知らせる（申し送り No.106）。
 * 戻り値：{result, logs, folder, t0, tPrep, t1, t2}（t は時刻。かかった時間を履歴に書くため）
 */
function judgeFolderNow_(startedAt, what, dropdowns) {
  const t0 = Date.now();
  const timeUp = function (where) {
    if (Date.now() - startedAt <= TIME_BUDGET_MS) return;
    const msg = '時間が足りなくなりそうなので、' + what + 'を途中でやめました（' + where + '。始めてから ' +
      Math.round((Date.now() - startedAt) / 1000) + '秒）。シートは書き換えていません';
    logHistory_(msg);
    throw new Error(msg + '。少し待ってから、もう一度実行してください。');
  };
  if (dropdowns) setupJudgeDropdowns_(); // 局の一覧に足した行にもプルダウンを付ける
  const tPrep = Date.now();
  const folder = logFolder_();
  const read = readFolderLogs_(folder, timeUp); // 前に読んだログは、まとめのファイルから使う（No.126）
  const logs = read.logs;
  const t1 = Date.now();
  const stations = stationListRead_(); // 局の一覧は1回だけ読む
  const result = judgeContest(logs, loadConfig_(), loadMaster_(),
    { exceptions: loadExceptions_(stations), previousExceptions: loadPreviousExceptions_(stations),
      categoryOverrides: loadCategoryChanges_(stations), publicReasons: loadPublicReasons_(stations), specialAwards: loadSpecialAwards_(stations),
      clubs: loadClubs_(), importDates: loadImportDates_() });
  timeUp('ログ ' + logs.length + ' 件を審査したところ');
  return { result: result, logs: logs, folder: folder, read: read, t0: t0, tPrep: tPrep, t1: t1, t2: Date.now() };
}

// 提出ログのフォルダに置く、読んだログのまとめ（申し送り No.126。docs/ドライブのフォルダの作り.md）
const LOG_CACHE_NAME = '_審査で読んだログのまとめ（消さないでください）.json';
const LOG_CACHE_VERSION = 1;

/**
 * 提出ログのフォルダのログを読む。前に読んだログは、まとめのファイル（LOG_CACHE_NAME）に入れておき、
 * ファイルの番号（ID）と更新日時が前と同じなら、ファイルを開かずに、まとめの中身を使う。
 * 増えた・変わったログだけ読み直し、消えたログはまとめから除く。まとめがない・壊れている・番号や更新日時が分からないときは読み直す。
 * timeUp(where) は時間の確かめ（足りなければ例外）。止まる前に、読んだ所までをまとめに書く（もう一度実行すると、その分は速く読める）。
 * 戻り値：{logs: [{id（ファイル名）, parsed, receivedAt}], reread（読み直した件数）, cached（まとめから使った件数）,
 *          readMs（ファイルを開いて読んだ時間）, cacheMs（まとめを読み書きした時間）, cacheError（まとめを書けなかった理由。書けたら ''）}
 */
function readFolderLogs_(folder, timeUp) {
  let t = Date.now();
  const cache = loadLogCache_(folder);
  const out = { logs: [], reread: 0, cached: 0, readMs: 0, cacheMs: Date.now() - t, cacheError: '' };
  const old = cache ? cache.files : {}, next = {};
  let changed = !cache;
  const save = function (files) {
    const t2 = Date.now();
    out.cacheError = saveLogCache_(folder, files);
    out.cacheMs += Date.now() - t2;
  };
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    if (name === LOG_CACHE_NAME) continue;
    if (!/\.(txt|log|tex)$/i.test(name) && f.getMimeType() !== 'text/plain') continue;
    let id = '', updated = null;
    try { id = f.getId(); updated = f.getLastUpdated().getTime(); } catch (e) { /* 見分けられなければ読み直す */ }
    let item = id && updated != null ? old[id] : null;
    if (item && item.updated === updated && typeof item.text === 'string') out.cached++;
    else {
      t = Date.now();
      item = { updated: updated, created: f.getDateCreated().getTime(), text: readLogText_(f) };
      out.readMs += Date.now() - t;
      out.reread++;
      changed = true;
    }
    if (id && updated != null) next[id] = item;
    out.logs.push({ id: name, parsed: parseJarlLog(item.text), receivedAt: new Date(item.created) });
    if (out.logs.length % 20 === 0) {
      try { timeUp('ログを ' + out.logs.length + ' 件まで読んだところ'); } catch (e) {
        if (changed) save(Object.assign({}, old, next)); // まだ見ていないログの分は、前のまとめのまま残す
        throw e;
      }
    }
  }
  if (Object.keys(old).some(function (k) { return !next[k]; })) changed = true; // 消えたログ
  if (changed) save(next);
  return out;
}

/** まとめのファイルを読む。{version, savedAt, files: {ファイルの番号: {updated, created, text}}}。ない・壊れているときは null */
function loadLogCache_(folder) {
  try {
    const it = folder.getFilesByName(LOG_CACHE_NAME);
    if (!it.hasNext()) return null;
    const d = JSON.parse(it.next().getBlob().getDataAsString('UTF-8'));
    return d && d.version === LOG_CACHE_VERSION && d.files && typeof d.files === 'object' ? d : null;
  } catch (e) {
    return null;
  }
}

/** まとめのファイルを書く（新しいファイルを作ってから、前のものをごみ箱に移す）。書けなくても止めずに、その理由を返す（書けたら ''） */
function saveLogCache_(folder, files) {
  try {
    const old = [], it = folder.getFilesByName(LOG_CACHE_NAME);
    while (it.hasNext()) old.push(it.next());
    folder.createFile(LOG_CACHE_NAME, JSON.stringify({ version: LOG_CACHE_VERSION, savedAt: new Date().toISOString(), files: files }), 'application/json');
    old.forEach(function (f) { f.setTrashed(true); });
    return '';
  } catch (e) {
    return e.message;
  }
}

/**
 * 履歴に書く、かかった時間（準備・読み込み・審査・書き込み・全体）。j は judgeFolderNow_ の戻り値。
 * 読み込みには、読み直した件数・まとめから使った件数と、その内訳（ファイルを開いて読んだ・まとめの読み書き・ファイルの確かめ）を付ける（No.126）
 */
function judgeTimes_(j, startedAt) {
  const sec = function (ms) { return Math.round(ms / 100) / 10; };
  const now = Date.now(), r = j.read;
  const check = Math.max(0, (j.t1 - j.tPrep) - r.readMs - r.cacheMs);
  return '準備 ' + sec(j.tPrep - j.t0) + '秒・読み込み ' + sec(j.t1 - j.tPrep) + '秒（読み直した ' + r.reread + '件・まとめから ' + r.cached +
    '件。ファイルを開いて読む ' + sec(r.readMs) + '秒・まとめの読み書き ' + sec(r.cacheMs) + '秒・ファイルの確かめ ' + sec(check) + '秒' +
    (r.cacheError ? '。まとめを書けませんでした：' + r.cacheError : '') + '）・審査 ' + sec(j.t2 - j.t1) +
    '秒・書き込み ' + sec(now - j.t2) + '秒・全体 ' + sec(now - startedAt) + '秒';
}

/**
 * シートの中身を、1回の書き込みで rows に置き換える。前の中身のほうが大きければ、はみ出した所は空の文字で上書きする。
 * 「消してから書く」と、途中で止まったときや、書いている間に結果のページが読んだときに、空や書きかけのシートになるため（申し送り No.106）。
 * 戻り値：{range（書いた範囲）, values（書いた中身。はみ出しの空の行も入る）}。色などを付けるため。rows も前の中身もなければ null
 */
function replaceSheetValues_(sh, rows, numberFormat) {
  const width = Math.max(rows.length ? rows[0].length : 0, sh.getLastColumn());
  const height = Math.max(rows.length, sh.getLastRow());
  if (!width || !height) return null;
  const out = [];
  for (let i = 0; i < height; i++) {
    const r = rows[i] || [], o = [];
    for (let k = 0; k < width; k++) o.push(k < r.length && r[k] != null ? r[k] : '');
    out.push(o);
  }
  const range = sh.getRange(1, 1, height, width);
  if (numberFormat) range.setNumberFormat(numberFormat);
  range.setValues(out);
  return { range: range, values: out };
}

function logFolder_() {
  const url = basicValue_('ログのフォルダ');
  const m = /[-\w]{25,}/.exec(url);
  if (!m) throw new Error('「基本設定」シートに、ログのフォルダのURLを入れてください');
  return DriveApp.getFolderById(m[0]);
}

/** LCR のファイル名に使えない文字（/ \\ : * ? " < > | と空白）を「_」にする（メール送信担当） */
function lcrFilePart_(s) {
  return String(s).replace(/[\/\\:*?"<>|\s]/g, '_');
}

/**
 * 審査のたびに、前のLCRフォルダをごみ箱に移して作り直し、全局分のLCRの文面を1つのファイルにまとめて置く。
 * （局ごとのファイルを作るのは時間がかかるので、「4. LCRをファイルに書き出す」で分けて行う）
 */
function saveLcrData_(result, folder) {
  const it = folder.getFoldersByName(LCR_FOLDER_NAME);
  while (it.hasNext()) it.next().setTrashed(true);
  const out = folder.createFolder(LCR_FOLDER_NAME);
  // どの開催部門の種目にも当たらないログ（委員が「種目の変更」で直すまで、順位にも入れない）の LCR は作らない（申し送り No.150）
  const items = result.logs.filter(function (l) { return !l.sectionUnknown; }).map(function (l) {
    // email・logFile・category はLCRのメール送信（97_gas_lcrmail.js）、opName（サマリーのNAME）は参加証（94_gas_certificate.js）で使う。
    // section：開催部門名（なければ ''）。ファイル名は「LCR_JA0RL_7MHz部門.txt」（開催部門がなければ「LCR_JA0RL.txt」）
    const section = String(l.section || '');
    return { name: 'LCR_' + lcrFilePart_(l.call.full) + (section ? '_' + lcrFilePart_(section) : '') + '.txt', call: l.call.full, text: buildLcr(l, result),
      category: l.categoryCode || '', email: String(l.parsed.summary.EMAIL || ''), logFile: String(l.id || ''),
      opName: String(l.parsed.summary.NAME || '').trim(), section: section };
  });
  // 同じ呼出符号のログが2つ以上あるとファイル名が重なるので、番号を付けて分ける
  const seen = {};
  items.forEach(function (x) {
    if (seen[x.name]) { seen[x.name]++; x.name = x.name.replace(/\.txt$/, '_' + seen[x.name] + '.txt'); }
    else seen[x.name] = 1;
  });
  out.createFile(LCR_DATA_FILE, JSON.stringify({ createdAt: new Date().toISOString(), items: items }), MimeType.PLAIN_TEXT);
}

/**
 * 審査結果・局別一覧・要確認のシートを書く。どのシートも、消さずに1回の書き込みで置き換える（replaceSheetValues_）。
 * 表彰する局の行の色は1回で付ける（1行ずつ付けると、局が多いとき時間がかかる。申し送り No.106）
 */
function writeResult_(result) {
  // 審査結果：部門ごとに順位の順で並べる
  const res = bookSheet_(BOOK_JUDGE, SHEET_RESULT); // 91_gas_books.js（なければ決まった場所に作る）
  res.setFrozenRows(0);
  const rk = buildRankingTable(result, { sheet: true }); // シートだけ交信局数を2列（ログ・審査後）にする（No.132）
  const out = replaceSheetValues_(res, rk.rows);
  const width = rk.rows[0].length;
  const set = function (list) { const o = {}; (list || []).forEach(function (i) { o[i] = true; }); return o; };
  const title = set(rk.titleRows), header = set(rk.headerRows), award = set(rk.awardRows); // 表彰する局・クラブの行にも色
  // 色は全部の行を1回で付ける（前の中身の残りの行は色を消す）。太字・大きさは、いったん全部を戻してから、見出しの行だけに付ける
  out.range.setFontWeight('normal').setFontSize(10).setBackgrounds(out.values.map(function (r, i) {
    const c = award[i] ? '#fff2cc' : header[i] ? '#f1f3f4' : title[i] ? '#dde7f3' : null;
    return r.map(function () { return c; });
  }));
  rk.titleRows.forEach(function (i) { res.getRange(i + 1, 1, 1, width).setFontWeight('bold').setFontSize(12); });
  rk.headerRows.forEach(function (i) { res.getRange(i + 1, 1, 1, width).setFontWeight('bold'); });
  res.autoResizeColumns(1, width);

  // 局ごとの一覧（呼出符号順）は別のシートに残す
  const lst = bookSheet_(BOOK_JUDGE, SHEET_STATIONS);
  const table = buildCommitteeTable(result);
  const body = table.slice(1).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
  const all = [table[0]].concat(body);
  replaceSheetValues_(lst, all);
  lst.getRange(1, 1, 1, all[0].length).setFontWeight('bold');
  lst.setFrozenRows(1);

  const al = bookSheet_(BOOK_JUDGE, SHEET_ALERTS);
  // 開催部門のあるコンテスト（新潟）は、呼出符号の右に列「開催部門」（No.145）
  const bySection = !!(result.sections && result.sections.length);
  const row = function (call, section, a) { return bySection ? [call, section || '', a.level, a.message] : [call, a.level, a.message]; };
  const rows = [bySection ? ['呼出符号', '開催部門', '区分', '内容'] : ['呼出符号', '区分', '内容']];
  result.alerts.forEach(function (a) { rows.push(row('（全体）', a.section, a)); });
  result.logs.forEach(function (l) {
    l.alerts.forEach(function (a) { rows.push(row(l.call.full, l.section, a)); });
  });
  const ar = replaceSheetValues_(al, rows).values;
  const lv = bySection ? 2 : 1; // 区分の列
  al.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  // 区分の色：要確認・不備は赤、注意は黄色、情報は薄い青（前の中身の残りの行は色を消す）
  if (ar.length > 1) {
    al.getRange(2, lv + 1, ar.length - 1, 1).setBackgrounds(ar.slice(1).map(function (r) { return [ALERT_COLORS[r[lv]] || null]; }));
  }
  al.setFrozenRows(1);
}

/**
 * メニュー「審査結果を確定する」（管理用アカウントだけ）：審査をもう一度行い、その結果から「確定結果」シートを作る（結果のページに出る）。
 * 「審査結果」シートの表示は写さない（シートを手で直しても、公開される結果は変わらない。シートの整理 D）。
 * 審査結果・局別一覧・要確認のシートも、この審査の結果で書き直す（LCRのデータは作り直さない）。
 * 何度でもやり直せる（上書き）。形は buildConfirmedResult（30_lcr.js）。
 * 確定結果は、審査が終わってから、いちばん先に1回の書き込みで置き換える。途中で止まっても、前の確定結果が残る（空や書きかけにならない。No.106）
 */
function menuConfirmResult() {
  const startedAt = Date.now();
  requireMailAccount_('審査結果の確定'); // 管理用アカウントだけ（96_gas_intake.js。シートの整理 D）
  const ui = SpreadsheetApp.getUi();
  const notReady = judgeNotReady_('審査結果の確定'); // 規約・基本設定が空なら、確かめの画面を出す前に止める（No.179）
  if (notReady) { ui.alert(notReady); return; }
  const ok = ui.alert('審査結果を確定する', '提出ログのフォルダのログを、もう一度審査して、その結果を結果のページに出します（公開します）。\n' +
    'この結果を公開します。よろしいですか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) { ui.alert('ほかの委員が審査の処理をしています。終わってから、もう一度実行してください。'); return; }
  try {
    const j = judgeFolderNow_(startedAt, '審査結果の確定');
    const at = minutesToJst(Math.floor(Date.now() / 60000));
    const table = buildRankingTable(j.result).rows.map(function (r) { return r.map(function (v) { return v == null ? '' : String(v); }); });
    while (table.length && table[table.length - 1].every(function (v) { return v === ''; })) table.pop(); // 最後の空の行は入れない（前の版と同じ形）
    const rows = buildConfirmedResult(table, at, j.result); // チェックログの表に、局の一覧の種目の変更・公開する理由を足す（No.125）
    replaceSheetValues_(bookSheet_(BOOK_JUDGE, SHEET_CONFIRMED), rows, '@');
    const n = rows.filter(function (r) { return r[0] === '局' || r[0] === 'クラブ'; }).length;
    logHistory_('審査結果を確定しました（ログ ' + j.logs.length + ' 件をもう一度審査。確定日時 ' + at + '、局・クラブの行 ' + n + ' 行。' + judgeTimes_(j, startedAt) + '）');
    writeResult_(j.result);
    ui.alert('ログ ' + j.logs.length + ' 件をもう一度審査して、審査結果を確定しました（確定日時 ' + at + '）。結果のページに出ます（すぐに出すときは、結果のページのメニュー「すぐに新しい内容にする」）。\n' +
      '「審査結果」「局別一覧」「要確認」のシートも、この審査の結果にしました。ログや局の一覧を直したときは、もう一度「審査結果を確定する」を実行してください。');
  } finally {
    lock.releaseLock();
  }
}

/** メニュー「確定を取り消す」（管理用アカウントだけ）：「確定結果」シートを空にする（結果のページは「審査中です」に戻る） */
function menuCancelConfirm() {
  requireMailAccount_('確定の取り消し'); // 管理用アカウントだけ
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIRMED);
  if (!sh || sh.getLastRow() < 1) { ui.alert('まだ確定していません（「' + SHEET_CONFIRMED + '」シートは空です）。'); return; }
  const ok = ui.alert('確定を取り消す', '結果のページは「審査中です」に戻ります。よろしいですか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  sh.clear();
  logHistory_('審査結果の確定を取り消しました');
  ui.alert('確定を取り消しました。結果のページは「審査中です」になります。');
}

/** 「要確認」シートの区分の色 */
const ALERT_COLORS = { '要確認': '#f4cccc', '不備': '#f4cccc', '注意': '#fff2cc', '情報': '#cfe2f3' };

/**
 * 審査で使うシートの入力欄をプルダウンにする（打ち間違いを防ぐ）。何度実行してもよい。
 *   「局の一覧」の「局区分（管内局／管外局）」：管内局・管外局、「種目の変更」：種目表の種目コードと CHECKLOG
 *   「基本設定」の「ファイルの種類」：テンプレート・審査用
 * 種目コードは規約のファイルから読む（loadConfig_）。読めないときは、それを使うプルダウンだけ付けずに進み、
 * 読めなかった理由を返す（付けられたときは ''）。「1. 初期設定」が止まらないようにするため
 */
function setupJudgeDropdowns_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let cfg = null, error = '';
  try { cfg = loadConfig_(); } catch (e) { error = e.message; }
  const rule = function (list, help) {
    return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).setHelpText(help).build();
  };
  const st = stationSheet_();
  const column = function (head, list, help) {
    if (st.getMaxRows() < 2) return;
    st.getRange(2, SC[head] + 1, st.getMaxRows() - 1, 1).setDataValidation(rule(list, help));
  };
  column('局区分（管内局／管外局）', ['管内局', '管外局'], 'JARLへの照会結果（管内局・管外局）を選ぶ。空なら種目のとおり');
  if (cfg) {
    const codes = cfg.categories.map(function (c) { return c.code; }).concat([cfg.checklogCodes[0]]);
    column('種目の変更', codes, '種目表の種目コードから選ぶ。チェックログにするときは ' + cfg.checklogCodes[0] + '。空なら申告のとおり');
  }
  const basic = ss.getSheetByName(SHEET_BASIC);
  if (basic && basic.getLastRow() > 1) {
    const labels = basic.getRange(2, 1, basic.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; });
    const i = labels.indexOf('ファイルの種類');
    if (i >= 0) basic.getRange(i + 2, 2).setDataValidation(rule(['テンプレート', '審査用'], 'テンプレートなら「テンプレート」、年ごとの審査用なら「審査用」'));
  }
  return error;
}

/**
 * 審査で見つかった、委員会の確認が必要な局（種目の変更・局区分の候補・サマリーシートに「チェックログ」とある局）を「局の一覧」に足す。
 * すでに行があれば何もしない（委員が入れた値は変えない）。確かめることは「要確認」シートに出ているので、ここには書かない。
 * 戻り値：足した局の数
 */
function addSuggestedCalls_(sg) {
  if (!sg) return 0;
  const checklogs = sg.checklogs || [];
  const entries = (sg.categoryChanges || []).concat(sg.exceptions || [], checklogs).map(function (x) { return { call: x.call, section: x.section || '' }; });
  if (!entries.length) return 0;
  const r = stationListWriteLeft_(entries);
  // サマリーシートに「チェックログ」とある局のうち、ログ全体がチェックログと確かに読めた局は、新しく足した行だけ
  // 「種目の変更」に CHECKLOG を入れる（委員が直した後は上書きしない。申し送り No.125）
  const sh = r.added ? stationSheet_() : null;
  checklogs.forEach(function (x) {
    const row = r.addedRows && r.addedRows[stationKey_(normalizeCall(x.call).base, x.section || '')];
    if (x.certain && row) sh.getRange(row, SC['種目の変更'] + 1).setValue(x.code);
  });
  if (r.added) setupJudgeDropdowns_(); // 足した行にもプルダウンを付ける
  return r.added;
}

/** LCRを局ごとのファイルに書き出す。時間が足りなければ途中で止め、もう一度実行すると続きから書く */
function menuWriteLcrFiles() {
  const ui = SpreadsheetApp.getUi();
  try { requireMailAccount_('LCRの書き出し'); } catch (e) { ui.alert(e.message); return; } // 管理用アカウントだけ（シートの整理 D）
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) { ui.alert('ほかの委員が処理をしています。終わってから、もう一度実行してください。'); return; }
  try {
    const t0 = Date.now();
    let folder;
    try { folder = logFolder_(); } catch (e) { ui.alert(e.message); return; } // ログのフォルダが空など（エラーで落とさない。申し送り No.181）
    const it = folder.getFoldersByName(LCR_FOLDER_NAME);
    if (!it.hasNext()) { ui.alert('先に「3. フォルダのログを審査する」を実行してください。'); return; }
    const out = it.next();
    const df = out.getFilesByName(LCR_DATA_FILE);
    if (!df.hasNext()) { ui.alert('先に「3. フォルダのログを審査する」を実行してください。'); return; }
    const data = JSON.parse(df.next().getBlob().getDataAsString('UTF-8'));
    // すでに書いたファイル（前回の続き）は飛ばす
    const done = {};
    const ex = out.getFiles();
    while (ex.hasNext()) done[ex.next().getName()] = true;
    // ファイルを続けて作ると、ドライブが一時的に断ること（「サービス エラー: ドライブ」）がある。
    // そのときは少し待って作り直す（5秒・10秒・20秒）。エラーでもファイルができていることがあるので、作り直す前に確かめる
    const createWithRetry = function (x) {
      const waits = [5000, 10000, 20000];
      for (let k = 0; ; k++) {
        try {
          out.createFile(x.name, x.text, MimeType.PLAIN_TEXT);
          return;
        } catch (e) {
          if (k >= waits.length) throw e;
          Utilities.sleep(waits[k]);
          if (out.getFilesByName(x.name).hasNext()) return;
        }
      }
    };
    let wrote = 0, stopped = false, driveError = '';
    for (let i = 0; i < data.items.length; i++) {
      const x = data.items[i];
      if (done[x.name]) continue;
      if (Date.now() - t0 > TIME_BUDGET_MS) { stopped = true; break; }
      try {
        createWithRetry(x);
      } catch (e) {
        // 作り直しても断られたら、ここで止める（もう一度実行すると続きから書く）
        driveError = String(e && e.message || e);
        break;
      }
      done[x.name] = true;
      wrote++;
    }
    const rest = data.items.filter(function (x) { return !done[x.name]; }).length;
    logHistory_('LCRを ' + wrote + ' 局分書き出しました' + (rest ? '（残り ' + rest + ' 局）' : '（全局完了）') +
      (driveError ? '。ドライブのエラーで止まりました：' + driveError : ''));
    if (driveError) {
      ui.alert('LCRを ' + wrote + ' 局分書き出したところで、ドライブのエラーで止まりました（' + driveError + '）。残りが ' + rest + ' 局あります。\n' +
        'ドライブが一時的に混んでいることが多いので、少し時間をおいて、もう一度「4. LCRをファイルに書き出す」を実行してください。続きから書き出します。');
    } else if (stopped || rest) {
      ui.alert('LCRを ' + wrote + ' 局分書き出しました。残りが ' + rest + ' 局あります。\n' +
        'もう一度「4. LCRをファイルに書き出す」を実行すると、続きから書き出します。');
    } else {
      ui.alert('LCRを書き出しました（全 ' + data.items.length + ' 局）。ログのフォルダの中の「LCR」フォルダにあります。');
    }
  } finally {
    lock.releaseLock();
  }
}

function logHistory_(text) {
  const sh = bookSheet_(BOOK_JUDGE, SHEET_HISTORY); // 91_gas_books.js（なければ決まった場所に、見出しを付けて作る）
  sh.appendRow([new Date(), Session.getActiveUser().getEmail() || '（不明）', text]);
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
// ===== 94_gas_certificate.js =====
/**
 * 参加証のPDFとメール送信（GAS専用。メール送信担当）
 *
 * 審査結果を確定したあと（「確定結果」シート）、参加した局ごとに参加証（ハガキの大きさ）のPDFを作り、
 * LCRとは別のメールで送る。全体の決まりは docs/指示書_参加証.md
 *
 *   見本を作る        : 差し込み口の入ったハガキの大きさのGoogleスライドを作り、「基本設定」の「参加証の見本」につなぐ
 *   参加証を作る      : 局ごとに見本をコピーして差し込み口を置き換え、PDFにして、ログのフォルダの「参加証」フォルダに置く。
 *                       時間が足りなければ途中で止め、もう一度押すと続きから作る。確定し直したあとは全部作り直す
 *   試しに自分に送る  : 1局目の参加証を、実行した人のアドレスに送る（状態は変えない）
 *   参加証を送る      : 「参加証送信」シートの「未送信」の局に、PDFを添付して送る。1日の上限を超える分は、次に押すと続きから送る
 *
 * 中身：種目・得点・順位は「確定結果」シート（公開した結果と同じ値）。氏名・送り先は、審査のときに作るLCRのデータ（_LCRデータ.json）
 * 文面：「返信文面」シートの「参加証の件名」「参加証の本文」「結び」。差出人名は「主催者」、返信先は「問い合わせ先」（案内メールと同じ）
 * シート：「参加証送信」「返信文面」はメールのファイル（91_gas_books.js の BOOK_MAIL）
 * 見本・メールでは {受付ページのURL} {委員会URL} {レコードのページのURL} なども使える（使っていて空なら止める。99_gas_guidemail.js の MAIL_LINK_LABELS）
 * 見本を作る・参加証を作る・送るは、管理用アカウントだけ（シートの整理 D。見本を作るは「基本設定」の守られた行に書くため）
 */

const CERT_SAMPLE_LABEL = '参加証の見本';
const CERT_FOLDER_NAME = '参加証';
const CERT_STATE_FILE = '_参加証の作成.json'; // 「参加証」フォルダの中。どの確定結果から作ったか
const SHEET_CERTMAIL = '参加証送信';
const CERT_TIME_LIMIT_MS = 4.5 * 60 * 1000; // 6分の制限より前に切り上げる

const CERT_TEMPLATE_ROWS = [
  ['参加証の件名', '【{コンテスト名}】参加証（{呼出符号}）', '参加証を送るメールの件名'],
  ['参加証の本文', '{呼出符号} 局\n\n{コンテスト名}にご参加いただき、ありがとうございました。\n参加証をお送りします（PDFファイルを添付しています）。\n',
    '参加証を送るメールの本文。最後に「結び」が付く。差し込めるのは {呼出符号} {氏名} {種目} {得点} {順位} {コンテスト名} {差出人名} など']
];

// ------------------------------------------------------------------ メニューから
/** 見本を作る：縦か横かを聞いて、ハガキの大きさのGoogleスライドを作る */
function menuCertSample() {
  const ui = SpreadsheetApp.getUi();
  try { requireMailAccount_('参加証の見本を作る'); } catch (e) { ui.alert(e.message); return; } // 「基本設定」の「参加証の見本」は管理用アカウントだけが書ける
  setupCert_();
  const now = basicValue_(CERT_SAMPLE_LABEL);
  if (now) {
    const ok = ui.alert('参加証の見本を作る', '「基本設定」の「' + CERT_SAMPLE_LABEL + '」には、もう見本がつながっています。\n' +
      '新しい見本を作って、つなぎ直しますか？（今の見本のファイルは消しません）', ui.ButtonSet.OK_CANCEL);
    if (ok !== ui.Button.OK) return;
  }
  const res = ui.prompt('参加証の見本を作る', '用紙の向きを「縦」か「横」で入れてください（ハガキの大きさ 100×148mm）。', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const orient = String(res.getResponseText()).trim();
  if (orient !== '縦' && orient !== '横') { ui.alert('「縦」か「横」で入れてください。'); return; }
  let file;
  try { file = createCertSample_(orient); } catch (e) {
    // Googleスライドに変えて取り込めなかった（ドライブの窓口 Drive API が使えない設定のときなど）。
    // ハガキの大きさの .pptx をドライブに置き、委員にGoogleスライドに変えてもらう
    let pptxUrl = '';
    try { pptxUrl = saveCertSamplePptx_(orient).getUrl(); } catch (e2) { /* 置けなければ手で作る案内だけ出す */ }
    logHistory_('参加証の見本をGoogleスライドに取り込めませんでした：' + (e && e.message || e));
    ui.alert(pptxUrl ?
      'Googleスライドに自動で取り込めなかったので、ハガキの大きさの見本を PowerPoint の形のファイル（.pptx）で、「提出ログ/' + CERT_FOLDER_NAME + '」フォルダに置きました。\n' + pptxUrl + '\n\n' +
      '次の手順で、Googleスライドにしてください。\n1. 上のURLを開く（または、ドライブでファイルを開く）\n' +
      '2. 上の「ファイル」→「Google スライドとして保存」を押す\n3. できたGoogleスライドのURLを、「基本設定」の「' + CERT_SAMPLE_LABEL + '」に入れる\n' +
      'Googleスライドとして保存したら、この .pptx は消してかまいません。' :
      '見本を作れませんでした：' + (e && e.message || e) + '\n\n' +
      '手で作るときは、Googleスライドで新しいファイルを作り、「ファイル」→「ページ設定」→「カスタム」で 10 × 14.8 cm（横なら 14.8 × 10 cm）にして、' +
      '{呼出符号} などの差し込み口を書き、そのURLを「基本設定」の「' + CERT_SAMPLE_LABEL + '」に入れてください。');
    return;
  }
  setCertBasicValue_(CERT_SAMPLE_LABEL, file.getUrl());
  logHistory_('参加証の見本を作りました（' + orient + '）：' + file.getUrl());
  ui.alert('参加証の見本（' + orient + '）を作り、「基本設定」の「' + CERT_SAMPLE_LABEL + '」につなぎました。\n' + file.getUrl() + '\n\n' +
    'Googleスライドで開いて、字の大きさ・配置・飾りなどを自由に直せます。{呼出符号} のような差し込み口が、局ごとの値に置き換わります。\n' +
    '{得点|―} のように書くと、空のとき（チェックログの局など）に「―」が入ります。');
}

/** 参加証を作る（続きから）。確定し直していれば、全部作り直す */
function menuCertMake() {
  try { requireMailAccount_('参加証を作る'); } catch (e) { SpreadsheetApp.getUi().alert(e.message); return; } // 管理用アカウントだけ（シートの整理 D）
  certMake_(false);
}

/** 参加証を全部作り直す（見本を直したときなど） */
function menuCertRemake() {
  const ui = SpreadsheetApp.getUi();
  try { requireMailAccount_('参加証を全部作り直す'); } catch (e) { ui.alert(e.message); return; } // 管理用アカウントだけ（シートの整理 D）
  const ok = ui.alert('参加証を全部作り直す', '「' + CERT_FOLDER_NAME + '」フォルダの参加証のPDFを全部ごみ箱に入れて、はじめから作り直します。よろしいですか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  certMake_(true);
}

function menuCertTest() {
  const ui = SpreadsheetApp.getUi();
  try { requireMailAccount_('参加証を試しに自分に送る'); } catch (e) { ui.alert(e.message); return; } // メールを扱うアカウントでなければ止める（96_gas_intake.js。申し送り No.65）
  const me = Session.getEffectiveUser().getEmail();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { ui.alert('ほかの処理（受付・メール送信）が動いています。少し待ってから、もう一度実行してください。'); return; }
  try {
    let d;
    try { d = loadCertData_(); certMailTpl_(d); } catch (e) { ui.alert(e.message); return; }
    const sync = syncCertMailList_(d);
    const row = sync.rows.filter(function (r) { return r[CC['状態']] === CERT_STATUS.PENDING; })[0] || sync.rows[0];
    if (!row) { ui.alert('参加証を送る局がありません。'); return; }
    const pdf = certPdf_(d, row[CC['呼出符号']], row[CC['開催部門']]);
    if (!pdf) { ui.alert(row[CC['呼出符号']] + ' 局' + (row[CC['開催部門']] ? '（' + row[CC['開催部門']] + '）' : '') + 'の参加証のPDFがありません。先に「参加証を作る」を実行してください。'); return; }
    if (MailApp.getRemainingDailyQuota() < 1) { ui.alert('今日の送信の上限に達しています。明日、もう一度試してください。'); return; }
    const mail = buildCertMail_(d, row[CC['呼出符号']], row[CC['開催部門']]);
    GmailApp.sendEmail(me, '【試し】' + mail.subject, '※試しの送信です。本来の送り先：' + (row[CC['送り先']] || '（なし）') + '（' + row[CC['送り先の根拠']] + '）\n\n' + mail.body,
      Object.assign({ attachments: [pdf.getBlob()] }, mail.options));
    logHistory_('参加証を試しに送りました（' + row[CC['呼出符号']] + ' の分を ' + me + ' へ）');
    ui.alert(row[CC['呼出符号']] + ' 局の参加証を、試しに ' + me + ' へ送りました。受信したメールと添付のPDFを確かめてください。\n' +
      '（「' + SHEET_CERTMAIL + '」シートの状態は変わりません）' + (mail.options.replyTo ? '' : '\n\n' + MAIL_NO_REPLY_TO_NOTE));
  } finally { lock.releaseLock(); }
}

function menuCertSend() {
  const ui = SpreadsheetApp.getUi();
  try { requireMailAccount_('参加証を送る'); } catch (e) { ui.alert(e.message); return; } // メールを扱うアカウントでなければ止める（96_gas_intake.js。申し送り No.65）
  const me = Session.getEffectiveUser().getEmail();
  const ok = ui.alert('参加証を送る', 'このアカウント（' + me + '）から、「' + SHEET_CERTMAIL + '」シートの「未送信」の局へ、参加証のPDFを添付して送ります。\n' +
    '1日の上限を超える分は残ります。そのときは、明日もう一度このメニューを押すと続きから送ります。\n\n' +
    (mailReplyTo_() ? '' : MAIL_NO_REPLY_TO_NOTE + '\n\n') +
    '先に「参加証を試しに自分に送る」で確かめましたか？送りますか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  ui.alert(certMailResultText_(runCertMail_()));
}

// ------------------------------------------------------------------ 参加証を作る
function certMake_(remake) {
  const ui = SpreadsheetApp.getUi();
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) { ui.alert('ほかの委員が処理をしています。終わってから、もう一度実行してください。'); return; }
  try {
    const t0 = Date.now();
    let d;
    try { d = loadCertData_(); } catch (e) { ui.alert(e.message); return; }
    const sample = openCertSample_();
    if (sample.error) { ui.alert(sample.error); return; }
    const folder = d.certFolder;
    // 確定し直した・見本を変えた・全部作り直すときは、前のPDFをごみ箱に入れる
    const state = readCertState_(folder);
    const fresh = remake || state.confirmedAt !== d.confirmedAt || state.sampleId !== sample.file.getId();
    if (fresh) {
      const old = folder.getFiles();
      while (old.hasNext()) { const f = old.next(); if (/\.pdf$/i.test(f.getName())) f.setTrashed(true); }
      writeCertState_(folder, { confirmedAt: d.confirmedAt, sampleId: sample.file.getId() });
    }
    const done = {};
    const ex = folder.getFiles();
    while (ex.hasNext()) done[ex.next().getName()] = true;
    const tokens = certSampleTokens_(sample.file.getId());
    // 見本で使っている {委員会URL} などが空なら、作る前に止める（{委員会URL|} のように空のときの文字を書いたものは止めない）
    try { checkMailLinks_('参加証の見本', tokens.filter(function (t) { return t.indexOf('|') < 0; }), d.common); } catch (e) { ui.alert(e.message); return; }
    let made = 0, stopped = false, error = '';
    for (let i = 0; i < d.stations.length; i++) {
      const s = d.stations[i];
      const name = certFileName(s.call, s.section);
      if (done[name]) continue;
      if (Date.now() - t0 > CERT_TIME_LIMIT_MS) { stopped = true; break; }
      try {
        makeCertPdf_(sample.file, folder, name, tokens, certStationVars_(d, s));
      } catch (e) {
        error = s.call + '：' + (e && e.message || e);
        break;
      }
      done[name] = true;
      made++;
    }
    const rest = d.stations.filter(function (s) { return !done[certFileName(s.call, s.section)]; }).length;
    logHistory_('参加証を ' + made + ' 局分作りました' + (rest ? '（残り ' + rest + ' 局）' : '（全局完了）') + (error ? '。エラーで止まりました：' + error : ''));
    const noName = d.stations.filter(function (s) { return !d.names[s.call]; }).map(function (s) { return s.call; })
      .filter(function (c, i, all) { return all.indexOf(c) === i; }); // 開催部門ごとに同じ局が並ばないように
    let msg = '参加証を ' + made + ' 局分作りました' + (fresh && !remake && state.confirmedAt ? '（確定し直したか見本が変わったので、はじめから作り直しました）' : '') + '。';
    if (error) msg += '\nエラーで止まりました（' + error + '）。少し時間をおいて、もう一度「参加証を作る」を実行すると、続きから作ります。';
    else if (stopped || rest) msg += '\n残りが ' + rest + ' 局あります。もう一度「参加証を作る」を実行すると、続きから作ります。';
    else msg += '\n全 ' + d.stations.length + ' 局の参加証が、ログのフォルダの中の「' + CERT_FOLDER_NAME + '」フォルダにあります。';
    if (noName.length) msg += '\n\n※氏名が分からない局があります（LCRのデータにない局）：' + noName.join('、') + '\n「3. フォルダのログを審査する」を実行し直すと入ります。';
    ui.alert(msg);
  } finally {
    lock.releaseLock();
  }
}

/** 1局分：見本をコピーし、差し込み口を置き換え、PDFにして置く。作業用のコピーはごみ箱に入れる */
function makeCertPdf_(sampleFile, folder, name, tokens, vars) {
  const copy = sampleFile.makeCopy('作業用_' + name.replace(/\.pdf$/, ''), folder);
  try {
    // Apps Script に入っているスライドの機能（SlidesApp）で置き換える。
    // Google Slides API を直接呼ぶやり方は、スクリプトの Google の設定で API を使える状態にしないと動かない（403）ため使わない
    const pres = SlidesApp.openById(copy.getId());
    tokens.forEach(function (t) { pres.replaceAllText(t, fillCertText(t, vars), true); });
    pres.saveAndClose();
    const old = folder.getFilesByName(name);
    while (old.hasNext()) old.next().setTrashed(true);
    folder.createFile(copy.getAs('application/pdf').setName(name));
  } finally {
    copy.setTrashed(true);
  }
}

/** 見本の中の差し込み口を、書かれたままの形で集める（表・グループの中も。文字の飾りで分かれていても、つないだ文字から探す） */
function certSampleTokens_(id) {
  const out = [];
  const add = function (text) { certPlaceholders(text).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); }); };
  const walk = function (el) {
    const type = el.getPageElementType();
    if (type === SlidesApp.PageElementType.SHAPE) add(el.asShape().getText().asString());
    else if (type === SlidesApp.PageElementType.TABLE) {
      const tb = el.asTable();
      for (let r = 0; r < tb.getNumRows(); r++) for (let c = 0; c < tb.getNumColumns(); c++) add(tb.getCell(r, c).getText().asString());
    } else if (type === SlidesApp.PageElementType.GROUP) el.asGroup().getChildren().forEach(walk);
  };
  SlidesApp.openById(id).getSlides().forEach(function (sl) { sl.getPageElements().forEach(walk); });
  return out;
}

/** ハガキの大きさの見本を作る（.pptx を組み立て、Googleスライドに変えて取り込む）。このスプレッドシートと同じフォルダに置く */
function createCertSample_(orient) {
  const pptx = certSamplePptxBlob_(orient).getBytes();
  const ssFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const parents = ssFile.getParents();
  const meta = { name: '参加証の見本（' + orient + '）', mimeType: 'application/vnd.google-apps.presentation' };
  if (parents.hasNext()) meta.parents = [parents.next().getId()];
  const boundary = 'certsample' + Date.now();
  const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n' +
    '--' + boundary + '\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n';
  const body = Utilities.newBlob(head).getBytes().concat(pptx).concat(Utilities.newBlob('\r\n--' + boundary + '--').getBytes());
  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'post', contentType: 'multipart/related; boundary=' + boundary, payload: body, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  if (res.getResponseCode() !== 200) throw new Error('ドライブに取り込めません（' + res.getResponseCode() + '）：' + String(res.getContentText()).substring(0, 200));
  return DriveApp.getFileById(JSON.parse(res.getContentText()).id);
}

/** ハガキの大きさの見本の .pptx（Utilities.zip で1つにまとめる） */
function certSamplePptxBlob_(orient) {
  const blobs = certSamplePptxParts(orient).map(function (p) { return Utilities.newBlob(p.content, 'application/xml', p.name); });
  return Utilities.zip(blobs, '参加証の見本（' + orient + '）.pptx').setContentType('application/vnd.openxmlformats-officedocument.presentationml.presentation');
}

/** 見本の .pptx を「提出ログ/参加証」フォルダに置く（Googleスライドに取り込めなかったとき。新年度の準備でコピーされないように：シートの整理 F） */
function saveCertSamplePptx_(orient) {
  return certFolderOf_(logFolder_()).createFile(certSamplePptxBlob_(orient));
}

/** ログのフォルダの中の「参加証」フォルダ（なければ作る） */
function certFolderOf_(logFolder) {
  const cf = logFolder.getFoldersByName(CERT_FOLDER_NAME);
  return cf.hasNext() ? cf.next() : logFolder.createFolder(CERT_FOLDER_NAME);
}

/** 「基本設定」の「参加証の見本」のファイル。{file} か {error} */
function openCertSample_() {
  const url = basicValue_(CERT_SAMPLE_LABEL);
  const m = /[-\w]{25,}/.exec(url);
  if (!m) return { error: '「基本設定」の「' + CERT_SAMPLE_LABEL + '」に、参加証の見本（Googleスライド）のURLを入れてください。\n見本がないときは「参加証の見本を作る」で作れます。' };
  let file;
  try { file = DriveApp.getFileById(m[0]); } catch (e) {
    return { error: '参加証の見本を開けません。「基本設定」の「' + CERT_SAMPLE_LABEL + '」のURLと、ファイルを見る権限を確かめてください：' + url };
  }
  if (file.getMimeType() !== MimeType.GOOGLE_SLIDES) {
    return { error: '「基本設定」の「' + CERT_SAMPLE_LABEL + '」のファイルが、Googleスライドではありません（' + file.getName() + '）。\n' +
      'PowerPoint の形のファイル（.pptx）なら、開いて「ファイル」→「Google スライドとして保存」を押し、できたGoogleスライドのURLを入れてください。' };
  }
  return { file: file };
}

function readCertState_(folder) {
  const it = folder.getFilesByName(CERT_STATE_FILE);
  if (!it.hasNext()) return {};
  try { return JSON.parse(it.next().getBlob().getDataAsString('UTF-8')); } catch (e) { return {}; }
}

function writeCertState_(folder, state) {
  const it = folder.getFilesByName(CERT_STATE_FILE);
  while (it.hasNext()) it.next().setTrashed(true);
  folder.createFile(CERT_STATE_FILE, JSON.stringify(state), MimeType.PLAIN_TEXT);
}

// ------------------------------------------------------------------ 中身のもと
/**
 * 参加証のもとのデータを読む。確定していなければエラー。
 * 戻り値: {confirmedAt, stations, names(呼出符号→氏名), items(呼出符号→LCRのデータ), common, folder(ログのフォルダ), certFolder}
 */
function loadCertData_() {
  setupCert_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_CONFIRMED);
  const values = sh && sh.getLastRow() > 0 ? sh.getDataRange().getDisplayValues() : [];
  const cfg = sendConfig_(); // 規約が空なら分かる言葉で止める（99_gas_guidemail.js）
  const conf = certStationsFromConfirmed(values, cfg);
  if (!conf.confirmedAt) throw new Error('先に「審査結果を確定する」を実行してください。（参加証は、確定した結果から作ります）');
  if (!conf.stations.length) throw new Error('「確定結果」シートに局がありません。');
  const lcr = loadLcrData_(); // 97_gas_lcrmail.js
  const names = {}, items = {};
  // LCR のデータは「局と開催部門」ごと（開催部門のないコンテストは局ごと）。送り先は局で同じなので、局だけでも引けるようにする
  lcr.items.forEach(function (x) { items[x.call + '|' + (x.section || '')] = x; items[x.call] = items[x.call] || x; if (x.opName) names[x.call] = x.opName; });
  const title = contestTitle(cfg);
  // 開催部門ごとの開催期間の文（参加証の {開催期間} は、その局の開催部門のもの。申し送り No.147）
  const sectionPeriods = {};
  (cfg.sections || []).forEach(function (x) { sectionPeriods[x.name] = certPeriodText(x.periods, cfg.endExclusive); });
  return {
    confirmedAt: conf.confirmedAt, stations: conf.stations, names: names, items: items, folder: lcr.folder, sectionPeriods: sectionPeriods,
    certFolder: certFolderOf_(lcr.folder),
    common: Object.assign({
      'コンテスト名': title, '開催回': String(basicValue_('開催回')).replace(/^第|回$/g, ''),
      '開催期間': certPeriodText(cfg.periods, cfg.endExclusive), '主催者': basicValue_(ORGANIZER_LABEL) || title,
      '発行日': certDateText(msToJstSeconds(Date.now()))
    }, mailLinkVars_()) // {受付ページのURL} {委員会URL} {レコードのページのURL} など（99_gas_guidemail.js）
  };
}

/** その局（と開催部門）の参加証のPDF（なければ null） */
function certPdf_(d, call, section) {
  const it = d.certFolder.getFilesByName(certFileName(call, section));
  return it.hasNext() ? it.next() : null;
}

/** 1局（と開催部門）分の差し込みの値。{開催期間} は、その局の開催部門の開催期間 */
function certStationVars_(d, s) {
  const v = certVars(s, d.names[s.call] || '', d.common);
  if (s.section && d.sectionPeriods && d.sectionPeriods[s.section]) v['開催期間'] = d.sectionPeriods[s.section];
  return v;
}

// ------------------------------------------------------------------ メールで送る
/** 「参加証送信」シートを、確定結果の局に合わせて作り直す。戻り値: {rows} */
function syncCertMailList_(d) {
  const sh = certMailSheet_();
  const senders = intakeSenderMap_(d.folder); // 97_gas_lcrmail.js
  const items = d.stations.map(function (s) {
    const x = d.items[s.call + '|' + (s.section || '')] || d.items[s.call] || {};
    return { call: s.call, section: s.section || '', email: x.email || '', sender: senders[x.logFile] || '' };
  });
  const n = sh.getLastRow() - 1;
  const old = n > 0 ? sh.getRange(2, 1, n, CERTMAIL_HEADER.length).getDisplayValues() : [];
  const rows = mergeCertMailRows(items, old);
  sh.getRange(1, 1, 1, CERTMAIL_HEADER.length).setValues([CERTMAIL_HEADER]).setFontWeight('bold'); // 列「開催部門」を足した前の版のシートでも、見出しを今の形に
  if (n > 0) sh.getRange(2, 1, n, CERTMAIL_HEADER.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, CERTMAIL_HEADER.length).setNumberFormat('@').setValues(rows);
  const vr = sh.getMaxRows() - 1;
  if (vr > 0) {
    sh.getRange(2, CC['状態'] + 1, vr, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList([CERT_STATUS.PENDING, CERT_STATUS.SKIP], true).setAllowInvalid(true)
      .setHelpText('未送信＝次に送る、送らない＝送らない。送信済み・送信できず・送り先なし・メールアドレスなし（紙ログ）はツールが入れる（送り直すときは「未送信」に戻す）').build());
  }
  return { rows: rows };
}

/** 参加証のメールの文面（送る前に1回だけ読む）。文面で使っている {委員会URL} などが空なら、エラーで止める */
function certMailTpl_(d) {
  if (!d.tpl) {
    const tpl = readReplyTemplates_();
    CERT_TEMPLATE_ROWS.forEach(function (r) { if (!tpl[r[0]]) tpl[r[0]] = r[1]; });
    checkMailLinks_('参加証のメールの文面', [tpl['参加証の件名'], tpl['参加証の本文'], tpl['結び']], d.common); // 99_gas_guidemail.js
    d.tpl = tpl;
  }
  return d.tpl;
}

/** 1局（と開催部門）分のメール（件名・本文・送るときの指定） */
function buildCertMail_(d, call, section) {
  certMailTpl_(d);
  const s = d.stations.filter(function (x) { return x.call === call && (x.section || '') === (section || ''); })[0];
  const vars = certStationVars_(d, s);
  vars['差出人名'] = d.common['主催者'];
  const options = { name: d.common['主催者'] };
  const reply = mailReplyTo_(); // 「問い合わせ先」がメールアドレスのとき（99_gas_guidemail.js。LCR・案内メールと同じ）
  if (reply) options.replyTo = reply;
  return {
    // 同じ局に開催部門ごとに届くので、件名の文面に {部門} がなければ後ろに「（7MHz部門）」を付ける（LCR と同じ）
    subject: fillCertText(fillTemplate(d.tpl['参加証の件名'], vars), vars) + (vars['部門'] && String(d.tpl['参加証の件名']).indexOf('{部門}') < 0 ? '（' + vars['部門'] + '）' : ''),
    body: fillCertText(fillTemplate(d.tpl['参加証の本文'], vars) + fillTemplate(d.tpl['結び'], vars), vars),
    options: options
  };
}

/**
 * 「未送信」の局に、1日の上限と時間の許す限り送る。
 * 戻り値: {busy, error, sent, failed, quotaOut, timeOut, stats}
 */
function runCertMail_() {
  const res = { busy: false, error: '', sent: 0, failed: 0, quotaOut: false, timeOut: false, stats: null, noReplyTo: !mailReplyTo_() };
  const lock = LockService.getScriptLock(); // 受付・LCR・案内メールと同じロック（送信の枠を取り合わないように）
  if (!lock.tryLock(10000)) { res.busy = true; return res; }
  const t0 = Date.now();
  try {
    try { requireMailAccount_('参加証を送る'); } catch (e) { res.error = e.message; return res; } // 管理用アカウントでなければ止める（96_gas_intake.js。申し送り No.65）
    let d;
    try { d = loadCertData_(); certMailTpl_(d); } catch (e) { res.error = e.message; return res; } // 文面で使うURLが空なら、1通も送らずに止める
    const state = readCertState_(d.certFolder);
    if (state.confirmedAt !== d.confirmedAt) { res.error = '確定結果が、参加証を作ったときと変わっています。先に「参加証を作る」を実行してください。'; return res; }
    const sync = syncCertMailList_(d);
    const missing = sync.rows.filter(function (r) { return r[CC['状態']] === CERT_STATUS.PENDING && !certPdf_(d, r[CC['呼出符号']], r[CC['開催部門']]); });
    if (missing.length) {
      res.error = '参加証のPDFがまだない局があります（' + missing.slice(0, 5).map(function (r) { return r[CC['呼出符号']]; }).join('、') +
        (missing.length > 5 ? ' など ' + missing.length + ' 局' : '') + '）。先に「参加証を作る」を実行してください。';
      return res;
    }
    const sh = certMailSheet_();
    for (let i = 0; i < sync.rows.length; i++) {
      const row = sync.rows[i];
      if (row[CC['状態']] !== CERT_STATUS.PENDING) continue;
      if (Date.now() - t0 > CERT_TIME_LIMIT_MS) { res.timeOut = true; break; }
      if (MailApp.getRemainingDailyQuota() < 1) { res.quotaOut = true; break; }
      const now = msToJstSeconds(Date.now()).substring(0, 16);
      try {
        const mail = buildCertMail_(d, row[CC['呼出符号']], row[CC['開催部門']]);
        GmailApp.sendEmail(row[CC['送り先']], mail.subject, mail.body,
          Object.assign({ attachments: [certPdf_(d, row[CC['呼出符号']], row[CC['開催部門']]).getBlob()] }, mail.options));
        row[CC['状態']] = CERT_STATUS.SENT + ' ' + now;
        res.sent++;
      } catch (e) {
        row[CC['状態']] = CERT_STATUS.FAILED + '：' + (e && e.message ? e.message : e);
        res.failed++;
      }
      // 1局ずつシートに書く（途中で止まっても、送った局に二重に送らないように）
      sh.getRange(i + 2, CC['状態'] + 1).setNumberFormat('@').setValue(row[CC['状態']]);
    }
    res.stats = certMailStats(sync.rows);
    if (res.sent || res.failed) {
      logHistory_('参加証をメールで送りました：' + res.sent + ' 通' + (res.failed ? '（送信できず ' + res.failed + ' 通）' : '') +
        '、残りの未送信 ' + res.stats.pending + ' 局');
    }
    return res;
  } finally {
    lock.releaseLock();
  }
}

function certMailResultText_(r) {
  if (r.busy) return 'ほかの処理（受付・メール送信）が動いています。少し待ってから、もう一度実行してください。';
  if (r.error) return r.error;
  let s = '参加証を ' + r.sent + ' 通送りました。' + (r.failed ? '（送信できず ' + r.failed + ' 通。「' + SHEET_CERTMAIL + '」シートの状態を見てください）' : '');
  if (r.quotaOut) s += '\n今日の送信の上限に達したので、ここで止めました。明日、もう一度「参加証を送る」を押すと続きから送ります。';
  if (r.timeOut) s += '\n時間内に送りきれなかったので、ここで止めました。もう一度「参加証を送る」を押すと続きから送ります。';
  return s + '\n\n' + certMailStatsText(r.stats) + (r.stats.pending ? '\n残り ' + r.stats.pending + ' 局です。' : '') +
    (r.stats.noaddr ? '\n\n※送り先なしの局は、「送り先の指定」にアドレスを入れると、次の送信で送ります。' : '') +
    (r.noReplyTo && (r.sent || r.stats.pending) ? '\n\n' + MAIL_NO_REPLY_TO_NOTE : '');
}

// ------------------------------------------------------------------ シート・新年度
/** 「返信文面」（メールのファイル）に参加証の行がなければ足す（参加証のメニューを使うたびに呼ぶ）。「基本設定」の行は「1. 初期設定」が作る */
function setupCert_() {
  const rp = replySheet_(); // 96_gas_intake.js
  const have = rp.getLastRow() > 1 ? rp.getRange(2, 1, rp.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  CERT_TEMPLATE_ROWS.forEach(function (row) { if (have.indexOf(row[0]) < 0) rp.appendRow(row); });
}

/** 「参加証送信」シート（メールのファイル） */
function certMailSheet_() {
  return bookSheet_(BOOK_MAIL, SHEET_CERTMAIL); // 91_gas_books.js
}

/** 「基本設定」の label の値（B 列）を書く。行がなければ後ろに足す（行はふつう「1. 初期設定」が作る） */
function setCertBasicValue_(label, value) {
  const basic = bookSheet_(BOOK_JUDGE, SHEET_BASIC);
  const v = basic.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]).trim() === label) { basic.getRange(i + 1, 2).setValue(value); return; }
  basic.appendRow([label, value, '', '']);
}

/**
 * 新年度の準備（95_gas_newyear.js）から呼ぶ：テンプレートの参加証の見本を、新しい年の見本にする。
 *   copies : テンプレートフォルダのファイルID → 年度フォルダにコピーしたファイル
 * 見本がテンプレートフォルダにあればそのコピーを、外にあれば年度フォルダにコピーして、名前を「参加証の見本_年」にする。
 * 戻り値：新しい年の「参加証の見本」に入れるURL（見本がなければ ''、開けなければテンプレートのURLのまま）
 */
function certSampleForNewYear_(templateUrl, copies, newFolder, year) {
  const m = /[-\w]{25,}/.exec(String(templateUrl || ''));
  if (!m) return '';
  try {
    const copy = copies[m[0]] || DriveApp.getFileById(m[0]).makeCopy('参加証の見本_' + year, newFolder);
    copy.setName('参加証の見本_' + year);
    return copy.getUrl();
  } catch (e) {
    return String(templateUrl);
  }
}
// ===== 95_gas_newyear.js =====
/**
 * 新年度の準備（GAS専用。シートの整理 段階3：申し送り No.76。決まりは docs/指示書_シートの整理.md の E）
 *
 * テンプレートフォルダ（テンプレートのスプレッドシートが入っているフォルダ）から、
 * その年の年度フォルダを作る。テンプレートのスプレッドシートのメニューから実行する。
 *
 *   年度フォルダの置き場所/（親フォルダ「コンテスト自動審査システム」。docs/ドライブのフォルダの作り.md）
 *     2027_第74回/
 *       審査_2027      ← テンプレートの審査のファイルのコピー（スクリプトも一緒にコピーされる）
 *       規約_2027      ← テンプレートの規約のファイルのコピー
 *       メール_2027    ← テンプレートのメールのファイルのコピー
 *       参加証の見本_2027 ← テンプレートの参加証の見本のコピー（94_gas_certificate.js）
 *       提出ログ/      ← テンプレートのサブフォルダは、中身なしで同じ名前で作る
 *         Web受付/処理済み/ ← 受付ページの提出の箱（96_gas_intake.js の setupWebIntakeFolders_）
 *
 * 行うこと
 *   1. 年度フォルダを作り、テンプレートフォルダ直下のファイルをコピーする（サブフォルダは空で作る）。
 *      規約のファイルとメールのファイルは、テンプレートフォルダの外にあっても年度フォルダにコピーする
 *   2. 新しい審査のファイルの「基本設定」を書き換える（画面で入れた「その年の情報」と、「ファイルの場所など」のつながり）。
 *      ほかの「その年の情報」と管理用アカウントは、テンプレートのまま引き継ぐ
 *   3. 決まったこと E のとおり、シートの中身を空にする（シートは消さない。NEW_YEAR_CLEAR）。
 *      引き継ぐもの：基本設定・返信文面・規約_ の6枚・マルチ一覧・登録クラブ一覧
 *   4. 受付ページに登録する（98_gas_public_register.js）
 * 画面には、前の年（年度フォルダの置き場所の中のいちばん新しい「年_第回」）の値をもとにした初めの値を入れておく
 */

const LOG_FOLDER_NAME = '提出ログ';

// 新年度の準備で中身を空にするシート（決まったこと E）。空にし方は 91_gas_books.js の bookClearSheetFor_
const NEW_YEAR_CLEAR = [
  [BOOK_JUDGE, ['局の一覧', '要確認', '審査結果', '局別一覧', '確定結果', '変更履歴']],
  [BOOK_MAIL, ['案内メール', '受付履歴', 'LCR送信', '参加証送信']]
];
const NEW_YEAR_FOLDER_RE = /^(\d{4})_第(\d+)回$/;

function menuNewYear() {
  requireSetupAccount_('新年度の準備'); // 管理用アカウント（空なら持ち主）だけ（91_gas_books.js。指示書_シートの整理_追加 3.）
  const ui = SpreadsheetApp.getUi();
  if (basicValue_('ファイルの種類') !== 'テンプレート') {
    ui.alert('このメニューは、テンプレートのスプレッドシートから実行してください。\n' +
      '（「基本設定」シートの「ファイルの種類」が「テンプレート」になっているファイルです）');
    return;
  }
  const html = HtmlService.createHtmlOutput(newYearFormHtml_(newYearDefaults_())).setWidth(560).setHeight(680);
  ui.showModalDialog(html, '新年度の準備');
}

/** テンプレートフォルダ（このファイルが入っているフォルダ）。なければ null */
function newYearTemplateFolder_() {
  const parents = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents();
  return parents.hasNext() ? parents.next() : null;
}

/** 年度フォルダを作る場所：「年度フォルダの置き場所」のURL。空ならテンプレートフォルダの親（なければマイドライブ） */
function newYearParent_(parentUrl, templateFolder) {
  const pm = /[-\w]{25,}/.exec(String(parentUrl || ''));
  if (pm) return DriveApp.getFolderById(pm[0]);
  const pp = templateFolder ? templateFolder.getParents() : null;
  return pp && pp.hasNext() ? pp.next() : DriveApp.getRootFolder();
}

/** 前の年の審査のファイル：parent の中のいちばん新しい「年_第回」のフォルダの「審査_年」。{ss, url, year} か null */
function newYearFindPrev_(parent) {
  let best = null;
  const it = parent.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    const m = NEW_YEAR_FOLDER_RE.exec(f.getName());
    if (m && (!best || +m[1] > best.year)) best = { folder: f, year: +m[1] };
  }
  if (!best) return null;
  const files = best.folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName() !== '審査_' + best.year) continue;
    try { return { ss: SpreadsheetApp.openById(f.getId()), url: f.getUrl(), year: best.year }; } catch (e) { return null; }
  }
  return null;
}

/** 'YYYY-MM-DD' を n 年進める（読めなければそのまま） */
function newYearAddYears_(date, n) {
  const m = /^(\d{4})(-\d{2}-\d{2})$/.exec(String(date || '').trim());
  return m ? (+m[1] + n) + m[2] : String(date || '').trim();
}

/** 画面の初めの値。前の年が見つかればその値から（開催回＋1・生年月日の区切り＋1年）、なければテンプレートの値から */
function newYearDefaults_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let prev = null;
  try { prev = newYearFindPrev_(newYearParent_(basicValue_('年度フォルダの置き場所'), newYearTemplateFolder_())); } catch (e) { prev = null; }
  const src = prev ? prev.ss : ss;
  const rows = settingsBasicRows_(src); // 92_gas_settings.js
  const value = function (label) { for (let i = 1; i < rows.length; i++) if (rows[i][0] === label) return String(rows[i][1]).trim(); return ''; };
  const num = value('開催回');
  return {
    num: /^\d+$/.test(num) ? String(+num + 1) : '',
    periods: periodsFromBasicRows(rows).periods, // 11_settings.js
    deadline: value('受付締切'),
    junior: newYearAddYears_(value('ジュニア部門の生年月日の区切り'), 1),
    parent: basicValue_('年度フォルダの置き場所'),
    prev: prev ? prev.url : '',
    prevNote: prev ? '前の年（' + prev.year + '年のファイル）の値を入れてあります。今年の規約に合わせて直してください。' :
      '前の年のフォルダが見つからないので、テンプレートの値を入れてあります。'
  };
}

function escapeHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function newYearFormHtml_(d) {
  const input = function (name, value) { return '<input name="' + name + '" value="' + escapeHtml_(value || '') + '">'; };
  const per = d.periods || [];
  const periodRow = function (i) {
    const p = per[i - 1] || {};
    return '<label>開催期間' + i + (i > 1 ? '<span class="n">（分かれているときだけ。空なら使わない）</span>' : '<span class="n">（開始と終了。例：2027-05-08 21:00）</span>') +
      '</label><div class="two">' + input('start' + i, p.start) + input('end' + i, p.end) + '</div>';
  };
  return '<!DOCTYPE html><html><head><base target="_top"><style>' +
    'body{font-family:sans-serif;font-size:14px;margin:0 4px}label{display:block;margin-top:10px;font-weight:bold}' +
    'input{width:100%;box-sizing:border-box;padding:6px;font-size:14px}.n{font-weight:normal;color:#555;font-size:12px}' +
    '.two{display:flex;gap:6px}.two input{flex:1}p.n{margin:4px 0}' +
    'button{margin-top:16px;padding:8px 18px;font-size:14px}#msg{margin-top:14px;line-height:1.6}#msg li{margin:2px 0}' +
    '</style></head><body>' +
    '<p class="n">' + escapeHtml_(d.prevNote || '') + '</p>' +
    '<form id="f" onsubmit="return false">' +
    '<label>開催回<span class="n">（数字だけ。例：74）</span></label>' + input('num', d.num) +
    periodRow(1) + periodRow(2) + periodRow(3) +
    '<label>受付締切<span class="n">（例：2027-06-10 23:59。空なら締切なし）</span></label>' + input('deadline', d.deadline) +
    '<label>ジュニア部門の生年月日の区切り<span class="n">（この日以降に生まれた方が対象。例：2009-04-02）</span></label>' + input('junior', d.junior) +
    '<label>年度フォルダの置き場所<span class="n">（親フォルダのURL。空ならテンプレートフォルダと同じ場所）</span></label>' + input('parent', d.parent) +
    '<label>前年の審査用スプレッドシート<span class="n">（URL。空でもよい。案内メールの送り先と、局の一覧の「前年の局区分」を読むのに使う）</span></label>' + input('prev', d.prev) +
    '<button id="b" onclick="go()">作成する</button>' +
    '</form><div id="msg"></div>' +
    '<script>' +
    'function go(){var f=document.getElementById("f"),b=document.getElementById("b"),m=document.getElementById("msg");' +
    'var v={};["num","start1","end1","start2","end2","start3","end3","deadline","junior","parent","prev"].forEach(function(k){v[k]=f[k].value;});' +
    'b.disabled=true;m.textContent="作成しています。しばらくお待ちください…";' +
    'google.script.run.withSuccessHandler(function(r){' +
    'var a=function(u,t){return "<a href=\\""+u+"\\" target=\\"_blank\\">"+t+"</a>";};' +
    'm.innerHTML="作成しました："+a(r.folderUrl,r.folderName)+' +
    '"<br>審査のファイル："+a(r.url,"開く")+"　規約のファイル："+a(r.settingsUrl,"開く")+"　メールのファイル："+a(r.mailUrl,"開く")+' +
    '(r.publicMsg?"<br>"+r.publicMsg:"")+(r.shareMsg?"<br>"+r.shareMsg:"")+' +
    '"<p><b>やることの一覧</b></p><ol>' +
    '<li>新しい審査のファイルの「基本設定」の「その年の情報」（コンテスト名・主催者・問い合わせ先・委員会URLなど）を確かめる</li>' +
    '<li>昨年、市町村の合併・名前の変更はありませんでしたか？　あれば「マルチ一覧を取り込む」を実行してください</li>' +
    '<li>登録クラブに増減はありませんでしたか？　あれば「登録クラブ一覧を取り込む」を実行してください</li>' +
    '<li>前年の参加者への案内メールの一覧を作る（「案内メール」→「一覧を作る」）</li>' +
    '<li>メールでの受付は、新しい審査のファイルで「受付の自動実行を始める」を実行し、前の年のファイルでは止める</li></ol>";})' +
    '.withFailureHandler(function(e){b.disabled=false;m.textContent="エラー："+e.message;})' +
    '.newYearSetup(v);}' +
    '</script></body></html>';
}

/** 'YYYY-MM-DD' にそろえる（全角・「/」区切り・1桁の月日も読む）。読めなければ null */
function newYearDateText_(s) {
  const m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(toHankaku(String(s || '')).trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return m[1] + '-' + ('0' + +m[2]).slice(-2) + '-' + ('0' + +m[3]).slice(-2);
}

/** テンプレートの「基本設定」の label のファイル（規約のファイル・メールのファイル）。年度フォルダを作る前に、開けるか確かめる */
function newYearSourceFile_(label) {
  const url = basicValue_(label);
  const m = /[-\w]{25,}/.exec(url);
  if (!m) throw new Error('「基本設定」の「' + label + '」にURLがありません。先にこのテンプレートで「1. 初期設定」を実行してください');
  try { return DriveApp.getFileById(m[0]); } catch (err) {
    throw new Error(label + 'を開けません。「基本設定」の「' + label + '」のURLと、ファイルを見る権限を確かめてください：' + url);
  }
}

/** ダイアログから呼ばれる。作成したフォルダと3つのファイルのURLを返す */
function newYearSetup(form) {
  requireSetupAccount_('新年度の準備'); // 画面から直接呼ばれるので、ここでも確かめる
  // 画面の値を確かめる（年度フォルダを作る前に）
  const num = String(form.num || '').trim().replace(/^第|回$/g, '');
  if (!/^\d+$/.test(num)) throw new Error('開催回は数字で入れてください（例：74）');
  const periods = [];
  [1, 2, 3].forEach(function (i) {
    const a = String(form['start' + i] || (i === 1 ? form.start : '') || '').trim(); // start・end は前の画面の名前（開催期間1）
    const b = String(form['end' + i] || (i === 1 ? form.end : '') || '').trim();
    if (!a && !b) return;
    const s = settingsDateTimeText(a), e = settingsDateTimeText(b); // 11_settings.js
    if (!s || !e) throw new Error('開催期間' + i + 'の開始・終了の日時が読み取れません。日付と時刻の間は半角スペースで書いてください（例：2027-05-08 21:00）');
    if (jstStringToMinutes(s) >= jstStringToMinutes(e)) throw new Error('開催期間' + i + 'は、終了日時が開始日時より前になっています');
    periods.push({ start: s, end: e });
  });
  if (!periods.length) throw new Error('開催期間1に、開始日時と終了日時を入れてください（例：2027-05-08 21:00）');
  const year = periods[0].start.substring(0, 4);
  const lastEnd = Math.max.apply(null, periods.map(function (p) { return jstStringToMinutes(p.end); }));
  let deadline = String(form.deadline || '').trim();
  if (deadline) {
    const d = settingsDateTimeText(deadline);
    if (!d) throw new Error('受付締切が読み取れません（例：2027-06-10 23:59）');
    if (jstStringToMinutes(d) <= lastEnd) throw new Error('受付締切が、コンテストの終了日時より前になっています');
    deadline = d;
  }
  let junior = String(form.junior || '').trim();
  if (junior) {
    junior = newYearDateText_(junior);
    if (!junior) throw new Error('ジュニア部門の生年月日の区切りが読み取れません（例：2009-04-02）');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const templateFolder = newYearTemplateFolder_();
  if (!templateFolder) throw new Error('テンプレートのスプレッドシートを、テンプレートフォルダの中に置いてください');
  const settingsFile = newYearSourceFile_(SETTINGS_FILE_LABEL);   // 92_gas_settings.js
  const mailFile = newYearSourceFile_(BOOK_FILES.mail.label);      // 91_gas_books.js
  const parent = newYearParent_(form.parent, templateFolder);
  const folderName = year + '_第' + num + '回';
  if (parent.getFoldersByName(folderName).hasNext()) {
    throw new Error('「' + folderName + '」というフォルダがすでにあります。開催回か置き場所を確かめてください');
  }

  // 1. 年度フォルダを作ってコピー
  const newFolder = parent.createFolder(folderName);
  let sheetFile = null, settingsCopy = null, mailCopy = null;
  const copies = {}; // テンプレートフォルダのファイルID → コピー（参加証の見本のつなぎ直しに使う）
  const files = templateFolder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getId() === ss.getId()) sheetFile = f.makeCopy('審査_' + year, newFolder);
    else if (f.getId() === settingsFile.getId()) settingsCopy = f.makeCopy('規約_' + year, newFolder);
    else if (f.getId() === mailFile.getId()) mailCopy = f.makeCopy('メール_' + year, newFolder);
    else copies[f.getId()] = f.makeCopy(f.getName(), newFolder);
  }
  // テンプレートフォルダの外に置いてあったとき
  if (!settingsCopy) settingsCopy = settingsFile.makeCopy('規約_' + year, newFolder);
  if (!mailCopy) mailCopy = mailFile.makeCopy('メール_' + year, newFolder);
  const subs = templateFolder.getFolders();
  while (subs.hasNext()) newFolder.createFolder(subs.next().getName());
  const lf = newFolder.getFoldersByName(LOG_FOLDER_NAME);
  const logFolder = lf.hasNext() ? lf.next() : newFolder.createFolder(LOG_FOLDER_NAME);
  setupWebIntakeFolders_(logFolder); // 「提出ログ/Web受付」「Web受付/処理済み」（96_gas_intake.js。受付ページの提出の箱）

  // 2. 「基本設定」を書き換える（ほかの「その年の情報」と管理用アカウントはテンプレートのまま）
  const nss = SpreadsheetApp.openById(sheetFile.getId());
  setBasicValue_(nss, 'ファイルの種類', '審査用');
  setBasicValue_(nss, '開催回', num);
  settingsWritePeriods_(nss, periods); // 「開催期間1」から書き、余った行は空にする（92_gas_settings.js）
  setBasicValue_(nss, '受付締切', deadline);
  if (junior) setBasicValue_(nss, 'ジュニア部門の生年月日の区切り', junior);
  setBasicValue_(nss, 'ログのフォルダ', logFolder.getUrl());
  setBasicValue_(nss, '年度フォルダの置き場所', '');
  setBasicValue_(nss, SETTINGS_FILE_LABEL, settingsCopy.getUrl()); // コピーしたほう（テンプレートのものを書き換えないように）
  setBasicValue_(nss, BOOK_FILES.mail.label, mailCopy.getUrl());
  const certSample = certSampleForNewYear_(basicValue_(CERT_SAMPLE_LABEL), copies, newFolder, year); // 参加証の見本を年度フォルダのコピーにつなぎ直す（94_gas_certificate.js）
  if (certSample) setBasicValue_(nss, CERT_SAMPLE_LABEL, certSample);
  setBasicValue_(nss, GUIDE_PREV_LABEL, /[-\w]{25,}/.test(String(form.prev || '')) ? String(form.prev).trim() : ''); // 前の年の審査のファイル（99_gas_guidemail.js）

  // 3. シートの中身を空にする（シートは消さない。決まったこと E）
  settingsSpreadsheetCache_ = null; // 新しいファイルのつながりで開き直す
  NEW_YEAR_CLEAR.forEach(function (x) {
    x[1].forEach(function (name) { bookClearSheetFor_(nss, x[0], name); }); // 91_gas_books.js
  });
  bookSheetFor_(nss, BOOK_JUDGE, '変更履歴').appendRow([new Date(), Session.getActiveUser().getEmail() || '（不明）',
    'テンプレート「' + ss.getName() + '」から作成しました（第' + num + '回、' +
    periods.map(function (p) { return p.start + '〜' + p.end; }).join('、') + '）']);

  // 4. 「編集できる委員」に共有を付ける（審査・規約のファイルは編集者、メールのファイルは閲覧者。91_gas_books.js）
  const shareMsgs = bookShareCommittee_(nss);
  shareMsgs.forEach(function (m) { logHistory_(m); });

  // 5. 受付ページに登録する
  const publicMsg = registerPublicYear_(nss, year, num); // 98_gas_public_register.js
  logHistory_('新年度のフォルダ「' + folderName + '」を作りました');
  if (publicMsg) logHistory_(publicMsg);

  return { url: nss.getUrl(), settingsUrl: settingsCopy.getUrl(), mailUrl: mailCopy.getUrl(), folderUrl: newFolder.getUrl(),
    folderName: folderName, publicMsg: escapeHtml_(publicMsg), shareMsg: shareMsgs.map(escapeHtml_).join('<br>') };
}

/** 指定のスプレッドシートの「基本設定」の値を書き換える（行がなければ追加。説明は D 列） */
function setBasicValue_(ss, label, value) {
  const sh = ss.getSheetByName(SHEET_BASIC) || ss.insertSheet(SHEET_BASIC);
  const v = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) {
    if (v[i][0] === label) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([label, value, '', '']);
}
// ===== 96_gas_intake.js =====
/**
 * Gmailでのログ受付（GAS専用）
 *
 * このスプレッドシートのスクリプトを入れたGoogleアカウントのGmailに届いたメールを、15分ごとに調べる。
 *   1. 受信トレイの、まだ受け付けていないメールを探す（自分が送ったメールは除く）
 *   2. 添付ファイル（.txt など）または本文から、JARL形式のログを取り出す
 *   3. 原本を「提出ログ/原本」フォルダに保存し、メールのファイルの「受付履歴」シートに1行書く
 *   4. 件名の呼出符号・形式などを調べ、受付結果（不備があればその内容）を自動返信する
 *   5. 局ごとに採用するログ（同じ局は後の提出）を「提出ログ」フォルダの直下に置き、審査のファイルの「局の一覧」の左側を書く
 *   6. 受け付けたメールには「ログ受付/処理済み」のラベルを付けて、受信トレイから外す（アーカイブ）
 *      ログが見つからなかったメールには「ログ受付/ログなし」のラベルも付ける
 *   7. 公開ページのログ入力フォーム・電子ログのアップロードの提出（「提出ログ/Web受付」フォルダのファイル）も、
 *      メールと同じように受け付け、受付のメールを新しく送る。済んだファイルは「Web受付/処理済み」に移す
 *      （箱の決まりは docs/指示書_ログ入力フォーム.md の「2.」）
 *
 * 受付履歴・返信文面は、メールのファイル（メール_XXX。91_gas_books.js の BOOK_MAIL）に置く。
 * メールを読む・送る処理は、「基本設定」の「管理用アカウント」で実行したときだけ動く（requireMailAccount_）。
 * 共有者がメニューを押しても、その人の受信トレイは読まない（docs/指示書_メールを扱うアカウント.md、docs/指示書_シートの整理.md の D）
 *
 * 「提出ログ」フォルダの直下には採用したログだけが置かれるので、「3. フォルダのログを審査する」はそのまま使える。
 * 委員会は、審査のファイルの「局の一覧」の「採用する受付番号」に受付番号を入れ（「なし」なら採用しない）、
 * 「採用するログを決め直す」を実行すると、採用するログを変えられる（空なら自動：同じ局は後の提出）。
 */

const SHEET_INTAKE = '受付履歴';
const SHEET_REPLY = '返信文面';
const REPLY_HEADER = ['項目', 'メールに入る文面', '説明']; // 返信文面の見出し（シートの整理 G）
const COMMITTEE_URL_LABEL = '委員会URL';               // 「基本設定」の行。受付のメールの {委員会URL} に入る（シートの整理の追記）
const ORIGINAL_FOLDER_NAME = '原本';
const LABEL_DONE = 'ログ受付/処理済み';
const LABEL_NOLOG = 'ログ受付/ログなし';
const INTAKE_TRIGGER_FUNC = 'intakeTrigger';
const INTAKE_MAX_THREADS = 20;          // 1回に調べるスレッドの数
const INTAKE_TIME_LIMIT_MS = 4.5 * 60 * 1000; // 6分の制限より前に切り上げる
const PROP_PENDING_REPLY = 'intakePendingReply';
const WEB_INTAKE_FOLDER_NAME = 'Web受付';   // 「提出ログ」の中。公開ページ（src/public/63_gas_public_form.js の PUBLIC_FORM_BOX）が置く
const WEB_DONE_FOLDER_NAME = '処理済み';    // 「Web受付」の中。受け付けたファイルを移す
const INTAKE_MAIL_USE_LABEL = 'メールでの受付';         // 「基本設定」の行（使う／使わない。行は 91_gas_books.js の BASIC_ROWS が作る）
const INTAKE_MAIL_TO_LABEL = '受け付けるメールの宛先'; // 「基本設定」の行（空なら受信トレイの全部。書けばその宛先のメールだけ）
const INTAKE_MAIL_CHOICES = ['使う', '使わない'];
const MAIL_ACCOUNT_LABEL = '管理用アカウント'; // 「基本設定」の行（行は 91_gas_books.js の BASIC_ROWS が作る）。審査・送信のメニューも requireMailAccount_ で使う
const PROP_REPLY_BLOCK = 'intakeReplyBlock';
const PROP_SETTINGS_EMPTY = 'intakeSettingsEmpty'; // 規約が空で自動実行を止めたこと（変更履歴に何度も書かないため） // 返信を止めた理由（同じ理由を何度も変更履歴に書かないため）
const WEB_KEY_PREFIX = 'web:';              // Webの提出のメールIDの列は「web:」＋提出の番号（Gmailのメールの番号と重ならない）

const INTAKE_HEADER = ['受付日時', '送信元', '件名', '呼出符号', '種目', '開催部門', '交信数', '申告総得点', '状態',
  '不備・注意の内容', '原本', '返信', '採用', '受付番号', '原本のファイルID', 'メールID'];
// 開催部門：開催部門のあるコンテスト（新潟など）で、そのログの開催部門（種目コードから。ないコンテストは空）。採用は「局と開催部門」ごとに決める
// 採用：採用しているログに ◯（局の一覧の「採用する受付番号」と自動の決まりで決める。委員は局の一覧で変える）
// 受付番号：「受付番号の頭」＋「-」＋3桁の通し番号（例 JA0VHF-001）。ログ1件（ログのないメールは1通）ごとに1つ。
// メールID：Gmailのメールの番号＋「#」＋そのメールの中のログの順番。重複受付の防止と、採用ファイルの目印に使う（委員は触らない）
const IC = {}; INTAKE_HEADER.forEach(function (h, i) { IC[h] = i; });

const REPLY_DEFAULTS = [
  ['件名', '【{コンテスト名}】ログ受付のお知らせ（{呼出符号}）', '返信メールの件名。{受付番号}も使える'],
  ['受付済み', '{呼出符号} 局\n\n{コンテスト名}のログを受け付けました。ありがとうございました。\n\n' +
    '受付番号：{受付番号}\n受付日時：{受付日時}\n参加種目：{種目}{部門（かっこ付き）}\n交信数：{交信数}\n申告総得点：{申告総得点}\n{注意の内容}',
    '不備がなかったときの本文'],
  ['不備あり', '{呼出符号} 局\n\n{コンテスト名}のログを受け取りましたが、次の不備がありました。\n\n{不備の内容}\n\n' +
    'お手数ですが、直したログを{締切}までに、件名に呼出符号を入れて、もう一度お送りください。\n' +
    '後から届いたログを採用します。期限までに届かない場合は、今回のログで審査します。\n\n' +
    '受付番号：{受付番号}\n受付日時：{受付日時}\n参加種目：{種目}{部門（かっこ付き）}\n交信数：{交信数}\n申告総得点：{申告総得点}',
    '不備があったが審査はできるときの本文'],
  ['受付不可', '{送信元} 様\n\n{コンテスト名}の受付用アドレスにメールをいただきましたが、ログを受け付けられませんでした。\n\n{不備の内容}\n\n' +
    'JARL形式（R2.1）の電子ログを、添付ファイルまたは本文に入れて、件名に呼出符号を入れてお送りください。\n' +
    'ログ以外のお問い合わせの場合は、委員会から改めてご連絡します。\n\n受付番号：{受付番号}\n受付日時：{受付日時}',
    'ログが見つからない・呼出符号が読めない・交信がないときの本文'],
  ['締切後', '{呼出符号} 局\n\n{コンテスト名}のログを受け取りましたが、締切（{締切}）を過ぎていました。\n' +
    '扱いは委員会で判断します。\n\n受付番号：{受付番号}\n受付日時：{受付日時}',
    '締切より後に届いたときの本文'],
  ['結び', '\n--\n{差出人名}\n※このメールは自動で送っています。',
    'どの本文にも最後に付ける文。{差出人名}は「基本設定」の「主催者」、{委員会URL}は「委員会URL」に置き換わる'],
  // LCRのメール送信（97_gas_lcrmail.js）で使う
  ['LCRの件名', '【{コンテスト名}】ログチェックレポート（{呼出符号}）', 'LCRを送るメールの件名'],
  ['LCRの本文', '{呼出符号} 局\n\n{コンテスト名}にご参加いただき、ありがとうございました。\n' +
    '貴局のログの審査結果（ログチェックレポート）をお送りします。\n\n{LCR}\n',
    'LCRを送るメールの本文。{LCR}の所にLCRが入る。最後に「結び」が付く']
];

// ------------------------------------------------------------------ メニューから
function menuIntakeSetup() {
  requireMailAccount_('受付用のシートを作る'); // メールのファイルは管理用アカウントだけが書ける
  setupIntakeSheets_();
  SpreadsheetApp.getUi().alert('メールのファイルの受付用のシート（受付履歴・返信文面）を用意しました。\n' +
    '「基本設定」の「受付締切」に締切日時（例：2026-06-10 23:59）を入れ、「返信文面」を確かめてから、\n' +
    '「受付の自動実行を始める（15分ごと）」を実行してください。');
}

function menuIntakeStart() {
  const ui = SpreadsheetApp.getUi();
  setupIntakeSheets_();
  if (!logFolderOrNull_()) throw new Error('「基本設定」シートに、ログのフォルダのURLを入れてください');
  const what = '受付の自動実行を始める';
  const empty = !basicValue_(MAIL_ACCOUNT_LABEL);
  if (!empty) requireMailAccount_(what); // 入っていて違うアカウントなら、ここで止める
  const me = currentMailUser_();
  if (!me) throw new Error(what + 'は、今のアカウントのアドレスが分からないため、実行できません。受付用のGmailアカウントで開いて実行してください。');
  const mail = intakeMailSetting_();
  const ok = ui.alert('受付の自動実行', (mail.use ?
    'このアカウント（' + me + '）のGmailに届いたメール' + (mail.to ? 'のうち、宛先が ' + mail.to + ' のもの' : '') + 'と、受付ページの提出を、15分ごとに受け付けます。\n' +
    '受付用のGmailアカウントで実行していることを確かめてください。始めますか？' :
    'メールでの受付を使わない設定です（「基本設定」の「' + INTAKE_MAIL_USE_LABEL + '」）。受信トレイは読まず、受付ページの提出だけを15分ごとに受け付けます。始めますか？') +
    (empty ? '\n\n「OK」を押すと、このアカウントを「基本設定」の「' + MAIL_ACCOUNT_LABEL + '」に入れます。' +
      'それから後は、ほかのアカウントでは受付や、メールを送るメニューが動きません。' : ''), ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  if (empty) {
    setBasicValue_(SpreadsheetApp.getActiveSpreadsheet(), MAIL_ACCOUNT_LABEL, me); // 95_gas_newyear.js
    logHistory_('「' + MAIL_ACCOUNT_LABEL + '」に ' + me + ' を入れました');
  }
  removeIntakeTriggers_();
  ScriptApp.newTrigger(INTAKE_TRIGGER_FUNC).timeBased().everyMinutes(15).create();
  logHistory_('受付の自動実行を始めました（15分ごと、' + me + '）');
  ui.alert('受付の自動実行を始めました。最初の受付処理は15分以内に動きます。\n今すぐ試すときは「今すぐ受付処理をする」を実行してください。');
}

/** どのアカウントでも動く（止めるだけ）。自動実行は始めたアカウントでないと止められないので、そのときは知らせる */
function menuIntakeStop() {
  const n = removeIntakeTriggers_();
  if (n) logHistory_('受付の自動実行を止めました');
  const want = basicValue_(MAIL_ACCOUNT_LABEL);
  const me = currentMailUser_();
  SpreadsheetApp.getUi().alert(n ? '受付の自動実行を止めました。' :
    'このアカウント' + (me ? '（' + me + '）' : '') + 'では、受付の自動実行は動いていませんでした。' +
    (want && want.toLowerCase() !== me ? '\nほかのアカウントで始めた自動実行は、ここからは止められません。' +
      MAIL_ACCOUNT_LABEL + '（' + want + '）で開いて、「受付の自動実行を止める」を実行してください。' : ''));
}

function menuIntakeNow() {
  setupIntakeSheets_();
  const r = runIntake_('今すぐ受付処理をする');
  const mailOff = !intakeMailSetting_().use;
  SpreadsheetApp.getUi().alert(r.busy ? 'ほかの受付処理が動いています。少し待ってから、もう一度実行してください。' :
    (mailOff ? 'メールでの受付を使わない設定です（「基本設定」の「' + INTAKE_MAIL_USE_LABEL + '」）。受信トレイは読まず、受付ページの提出だけを受け付けました。\n\n' : '') +
    '受付処理をしました。\n' + (mailOff ? '' : '新しいメール：' + r.messages + ' 通（ログ ' + r.logs + ' 件）\n') + 'Webの提出：' + r.web + ' 件\n返信：' + r.replies + ' 通' +
    (r.pending ? '\n※1日の送信上限のため、返信していないメールが ' + r.pending + ' 通あります（次回以降に送ります）' : '') +
    (r.more ? '\n※時間内に終わらなかったメールがあります。もう一度実行するか、次の自動実行を待ってください' : '') +
    (r.blocked ? '\n※' + r.blocked : ''));
}

/** 局の一覧の「採用する受付番号」を読んで、採用するログを決め直す（受付履歴とファイルを書き換えるので、管理用アカウントだけ） */
function menuIntakeRebuild() {
  requireMailAccount_('採用するログを決め直す');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { SpreadsheetApp.getUi().alert('受付処理が動いています。少し待ってから、もう一度実行してください。'); return; }
  try {
    setupIntakeSheets_();
    const r = syncAdopted_();
    logHistory_('採用するログを決め直しました（採用 ' + r.adopted + ' 局）');
    SpreadsheetApp.getUi().alert('採用するログを決め直し、「局の一覧」の左側を書き直しました。採用したログ：' + r.adopted + ' 局' +
      (r.notFound.length ? '\n\n※「採用する受付番号」の受付番号が、その局の受付履歴にありません（自動の決まりで採用しています）：\n' + r.notFound.join('\n') : ''));
  } finally { lock.releaseLock(); }
}

/**
 * 時間主導のトリガーから呼ばれる。管理用アカウントでないアカウントの自動実行が残っていたら、取り込まずに止め、
 * そのアカウントの自動実行を消す（履歴に残す）。行が空・アドレスが取れないときは、取り込まずに止めるだけ（次の回にまた調べる）
 */
function intakeTrigger() {
  try {
    runIntake_('受付の自動実行');
  } catch (e) {
    if (e && e.mailAccountBlock === 'other') {
      removeIntakeTriggers_();
      logHistory_(MAIL_ACCOUNT_LABEL + 'ではないアカウント（' + (currentMailUser_() || '不明') + '）の受付の自動実行を止めました');
      return;
    }
    if (e && e.mailAccountBlock) return;
    if (e && e.settingsEmpty) {
      // 規約がまだ入っていない（空のテンプレート）：15分ごとに落ちないように、変更履歴に1回だけ書いて止める。規約を入れれば次の回から受け付ける
      const props = PropertiesService.getScriptProperties();
      if (props.getProperty(PROP_SETTINGS_EMPTY) !== '1') logHistory_('受付の自動実行：' + e.message);
      props.setProperty(PROP_SETTINGS_EMPTY, '1');
      return;
    }
    throw e;
  }
}

/**
 * 受付で使う設定（loadConfig_）。規約のファイルが空（「1. 初期設定」したばかりのテンプレートで、規約をまだ読み込んでいない）なら、
 * 規約の直す所の一覧の代わりに、分かる言葉のエラーにする（エラーに settingsEmpty が付く。メールも受付ページの提出も受け付けずに残す）
 */
function intakeConfig_() {
  try {
    const cfg = loadConfig_();
    PropertiesService.getScriptProperties().setProperty(PROP_SETTINGS_EMPTY, '0');
    return cfg;
  } catch (e) {
    let empty = false;
    try { empty = settingsTablesEmpty(readSettingsTables_(settingsSpreadsheet_())); } catch (e2) { /* 規約のファイルが開けないときは、もとのエラーを出す */ }
    if (!empty) throw e;
    const err = new Error(SETTINGS_EMPTY_MESSAGE + '受付は、規約を入れるまで止めています（メールも受付ページの提出も、受け付けずにそのまま残しています）。' +
      '管理用アカウントで「規約をテキストから読み込む」を実行してください。');
    err.settingsEmpty = true;
    throw err;
  }
}

/** 実行しているアカウントのアドレス（小文字）。取れなければ '' */
function currentMailUser_() {
  try { return String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { return ''; }
}

/**
 * 管理用アカウントだけのメニュー（メールを読む・送る、確定、取り込みなど）の初めに呼ぶ。実行しているアカウントが
 * 「基本設定」の「管理用アカウント」と同じでなければ（行が空・アドレスが取れないときも）、履歴に残してエラーで止める。
 * what はメニューの名前（エラーの文に出す）。送信担当・審査担当のメニューからも呼ぶ（名前は前のまま）。
 * エラーには mailAccountBlock（'empty'・'unknown'・'other'）が付く
 */
function requireMailAccount_(what) {
  const want = String(basicValue_(MAIL_ACCOUNT_LABEL) || '').trim();
  const me = currentMailUser_();
  let msg = '', kind = '';
  if (!want) {
    kind = 'empty';
    msg = '「基本設定」の「' + MAIL_ACCOUNT_LABEL + '」が空です。このファイルの持ち主のアカウント（受付用のGmail）で「受付の自動実行を始める」を実行すると入ります';
  } else if (!me) {
    kind = 'unknown';
    msg = what + 'は、' + MAIL_ACCOUNT_LABEL + '（' + want + '）で実行してください。今のアカウントのアドレスが分からないため、実行できません。';
  } else if (me !== want.toLowerCase()) {
    kind = 'other';
    msg = what + 'は、' + MAIL_ACCOUNT_LABEL + '（' + want + '）で実行してください。今のアカウント（' + me + '）では実行できません。';
  }
  if (!kind) return;
  try { logHistory_('止めました：' + what + '（実行したアカウント：' + (me || '不明') + '、' + MAIL_ACCOUNT_LABEL + '：' + (want || '空') + '）'); } catch (e) { /* 履歴に書けなくても止める */ }
  const err = new Error(msg);
  err.mailAccountBlock = kind;
  throw err;
}

function removeIntakeTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === INTAKE_TRIGGER_FUNC) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

// ------------------------------------------------------------------ シートの準備
/**
 * 「基本設定」の「メールでの受付」「受け付けるメールの宛先」を読む。{use, to}
 *   use：「使わない」（「しない」も同じ）なら false。空・行がないときは「使う」（今までと同じ動き）
 *   to：受け付けるメールの宛先。行がなければ前の名前の行「受付するメールの宛先」を読む
 */
function intakeMailSetting_() {
  const use = String(basicValue_(INTAKE_MAIL_USE_LABEL) || '').trim();
  return { use: !/^(使わない|しない)$/.test(use), to: String(basicValue_(INTAKE_MAIL_TO_LABEL) || basicValue_('受付するメールの宛先') || '').trim() };
}

/** 「メールでの受付」の値のセルを「使う／使わない」のプルダウンにする（行がなければ何もしない） */
function setIntakeMailDropdown_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BASIC);
  if (!sh || sh.getLastRow() < 2) return;
  sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r, i) {
    if (String(r[0]).trim() !== INTAKE_MAIL_USE_LABEL) return;
    sh.getRange(i + 2, 2).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(INTAKE_MAIL_CHOICES, true)
      .setAllowInvalid(false).setHelpText('使う＝メールのログを受け付ける、使わない＝受付ページの提出だけを受け付ける').build());
  });
}

/** 受付履歴（メールのファイル）。なければ決まった場所に作る（91_gas_books.js） */
function intakeSheet_() {
  return bookSheet_(BOOK_MAIL, SHEET_INTAKE);
}

/** 返信文面（メールのファイル）。送信担当（LCR・案内メール・参加証）の文面も同じシート */
function replySheet_() {
  return bookSheet_(BOOK_MAIL, SHEET_REPLY);
}

/**
 * 受付用のシート（メールのファイルの受付履歴・返信文面）と「Web受付」のフォルダを用意する。
 * 「基本設定」の行は 91_gas_books.js の BASIC_ROWS が作るので、ここでは作らない。
 * 受付履歴の見出しが今の形と違う（前の版のシートなど）ときは、エラーで止める（自動で移す仕組みは作らない：シートの整理 0.）
 */
function setupIntakeSheets_() {
  // ログのフォルダが入っていれば、「Web受付」と「Web受付/処理済み」のフォルダを作っておく（URLが違うときは何もしない。受付処理でエラーになる）
  try {
    const lf = logFolderOrNull_();
    if (lf) setupWebIntakeFolders_(lf);
  } catch (e) { /* 何もしない */ }
  const ih = intakeSheet_();
  const head = ih.getLastRow() >= 1 ? ih.getRange(1, 1, 1, INTAKE_HEADER.length).getDisplayValues()[0] : [];
  if (head.join('|') !== INTAKE_HEADER.join('|')) {
    if (ih.getLastRow() > 1) {
      throw new Error('メールのファイルの「' + SHEET_INTAKE + '」の1行目の見出しが、今の形と違います。前の版のシートは使えません。' +
        '1行目を次の見出しにしてください：' + INTAKE_HEADER.join('｜'));
    }
    ih.getRange(1, 1, 1, INTAKE_HEADER.length).setValues([INTAKE_HEADER]).setFontWeight('bold');
    ih.setFrozenRows(1);
  }
  setIntakeMailDropdown_();
  const rp = replySheet_();
  rp.getRange(1, 1, 1, REPLY_HEADER.length).setValues([REPLY_HEADER]).setFontWeight('bold');
  const haveR = rp.getLastRow() > 1 ? rp.getRange(2, 1, rp.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  REPLY_DEFAULTS.forEach(function (row) { if (haveR.indexOf(row[0]) < 0) rp.appendRow(row); });
}

/**
 * 「受付締切」の値から、後ろの「JST」「、JST」「（JST）」を除く（前の版の説明の例「2026-06-10 23:59、JST」を
 * そのまま写したときのため。公開ページの読み方と同じ）。返信の {締切} にも、除いたものを使う
 */
function intakeDeadlineText_(text) {
  return String(text || '').replace(/[\s、,，]*[（(]?\s*JST\s*[)）]?\s*$/i, '').trim();
}

/** 受付番号の文字列を作る */
function formatIntakeNo_(prefix, n) {
  const s = n < 1000 ? ('00' + n).slice(-3) : String(n);
  return prefix ? prefix + '-' + s : s;
}

/** 受付履歴にある受付番号のうち、一番大きい通し番号（頭の文字は問わない）。なければ 0 */
function maxIntakeNo_(sh) {
  if (sh.getLastRow() < 2) return 0;
  let max = 0;
  sh.getRange(2, IC['受付番号'] + 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
    const m = /(\d+)$/.exec(String(r[0]).trim());
    if (m && String(r[0]).indexOf('#') < 0 && +m[1] > max) max = +m[1];
  });
  return max;
}

/** ログのフォルダ。URLが入っていなければ null（90_gas_main.js の logFolder_ はエラーにする） */
function logFolderOrNull_() {
  const m = /[-\w]{25,}/.exec(basicValue_('ログのフォルダ'));
  return m ? DriveApp.getFolderById(m[0]) : null;
}

function subFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** ログのフォルダ（logFolder）の中に「Web受付」「Web受付/処理済み」を作る（あればそのまま）。「Web受付」を返す。新年度の準備からも呼ぶ */
function setupWebIntakeFolders_(logFolder) {
  const box = subFolder_(logFolder, WEB_INTAKE_FOLDER_NAME);
  subFolder_(box, WEB_DONE_FOLDER_NAME);
  return box;
}

function getLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

/** 返信文面（メールのファイル）を読む。{項目: 文面}。シートにない項目は初めの文面。送信担当も使う */
function readReplyTemplates_() {
  const out = {};
  REPLY_DEFAULTS.forEach(function (r) { out[r[0]] = r[1]; });
  const sh = replySheet_();
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0] && String(r[1]).trim()) out[String(r[0]).trim()] = String(r[1]);
    });
  }
  return out;
}

// ------------------------------------------------------------------ 受付処理の本体
/**
 * what: 実行したメニューの名前（管理用アカウントでないときのエラーの文に出す）
 * 戻り値: {busy, messages, web, logs, replies, pending, more, blocked（受付のメールを送れなかった理由。なければ ''）}
 */
function runIntake_(what) {
  requireMailAccount_(what || '受付処理'); // メールに触る前に（違うアカウントなら、ここでエラーで止まる）
  const res = { busy: false, messages: 0, web: 0, logs: 0, replies: 0, pending: 0, more: false, blocked: '' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { res.busy = true; return res; }
  const t0 = Date.now();
  try {
    const props = PropertiesService.getScriptProperties();
    const mail = intakeMailSetting_();
    // 「メールでの受付」が「使わない」なら、受信トレイを読まない（受付ページの提出だけを受け付ける）
    const threads = mail.use ? GmailApp.search(intakeMailQuery(mail.to), 0, INTAKE_MAX_THREADS) : [];
    const hasPending = props.getProperty(PROP_PENDING_REPLY) === '1';
    const folder = logFolderOrNull_();
    const webBox = folder ? setupWebIntakeFolders_(folder) : null;
    const webFiles = webBox ? listWebIntakeFiles_(webBox) : [];
    if (threads.length === 0 && webFiles.length === 0 && !hasPending) return res; // 未処理のメール・提出がなければ、シートも開かずに終わる

    setupIntakeSheets_();
    if (!folder) throw new Error('「基本設定」シートに、ログのフォルダのURLを入れてください');
    const orig = subFolder_(folder, ORIGINAL_FOLDER_NAME);
    const cfg = intakeConfig_();
    const dl = intakeDeadlineText_(basicValue_('受付締切'));
    const deadline = dl ? jstStringToMinutes(dl) : null;
    if (dl && deadline == null) throw new Error('「基本設定」の「受付締切」が読み取れません（例：2026-06-10 23:59）');
    const sh = intakeSheet_();
    const known = {};
    if (sh.getLastRow() > 1) {
      sh.getRange(2, IC['メールID'] + 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
        known[String(r[0]).split('#')[0]] = true;
      });
    }
    const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    const labelDone = threads.length ? getLabel_(LABEL_DONE) : null, labelNoLog = threads.length ? getLabel_(LABEL_NOLOG) : null;
    const counter = { prefix: basicValue_('受付番号の頭'), next: maxIntakeNo_(sh) + 1 };
    const newRows = [];

    for (let ti = 0; ti < threads.length; ti++) {
      if (Date.now() - t0 > INTAKE_TIME_LIMIT_MS) { res.more = true; break; }
      const th = threads[ti];
      let noLog = false, allDone = true;
      th.getMessages().forEach(function (msg) {
        const id = msg.getId();
        if (known[id]) return;
        if (me && emailOf_(msg.getFrom()) === me) return;
        if (Date.now() - t0 > INTAKE_TIME_LIMIT_MS) { allDone = false; return; }
        const rows = intakeMessage_(msg, cfg, deadline, orig, counter);
        known[id] = true;
        res.messages++;
        rows.forEach(function (r) { if (r.call) res.logs++; });
        if (rows.length === 1 && !rows[0].hasLog) noLog = true;
        rows.forEach(function (r) { newRows.push(r.row); });
      });
      if (!allDone) { res.more = true; break; }
      th.addLabel(labelDone);
      if (noLog) th.addLabel(labelNoLog);
      th.moveToArchive();
    }
    // Webの提出（受け付けたら、すでに受け付けていたものも「処理済み」に移す）
    const webDone = webBox ? subFolder_(webBox, WEB_DONE_FOLDER_NAME) : null;
    for (let wi = 0; wi < webFiles.length && !res.more; wi++) {
      if (Date.now() - t0 > INTAKE_TIME_LIMIT_MS) { res.more = true; break; }
      const wf = webFiles[wi];
      const key = WEB_KEY_PREFIX + wf.meta.id;
      if (!known[key]) {
        const r = intakeWebFile_(wf, cfg, deadline, orig, counter);
        known[key] = true;
        res.web++;
        if (r.call) res.logs++;
        newRows.push(r.row);
      }
      wf.file.moveTo(webDone);
    }
    if (newRows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, newRows.length, INTAKE_HEADER.length).setNumberFormat('@').setValues(newRows);
    }
    if (newRows.length || hasPending) {
      syncAdopted_();
      const rp = sendPendingReplies_(cfg, dl);
      res.replies = rp.sent; res.pending = rp.pending; res.blocked = rp.blocked;
      props.setProperty(PROP_PENDING_REPLY, rp.pending ? '1' : '0');
      // 送れなかった理由は、変わったときだけ変更履歴に書く（15分ごとに同じ文が並ばないように）
      if (rp.blocked && props.getProperty(PROP_REPLY_BLOCK) !== rp.blocked) logHistory_('受付のメールを送りませんでした：' + rp.blocked);
      props.setProperty(PROP_REPLY_BLOCK, rp.blocked || '');
    }
    if (res.messages || res.web) logHistory_('受付処理：メール ' + res.messages + ' 通、Webの提出 ' + res.web + ' 件、ログ ' + res.logs + ' 件、返信 ' + res.replies + ' 通');
    return res;
  } finally {
    lock.releaseLock();
  }
}

function emailOf_(from) {
  const m = /<([^>]+)>/.exec(String(from || ''));
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

/** 文字コードを判定して読む（UTF-8で読めなければShift_JIS） */
function decodeLogBlob_(blob) {
  const utf8 = blob.getDataAsString('UTF-8');
  return utf8.indexOf('�') >= 0 ? blob.getDataAsString('Shift_JIS') : utf8;
}

/**
 * 1通のメールを受け付ける。ログ1件ごとに受付履歴の1行を返す（ログがなければ1行）。
 * 戻り値: [{row, call, hasLog}]
 */
function intakeMessage_(msg, cfg, deadline, origFolder, counter) {
  const takeNo = function () { return formatIntakeNo_(counter.prefix, counter.next++); };
  const date = msg.getDate();
  const ms = date.getTime();
  const received = msToJstSeconds(ms);
  const stamp = received.replace(/[-:]/g, '').replace(' ', '-');
  const from = msg.getFrom();
  const subject = msg.getSubject() || '';
  const headers = {};
  ['Auto-Submitted', 'Precedence', 'X-Autoreply', 'X-Autorespond', 'List-Id'].forEach(function (k) {
    try { headers[k] = msg.getHeader(k); } catch (e) { headers[k] = ''; }
  });
  const auto = isAutoMail(from, headers);
  const id = msg.getId();

  // ログを探す：添付ファイル → 本文
  const found = [], notes = [];
  msg.getAttachments({ includeInlineImages: false }).forEach(function (a) {
    const name = a.getName() || '添付ファイル';
    if (/\.(zip|lzh|lha|7z|rar|gz)$/i.test(name)) { notes.push('圧縮ファイル「' + name + '」は読めません。展開したテキストファイルを送ってください'); return; }
    if (/\.(docx?|xlsx?|pdf|jpe?g|png|gif)$/i.test(name)) { notes.push('「' + name + '」はログとして読めません（テキストファイルで送ってください）'); return; }
    const text = decodeLogBlob_(a);
    if (looksLikeLog(text)) found.push({ text: text, name: name, blob: a });
  });
  if (!found.length) {
    const body = extractLogFromText(msg.getPlainBody());
    if (body) found.push({ text: body, name: '本文.txt', blob: null });
  }

  const reply = auto ? '送らない（自動送信のメール）' : '未送信';
  if (!found.length) {
    const problems = [{ level: '不備', message: 'ログが見つかりませんでした（添付ファイルにも本文にも <SUMMARYSHEET VERSION=R2.1> がありません）' }]
      .concat(notes.map(function (n) { return { level: '不備', message: n }; }));
    return [{ hasLog: false, call: '', row: intakeRow_(received, from, subject, '', '', '', '', '',
      deadline != null && ms / 60000 > deadline ? INTAKE_STATUS.LATE : INTAKE_STATUS.REJECT,
      problemsText(problems), '', reply, id + '#0', '', takeNo()) }];
  }
  return found.map(function (f, i) {
    const parsed = parseJarlLog(f.text);
    const ev = evaluateSubmission(parsed, { subject: subject, receivedMinutes: ms / 60000, deadlineMinutes: deadline }, cfg);
    notes.forEach(function (n) { ev.problems.push({ level: '注意', message: n }); });
    const no = takeNo();
    const callName = (ev.callText || '不明').replace(/[\/\\]/g, '_');
    const fname = no + '_' + stamp + '_' + callName + '_' + f.name.replace(/[\/\\]/g, '_');
    const file = f.blob ? origFolder.createFile(f.blob.copyBlob().setName(fname))
      : origFolder.createFile(fname, f.text, MimeType.PLAIN_TEXT);
    file.setDescription('受付番号 ' + no + ' / メールID ' + id + '#' + i + ' / 送信元 ' + from + ' / 件名 ' + subject);
    return { hasLog: true, call: ev.callText, row: intakeRow_(received, from, subject, ev.callText, ev.category, ev.section, ev.qsoCount,
      ev.declaredTotal, ev.status, problemsText(ev.problems), file.getUrl(), reply, id + '#' + i, file.getId(), no) };
  });
}

/**
 * 「Web受付」の中の、受け付けていないファイル（説明欄が箱の決まりの JSON のもの）を、提出の順に返す。[{file, meta}]
 * 説明欄が決まりの形でないファイルは、受け付けずにそのまま置いておく
 */
function listWebIntakeFiles_(box) {
  const out = [];
  const it = box.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const meta = parseWebIntakeMeta(f.getDescription());
    if (meta) out.push({ file: f, meta: meta });
  }
  out.sort(function (a, b) { return a.meta.submittedAt < b.meta.submittedAt ? -1 : a.meta.submittedAt > b.meta.submittedAt ? 1 : 0; });
  return out;
}

/**
 * Webの提出を1件受け付けて、受付履歴の1行を返す。{row, call}
 *   受付日時：submittedAt（紙ログで届いた日があれば、その日の 00:00）。締切の判定もこれで行う
 *   送信元：email（紙ログでメールアドレスが空なら「紙ログ（郵送）」）。メールアドレスがなければ受付のメールは送らない
 */
function intakeWebFile_(wf, cfg, deadline, origFolder, counter) {
  const m = wf.meta;
  const w = webIntakeInfo(m);
  const text = decodeLogBlob_(wf.file.getBlob());
  const parsed = parseJarlLog(text);
  const ev = evaluateSubmission(parsed, { subject: parsed.summary.CALLSIGN || '', receivedMinutes: w.receivedMinutes, deadlineMinutes: deadline }, cfg);
  const no = formatIntakeNo_(counter.prefix, counter.next++);
  const stamp = w.received.replace(/[-:]/g, '').replace(' ', '-');
  const callName = (ev.callText || '不明').replace(/[\/\\]/g, '_');
  const copy = wf.file.makeCopy(no + '_' + stamp + '_' + callName + '_' + (m.paper ? '紙ログ' : 'Web') + '.txt', origFolder);
  copy.setDescription('受付番号 ' + no + ' / メールID ' + WEB_KEY_PREFIX + m.id + '#0 / 送信元 ' + w.from + ' / ' + w.subject);
  return { call: ev.callText, row: intakeRow_(w.received, w.from, w.subject, ev.callText, ev.category, ev.section, ev.qsoCount,
    ev.declaredTotal, ev.status, problemsText(ev.problems), copy.getUrl(), w.reply, WEB_KEY_PREFIX + m.id + '#0', copy.getId(), no) };
}

function intakeRow_(received, from, subject, call, cat, section, qsos, total, status, problems, url, reply, key, fileId, no) {
  const r = [];
  r[IC['受付日時']] = received; r[IC['送信元']] = from; r[IC['件名']] = subject; r[IC['呼出符号']] = call;
  r[IC['種目']] = cat; r[IC['開催部門']] = section || ''; r[IC['交信数']] = String(qsos); r[IC['申告総得点']] = String(total); r[IC['状態']] = status;
  r[IC['不備・注意の内容']] = problems; r[IC['原本']] = url; r[IC['返信']] = reply;
  r[IC['採用']] = ''; r[IC['受付番号']] = no; r[IC['原本のファイルID']] = fileId; r[IC['メールID']] = key;
  return r;
}

// ------------------------------------------------------------------ 採用するログと局の一覧
/**
 * 受付履歴から局ごとに採用するログを決め、「提出ログ」直下のファイルと、審査のファイルの「局の一覧」の左側をそろえる。
 * 委員会の判断は、局の一覧の「採用する受付番号」（空なら自動の決まり、「なし」なら採用しない）から読む（adoptDecision）。
 * 局の一覧を書くのは審査担当の関数（90_gas_main.js の stationListRead_・stationListWriteLeft_）。右側（委員が書く列）は書かない。
 * 戻り値：{adopted（採用した局の数）, notFound（「採用する受付番号」が、その局の受付履歴にない局の文の一覧）}
 */
function syncAdopted_() {
  const out = { adopted: 0, notFound: [] };
  const sh = intakeSheet_();
  const folder = logFolderOrNull_();
  if (!folder) return out;
  const n = sh.getLastRow() - 1;
  const data = n > 0 ? sh.getRange(2, 1, n, INTAKE_HEADER.length).getDisplayValues() : [];
  const adoptNos = {};
  // 採用は「局と開催部門」ごと（鍵は 90_gas_main.js の stationKey_：呼出符号の本体、開催部門があれば「本体|開催部門」。No.145・No.146）
  stationListRead_().forEach(function (st) { if (st.adoptNo && adoptNos[st.key] == null) adoptNos[st.key] = st.adoptNo; });
  const rows = data.map(function (r) {
    const b = r[IC['呼出符号']] ? normalizeCall(r[IC['呼出符号']]).base : '';
    const base = b ? stationKey_(b, r[IC['開催部門']]) : '';
    return { key: r[IC['メールID']], base: base, section: r[IC['開催部門']], receivedAt: r[IC['受付日時']], status: r[IC['状態']],
      decision: base ? adoptDecision(adoptNos[base], r[IC['受付番号']]) : '', r: r };
  });
  const adopted = chooseAdopted(rows);
  const adoptedKeys = {};
  Object.keys(adopted).forEach(function (b) { adoptedKeys[adopted[b]] = b; });

  // 「提出ログ」直下の、受付処理が置いたファイル（説明欄が「受付:」で始まる）
  const managed = {};
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const d = String(f.getDescription() || '');
    if (d.indexOf('受付:') === 0) managed[d.substring(3)] = f;
  }
  rows.forEach(function (row) {
    if (!adoptedKeys[row.key]) return;
    const name = row.r[IC['呼出符号']].replace(/[\/\\]/g, '_') + (row.section ? '_' + row.section : '') + '.txt'; // 開催部門ごとに別のファイル
    const cur = managed[row.key];
    if (cur) { if (cur.getName() !== name) cur.setName(name); delete managed[row.key]; return; }
    const id = row.r[IC['原本のファイルID']];
    if (!id) return;
    const copy = DriveApp.getFileById(id).makeCopy(name, folder);
    copy.setDescription('受付:' + row.key);
  });
  Object.keys(managed).forEach(function (k) { managed[k].setTrashed(true); }); // 採用しなくなったもの

  // 採用の列
  if (n > 0) {
    sh.getRange(2, IC['採用'] + 1, n, 1).setValues(rows.map(function (row) { return [adoptedKeys[row.key] ? '◯' : '']; }));
  }

  // 局の一覧の左側（局ごとに1つ）：提出回数・採用中の受付番号・受付の状態・申告の種目
  const byBase = {}, order = [];
  rows.forEach(function (row) {
    if (!row.base) return;
    if (!byBase[row.base]) { byBase[row.base] = []; order.push(row.base); }
    byBase[row.base].push(row);
  });
  const entries = order.map(function (b) {
    const all = byBase[b];
    const pickKey = adopted[b];
    const latest = all.slice().sort(function (x, y) { return x.receivedAt < y.receivedAt ? 1 : x.receivedAt > y.receivedAt ? -1 : 0; })[0];
    const pick = all.filter(function (x) { return x.key === pickKey; })[0] || latest;
    const want = adoptNos[b] || '';
    const none = want && adoptNoIsNone(want);
    const found = !want || none || all.some(function (x) { return x.decision === '採用'; });
    let status = pick.status;
    if (!pickKey) status += none ? '（委員会が採用しない）' : '（採用なし）';
    else if (pick.decision === '採用') status += '（委員会が採用）';
    if (!found) {
      status += '（採用する受付番号「' + want + '」がありません）';
      out.notFound.push(pick.r[IC['呼出符号']] + (all[0].section ? '（' + all[0].section + '）' : '') + '：「' + want + '」');
    }
    return { call: all[0].r[IC['呼出符号']], section: all[0].section || '', count: all.length, adoptedNo: pickKey ? pick.r[IC['受付番号']] : '', status: status, category: pick.r[IC['種目']] };
  });
  if (entries.length) stationListWriteLeft_(entries); // 90_gas_main.js（審査担当）
  out.adopted = Object.keys(adopted).length;
  return out;
}

// ------------------------------------------------------------------ 自動返信
/** 「返信」が「未送信」の行に返信する（1通のメールに複数のログがあれば、まとめて1通）。1日の上限を超える分は次回に回す */
function sendPendingReplies_(cfg, deadlineText) {
  const sh = intakeSheet_();
  const out = { sent: 0, pending: 0, blocked: '' };
  const n = sh.getLastRow() - 1;
  if (n <= 0) return out;
  const data = sh.getRange(2, 1, n, INTAKE_HEADER.length).getDisplayValues();
  const groups = {}, order = [];
  data.forEach(function (r, i) {
    if (r[IC['返信']] !== '未送信') return;
    const mid = String(r[IC['メールID']]).split('#')[0];
    if (!groups[mid]) { groups[mid] = []; order.push(mid); }
    groups[mid].push(i);
  });
  if (!order.length) return out;
  const tpl = readReplyTemplates_();
  const title = contestTitle(cfg);
  const senderName = basicValue_(ORGANIZER_LABEL) || title; // 「主催者」（90_gas_main.js）。空ならコンテスト名
  const committeeUrl = basicValue_(COMMITTEE_URL_LABEL);
  // 文面で {委員会URL} を使っているのに「委員会URL」が空なら、送らずに「未送信」のまま残す（入れたら次の受付処理で送る）
  if (!committeeUrl) {
    const used = ['件名', '結び'].concat(order.map(function (mid) { return data[groups[mid][0]][IC['状態']]; }))
      .filter(function (k, i, a) { return a.indexOf(k) === i && String(tpl[k] || '').indexOf('{委員会URL}') >= 0; });
    if (used.length) {
      out.blocked = '返信文面の「' + used.join('」「') + '」に {委員会URL} がありますが、「基本設定」の「' + COMMITTEE_URL_LABEL +
        '」が空です。委員会のホームページのURLを入れてください（入れるまで受付のメールは送らず、入れたら次の受付処理で送ります）';
      out.pending = order.length;
      return out;
    }
  }
  order.forEach(function (mid) {
    if (MailApp.getRemainingDailyQuota() < 1) { out.pending++; return; }
    const idx = groups[mid];
    const bodies = idx.map(function (i) { return replyBody_(data[i], tpl, title, deadlineText, senderName, committeeUrl); });
    const first = data[idx[0]];
    const vars = replyVars_(first, title, deadlineText, senderName, committeeUrl);
    const body = bodies.join('\n\n────────────────\n\n') + fillTemplate(tpl['結び'], vars);
    const subject = fillTemplate(tpl['件名'], vars);
    let mark;
    try {
      if (mid.indexOf(WEB_KEY_PREFIX) === 0) {
        // Webの提出：返信する元のメールがないので、入れてもらったメールアドレスに新しく送る
        GmailApp.sendEmail(first[IC['送信元']], subject, body, { name: senderName });
      } else {
        GmailApp.getMessageById(mid).reply(body, { name: senderName, subject: subject });
      }
      mark = '送信済み ' + msToJstSeconds(Date.now()).substring(0, 16);
      out.sent++;
    } catch (e) {
      mark = '送信できず：' + (e && e.message ? e.message : e);
    }
    idx.forEach(function (i) { sh.getRange(i + 2, IC['返信'] + 1).setValue(mark); });
  });
  return out;
}

function replyVars_(r, title, deadlineText, senderName, committeeUrl) {
  const probs = String(r[IC['不備・注意の内容']] || '');
  const notes = probs.split('\n').filter(function (l) { return l.indexOf('【不備】') < 0 && l.trim(); });
  return {
    'コンテスト名': title, '差出人名': senderName || title, '呼出符号': r[IC['呼出符号']] || '（不明）', '送信元': r[IC['送信元']],
    '受付番号': r[IC['受付番号']], '受付日時': r[IC['受付日時']], '種目': r[IC['種目']], '交信数': r[IC['交信数']], '申告総得点': r[IC['申告総得点']],
    '不備の内容': probs, '注意の内容': notes.length ? '\n次の点を確かめてください（受付には影響しません）。\n' + notes.join('\n') + '\n' : '',
    '締切': deadlineText || '締切', '委員会URL': committeeUrl || '', '部門': r[IC['開催部門']] || '',
    '部門（かっこ付き）': r[IC['開催部門']] ? '（' + r[IC['開催部門']] + '）' : '' // 開催部門のないコンテストは空（参加種目の後ろに付ける。ユーザーが決めた）
  };
}

function replyBody_(r, tpl, title, deadlineText, senderName, committeeUrl) {
  const status = r[IC['状態']];
  return fillTemplate(tpl[status] || tpl['受付済み'], replyVars_(r, title, deadlineText, senderName, committeeUrl));
}

// ===== 97_gas_lcrmail.js =====
/**
 * LCRのメール送信（GAS専用）
 *
 * 「3. フォルダのログを審査する」で作った LCR/_LCRデータ.json から、局ごとにLCRをメールの本文で送る。
 * 無料のGmailは1日に送れる数に上限（100通）があるので、上限まで送ったら止め、残りは翌日以降に送る。
 *
 *   送信リストを作る      : 「LCR送信」シートに、局ごとの送り先と状態を書く（送る前に委員が確かめる）
 *   試しに1通、自分に送る : 1局目のLCRを、実行した人のアドレスに送る（状態は変えない）
 *   今すぐ送る            : 「未送信」の局に、1日の上限まで送る
 *   毎日の自動送信を始める: 今すぐ送り、そのあと毎日1回送る。全局送り終えたら自動で止まる
 *
 * 送り先：「送り先の指定」（委員が入力）→ サマリーのEMAIL欄 → 受付メールの送信元 の順
 * 状態  ：未送信・送信済み・送らない（委員が選ぶ）・送り先なし・メールアドレスなし（紙ログ）・送信できず
 *         送り直すときは、状態を「未送信」に戻す（審査し直してLCRが変わったときなど）
 * 文面  ：「返信文面」シートの「LCRの件名」「LCRの本文」「結び」。{受付ページのURL} {委員会URL} なども差し込める（使っていて空なら止める）
 *         返信先は「問い合わせ先」（メールアドレスのとき。案内メール・参加証と同じ。申し送り No.177）。付けられないときは画面に注意を出す
 *         開催部門のあるコンテスト（新潟）は、LCR が開催部門ごとに1通。{部門} が使え、件名に {部門} がなければ「（7MHz部門）」を後ろに付ける
 * シート：「LCR送信」「受付履歴」「返信文面」はメールのファイル（91_gas_books.js の BOOK_MAIL。共有者は見るだけ）。
 *         そのため、送信リストを作るのも管理用アカウントだけ（シートの整理 G）
 */

const SHEET_LCRMAIL = 'LCR送信';
const LCRMAIL_TRIGGER_FUNC = 'lcrMailTrigger';
const LCRMAIL_TRIGGER_HOUR = 9;               // 毎日の自動送信の時刻（9時台）
const LCRMAIL_TIME_LIMIT_MS = 4.5 * 60 * 1000; // 6分の制限より前に切り上げる

// ------------------------------------------------------------------ メニューから
function menuLcrMailList() {
  try { requireMailAccount_('LCRの送信リストを作る'); } catch (e) { SpreadsheetApp.getUi().alert(e.message); return; } // メールのファイルに書くため（シートの整理 G）
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { SpreadsheetApp.getUi().alert('ほかの処理（受付・LCR送信）が動いています。少し待ってから、もう一度実行してください。'); return; }
  try {
    let data;
    try { data = loadLcrData_(); } catch (e) { SpreadsheetApp.getUi().alert(e.message); return; } // ログのフォルダが空・まだ審査していないなど（エラーで落とさない）
    const st = syncLcrMailList_(data).stats;
    SpreadsheetApp.getUi().alert('メールのファイルの「' + SHEET_LCRMAIL + '」シートに送信リストを作りました。\n' + book_(BOOK_MAIL).getUrl() + '\n\n' + lcrMailStatsText_(st) +
      '\n\n送り先を確かめてください。直すときは「送り先の指定」の列に入れ、送らない局は「状態」を「送らない」にします。\n' +
      '文面は、メールのファイルの「返信文面」シートの「LCRの件名」「LCRの本文」で直せます。');
  } finally { lock.releaseLock(); }
}

function menuLcrMailTest() {
  const ui = SpreadsheetApp.getUi();
  try { requireMailAccount_('LCRを試しに自分に送る'); } catch (e) { ui.alert(e.message); return; } // メールを扱うアカウントでなければ止める（96_gas_intake.js。申し送り No.65）
  const me = Session.getEffectiveUser().getEmail();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { ui.alert('ほかの処理（受付・LCR送信）が動いています。少し待ってから、もう一度実行してください。'); return; }
  try {
    let data;
    try { data = loadLcrData_(); } catch (e) { ui.alert(e.message); return; } // ログのフォルダが空・まだ審査していないなど
    const sync = syncLcrMailList_(data);
    const row = sync.rows.filter(function (r) { return r[LC['状態']] === LCRMAIL_STATUS.PENDING; })[0] || sync.rows[0];
    if (!row) { ui.alert('送るLCRがありません。'); return; }
    if (MailApp.getRemainingDailyQuota() < 1) { ui.alert('今日の送信の上限に達しています。明日、もう一度試してください。'); return; }
    const item = sync.itemByName[row[LC['LCRファイル名']]];
    let ctx;
    try { ctx = lcrMailContext_(); } catch (e) { ui.alert(e.message); return; } // 文面で使うURLが空など
    const mail = buildLcrMail_(item, ctx);
    GmailApp.sendEmail(me, '【試し】' + mail.subject,
      '※試しの送信です。本来の送り先：' + (row[LC['送り先']] || '（なし）') + '（' + row[LC['送り先の根拠']] + '）\n\n' + mail.body,
      mail.options);
    logHistory_('LCRを試しに送りました（' + row[LC['呼出符号']] + ' の分を ' + me + ' へ）');
    ui.alert(row[LC['呼出符号']] + ' 局のLCRを、試しに ' + me + ' へ送りました。受信したメールで見え方を確かめてください。\n' +
      '（「LCR送信」シートの状態は変わりません）' + (ctx.replyTo ? '' : '\n\n' + MAIL_NO_REPLY_TO_NOTE));
  } finally { lock.releaseLock(); }
}

function menuLcrMailNow() {
  const r = runLcrMail_();
  SpreadsheetApp.getUi().alert(lcrMailResultText_(r));
}

function menuLcrMailStart() {
  const ui = SpreadsheetApp.getUi();
  try { requireMailAccount_('LCRの自動送信を始める'); } catch (e) { ui.alert(e.message); return; } // メールを扱うアカウントでなければ止める（96_gas_intake.js。申し送り No.65）
  const me = Session.getEffectiveUser().getEmail();
  const ok = ui.alert('LCRの自動送信', 'このアカウント（' + me + '）から、「LCR送信」シートの「未送信」の局へLCRを送ります。\n' +
    '今すぐ1日の上限まで送り、残りは毎日' + LCRMAIL_TRIGGER_HOUR + '時台に送ります。全局送り終えたら自動で止まります。\n\n' +
    (mailReplyTo_() ? '' : MAIL_NO_REPLY_TO_NOTE + '\n\n') +
    '先に「送信リストを作る」で送り先を確かめましたか？始めますか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  removeLcrMailTriggers_();
  const r = runLcrMail_();
  if (r.busy || r.error) { ui.alert(lcrMailResultText_(r)); return; }
  if (r.stats.pending > 0) {
    ScriptApp.newTrigger(LCRMAIL_TRIGGER_FUNC).timeBased().everyDays(1).atHour(LCRMAIL_TRIGGER_HOUR).create();
    logHistory_('LCRの自動送信を始めました（毎日' + LCRMAIL_TRIGGER_HOUR + '時台、' + me + '）');
    ui.alert(lcrMailResultText_(r) + '\n\n残りは毎日' + LCRMAIL_TRIGGER_HOUR + '時台に自動で送ります。');
  } else {
    ui.alert(lcrMailResultText_(r) + '\n\n「未送信」の局がないので、自動送信は始めていません。');
  }
}

function menuLcrMailStop() {
  const n = removeLcrMailTriggers_();
  logHistory_('LCRの自動送信を止めました');
  SpreadsheetApp.getUi().alert(n ? 'LCRの自動送信を止めました。' : 'LCRの自動送信は動いていませんでした。');
}

/** 毎日の時間主導トリガーから呼ばれる。全局送り終えたらトリガーを消す */
function lcrMailTrigger() {
  const r = runLcrMail_();
  if (!r.busy && !r.error && r.stats.pending === 0) {
    removeLcrMailTriggers_();
    logHistory_('LCRの送信が終わったので、自動送信を止めました（' + lcrMailStatsText_(r.stats).replace(/\n/g, '、') + '）');
  }
}

function removeLcrMailTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === LCRMAIL_TRIGGER_FUNC) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

// ------------------------------------------------------------------ 送信の本体
/**
 * 「未送信」の局に、1日の上限と時間の許す限り送る。
 * 戻り値: {busy, error, sent, failed, quotaOut, timeOut, stats}
 */
function runLcrMail_() {
  const res = { busy: false, error: '', sent: 0, failed: 0, quotaOut: false, timeOut: false, stats: null, noReplyTo: false };
  const lock = LockService.getScriptLock(); // 受付処理と同じロック（送信の枠を取り合わないように）
  if (!lock.tryLock(10000)) { res.busy = true; return res; }
  const t0 = Date.now();
  try {
    // 毎日の自動送信が、ほかのアカウントで残っていても送らない
  try { requireMailAccount_('LCRを送る'); } catch (e) { res.error = e.message; return res; } // メールを扱うアカウントでなければ止める（96_gas_intake.js。申し送り No.65）
    let data;
    try { data = loadLcrData_(); } catch (e) { res.error = e.message; return res; }
    const sync = syncLcrMailList_(data);
    const sh = lcrMailSheet_();
    let ctx;
    try { ctx = lcrMailContext_(); } catch (e) { res.error = e.message; return res; }
    res.noReplyTo = !ctx.replyTo;
    for (let i = 0; i < sync.rows.length; i++) {
      const row = sync.rows[i];
      if (row[LC['状態']] !== LCRMAIL_STATUS.PENDING) continue;
      if (Date.now() - t0 > LCRMAIL_TIME_LIMIT_MS) { res.timeOut = true; break; }
      if (MailApp.getRemainingDailyQuota() < 1) { res.quotaOut = true; break; }
      const item = sync.itemByName[row[LC['LCRファイル名']]];
      const now = msToJstSeconds(Date.now()).substring(0, 16);
      try {
        const mail = buildLcrMail_(item, ctx);
        GmailApp.sendEmail(row[LC['送り先']], mail.subject, mail.body, mail.options);
        row[LC['状態']] = LCRMAIL_STATUS.SENT;
        row[LC['送信日時']] = now;
        res.sent++;
      } catch (e) {
        row[LC['状態']] = LCRMAIL_STATUS.FAILED;
        row[LC['送信日時']] = now;
        row[LC['メモ']] = '送信できず：' + (e && e.message ? e.message : e);
        res.failed++;
      }
      // 1局ずつシートに書く（途中で止まっても、送った局を二重に送らないように）
      sh.getRange(i + 2, 1, 1, LCRMAIL_HEADER.length).setNumberFormat('@').setValues([row]);
    }
    res.stats = lcrMailStats_(sync.rows);
    if (res.sent || res.failed) {
      logHistory_('LCRをメールで送りました：' + res.sent + ' 通' + (res.failed ? '（送信できず ' + res.failed + ' 通）' : '') +
        '、残りの未送信 ' + res.stats.pending + ' 局' + (res.noReplyTo ? '（「問い合わせ先」がメールアドレスでないので、返信先なし）' : ''));
    }
    return res;
  } finally {
    lock.releaseLock();
  }
}

/** 文面・コンテスト名・差出人名（送る前に1回だけ読む） */
function lcrMailContext_() {
  ensureLcrTemplates_();
  const title = contestTitle(sendConfig_()); // 規約が空なら分かる言葉で止める（99_gas_guidemail.js）
  const tpl = readReplyTemplates_();
  const links = mailLinkVars_(); // {受付ページのURL} {委員会URL} {レコードのページのURL} など（99_gas_guidemail.js）
  checkMailLinks_('LCRのメールの文面', [tpl['LCRの件名'], tpl['LCRの本文'], tpl['結び']], links);
  return { tpl: tpl, title: title, name: basicValue_(ORGANIZER_LABEL) || title, links: links, replyTo: mailReplyTo_() }; // 返信先（99_gas_guidemail.js）
}

/** 1局分のメール（件名・本文・差出人名・送るときの指定（差出人名・返信先）） */
function buildLcrMail_(item, ctx) {
  const section = String(item.section || ''); // 開催部門名（新潟の「7MHz部門」など。なければ ''。申し送り No.147）
  const vars = Object.assign({ 'コンテスト名': ctx.title, '差出人名': ctx.name, '呼出符号': item.call, '種目': item.category || '', '部門': section,
    'LCR': String(item.text || '').replace(/\r?\n$/, '') }, ctx.links || {});
  // 同じ局に開催部門ごとに届くので、件名で見分けられるように、件名の文面に {部門} がなければ後ろに付ける（本文のLCRの見出しにも出る）
  const subjectTpl = ctx.tpl['LCRの件名'];
  return {
    subject: fillTemplate(subjectTpl, vars) + (section && String(subjectTpl).indexOf('{部門}') < 0 ? '（' + section + '）' : ''),
    body: fillTemplate(ctx.tpl['LCRの本文'], vars) + fillTemplate(ctx.tpl['結び'], vars),
    name: ctx.name,
    options: ctx.replyTo ? { name: ctx.name, replyTo: ctx.replyTo } : { name: ctx.name }
  };
}

// ------------------------------------------------------------------ データと送信リスト
/** LCR/_LCRデータ.json を読む */
function loadLcrData_() {
  const folder = logFolder_();
  const it = folder.getFoldersByName(LCR_FOLDER_NAME);
  const df = it.hasNext() ? it.next().getFilesByName(LCR_DATA_FILE) : null;
  if (!df || !df.hasNext()) throw new Error('先に「3. フォルダのログを審査する」を実行してください。');
  const data = JSON.parse(df.next().getBlob().getDataAsString('UTF-8'));
  if (!data.items || !data.items.length) throw new Error('LCRのデータに局がありません。「3. フォルダのログを審査する」を実行し直してください。');
  if (data.items[0].logFile === undefined) {
    throw new Error('審査結果が前の版のツールで作られています（メールアドレスが入っていません）。\nもう一度「3. フォルダのログを審査する」を実行してから送ってください。');
  }
  data.folder = folder;
  return data;
}

/**
 * 審査結果から送信リストを作り直して「LCR送信」シートに書く。
 * 戻り値: {rows, itemByName, stats}
 */
function syncLcrMailList_(data) {
  const sh = lcrMailSheet_();
  ensureLcrTemplates_();
  const senders = intakeSenderMap_(data.folder);
  const itemByName = {};
  const items = data.items.map(function (x) {
    itemByName[x.name] = x;
    // 開催部門のあるコンテストは、同じ局が開催部門ごとに1行（「種目」の列に開催部門名を添える）
    return { name: x.name, call: x.call, category: (x.category || '') + (x.section ? '（' + x.section + '）' : ''), email: x.email, sender: senders[x.logFile] || '' };
  });
  const n = sh.getLastRow() - 1;
  const old = n > 0 ? sh.getRange(2, 1, n, LCRMAIL_HEADER.length).getDisplayValues() : [];
  const rows = mergeLcrMailRows(items, old);
  if (n > 0) sh.getRange(2, 1, n, Math.max(LCRMAIL_HEADER.length, sh.getLastColumn())).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, LCRMAIL_HEADER.length).setNumberFormat('@').setValues(rows);
  const vr = sh.getMaxRows() - 1;
  if (vr > 0) {
    sh.getRange(2, LC['状態'] + 1, vr, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList([LCRMAIL_STATUS.PENDING, LCRMAIL_STATUS.SKIP, LCRMAIL_STATUS.SENT, LCRMAIL_STATUS.NOADDR, LCRMAIL_STATUS.PAPER, LCRMAIL_STATUS.FAILED], true)
      .setAllowInvalid(false)
      .setHelpText('未送信＝次に送る、送らない＝送らない、送信済み・送り先なし・メールアドレスなし（紙ログ）・送信できず＝ツールが入れる（送り直すときは「未送信」に戻す）').build());
  }
  return { rows: rows, itemByName: itemByName, stats: lcrMailStats_(rows) };
}

/**
 * 採用したログのファイル名 → 受付メールの送信元。
 * 受付処理が「提出ログ」直下に置いたファイルの説明欄（受付:メールID）から、「受付履歴」の送信元をたどる
 */
function intakeSenderMap_(folder) {
  const out = {};
  const sh = intakeSheet_(); // メールのファイルの受付履歴（96_gas_intake.js）
  if (sh.getLastRow() < 2) return out;
  const byKey = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, INTAKE_HEADER.length).getDisplayValues().forEach(function (r) {
    if (r[IC['メールID']]) byKey[r[IC['メールID']]] = r[IC['送信元']];
  });
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const d = String(f.getDescription() || '');
    if (d.indexOf('受付:') === 0 && byKey[d.substring(3)]) out[f.getName()] = byKey[d.substring(3)];
  }
  return out;
}

/** 「LCR送信」シート（メールのファイル） */
function lcrMailSheet_() {
  return bookSheet_(BOOK_MAIL, SHEET_LCRMAIL); // 91_gas_books.js
}

/** 「返信文面」シート（メールのファイル）に、LCRの件名・本文の行がなければ足す */
function ensureLcrTemplates_() {
  const rp = replySheet_(); // 96_gas_intake.js
  const have = rp.getLastRow() > 1 ? rp.getRange(2, 1, rp.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  REPLY_DEFAULTS.forEach(function (row) { if (have.indexOf(row[0]) < 0) rp.appendRow(row); });
}

function lcrMailStats_(rows) {
  const st = { total: rows.length, sent: 0, pending: 0, skip: 0, noaddr: 0, paper: 0, failed: 0 };
  rows.forEach(function (r) {
    const s = String(r[LC['状態']]);
    if (s.indexOf(LCRMAIL_STATUS.SENT) === 0) st.sent++;
    else if (s === LCRMAIL_STATUS.PENDING) st.pending++;
    else if (s === LCRMAIL_STATUS.SKIP) st.skip++;
    else if (s === LCRMAIL_STATUS.NOADDR) st.noaddr++;
    else if (s === LCRMAIL_STATUS.PAPER) st.paper++;
    else if (s === LCRMAIL_STATUS.FAILED) st.failed++;
  });
  return st;
}

function lcrMailStatsText_(st) {
  return '全 ' + st.total + ' 局：送信済み ' + st.sent + '、未送信 ' + st.pending + '、送らない ' + st.skip +
    '\n送り先なし ' + st.noaddr + '、送信できず ' + st.failed +
    (st.paper ? '\nメールアドレスなし（紙ログ） ' + st.paper + '（メールでは送りません。郵送などで送ってください）' : '');
}

function lcrMailResultText_(r) {
  if (r.busy) return 'ほかの処理（受付・LCR送信）が動いています。少し待ってから、もう一度実行してください。';
  if (r.error) return r.error;
  let s = 'LCRを ' + r.sent + ' 通送りました。' + (r.failed ? '（送信できず ' + r.failed + ' 通。「LCR送信」シートのメモを見てください）' : '');
  if (r.quotaOut) s += '\n今日の送信の上限に達したので、ここで止めました。';
  if (r.timeOut) s += '\n時間内に送りきれなかったので、ここで止めました。';
  return s + '\n\n' + lcrMailStatsText_(r.stats) +
    (r.stats.noaddr ? '\n\n※送り先なしの局は、「送り先の指定」にアドレスを入れると、次の送信で送ります。' : '') +
    (r.noReplyTo && (r.sent || r.stats.pending) ? '\n\n' + MAIL_NO_REPLY_TO_NOTE : '');
}
// ===== 98_gas_public_register.js =====
/**
 * 受付ページへの登録（GAS専用。Web担当）
 *
 * 受付ページ（別のスクリプト。src/public/）は、受付ページ専用のスプレッドシートの「登録」の表を見て、
 * 各年の審査用スプレッドシートを読む。新年度の準備で作った審査用スプレッドシートを、この表に足す。
 * 表のあるスプレッドシートのURLは、テンプレートの「基本設定」の「受付ページのスプレッドシート」に入れておく
 * （受付ページのメニュー「審査用スプレッドシートを登録する」でテンプレートのURLを入れると書かれる）。
 */

const PUBLIC_REGISTRY_LABEL = '受付ページのスプレッドシート'; // シートの整理 段階1で名前を付け替えた（設定担当。申し送り No.75）
const PUBLIC_REGISTRY_SHEET = '登録';
// 受付ページの 60_public_page.js の PUBLIC_REGISTRY_COLUMNS と同じにする
const PUBLIC_REGISTRY_HEADER = ['年', '開催回', 'コンテスト名', '審査用スプレッドシートのURL'];

/**
 * 審査用スプレッドシート ss を、受付ページの「登録」の表に足す（同じ年があれば書き換える）。
 * ss の「基本設定」の「受付ページのスプレッドシート」が空なら、何もしない。
 * 新年度の準備を止めないように、エラーにはしない。結果の文を返す（何もしなければ空）
 */
function registerPublicYear_(ss, year, num) {
  const sh = ss.getSheetByName(SHEET_BASIC);
  const v = sh ? sh.getDataRange().getDisplayValues() : [];
  const basic = {};
  for (let i = 1; i < v.length; i++) basic[String(v[i][0]).trim()] = String(v[i][1]).trim();
  const url = basic[PUBLIC_REGISTRY_LABEL] || '';
  if (!url) return '';
  try {
    const m = /[-\w]{25,}/.exec(url);
    if (!m) throw new Error('「基本設定」の「' + PUBLIC_REGISTRY_LABEL + '」のURLが読み取れません');
    const reg = SpreadsheetApp.openById(m[0]);
    let rs = reg.getSheetByName(PUBLIC_REGISTRY_SHEET);
    if (!rs) {
      rs = reg.insertSheet(PUBLIC_REGISTRY_SHEET);
      rs.getRange(1, 1, 1, PUBLIC_REGISTRY_HEADER.length).setValues([PUBLIC_REGISTRY_HEADER]).setFontWeight('bold');
      rs.setFrozenRows(1);
    }
    const row = [String(year), String(num || basic['開催回'] || '').replace(/^第|回$/g, ''), basic['コンテスト名'] || '', ss.getUrl()];
    const rv = rs.getDataRange().getDisplayValues();
    let at = rs.getLastRow() + 1;
    for (let i = rv.length - 1; i >= 1; i--) if (String(rv[i][0]).trim() === row[0]) { at = i + 1; break; }
    rs.getRange(at, 1, 1, row.length).setNumberFormat('@').setValues([row]);
    return '受付ページの「登録」に ' + year + ' 年を登録しました';
  } catch (err) {
    return '受付ページの「登録」に登録できませんでした（受付ページのメニューから登録してください）：' + (err && err.message || err);
  }
}
// ===== 99_gas_guidemail.js =====
/**
 * 前年の参加者への案内メール（GAS専用。メール送信担当）
 *
 * 新しい年のコンテストの数週間前に、前の年の参加者（受付履歴で採用のログがあり、メールアドレスが分かっている局）へ、
 * 案内のメールを1通ずつ送る。委員がメニューから送る（自動の時刻指定はしない）。全体の決まりは docs/指示書_案内メール.md
 *
 *   一覧を作る        : 「基本設定」の「前年の審査用スプレッドシート」の受付履歴から「案内メール」シートを作る。
 *                       もう一覧があるときは、送信済み・「送る／送らない」の選びを消さずに、足りない局だけ足す
 *   試しに自分に送る  : 1局目の中身で、実行している人のアドレスに1通だけ送る（状態は変えない）
 *   送る              : 「送る」で未送信の局に送る。1日の上限を超える分は残し、次に押すと続きから送る
 *
 * シート：「案内メール」はメールのファイル（91_gas_books.js の BOOK_MAIL）。前の年の受付履歴・案内メールも、前の年のメールのファイルから読む
 * 文面：「返信文面」シート（メールのファイル）の「案内メールの件名」「案内メールの本文」「結び」。差出人名は「基本設定」の「主催者」
 * 案内不要の連絡先は「問い合わせ先」（受付用のアドレスに返信されると、受付の処理が「受付不可」と自動で返信してしまうため）。
 * 「問い合わせ先」がメールアドレスなら、メールの返信先（Reply-To）にもする
 */

const SHEET_GUIDE = '案内メール';
const GUIDE_PREV_LABEL = '前年の審査用スプレッドシート';
const GUIDE_PUBLIC_URL_LABEL = '受付ページのURL'; // シートの整理 段階1で名前を付け替えた（設定担当。申し送り No.75）
const GUIDE_RESULT_URL_LABEL = '結果のページのURL'; // Web担当の RESULT_PAGE_URL_LABEL（60_public_page.js）と同じ名前。値は Web担当が書き込む（申し送り No.56・No.57）
const GUIDE_CONTACT_LABEL = '問い合わせ先';
const GUIDE_TIME_LIMIT_MS = 4.5 * 60 * 1000; // 6分の制限より前に切り上げる

const GUIDE_RECORD_URL_LABEL = 'レコードのページのURL'; // 値は Web担当が書き込む（シートの整理の追記2）

/**
 * LCR・案内メール・参加証のメールと参加証の見本に差し込める、「基本設定」のURLなど（差し込み口の名前 → 行の名前）。
 * {公開ページのURL} は {受付ページのURL} の前の名前（委員が書き換えた文面に残っていても動くように）。
 * 「基本設定」の行は「1. 初期設定」が作る（91_gas_books.js の BASIC_ROWS）。値は Web担当のメニューなどで入る
 */
const MAIL_LINK_LABELS = {
  '受付ページのURL': GUIDE_PUBLIC_URL_LABEL, '公開ページのURL': GUIDE_PUBLIC_URL_LABEL, '結果のページのURL': GUIDE_RESULT_URL_LABEL,
  'レコードのページのURL': GUIDE_RECORD_URL_LABEL, '委員会URL': COMMITTEE_URL_LABEL, '問い合わせ先': GUIDE_CONTACT_LABEL
};

/** 差し込み口の名前 → 「基本設定」の値 */
function mailLinkVars_() {
  const v = {};
  Object.keys(MAIL_LINK_LABELS).forEach(function (k) { v[k] = basicValue_(MAIL_LINK_LABELS[k]); });
  return v;
}

/**
 * LCR・案内メール・参加証で使う規約の設定（loadConfig_）。規約がまだ入っていない（「1. 初期設定」したばかりの空のテンプレート）なら、
 * 規約の直す所の一覧の代わりに、分かる言葉のエラーにする（審査・受付と同じ文。settingsTablesEmpty・SETTINGS_EMPTY_MESSAGE は 11_settings.js。申し送り No.181）
 */
function sendConfig_() {
  try {
    return loadConfig_();
  } catch (e) {
    let empty = false;
    try { empty = settingsTablesEmpty(readSettingsTables_(settingsSpreadsheet_())); } catch (e2) { /* 規約のファイルが開けないときは、もとのエラーを出す */ }
    if (!empty) throw e;
    throw new Error(SETTINGS_EMPTY_MESSAGE + '（「規約をテキストから読み込む」は管理用アカウントで実行します）');
  }
}

/**
 * LCR・案内メール・参加証のメールの返信先：「基本設定」の「問い合わせ先」がメールアドレスなら、そのアドレス。
 * メールアドレスでない・空なら ''（返信先を付けない。返信は送ったアカウント＝受付用の Gmail に届く）。申し送り No.177
 */
function mailReplyTo_() {
  return pickEmail(basicValue_(GUIDE_CONTACT_LABEL));
}

// 返信先を付けられないときに、送る前・送ったあとの画面に出す注意（返信が受付用の Gmail に届き、受付の処理が自動で返信してしまうため）
const MAIL_NO_REPLY_TO_NOTE = '※「基本設定」の「問い合わせ先」がメールアドレスでないので、返信先を付けられません。返信は受付用の Gmail に届きます。' +
  '受付の自動実行を止めてから送ってください（「メールでの受付」→「受付の自動実行を止める」）。';

/**
 * 文面で使っている URL などの差し込み口の値が空なら、送る前にエラーで止める（どの行に入れるかを知らせる）。
 *   what : 「LCRのメール」など。texts : 文面の並び。vars : 差し込みの値（MAIL_LINK_LABELS の名前だけを見る）
 */
function checkMailLinks_(what, texts, vars) {
  const links = {};
  Object.keys(MAIL_LINK_LABELS).forEach(function (k) { links[k] = vars[k]; });
  const empty = emptyTemplateVars(texts, links);
  if (empty.length) {
    throw new Error(what + 'で使っている次の値が空なので、止めました：' + empty.map(function (k) { return '{' + k + '}'; }).join(' ') + '\n' +
      empty.map(guideVarSource_).join('、') + 'に入れてください（文面から外すときは、メールのファイルの「返信文面」シートで直します）。');
  }
}

// 「返信文面」に足す行（委員が書き換えられる）
const GUIDE_TEMPLATE_ROWS = [
  ['案内メールの件名', '【{コンテスト名}】開催のご案内', '前年の参加者への案内メールの件名'],
  // 初めの本文は、ユーザーの文例（シートの整理の追記。2026-10-22）
  ['案内メールの本文', '{呼出符号} 局\n\n昨年はご参加いただき、ありがとうございました。\n今年も{コンテスト名}を、次のとおり開催します。\n\n' +
    '開催日時：{開催期間}\nログの締切：{受付締切}\n\n' +
    'ログは、電子ログ（JARL形式）をメールで送るか、次の受付ページのフォームで入力・アップロードして提出してください。\n{受付ページのURL}\n\n' +
    '皆様のご参加をお待ちしています。\n\n規約等は委員会公式ホームページまで\n{委員会URL}\n',
    '前年の参加者への案内メールの本文。最後に「結び」が付く。差し込めるのは {呼出符号} {コンテスト名} {開催回} {開催期間} {受付締切} {受付ページのURL} {結果のページのURL} {レコードのページのURL} {委員会URL} {問い合わせ先} {差出人名}']
];

// ------------------------------------------------------------------ メニューから
function menuGuideList() {
  const ui = SpreadsheetApp.getUi();
  // 「案内メール」シートはメールのファイル（共有者は見るだけ）なので、一覧を作るのも管理用アカウントだけ（シートの整理 G）
  try { requireMailAccount_('案内メールの一覧を作る'); } catch (e) { ui.alert(e.message); return; }
  const lock = LockService.getScriptLock(); // 受付・LCR送信と同じロック（送信の枠を取り合わないように）
  if (!lock.tryLock(10000)) { ui.alert('ほかの処理（受付・メール送信）が動いています。少し待ってから、もう一度実行してください。'); return; }
  try {
    setupGuide_();
    let prev, prevMail;
    try { prev = openPrevSpreadsheet_(); prevMail = openPrevMailBook_(prev); } catch (e) { ui.alert(e.message); return; }
    const stations = guideStationsFromIntake(readPrevIntake_(prevMail));
    const prevSkip = readGuideRows_(prevMail.getSheetByName(SHEET_GUIDE))
      .filter(function (r) { return String(r[GC['送る／送らない']]).trim() === GUIDE_SKIP; })
      .map(function (r) { return guideStationKey(r[GC['呼出符号']]); });
    const sh = guideSheet_();
    const m = mergeGuideRows(stations, readGuideRows_(sh), prevSkip);
    writeGuideRows_(sh, m.rows);
    logHistory_('案内メールの一覧を作りました（' + prev.getName() + ' から。足した局 ' + m.added + '）');
    ui.alert('メールのファイルの「' + SHEET_GUIDE + '」シートに一覧を作りました（' + prev.getName() + ' の受付履歴から。足した局 ' + m.added + '）。\n' +
      book_(BOOK_MAIL).getUrl() + '\n\n' +
      guideStatsText(guideStats(m.rows)) + '\n\n送り先を確かめてください。送らない局は「送る／送らない」を「送らない」にします。\n' +
      '文面は、メールのファイルの「返信文面」シートの「案内メールの件名」「案内メールの本文」で直せます。');
  } finally { lock.releaseLock(); }
}

function menuGuideTest() {
  const ui = SpreadsheetApp.getUi();
  try { requireMailAccount_('案内メールを試しに自分に送る'); } catch (e) { ui.alert(e.message); return; } // メールを扱うアカウントでなければ止める（96_gas_intake.js。申し送り No.65）
  const me = Session.getEffectiveUser().getEmail();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { ui.alert('ほかの処理（受付・メール送信）が動いています。少し待ってから、もう一度実行してください。'); return; }
  try {
    setupGuide_();
    const rows = readGuideRows_(guideSheet_());
    const row = rows.filter(isGuideTarget)[0] || rows[0];
    if (!row) { ui.alert('先に「案内メールの一覧を作る」を実行してください。'); return; }
    if (MailApp.getRemainingDailyQuota() < 1) { ui.alert('今日の送信の上限に達しています。明日、もう一度試してください。'); return; }
    let ctx;
    try { ctx = guideMailContext_(); } catch (e) { ui.alert(e.message); return; }
    const mail = buildGuideMail_(row, ctx);
    GmailApp.sendEmail(me, '【試し】' + mail.subject, '※試しの送信です。本来の送り先：' + (row[GC['送り先']] || '（なし）') + '\n\n' + mail.body, mail.options);
    logHistory_('案内メールを試しに送りました（' + row[GC['呼出符号']] + ' の分を ' + me + ' へ）');
    ui.alert(row[GC['呼出符号']] + ' 局あての案内メールを、試しに ' + me + ' へ送りました。受信したメールで見え方を確かめてください。\n' +
      '（「' + SHEET_GUIDE + '」シートの状態は変わりません）');
  } finally { lock.releaseLock(); }
}

function menuGuideSend() {
  const ui = SpreadsheetApp.getUi();
  try { requireMailAccount_('案内メールを送る'); } catch (e) { ui.alert(e.message); return; } // メールを扱うアカウントでなければ止める（96_gas_intake.js。申し送り No.65）
  const me = Session.getEffectiveUser().getEmail();
  const ok = ui.alert('案内メールを送る', 'このアカウント（' + me + '）から、「' + SHEET_GUIDE + '」シートの「送る」で未送信の局へ、案内メールを1通ずつ送ります。\n' +
    '1日の上限を超える分は残ります。そのときは、明日もう一度このメニューを押すと続きから送ります。\n\n' +
    '先に「試しに自分に送る」で文面を確かめましたか？送りますか？', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  ui.alert(guideResultText_(runGuideMail_()));
}

// ------------------------------------------------------------------ 送信の本体
/**
 * 「送る」で未送信の局に、1日の上限と時間の許す限り送る。
 * 戻り値: {busy, error, sent, failed, quotaOut, timeOut, stats}
 */
function runGuideMail_() {
  const res = { busy: false, error: '', sent: 0, failed: 0, quotaOut: false, timeOut: false, stats: null };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { res.busy = true; return res; }
  const t0 = Date.now();
  try {
  try { requireMailAccount_('案内メールを送る'); } catch (e) { res.error = e.message; return res; } // メールを扱うアカウントでなければ止める（96_gas_intake.js。申し送り No.65）
    setupGuide_();
    const sh = guideSheet_();
    const rows = readGuideRows_(sh);
    if (!rows.length) { res.error = '先に「案内メールの一覧を作る」を実行してください。'; return res; }
    let ctx;
    try { ctx = guideMailContext_(); } catch (e) { res.error = e.message; return res; }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!isGuideTarget(row)) continue;
      if (Date.now() - t0 > GUIDE_TIME_LIMIT_MS) { res.timeOut = true; break; }
      if (MailApp.getRemainingDailyQuota() < 1) { res.quotaOut = true; break; }
      try {
        const mail = buildGuideMail_(row, ctx);
        GmailApp.sendEmail(pickEmail(row[GC['送り先']]), mail.subject, mail.body, mail.options);
        row[GC['状態']] = GUIDE_STATUS.SENT + ' ' + msToJstSeconds(Date.now()).substring(0, 16);
        res.sent++;
      } catch (e) {
        row[GC['状態']] = GUIDE_STATUS.FAILED + '：' + (e && e.message ? e.message : e);
        res.failed++;
      }
      // 1局ずつシートに書く（途中で止まっても、送った局に二重に送らないように）
      sh.getRange(i + 2, GC['状態'] + 1).setNumberFormat('@').setValue(row[GC['状態']]);
    }
    res.stats = guideStats(rows);
    if (res.sent || res.failed) {
      logHistory_('案内メールを送りました：' + res.sent + ' 通' + (res.failed ? '（送信できず ' + res.failed + ' 通）' : '') +
        '、残りの未送信 ' + res.stats.pending + ' 局');
    }
    return res;
  } finally {
    lock.releaseLock();
  }
}

/** 文面と差し込みの値（送る前に1回だけ読む）。文面で使っている値が空なら、送る前に止める */
function guideMailContext_() {
  const cfg = sendConfig_();
  const tpl = readReplyTemplates_();
  GUIDE_TEMPLATE_ROWS.forEach(function (r) { if (!tpl[r[0]]) tpl[r[0]] = r[1]; });
  const title = contestTitle(cfg);
  const dl = intakeDeadlineText_(basicValue_('受付締切')); // 96_gas_intake.js
  const vars = {
    'コンテスト名': title,
    '開催回': String(basicValue_('開催回')).replace(/^第|回$/g, ''),
    // 開催部門のあるコンテストは「7MHz部門 2026/5/17 13:00～2026/5/17 16:00（時報まで）、ハイバンド部門 …」（30_lcr.js の lcrPeriodText）
    // 開催期間が空（「基本設定」の「開催期間1」が空）なら空にする（文面で使っていれば、送る前に止まる）
    '開催期間': !(cfg.periods || []).length ? '' : ((cfg.sections || []).length ? cfg.sections.map(function (x) { return x.name + ' ' + lcrPeriodText(x.periods, cfg.endExclusive); }).join('、')
      : lcrPeriodText(cfg.periods, cfg.endExclusive)) + '（JST）',
    '受付締切': dl ? lcrDate(dl) + '（JST）' : '',
    '差出人名': basicValue_(ORGANIZER_LABEL) || title
  };
  Object.assign(vars, mailLinkVars_()); // {受付ページのURL} {委員会URL} など
  const empty = emptyTemplateVars([tpl['案内メールの件名'], tpl['案内メールの本文'], tpl['結び']], vars);
  if (empty.length) {
    throw new Error('案内メールの文面で使っている次の値が空なので、送りませんでした：' + empty.map(function (k) { return '{' + k + '}'; }).join(' ') + '\n' +
      empty.map(guideVarSource_).join('、') + 'に入れてください（文面から外すときは、メールのファイルの「返信文面」シートで直します）。');
  }
  return { tpl: tpl, vars: vars, name: vars['差出人名'], replyTo: mailReplyTo_() };
}

/** 差し込みの値をどこに入れるか（エラーの案内に使う） */
function guideVarSource_(k) {
  if (k === '開催期間') return '「基本設定」の「開催期間1」';
  return '「基本設定」の「' + (MAIL_LINK_LABELS[k] || k) + '」';
}

/** 1局分のメール（件名・本文・送るときの指定（差出人名・返信先）） */
function buildGuideMail_(row, ctx) {
  const vars = Object.assign({ '呼出符号': row[GC['呼出符号']] }, ctx.vars);
  const options = { name: ctx.name };
  if (ctx.replyTo) options.replyTo = ctx.replyTo;
  return {
    subject: fillTemplate(ctx.tpl['案内メールの件名'], vars),
    body: fillTemplate(ctx.tpl['案内メールの本文'], vars) + fillTemplate(ctx.tpl['結び'], vars),
    options: options
  };
}

// ------------------------------------------------------------------ シート
/** 「返信文面」（メールのファイル）に案内メールの行がなければ足す（案内メールのメニューを使うたびに呼ぶ）。「基本設定」の行は「1. 初期設定」が作る */
function setupGuide_() {
  const rp = replySheet_(); // 96_gas_intake.js
  const have = rp.getLastRow() > 1 ? rp.getRange(2, 1, rp.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  GUIDE_TEMPLATE_ROWS.forEach(function (row) { if (have.indexOf(row[0]) < 0) rp.appendRow(row); });
}

/** 「案内メール」シート（メールのファイル） */
function guideSheet_() {
  return bookSheet_(BOOK_MAIL, SHEET_GUIDE); // 91_gas_books.js
}

/** 「基本設定」の「前年の審査用スプレッドシート」を開く */
function openPrevSpreadsheet_() {
  const url = basicValue_(GUIDE_PREV_LABEL);
  const m = /[-\w]{25,}/.exec(url);
  if (!m) throw new Error('「基本設定」の「' + GUIDE_PREV_LABEL + '」に、前の年の審査用スプレッドシートのURLを入れてください。');
  try { return SpreadsheetApp.openById(m[0]); } catch (e) {
    throw new Error('前の年の審査用スプレッドシートを開けません。「基本設定」の「' + GUIDE_PREV_LABEL + '」のURLと、ファイルを見る権限を確かめてください：' + url);
  }
}

/** 前の年の審査のファイルから、前の年のメールのファイル（受付履歴・案内メール）を開く */
function openPrevMailBook_(prev) {
  try { return bookFor_(prev, BOOK_MAIL); } catch (e) {
    throw new Error('前の年のメールのファイルを開けません（' + prev.getName() + '）。' + e.message);
  }
}

/** 前の年の「受付履歴」（前の年のメールのファイル）を読む。列は見出しの名前で探す */
function readPrevIntake_(prevMail) {
  const sh = prevMail.getSheetByName(SHEET_INTAKE);
  if (!sh || sh.getLastRow() < 2) throw new Error('前の年のメールのファイル（' + prevMail.getName() + '）に「' + SHEET_INTAKE + '」がないか、空です。');
  const v = sh.getDataRange().getDisplayValues();
  const h = v[0].map(function (x) { return String(x).trim(); });
  const col = { call: h.indexOf('呼出符号'), sender: h.indexOf('送信元'), adopted: h.indexOf('採用') };
  if (col.call < 0 || col.sender < 0 || col.adopted < 0) {
    throw new Error('前の年の「' + SHEET_INTAKE + '」に「呼出符号」「送信元」「採用」の列が見つかりません（' + prevMail.getName() + '）。');
  }
  return v.slice(1).map(function (r) {
    return { call: r[col.call], sender: r[col.sender], adopted: String(r[col.adopted]).trim() === '◯' };
  });
}

/** 「案内メール」シートの行（見出しを除く。表示どおりの文字列）。シートがなければ [] */
function readGuideRows_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, GUIDE_HEADER.length).getDisplayValues()
    .filter(function (r) { return String(r[GC['呼出符号']]).trim(); });
}

function writeGuideRows_(sh, rows) {
  const n = sh.getLastRow() - 1;
  if (n > 0) sh.getRange(2, 1, n, GUIDE_HEADER.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, GUIDE_HEADER.length).setNumberFormat('@').setValues(rows);
  const vr = sh.getMaxRows() - 1;
  if (vr > 0) {
    sh.getRange(2, GC['送る／送らない'] + 1, vr, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList([GUIDE_SEND, GUIDE_SKIP], true).setAllowInvalid(false)
      .setHelpText('送る＝案内メールを送る、送らない＝送らない（次の年も初めから「送らない」になる）').build());
  }
}

function guideResultText_(r) {
  if (r.busy) return 'ほかの処理（受付・メール送信）が動いています。少し待ってから、もう一度実行してください。';
  if (r.error) return r.error;
  let s = '案内メールを ' + r.sent + ' 通送りました。' + (r.failed ? '（送信できず ' + r.failed + ' 通。「' + SHEET_GUIDE + '」シートの状態を見てください）' : '');
  if (r.quotaOut) s += '\n今日の送信の上限に達したので、ここで止めました。明日、もう一度「案内メールを送る」を押すと続きから送ります。';
  if (r.timeOut) s += '\n時間内に送りきれなかったので、ここで止めました。もう一度「案内メールを送る」を押すと続きから送ります。';
  return s + '\n\n' + guideStatsText(r.stats) + (r.stats.pending ? '\n残り ' + r.stats.pending + ' 局です。' : '');
}
