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

/* 把题库的自订标记转成 HTML。题库本身不写 HTML，一律在这里渲染。
   Part I 的空格是 [[BLANK]]、Part II 是带编号的 [[BLANK:3]]，两种都要接——
   错题本会把 Part II 的题目跟 Part I 混在同一个串流里出，
   只认一种的话带编号的那种就会原封不动印出来给学生看。 */
function markup(t) {
  return esc(t)
    .replace(/\[\[BLANK(?::\d+)?\]\]/g, '<span class="blank"></span>')
    .replace(/\*\*(NOT|EXCEPT)\*\*/g, "<strong>$1</strong>");
}

/* ---------- 进度（localStorage） ---------- */
var KEY = "kuept.v1";
var S = load();
function load() {
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { seen: {}, wrong: {}, dstat: {}, done: { p2: {}, p3: {} } };
}
var saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }, 200);
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
        '<div class="pc-meta"><span>' + c.done + " / " + c.total + '</span>' +
        '<span class="bar"><i style="width:' + pct(c.done, c.total) + '%"></i></span>' +
        '<span>' + pct(c.done, c.total) + '%</span></div></button>';
    }).join("") + "</div>" +
    '<div class="subrow">' +
    '<button class="subcard" data-h="#/review" type="button"><b>错题本</b>' +
    '<span>' + (wrongN ? wrongN + " 题待复习" : "目前没有错题") + '</span></button>' +
    '<button class="subcard" data-h="#/stats" type="button"><b>学习记录</b>' +
    '<span>看错误类型分布</span></button></div>';

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
function viewP1() {
  var queue = shuffle(B.p1.slice());
  runStream(queue, "Part I 句子填空", "#/p1");
}

/* 错题本也是同一个串流，只是题目来源不同 */
function runStream(queue, title, selfHash) {
  var idx = 0, done = 0, right = 0;

  function render() {
    if (idx >= queue.length) {
      app.innerHTML = '<div class="empty">这一轮的题目都做完了。<br>做对 ' + right + " / " + done + " 题。</div>";
      bar([{ t: "再来一轮", cls: "btn", fn: function () { route(); } },
           { t: "回首页", cls: "btn ghost", fn: function () { go("#/"); } }]);
      return;
    }
    var item = queue[idx];
    setTop(title, done ? "已做 " + done + " 题 · 正确率 " + pct(right, done) + "%" : "第 1 题");
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
  var pack = pick(B.p2);
  var answered = {};
  setTop("Part II 完形填空", pack.n + " · " + pack.wc + " words", true);

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
  var pack = pick(B.p3);
  var isLong = pack.u === "P3L";
  var answered = 0, right = 0;
  setTop("Part III 阅读理解", (isLong ? "长文" : "短文") + " · " + pack.n + " · " + pack.wc + " words", true);

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

  html += '<div class="sectitle">备份与搬移</div>' +
    '<div class="tip" style="margin-bottom:12px">记录存在这个浏览器里，关掉再打开都还在。' +
    '但它<b>不会跟着你换设备</b>——手机与电脑是分开的，' +
    '网址改变时（例如从本机文档换成网站）也会各自独立。要搬移就用下面的导出与导入。</div>' +
    '<div style="display:flex;gap:10px;margin-bottom:20px">' +
    '<button class="btn ghost" id="expBtn" type="button">导出记录</button>' +
    '<button class="btn ghost" id="impBtn" type="button">导入记录</button></div>' +
    '<input type="file" id="impFile" accept="application/json,.json" hidden>' +
    '<div class="sectitle">重设</div>' +
    '<button class="btn ghost" id="resetBtn" type="button" style="flex:none;width:100%">清除所有学习记录</button>';

  app.innerHTML = html;

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
    if (!confirm("确定要清除所有做题记录与错题本吗？这个动作无法复原。")) return;
    S = { seen: {}, wrong: {}, dstat: {}, done: { p2: {}, p3: {} } };
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
})();
