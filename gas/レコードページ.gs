// コンテストレコードのページ（GAS用・1ファイルにまとめたもの。審査ツール・受付ページ・結果ページとは別のスクリプト）
// 「コンテストレコード」スプレッドシートのスクリプトに貼り付け、ウェブアプリとして公開する（受付局リスト・結果のページとは別のURL）
// 元のファイル: src/record/ フォルダ（受付ページの src/public/60_public_page.js も使う）。編集は src/ で行い、node tools/build_gas.js でこの1ファイルを作り直す

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
// ===== 80_record.js =====
/**
 * コンテストレコードの中身（GASとNodeの両方で動く部分。Web担当。申し送り No.68）
 *   ・「確定結果」シートから記録と区分を取り出す
 *   ・CSV を読み、確かめる
 *   ・「記録」シートの記録を確かめる（記録を確かめる）
 *   ・区分ごとに上位を並べ、ページのHTMLを作る
 * スプレッドシートを読む・書く部分とメニューは 81_gas_record.js にある。指示書：docs/指示書_コンテストレコード.md
 *
 * 「確定結果」から区分を見分けるやり方（2026-10-21 ユーザーと決めた）
 *   見出し（■ で始まる行）ごとの表を1つずつ見る
 *   ・列名の最初が「順位」でない表（チェックログなど）は、区分にしない
 *   ・表の中に、表彰の種類が「賞」の行がある表（信越総合通信局長賞など、名前の付いた賞）は、区分にしない
 *   ・列名に「登録番号」がある表は「クラブ」、見出しの最初の語が英数字（種目コード）なら「種目」、ほかは「部門」
 *   区分の名前は、見出しから「■」、後ろの「（2局・1位まで表彰）」などの数の部分、全角の空白から後の説明を除いたもの
 *   参加がない表（「参加なし」だけで列名の行がない）は、見出しが種目コードのものだけ「種目」として足す。
 *   部門・クラブ対抗で参加がない表は種類が見分けられないので足さない（記録が出た年に足される）
 *   （名前の付いた賞の表で、その年に該当する局がなかったときも、列名の行がないので足されない）
 *
 * 名前の付いた賞（信越総合通信局長賞など。シートの整理の追加 15.）は、区分とは別に「賞の記録」「賞」シートに持つ。
 *   確定結果の、表彰の種類が「賞」の行（賞の名前は C 列）を、その年の受賞として取り出す。賞の名前はプログラムに書き込まない
 *   （賞がないコンテストでは何も出ない）。ページでは、区分のレコードの後に、賞ごとに年の新しい順に全部の年を出す
 */

const RECORD_HEADER = ['区分', '年', '開催回', '呼出符号', '交信局数', 'マルチ', '総得点', '備考', '出どころ'];
const RECORD_KIND_HEADER = ['区分', '種類', '使う', '並び順', '説明'];
const RECORD_REVISION_HEADER = ['年', '内容', '区分'];
const RECORD_FROM_CONFIRMED = '確定結果';
const RECORD_FROM_MANUAL = '手入力';
const RECORD_FROM_CSV = '取り込み';
const RECORD_REVISION_MARK = '※';
// 名前の付いた賞（シートの整理の追加 15.）
const RECORD_PRIZE_HEADER = ['賞の名前', '年', '開催回', '呼出符号', '種目', '交信局数', '総得点', '備考', '出どころ'];
const RECORD_PRIZE_KIND_HEADER = ['賞の名前', '使う', '並び順', '説明'];
const RECORD_PRIZE_CSV_HEADER = ['年', '開催回', '呼出符号', '種目', '交信局数', '総得点', '備考']; // 賞のCSVの列（賞の名前の列は持たない。ユーザーが決めた）
// 「設定」の「ページの説明」の初めの値（シートの整理の追加 4.。委員会が自由に書き換えてよい。空なら出さない）
const RECORD_PAGE_DESC_DEFAULT = '各区分の歴代の上位5位（審査で確定した記録）。';

/** 「使う」の欄が印ありか（チェックボックスの TRUE、◯ など） */
function recordChecked(v) {
  return v === true || /^(TRUE|true|◯|○|〇|✓|✔|はい|使う|1)$/.test(String(v == null ? '' : v).trim());
}

/** 全角の数字を半角にし、カンマと空白を取る */
function recordNum(v) {
  return String(v == null ? '' : v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[,，\s]/g, '').trim();
}

/** 見出しから区分の名前と説明を取り出す（例：「■ NNSM　長野県内局 個人 マルチバンド（2局・1位まで表彰）」→ NNSM と説明） */
function recordNameFromTitle(title) {
  let t = String(title || '').trim().replace(/^■\s*/, '');
  t = t.replace(/[（(]\d+(局|クラブ)[^）)]*[）)]\s*$/, '').trim();
  const i = t.indexOf('　');
  return { name: (i >= 0 ? t.substring(0, i) : t).trim(), desc: i >= 0 ? t.substring(i + 1).trim() : '' };
}

/**
 * 「確定結果」シート（2次元の配列。1行目は確定日時）から、区分と記録を取り出す
 * 戻り値: {confirmedAt, kinds:[{name, kind:'種目'|'部門'|'クラブ', desc}], records:[{kind, call, qsos, multi, total}]（kind は区分の名前）,
 *   prizes:[{prize（賞の名前）, call, category（種目）, qsos, total}]（名前の付いた賞の受賞）}
 */
function recordsFromConfirmed(values) {
  const text = function (v) { return String(v == null ? '' : v).trim(); };
  const first = (values || [])[0] || [];
  const out = { confirmedAt: text(first[0]) === '確定日時' ? text(first[1]) : '', kinds: [], records: [], prizes: [] };
  if (!out.confirmedAt) return out;
  const secs = [];
  let sec = null;
  (values || []).slice(1).forEach(function (r) {
    const kind = text(r[0]), cells = (r || []).slice(3).map(text);
    if (kind === '見出し') { sec = { title: cells.filter(String)[0] || '', head: null, rows: [], prize: false, prizeRows: [] }; secs.push(sec); return; }
    if (!sec) return;
    if (kind === '列名') { sec.head = cells; return; }
    if (text(r[1]) === '賞') { sec.prize = true; if (kind === '局' || kind === 'クラブ') sec.prizeRows.push({ name: text(r[2]), cells: cells }); }
    if (kind === '局' || kind === 'クラブ') sec.rows.push(cells);
  });
  secs.forEach(function (s) {
    const nm = recordNameFromTitle(s.title);
    if (s.prize && s.head) { // 名前の付いた賞の表：受賞（表彰の種類が「賞」の行）だけを取り出す。区分にはしない
      const pc = function (c, n) { const i = s.head.indexOf(n); return i >= 0 ? text(c[i]) : ''; };
      const club = s.head.indexOf('登録番号') >= 0;
      s.prizeRows.forEach(function (p) {
        const total = recordNum(pc(p.cells, '総得点'));
        if (!/^\d+$/.test(total)) return;
        out.prizes.push({ prize: p.name || nm.name, call: club ? (pc(p.cells, '登録番号') + ' ' + pc(p.cells, 'クラブ名')).trim() : pc(p.cells, '呼出符号'),
          category: pc(p.cells, '種目'), qsos: recordNum(pc(p.cells, '交信局数')), total: total });
      });
    }
    if (!nm.name || s.prize) return;
    if (!s.head) { // 参加がない表（「参加なし」だけで列名の行がない）：種目コードの表だけ、区分として足す
      if (/^[A-Za-z0-9]+$/.test(nm.name)) out.kinds.push({ name: nm.name, kind: '種目', desc: nm.desc });
      return;
    }
    if (s.head[0] !== '順位') return;
    const col = function (n) { return s.head.indexOf(n); };
    const club = col('登録番号') >= 0;
    const kind = club ? 'クラブ' : /^[A-Za-z0-9]+$/.test(nm.name) ? '種目' : '部門';
    out.kinds.push({ name: nm.name, kind: kind, desc: nm.desc });
    s.rows.forEach(function (c) {
      const get = function (n) { return col(n) >= 0 ? text(c[col(n)]) : ''; };
      const total = recordNum(get('総得点'));
      if (!/^\d+$/.test(total)) return;
      out.records.push({ kind: nm.name, call: club ? (get('登録番号') + ' ' + get('クラブ名')).trim() : get('呼出符号'),
        qsos: recordNum(get('交信局数')), multi: recordNum(get('マルチ')), total: total });
    });
  });
  return out;
}

