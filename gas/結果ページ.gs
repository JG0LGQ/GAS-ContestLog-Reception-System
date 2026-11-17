// コンテストの結果のページ（GAS用・1ファイルにまとめたもの。審査ツール・受付ページとは別のスクリプト）
// 結果ページ専用のスプレッドシートのスクリプトに貼り付け、ウェブアプリとして公開する（受付局リストとは別のURL）
// 元のファイル: src/result/ フォルダ（受付ページの src/public/60_public_page.js も使う）。編集は src/ で行い、node tools/build_gas.js でこの1ファイルを作り直す

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
 * d: {years, year, title, result（parsePublicResult の戻り値）, organizer}。baseUrl: 結果のページのURL（年のリンクに使う）
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
    const tables = function (list) {
      list.forEach(function (s) {
        if (s.title) H.push('<h2 id="' + idOf(s) + '">' + e(s.title) + '</h2>');
        const data = s.rows.filter(function (r) { return !r.note; });
        if (data.length && s.head.length) {
          H.push('<div class="scroll"><table><thead><tr>' + s.head.map(function (h) { return '<th>' + e(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
            s.rows.map(function (r) {
              if (r.note) return '<tr><td colspan="' + s.head.length + '">' + e(r.note) + '</td></tr>';
              return '<tr' + (r.award ? ' class="aw-' + r.award + '"' : '') + '>' + r.cells.map(function (c) { return '<td>' + e(c) + '</td>'; }).join('') + '</tr>';
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
        tables(g.sections);
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
  root.addEventListener('click', function (ev) {
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
    if (ev.key === 'Enter' && ev.target && ev.target.getAttribute && ev.target.getAttribute('data-year')) ev.target.click();
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
    const out = { title: publicResultTitle(title), html: buildPublicResultHtml({ years: years, year: entry.year,
      title: title, result: result, organizer: basic['主催者'] || '' }, baseUrl) };
    try { cache.put(key, JSON.stringify(out), RESULT_CACHE_SECONDS); } catch (err) { /* 大きすぎて覚えられないときは、毎回作る */ }
    return out;
  } catch (err) {
    console.error(err && err.stack || err); // くわしい理由は、Apps Script の「実行数」で見る（ページには出さない）
    return { title: '結果', html: buildPublicErrorHtml('ただいま表示できません。しばらくしてから、もう一度開いてください。',
      list.map(function (x) { return x.year; }), '', baseUrl, '結果'), error: String(err && err.message || err) };
  }
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
