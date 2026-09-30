/* iSHUATI KU-EPT — 前端
   导览只有三个 Part。考点／内容领域／题型都只当标签，不当导览轴。
   每次进入都重新洗牌：Part I 洗题目顺序，三个 Part 都洗选项顺序。 */
(function () {
"use strict";

var B = window.BANK;
var app = document.getElementById("app");
var topTitle = document.getElementById("topTitle");
var topSub = document.getElementById("topSub");
var backBtn = document.getElementById("backBtn");
var themeBtn = document.getElementById("themeBtn");
var pfill = document.getElementById("progressfill");

/* ---------- 小工具 ---------- */
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
/* 首页进度：2509 题要做满 13 题才会四舍五入到 1%，做了几题却显示 0% 会让人以为没记到。
   有做就至少显示「<1%」，进度条也至少露出一点。 */
function pctLabel(n, d) { var p = pct(n, d); return n && !p ? "<1%" : p + "%"; }
function barPct(n, d) { return n ? Math.max(pct(n, d), 1) : 0; }

/* 把题库的自订标记转成 HTML。题库本身不写 HTML，一律在这里渲染。
   Part I 的空格是 [[BLANK]]、Part II 是带编号的 [[BLANK:3]]，两种都要接——
   错题本会把 Part II 的题目跟 Part I 混在同一个串流里出，
   只认一种的话带编号的那种就会原封不动印出来给学生看。 */
function markup(t) {
  return esc(t)
    .replace(/\[\[BLANK(?::\d+)?\]\]/g, '<span class="blank"></span>')
    .replace(/\*\*(NOT|EXCEPT)\*\*/g, "<strong>$1</strong>");
}

/* ---------- 帐号与云端同步 ----------
   后端是 gas/Code.gs（Google Apps Script ＋ 试算表）。API 留空＝不启用登录，
   网站退回纯本机模式，纪录只存在这个浏览器里。
   登录后本机仍是主要储存（离线照样能做题），每次作答后延迟几秒推一份到云端；
   换设备登录时从云端拉回来。本机纪录按帐号分开存，同一台设备换人登录不会串。 */
var API = "https://script.google.com/macros/s/AKfycbwJwL9Wkao1q0IOdPEg7OX1HcQPMMFQ8t8qQ4QL3Hmr4rip6P5ePQi63S7DBuzY7aHYfw/exec";
var AUTH_KEY = "kuept.auth";
var AUTH = null;
try { AUTH = JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) {}
if (!API) AUTH = null;

function api(action, body) {
  body = body || {};
  body.a = action;
  // text/plain 是「简单请求」，不会触发 CORS 预检，Apps Script 才接得住
  return fetch(API, { method: "POST", body: JSON.stringify(body) })
    .then(function (r) { return r.json(); });
}
function emptyData() { return { seen: {}, wrong: {}, dstat: {}, done: { p2: {}, p3: {} } }; }
function dataKey() { return AUTH ? "kuept.v1:" + AUTH.u : "kuept.v1"; }
function dirtyKey() { return "kuept.dirty:" + (AUTH ? AUTH.u : ""); }
function isDirty() { try { return !!localStorage.getItem(dirtyKey()); } catch (e) { return false; } }
function setDirty(on) {
  try { on ? localStorage.setItem(dirtyKey(), "1") : localStorage.removeItem(dirtyKey()); } catch (e) {}
}

/* 两份纪录取联集。做题次数取较大值而不是相加——同一份纪录同步来回
   好几次，相加会越加越多；取大值怎么合并都是同一个结果。 */
function mergeMax(a, b) {
  var o = emptyData();
  [a, b].forEach(function (d) {
    if (!d) return;
    Object.keys(d.seen || {}).forEach(function (k) {
      var x = o.seen[k] || { n: 0, c: 0 }, y = d.seen[k];
      o.seen[k] = { n: Math.max(x.n, y.n || 0), c: Math.max(x.c, y.c || 0) };
    });
    Object.keys(d.dstat || {}).forEach(function (k) {
      o.dstat[k] = Math.max(o.dstat[k] || 0, d.dstat[k]);
    });
  });
  return o;
}

var pushTimer = null;
var lastSync = 0;
function schedulePush() {
  if (!AUTH) return;
  setDirty(true);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 3000);
}
function push() {
  if (!AUTH) return Promise.resolve();
  clearTimeout(pushTimer);
  var who = AUTH.u;
  return api("push", { token: AUTH.token, data: S }).then(function (r) {
    if (!AUTH || AUTH.u !== who) return;
    if (r.ok) { setDirty(false); lastSync = r.t || Date.now(); }
    else if (r.err === "bad_token") expired();
  }).catch(function () {});        // 离线：留着 dirty 标记，下次打开再推
}
/* 关掉分页或切到别的 App 时，把还没推的那几秒补推出去 */
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden" && AUTH && isDirty() && navigator.sendBeacon) {
    try { localStorage.setItem(dataKey(), JSON.stringify(S)); } catch (e) {}
    navigator.sendBeacon(API, JSON.stringify({ a: "push", token: AUTH.token, data: S }));
  }
});