/** 記録（オブジェクト）を「記録」シートの1行にする */
function recordRow(r, year, num, from) {
  return [r.kind, String(year), String(num || ''), r.call, r.qsos || '', r.multi || '', r.total, r.note || '', from];
}

/**
 * 「記録」シートの行（見出しの行を除く）に、ある年の「確定結果」の記録を入れる。
 * 出どころが「確定結果」でその年の行は置き換える（確定し直したとき用）。手入力・取り込みの行は残す。戻り値：新しい行の一覧
 */
function recordMergeConfirmed(rows, year, num, records) {
  const y = String(year);
  const keep = (rows || []).filter(function (r) {
    return !(String(r[1]).trim() === y && String(r[8]).trim() === RECORD_FROM_CONFIRMED);
  });
  return keep.concat(records.map(function (r) { return recordRow(r, y, num, RECORD_FROM_CONFIRMED); }));
}

/** 「区分」シートの行に、まだない区分を足す（種目は「使う」に印、部門・クラブは印なし）。戻り値 {rows, added:[名前]} */
function recordAddKinds(rows, kinds) {
  const have = {};
  let order = 0;
  (rows || []).forEach(function (r) { have[String(r[0]).trim()] = true; order = Math.max(order, +r[3] || 0); });
  const added = [];
  const out = (rows || []).slice();
  kinds.forEach(function (k) {
    if (!k.name || have[k.name]) return;
    have[k.name] = true;
    order += 1;
    out.push([k.name, k.kind, k.kind === '種目', order, k.desc || '']);
    added.push(k.name);
  });
  return { rows: out, added: added };
}

/**
 * 「賞の記録」シートの行（見出しの行を除く）に、ある年の確定結果の受賞を入れる。
 * 出どころが「確定結果」でその年の行は置き換える（確定し直したとき用）。手入力・取り込みの行は残す。戻り値：新しい行の一覧
 */
function recordMergeConfirmedPrizes(rows, year, num, prizes) {
  const y = String(year);
  const keep = (rows || []).filter(function (r) {
    return !(String(r[1]).trim() === y && String(r[8]).trim() === RECORD_FROM_CONFIRMED);
  });
  return keep.concat(prizes.map(function (p) {
    return [p.prize, y, String(num || ''), p.call, p.category || '', p.qsos || '', p.total, '', RECORD_FROM_CONFIRMED];
  }));
}

/** 「賞」シートの行に、まだない賞を足す（「使う」に印。並び順は続きの番号）。戻り値 {rows, added:[名前]} */
function recordAddPrizes(rows, names) {
  const have = {};
  let order = 0;
  (rows || []).forEach(function (r) { have[String(r[0]).trim()] = true; order = Math.max(order, +r[2] || 0); });
  const added = [];
  const out = (rows || []).slice();
  names.forEach(function (n) {
    n = String(n || '').trim();
    if (!n || have[n]) return;
    have[n] = true;
    order += 1;
    out.push([n, true, order, '']);
    added.push(n);
  });
  return { rows: out, added: added };
}

/** 区分の名前から種類を推しはかる（CSV で「区分」シートにない区分が来たとき） */
function recordGuessKind(name) {
  return /^[A-Za-z0-9]+$/.test(name) ? '種目' : /クラブ/.test(name) ? 'クラブ' : '部門';
}

