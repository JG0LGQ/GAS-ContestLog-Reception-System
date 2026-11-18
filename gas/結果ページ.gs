// コンテストの結果のページ（GAS用・1ファイルにまとめたもの。審査ツール・受付ページとは別のスクリプト）
// 結果ページ専用のスプレッドシートのスクリプトに貼り付け、ウェブアプリとして公開する（受付局リストとは別のURL）
// 元のファイル: src/result/ フォルダ（受付ページの src/public/60_public_page.js も使う）。編集は src/ で行い、node tools/build_gas.js でこの1ファイルを作り直す

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

// ------------------------------------------------------------------ 交信ログの公開（指示書_交信ログの公開 の 4.。申し送り No.185）

const SETTINGS_LOG_PUBLICATION_LABEL = '交信ログの公開'; // 「基本設定」の「その年の情報」の行（91_gas_books.js の BASIC_ROWS）
// [表の言葉, 値]。'none'＝公開しない、'qso'＝交信だけ公開、'marks'＝審査の印も公開
const SETTINGS_LOG_PUBLICATION_CHOICES = [['公開しない', 'none'], ['交信だけ公開', 'qso'], ['審査の印も公開', 'marks']];

/** 「交信ログの公開」の文字を 'none'・'qso'・'marks' にする。空・知らない値は 'none'（公開しない）。全角・空白の違いは問わない */
function settingsLogPublicationOf(text) {
  const norm = function (v) { return toHankaku(settingsCellText(v)).replace(/\s+/g, ''); };
  const c = SETTINGS_LOG_PUBLICATION_CHOICES.filter(function (x) { return norm(x[0]) === norm(text); })[0];
  return c ? c[1] : 'none';
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
    try {
      setupSettingsSheet_(ss, name, tables[name], terms);
    } catch (e) { // どのシートで何が起きたかが分かる知らせにする（入力規則の説明の文だけが出ないように。申し送り No.192）
      throw new Error('規約のファイルの「' + name + '」シートを整えられませんでした（' + String(e && e.message || e).replace(/^Exception:\s*/, '') + '）。' +
        'シートの中身（とくに値の列）が、選べる値になっているかを確かめてから、もう一度「1. 初期設定」を実行してください');
    }
  });
}

/**
 * 規約のファイルの1枚のシートを整える（setupSettingsSheets_ から）。ないシートは作る。あるシートは、まず全部のマスのプルダウン（入力規則）を外してから、
 * 言葉の書き換え・足りない行や列の足し込みをし、最後にプルダウンを付け直す。
 * プルダウンが付いたままだと、前の呼び方の一覧（例：「個人・社団」）にない値（「シングルオペ」）を書けずに止まるため（申し送り No.192）
 */
function setupSettingsSheet_(ss, name, rows, terms) {
  let sh = ss.getSheetByName(name);
  if (sh) {
    settingsClearAllValidations_(sh);
    migrateSettingsWords_(sh, name, terms); // もう一つの呼び方の言葉を、選んだ呼び方の言葉にする。足りない行を足す前に行う
  }
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
}