/* 打开网页时跟云端对一次：本机有没推上去的就合并后推，否则以云端为准 */
function pull() {
  if (!AUTH) return;
  var who = AUTH.u;
  api("pull", { token: AUTH.token }).then(function (r) {
    if (!AUTH || AUTH.u !== who) return;
    if (!r.ok) { if (r.err === "bad_token") expired(); return; }
    if (isDirty()) {
      var local = S;
      S = mergeMax(r.data, local);
      S.wrong = local.wrong;          // 错题本以本机最新的作答为准
      save();
      push();
    } else if (r.data) {
      S = r.data;
      save(true);
      lastSync = r.t || 0;
    }
    var h = location.hash.replace(/^#\/?/, "");
    if (h === "" || h === "stats") route();   // 答题中不打断，只刷新首页与学习记录
  }).catch(function () {});
}

function expired() {
  logout(true);
  alert("登录已失效（可能是密码被重设了），请重新登录。");
}
function logout(skipPush) {
  var done = function () {
    AUTH = null;
    try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
    S = load();
    go("#/");
    route();
  };
  if (!skipPush && isDirty()) push().then(done); else done();
}

/* ---------- 进度（localStorage） ---------- */
var S = load();
function load() {
  try {
    var raw = localStorage.getItem(dataKey());
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return emptyData();
}
var saveTimer = null;
function save(localOnly) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(dataKey(), JSON.stringify(S)); } catch (e) {}
  }, 200);
  if (!localOnly) schedulePush();
}
function record(item, ok, dtype) {
  var r = S.seen[item.i] || { n: 0, c: 0 };
  r.n++; if (ok) r.c++;
  S.seen[item.i] = r;
  if (ok) {
    if (S.wrong[item.i] !== undefined) {
      S.wrong[item.i]--;
      if (S.wrong[item.i] <= 0) delete S.wrong[item.i];
    }
  } else {
    S.wrong[item.i] = 2;                       // 答对两次才移出错题本
    if (dtype) S.dstat[dtype] = (S.dstat[dtype] || 0) + 1;
  }
  save();
}
function seenCount(list) {
  var n = 0;
  for (var i = 0; i < list.length; i++) if (S.seen[list[i].i]) n++;
  return n;
}

/* 全部题目的索引：错题本要用 id 反查题目 */
var INDEX = {};
(function buildIndex() {
  B.p1.forEach(function (it) { INDEX[it.i] = { it: it, part: "p1" }; });
  B.p2.forEach(function (p) { p.items.forEach(function (it) { INDEX[it.i] = { it: it, part: "p2", pack: p }; }); });
  B.p3.forEach(function (p) { p.items.forEach(function (it) { INDEX[it.i] = { it: it, part: "p3", pack: p }; }); });
})();
var P2_TOTAL = B.p2.reduce(function (n, p) { return n + p.items.length; }, 0);
var P3_TOTAL = B.p3.reduce(function (n, p) { return n + p.items.length; }, 0);

/* ---------- 主题 ---------- */
(function theme() {
  var t = null;
  try { t = localStorage.getItem("kuept.theme"); } catch (e) {}
  if (t) document.documentElement.setAttribute("data-theme", t);
  themeBtn.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var dark = cur ? cur === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("kuept.theme", next); } catch (e) {}
  });
})();

/* ---------- 路由 ---------- */
function go(hash) { location.hash = hash; }
backBtn.addEventListener("click", function () { go("#/"); });
window.addEventListener("hashchange", route);

function setTop(title, sub, showBack) {
  topTitle.textContent = title;
  topSub.textContent = sub || "";
  backBtn.hidden = !showBack;
}
function setProgress(p) { pfill.style.width = (p || 0) + "%"; }