// ------------------------------------------------------------------ CSV
/** CSV の文字列を2次元の配列にする（"…" で囲んだ欄、"" は " 1つ、欄の中の改行も読む） */
function recordParseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (q) {
      if (c === '"') { if (s.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * CSV の中身を確かめ、「記録」シートの行にする。おかしい行が1つでもあれば、何も取り込まない
 * existing: 今の「記録」シートの行（同じ記録の2重の取り込みを防ぐ）
 * 戻り値: {rows:[取り込む行], errors:[文], kinds:[{name, kind}]（区分の名前の一覧）}
 */
function recordCheckCsv(text, existing) {
  const t = recordParseCsv(text).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  const errors = [];
  if (!t.length) return { rows: [], errors: ['CSV に行がありません'], kinds: [] };
  const head = t[0].map(function (h) { return String(h).trim(); });
  const col = {};
  RECORD_HEADER.forEach(function (h) { col[h] = head.indexOf(h); });
  const need = ['区分', '年', '呼出符号', '総得点'].filter(function (h) { return col[h] < 0; });
  if (need.length) {
    return { rows: [], kinds: [], errors: ['1行目（見出しの行）に「' + need.join('」「') + '」の列がありません。1行目は「' + RECORD_HEADER.slice(0, 8).join(',') + '」にしてください'] };
  }
  const key = function (r) { return [r[0], r[1], r[3], r[6]].map(function (x) { return String(x).trim(); }).join('|'); };
  const seen = {};
  (existing || []).forEach(function (r) { seen[key(r)] = 'ex'; });
  const rows = [], kinds = {};
  t.slice(1).forEach(function (r, i) {
    const line = (i + 2) + '行目：';
    const get = function (h) { return col[h] >= 0 ? String(r[col[h]] == null ? '' : r[col[h]]).trim() : ''; };
    const kind = get('区分'), year = recordNum(get('年')), num = recordNum(get('開催回')).replace(/^第|回$/g, ''), call = get('呼出符号');
    const qsos = recordNum(get('交信局数')), multi = recordNum(get('マルチ')), total = recordNum(get('総得点'));
    const bad = [];
    if (!kind) bad.push('区分が空です（例：NNSM、電信部門（長野県））');
    if (!/^\d{4}$/.test(year)) bad.push('年「' + get('年') + '」は西暦の4けたで書いてください（例：2019）');
    if (num && !/^\d+$/.test(num)) bad.push('開催回「' + get('開催回') + '」は数字だけで書いてください（例：66）');
    if (!call) bad.push('呼出符号（クラブ対抗はクラブの番号と名前）が空です');
    if (qsos && !/^\d+$/.test(qsos)) bad.push('交信局数「' + get('交信局数') + '」は数字で書いてください。分からなければ空にします');
    if (multi && !/^\d+$/.test(multi)) bad.push('マルチ「' + get('マルチ') + '」は数字で書いてください。分からなければ空にします');
    if (!/^\d+$/.test(total)) bad.push('総得点「' + get('総得点') + '」は数字で書いてください（必ず要ります）');
    const row = [kind, year, num, call, qsos, multi, total, get('備考'), RECORD_FROM_CSV];
    if (!bad.length) {
      const k = key(row);
      if (seen[k] === 'ex') bad.push('同じ記録（区分・年・呼出符号・総得点が同じ）が、もう「記録」シートにあります');
      else if (seen[k]) bad.push('同じ記録が、CSV の ' + seen[k] + ' にもあります');
      else seen[k] = (i + 2) + '行目';
    }
    if (bad.length) { errors.push(line + bad.join('。')); return; }
    rows.push(row);
    kinds[kind] = true;
  });
  return { rows: rows, errors: errors, kinds: Object.keys(kinds).map(function (n) { return { name: n, kind: recordGuessKind(n), desc: '' }; }) };
}

/**
 * 賞のCSV（列は「年,開催回,呼出符号,種目,交信局数,総得点,備考」。見出しの行あり）を確かめ、「賞の記録」シートの行にする。
 * prize：どの賞のCSVか（画面で選ぶ）。おかしい行が1つでもあれば、何も取り込まない。確かめ方は記録のCSV（recordCheckCsv）と同じ
 * existing: 今の「賞の記録」シートの行。同じ賞・同じ年・同じ呼出符号の行があれば、2重の取り込みとして知らせる
 * 戻り値: {rows:[取り込む行], errors:[文]}
 */
function recordCheckPrizeCsv(text, prize, existing) {
  prize = String(prize || '').trim();
  if (!prize) return { rows: [], errors: ['どの賞のCSVかを選んでください'] };
  const t = recordParseCsv(text).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  if (!t.length) return { rows: [], errors: ['CSV に行がありません'] };
  const head = t[0].map(function (h) { return String(h).trim(); });
  const col = {};
  RECORD_PRIZE_CSV_HEADER.forEach(function (h) { col[h] = head.indexOf(h); });
  const need = ['年', '呼出符号', '総得点'].filter(function (h) { return col[h] < 0; });
  if (need.length) {
    return { rows: [], errors: ['1行目（見出しの行）に「' + need.join('」「') + '」の列がありません。1行目は「' + RECORD_PRIZE_CSV_HEADER.join(',') + '」にしてください'] };
  }
  const key = function (p, y, c) { return [p, y, c].map(function (x) { return String(x).trim(); }).join('|'); };
  const seen = {};
  (existing || []).forEach(function (r) { seen[key(r[0], recordNum(r[1]), r[3])] = 'ex'; });
  const rows = [], errors = [];
  t.slice(1).forEach(function (r, i) {
    const get = function (h) { return col[h] >= 0 ? String(r[col[h]] == null ? '' : r[col[h]]).trim() : ''; };
    const year = recordNum(get('年')), num = recordNum(get('開催回')).replace(/^第|回$/g, ''), call = get('呼出符号');
    const qsos = recordNum(get('交信局数')), total = recordNum(get('総得点'));
    const bad = [];
    if (!/^\d{4}$/.test(year)) bad.push('年「' + get('年') + '」は西暦の4けたで書いてください（例：2019）');
    if (num && !/^\d+$/.test(num)) bad.push('開催回「' + get('開催回') + '」は数字だけで書いてください（例：66）');
    if (!call) bad.push('呼出符号が空です');
    if (qsos && !/^\d+$/.test(qsos)) bad.push('交信局数「' + get('交信局数') + '」は数字で書いてください。分からなければ空にします');
    if (!/^\d+$/.test(total)) bad.push('総得点「' + get('総得点') + '」は数字で書いてください（必ず要ります）');
    if (!bad.length) {
      const k = key(prize, year, call);
      if (seen[k] === 'ex') bad.push('同じ受賞（賞・年・呼出符号が同じ）が、もう「賞の記録」シートにあります');
      else if (seen[k]) bad.push('同じ受賞が、CSV の ' + seen[k] + ' にもあります');
      else seen[k] = (i + 2) + '行目';
    }
    if (bad.length) { errors.push((i + 2) + '行目：' + bad.join('。')); return; }
    rows.push([prize, year, num, call, get('種目'), qsos, total, get('備考'), RECORD_FROM_CSV]);
  });
  return { rows: rows, errors: errors };
}

/**
 * 「賞の記録」シートを確かめる（メニュー「記録を確かめる」）。rows・prizeRows（「賞」シート）は見出しの行を除いたもの
 * 同じ年に2局が受賞することもあるので、同じ賞・同じ年・同じ呼出符号が2行あるときだけ知らせる。戻り値: [文]
 */
function recordCheckPrizeRows(rows, prizeRows) {
  const names = {};
  (prizeRows || []).forEach(function (r) { if (String(r[0]).trim()) names[String(r[0]).trim()] = true; });
  const out = [], seen = {};
  (rows || []).forEach(function (r, i) {
    if (!r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; })) return;
    const line = '「賞の記録」の' + (i + 2) + '行目：';
    const p = String(r[0] == null ? '' : r[0]).trim(), call = String(r[3] == null ? '' : r[3]).trim();
    if (!p) out.push(line + '賞の名前が空です');
    else if (!names[p]) out.push(line + '賞「' + p + '」が「賞」シートにありません（賞の名前を確かめるか、「賞」シートに足してください）');
    if (!/^\d{4}$/.test(recordNum(r[1]))) out.push(line + '年「' + r[1] + '」が西暦の4けたではありません');
    if (!call) out.push(line + '呼出符号が空です');
    const q = recordNum(r[5]);
    if (q && !/^\d+$/.test(q)) out.push(line + '交信局数「' + r[5] + '」が数字ではありません');
    if (!/^\d+$/.test(recordNum(r[6]))) out.push(line + '総得点「' + r[6] + '」が数字ではありません');
    const key = [p, recordNum(r[1]), call].join('|');
    if (seen[key]) out.push(line + '同じ受賞（賞・年・呼出符号が同じ）が ' + seen[key] + ' にもあります');
    else seen[key] = (i + 2) + '行目';
  });
  return out;
}

/**
 * 「記録」シートを確かめる（メニュー「記録を確かめる」）。rows・kindRows は見出しの行を除いたもの
 * 戻り値: [文]（おかしいところがなければ空）
 */
function recordCheckRows(rows, kindRows) {
  const kinds = {};
  (kindRows || []).forEach(function (r) { if (String(r[0]).trim()) kinds[String(r[0]).trim()] = true; });
  const out = [], seen = {};
  (rows || []).forEach(function (r, i) {
    const line = (i + 2) + '行目：';
    const k = String(r[0] == null ? '' : r[0]).trim();
    if (!r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; })) return;
    if (!k) out.push(line + '区分が空です');
    else if (!kinds[k]) out.push(line + '区分「' + k + '」が「区分」シートにありません（区分の名前を確かめるか、「区分」シートに足してください）');
    if (!/^\d{4}$/.test(recordNum(r[1]))) out.push(line + '年「' + r[1] + '」が西暦の4けたではありません');
    if (!String(r[3] == null ? '' : r[3]).trim()) out.push(line + '呼出符号が空です');
    ['交信局数', 'マルチ'].forEach(function (h, j) {
      const v = recordNum(r[4 + j]);
      if (v && !/^\d+$/.test(v)) out.push(line + h + '「' + r[4 + j] + '」が数字ではありません');
    });
    if (!/^\d+$/.test(recordNum(r[6]))) out.push(line + '総得点「' + r[6] + '」が数字ではありません');
    const key = [k, recordNum(r[1]), String(r[3]).trim(), recordNum(r[6])].join('|');
    if (seen[key]) out.push(line + '同じ記録（区分・年・呼出符号・総得点が同じ）が ' + seen[key] + ' にもあります');
    else seen[key] = (i + 2) + '行目';
  });
  return out;
}

// ------------------------------------------------------------------ ページ
/**
 * ページに出すものを作る
 * a: {rows（「記録」）, kindRows（「区分」）, revisions（「規約の改正」）, settings（{項目: 値}）, prizeRows（「賞の記録」）, prizeKinds（「賞」）}。
 *   どれも見出しの行を除いたもの
 * 戻り値: {title, organizer, desc（ページの説明。空なら出さない）, lastYear, limit,
 *   sections:[{name, desc（「区分」の説明。見出しの下に出す）, club, rows:[{rank, call, year, mark（規約の改正の番号。0＝なし）, isNew, qsos, multi, total}]}],
 *   revisions:[{no, year, texts:[文]}]（ページの最後に出す規約の改正の注釈。番号の順）,
 *   prizes:[{name, rows:[{year, num, call, category, qsos, total}]}]（名前の付いた賞。年の新しい順）}
 * 規約の改正の番号（シートの整理の追加 14.）：表に印の付いた年ごとに、古い年から ※1・※2…。ページ全体で同じ番号。
 *   区分を書いた改正は、その区分の記録にだけ印を付ける。表のどこにも出ない年の注釈は出さない
 */