/** シートの全部のマス（中身のない所も）のプルダウン（入力規則）を外す */
function settingsClearAllValidations_(sh) {
  bookTry_(function () { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations(); });
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
    settingsClearAllValidations_(sh); // 中身のない所に残ったプルダウンにも当たらないように（No.192）
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

/**
 * 審査のファイル ss の「基本設定」の「交信ログの公開」（指示書_交信ログの公開 の 4.）。'none'＝公開しない、'qso'＝交信だけ公開、
 * 'marks'＝審査の印も公開。行がない・空・知らない値は 'none'。Webページからも、ほかの年の審査のファイルを渡して使える
 */
function settingsLogPublicationFor_(ss) {
  return settingsLogPublicationOf(settingsBasicValue_(ss, SETTINGS_LOG_PUBLICATION_LABEL));
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
// 「基本設定」の「交信ログの公開」が「公開しない」でないときに、受付ページに出す知らせ（指示書_交信ログの公開 の 6.2。申し送り No.187）
const PUBLIC_LOG_NOTICE = 'このコンテストでは、結果の確定後、提出された交信ログ（交信の部分だけ。名前・住所などは出しません）を結果ページで公開します。';
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
  if (d.logPublic) H.push('<div class="note">' + publicEscape(PUBLIC_LOG_NOTICE) + '</div>'); // 交信ログの公開（No.187）
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
// ===== 70_result_page.js =====
/**
 * 結果のページの中身（GASとNodeの両方で動く部分。Web担当。申し送り No.48）
 *
 * 審査用スプレッドシートの「確定結果」シート（審査担当がメニュー「審査結果を確定する」で作る）を読んで、結果のページに出す。
 * 結果のページは、受付ページとは別のスクリプト・別のURL（71_gas_result_page.js。2026-10-21 ユーザーが決めた）。
 * 「確定結果」シートの形（受け渡しの決まり。docs/指示書_結果の公開ページ.md の「2.」）
 *   1行目：「確定日時」と、その日時（JST、yyyy-MM-dd HH:mm）。空なら確定していない（「審査中です」と出す）
 *   2行目から：A列「行の種類」（見出し・列名・局・クラブ など）、B列「表彰の種類」（空・順位・賞）、C列「賞の名前」、
 *              D列から「審査結果」の表と同じ列
 * 出さない列は、列名で決める（PUBLIC_RESULT_HIDDEN）。表彰は文字で出さず、行の色付けと色の見方の注釈だけにする。
 */

const PUBLIC_SRC_RESULT = '確定結果';
// 出さない列（列名がこれと同じか、これに「（」が続くもの。例：「参加局（審査後総得点）」「NIL（参考）」）
// 差・無得点の交信・NIL・種目、登録クラブ対抗の参加局数は、2026-10-21 ユーザーの希望で出さないことにした
const PUBLIC_RESULT_HIDDEN = ['要確認', '参加局', '参加局数', '表彰', '差', '無得点の交信', 'NIL', '種目'];
// 見出しにこの語がある表だけで出さない列（電信部門の申告総得点は、電信だけの得点ではないため。2026-10-21 ユーザーの希望）
const PUBLIC_RESULT_HIDDEN_IN = [{ title: '電信部門', columns: ['申告総得点'] }];
const PUBLIC_RESULT_COLORS = { rank: '#fff2cc', prize: '#d9ead3' }; // 順位による表彰・名前の付いた賞の行の色
// 「■ チェックログ」の表（申し送り No.130・No.131）：審査担当が右の端に足した2列の名前
const PUBLIC_CHECKLOG_CHANGE_COL = '局の一覧の種目の変更';
const PUBLIC_CHECKLOG_REASON_COL = '公開する理由';

// 交信ログの公開（指示書_交信ログの公開 の 6.1。申し送り No.187）。審査担当が確定のときに作る「公開ログ」シート（No.186・No.190）を読む
const PUBLIC_LOG_SHEET = '公開ログ';
// 出す列（「公開ログ」の見出しの名前）。審査の印と得点は「審査の印も公開」のときだけ（「交信だけ公開」ではサーバーからも送らない）
const PUBLIC_LOG_QSO_COLS = ['日時', 'バンド', 'モード', '相手局', '送ったRST', '送ったナンバー', '受けたRST', '受けたナンバー'];
const PUBLIC_LOG_MARK_COLS = ['審査の印', '得点'];
// 参加者に見せるときの列の名前（「公開ログ」の列「審査の印」は、結果ページでは「減点理由」と出す。2026-11-18 ユーザーが決めた）
const PUBLIC_LOG_COL_LABELS = { '審査の印': '減点理由' };
// 審査の印の説明（印の頭の言葉で探す。審査担当の 30_lcr.js の PUBLIC_LOG_MARKS と同じ言葉）
const PUBLIC_LOG_MARK_HELP = [
  ['重複', '同じ局との2回目からの交信です（得点になりません）'],
  ['呼出符号の誤り', '相手局の呼出符号の書き違いです（正しい呼出符号を「正：」の後ろに出しています。得点になりません）'],
  ['無効な呼出符号', '呼出符号として正しくない、またはこのコンテストの相手にならない局です（得点になりません）'],
  ['ナンバーの誤り', '受けたナンバーが、相手局の送ったナンバーと合わないか、ないナンバーです（得点になりません）'],
  ['バンドの記載の誤り', '相手局のログとバンドが合いません（得点になりません）'],
  ['参加種目外', '参加種目の対象でないバンドやモードの交信です（得点になりません）'],
  ['対象外のバンド', 'このコンテストの対象でないバンドの交信です（得点になりません）'],
  ['時間外', '開催期間の外の交信です（得点になりません）'],
  ['10分間ルール違反', '10分間ルールに合わない交信です（得点になりません）'],
  ['相手局のログになし', '相手局のログに、この交信が見つかりません（得点にはなります）'],
  ['チェックログ', 'チェックログの局の交信です（順位には入りません）']
];

/**
 * 「公開ログ」シートの中身（2次元の配列。1行目は見出し）から、その局（呼出符号と開催部門）の交信を取り出す。列は見出しの名前で探す。
 * withMarks が false なら、審査の印と得点は取り出さない（「交信だけ公開」。サーバーから送らない）。
 * 戻り値 {head:[列名], rows:[[…]]}。シートの形が違う（列がない）ときは null
 */
function publicLogRows(values, call, section, withMarks) {
  const head = ((values || [])[0] || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  const cols = PUBLIC_LOG_QSO_COLS.concat(withMarks ? PUBLIC_LOG_MARK_COLS : []);
  const ci = head.indexOf('呼出符号'), si = head.indexOf('開催部門');
  const idx = cols.map(function (c) { return head.indexOf(c); });
  if (ci < 0 || idx.some(function (i) { return i < 0; })) return null;
  const t = function (v) { return String(v == null ? '' : v).trim(); };
  const rows = (values || []).slice(1).filter(function (r) {
    return t(r[ci]) === String(call || '').trim() && (si < 0 ? '' : t(r[si])) === String(section || '').trim();
  }).map(function (r) { return idx.map(function (i) { return t(r[i]); }); });
  return { head: cols, rows: rows };
}

/** 「公開ログ」シートで、交信ログのある局の一覧（{'呼出符号|開催部門': true}）。シートの形が違う・行がなければ null（リンクを付けない） */
function publicLogKeys(values) {
  const head = ((values || [])[0] || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  const ci = head.indexOf('呼出符号'), si = head.indexOf('開催部門');
  if (ci < 0 || (values || []).length < 2) return null;
  const keys = {};
  values.slice(1).forEach(function (r) {
    const c = String(r[ci] == null ? '' : r[ci]).trim();
    if (c) keys[c + '|' + (si < 0 ? '' : String(r[si] == null ? '' : r[si]).trim())] = true;
  });
  return keys;
}

/**
 * 1局の交信ログ（結果のページの中で、結果の表のかわりに出す）。d: {title（コンテスト）, year, call, section, log（publicLogRows）, withMarks}
 * 上に呼出符号・開催部門・交信数、下に交信の表。審査の印も公開なら、表に出てくる印の説明を表の下に出す
 */
function buildPublicLogHtml(d) {
  const e = publicEscape;
  const H = ['<div class="page logview">', '<p><button type="button" class="logback" data-logback="1">← 結果に戻る</button></p>'];
  H.push('<h1>' + e(d.call) + ' の交信ログ</h1>');
  H.push('<div class="meta">' + e(publicResultTitle(d.title)) + (d.section ? '　' + e(d.section) : '') + '　交信数：' + d.log.rows.length + '</div>');
  if (!d.log.rows.length) {
    H.push('<p class="none">交信の行がありません。</p>');
  } else {
    H.push('<div class="scroll"><table><thead><tr>' + d.log.head.map(function (h) { return '<th>' + e(PUBLIC_LOG_COL_LABELS[h] || h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      d.log.rows.map(function (r) {
        const bad = d.withMarks && r[d.log.head.indexOf('審査の印')] && r[d.log.head.indexOf('審査の印')] !== '相手局のログになし';
        return '<tr' + (bad ? ' class="logbad"' : '') + '>' + r.map(function (c) { return '<td>' + e(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>');
    if (d.withMarks) {
      const mi = d.log.head.indexOf('審査の印');
      const used = PUBLIC_LOG_MARK_HELP.filter(function (m) { return d.log.rows.some(function (r) { return String(r[mi]).indexOf(m[0]) === 0; }); });
      H.push('<div class="loghelp"><b>' + e(PUBLIC_LOG_COL_LABELS['審査の印']) + '</b>：空なら得点になった交信です。' + (used.length ? '<ul>' + used.map(function (m) {
        return '<li><b>' + e(m[0]) + '</b>：' + e(m[1]) + '</li>';
      }).join('') + '</ul>' : '') + '</div>');
    }
  }
  H.push('<p><button type="button" class="logback" data-logback="1">← 結果に戻る</button></p></div>');
  return publicStyle_() + publicResultStyle_() + H.join('\n');
}

/** 「確定結果」の1行目から確定日時を読む（確定していなければ空） */
function publicResultConfirmedAt(values) {
  const r = (values || [])[0] || [];
  return String(r[0] || '').trim() === '確定日時' ? String(r[1] == null ? '' : r[1]).trim() : '';
}

/** 出さない列か（title：その表の見出し） */
function publicResultHidden(name, title) {
  const n = String(name || '').trim();
  const match = function (h) { return n === h || n.indexOf(h + '（') === 0 || n.indexOf(h + '(') === 0; };
  if (PUBLIC_RESULT_HIDDEN.some(match)) return true;
  return PUBLIC_RESULT_HIDDEN_IN.some(function (x) { return String(title || '').indexOf(x.title) >= 0 && x.columns.some(match); });
}

/**
 * 「確定結果」シート（2次元の配列）を、表のまとまりに分ける
 * 戻り値: {confirmedAt, sections:[{title, head:[列名], rows:[{cells:[…], award:'rank'|'prize'|'', note:文}]}], prizeNames:[賞の名前]}
 *   head・cells は、出す列だけ。note は「参加なし」のような1つだけの文の行
 * 「■ チェックログ」の表は、局の一覧の「種目の変更」が CHECKLOG の局（委員会がチェックログにした局）だけを、
 * 「番号・呼出符号・理由」（理由は局の一覧の「公開する理由」の文だけ。空なら空）で出す（申し送り No.130。2026-10-28 ユーザーが決めた）。
 * サマリーに「チェックログ」と書いた局・一部チェックログの局は出さない。番号は出した局で1から付け直し、見出しの局数も出した数にする
 * 開催部門のあるコンテスト（新潟など）：確定結果の、中に表のない見出しの行（「■ 7MHz部門」）を開催部門の区切りにして、
 * groups:[{name（開催部門名）, sections:[…]}] も返す（申し送り No.148 の 2b・No.151）。最後の登録クラブ対抗と「開催部門の分からない局」は、
 * 開催部門をまたぐ表としてまとめ、最後の group にする（common: true）。開催部門のないコンテストは groups を返さない（今までどおり）
 */
function parsePublicResult(values) {
  const out = { confirmedAt: publicResultConfirmedAt(values), sections: [], prizeNames: [] };
  if (!out.confirmedAt) return out;
  let sec = null, cols = null;
  const text = function (v) { return String(v == null ? '' : v).trim(); };
  const newSection = function (title) { sec = { title: title, head: [], rows: [] }; cols = null; out.sections.push(sec); return sec; };
  let ck = null; // 「■ チェックログ」の表の列の場所（{no, call, change, reason}）
  (values || []).slice(1).forEach(function (r) {
    const kind = text(r[0]), award = text(r[1]), prize = text(r[2]);
    const cells = (r || []).slice(3).map(text);
    const filled = cells.filter(function (c) { return c !== ''; });
    if (kind === '見出し') { newSection(filled[0] || ''); ck = null; sec.checklog = /^■\s*チェックログ/.test(filled[0] || ''); return; }
    if (!filled.length) return; // 空の行
    if (!sec) newSection('');
    if (kind === '列名' && sec.checklog) {
      ck = { no: cells.indexOf('番号'), call: cells.indexOf('呼出符号'), change: cells.indexOf(PUBLIC_CHECKLOG_CHANGE_COL),
        reason: cells.indexOf(PUBLIC_CHECKLOG_REASON_COL), old: cells.indexOf('チェックログとした理由') };
      sec.head = ['番号', '呼出符号', '理由'];
      cols = [];
      return;
    }
    if (ck && (kind === '局' || kind === 'クラブ')) {
      let reason = null;
      if (ck.change >= 0) { if (cells[ck.change] === 'CHECKLOG') reason = ck.reason >= 0 ? cells[ck.reason] || '' : ''; }
      else if (ck.old >= 0 && /^委員会の判断/.test(cells[ck.old] || '')) {
        // 2列を足す前（2026-10-28 より前）に確定した結果：「委員会の判断：（公開する理由）」から理由の文を取り出す
        reason = String(cells[ck.old]).replace(/^委員会の判断[：:]?/, '').trim();
      }
      if (reason == null) return; // 委員会がチェックログにした局でなければ出さない
      sec.rows.push({ cells: [String(sec.rows.filter(function (x) { return !x.note; }).length + 1), ck.call >= 0 ? cells[ck.call] : '', reason], award: '', note: '' });
      return;
    }
    if (kind === '列名') {
      cols = [];
      cells.forEach(function (c, i) { if (c !== '' && !publicResultHidden(c, sec.title)) cols.push(i); });
      sec.head = cols.map(function (i) { return cells[i]; });
      return;
    }
    const row = { cells: [], award: award === '順位' ? 'rank' : award === '賞' ? 'prize' : '', note: '' };
    if (!cols || (filled.length === 1 && kind !== '局' && kind !== 'クラブ')) row.note = filled.join(' ');
    else row.cells = cols.map(function (i) { return cells[i] == null ? '' : cells[i]; });
    if (row.award === 'prize' && prize && out.prizeNames.indexOf(prize) < 0) out.prizeNames.push(prize);
    sec.rows.push(row);
  });
  out.sections.forEach(function (s) {
    if (!s.checklog) return;
    const n = s.rows.filter(function (x) { return !x.note; }).length;
    s.title = s.title.replace(/（\d+局）\s*$/, '（' + n + '局）');
    if (!n) { s.head = []; s.rows = [{ cells: [], award: '', note: 'なし' }]; }
    delete s.checklog;
  });
  publicResultGroups_(out);
  return out;
}

/** 開催部門ごとのまとまりを作る（parsePublicResult から呼ぶ）。中に表のない見出し（列名の行も、ほかの行もない）を開催部門の区切りにする */
function publicResultGroups_(out) {
  const isDivider = function (s) { return s.title && !s.head.length && !s.rows.length; };
  if (!out.sections.some(isDivider)) return;
  const isCommon = function (s) {
    return s.head.indexOf('登録番号') >= 0 || /（\d+クラブ/.test(s.title) || /^■\s*開催部門の分からない局/.test(s.title);
  };
  const groups = [];
  let g = null, common = null;
  out.sections.forEach(function (s) {
    if (isDivider(s)) { if (!common) { g = { name: s.title.replace(/^■\s*/, ''), sections: [] }; groups.push(g); } return; }
    if (common || isCommon(s)) { // 登録クラブ対抗から後は、開催部門をまたぐ表
      if (!common) common = { name: '', sections: [], common: true };
      common.sections.push(s);
      return;
    }
    if (!g) { g = { name: '', sections: [] }; groups.push(g); }
    g.sections.push(s);
  });
  if (common) {
    const club = common.sections.some(function (s) { return !/^■\s*開催部門の分からない局/.test(s.title); });
    const unknown = common.sections.some(function (s) { return /^■\s*開催部門の分からない局/.test(s.title); });
    common.name = club ? '登録クラブ対抗' + (unknown ? 'ほか' : '') : '開催部門の分からない局';
    groups.push(common);
  }
  out.sections = out.sections.filter(function (s) { return !isDivider(s); });
  out.groups = groups;
}

/** 結果のページのタイトル（「審査結果」ではなく「結果」。2026-10-21 ユーザーの希望） */
function publicResultTitle(title) {
  return (title ? title + ' ' : '') + '結果';
}

/**
 * 結果のページ（<body> の中身）を作る
 * d: {years, year, title, result（parsePublicResult の戻り値）, organizer, logKeys（交信ログのある局。publicLogKeys。null ならリンクを付けない）}。baseUrl: 結果のページのURL（年のリンクに使う）
 */
function buildPublicResultHtml(d, baseUrl) {
  const e = publicEscape, res = d.result;
  const H = [publicStyle_() + publicResultStyle_()];
  H.push(publicYearLinks_(d.years, d.year, baseUrl));
  H.push('<h1>' + e(publicResultTitle(d.title)) + '</h1>');
  if (!res.confirmedAt) {
    H.push('<div class="note">審査中です。結果が決まったら、このページでお知らせします。</div>');
  } else {
    H.push('<div class="meta">確定日時：' + e(res.confirmedAt) + '</div>');
    H.push('<div class="legend"><span class="sw" style="background:' + PUBLIC_RESULT_COLORS.rank + '"></span>色の行：入賞' +
      (res.prizeNames.length ? '　<span class="sw" style="background:' + PUBLIC_RESULT_COLORS.prize + '"></span>色の行：' + e(res.prizeNames.join('・')) : '') + '</div>');
    const idOf = function (s) { return 'r' + res.sections.indexOf(s); }; // 目次のリンクの行き先（ページ全体で1つずつ）
    const toc = function (list) {
      if (list.filter(function (s) { return s.title; }).length < 2) return '';
      return '<details class="toc"><summary>目次</summary><ul>' + list.map(function (s) {
        return s.title ? '<li><a href="#' + idOf(s) + '">' + e(s.title) + '</a></li>' : '';
      }).join('') + '</ul></details>';
    };
    // 交信ログの公開（「公開しない」でなく、「公開ログ」シートにその局の行があるとき）：呼出符号をリンクにする（No.187）
    const logCell = function (s, c, j, section) {
      if (!d.logKeys || s.head[j] !== '呼出符号' || !d.logKeys[c + '|' + (section || '')]) return '<td>' + e(c) + '</td>';
      return '<td><a class="loglink" role="button" tabindex="0" data-logyear="' + e(d.year) + '" data-logcall="' + e(c) + '" data-logsec="' + e(section || '') + '">' + e(c) + '</a></td>';
    };
    const tables = function (list, section) {
      list.forEach(function (s) {
        if (s.title) H.push('<h2 id="' + idOf(s) + '">' + e(s.title) + '</h2>');
        const data = s.rows.filter(function (r) { return !r.note; });
        if (data.length && s.head.length) {
          H.push('<div class="scroll"><table><thead><tr>' + s.head.map(function (h) { return '<th>' + e(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
            s.rows.map(function (r) {
              if (r.note) return '<tr><td colspan="' + s.head.length + '">' + e(r.note) + '</td></tr>';
              return '<tr' + (r.award ? ' class="aw-' + r.award + '"' : '') + '>' + r.cells.map(function (c, j) { return logCell(s, c, j, section); }).join('') + '</tr>';
            }).join('') + '</tbody></table></div>');
        } else {
          s.rows.forEach(function (r) { H.push('<p class="none">' + e(r.note || r.cells.join(' ')) + '</p>'); });
        }
      });
    };
    if (res.groups) {
      // 開催部門のあるコンテスト：上のボタンで開催部門を切り替える（ページは移らない。目次も開催部門ごと。申し送り No.148 の 2b）
      H.push('<div class="rtabs">' + res.groups.map(function (g, i) {
        return '<button type="button" data-rtab="' + i + '"' + (i ? '' : ' class="on"') + '>' + e(g.name || '（開催部門なし）') + '</button>';
      }).join('') + '</div>');
      res.groups.forEach(function (g, i) {
        H.push('<div class="rpanel" data-rpanel="' + i + '"' + (i ? ' hidden' : '') + '>');
        H.push('<div class="rsec">' + e(g.name) + (g.common ? '<span class="hint">（開催部門をまたぐ表）</span>' : '') + '</div>');
        H.push(toc(g.sections));
        tables(g.sections, g.common ? '' : g.name);
        H.push('</div>');
      });
    } else {
      H.push(toc(res.sections));
      tables(res.sections);
    }
  }
  if (d.organizer) H.push('<div class="foot">' + e(d.organizer) + '</div>');
  return '<div class="page">' + H.join('\n') + '</div>';
}

function publicResultStyle_() {
  return '<style>' +
    '.rtabs{display:flex;flex-wrap:wrap;gap:4px;margin:12px 0 0;border-bottom:2px solid #1d4f91}' +
    '.rtabs button{padding:8px 14px;font-size:14px;border:1px solid #c5d3e8;border-bottom:0;border-radius:6px 6px 0 0;background:#f4f7fb;color:#1d4f91;cursor:pointer;margin:0}' +
    '.rtabs button.on{background:#1d4f91;color:#fff;font-weight:bold;border-color:#1d4f91}.rpanel[hidden]{display:none}' +
    'a.loglink{color:#1d4f91;text-decoration:underline;cursor:pointer}' +
    'button.logback{padding:6px 14px;font-size:14px;border:1px solid #1d4f91;border-radius:4px;background:#fff;color:#1d4f91;cursor:pointer}' +
    'tr.logbad td{color:#999}.loghelp{font-size:13px;margin:10px 0;line-height:1.6}.loghelp ul{margin:4px 0;padding-left:20px}' +
    '.rsec{font-size:18px;font-weight:bold;margin:12px 0 4px}.rsec .hint{font-size:12px;font-weight:normal;color:#666;margin-left:6px}' +
    '@media (max-width:600px){.rtabs button{flex:1 1 30%;padding:8px 4px;font-size:13px}}' +
    'h2{font-size:16px;margin:18px 0 6px;padding:4px 8px;background:#dde7f3;border-radius:4px;line-height:1.4}' +
    '.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}' +
    '.scroll table{font-size:14px}.scroll td,.scroll th{padding:5px 7px}' +
    'tr.aw-rank td{background:' + PUBLIC_RESULT_COLORS.rank + '}tr.aw-prize td{background:' + PUBLIC_RESULT_COLORS.prize + '}' +
    '.legend{font-size:13px;margin:8px 0}.sw{display:inline-block;width:14px;height:14px;border:1px solid #bbb;vertical-align:-2px;margin-right:4px}' +
    '.toc{font-size:14px;margin:8px 0}.toc ul{margin:6px 0;padding-left:20px;line-height:1.7}.toc a{color:#1d4f91}' +
    '.none{font-size:14px;color:#666;margin:4px 8px}' +
    '</style>';
}
// ===== 71_gas_result_page.js =====
/**
 * コンテストの結果のページ（GAS専用。Web担当）
 *
 * 結果ページ専用のスプレッドシート（「結果ページ」）のスクリプト。受付ページとは別に、ウェブアプリとして一度だけ公開する
 * （受付局リストとは別のURL。2026-10-21 ユーザーが決めた）。プログラムを直したときは「デプロイを管理」で新しいバージョンにする。
 *
 *   結果ページのスプレッドシート
 *     設定  ← 「受付ページのスプレッドシート」の行に、受付ページのスプレッドシートのURL
 *
 * メニュー「1. 受付ページの登録表をつなぐ」で、この結果のページのURLを、各年の審査用スプレッドシートとテンプレートの
 * 「基本設定」の「結果のページのURL」に書く（案内メールで使う。申し送り No.56。resultWriteUrls_）。
 *
 * 年の一覧は、受付ページのスプレッドシートの「登録」の表を読む（登録の表は1つだけ。新年度の準備で自動で足される）。
 * ページを開くと（doGet）、年を選び（?year=2027。指定がなければ、確定しているうちでいちばん新しい年）、その年の審査用スプレッドシートの
 * 「確定結果」シートを読んで出す（中身は 70_result_page.js）。確定していなければ「審査中です」。読んだ結果は5分だけ覚えておく。
 * メニューは、このスプレッドシートの持ち主（管理用アカウント）だけが使える（シートの整理の追加 3.。publicOwnerOnly_）。
 */

const RESULT_SHEET_SETTINGS = '設定';
const RESULT_PUBLIC_LABEL = PUBLIC_BOOK_LABEL; // 前の名前「公開ページのスプレッドシート」の行は、自動で付け替える（resultSettingsSheet_）
const RESULT_CACHE_SECONDS = 300;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('結果ページ')
    .addItem('1. 受付ページの登録表をつなぐ（URLを入れる・結果のページのURLを書き込む）', 'menuResultConnect')
    .addItem('表示を確かめる（開いたときに出る年）', 'menuResultPreview')
    .addItem('すぐに新しい内容にする（覚えた表示を消す）', 'menuResultClearCache')
    .addItem('埋め込み用のHTMLを出す', 'menuResultEmbed')
    .addToUi();
}

/** ウェブアプリとして開かれたとき */
function doGet(e) {
  const p = resultPage_(e && e.parameter ? e.parameter.year : '');
  // ほかのページ（委員会のホームページなど）に枠（iframe）で埋め込めるようにする（警告の帯を出さないため。申し送り No.97・No.123）。
  // 「年ごとの記録」のリンクは、ページを移らずに中身を入れ替える（resultYearWrap_）
  return HtmlService.createHtmlOutput(resultYearWrap_(p.html)).setTitle(p.title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * ページの中身を入れ物（id="result-root"）に入れ、「年ごとの記録」のリンクの動きを付ける。
 * リンクを押すと、ページを移らずに、その年の結果（resultYearHtml）に入れ替える（埋め込んだ枠の外に出ない。2026-10-28 ユーザーの希望）
 */
function resultYearWrap_(html) {
  return '<div id="result-root">' + html + '</div><script>(' + resultYearClient_.toString() + ')();</script>';
}

/** 「年ごとの記録」のリンクの動き（ブラウザで動く。サーバーは google.script.run で resultYearHtml を呼ぶ） */
function resultYearClient_() {
  var root = document.getElementById('result-root');
  function go(y) {
    if (!window.google || !google.script) return;
    var bar = root.querySelector('.years');
    if (bar && !bar.querySelector('.loading')) bar.insertAdjacentHTML('beforeend', '<span class="loading">（' + y + ' 年を読み込んでいます…）</span>');
    google.script.run.withSuccessHandler(function (r) {
      root.innerHTML = r.html; document.title = r.title; window.scrollTo(0, 0);
    }).withFailureHandler(function () {
      var l = root.querySelector('.loading'); if (l) l.textContent = '（読み込めませんでした。しばらくしてから、もう一度お試しください）';
    }).resultYearHtml(y);
  }
  // 交信ログ（No.187）：呼出符号を押すと、結果の表を隠して、その局の交信ログを同じページの中に出す。「結果に戻る」で元の位置に戻る
  var backY = 0;
  function showLog(el) {
    if (!window.google || !google.script) return;
    var page = root.querySelector('.page');
    backY = window.scrollY || 0;
    var v = root.querySelector('#logview') || document.createElement('div');
    v.id = 'logview'; v.innerHTML = '<div class="page"><p>（' + el.textContent + ' の交信ログを読み込んでいます…）</p></div>';
    if (!v.parentNode) root.insertBefore(v, root.firstChild);
    if (page) page.hidden = true;
    window.scrollTo(0, 0);
    google.script.run.withSuccessHandler(function (r) { v.innerHTML = r.html; })
      .withFailureHandler(function () { v.innerHTML = '<div class="page"><p>読み込めませんでした。しばらくしてから、もう一度お試しください。</p><p><button type="button" class="logback" data-logback="1">← 結果に戻る</button></p></div>'; })
      .resultLogHtml({ year: el.getAttribute('data-logyear'), call: el.getAttribute('data-logcall'), section: el.getAttribute('data-logsec') });
  }
  function hideLog() {
    var v = root.querySelector('#logview'), page = root.querySelector('.page[hidden]');
    if (v) v.parentNode.removeChild(v);
    if (page) page.hidden = false;
    window.scrollTo(0, backY);
  }
  root.addEventListener('click', function (ev) {
    var lk = ev.target && ev.target.closest ? ev.target.closest('[data-logcall]') : null;
    if (lk) { ev.preventDefault(); showLog(lk); return; }
    if (ev.target && ev.target.closest && ev.target.closest('[data-logback]')) { hideLog(); return; }
    // 開催部門の切り替えのボタン（新潟など。70_result_page.js の buildPublicResultHtml）。ページは移らない
    var tb = ev.target && ev.target.closest ? ev.target.closest('[data-rtab]') : null;
    if (tb) {
      var n = tb.getAttribute('data-rtab');
      Array.prototype.forEach.call(root.querySelectorAll('[data-rpanel]'), function (p) { p.hidden = p.getAttribute('data-rpanel') !== n; });
      Array.prototype.forEach.call(root.querySelectorAll('[data-rtab]'), function (b) { b.className = b === tb ? 'on' : ''; });
      return;
    }
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-year]') : null;
    if (!el) return;
    ev.preventDefault();
    go(el.getAttribute('data-year'));
  });
  root.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target && ev.target.getAttribute && (ev.target.getAttribute('data-year') || ev.target.getAttribute('data-logcall'))) ev.target.click();
  });
}

/** ページから呼ぶ：ある年の結果（ページの中身とタイトル）。見るだけのもので、どの年も出してよい */
function resultYearHtml(year) {
  const p = resultPage_(String(year || '').replace(/[^0-9]/g, '').substring(0, 4));
  return { html: p.html, title: p.title };
}

function resultServiceUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (err) { return ''; }
}

function resultFileId_(url) {
  const m = /[-\w]{25,}/.exec(String(url || ''));
  if (!m) throw new Error('スプレッドシートのURLが読み取れません：' + url);
  return m[0];
}

/** 「設定」シート（なければ作る） */
function resultSettingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(RESULT_SHEET_SETTINGS);
  if (!sh) {
    sh = ss.insertSheet(RESULT_SHEET_SETTINGS);
    sh.getRange(1, 1, 2, 3).setValues([['項目', '値', '説明'],
      [RESULT_PUBLIC_LABEL, '', '受付ページのスプレッドシート（「登録」の表があるもの）のURL。年の一覧をここから読む']]);
    sh.getRange(1, 1, 1, 3).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  publicRenameRow(sh, PUBLIC_BOOK_LABEL_OLD, RESULT_PUBLIC_LABEL); // シートの整理：「公開ページ」→「受付ページ」
  return sh;
}

/** 年の一覧（受付ページのスプレッドシートの「登録」の表） */
function resultRegistry_() {
  const basic = publicBasicMap(resultSettingsSheet_().getDataRange().getDisplayValues());
  const url = basic[RESULT_PUBLIC_LABEL];
  if (!url) throw new Error('「' + RESULT_SHEET_SETTINGS + '」シートの「' + RESULT_PUBLIC_LABEL + '」にURLがありません');
  const reg = SpreadsheetApp.openById(resultFileId_(url)).getSheetByName(PUBLIC_SHEET_REGISTRY);
  if (!reg) throw new Error('受付ページのスプレッドシートに「' + PUBLIC_SHEET_REGISTRY + '」シートがありません：' + url);
  return parsePublicRegistry(reg.getDataRange().getDisplayValues());
}

/** 結果のページ。戻り値 {html, title} */
function resultPage_(year) {
  const baseUrl = resultServiceUrl_();
  let list = [];
  try {
    list = resultRegistry_();
    const years = list.map(function (x) { return x.year; });
    const entry = year ? pickPublicYear(list, year) : resultDefaultEntry_(list);
    if (!entry) {
      return { title: '結果', html: buildPublicErrorHtml(list.length ? year + ' 年の結果はありません。' : '結果は、まだありません。', years, '', baseUrl, '結果') };
    }
    const cache = CacheService.getScriptCache();
    const key = 'result:' + entry.year;
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);
    const ss = SpreadsheetApp.openById(resultFileId_(entry.url));
    const bs = ss.getSheetByName(PUBLIC_SRC_BASIC), rs = ss.getSheetByName(PUBLIC_SRC_RESULT);
    const basic = bs ? publicBasicMap(bs.getDataRange().getDisplayValues()) : {};
    const num = entry.num || String(basic['開催回'] || '').replace(/^第|回$/g, '');
    const title = ((num ? '第' + num + '回 ' : '') + (entry.name || basic['コンテスト名'] || '')).trim(); // コンテスト名が空でも後ろに空白を残さない（No.182）
    const result = parsePublicResult(rs && rs.getLastRow() > 0 ? rs.getDataRange().getDisplayValues() : []);
    // 交信ログの公開（No.187）：「公開しない」でなく、確定していて、「公開ログ」シートに行があれば、その局の呼出符号をリンクにする
    const logKeys = result.confirmedAt && resultLogPublication_(ss) !== 'none' ? resultLogKeys_(ss) : null;
    const out = { title: publicResultTitle(title), html: buildPublicResultHtml({ years: years, year: entry.year,
      title: title, result: result, organizer: basic['主催者'] || '', logKeys: logKeys }, baseUrl) };
    try { cache.put(key, JSON.stringify(out), RESULT_CACHE_SECONDS); } catch (err) { /* 大きすぎて覚えられないときは、毎回作る */ }
    return out;
  } catch (err) {
    console.error(err && err.stack || err); // くわしい理由は、Apps Script の「実行数」で見る（ページには出さない）
    return { title: '結果', html: buildPublicErrorHtml('ただいま表示できません。しばらくしてから、もう一度開いてください。',
      list.map(function (x) { return x.year; }), '', baseUrl, '結果'), error: String(err && err.message || err) };
  }
}

/** その年の「基本設定」の「交信ログの公開」（設定担当の settingsLogPublicationFor_。'none'・'qso'・'marks'）。読めなければ 'none' */
function resultLogPublication_(ss) {
  try { return settingsLogPublicationFor_(ss); } catch (err) { return 'none'; }
}

/** その年の「公開ログ」シートで、交信ログのある局（publicLogKeys）。シートがない・見出しだけなら null（リンクを付けない） */
function resultLogKeys_(ss) {
  const sh = ss.getSheetByName(PUBLIC_LOG_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const ci = head.indexOf('呼出符号'), si = head.indexOf('開催部門');
  if (ci < 0) return null;
  const n = sh.getLastRow() - 1;
  const a = sh.getRange(2, ci + 1, n, 1).getDisplayValues(), b = si >= 0 ? sh.getRange(2, si + 1, n, 1).getDisplayValues() : null;
  return publicLogKeys([['呼出符号', '開催部門']].concat(a.map(function (r, i) { return [r[0], b ? b[i][0] : '']; })));
}

/**
 * ページから呼ぶ：1局の交信ログ（{html, title}）。押したときに、その年の「交信ログの公開」をサーバーの側で見て、
 * 「公開しない」なら出さない（URLやページを作って呼んでも出さない）。「交信だけ公開」なら審査の印と得点は送らない。その局の行だけを送る
 */
function resultLogHtml(arg) {
  arg = arg || {};
  const year = String(arg.year || '').replace(/[^0-9]/g, '').substring(0, 4);
  const call = String(arg.call || '').trim().substring(0, 20), section = String(arg.section || '').trim().substring(0, 40);
  const stop = function (m) { return { ok: false, html: '<div class="page"><p>' + publicEscape(m) + '</p><p><button type="button" class="logback" data-logback="1">← 結果に戻る</button></p></div>' }; };
  const entry = pickPublicYear(resultRegistry_(), year);
  if (!entry || !call) return stop('交信ログが見つかりません。');
  const ss = SpreadsheetApp.openById(resultFileId_(entry.url));
  const pub = resultLogPublication_(ss);
  if (pub === 'none') return stop('この年の交信ログは公開していません。');
  const rs = ss.getSheetByName(PUBLIC_SRC_RESULT);
  if (!rs || rs.getLastRow() < 1 || !publicResultConfirmedAt(rs.getRange(1, 1, 1, 2).getDisplayValues())) return stop('この年の結果は、まだ確定していません。');
  const sh = ss.getSheetByName(PUBLIC_LOG_SHEET);
  const log = sh && sh.getLastRow() > 1 ? publicLogRows(sh.getDataRange().getDisplayValues(), call, section, pub === 'marks') : null;
  if (!log || !log.rows.length) return stop('この局の交信ログはありません。');
  const bs = ss.getSheetByName(PUBLIC_SRC_BASIC);
  const basic = bs ? publicBasicMap(bs.getDataRange().getDisplayValues()) : {};
  const num = entry.num || String(basic['開催回'] || '').replace(/^第|回$/g, '');
  const title = ((num ? '第' + num + '回 ' : '') + (entry.name || basic['コンテスト名'] || '')).trim();
  return { ok: true, title: call + ' の交信ログ', html: buildPublicLogHtml({ title: title, year: entry.year, call: call, section: section, log: log, withMarks: pub === 'marks' }) };
}

/**
 * 年の指定がないときに出す年：確定しているうちで、いちばん新しい年（2026-10-21 ユーザーが決めた）。
 * どの年も確定していなければ、いちばん新しい年（「審査中です」）。選んだ年は5分だけ覚えておく
 */
function resultDefaultEntry_(list) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('result:default');
  const pick = function (y) { return list.filter(function (e) { return e.year === y; })[0]; };
  if (hit && pick(hit)) return pick(hit);
  let entry = list[0] || null;
  for (let i = 0; i < list.length; i++) {
    try {
      const rs = SpreadsheetApp.openById(resultFileId_(list[i].url)).getSheetByName(PUBLIC_SRC_RESULT);
      if (rs && rs.getLastRow() > 0 && publicResultConfirmedAt(rs.getRange(1, 1, 1, 2).getDisplayValues())) { entry = list[i]; break; }
    } catch (err) { /* 開けない年は飛ばす */ }
  }
  if (entry) cache.put('result:default', entry.year, RESULT_CACHE_SECONDS);
  return entry;
}

/** メニュー：受付ページのスプレッドシートのURLを入れる */
function menuResultConnect() {
  if (!publicOwnerOnly_('1. 受付ページの登録表をつなぐ')) return;
  const ui = SpreadsheetApp.getUi();
  const sh = resultSettingsSheet_();
  publicRemoveBlankSheet1_(SpreadsheetApp.getActiveSpreadsheet()); // 何も入っていない「シート1」を消す（シートの整理の追加 11.）
  const res = ui.prompt('受付ページの登録表をつなぐ', '受付ページのスプレッドシート（「登録」の表があるもの）のURLを入れてください', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const url = String(res.getResponseText() || '').trim();
  try {
    const reg = SpreadsheetApp.openById(resultFileId_(url)).getSheetByName(PUBLIC_SHEET_REGISTRY);
    if (!reg) throw new Error('「' + PUBLIC_SHEET_REGISTRY + '」シートがありません。受付ページのスプレッドシートのURLか確かめてください');
    const v = sh.getDataRange().getDisplayValues();
    let row = -1;
    for (let i = 1; i < v.length; i++) if (String(v[i][0]).trim() === RESULT_PUBLIC_LABEL) row = i + 1;
    if (row < 0) { sh.appendRow([RESULT_PUBLIC_LABEL, url, '']); } else sh.getRange(row, 2).setValue(url);
    menuResultClearCache_();
    ui.alert('つなぎました。登録されている年：' + (parsePublicRegistry(reg.getDataRange().getDisplayValues()).map(function (x) { return x.year; }).join('、') || 'なし') +
      '\n\n' + resultWriteUrls_(SpreadsheetApp.openById(resultFileId_(url))));
  } catch (err) {
    ui.alert('つなげませんでした：' + (err && err.message || err));
  }
}

/**
 * 結果のページのURLを書き込む（案内メールで使う。申し送り No.56）。メニュー「1. 受付ページの登録表をつなぐ」から呼ぶ。
 *   ・受付ページのスプレッドシートの「設定」シート（受付ページで、あとから登録した年・テンプレートにも書かれるように）
 *   ・登録されている各年の審査用スプレッドシートと、テンプレート（受付ページの「設定」の「テンプレートのURL」）の「基本設定」
 * どれも、行がなければ作り、ほかのURLが入っていれば書き換えない。ウェブアプリとしてまだ公開していなければ書かない。結果の文を返す
 */
function resultWriteUrls_(pub) {
  // アドレスは、どこかの年の「基本設定」に正しいURLがあればそれを使う（メニューから自動で受け取るアドレスは違うことがある。No.133）
  const u = resultKnownUrl_(pub);
  return publicWriteUrlEverywhere(pub, u.url, RESULT_PAGE_URL_LABEL, RESULT_PAGE_URL_HELP, '結果のページのURL',
    function (id) { return SpreadsheetApp.openById(id); }) + (u.auto && u.url ? '\n\n' + PUBLIC_URL_CHECK_NOTE : '');
}

/** この結果のページのアドレス（審査のファイルの「基本設定」の「結果のページのURL」を先に使う。No.133）。pub：受付ページのスプレッドシート（なければ「設定」から開く） */
function resultKnownUrl_(pub) {
  if (!pub) {
    try { pub = SpreadsheetApp.openById(resultFileId_(publicBasicMap(resultSettingsSheet_().getDataRange().getDisplayValues())[RESULT_PUBLIC_LABEL])); } catch (err) { pub = null; }
  }
  return publicPageUrl_(pub, RESULT_PAGE_URL_LABEL, resultServiceUrl_(), function (id) { return SpreadsheetApp.openById(id); });
}

function menuResultPreview() {
  if (!publicOwnerOnly_('表示を確かめる')) return;
  const ui = SpreadsheetApp.getUi();
  menuResultClearCache_();
  const p = resultPage_('');
  if (p.error) { ui.alert('表示できませんでした：' + p.error); return; }
  const url = resultKnownUrl_(null).url;
  ui.showModalDialog(HtmlService.createHtmlOutput(resultYearWrap_(p.html) + '<p style="font-size:12px;color:#666;padding:0 16px">' +
    (url ? '結果のページのURL：' + publicEscape(url) : 'まだウェブアプリとして公開していません') + '</p>').setWidth(760).setHeight(560), p.title);
}

/** メニュー「埋め込み用のHTMLを出す」（持ち主だけ。申し送り No.123） */
function menuResultEmbed() {
  if (!publicOwnerOnly_('埋め込み用のHTMLを出す')) return;
  const ui = SpreadsheetApp.getUi(), u = resultKnownUrl_(null); // 「基本設定」の「結果のページのURL」を先に使う（No.133）
  if (!u.url) { ui.alert('まだウェブアプリとして公開（デプロイ）していません。Apps Script の画面で「デプロイ」→「新しいデプロイ」で公開してから、もう一度実行してください。'); return; }
  ui.showModalDialog(HtmlService.createHtmlOutput(publicEmbedDialogHtml([{ name: '結果のページ', url: u.url }], u.auto ? PUBLIC_URL_CHECK_NOTE : ''))
    .setWidth(640).setHeight(400), '埋め込み用のHTML');
}

function menuResultClearCache() {
  if (!publicOwnerOnly_('すぐに新しい内容にする')) return;
  menuResultClearCache_();
  SpreadsheetApp.getUi().alert('覚えていた表示を消しました。次に開いたときから、新しい内容になります。');
}

function menuResultClearCache_() {
  let keys = [];
  try { keys = resultRegistry_().map(function (e) { return 'result:' + e.year; }); } catch (err) { keys = []; }
  keys.push('result:default');
  if (keys.length) CacheService.getScriptCache().removeAll(keys);
}