function route() {
  var h = location.hash.replace(/^#\/?/, "") || "";
  window.scrollTo(0, 0);
  setProgress(0);
  bar(null);          // 底部动作条挂在 body 上，换页时要自己收掉，
                      // 否则从答题页回首页会留下一颗还能按的「跳过」。
  if (API && !AUTH) return viewLogin();
  if (h === "admin" && AUTH && AUTH.role === "admin") return viewAdmin();
  if (h === "p1") return viewP1();
  if (h === "p2") return viewP2();
  if (h === "p3") return viewP3();
  if (h === "review") return viewReview();
  if (h === "stats") return viewStats();
  return viewHome();
}

/* ---------- 首页 ---------- */
function viewHome() {
  setTop("iSHUATI KU-EPT 练习题库", "", false);
  var p1n = seenCount(B.p1);
  var p2n = 0, p3n = 0;
  B.p2.forEach(function (p) { p2n += seenCount(p.items); });
  B.p3.forEach(function (p) { p3n += seenCount(p.items); });
  var wrongN = Object.keys(S.wrong).length;

  /* 每张卡的几何字符：形状本身就是那个 Part 的结构缩影。
     Part I  一条线加一个缺口 —— 一句话挖一个空
     Part II 一段网格，几格是空的 —— 一篇文章挖八个空
     Part III 长短不一的横条 —— 一篇一篇的段落
     用 currentColor 上色，深浅色主题自动跟着走。 */
  var GLYPH = {
    p1: '<svg viewBox="0 0 44 44" aria-hidden="true">' +
        '<rect x="4" y="19" width="13" height="6" rx="1.5"/>' +
        '<rect x="21" y="19" width="8" height="6" rx="1.5" class="gh"/>' +
        '<rect x="33" y="19" width="7" height="6" rx="1.5"/></svg>',
    p2: '<svg viewBox="0 0 44 44" aria-hidden="true">' +
        '<rect x="5" y="10" width="12" height="5" rx="1.5"/>' +
        '<rect x="20" y="10" width="8" height="5" rx="1.5" class="gh"/>' +
        '<rect x="31" y="10" width="8" height="5" rx="1.5"/>' +
        '<rect x="5" y="19.5" width="8" height="5" rx="1.5" class="gh"/>' +
        '<rect x="16" y="19.5" width="12" height="5" rx="1.5"/>' +
        '<rect x="31" y="19.5" width="8" height="5" rx="1.5"/>' +
        '<rect x="5" y="29" width="10" height="5" rx="1.5"/>' +
        '<rect x="18" y="29" width="8" height="5" rx="1.5" class="gh"/>' +
        '<rect x="29" y="29" width="10" height="5" rx="1.5"/></svg>',
    p3: '<svg viewBox="0 0 44 44" aria-hidden="true">' +
        '<rect x="5" y="8" width="34" height="4" rx="2"/>' +
        '<rect x="5" y="16" width="26" height="4" rx="2" class="gh"/>' +
        '<rect x="5" y="24" width="34" height="4" rx="2"/>' +
        '<rect x="5" y="32" width="18" height="4" rx="2" class="gh"/></svg>'
  };

  var cards = [
    { h: "#/p1", no: "Part I", zh: "句子填空", en: "Sentence Completion", g: GLYPH.p1,
      d: "一句一题，考语法与词汇。每题都标出考点，答完立刻看解析。",
      done: p1n, total: B.p1.length },
    { h: "#/p2", no: "Part II", zh: "完形填空", en: "Text Completion", g: GLYPH.p2,
      d: "一篇 200–250 字的文章挖 8 个空格，要靠整篇的线索作答。",
      done: p2n, total: P2_TOTAL },
    { h: "#/p3", no: "Part III", zh: "阅读理解", en: "Reading Comprehension", g: GLYPH.p3,
      d: "短文 5 题、长文 10 题，涵盖主旨、细节、指代、推论、插入句等十种题型。",
      done: p3n, total: P3_TOTAL }
  ];

  app.innerHTML =
    '<div class="hero"><span class="hero-deco" aria-hidden="true"></span>' +
    '<p class="lede">KU-EPT 全卷 80 题、三小时、全部四选一，不考听力与写作。' +
    '本题库由 AI 模拟 KU-EPT 出题逻辑生成，收录 ' +
    (B.p1.length + P2_TOTAL + P3_TOTAL).toLocaleString() + ' 题。' +
    '每次进网页都重新随机出题，答完当场看解析。' +
    '<b>祝卢鹏旗开得胜。</b></p></div>' +
    '<div class="parts">' + cards.map(function (c) {
      return '<button class="partcard" data-h="' + c.h + '" type="button">' +
        '<span class="pc-glyph">' + c.g + '</span>' +
        '<div class="pc-top"><span class="pc-no">' + c.no + '</span>' +
        '<h2>' + c.zh + '</h2><span class="pc-en">' + c.en + '</span></div>' +
        '<p>' + c.d + '</p>' +
        '<div class="pc-meta"><span>已做 <b>' + c.done + "</b> / " + c.total + ' 题</span>' +
        '<span class="bar"><i style="width:' + barPct(c.done, c.total) + '%"></i></span>' +
        '<span>' + pctLabel(c.done, c.total) + '</span></div></button>';
    }).join("") + "</div>" +
    '<div class="subrow">' +
    '<button class="subcard" data-h="#/review" type="button"><b>错题本</b>' +
    '<span>' + (wrongN ? wrongN + " 题待复习" : "目前没有错题") + '</span></button>' +
    '<button class="subcard" data-h="#/stats" type="button"><b>学习记录</b>' +
    '<span>' + (AUTH ? esc(AUTH.u) + " · 已登录" : "看错误类型分布") + '</span></button></div>' +
    (AUTH && AUTH.role === "admin"
      ? '<div class="subrow"><button class="subcard" data-h="#/admin" type="button">' +
        '<b>学生记录</b><span>看每个帐号做了多少题、错在哪里</span></button></div>'
      : "");

  app.querySelectorAll("[data-h]").forEach(function (b) {
    b.addEventListener("click", function () { go(b.dataset.h); });
  });
}

/* ---------- 选项渲染（共用） ---------- */
function renderOpts(item) {
  var opts = shuffle(item.o.slice());
  var ul = document.createElement("ul");
  ul.className = "opts";
  opts.forEach(function (o, i) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.className = "opt";
    b.type = "button";
    b.innerHTML = '<span class="mk">' + "ABCD"[i] + "</span><span>" + esc(o.t) + "</span>";
    b._o = o;
    li.appendChild(b);
    ul.appendChild(li);
  });
  return { ul: ul, opts: opts };
}