function recordPageData(a) {
  const st = a.settings || {};
  const limit = Math.max(1, +recordNum(st['ページに出す位']) || 5);
  const markNew = !/^(付けない|しない|いいえ|×|✕)$/.test(String(st['新しい記録の印'] || '').trim());
  const recs = (a.rows || []).map(function (r) {
    return { kind: String(r[0] == null ? '' : r[0]).trim(), year: recordNum(r[1]), call: String(r[3] == null ? '' : r[3]).trim(),
      qsos: recordNum(r[4]), multi: recordNum(r[5]), total: recordNum(r[6]) };
  }).filter(function (r) { return r.kind && /^\d{4}$/.test(r.year) && r.call && /^\d+$/.test(r.total); });
  const lastYear = recs.reduce(function (m, r) { return r.year > m ? r.year : m; }, '');
  const usedRevs = {}; // 表に印を付けた規約の改正（revs の番号）
  const revs = (a.revisions || []).map(function (r) {
    return { year: recordNum(r[0]), text: String(r[1] == null ? '' : r[1]).trim(), kind: String(r[2] == null ? '' : r[2]).trim() };
  }).filter(function (r) { return /^\d{4}$/.test(r.year); });
  const kinds = (a.kindRows || []).filter(function (r) { return String(r[0]).trim() && recordChecked(r[2]); })
    .map(function (r, i) { return { name: String(r[0]).trim(), kind: String(r[1] || '').trim(), order: r[3] === '' || r[3] == null ? 1e9 + i : +r[3], desc: String(r[4] || '').trim(), i: i }; })
    .sort(function (x, y) { return x.order - y.order || x.i - y.i; });
  const sections = kinds.map(function (k) {
    const list = recs.filter(function (r) { return r.kind === k.name; })
      .sort(function (x, y) { return (+y.total) - (+x.total) || (x.year < y.year ? -1 : x.year > y.year ? 1 : 0); });
    const rows = [];
    list.forEach(function (r, i) {
      const rank = i > 0 && list[i - 1].total === r.total ? rows[i - 1].rank : i + 1;
      rows.push({ rank: rank, call: r.call, year: r.year, qsos: r.qsos, multi: r.multi, total: r.total, isNew: markNew && r.year === lastYear, mark: false });
    });
    const shown = rows.filter(function (r) { return r.rank <= limit; });
    const myRevs = revs.filter(function (v) { return !v.kind || v.kind === k.name; });
    shown.forEach(function (r) {
      myRevs.forEach(function (v) { if (v.year === r.year) { r.mark = true; usedRevs[revs.indexOf(v)] = true; } });
    });
    return { name: k.name, desc: k.desc, club: k.kind === 'クラブ', rows: shown };
  });
  // 規約の改正の番号：印の付いた年を古い順に並べて ※1・※2…（同じ年の改正は1つの番号にまとめる）
  const noOf = {}, revisions = [];
  revs.map(function (v, i) { return { v: v, i: i }; }).filter(function (x) { return usedRevs[x.i]; })
    .sort(function (x, y) { return x.v.year < y.v.year ? -1 : x.v.year > y.v.year ? 1 : x.i - y.i; })
    .forEach(function (x) {
      if (!noOf[x.v.year]) { noOf[x.v.year] = revisions.length + 1; revisions.push({ no: noOf[x.v.year], year: x.v.year, texts: [] }); }
      revisions[noOf[x.v.year] - 1].texts.push(x.v.text + (x.v.kind ? '（' + x.v.kind + '）' : ''));
    });
  sections.forEach(function (sec) { sec.rows.forEach(function (r) { r.mark = r.mark ? noOf[r.year] : 0; }); });
  // ページの説明（「設定」の「ページの説明」。行がまだないときは、前と同じ文。行があって空なら出さない）
  const desc = 'ページの説明' in st ? String(st['ページの説明'] == null ? '' : st['ページの説明']).trim()
    : '各区分の歴代の上位' + limit + '位（審査で確定した記録）。';
  return { title: String(st['コンテスト名'] || '').trim(), organizer: String(st['主催者'] || '').trim(), desc: desc, lastYear: lastYear, limit: limit,
    sections: sections, revisions: revisions, prizes: recordPrizeSections(a.prizeRows, a.prizeKinds) };
}

/** 名前の付いた賞の表（「賞」で「使う」に印のある賞ごと。並び順の順。年の新しい順に全部の年）。recordPageData から呼ぶ */
function recordPrizeSections(prizeRows, prizeKinds) {
  const recs = (prizeRows || []).map(function (r) {
    return { prize: String(r[0] == null ? '' : r[0]).trim(), year: recordNum(r[1]), num: recordNum(r[2]).replace(/^第|回$/g, ''),
      call: String(r[3] == null ? '' : r[3]).trim(), category: String(r[4] == null ? '' : r[4]).trim(), qsos: recordNum(r[5]), total: recordNum(r[6]) };
  }).filter(function (r) { return r.prize && /^\d{4}$/.test(r.year) && r.call; });
  return (prizeKinds || []).filter(function (r) { return String(r[0]).trim() && recordChecked(r[1]); })
    .map(function (r, i) { return { name: String(r[0]).trim(), order: r[2] === '' || r[2] == null ? 1e9 + i : +r[2], title: String(r[3] || '').trim(), i: i }; })
    .sort(function (x, y) { return x.order - y.order || x.i - y.i; })
    .map(function (k) {
      const rows = recs.filter(function (r) { return r.prize === k.name; })
        .sort(function (x, y) { return x.year < y.year ? 1 : x.year > y.year ? -1 : (+y.total || 0) - (+x.total || 0); });
      return { name: k.title || k.name, rows: rows };
    });
}

/** 総得点などの数を、3けたごとのカンマにする */
function recordComma(s) {
  const t = String(s == null ? '' : s);
  return /^\d+$/.test(t) ? t.replace(/\B(?=(\d{3})+$)/g, ',') : t;
}

/** ページのタイトル */
function recordPageTitle(d) {
  return (d.title ? d.title + ' ' : '') + 'コンテストレコード';
}

/** ページ（<body> の中身）を作る。d：recordPageData の戻り値 */
function buildRecordPageHtml(d) {
  const e = publicEscape;
  const H = [publicStyle_() + recordStyle_()];
  H.push('<h1>' + e(recordPageTitle(d)) + '</h1>');
  // ページの説明（「設定」の「ページの説明」。セルの中の改行はそのまま改行にする）と、何年までの記録か
  const head = e(d.desc || '').replace(/\n/g, '<br>') + (d.lastYear ? e(d.lastYear) + '年まで' : '');
  if (head) H.push('<div class="meta">' + head + '</div>');
  const prizes = (d.prizes || []);
  if (!d.sections.length && !prizes.length) {
    H.push('<p>まだ記録がありません。</p>');
  } else {
    H.push('<div class="nav">' + d.sections.map(function (s, i) { return '<a href="#k' + i + '">' + e(s.name) + '</a>'; })
      .concat(prizes.map(function (p, i) { return '<a href="#p' + i + '">' + e(p.name) + '</a>'; })).join('') + '</div>');
    d.sections.forEach(function (s, i) {
      H.push('<h2 id="k' + i + '">' + e(s.name) + '</h2>');
      if (s.desc) H.push('<div class="desc">' + e(s.desc) + '</div>');
      if (!s.rows.length) { H.push('<p class="none">記録はまだありません。</p>'); return; }
      H.push('<div class="scroll"><table><thead><tr><th>順位</th><th>' + (s.club ? 'クラブ' : '呼出符号') + '</th><th>年</th>' +
        (s.club ? '' : '<th class="n">交信局数</th><th class="n">マルチ</th>') + '<th class="n">総得点</th></tr></thead><tbody>' +
        s.rows.map(function (r) {
          return '<tr><td>' + r.rank + '</td><td>' + e(r.call) + '</td><td>' + e(r.year) + (r.mark ? RECORD_REVISION_MARK + r.mark : '') +
            (r.isNew ? '<span class="new">NEW</span>' : '') + '</td>' +
            (s.club ? '' : '<td class="n">' + e(recordComma(r.qsos)) + '</td><td class="n">' + e(recordComma(r.multi)) + '</td>') +
            '<td class="n">' + e(recordComma(r.total)) + '</td></tr>';
        }).join('') + '</tbody></table></div>');
    });
    // 名前の付いた賞（区分のレコードの後。年の新しい順。規約の改正の印は付けない）
    prizes.forEach(function (p, i) {
      H.push('<h2 id="p' + i + '">' + e(p.name) + '</h2>');
      if (!p.rows.length) { H.push('<p class="none">記録はまだありません。</p>'); return; }
      H.push('<div class="scroll"><table><thead><tr><th>年</th><th>呼出符号</th><th>種目</th><th class="n">交信局数</th><th class="n">総得点</th></tr></thead><tbody>' +
        p.rows.map(function (r) {
          return '<tr><td>' + e(r.year) + (r.num ? '（第' + e(r.num) + '回）' : '') + '</td><td>' + e(r.call) + '</td><td>' + e(r.category) + '</td>' +
            '<td class="n">' + e(recordComma(r.qsos)) + '</td><td class="n">' + e(recordComma(r.total)) + '</td></tr>';
        }).join('') + '</tbody></table></div>');
    });
  }
  // 規約の改正の注釈（ページの最後、主催者の上。番号の順）
  if ((d.revisions || []).length) {
    H.push('<h2 id="rev">規約の改正</h2><div class="revs">' + d.revisions.map(function (v) {
      return '<div class="rev"><span class="rno">' + RECORD_REVISION_MARK + v.no + '</span>' + e(v.year) + '年：' + e(v.texts.join('／')) + '</div>';
    }).join('') + '</div>');
  }
  if (d.organizer) H.push('<div class="foot">' + e(d.organizer) + '</div>');
  return '<div class="page">' + H.join('\n') + '</div>';
}

function recordStyle_() {
  return '<style>' +
    '.nav{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.nav a{font-size:13px;padding:3px 8px;border:1px solid #c5d3e8;border-radius:12px;color:#1d4f91;text-decoration:none;background:#f4f7fb}' +
    'h2{font-size:16px;margin:18px 0 6px;padding:4px 8px;background:#dde7f3;border-radius:4px;line-height:1.4}' +
    '.desc{font-size:13px;color:#555;margin:0 0 4px 2px}.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}' +
    '.scroll table{font-size:13px}.scroll td,.scroll th{padding:5px 4px}' +
    '.new{display:inline-block;font-size:10px;background:#c62828;color:#fff;border-radius:3px;padding:0 3px;margin-left:3px;vertical-align:1px}' +
    '.revs{font-size:13px;line-height:1.6;margin:4px 2px}.rev{padding-left:2.6em;text-indent:-2.6em;margin:3px 0}.rno{display:inline-block;width:2.6em;text-indent:0;font-weight:bold}' +
    '.none{font-size:14px;color:#666;margin:4px 8px}' +
    '</style>';
}
// ===== 81_gas_record.js =====
/**
 * コンテストレコードのページ（GAS専用。Web担当。申し送り No.68）
 *
 * 「コンテストレコード」スプレッドシートのスクリプト。受付局リスト・結果のページとは別に、ウェブアプリとして一度だけ公開する。
 * プログラムを直したときは「デプロイを管理」で新しいバージョンにする（URLは変わらない）。
 *
 *   コンテストレコードのスプレッドシート
 *     記録        ← 1行が1つの記録（区分・年・開催回・呼出符号・交信局数・マルチ・総得点・備考・出どころ）。消さずに全部持つ
 *     区分        ← どのレコードを作るか（区分・種類・使う・並び順・説明）
 *     規約の改正  ← 年・内容・区分（空ならすべての区分）。改正のあった年の記録に印を付ける
 *     設定        ← 受付ページのスプレッドシート・コンテスト名・ページに出す位・主催者・新しい記録の印・ページの説明
 *     賞の記録    ← 名前の付いた賞の受賞（賞の名前・年・開催回・呼出符号・種目・交信局数・総得点・備考・出どころ）。シートの整理の追加 15.
 *     賞          ← どの賞を出すか（賞の名前・使う・並び順・説明）
 *
 * メニュー「2. 受付ページの登録表をつなぐ」で、このページのURLを、各年の審査のファイルとテンプレートの「基本設定」の
 * 「レコードのページのURL」に書く（案内メールで使う。シートの整理 追記2。publicWriteUrlEverywhere）。
 * 記録の入れ方：メニュー「確定結果から取り込む」（受付ページの「登録」の年から選ぶ）、「CSVを取り込む」、または「記録」シートに直接書く。
 * 中身（取り出す・確かめる・並べる・HTML）は 80_record.js。
 * メニューは、このスプレッドシートの持ち主（管理用アカウント）だけが使える（シートの整理の追加 3.。publicOwnerOnly_）。
 * メニューを使うと、足りないシート・「設定」の行を作る（recordMenuStart_。今ある「コンテストレコード」にも入るように）。
 */

const RECORD_SHEET_RECORDS = '記録';
const RECORD_SHEET_KINDS = '区分';
const RECORD_SHEET_REVISIONS = '規約の改正';
const RECORD_SHEET_SETTINGS = '設定';
const RECORD_SHEET_PRIZES = '賞の記録';
const RECORD_SHEET_PRIZE_KINDS = '賞';
const RECORD_PUBLIC_LABEL = PUBLIC_BOOK_LABEL; // 前の名前「公開ページのスプレッドシート」の行は、自動で付け替える（recordSettingsSheet_）
const RECORD_SRC_CONFIRMED = '確定結果'; // 審査用スプレッドシートの「確定結果」シート（審査担当のメニュー「審査結果を確定する」で作る）
const RECORD_SETTINGS_ROWS = [
  [RECORD_PUBLIC_LABEL, '', '受付ページのスプレッドシート（「登録」の表があるもの）のURL。「確定結果から取り込む」で年を選ぶのに使う'],
  ['コンテスト名', '', 'ページの見出しに出す名前（例：JA0 VHFコンテスト）。空なら「確定結果から取り込む」で、その年の「基本設定」から入る'],
  ['ページに出す位', '5', '各区分の上位何位まで出すか（同じ総得点の局は同じ順位で、すべて出す）'],
  ['主催者', '', 'ページの下に出す名前。空なら「確定結果から取り込む」で、その年の「基本設定」から入る'],
  ['新しい記録の印', '付ける', '「付ける」なら、いちばん新しい年の記録に「NEW」を付ける。「付けない」なら付けない'],
  ['ページの説明', RECORD_PAGE_DESC_DEFAULT, 'ページの見出しの下に出す説明の文。自由に書き換えてよい。空なら出さない。セルの中で改行すると、ページでも改行する']
];
const RECORD_CACHE_SECONDS = 300;
const RECORD_CACHE_KEY = 'record:page';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('コンテストレコード')
    .addItem('1. シートを作る', 'menuRecordSetup')
    .addItem('2. 受付ページの登録表をつなぐ（URLを入れる・レコードのページのURLを書き込む）', 'menuRecordConnect')
    .addSeparator()
    .addItem('確定結果から取り込む（年を選ぶ）', 'menuRecordImportConfirmed')
    .addItem('CSVを取り込む', 'menuRecordImportCsv')
    .addItem('賞のCSVを取り込む', 'menuRecordImportPrizeCsv')
    .addItem('記録を確かめる', 'menuRecordCheck')
    .addSeparator()
    .addItem('表示を確かめる', 'menuRecordPreview')
    .addItem('すぐに新しい内容にする（覚えた表示を消す）', 'menuRecordClearCache')
    .addItem('埋め込み用のHTMLを出す', 'menuRecordEmbed')
    .addToUi();
}

/** ウェブアプリとして開かれたとき */
function doGet() {
  const p = recordPage_();
  // ほかのページ（委員会のホームページなど）に枠（iframe）で埋め込めるようにする（警告の帯を出さない方法を試すため。申し送り No.97。
  // 案A。作り込みはユーザーとPL担当が決めてから）。ページは見るだけのものと提出のフォームで、委員の合言葉などはページに出さない
  return HtmlService.createHtmlOutput(p.html).setTitle(p.title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function recordFileId_(url) {
  const m = /[-\w]{25,}/.exec(String(url || ''));
  if (!m) throw new Error('スプレッドシートのURLが読み取れません：' + url);
  return m[0];
}

/** シート（なければ見出しの行を付けて作る） */
function recordSheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 見出しの行を除いた中身 */
function recordBody_(sh, width) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, width).getValues().map(function (r) { return r.map(function (v) { return v instanceof Date ? '' : v; }); }) : [];
}

/** シートの中身（見出しの行を除く）を rows で置き換える */
function recordWriteBody_(sh, rows, width) {
  const n = sh.getLastRow() - 1;
  if (n > 0) sh.getRange(2, 1, n, width).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);
}