/* 作答后：把每个选项标成正解／选错／其他，并产生解析区块 */
function reveal(box, item, chosen, extra) {
  var btns = box.querySelectorAll(".opt");
  btns.forEach(function (b) {
    b.disabled = true;
    var o = b._o;
    if (o.k) b.classList.add("is-key");
    else if (o === chosen) b.classList.add("is-pick-wrong");
    else b.classList.add("is-dim");
  });
  var ok = !!chosen.k;
  var sol = document.createElement("div");
  sol.className = "sol";
  var html = '<span class="verdict ' + (ok ? "ok" : "no") + '">' +
    (ok ? "✓ 答对" : "✕ 答错") + "</span>";
  html += "<h4>为什么是这个答案</h4><p>" + esc(item.c) + "</p>";
  var wrongs = item.o.filter(function (o) { return !o.k; });
  html += "<h4>其他选项错在哪</h4><div class=\"wrongs\">" + wrongs.map(function (o) {
    return '<div class="wrong"><span class="wt">' + esc(o.t) + "</span>" +
      (o.y ? '<span class="dtype">' + esc(o.y) + "</span>" : "") +
      "<br>" + esc(o.e) + "</div>";
  }).join("") + "</div>";
  if (item.p) html += '<div class="tip">' + esc(item.p) + "</div>";
  if (extra) html += extra;
  sol.innerHTML = html;
  box.appendChild(sol);
  return sol;
}

/* ---------- Part I ---------- */
/* 没做过的题排前面（组内随机），做过的排后面、做得越少越前面。
   不然 2509 题每次整包重洗，刚做过的题马上又出现，学生会以为网站没记住。 */
function freshFirst(list) {
  var fresh = [], old = [];
  list.forEach(function (it) { (S.seen[it.i] ? old : fresh).push(it); });
  shuffle(old).sort(function (a, b) { return S.seen[a.i].n - S.seen[b.i].n; });
  return shuffle(fresh).concat(old);
}
/* Part II／III 一次一整篇：挑「没做过的格子最多」的那几篇里随机一篇 */
function pickFresh(packs) {
  var best = -1, pool = [];
  packs.forEach(function (p) {
    var left = p.items.length - seenCount(p.items);
    if (left > best) { best = left; pool = [p]; }
    else if (left === best) pool.push(p);
  });
  return pick(pool);
}

function viewP1() {
  var queue = freshFirst(B.p1);
  runStream(queue, "Part I 句子填空", "#/p1", function () {
    return "累计 " + seenCount(B.p1) + "/" + B.p1.length;
  });
}

/* 错题本也是同一个串流，只是题目来源不同。
   cum 回传顶栏的累计文字——只算这一轮的话，每次进来都从「第 1 题」开始，学生会以为网站没记住。 */