/** 「設定」シート（なければ作る）。前の名前「公開ページのスプレッドシート」の行は「受付ページのスプレッドシート」に付け替える */
function recordSettingsSheet_() {
  const sh = recordSheet_(RECORD_SHEET_SETTINGS, ['項目', '値', '説明']);
  publicRenameRow(sh, PUBLIC_BOOK_LABEL_OLD, RECORD_PUBLIC_LABEL); // シートの整理：「公開ページ」→「受付ページ」
  return sh;
}

function recordSettings_() {
  return publicBasicMap(recordSettingsSheet_().getDataRange().getDisplayValues());
}

/** 「区分」シートの「使う」の列をチェックボックスにする（col：「使う」の列。「賞」シートは2列目） */
function recordKindCheckboxes_(sh, col) {
  const n = sh.getLastRow() - 1;
  if (n > 0) sh.getRange(2, col || 3, n, 1).insertCheckboxes();
}

/** 足りないシートと「設定」の行を作る（今ある「コンテストレコード」にも、新しいシート・行が入るように） */
function recordEnsureSheets_() {
  recordSheet_(RECORD_SHEET_RECORDS, RECORD_HEADER);
  recordSheet_(RECORD_SHEET_KINDS, RECORD_KIND_HEADER);
  recordSheet_(RECORD_SHEET_REVISIONS, RECORD_REVISION_HEADER);
  const st = recordSettingsSheet_();
  recordSheet_(RECORD_SHEET_PRIZES, RECORD_PRIZE_HEADER);
  recordSheet_(RECORD_SHEET_PRIZE_KINDS, RECORD_PRIZE_KIND_HEADER);
  const have = publicBasicMap(st.getDataRange().getDisplayValues());
  RECORD_SETTINGS_ROWS.forEach(function (r) { if (!(r[0] in have)) st.appendRow(r); });
}

/** メニューの初め：持ち主だけ（シートの整理の追加 3.）。持ち主なら、足りないシート・行を作って true */
function recordMenuStart_(what) {
  if (!publicOwnerOnly_(what)) return false;
  recordEnsureSheets_();
  return true;
}

function menuRecordSetup() {
  if (!recordMenuStart_('1. シートを作る')) return;
  publicRemoveBlankSheet1_(SpreadsheetApp.getActiveSpreadsheet()); // 何も入っていない「シート1」を消す（シートの整理の追加 11.）
  SpreadsheetApp.getUi().alert('「記録」「区分」「規約の改正」「設定」「賞の記録」「賞」のシートを作りました。\n' +
    '次に「2. 受付ページの登録表をつなぐ」で、受付ページのスプレッドシートのURLを入れてください。');
}

/** 受付ページの「登録」の表（年の一覧） */
function recordRegistry_() {
  const url = recordSettings_()[RECORD_PUBLIC_LABEL];
  if (!url) throw new Error('「設定」の「' + RECORD_PUBLIC_LABEL + '」にURLがありません。「2. 受付ページの登録表をつなぐ」を実行してください');
  const reg = SpreadsheetApp.openById(recordFileId_(url)).getSheetByName(PUBLIC_SHEET_REGISTRY);
  if (!reg) throw new Error('受付ページのスプレッドシートに「' + PUBLIC_SHEET_REGISTRY + '」シートがありません：' + url);
  return parsePublicRegistry(reg.getDataRange().getDisplayValues());
}

function menuRecordConnect() {
  if (!recordMenuStart_('2. 受付ページの登録表をつなぐ')) return;
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('受付ページの登録表をつなぐ', '受付ページのスプレッドシート（「登録」の表があるもの）のURLを入れてください', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const url = String(res.getResponseText() || '').trim();
  try {
    const reg = SpreadsheetApp.openById(recordFileId_(url)).getSheetByName(PUBLIC_SHEET_REGISTRY);
    if (!reg) throw new Error('「' + PUBLIC_SHEET_REGISTRY + '」シートがありません。受付ページのスプレッドシートのURLか確かめてください');
    publicSetBasic_(recordSettingsSheet_(), RECORD_PUBLIC_LABEL, url, RECORD_SETTINGS_ROWS[0][2]);
    // レコードのページのURLを、各年とテンプレートの「基本設定」の「レコードのページのURL」に書く（シートの整理 追記2。結果のページと同じやり方）
    // アドレスは、どこかの年の「基本設定」に正しいURLがあればそれを使う（メニューから自動で受け取るアドレスは違うことがある。No.133）
    const pub = SpreadsheetApp.openById(recordFileId_(url)), u = recordKnownUrl_(pub);
    const written = publicWriteUrlEverywhere(pub, u.url, RECORD_PAGE_URL_LABEL,
      RECORD_PAGE_URL_HELP, 'レコードのページのURL', function (id) { return SpreadsheetApp.openById(id); }) + (u.auto && u.url ? '\n\n' + PUBLIC_URL_CHECK_NOTE : '');
    ui.alert('つなぎました。登録されている年：' + (parsePublicRegistry(reg.getDataRange().getDisplayValues()).map(function (x) { return x.year; }).join('、') || 'なし') +
      '\n\n' + written);
  } catch (err) {
    ui.alert('つなげませんでした：' + (err && err.message || err));
  }
}

/**
 * ある年の「確定結果」を取り込む。結果の文を返す（取り込めなかったときはエラー）
 * 同じ年をもう一度取り込むと、出どころが「確定結果」のその年の記録を置き換える（手入力・取り込みの記録は消さない）
 */
function recordImportConfirmed_(year) {
  const entry = recordRegistry_().filter(function (e) { return e.year === String(year).trim(); })[0];
  if (!entry) throw new Error(year + ' 年は、受付ページの「登録」にありません');
  const ss = SpreadsheetApp.openById(recordFileId_(entry.url));
  const rs = ss.getSheetByName(RECORD_SRC_CONFIRMED);
  const got = recordsFromConfirmed(rs && rs.getLastRow() > 0 ? rs.getDataRange().getDisplayValues() : []);
  if (!got.confirmedAt) throw new Error(entry.year + ' 年は、審査結果がまだ確定していません（「確定結果」シートがないか、空です）。取り込みませんでした');
  const bs = ss.getSheetByName(PUBLIC_SRC_BASIC);
  const basic = bs ? publicBasicMap(bs.getDataRange().getDisplayValues()) : {};
  const num = entry.num || String(basic['開催回'] || '').replace(/^第|回$/g, '');
  const rec = recordSheet_(RECORD_SHEET_RECORDS, RECORD_HEADER);
  recordWriteBody_(rec, recordMergeConfirmed(recordBody_(rec, RECORD_HEADER.length), entry.year, num, got.records), RECORD_HEADER.length);
  const ks = recordSheet_(RECORD_SHEET_KINDS, RECORD_KIND_HEADER);
  const k = recordAddKinds(recordBody_(ks, RECORD_KIND_HEADER.length), got.kinds);
  recordWriteBody_(ks, k.rows, RECORD_KIND_HEADER.length);
  recordKindCheckboxes_(ks);
  // 名前の付いた賞の受賞（シートの整理の追加 15.）。「賞」シートにない賞は足す（「使う」に印）
  const ps = recordSheet_(RECORD_SHEET_PRIZES, RECORD_PRIZE_HEADER);
  recordWriteBody_(ps, recordMergeConfirmedPrizes(recordBody_(ps, RECORD_PRIZE_HEADER.length), entry.year, num, got.prizes), RECORD_PRIZE_HEADER.length);
  const pk = recordSheet_(RECORD_SHEET_PRIZE_KINDS, RECORD_PRIZE_KIND_HEADER);
  const pa = recordAddPrizes(recordBody_(pk, RECORD_PRIZE_KIND_HEADER.length), got.prizes.map(function (x) { return x.prize; }));
  recordWriteBody_(pk, pa.rows, RECORD_PRIZE_KIND_HEADER.length);
  recordKindCheckboxes_(pk, 2);
  // コンテスト名・主催者が空なら、その年の「基本設定」から入れる
  const st = recordSettingsSheet_();
  const cur = publicBasicMap(st.getDataRange().getDisplayValues());
  if (!cur['コンテスト名'] && (entry.name || basic['コンテスト名'])) publicSetBasic_(st, 'コンテスト名', entry.name || basic['コンテスト名'], RECORD_SETTINGS_ROWS[1][2]);
  if (!cur['主催者'] && basic['主催者']) publicSetBasic_(st, '主催者', basic['主催者'], RECORD_SETTINGS_ROWS[3][2]);
  recordClearCache_();
  return entry.year + ' 年（確定：' + got.confirmedAt + '）の記録を ' + got.records.length + ' 件取り込みました。' +
    (got.prizes.length ? '\n名前の付いた賞の受賞：' + got.prizes.map(function (x) { return x.prize + ' ' + x.call; }).join('、') : '') +
    (k.added.length ? '\n「区分」シートに足した区分：' + k.added.join('、') + '\n（種目は「使う」に印を付けました。部門・クラブ対抗は、使うものに印を付けてください）' : '') +
    (pa.added.length ? '\n「賞」シートに足した賞：' + pa.added.join('、') : '');
}

function menuRecordImportConfirmed() {
  if (!recordMenuStart_('確定結果から取り込む')) return;
  const ui = SpreadsheetApp.getUi();
  try {
    const years = recordRegistry_().map(function (e) { return e.year; });
    const res = ui.prompt('確定結果から取り込む', '取り込む年を入れてください（登録されている年：' + (years.join('、') || 'なし') + '）', ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    ui.alert(recordImportConfirmed_(recordNum(res.getResponseText())));
  } catch (err) {
    ui.alert('取り込めませんでした：' + (err && err.message || err));
  }
}

/** CSV の中身を取り込む（CSVを取り込むの画面から呼ぶ）。結果の文を返す */
function recordImportCsvText(text) {
  const no = publicOwnerProblem_('CSVを取り込む');
  if (no) return { ok: false, message: no };
  recordEnsureSheets_();
  const rec = recordSheet_(RECORD_SHEET_RECORDS, RECORD_HEADER);
  const rows = recordBody_(rec, RECORD_HEADER.length);
  const r = recordCheckCsv(text, rows);
  if (r.errors.length) {
    return { ok: false, message: 'おかしい行があったので、取り込みませんでした。直してから、もう一度取り込んでください。\n' +
      r.errors.slice(0, 50).join('\n') + (r.errors.length > 50 ? '\nほか ' + (r.errors.length - 50) + ' 件' : '') };
  }
  if (!r.rows.length) return { ok: false, message: '取り込む記録がありません' };
  recordWriteBody_(rec, rows.concat(r.rows), RECORD_HEADER.length);
  const ks = recordSheet_(RECORD_SHEET_KINDS, RECORD_KIND_HEADER);
  const k = recordAddKinds(recordBody_(ks, RECORD_KIND_HEADER.length), r.kinds.map(function (x) { return { name: x.name, kind: x.kind, desc: '' }; }));
  recordWriteBody_(ks, k.rows, RECORD_KIND_HEADER.length);
  recordKindCheckboxes_(ks);
  recordClearCache_();
  return { ok: true, message: r.rows.length + ' 件の記録を取り込みました。' +
    (k.added.length ? '\n「区分」シートに足した区分：' + k.added.join('、') + '（名前がまちがっていないか確かめてください）' : '') };
}

function menuRecordImportCsv() {
  if (!recordMenuStart_('CSVを取り込む')) return;
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(recordCsvDialogHtml_()).setWidth(560).setHeight(460), 'CSVを取り込む');
}

/** CSVを取り込む画面（ファイルを選ぶ。UTF-8 として読めなければ Shift_JIS として読む） */
function recordCsvDialogHtml_() {
  return '<!DOCTYPE html><html><head><base target="_top"><style>body{font-family:sans-serif;font-size:14px;margin:0 4px;line-height:1.6}' +
    'button{margin-top:12px;padding:6px 16px;font-size:14px}#msg{white-space:pre-wrap;margin-top:12px;font-size:13px}</style></head><body>' +
    '<p>「記録」シートと同じ列のCSVを選んでください。1行目は見出し（' + publicEscape(RECORD_HEADER.slice(0, 8).join(',')) + '）。' +
    '「出どころ」の列はなくてよく、「取り込み」になります。文字コードは UTF-8・Shift_JIS のどちらでもよい。</p>' +
    '<input type="file" id="f" accept=".csv,text/csv,text/plain"><br><button id="b" disabled>取り込む</button><div id="msg"></div>' +
    '<script>var text="";var f=document.getElementById("f"),b=document.getElementById("b"),m=document.getElementById("msg");' +
    'f.onchange=function(){var x=f.files[0];if(!x)return;var rd=new FileReader();rd.onload=function(){var u=new Uint8Array(rd.result);' +
    'try{text=new TextDecoder("utf-8",{fatal:true}).decode(u)}catch(e){text=new TextDecoder("shift_jis").decode(u)}b.disabled=!text;m.textContent="";};rd.readAsArrayBuffer(x);};' +
    'b.onclick=function(){b.disabled=true;m.textContent="取り込んでいます…";google.script.run.withSuccessHandler(function(r){m.textContent=r.message;b.disabled=false;})' +
    '.withFailureHandler(function(e){m.textContent="エラー："+e.message;b.disabled=false;}).recordImportCsvText(text);};</script></body></html>';
}

/**
 * 賞のCSVの中身を取り込む（賞のCSVを取り込むの画面から呼ぶ）。prize：どの賞か（「賞」シートから選ぶか、新しい名前）。結果の文を返す
 */
function recordImportPrizeCsvText(text, prize) {
  const no = publicOwnerProblem_('賞のCSVを取り込む');
  if (no) return { ok: false, message: no };
  recordEnsureSheets_();
  const ps = recordSheet_(RECORD_SHEET_PRIZES, RECORD_PRIZE_HEADER);
  const rows = recordBody_(ps, RECORD_PRIZE_HEADER.length);
  const r = recordCheckPrizeCsv(text, prize, rows);
  if (r.errors.length) {
    return { ok: false, message: 'おかしい行があったので、取り込みませんでした。直してから、もう一度取り込んでください。\n' +
      r.errors.slice(0, 50).join('\n') + (r.errors.length > 50 ? '\nほか ' + (r.errors.length - 50) + ' 件' : '') };
  }
  if (!r.rows.length) return { ok: false, message: '取り込む受賞の記録がありません' };
  recordWriteBody_(ps, rows.concat(r.rows), RECORD_PRIZE_HEADER.length);
  const pk = recordSheet_(RECORD_SHEET_PRIZE_KINDS, RECORD_PRIZE_KIND_HEADER);
  const pa = recordAddPrizes(recordBody_(pk, RECORD_PRIZE_KIND_HEADER.length), [String(prize).trim()]);
  recordWriteBody_(pk, pa.rows, RECORD_PRIZE_KIND_HEADER.length);
  recordKindCheckboxes_(pk, 2);
  recordClearCache_();
  return { ok: true, message: '「' + String(prize).trim() + '」の受賞の記録を ' + r.rows.length + ' 件取り込みました。' +
    (pa.added.length ? '\n「賞」シートに「' + pa.added[0] + '」を足しました（名前がまちがっていないか確かめてください）' : '') };
}

function menuRecordImportPrizeCsv() {
  if (!recordMenuStart_('賞のCSVを取り込む')) return;
  const names = recordBody_(recordSheet_(RECORD_SHEET_PRIZE_KINDS, RECORD_PRIZE_KIND_HEADER), RECORD_PRIZE_KIND_HEADER.length)
    .map(function (r) { return String(r[0]).trim(); }).filter(String);
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(recordPrizeCsvDialogHtml_(names)).setWidth(560).setHeight(500), '賞のCSVを取り込む');
}