function runStream(queue, title, selfHash, cum) {
  var idx = 0, done = 0, right = 0;

  function head() {
    var sub = done ? "本次 " + done + " 题 · 正确率 " + pct(right, done) + "%" : "本次第 1 题";
    setTop(title, cum ? cum() + " · " + sub : sub);
  }

  function render() {
    if (idx >= queue.length) {
      app.innerHTML = '<div class="empty">这一轮的题目都做完了。<br>做对 ' + right + " / " + done + " 题。</div>";
      bar([{ t: "再来一轮", cls: "btn", fn: function () { route(); } },
           { t: "回首页", cls: "btn ghost", fn: function () { go("#/"); } }]);
      return;
    }
    var item = queue[idx];
    head();
    backBtn.hidden = false;
    setProgress(pct(idx, queue.length));

    var spec = item.sp ? B.specs[item.sp] : null;
    var chips = [];
    if (spec) chips.push('<span class="chip">' + esc(spec.n) + "</span>");
    if (item.rn) chips.push('<span class="chip">' + esc(item.rn) + "</span>");
    chips.push('<span class="chip alt num">' + (idx + 1) + " / " + queue.length + "</span>");

    app.innerHTML = '<div class="chips">' + chips.join("") + "</div>";
    var card = el('<div class="qcard"></div>');
    card.innerHTML = '<div class="stem">' + markup(item.s) + "</div>";

    if (item.h) {
      var hb = el('<button class="hintbtn" type="button">需要提示</button>');
      hb.addEventListener("click", function () {
        hb.replaceWith(el('<div class="hintbox">' + esc(item.h) + "</div>"));
      });
      card.appendChild(hb);
    }
    var r = renderOpts(item);
    card.appendChild(r.ul);
    app.appendChild(card);

    r.ul.addEventListener("click", function (e) {
      var b = e.target.closest(".opt");
      if (!b || b.disabled) return;
      var o = b._o;
      done++; if (o.k) right++;
      record(item, !!o.k, o.k ? null : o.y);
      head();
      backBtn.hidden = false;
      var extra = "";
      if (spec && spec.intro) {
        extra = '<details class="spec"><summary>' + esc(spec.n) + " · 考点精讲</summary>" +
          '<div class="body">' + fmtIntro(spec.intro) + "</div></details>";
      }
      reveal(card, item, o, extra);
      bar([{ t: "下一题", cls: "btn", fn: function () { idx++; render(); } }]);
      var sol = card.querySelector(".sol");
      if (sol) sol.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    bar([{ t: "跳过", cls: "btn ghost", fn: function () { idx++; render(); } }]);
  }
  render();
}

/* 题库的导读用 **粗体** 标重点 */
function fmtIntro(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/* ---------- 底部操作列 ---------- */
function bar(btns) {
  var old = document.querySelector(".actionbar");
  if (old) old.remove();
  if (!btns || !btns.length) return;
  var wrap = el('<div class="actionbar"><div class="inner"></div></div>');
  var inner = wrap.firstElementChild;
  btns.forEach(function (b) {
    var el2 = document.createElement("button");
    el2.className = b.cls;
    el2.type = "button";
    el2.textContent = b.t;
    el2.addEventListener("click", b.fn);
    inner.appendChild(el2);
  });
  document.body.appendChild(wrap);
}

/* ---------- Part II 完形填空 ---------- */
function viewP2() {
  var pack = pickFresh(B.p2);
  var answered = {};
  function top2() {
    var n = 0;
    B.p2.forEach(function (p) { n += seenCount(p.items); });
    setTop("Part II 完形填空", pack.n + " · 累计 " + n + "/" + P2_TOTAL, true);
  }
  top2();

  app.innerHTML = '<div class="chips">' +
    '<span class="chip">' + esc(pack.n) + "</span>" +
    '<span class="chip alt num">' + pack.items.length + " 格</span>" +
    '<span class="chip alt num">' + pack.wc + " words</span></div>";

  var pas = el('<div class="passage"></div>');
  pas.innerHTML = pack.paras.map(function (t, i) {
    return "<p><span class=\"pno\">" + (i + 1) + "</span>" + p2Para(t) + "</p>";
  }).join("");
  app.appendChild(pas);

  var qwrap = document.createElement("div");
  app.appendChild(qwrap);

  pack.items.forEach(function (item, i) {
    var head = el('<div class="qhead"><h3>第 ' + item.b + " 格</h3>" +
      '<span class="chip">' + esc((B.specs[item.sp] || {}).n || item.sp) + "</span></div>");
    qwrap.appendChild(head);
    var card = el('<div class="qcard" id="q' + item.b + '"></div>');
    card.innerHTML = '<div class="stem">' + markup(item.s) + "</div>";
    if (item.h) {
      var hb = el('<button class="hintbtn" type="button">需要提示</button>');
      hb.addEventListener("click", function () {
        hb.replaceWith(el('<div class="hintbox">' + esc(item.h) + "</div>"));
      });
      card.appendChild(hb);
    }
    var r = renderOpts(item);
    card.appendChild(r.ul);
    qwrap.appendChild(card);

    r.ul.addEventListener("click", function (e) {
      var b = e.target.closest(".opt");
      if (!b || b.disabled) return;
      var o = b._o;
      record(item, !!o.k, o.k ? null : o.y);
      top2();
      answered[item.b] = !!o.k;
      var slot = pas.querySelector('[data-slot="' + item.b + '"]');
      if (slot) {
        var keyText = item.o.filter(function (x) { return x.k; })[0].t;
        slot.textContent = keyText;
        slot.className = "slot " + (o.k ? "done" : "done miss");
      }
      var spec = B.specs[item.sp];
      var extra = spec && spec.intro
        ? '<details class="spec"><summary>' + esc(spec.n) + " · 考点精讲</summary>" +
          '<div class="body">' + fmtIntro(spec.intro) + "</div></details>" : "";
      reveal(card, item, o, extra);
      setProgress(pct(Object.keys(answered).length, pack.items.length));
      if (Object.keys(answered).length === pack.items.length) finish();
    });
  });

  // 点文章里的空格 → 卷到那一题
  pas.addEventListener("click", function (e) {
    var s = e.target.closest(".slot");
    if (!s) return;
    var t = document.getElementById("q" + s.dataset.slot);
    if (t) t.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  var intro = el('<details class="spec"><summary>完形填空怎么作答</summary>' +
    '<div class="body">' + fmtIntro(pack.intro) + "</div></details>");
  app.insertBefore(intro, pas);

  function finish() {
    var ok = 0;
    for (var k in answered) if (answered[k]) ok++;
    var box = el('<div class="qcard"><div class="verdict ' +
      (ok === pack.items.length ? "ok" : "no") + '">这一篇：' + ok + " / " +
      pack.items.length + " 格答对</div></div>");
    qwrap.appendChild(box);
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  bar([{ t: "换一篇", cls: "btn", fn: function () { route(); } },
       { t: "回首页", cls: "btn ghost", fn: function () { go("#/"); } }]);
}
function p2Para(t) {
  return esc(t).replace(/\[\[BLANK:(\d+)\]\]/g, function (_, n) {
    return '<span class="slot" data-slot="' + n + '">' + n + "</span>";
  });
}

/* ---------- Part III 阅读 ---------- */
function viewP3() {
  var pack = pickFresh(B.p3);
  var isLong = pack.u === "P3L";
  var answered = 0, right = 0;
  function top3() {
    var n = 0;
    B.p3.forEach(function (p) { n += seenCount(p.items); });
    setTop("Part III 阅读理解", (isLong ? "长文" : "短文") + " · " + pack.n +
      " · 累计 " + n + "/" + P3_TOTAL, true);
  }
  top3();

  app.innerHTML = '<div class="chips">' +
    '<span class="chip">' + (isLong ? "长文" : "短文") + "</span>" +
    '<span class="chip">' + esc(pack.n) + "</span>" +
    '<span class="chip alt num">' + pack.items.length + " 题</span>" +
    '<span class="chip alt num">' + pack.wc + " words</span></div>";

  var intro = el('<details class="spec"><summary>阅读题怎么作答</summary>' +
    '<div class="body">' + fmtIntro(pack.intro) + "</div></details>");
  app.appendChild(intro);

  var pas = el('<div class="passage"></div>');
  pas.innerHTML = pack.paras.map(function (t, i) {
    return "<p><span class=\"pno\">" + (i + 1) + "</span>" + p3Para(t) + "</p>";
  }).join("");
  app.appendChild(pas);

  var qwrap = document.createElement("div");
  app.appendChild(qwrap);

  pack.items.forEach(function (item, i) {
    var head = el('<div class="qhead"><h3>第 ' + (i + 1) + " 题</h3>" +
      '<span class="chip">' + esc(item.rn) + "</span></div>");
    qwrap.appendChild(head);
    var card = el('<div class="qcard"></div>');
    var stemHtml = markup(item.s);
    if (item.tp) {
      stemHtml = stemHtml.replace(/paragraph (\d+)/gi, function (m) { return "<strong>" + m + "</strong>"; });
    }
    card.innerHTML = '<div class="stem">' + stemHtml + "</div>";
    if (item.ins) {
      card.appendChild(el('<div class="insbox">' + esc(item.ins) + "</div>"));
    }
    if (item.h) {
      var hb = el('<button class="hintbtn" type="button">需要提示</button>');
      hb.addEventListener("click", function () {
        hb.replaceWith(el('<div class="hintbox">' + esc(item.h) + "</div>"));
      });
      card.appendChild(hb);
    }
    var r = renderOpts(item);
    card.appendChild(r.ul);
    qwrap.appendChild(card);

    r.ul.addEventListener("click", function (e) {
      var b = e.target.closest(".opt");
      if (!b || b.disabled) return;
      var o = b._o;
      answered++; if (o.k) right++;
      record(item, !!o.k, o.k ? null : o.y);
      top3();
      reveal(card, item, o, "");
      setProgress(pct(answered, pack.items.length));
      // 插入题：把句子放进正确的方框，让学生看到效果
      if (item.rt === "R07") {
        var keyText = item.o.filter(function (x) { return x.k; })[0].t;
        var n = (keyText.match(/(\d)/) || [])[1];
        if (n) {
          var sq = pas.querySelector('[data-sq="' + n + '"]');
          if (sq) { sq.classList.add("on"); sq.textContent = "▶"; }
        }
      }
      if (item.rt === "R08") {
        var kt = item.o.filter(function (x) { return x.k; })[0].t;
        var gap = pas.querySelector(".addgap");
        if (gap) {
          gap.classList.add("filled");
          gap.innerHTML = '<span class="fillin">' + esc(kt) + "</span>";
        }
      }
      if (answered === pack.items.length) {
        var box = el('<div class="qcard"><div class="verdict ' +
          (right === pack.items.length ? "ok" : "no") + '">这一篇：' + right + " / " +
          pack.items.length + " 题答对</div></div>");
        qwrap.appendChild(box);
      }
    });
  });

  bar([{ t: "换一篇", cls: "btn", fn: function () { route(); } },
       { t: "回首页", cls: "btn ghost", fn: function () { go("#/"); } }]);
}
function p3Para(t) {
  return esc(t)
    .replace(/\[\[HL\]\]([\s\S]*?)\[\[\/HL\]\]/g, '<mark class="hl">$1</mark>')
    .replace(/\[\[SQ:([1-4])\]\]/g, '<span class="sq" data-sq="$1">$1</span>')
    .replace(/\[\[ADD\]\]/g, '<span class="addgap">此处可补一句</span>');
}

/* ---------- 错题本 ---------- */
function viewReview() {
  var ids = Object.keys(S.wrong);
  if (!ids.length) {
    setTop("错题本", "", true);
    app.innerHTML = '<div class="empty">目前没有错题。<br>答错的题目会自动收进来，答对两次就移出。</div>';
    bar([{ t: "回首页", cls: "btn ghost", fn: function () { go("#/"); } }]);
    return;
  }
  var items = ids.map(function (id) { return INDEX[id] && INDEX[id].it; })
                 .filter(Boolean);
  runStream(shuffle(items), "错题本", "#/review");
}

/* ---------- 登录 ---------- */
function viewLogin() {
  setTop("iSHUATI KU-EPT 练习题库", "", false);
  app.innerHTML =
    '<form class="login" id="loginForm" autocomplete="on">' +
    '<h2>登录</h2>' +
    '<p>登录后，做题记录与错题本会存到云端，换手机或换电脑登录同一个帐号都找得回来。</p>' +
    '<label>帐号<input name="u" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>' +
    '<label>密码<input name="p" type="password" autocomplete="current-password" required></label>' +
    '<div class="loginerr" id="loginErr" role="alert"></div>' +
    '<button class="btn" type="submit" id="loginBtn">登录</button>' +
    '<p class="loginnote">帐号由老师发给你。忘记密码请找老师重设。</p></form>';

  var f = document.getElementById("loginForm");
  var err = document.getElementById("loginErr");
  var btn = document.getElementById("loginBtn");
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    btn.disabled = true;
    btn.textContent = "登录中…";
    api("login", { u: f.u.value, p: f.p.value }).then(function (r) {
      if (!r.ok) {
        err.textContent = r.err === "locked"
          ? "密码错太多次，请 10 分钟后再试。"
          : "帐号或密码不对。";
        return;
      }
      AUTH = { u: r.u, role: r.role, token: r.token };
      try { localStorage.setItem(AUTH_KEY, JSON.stringify(AUTH)); } catch (e2) {}
      // 本机这个帐号的旧纪录 ＋ 云端纪录
      var local = load();
      S = mergeMax(r.data, local);
      S.wrong = (r.data && r.data.wrong) || local.wrong || {};
      Object.keys(local.wrong || {}).forEach(function (k) { S.wrong[k] = local.wrong[k]; });
      // 还没登录前在这台设备上做的题，问要不要并进帐号（只问一次）
      var anon = null;
      try { anon = JSON.parse(localStorage.getItem("kuept.v1")); } catch (e3) {}
      var asked = false;
      try { asked = !!localStorage.getItem("kuept.migrated"); } catch (e4) {}
      var anonN = anon && anon.seen ? Object.keys(anon.seen).length : 0;
      if (anonN && !asked) {
        if (confirm("这台设备上有 " + anonN + " 题是登录前做的，要并进「" + r.u + "」这个帐号吗？")) {
          var w = S.wrong;
          S = mergeMax(S, anon);
          S.wrong = w;
          Object.keys(anon.wrong || {}).forEach(function (k) { S.wrong[k] = Math.max(S.wrong[k] || 0, anon.wrong[k]); });
        }
        try { localStorage.setItem("kuept.migrated", "1"); } catch (e5) {}
      }
      save();
      push();
      go("#/");
      route();
    }).catch(function () {
      err.textContent = "连不上服务器，请检查网络后再试。";
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "登录";
    });
  });
}

/* ---------- 学生记录（管理员） ---------- */
function summarize(d) {
  d = d || emptyData();
  var o = { total: 0, tries: 0, correct: 0, p1: 0, p2: 0, p3: 0, wrong: Object.keys(d.wrong || {}).length, top: "" };
  Object.keys(d.seen || {}).forEach(function (k) {
    var s = d.seen[k];
    o.total++; o.tries += s.n || 0; o.correct += s.c || 0;
    var x = INDEX[k];
    if (x) o[x.part]++;
  });
  var ds = Object.keys(d.dstat || {}).sort(function (a, b) { return d.dstat[b] - d.dstat[a]; });
  if (ds.length) o.top = ds[0] + "（" + d.dstat[ds[0]] + "）";
  return o;
}
function fmtTime(t) {
  if (!t) return "—";
  var d = new Date(t), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function viewAdmin() {
  setTop("学生记录", "", true);
  app.innerHTML = '<div class="empty">读取中…</div>';
  bar([{ t: "重新整理", cls: "btn ghost", fn: function () { route(); } },
       { t: "回首页", cls: "btn ghost", fn: function () { go("#/"); } }]);
  api("admin", { token: AUTH.token }).then(function (r) {
    if (location.hash !== "#/admin") return;
    if (!r.ok) {
      if (r.err === "bad_token") return expired();
      app.innerHTML = '<div class="empty">读取失败（' + esc(r.err) + '）。</div>';
      return;
    }
    if (!r.users.length) { app.innerHTML = '<div class="empty">还没有任何帐号。</div>'; return; }
    app.innerHTML = r.users.map(function (x) {
      var s = summarize(x.data);
      return '<div class="qcard acct">' +
        '<div class="acct-h"><b>' + esc(x.u) + '</b>' +
        '<span class="chip' + (x.role === "admin" ? "" : " alt") + '">' + (x.role === "admin" ? "管理员" : "学生") + '</span>' +
        '<span class="acct-t">最后同步 ' + fmtTime(x.t) + '</span></div>' +
        '<div class="stat">' +
        '<div class="statbox"><b>' + s.tries + '</b><span>作答次数</span></div>' +
        '<div class="statbox"><b>' + s.total + '</b><span>做过的题数</span></div>' +
        '<div class="statbox"><b>' + pct(s.correct, s.tries) + '%</b><span>正确率</span></div>' +
        '<div class="statbox"><b>' + s.wrong + '</b><span>待复习</span></div></div>' +
        '<div class="acct-d">Part I ' + s.p1 + ' / ' + B.p1.length +
        ' · Part II ' + s.p2 + ' / ' + P2_TOTAL +
        ' · Part III ' + s.p3 + ' / ' + P3_TOTAL + '</div>' +
        '<div class="acct-d">最常犯的错误类型：' + (s.top ? esc(s.top) : "—") + '</div></div>';
    }).join("");
  }).catch(function () {
    app.innerHTML = '<div class="empty">连不上服务器，请检查网络后再试。</div>';
  });
}

/* ---------- 学习记录 ---------- */
function viewStats() {
  setTop("学习记录", "", true);
  var total = 0, correct = 0, tries = 0;
  for (var k in S.seen) { total++; tries += S.seen[k].n; correct += S.seen[k].c; }
  var wrongN = Object.keys(S.wrong).length;

  var ds = Object.keys(S.dstat).map(function (k) { return [k, S.dstat[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
  var max = ds.length ? ds[0][1] : 0;

  var html = '<div class="stat">' +
    '<div class="statbox"><b>' + tries + "</b><span>作答次数</span></div>" +
    '<div class="statbox"><b>' + total + "</b><span>做过的题数</span></div>" +
    '<div class="statbox"><b>' + pct(correct, tries) + "%</b><span>正确率</span></div>" +
    '<div class="statbox"><b>' + wrongN + "</b><span>待复习</span></div></div>";

  html += '<div class="sectitle">最常犯的错误类型</div>';
  if (!ds.length) {
    html += '<div class="empty">还没有数据。答错时系统会记下你选的是哪一类干扰项。</div>';
  } else {
    html += '<div class="dbars">' + ds.map(function (d) {
      return '<div class="dbar"><span class="dn">' + esc(d[0]) + "</span>" +
        '<span class="dt"><i style="width:' + pct(d[1], max) + '%"></i></span>' +
        '<span class="dv">' + d[1] + "</span></div>";
    }).join("") + "</div>" +
    '<div class="tip" style="margin-top:14px">干扰项类型说明你“为什么会被骗”：' +
    '母语干扰是中文或泰语的直译，过度类推是把规则用到例外上，近义混淆是意思相近但搭配不合，' +
    '部分正确是只对了一半，表面词汇是选项抄了文章的字但语义不符。' +
    '哪一类最高，就往那个方向补。</div>';
  }

  if (AUTH) {
    html += '<div class="sectitle">帐号</div>' +
      '<div class="tip" style="margin-bottom:12px">目前登录：<b>' + esc(AUTH.u) + '</b>。' +
      '记录会自动存到云端，换设备登录同一个帐号就找得回来。<br>' +
      '<span id="syncState">' + (isDirty() ? "有几题还没同步，连上网络后会自动补上。"
        : lastSync ? "最后同步：" + fmtTime(lastSync) : "已同步。") + '</span></div>' +
      '<button class="btn ghost" id="logoutBtn" type="button" style="flex:none;width:100%;margin-bottom:20px">退出登录</button>';
  }

  html += '<div class="sectitle">备份与搬移</div>' +
    '<div class="tip" style="margin-bottom:12px">' + (AUTH
      ? '已登录时不需要手动搬移。导出只是多留一份备份档。'
      : '记录存在这个浏览器里，关掉再打开都还在。' +
        '但它<b>不会跟着你换设备</b>——手机与电脑是分开的，' +
        '网址改变时（例如从本机文档换成网站）也会各自独立。要搬移就用下面的导出与导入。') + '</div>' +
    '<div style="display:flex;gap:10px;margin-bottom:20px">' +
    '<button class="btn ghost" id="expBtn" type="button">导出记录</button>' +
    '<button class="btn ghost" id="impBtn" type="button">导入记录</button></div>' +
    '<input type="file" id="impFile" accept="application/json,.json" hidden>' +
    '<div class="sectitle">重设</div>' +
    '<button class="btn ghost" id="resetBtn" type="button" style="flex:none;width:100%">清除所有学习记录</button>';

  app.innerHTML = html;

  var lo = document.getElementById("logoutBtn");
  if (lo) lo.addEventListener("click", function () {
    if (confirm("确定要退出登录吗？记录已存在云端，下次登录会回来。")) logout();
  });

  document.getElementById("expBtn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(S)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "iSHUATI-KU-EPT-记录-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  var impFile = document.getElementById("impFile");
  document.getElementById("impBtn").addEventListener("click", function () { impFile.click(); });
  impFile.addEventListener("change", function () {
    var f = impFile.files && impFile.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      var d;
      try { d = JSON.parse(fr.result); } catch (e) {
        alert("这个文档不是有效的记录档，请选择之前用“导出记录”存下来的 .json。");
        return;
      }
      if (!d || typeof d.seen !== "object") {
        alert("这个文档不是 KU-EPT 的记录档。");
        return;
      }
      // 合并，不覆盖：两边的做题次数相加，错题本取联集
      Object.keys(d.seen || {}).forEach(function (k) {
        var a = S.seen[k] || { n: 0, c: 0 }, b = d.seen[k];
        S.seen[k] = { n: a.n + (b.n || 0), c: a.c + (b.c || 0) };
      });
      Object.keys(d.wrong || {}).forEach(function (k) {
        S.wrong[k] = Math.max(S.wrong[k] || 0, d.wrong[k]);
      });
      Object.keys(d.dstat || {}).forEach(function (k) {
        S.dstat[k] = (S.dstat[k] || 0) + d.dstat[k];
      });
      save();
      impFile.value = "";
      alert("记录已合并导入。");
      viewStats();
    };
    fr.readAsText(f);
  });

  document.getElementById("resetBtn").addEventListener("click", function () {
    if (!confirm("确定要清除所有做题记录与错题本吗？" + (AUTH ? "云端的记录也会一起清除，" : "") + "这个动作无法复原。")) return;
    S = emptyData();
    save();
    viewStats();
  });
  bar([{ t: "回首页", cls: "btn ghost", fn: function () { go("#/"); } }]);
}

/* ---------- 键盘（桌机顺手用） ---------- */
document.addEventListener("keydown", function (e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  var n = "1234".indexOf(e.key);
  if (n >= 0) {
    var opts = document.querySelectorAll(".qcard .opt:not([disabled])");
    if (opts[n]) { opts[n].click(); e.preventDefault(); }
  } else if (e.key === "Enter") {
    var b = document.querySelector(".actionbar .btn");
    if (b) { b.click(); e.preventDefault(); }
  }
});

route();
if (AUTH) {
  if (isDirty()) push().then(pull); else pull();
}
})();