/** 賞のCSVを取り込む画面（賞を選ぶか新しい名前を入れ、ファイルを選ぶ。UTF-8 として読めなければ Shift_JIS として読む） */
function recordPrizeCsvDialogHtml_(names) {
  const e = publicEscape;
  return '<!DOCTYPE html><html><head><base target="_top"><style>body{font-family:sans-serif;font-size:14px;margin:0 4px;line-height:1.6}' +
    'button{margin-top:12px;padding:6px 16px;font-size:14px}select,input[type=text]{font-size:14px;padding:3px;max-width:100%}#msg{white-space:pre-wrap;margin-top:12px;font-size:13px}</style></head><body>' +
    '<p>どの賞のCSVかを選んでください。新しい賞のときは、下に賞の名前を入れます。</p>' +
    '<select id="s"><option value="">（新しい賞）</option>' + names.map(function (n) { return '<option>' + e(n) + '</option>'; }).join('') + '</select><br>' +
    '<input type="text" id="n" placeholder="新しい賞の名前" style="width:300px;margin-top:6px">' +
    '<p>1行目は見出し（' + e(RECORD_PRIZE_CSV_HEADER.join(',')) + '）。文字コードは UTF-8・Shift_JIS のどちらでもよい。</p>' +
    '<input type="file" id="f" accept=".csv,text/csv,text/plain"><br><button id="b" disabled>取り込む</button><div id="msg"></div>' +
    '<script>var text="";var f=document.getElementById("f"),b=document.getElementById("b"),m=document.getElementById("msg"),s=document.getElementById("s"),n=document.getElementById("n");' +
    'n.style.display=s.value?"none":"";s.onchange=function(){n.style.display=s.value?"none":"";};' +
    'f.onchange=function(){var x=f.files[0];if(!x)return;var rd=new FileReader();rd.onload=function(){var u=new Uint8Array(rd.result);' +
    'try{text=new TextDecoder("utf-8",{fatal:true}).decode(u)}catch(e){text=new TextDecoder("shift_jis").decode(u)}b.disabled=!text;m.textContent="";};rd.readAsArrayBuffer(x);};' +
    'b.onclick=function(){var p=s.value||n.value.trim();if(!p){m.textContent="賞を選ぶか、新しい賞の名前を入れてください";return;}b.disabled=true;m.textContent="取り込んでいます…";' +
    'google.script.run.withSuccessHandler(function(r){m.textContent=r.message;b.disabled=false;})' +
    '.withFailureHandler(function(e){m.textContent="エラー："+e.message;b.disabled=false;}).recordImportPrizeCsvText(text,p);};</script></body></html>';
}

function menuRecordCheck() {
  if (!recordMenuStart_('記録を確かめる')) return;
  const rows = recordBody_(recordSheet_(RECORD_SHEET_RECORDS, RECORD_HEADER), RECORD_HEADER.length);
  const kinds = recordBody_(recordSheet_(RECORD_SHEET_KINDS, RECORD_KIND_HEADER), RECORD_KIND_HEADER.length);
  const prizes = recordBody_(recordSheet_(RECORD_SHEET_PRIZES, RECORD_PRIZE_HEADER), RECORD_PRIZE_HEADER.length);
  const prizeKinds = recordBody_(recordSheet_(RECORD_SHEET_PRIZE_KINDS, RECORD_PRIZE_KIND_HEADER), RECORD_PRIZE_KIND_HEADER.length);
  const p = recordCheckRows(rows, kinds).concat(recordCheckPrizeRows(prizes, prizeKinds));
  SpreadsheetApp.getUi().alert(p.length ? '「記録」「賞の記録」シートに、確かめてほしい所が ' + p.length + ' 件あります。\n' + p.slice(0, 50).join('\n') +
    (p.length > 50 ? '\nほか ' + (p.length - 50) + ' 件' : '') : '「記録」シートの ' + rows.length + ' 件の記録と、「賞の記録」シートの ' + prizes.length + ' 件の受賞に、おかしい所はありませんでした。');
}

/** ページ。戻り値 {html, title} */
function recordPage_() {
  try {
    const cache = CacheService.getScriptCache();
    const hit = cache.get(RECORD_CACHE_KEY);
    if (hit) return JSON.parse(hit);
    const d = recordPageData({
      rows: recordBody_(recordSheet_(RECORD_SHEET_RECORDS, RECORD_HEADER), RECORD_HEADER.length),
      kindRows: recordBody_(recordSheet_(RECORD_SHEET_KINDS, RECORD_KIND_HEADER), RECORD_KIND_HEADER.length),
      revisions: recordBody_(recordSheet_(RECORD_SHEET_REVISIONS, RECORD_REVISION_HEADER), RECORD_REVISION_HEADER.length),
      settings: recordSettings_(),
      prizeRows: recordReadIfAny_(RECORD_SHEET_PRIZES, RECORD_PRIZE_HEADER.length),
      prizeKinds: recordReadIfAny_(RECORD_SHEET_PRIZE_KINDS, RECORD_PRIZE_KIND_HEADER.length)
    });
    const out = { title: recordPageTitle(d), html: buildRecordPageHtml(d) };
    try { cache.put(RECORD_CACHE_KEY, JSON.stringify(out), RECORD_CACHE_SECONDS); } catch (err) { /* 大きすぎて覚えられないときは、毎回作る */ }
    return out;
  } catch (err) {
    console.error(err && err.stack || err); // くわしい理由は、Apps Script の「実行数」で見る（ページには出さない）
    return { title: 'コンテストレコード', html: buildPublicErrorHtml('ただいま表示できません。しばらくしてから、もう一度開いてください。', [], '', '', 'コンテストレコード'),
      error: String(err && err.message || err) };
  }
}

/** シートがあれば中身（見出しの行を除く）、なければ空（ページを開いただけでは、シートを作らない） */
function recordReadIfAny_(name, width) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  return sh ? recordBody_(sh, width) : [];
}

/** このページのアドレス（審査のファイルの「基本設定」の「レコードのページのURL」を先に使う。No.133）。pub：受付ページのスプレッドシート（なければ「設定」から開く） */
function recordKnownUrl_(pub) {
  if (!pub) {
    try { pub = SpreadsheetApp.openById(recordFileId_(recordSettings_()[RECORD_PUBLIC_LABEL])); } catch (err) { pub = null; }
  }
  return publicPageUrl_(pub, RECORD_PAGE_URL_LABEL, recordServiceUrl_(), function (id) { return SpreadsheetApp.openById(id); });
}

function recordServiceUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (err) { return ''; }
}

function menuRecordPreview() {
  if (!recordMenuStart_('表示を確かめる')) return;
  const ui = SpreadsheetApp.getUi();
  recordClearCache_();
  const p = recordPage_();
  if (p.error) { ui.alert('表示できませんでした：' + p.error); return; }
  const url = recordKnownUrl_(null).url;
  ui.showModalDialog(HtmlService.createHtmlOutput(p.html + '<p style="font-size:12px;color:#666;padding:0 16px">' +
    (url ? 'コンテストレコードのページのURL：' + publicEscape(url) : 'まだウェブアプリとして公開していません') + '</p>').setWidth(760).setHeight(560), p.title);
}

function recordClearCache_() {
  CacheService.getScriptCache().remove(RECORD_CACHE_KEY);
}

/** メニュー「埋め込み用のHTMLを出す」（持ち主だけ。申し送り No.123） */
function menuRecordEmbed() {
  if (!recordMenuStart_('埋め込み用のHTMLを出す')) return;
  const ui = SpreadsheetApp.getUi(), u = recordKnownUrl_(null); // 「基本設定」の「レコードのページのURL」を先に使う（No.133）
  if (!u.url) { ui.alert('まだウェブアプリとして公開（デプロイ）していません。Apps Script の画面で「デプロイ」→「新しいデプロイ」で公開してから、もう一度実行してください。'); return; }
  ui.showModalDialog(HtmlService.createHtmlOutput(publicEmbedDialogHtml([{ name: 'コンテストレコードのページ', url: u.url }], u.auto ? PUBLIC_URL_CHECK_NOTE : ''))
    .setWidth(640).setHeight(400), '埋め込み用のHTML');
}

function menuRecordClearCache() {
  if (!recordMenuStart_('すぐに新しい内容にする')) return;
  recordClearCache_();
  SpreadsheetApp.getUi().alert('覚えていた表示を消しました。次に開いたときから、新しい内容になります。');
}
