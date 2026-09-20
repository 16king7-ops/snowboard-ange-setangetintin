// バインディング・セッティング可視化。setup-data.js の後に読み込む。
// 座標: x = 板の長さ方向(mm, 板の中心0, ノーズ+) / y = 幅方向(mm, つま先側が− = 図の上)
(() => {
"use strict";
const D = globalThis.SETUP_DATA;
const RAD = Math.PI / 180;

// ---------- 幾何・物理（DOMなし。smoke.test.mjs から検算する） ----------
const G = {
  // 半径Rの円弧の、中心からxの位置での矢高(mm)
  sag: (R, x) => R - Math.sqrt(Math.max(R * R - x * x, 0)),

  // 板の半幅。有効エッジ内 = 公称サイドカット半径の円弧(A)。外側 = 先端へ絞る曲線(C)
  halfWidth(b, x) {
    const ax = Math.abs(x), he = b.effectiveEdge / 2, ht = G.tipLen(b, x);
    if (ax <= he) return b.waistWidth / 2 + G.sag(b.sidecutRadius, ax);
    const wc = b.waistWidth / 2 + G.sag(b.sidecutRadius, he);
    const t = Math.min((ax - he) / (ht - he), 1);
    // ponytail: ノーズ形状は非公開。超楕円(n=2.6)で近似、実測値が手に入れば差し替え
    return wc * Math.pow(1 - Math.pow(t, 2.6), 1 / 2.6);
  },

  // 公称値4つ(有効エッジ・ウエスト・半径)から計算した接雪点の幅。公称ノーズ幅との整合チェック用
  contactWidth: (b) => b.waistWidth + 2 * G.sag(b.sidecutRadius, b.effectiveEdge / 2),

  // 板の中心から先端まで(mm)。side>=0 ノーズ / <0 テール。noseDiff = ノーズ側の方が長い分(mm)
  tipLen: (b, side) => (b.totalLength + (side >= 0 ? 1 : -1) * (b.noseDiff || 0)) / 2,

  // 板中央のたわみやすさ（接雪点で支え両足で押す梁。基準スタンス=1）。同じ体重なら足が内側ほど大きい
  flexRatio(b, width) {
    const L = b.effectiveEdge, k = (w) => { const c = Math.max(L / 2 - w / 2, 0); return c * (3 * L * L - 4 * c * c); };
    return k(width) / k(b.refStance);
  },

  // 片足の中心位置。shift = 基準位置から外側へ何穴(2cm)、slot = ディスクの溝で外側へ何mm
  footX: (b, front, shift, slot = 0) =>
    -b.setback + (front ? 1 : -1) * (b.refStance / 2 + D.holePitch * shift + slot),

  // 1列の穴数から、4x4ディスク中心が取れる範囲(±穴)
  maxShift: (holes) => Math.max(0, Math.floor((holes - 3) / 2)),

  // 目標幅に最も近い「穴＋ディスクの溝」。優先: 幅の誤差 → 溝を使う量 → 中心のずれ → テール寄り
  resolveWidth(b, target, holes) {
    const m = G.maxShift(holes);
    let best = null;
    for (let f = -m; f <= m; f++) for (let k = -m; k <= m; k++) for (let sf = -D.discSlot; sf <= D.discSlot; sf++) for (let sk = -D.discSlot; sk <= D.discSlot; sk++) {
      const fo = D.holePitch * f + sf, ko = D.holePitch * k + sk, c = (fo - ko) / 2; // 基準から外側へ(mm) / 中心のノーズ側へのずれ
      const s = [Math.abs(b.refStance + fo + ko - target), Math.abs(sf) + Math.abs(sk), Math.abs(c), c > 0 ? 1 : 0];
      if (!best || s.some((v, i) => v < best.s[i] && s.slice(0, i).every((u, j) => u === best.s[j]))) {
        best = { front: { shift: f, slot: sf }, back: { shift: k, slot: sk }, s };
      }
    }
    return best;
  },

  // つま先方向の単位ベクトル。角度正 = つま先がノーズ側。つま先側は y−（図の上）
  toeDir: (deg) => [Math.sin(deg * RAD), -Math.cos(deg * RAD)],

  // ブーツ外形（両端を半円としたスタジアム形で近似）
  bootOutline(cx, deg, L, W, n = 24) {
    const [ux, uy] = G.toeDir(deg), px = uy, py = -ux, r = W / 2, h = L / 2 - r;
    const pts = [];
    for (const end of [1, -1]) {
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / n;
        const ca = Math.cos(a) * end, sa = Math.sin(a) * end;
        pts.push([cx + ux * h * end + r * (ca * ux + sa * px), uy * h * end + r * (ca * uy + sa * py)]);
      }
    }
    return pts;
  },

  // 外形の各点が板のエッジからどれだけはみ出すか(mm, 正=はみ出し)
  overhang(b, pts) {
    let toe = -Infinity, heel = -Infinity;
    for (const [x, y] of pts) {
      const hw = G.halfWidth(b, x);
      toe = Math.max(toe, -y - hw);
      heel = Math.max(heel, y - hw);
    }
    return { toe, heel };
  },

  // はみ出しo(mm)・高さh(mm)の点が雪に触れ始めるエッジ角(°)。tanθ = h / o
  dragAngle: (o, h) => (o <= 0 ? 90 : Math.atan2(h, o) / RAD),

  // エッジ角θの理想カービング（板がたわんでエッジ全長が接雪・平地・ズレなし・体の傾き=θ）
  carve(b, deg, weightKg) {
    const t = deg * RAD, R = b.sidecutRadius / 1000;
    return {
      turnR: R * Math.cos(t),                                   // Howe: R·cosθ
      deflect: G.sag(b.sidecutRadius, b.effectiveEdge / 2) * Math.tan(t), // 必要なたわみ(mm)
      speedKmh: Math.sqrt(9.81 * R * Math.sin(t)) * 3.6,         // tanθ = v²/(g·R·cosθ)
      loadKg: weightKg / Math.cos(t),                            // 板にかかる見かけの体重
    };
  },
};
globalThis.SetupGeom = G;
if (typeof document === "undefined") return;

// ---------- 状態 ----------
const clone = (o) => JSON.parse(JSON.stringify(o));
const S = { key: "", bd: null, es: clone(D.estimates), rd: clone(D.rider), ft: { angle: 18, shift: 0, slot: 0 }, bk: { angle: 0, shift: 0, slot: 0 }, edge: 30, card: "beginner", lean: 0 };

function loadBoard(key) {
  S.key = key;
  S.bd = clone(D.boards[key]);
  S.bd.ntComputed = S.bd.noseTailWidth == null;
  if (S.bd.ntComputed) S.bd.noseTailWidth = Math.round(G.contactWidth(S.bd)); // 非掲載 → 計算値
}

function applyPreset(name) {
  const p = D.presets[name], r = G.resolveWidth(S.bd, p.width, S.bd.holesPerRow);
  S.ft = { angle: p.front, ...r.front };
  S.bk = { angle: p.back, ...r.back };
  S.lean = p.leanStep || 0;
}

// ---------- 入力（仕様メモ7章: 範囲外は弾く） ----------
const LIMITS = {
  "bd.totalLength": [1000, 1900], "bd.effectiveEdge": [700, 1500], "bd.noseTailWidth": [240, 340],
  "bd.waistWidth": [240, 270], "bd.sidecutRadius": [6000, 10000], "bd.refStance": [400, 650],
  "bd.setback": [-50, 50], "bd.holesPerRow": [3, 15], "bd.noseDiff": [-100, 100], "es.tipRise": [0, 150], "es.camberHeight": [0, 20],
  "es.bootLength": [250, 360], "es.soleHeight": [10, 80], "rd.height": [120, 210], "rd.weight": [30, 150],
};
const $ = (id) => document.getElementById(id);
const inputs = [...document.querySelectorAll("[data-k]")];
const getK = (k) => { const [a, b] = k.split("."); return S[a][b]; };
const setK = (k, v) => { const [a, b] = k.split("."); S[a][b] = v; };

function syncInputs() {
  const m = G.maxShift(S.bd.holesPerRow);
  for (const el of inputs) {
    if (el.classList.contains("shift")) { el.min = -m; el.max = m; }
    if (el.classList.contains("slot")) { el.min = -D.discSlot; el.max = D.discSlot; }
    el.value = Math.round((getK(el.dataset.k) / (+el.dataset.mul || 1)) * 100) / 100;
    el.classList.remove("bad");
  }
  $("board").value = S.key;
  $("regular").value = S.rd.regular ? "1" : "0";
  $("lean").value = S.lean;
  $("edge").value = S.edge;
}

// ---------- SVG ヘルパー ----------
const NS = "http://www.w3.org/2000/svg";
function el(parent, tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  parent.appendChild(e);
  return e;
}
const pts = (a) => a.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
const deg = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n) + "°";
const cm = (mm, d = 1) => (mm / 10).toFixed(d);
function arrow(parent, x1, y1, x2, y2, cls, w, head) {
  el(parent, "line", { x1, y1, x2, y2, class: cls, "stroke-width": w });
  const a = Math.atan2(y2 - y1, x2 - x1), h = head || w * 4;
  el(parent, "polygon", {
    class: cls.replace(/\b(front|back)\b/, "fill-$1"),
    points: pts([[x2, y2], [x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45)], [x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45)]]),
  });
}
function dim(parent, x1, x2, y, label, size) {
  el(parent, "line", { x1, y1: y, x2, y2: y, class: "guide", "stroke-width": 2 });
  for (const x of [x1, x2]) el(parent, "line", { x1: x, y1: y - 10, x2: x, y2: y + 10, class: "guide", "stroke-width": 2 });
  el(parent, "text", { x: (x1 + x2) / 2, y: y - 12, "text-anchor": "middle", "font-size": size, class: "t-strong" }, label);
}
const shiftText = (s) => (s === 0 ? "基準位置" : `${s > 0 ? "外側" : "内側"}へ${Math.abs(s)}穴（${Math.abs(s) * D.holePitch / 10}cm）`);

const slotText = (s) => (s === 0 ? "溝は真ん中" : `溝で${s > 0 ? "外側" : "内側"}へ${Math.abs(s)}mm`);
const mountText = (r) => {
  const t = (f) => shiftText(f.shift) + (f.slot ? "＋" + slotText(f.slot) : "");
  const c = r.s[2] >= 1 ? `（中心が${r.s[3] ? "ノーズ" : "テール"}側へ${cm(r.s[2])}cm）` : "";
  return (t(r.front) === t(r.back) ? `両足とも ${t(r.front)}` : `前足 ${t(r.front)} / 後足 ${t(r.back)}`) + c;
};
// 4x4ディスクのネジ2本分の穴位置を、その足側の先端からの距離（cmの文字列2つ）で
const holePair = (front, holeX) => {
  const d = G.tipLen(S.bd, front ? 1 : -1) - Math.abs(holeX);
  return [cm(d - D.holePitch), cm(d + D.holePitch)];
};
const holesText = (front, holeX) => `${front ? "ノーズ" : "テール"}先端から${holePair(front, holeX).join("cmと")}cmの穴`;
const facingText = (a) => (a === 0 ? "真横（0°）" : a > 0 ? `進行方向側へ${a}°` : `進行方向と逆へ${-a}°`);
const tags = (s) => s.replace(/\[([ABC])\]/g, (_, g) => ` <span class="tag tag-${g.toLowerCase()}">${g}</span>`);

// 足ごとの派生値
function foot(front) {
  const f = front ? S.ft : S.bk, b = S.bd;
  const x = G.footX(b, front, f.shift, f.slot), holeX = G.footX(b, front, f.shift);
  const outline = G.bootOutline(x, f.angle, S.es.bootLength, 110); // ponytail: ブーツ幅110mm固定（はみ出しへの影響は小さい）
  const oh = G.overhang(b, outline);
  return { front, f, x, holeX, outline, oh, drag: G.dragAngle(Math.max(oh.toe, oh.heel), S.es.soleHeight), cls: front ? "front" : "back" };
}

// ---------- 上から見た図 ----------
function renderTop() {
  const svg = $("top"); svg.textContent = "";
  const b = S.bd, dir = S.rd.regular ? -1 : 1, he = b.effectiveEdge / 2, nl = G.tipLen(b, 1), tl = G.tipLen(b, -1);
  const maxW = G.halfWidth(b, he), top = -maxW - 150, bottom = maxW + 220;
  const x0 = Math.min(-dir * tl, dir * nl) - 30, x1 = Math.max(-dir * tl, dir * nl) + 30;
  svg.setAttribute("viewBox", `${x0} ${top} ${x1 - x0} ${bottom - top}`);

  // 板: 塗り → 有効エッジ内(円弧・実線) → 先端(推定・破線)
  const N = 160, edgeLine = (sign, xa, xb) => {
    const a = [];
    for (let i = 0; i <= N; i++) { const x = xa + ((xb - xa) * i) / N; a.push([dir * x, sign * G.halfWidth(b, x)]); }
    return a;
  };
  el(svg, "polygon", { class: "board", points: pts(edgeLine(1, -tl, nl).concat(edgeLine(-1, nl, -tl))) });
  for (const s of [1, -1]) {
    el(svg, "polyline", { class: "edge", "stroke-width": 5, points: pts(edgeLine(s, -he, he)) });
    el(svg, "polyline", { class: "edge-est", "stroke-width": 4, points: pts(edgeLine(s, he, nl)) });
    el(svg, "polyline", { class: "edge-est", "stroke-width": 4, points: pts(edgeLine(s, -tl, -he)) });
  }
  el(svg, "line", { x1: x0 + 30, y1: 0, x2: x1 - 30, y2: 0, class: "grid", "stroke-width": 2 });
  for (const x of [-he, he]) {
    el(svg, "line", { x1: x, y1: -maxW - 20, x2: x, y2: maxW + 20, class: "guide", "stroke-width": 2, "stroke-dasharray": "6 6" });
  }
  el(svg, "line", { x1: 0, y1: -maxW - 20, x2: 0, y2: maxW + 20, class: "guide", "stroke-width": 2 });
  el(svg, "text", { x: 0, y: maxW + 44, "text-anchor": "middle", "font-size": 20 }, "基準の中心");
  el(svg, "text", { x: dir * (nl - 95), y: 8, "text-anchor": "middle", "font-size": 24, class: "t-strong" }, "ノーズ");
  el(svg, "text", { x: -dir * (tl - 95), y: 8, "text-anchor": "middle", "font-size": 24, class: "t-strong" }, "テール");
  el(svg, "text", { x: x0 + 40, y: maxW + 44, "font-size": 20 }, "↓ かかと側エッジ（手前）");
  el(svg, "text", { x: x0 + 40, y: -maxW - 30, "font-size": 20 }, "↑ つま先側エッジ（奥）");

  const feet = [foot(true), foot(false)];
  for (const ft of feet) drawFoot(svg, ft, dir, 1);

  const [F, B] = feet, w = F.x - B.x, c = (F.x + B.x) / 2;
  // メジャー: 各先端から、使うネジ穴の中心までの距離（取り付けでそのまま測れる数字）
  const tapeY = maxW + 80, tapeLen = 600;
  for (const ft of feet) {
    const sgn = ft.front ? 1 : -1, tip = ft.front ? nl : tl;
    const X = (d) => dir * sgn * (tip - d);
    el(svg, "rect", { x: Math.min(X(0), X(tapeLen)), y: tapeY, width: tapeLen, height: 34, rx: 4, class: "tape" });
    for (let d = 0; d <= tapeLen; d += 10) {
      const major = d % 100 === 0, mid = d % 50 === 0;
      el(svg, "line", { x1: X(d), y1: tapeY, x2: X(d), y2: tapeY + (major ? 16 : mid ? 11 : 6), class: "tape-tick", "stroke-width": major ? 2 : 1 });
      if (major && d > 0) el(svg, "text", { x: X(d), y: tapeY + 30, "text-anchor": "middle", "font-size": 13, class: "tape-num" }, d / 10);
    }
    holePair(ft.front, ft.holeX).forEach((v, i) => {
      const x = X(+v * 10), y = tapeY - (i ? 34 : 12);
      el(svg, "line", { x1: x, y1: y + 4, x2: x, y2: tapeY, class: "tape-tick", "stroke-width": 1.5 });
      el(svg, "polygon", { points: pts([[x, tapeY + 1], [x - 6, tapeY - 8], [x + 6, tapeY - 8]]), class: "tape-mark" });
      el(svg, "text", { x, y, "text-anchor": "middle", "font-size": 17, class: "tape-label" }, v);
    });
    el(svg, "text", { x: X(0), y: tapeY + 56, "text-anchor": dir * sgn > 0 ? "end" : "start", "font-size": 16, class: "t-strong" }, `${ft.front ? "ノーズ" : "テール"}先端から（cm）`);
  }
  dim(svg, dir * B.x, dir * F.x, top + 40, `スタンス幅 ${cm(w)}cm`, 26);
  dim(svg, -he * dir, he * dir, bottom - 30, `有効エッジ ${cm(b.effectiveEdge)}cm（接雪点〜接雪点。直線ではなく円弧）`, 22);
  for (const ft of feet) {
    el(svg, "text", { x: dir * ft.x, y: top + 84, "text-anchor": "middle", "font-size": 24, class: "t-strong" }, `${ft.front ? "前足" : "後足"} ${deg(ft.f.angle)}`);
  }

  const pct = (w / (S.rd.height * 10)) * 100;
  $("top-read").innerHTML =
    `<p>スタンス幅 <b>${cm(w)}cm</b>（身長の${pct.toFixed(1)}%、目安30〜31% <span class="tag tag-b">B</span>）・スタンスの中心 ${Math.abs(c) < 1 ? "<b>基準どおり</b>" : `<b>${c > 0 ? "ノーズ" : "テール"}側へ${cm(Math.abs(c))}cm</b>`}` +
    (b.stanceRange ? `・この板で付けられる幅 ${cm(b.stanceRange[0])}〜${cm(b.stanceRange[1])}cm` : "") + `</p>` +
    `<details><summary>ノーズとテールの違い・輪郭について</summary>` +
    `<p>公表値はノーズ幅＝テール幅（${cm(b.noseTailWidth)}cm）・セットバック${b.setback}mmで、形の前後差は数値に出ていない。ディレクショナルツインの違いは一般に「ノーズが少し長い」「テールが硬い」「足の位置が後ろ寄り」のどれか <span class="tag tag-c">C</span>。</p>` +
    (b.noseDiff
      ? `<p>実測ではノーズ側が${Math.abs(b.noseDiff)}mm${b.noseDiff > 0 ? "長い" : "短い"}（基準の中心からノーズ先端${cm(G.tipLen(b, 1))}cm・テール先端${cm(G.tipLen(b, -1))}cm）。足の位置は先端どうしの真ん中から${Math.abs(b.noseDiff) / 2}mm${b.noseDiff > 0 ? "テール" : "ノーズ"}寄りで、乗り味への影響はほぼない大きさ。硬さの差は図にできない。</p>`
      : `<p>長さの差は巻き尺で測れる。基準スタンスの真ん中から両先端まで測り、差を「実物で測る値」に入れると図に出る。</p>`) +
    `<p>輪郭: 有効エッジの内側は公称サイドカット半径の円弧（実線）、先端の丸みは推定（破線）。Quadralizerは足元で半径が変わる複合カーブで、細部は非公開。</p></details>`;
}

// 足1つ分（上から見た図・詳細図で共用）。k = 文字や線の拡大率
function drawFoot(svg, ft, dir, k) {
  const b = S.bd, n = b.holesPerRow, ref = G.footX(b, ft.front, 0), gap = D.holeRowGap / 2;
  const sx = (x) => dir * x;
  for (let i = -(n - 1) / 2; i <= (n - 1) / 2; i++) {
    for (const y of [-gap, gap]) el(svg, "circle", { cx: sx(ref + i * D.holePitch), cy: y, r: 5, class: "hole", "stroke-width": 1.5 });
  }
  for (const dx of [-D.holePitch, D.holePitch]) {
    for (const y of [-gap, gap]) el(svg, "circle", { cx: sx(ft.holeX + dx), cy: y, r: 6.5, class: "hole-on" });
  }
  el(svg, "circle", { cx: sx(ft.x), cy: 0, r: 58, class: "disc", "stroke-width": 2 * k });
  el(svg, "polygon", { class: `boot ${ft.cls}`, points: pts(ft.outline.map(([x, y]) => [sx(x), y])) });
  const [ux, uy] = G.toeDir(ft.f.angle);
  arrow(svg, sx(ft.x), 0, sx(ft.x + ux * 120), uy * 120, ft.cls, 4 * k, 22);
}

// ---------- 取り付け詳細（片足の拡大図） ----------
function renderDetail(front) {
  const id = front ? "detail-ft" : "detail-bk", svg = $(id); svg.textContent = "";
  const b = S.bd, dir = S.rd.regular ? -1 : 1, ft = foot(front), f = ft.f, sx = (x) => dir * x;
  svg.setAttribute("viewBox", `${sx(ft.x) - 230} -235 460 600`);

  const line = (sign) => { const a = []; for (let x = ft.x - 280; x <= ft.x + 280; x += 10) a.push([sx(x), sign * G.halfWidth(b, x)]); return a; };
  el(svg, "polygon", { class: "board", points: pts(line(1).concat(line(-1).reverse())) });
  for (const s of [1, -1]) el(svg, "polyline", { class: "edge", "stroke-width": 3, points: pts(line(s)) });

  // ディスク目盛り（3°刻み）。数字は 0° と現在の角度だけ（全部書くと重なって読めない）
  for (let a = -30; a <= 45; a += D.angleStep) {
    const [ux, uy] = G.toeDir(a), now = a === f.angle, r2 = now ? 94 : a % 15 === 0 ? 80 : 72;
    el(svg, "line", { x1: sx(ft.x + ux * 64), y1: uy * 64, x2: sx(ft.x + ux * r2), y2: uy * r2, class: now ? ft.cls : "guide", "stroke-width": now ? 4 : a % 15 === 0 ? 2 : 1 });
    if (now || (a === 0 && Math.abs(f.angle) >= 12)) {
      el(svg, "text", { x: sx(ft.x + ux * 116), y: uy * 116 + 6, "text-anchor": "middle", "font-size": 16, class: now ? "halo t-strong" : "halo" }, deg(a));
    }
  }
  drawFoot(svg, ft, dir, 0.6);

  // 膝を曲げた力（つま先方向）の分解。下の小窓: エッジを踏む成分 cosθ / 板の長さ方向 sinθ
  const [ux, uy] = G.toeDir(f.angle), L = 58, ox = sx(ft.x) - 150, oy = 338;
  el(svg, "rect", { x: sx(ft.x) - 220, y: 240, width: 440, height: 116, rx: 10, class: "inset" });
  el(svg, "text", { x: sx(ft.x) - 204, y: 264, "font-size": 15 }, "膝をつま先方向に曲げたときの力");
  arrow(svg, ox, oy, ox + dir * ux * L, oy + uy * L, ft.cls, 3, 12);
  arrow(svg, ox, oy, ox, oy + uy * L, "guide", 2, 9);
  if (Math.abs(ux) > 0.02) arrow(svg, ox, oy, ox + dir * ux * L, oy, "guide", 2, 9);
  el(svg, "text", { x: ox + 80, y: 300, "font-size": 16, class: "t-strong" }, `↑ エッジを踏む ${Math.round(Math.abs(uy) * 100)}%`);
  if (Math.abs(ux) > 0.02) {
    el(svg, "text", { x: ox + 80, y: 328, "font-size": 16, class: "t-strong" }, `${dir * ux > 0 ? "→" : "←"} ${ux > 0 ? "ノーズ" : "テール"}へ押す ${Math.round(Math.abs(ux) * 100)}%`);
  }

  const hw = G.halfWidth(b, ft.x);
  for (const [x, y] of ft.outline) if (Math.abs(y) > G.halfWidth(b, x)) el(svg, "circle", { cx: sx(x), cy: y, r: 3, class: "over" });
  el(svg, "text", { x: sx(ft.x), y: -hw - 46, "text-anchor": "middle", "font-size": 17 }, `つま先 はみ出し ${Math.max(0, ft.oh.toe).toFixed(0)}mm`);
  el(svg, "text", { x: sx(ft.x), y: hw + 58, "text-anchor": "middle", "font-size": 17 }, `かかと はみ出し ${Math.max(0, ft.oh.heel).toFixed(0)}mm`);
  el(svg, "text", { x: sx(ft.x) - 220, y: -212, "font-size": 18, class: "t-strong" }, front ? "前足" : "後足");

  $(id + "-read").innerHTML =
    `<b>${shiftText(f.shift)}</b>・<b>${slotText(f.slot)}</b>・<b>${deg(f.angle)}</b>。黄色の4穴（${holesText(front, ft.holeX)}・2列とも）にネジを入れる。<br>` +
    `はみ出し最大 ${Math.max(0, ft.oh.toe, ft.oh.heel).toFixed(0)}mm → エッジ角 <b>約${ft.drag.toFixed(0)}°</b>でブーツが雪に触れ始める ` +
    `<span class="tag tag-c">C</span><span class="dim">（ブーツ外寸${cm(S.es.bootLength)}cm・底の高さ${S.es.soleHeight}mmの仮定）</span>` +
    (f.slot ? `<br><span class="dim">溝は板の長さ方向に向けて使う（横向きだとつま先・かかとの前後調整になり、幅の微調整とは同時にできない）</span>` : "");
}

// ---------- 横から見た図（高さは V 倍に拡大） ----------
function profileH(x) {
  const b = S.bd, ax = Math.abs(x), fx = b.refStance / 2, he = b.effectiveEdge / 2, ht = G.tipLen(b, x);
  if (ax <= fx) return 0;
  if (ax <= he) return S.es.camberHeight * Math.sin((Math.PI * (ax - fx)) / (he - fx));
  return S.es.tipRise * Math.pow(Math.min((ax - he) / (ht - he), 1), 2.2);
}
function zoneOf(x) {
  const b = S.bd, ax = Math.abs(x);
  return ax <= b.refStance / 2 ? "flat" : ax <= b.effectiveEdge / 2 ? "camber" : "rocker";
}
function renderSide() {
  const svg = $("side"); svg.textContent = "";
  const b = S.bd, dir = S.rd.regular ? -1 : 1, nl = G.tipLen(b, 1), tl = G.tipLen(b, -1), he = b.effectiveEdge / 2, fx = b.refStance / 2, V = 3;
  const topY = -V * S.es.tipRise - 90;
  svg.setAttribute("viewBox", `${Math.min(-dir * tl, dir * nl) - 30} ${topY} ${b.totalLength + 60} ${-topY + 70}`);

  el(svg, "line", { x1: -dir * (tl + 30), y1: 0, x2: dir * (nl + 30), y2: 0, class: "grid", "stroke-width": 3 });
  const zones = [[-tl, -he, "rocker", "ロッカー"], [-he, -fx, "camber", "キャンバー"], [-fx, fx, "flat", "フラット"], [fx, he, "camber", "キャンバー"], [he, nl, "rocker", "ロッカー"]];
  for (const [x0, x1, z, name] of zones) {
    el(svg, "rect", { x: Math.min(dir * x0, dir * x1), y: 12, width: Math.abs(x1 - x0), height: 18, class: "zone-" + z });
    el(svg, "text", { x: dir * (x0 + x1) / 2, y: 56, "text-anchor": "middle", "font-size": 20 }, name);
  }
  const a = [];
  for (let x = -tl; x <= nl; x += 5) a.push([dir * x, -V * profileH(x)]);
  el(svg, "polyline", { class: "edge", "stroke-width": 8, "stroke-linecap": "round", points: pts(a) });

  const feet = [foot(true), foot(false)];
  for (const ft of feet) {
    const y = -V * profileH(ft.x);
    el(svg, "line", { x1: dir * ft.x, y1: y - 70, x2: dir * ft.x, y2: y - 8, class: ft.cls, "stroke-width": 5 });
    el(svg, "text", { x: dir * ft.x, y: y - 80, "text-anchor": "middle", "font-size": 22, class: "t-strong" }, ft.front ? "前足" : "後足");
  }
  const peak = (fx + he) / 2;
  el(svg, "text", { x: dir * peak, y: -V * S.es.camberHeight - 16, "text-anchor": "middle", "font-size": 18 }, `浮き約${S.es.camberHeight}mm`);
  el(svg, "text", { x: dir * (nl - 20), y: -V * S.es.tipRise - 20, "text-anchor": dir > 0 ? "end" : "start", "font-size": 18 }, `先端 約${S.es.tipRise}mm`);

  const where = (ft) => {
    const d = Math.abs(ft.x) - fx;
    return Math.abs(d) < 1 ? "フラットとキャンバーの境目" : d > 0 ? `キャンバー側へ${cm(d)}cm` : `フラット側へ${cm(-d)}cm`;
  };
  $("side-read").innerHTML =
    `前足: <b>${where(feet[0])}</b> ／ 後足: <b>${where(feet[1])}</b> <span class="tag tag-c">C</span><br>` +
    `<span class="dim">メーカー説明「足の間はフラット・足の近くはキャンバー・先端はロッカー」を、基準スタンス位置を境目として描いた推定図。` +
    `切り替え位置・高さは非公開（高さは${V}倍表示）。足をフラット側へ寄せるほど回しやすく、キャンバー側ほど反発とグリップが出る方向。</span>`;
}

// ---------- エッジ角とターン ----------
function renderCarve() {
  const svg = $("carve"); svg.textContent = "";
  const b = S.bd, th = S.edge, c = G.carve(b, th, S.rd.weight), Rmax = b.sidecutRadius / 1000;
  const W = 300, H = 270, k = 20, x0 = 50, y0 = H - 20, s = 9; // 同じ9m進んだときの軌跡
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const path = (R) => {
    const a = [], phi = Math.min(s / R, Math.PI);
    for (let i = 0; i <= 40; i++) { const p = (phi * i) / 40; a.push([x0 + k * R * (1 - Math.cos(p)), y0 - k * R * Math.sin(p)]); }
    return a;
  };
  const guide = path(Rmax), now = path(c.turnR);
  el(svg, "polyline", { points: pts(guide), class: "guide", "stroke-width": 2, "stroke-dasharray": "6 5" });
  el(svg, "polyline", { points: pts(now), class: "edge", "stroke-width": 3 });
  el(svg, "circle", { cx: x0, cy: y0, r: 4, class: "now" });
  const g = guide[guide.length - 1], n = now[now.length - 1];
  el(svg, "text", { x: g[0] - 4, y: g[1] - 8, "text-anchor": "middle", "font-size": 11 }, `半径${Rmax.toFixed(1)}m（上限）`);
  el(svg, "text", { x: Math.min(n[0] + 6, W - 70), y: n[1] + 16, "font-size": 12, class: "t-strong" }, `半径${c.turnR.toFixed(2)}m`);
  el(svg, "text", { x: 8, y: 16, "font-size": 11 }, "同じ9m進んだときの軌跡（上から見た図）");

  const minDrag = Math.min(foot(true).drag, foot(false).drag), wr = b.weightKg;
  $("edge-out").textContent = th + "°";
  $("carve-read").innerHTML =
    `ターン半径 = サイドカット半径 × cos(エッジ角) = <b>${c.turnR.toFixed(2)}m</b>。` +
    `角を立てるほど小さくなり、<b>${Rmax.toFixed(1)}mより大きな弧は描けない</b>。<br>` +
    `そのためには板の中央を接雪点より <b>${c.deflect.toFixed(0)}mm</b> たわませる必要がある（キャンバーの浮きは別）。<br>` +
    `この角度でズレずに曲がり続けられる速度: 約<b>${c.speedKmh.toFixed(0)}km/h</b>（体の傾き＝エッジ角と仮定）。<br>` +
    `そのとき板にかかる力: 体重${S.rd.weight}kg → <b>${c.loadKg.toFixed(0)}kg相当</b>` +
    (wr ? `（板の適正体重 ${wr[0]}〜${wr[1]}kg）` : "") + `。<br>` +
    (th >= minDrag
      ? `<span class="warn-inline">${ICON("triangle-alert", { size: 15 })} エッジ角${th}°はブーツが雪に触れる角度（約${minDrag.toFixed(0)}°）を超えている</span>`
      : `ブーツが雪に触れる角度（約${minDrag.toFixed(0)}°）まで余裕あり。`) +
    `<br><span class="dim">理想化: 平らな雪面・ズレなし・エッジ全長が接雪。出典: J. Howe『Skiing Mechanics』/ Jentschura & Fahrbach, arXiv:physics/0310086</span>`;
}

// ---------- アングルマップ ----------
function renderMap() {
  const svg = $("map"); svg.textContent = "";
  const W = 640, H = 330, ml = 58, mr = 16, mt = 16, mb = 46, pw = W - ml - mr, ph = H - mt - mb;
  const X = (a) => ml + ((a + 30) / 75) * pw, Y = (a) => mt + ((30 - a) / 60) * ph;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  for (let a = -30; a <= 45; a += 15) {
    el(svg, "line", { x1: X(a), y1: mt, x2: X(a), y2: mt + ph, class: "grid", "stroke-width": 1 });
    el(svg, "text", { x: X(a), y: mt + ph + 18, "text-anchor": "middle", "font-size": 12 }, deg(a));
  }
  for (let a = -30; a <= 30; a += 15) {
    el(svg, "line", { x1: ml, y1: Y(a), x2: ml + pw, y2: Y(a), class: "grid", "stroke-width": 1 });
    el(svg, "text", { x: ml - 8, y: Y(a) + 4, "text-anchor": "end", "font-size": 12 }, deg(a));
  }
  el(svg, "text", { x: ml + pw / 2, y: H - 6, "text-anchor": "middle", "font-size": 12 }, "前足の角度 →");
  el(svg, "text", { x: 14, y: mt + ph / 2, "text-anchor": "middle", "font-size": 12, transform: `rotate(-90 14 ${mt + ph / 2})` }, "後足の角度 →");

  for (const s of D.styles) {
    const w = X(s.front[1]) - X(s.front[0]), h = Y(s.back[0]) - Y(s.back[1]), point = w === 0;
    const r = point
      ? el(svg, "rect", { x: X(s.front[0]) - 5, y: Y(s.back[0]) - 5, width: 10, height: 10, class: "style-box" })
      : el(svg, "rect", { x: X(s.front[0]), y: Y(s.back[1]), width: w, height: Math.max(h, 2), rx: 3, class: "style-box" });
    el(r, "title", {}, `${s.name}: 前足${deg(s.front[0])}〜${deg(s.front[1])} / 後足${deg(s.back[0])}〜${deg(s.back[1])}（${s.src}）`);
    const above = !point && s.back[1] >= 0;
    el(svg, "text", above
      ? { x: X(s.front[0]), y: Y(s.back[1]) - 6, "font-size": 12, class: "halo" }
      : { x: X(s.front[0]) - 8, y: Y((s.back[0] + s.back[1]) / 2) + 4, "text-anchor": "end", "font-size": 12, class: "halo" }, s.name);
  }
  const f = S.ft.angle, bk = S.bk.angle;
  el(el(svg, "circle", { cx: X(f), cy: Y(bk), r: 6, class: "now" }), "title", {}, `いま: 前足${deg(f)} / 後足${deg(bk)}`);
  // 「いま」の文字は範囲名と重なりやすいので図に書かず、下の説明に凡例として出す

  const dist = (s) => Math.hypot(Math.max(0, s.front[0] - f, f - s.front[1]), Math.max(0, s.back[0] - bk, bk - s.back[1]));
  const inside = D.styles.filter((s) => dist(s) === 0), near = [...D.styles].sort((a, c) => dist(a) - dist(c))[0];
  $("map-read").innerHTML = `<span class="key-now"></span>` + (inside.length
    ? `いまの ${deg(f)} / ${deg(bk)} は <b>${inside.map((s) => s.name).join("・")}</b> の範囲内。`
    : `いまの ${deg(f)} / ${deg(bk)} はどの範囲にも入らない。いちばん近いのは <b>${near.name}</b>（あと約${dist(near).toFixed(0)}°）。`) +
      `<span class="dim">範囲は慣習の目安で、外れていても間違いではない。</span>`;
  $("style-table").innerHTML = `<table class="su-table"><tr><th>スタイル</th><th>前足</th><th>後足</th><th>出典</th></tr>` +
    D.styles.map((s) => `<tr><td>${dist(s) === 0 ? "● " : ""}${s.name}</td><td>${deg(s.front[0])}〜${deg(s.front[1])}</td><td>${deg(s.back[0])}〜${deg(s.back[1])}</td><td>${s.src}</td></tr>`).join("") + `</table>`;
}

// ---------- 注意 ----------
function renderWarnings() {
  const b = S.bd, w = [], notes = [], cw = G.contactWidth(b);
  const pct = ((G.footX(b, true, S.ft.shift, S.ft.slot) - G.footX(b, false, S.bk.shift, S.bk.slot)) / (S.rd.height * 10)) * 100;
  if (b.ntComputed) notes.push(`この年式はノーズ幅が非掲載。公称値から計算した ${cw.toFixed(0)}mm を使用。`);
  else if (Math.abs(cw - b.noseTailWidth) > 3) w.push(`公称値どうしが合わない: 半径・有効エッジ・ウエストから計算した接雪点の幅は${cw.toFixed(0)}mm、公称ノーズ幅は${b.noseTailWidth}mm。年式の混在を疑う。`);
  if (b.weightKg) {
    const [lo, hi] = b.weightKg, wt = S.rd.weight;
    if (wt < lo || wt > hi) w.push(`体重${wt}kgは板の適正体重${lo}〜${hi}kgの範囲外。`);
    else if (wt < lo + (hi - lo) * 0.25) notes.push(`体重${wt}kgは適正体重${lo}〜${hi}kgの軽い側（参考）。幅による差は小さく、ターン中の荷重で補える。詳しくは「理由」タブのスタンス幅の決め方。`);
  }
  if (pct < 28 || pct > 34) w.push(`スタンス幅が身長の${pct.toFixed(1)}%。目安（30〜31%）から離れている。`);
  if (S.bk.angle > S.ft.angle) w.push("後足の角度が前足より大きい（ノーズ側を向きすぎ）。通常は前足の方が大きい。");
  const drag = Math.min(foot(true).drag, foot(false).drag);
  if (drag < 50) w.push(`ブーツが約${drag.toFixed(0)}°で雪に触れる計算。はみ出しを実測し、2cmを超えるならワイド板や角度を増やすことを検討。`);
  $("warnings").innerHTML = w.map((t) => `<div class="warn">${t}</div>`).join("") + notes.map((t) => `<div class="note">${t}</div>`).join("");
}

// ---------- スタンス幅の決め方 ----------
function renderStanceGuide() {
  const b = S.bd, h = S.rd.height * 10, wt = S.rd.weight, holes = b.holesPerRow, m = G.maxShift(holes);
  const reach = D.holePitch * m + D.discSlot; // 片足で基準から動かせる最大(mm)
  const lo = b.refStance - 2 * reach, hi = b.refStance + 2 * reach, beg = D.presets.beginner.width, run = D.presets.runtori.width;
  const holeOnly = [];
  for (let s = -2 * m; s <= 2 * m; s++) holeOnly.push(b.refStance + s * D.holePitch);
  const widths = [...new Set([lo, ...holeOnly, run, hi])].sort((p, q) => p - q);
  const now = G.footX(b, true, S.ft.shift, S.ft.slot) - G.footX(b, false, S.bk.shift, S.bk.slot);
  const kg = (w) => (G.flexRatio(b, w) - 1) * wt; // 基準幅と比べた板中央のたわみを体重に換算
  const sgnKg = (v) => (Math.abs(v) < 0.05 ? "±0" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(1)) + "kg";
  const label = (w) => w === beg ? "S字練習" : w === beg + D.holePitch ? "プレス・オーリーを始めたら" : w === run ? "ラントリ・グラトリ" :
    w === b.refStance ? "基準（反発重視）" : w / h > 0.33 ? "身長に対して広い" : w / h < 0.30 ? "身長に対して狭い" : "";
  const rows = widths.map((w) => {
    const d = (w - b.refStance) / 2;
    const zone = Math.abs(d) < 1 ? "境目" : d < 0 ? `フラット側へ${cm(-d)}cm` : `キャンバー側へ${cm(d)}cm`;
    return `<tr data-row class="${Math.abs(w - now) < 1 ? "row-now" : ""}"><td><b>${cm(w)}cm</b></td><td>${((w / h) * 100).toFixed(1)}%</td>` +
      `<td>${zone}</td><td>${sgnKg(kg(w))}</td><td>${mountText(G.resolveWidth(b, w, holes))}</td><td>${label(w)}</td>` +
      `<td><button class="btn-ghost" data-width="${w}">この幅にする</button></td></tr>`;
  }).join("");
  $("stance-guide").innerHTML =
    `<p class="read"><b>結論: 今は${cm(beg, 0)}cm（内側寄り）。プレスやオーリーを始めたら${cm(beg + D.holePitch, 0)}cm、ラントリとグラトリは${cm(run, 0)}cm。</b></p><ul class="guide-list">` +
    `<li><b>体重${wt}kgの軽さは、内側・外側を決める決め手にならない。</b>同じ体重なら足を内側に置くほど板の中央はたわみやすいが、${cm(beg, 0)}cmと${cm(b.refStance, 0)}cmの差は体重にして約${Math.abs(kg(beg)).toFixed(1)}kg分だけ（硬さが一様な板として計算した目安 <span class="tag tag-c">C</span>）。` +
    `逆にオーリーやプレスでノーズ/テールをしならせる動きは、足が外側ほどテコが長い <span class="tag tag-b">B</span>。どちらも小さい差なので、幅は身長と目的で決める。</li>` +
    `<li><b>身長${S.rd.height}cmの目安は${cm(h * 0.3)}〜${cm(h * 0.31)}cm</b>（身長の30〜31%。グラトリなどは2〜4cm広め <span class="tag tag-b">B</span>）。</li>` +
    `<li><b>CRAFTは足元がキャンバー、足の間がフラット。</b>基準の${cm(b.refStance, 0)}cmなら足がキャンバーに乗って反発とグリップが出る。内側に寄せるとフラット側に乗り、引っかかりにくく回しやすい <span class="tag tag-c">C</span>。</li>` +
    `<li><b>公式の${cm(lo)}〜${cm(hi)}cmは「取り付けられる範囲」</b>（穴${holes}個＋ディスクの溝）で、おすすめの範囲ではない。真ん中の${cm(b.refStance, 0)}cmが設計の基準。` +
    `コアはインサート部分を削って足元でしなるように作られている（Popster）ので、この範囲ならどこでも足元はしなる部分に乗る <span class="tag tag-c">C</span>。</li>` +
    `<li>軽さを補うのは幅ではなくターン中の荷重: エッジ角30°で体重の約1.15倍、45°で約1.41倍が板にかかる <span class="tag tag-a">A</span>（下の「エッジ角とターン」）。</li></ul>` +
    `<div class="table-wrap"><table class="su-table guide-table"><tr><th>幅</th><th>身長比</th><th>足元（推定）</th><th>板中央のたわみ<br>（基準幅との差を体重換算）</th><th>取り付け</th><th>目安</th><th></th></tr>${rows}</table></div>`;
}

// ---------- プリセット（比較・理由・変えたら） ----------
// 設定1つ分の数値。説明文（setup-data.js）はこの値で埋める
function metrics(p) {
  const b = S.bd, r = G.resolveWidth(b, p.width, b.holesPerRow);
  const w = G.footX(b, true, r.front.shift, r.front.slot) - G.footX(b, false, r.back.shift, r.back.slot);
  const pivot = (w / b.refStance - 1) * 100, flexKg = (G.flexRatio(b, w) - 1) * S.rd.weight, d = (w - b.refStance) / 2;
  const one = (front, f, angle) => {
    const o = G.overhang(b, G.bootOutline(G.footX(b, front, f.shift, f.slot), angle, S.es.bootLength, 110));
    return {
      edge: Math.round(Math.cos(angle * RAD) * 100), along: Math.round(Math.abs(Math.sin(angle * RAD)) * 100),
      drag: Math.round(G.dragAngle(Math.max(o.toe, o.heel), S.es.soleHeight)),
      holes: holesText(front, G.footX(b, front, f.shift)), slotT: slotText(f.slot),
    };
  };
  return {
    w, wcm: cm(w), pct: ((w / (S.rd.height * 10)) * 100).toFixed(1),
    pivotAbs: Math.abs(pivot).toFixed(0), pivotDir: Math.abs(pivot) < 0.5 ? "同じ" : pivot < 0 ? "小さい" : "大きい",
    flexKgAbs: Math.abs(flexKg).toFixed(1),
    zone: Math.abs(d) < 1 ? "キャンバーとの境目" : d < 0 ? `フラット側へ${cm(-d)}cm` : `キャンバー側へ${cm(d)}cm`,
    facingT: facingText((p.front + p.back) / 2), opening: p.front - p.back,
    sw: `${deg(-p.back)} / ${deg(-p.front)}`, sFacingT: facingText((-p.back - p.front) / 2),
    mountAll: mountText(r), F: one(true, r.front, p.front), B: one(false, r.back, p.back),
  };
}

// 今の設定がどのプリセットと一致するか（手動で変えていれば null）
function presetMatch() {
  return Object.keys(D.presets).find((k) => {
    const p = D.presets[k], r = G.resolveWidth(S.bd, p.width, S.bd.holesPerRow);
    return p.front === S.ft.angle && p.back === S.bk.angle && (p.leanStep || 0) === S.lean &&
      [r.front.shift, r.front.slot, r.back.shift, r.back.slot].join() === [S.ft.shift, S.ft.slot, S.bk.shift, S.bk.slot].join();
  }) || null;
}

// ---------- 数値で変わる小さな図（上から見た両足） ----------
// p = { width: mm, front: 度, back: 度 }。o.ghost に元の設定を渡すと破線で重ねる。o.cap は図の下の説明。
// o.show: "angles" 角度の数字 / "width" 幅の寸法 / "force" 膝の力の分解 / "facing" 体の向き / "opening" 開き / "switch" 逆向きと並べる
function stanceFig(p, o = {}) {
  if (!DG) return "";
  const K = DG.K, dir = S.rd.regular ? -1 : 1, sc = 0.3, cx = 160, hw = 38, L = 46, show = o.show || "angles";
  const toe = (a) => [dir * Math.sin(a * RAD), -Math.cos(a * RAD)]; // 画面上のつま先の向き（つま先側エッジが上）
  const footX = (q) => [cx + dir * (q.width / 2) * sc, cx - dir * (q.width / 2) * sc];
  const board = (cy, label) =>
    K.rect(12, cy - hw, 296, hw * 2, "dg-board") +
    K.text(16, cy + 4, dir < 0 ? "ノーズ" : "テール", { cls: "t-s t-dim" }) + K.text(304, cy + 4, dir < 0 ? "テール" : "ノーズ", { a: "end", cls: "t-s t-dim" }) +
    K.text(cx, cy - hw - 26, label, { a: "middle", cls: "t-s t-dim" });
  const feet = (q, cy, ghost, names) => { // names: 角度の数字を差し替える（逆向きのとき）
    const [fx, bx] = footX(q);
    let out = "";
    for (const [x, a, c] of [[fx, q.front, "front"], [bx, q.back, "back"]]) {
      out += K.bootTop(x, cy, 305 * sc, 110 * sc, dir * a, ghost ? "dg-guide" : "dg-boot dg-" + c);
      if (ghost) continue;
      const [tx, ty] = toe(a);
      out += K.arrow(x, cy, x + tx * L, cy + ty * L, c, 6);
      if (show !== "force") out += K.text(x + tx * L + (tx < -0.05 ? -3 : 3), cy + ty * L - 3, names ? names[c] : deg(a), { a: tx < -0.05 ? "end" : "start", cls: "t-s t-b t-" + c + " halo" });
      else {
        const ce = Math.round(Math.abs(Math.cos(a * RAD)) * 100), sn = Math.round(Math.abs(Math.sin(a * RAD)) * 100);
        out += K.arrow(x, cy, x, cy - 32, "dim", 5) + (sn ? K.arrow(x, cy, x + Math.sign(tx) * Math.max(10, sn * 0.5), cy, "dim", 5) : "");
        out += K.text(x, cy + hw + 14, deg(a) + " エッジ" + ce + "%", { a: "middle", cls: "t-s t-b t-" + c + " halo" });
        if (sn) out += K.text(x, cy + hw + 28, (a > 0 ? "ノーズへ" : "テールへ") + sn + "%", { a: "middle", cls: "t-s t-" + c + " halo" });
      }
    }
    return out;
  };
  const extra = (q, cy) => {
    const [fx, bx] = footX(q), y = cy + hw + 16;
    if (show === "width") return K.dim(Math.min(fx, bx), y, Math.max(fx, bx), y, cm(q.width) + "cm", 12);
    if (show === "facing") {
      const f = (q.front + q.back) / 2, [tx, ty] = toe(f);
      return K.tr(cx, cy, '<ellipse class="dg-fill" cx="0" cy="0" rx="11" ry="22"/>', dir * f) + K.arrow(cx, cy, cx + tx * 36, cy + ty * 36, "sky", 7) +
        K.text(cx, y, "体の向き " + (f > 0 ? "+" : f < 0 ? "−" : "") + Math.abs(f) + "°（前後の平均）", { a: "middle", cls: "t-s t-b t-sky halo" });
    }
    if (show === "opening") {
      const r = 32, oy = cy + 18, [ftx, fty] = toe(q.front), [btx, bty] = toe(q.back), a1 = Math.atan2(fty, ftx) / RAD, a2 = Math.atan2(bty, btx) / RAD;
      return K.arrow(cx, oy, cx + ftx * r, oy + fty * r, "front", 6) + K.arrow(cx, oy, cx + btx * r, oy + bty * r, "back", 6) +
        K.arc(cx, oy, 18, Math.min(a1, a2), Math.max(a1, a2), "dg-line") + K.text(cx, y, "開き " + (q.front - q.back) + "°", { a: "middle", cls: "t-s t-b halo" });
    }
    return "";
  };
  const cy = 78;
  let body, h;
  if (show === "switch") {
    // 立ち方は同じまま、進む向きだけが逆になる。角度は進む向きから読むので、テール側の足が前足になり、符号も反転する
    const nose = dir < 0 ? "←" : "→", tail = dir < 0 ? "→" : "←";
    body = board(cy, `いつもの向き（${nose} ノーズ側へ進む）`) + feet(p, cy) +
      board(cy + 140, `逆向き（テール側へ進む ${tail}）: テール側の足が前足`) + feet(p, cy + 140, false, { front: deg(-p.front), back: deg(-p.back) });
    h = cy + 140 + hw + 12;
  } else {
    body = board(cy, o.ghost ? "破線: 変える前" : "つま先側") + (o.ghost ? feet(o.ghost, cy, true) : "") + feet(p, cy) + extra(p, cy);
    h = cy + hw + (show === "force" ? 36 : show === "width" ? 34 : show === "angles" ? 12 : 26);
  }
  return '<figure class="dg-fig mini"><svg class="dg" viewBox="0 0 320 ' + h + '" role="img" aria-label="' + esc(o.cap || "上から見た両足") + '">' + body + "</svg>" +
    (o.cap ? "<figcaption>" + esc(o.cap) + "</figcaption>" : "") + "</figure>";
}

// プリセットの「なぜこの設定？」の項目に合う図
function whyFig(title, p) {
  const q = { width: p.width, front: p.front, back: p.back };
  if (title.startsWith("幅")) return stanceFig(q, { show: "width", cap: "スタンス幅は前後の足の中心の間隔。" });
  if (title.startsWith("前足")) return stanceFig(q, { show: "force", cap: "膝をつま先の方向に曲げたときの力の分解（エッジを踏む分・板の長さ方向へ押す分）。" });
  if (title.startsWith("後足")) return stanceFig(q, { show: "opening", cap: "前後の足の角度の差が「開き」。大きいほど股関節を外に回す柔らかさが要る。" });
  if (title.startsWith("前傾")) return fig("forward-lean");
  if (title.startsWith("角度")) return stanceFig(q, { show: "switch", cap: "左右対称なら、逆向きで滑っても足の角度が同じになる。" });
  if (title.startsWith("膝の力")) return stanceFig(q, { show: "force", cap: "前足はノーズへ、後足はテールへ、同じ割合で押す。" });
  if (title.startsWith("体の向き")) return stanceFig(q, { show: "facing", cap: "体（骨盤）は前後の角度の平均の方向を向きやすい。" });
  return "";
}

function renderPresets() {
  const keys = Object.keys(D.presets), cur = presetMatch(), ms = keys.map((k) => metrics(D.presets[k]));
  for (const btn of document.querySelectorAll(".seg [data-preset]")) btn.setAttribute("aria-pressed", btn.dataset.preset === cur);
  $("preset-when").innerHTML = cur ? `<b>${D.presets[cur].label}</b>: ${D.presets[cur].when}` : "プリセットから手動で変更中";

  const cls = (k) => (k === cur ? ' class="col-now"' : "");
  const row = (name, f) => `<tr><th>${name}</th>${keys.map((k, i) => `<td${cls(k)}>${f(D.presets[k], ms[i])}</td>`).join("")}</tr>`;
  $("preset-compare").innerHTML = `<div class="table-wrap"><table class="su-table compare">` +
    `<tr><th></th>${keys.map((k) => `<th${cls(k)}>${D.presets[k].label}${k === cur ? `<span class="badge">選択中</span>` : ""}</th>`).join("")}</tr>` +
    row("使う時期", (p) => p.when) +
    row("スタンス幅", (p, m) => `${m.wcm}cm（身長の${m.pct}%）`) +
    row("前足のネジ穴", (p, m) => m.F.holes) +
    row("後足のネジ穴", (p, m) => m.B.holes) +
    row("ディスクの溝", (p, m) => (m.F.slotT === m.B.slotT ? `両足とも${m.F.slotT}` : `前足 ${m.F.slotT} / 後足 ${m.B.slotT}`)) +
    row("角度（前足 / 後足）", (p) => `${deg(p.front)} / ${deg(p.back)}`) +
    row("体の向き", (p, m) => m.facingT) +
    row("開き（前足−後足）", (p, m) => `${m.opening}°`) +
    row("逆向き（スイッチ）", (p, m) => `${m.sw}・${m.sFacingT}`) +
    row("前傾", (p) => p.lean) +
    `<tr><th></th>${keys.map((k) => `<td${cls(k)}><button class="btn-ghost small" data-preset="${k}">この設定にする</button></td>`).join("")}</tr></table></div>`;

  const k = S.card in D.presets ? S.card : keys[0], p = D.presets[k], base = ms[keys.indexOf(k)];
  $("preset-card").innerHTML =
    `<div class="su-subtabs">${keys.map((x) => `<button class="btn-ghost small" data-card="${x}" aria-pressed="${x === k}">${D.presets[x].label}</button>`).join("")}</div>` +
    `<p class="read"><b>${p.label}</b>: ${p.intro}<br><span class="dim">使う時期: ${p.when}　設定: ${base.wcm}cm・${deg(p.front)} / ${deg(p.back)}・前傾${p.lean}</span></p>` +
    `<h3>なぜこの設定？</h3><dl class="why">${p.why.map(([t, f]) => `<dt>${t}</dt><dd>${tags(f(base, p))}${whyFig(t, p)}</dd>`).join("")}</dl>` +
    `<h3>変えたらどうなる？</h3><dl class="why">${p.whatIf.map(([t, ch, f]) => `<dt>${t}</dt><dd>${tags(f(metrics({ ...p, ...ch }), base))}` +
      (Object.keys(ch).length ? stanceFig({ width: p.width, front: p.front, back: p.back, ...ch }, { ghost: { width: p.width, front: p.front, back: p.back }, show: "width" in ch ? "width" : "angles", cap: "実線が変えたあと、破線が今のプリセット。" }) : "") + `</dd>`).join("")}</dl>` +
    `<p><button class="btn-accent" data-preset="${k}">この設定にする</button></p>`;
}

// ---------- 角度の4つの見方・ドラグ表 ----------
function renderAngleRead() {
  const f = S.ft.angle, k = S.bk.angle, pc = (a, fn) => Math.round(Math.abs(fn(a * RAD)) * 100);
  const now = { width: Math.round(foot(true).x - foot(false).x), front: f, back: k };
  const one = (name, a) => `${name} ${deg(a)}: エッジを踏む ${pc(a, Math.cos)}%` + (a ? `・${a > 0 ? "ノーズ" : "テール"}へ押す ${pc(a, Math.sin)}%` : "");
  $("angle-read").innerHTML = `<div class="cards">` +
    `<div class="card"><h3>① 膝で押す力の向き <span class="tag tag-a">A</span></h3><p>膝はつま先の方向に曲げるのが、ねじらない基本の形 <span class="tag tag-b">B</span>。そのとき板を傾ける分が cos（角度）、ノーズ/テールへ押す分が sin（角度）。</p><p><b>${one("前足", f)}<br>${one("後足", k)}</b></p>${stanceFig(now, { show: "force" })}</div>` +
    `<div class="card"><h3>② 体の向き <span class="tag tag-b">B</span></h3><p>骨盤は前後の角度の平均の方向を向きやすい。プラスが大きいほど進行方向を見やすく、0°は板に対して真横。</p><p>いま: <b>${facingText((f + k) / 2)}</b></p>${stanceFig(now, { show: "facing" })}</div>` +
    `<div class="card"><h3>③ 開き（前足−後足）</h3><p>大きいほど股関節を外に回す柔らかさが要る。足りないと、しゃがんだとき膝が内側に入りやすい <span class="tag tag-b">B</span>。必要な量は人による <span class="tag tag-c">C</span>。</p><p>いま: <b>${f - k}°</b></p>${stanceFig(now, { show: "opening" })}</div>` +
    `<div class="card"><h3>④ 逆向き（スイッチ）で滑ると</h3><p>前後の足が入れ替わり、角度の符号も反転する。左右対称に近いほどスイッチが楽。</p><p>いま: <b>${deg(-k)} / ${deg(-f)}</b>（${facingText((-k - f) / 2)}）</p>${stanceFig(now, { show: "switch" })}</div></div>`;
}

function renderDragTable() {
  const F = foot(true), rows = [0, 9, 12, 15, 18, 21, 24].map((a) => {
    const o = G.overhang(S.bd, G.bootOutline(F.x, a, S.es.bootLength, 110)), m = Math.max(o.toe, o.heel);
    return [a, Math.max(0, m).toFixed(0), G.dragAngle(m, S.es.soleHeight).toFixed(0)];
  });
  const tr = (name, i, unit) => `<tr><th>${name}</th>${rows.map((r) => `<td>${r[i]}${unit}</td>`).join("")}</tr>`;
  $("drag-table").innerHTML = `<div class="table-wrap"><table class="su-table">${tr("足の角度（±）", 0, "°")}${tr("はみ出し", 1, "mm")}${tr("雪に触れるエッジ角", 2, "°")}</table></div>`;
}

// ---------- 取り付け手順・床テスト ----------
function renderMount() {
  const F = foot(true), B = foot(false), oh = (ft) => `つま先${Math.max(0, ft.oh.toe).toFixed(0)}mm・かかと${Math.max(0, ft.oh.heel).toFixed(0)}mm`;
  const tb = ' <span class="tag tag-b">B</span>', tc = ' <span class="tag tag-c">C</span>', st = checkState();
  const groups = [
    ["準備", [
      ["用意するもの", "#3のプラスドライバー（サイズが合わないとネジ頭をなめる）とメジャー。" + tb, "tools-mount"],
      ["板を置く", `かかと側のエッジを手前にして、「設定と図」と同じ向きに置く（${S.rd.regular ? "レギュラーなのでノーズが左" : "グーフィーなのでノーズが右"}）。`, "board-orient"],
      ["角度を合わせる", `ディスクの目盛り（3°刻み）で、前足${deg(S.ft.angle)}・後足${deg(S.bk.angle)}。プラスはつま先がノーズ側。迷ったら図の矢印と見比べる。`, "disc-angle"],
    ]],
    ["固定する", [
      ["ネジ穴に合わせて置く", `前足は${holesText(true, F.holeX)}、後足は${holesText(false, B.holeX)}（どちらも2列とも）。`, "holes-place"],
      ["ディスクの溝の向き", `前足は${slotText(S.ft.slot)}、後足は${slotText(S.bk.slot)}。` +
        (S.ft.slot || S.bk.slot ? "溝を板の長さ方向に向けて、幅の微調整に使う。" : "幅の微調整には使わないので、溝を板の幅方向（つま先↔かかと）に向けて前後バランスの調整に使える。") +
        ` <span class="dim">（長さ方向＝幅の微調整、幅方向＝つま先・かかとの前後バランス。同時にはできない）</span>` + tc, "disc-slot"],
      ["仮止め", "4本のネジを手で数回まわして入れる。まだ締めない。", "screw-hand"],
      ["センタリング", `ブーツを入れ、つま先とかかとのはみ出しがほぼ同じになるよう、つま先側・かかと側の方向にずらす。エッジの真上に定規を立てると測りやすい（計算の目安: 前足 ${oh(F)}、後足 ${oh(B)}${tc}）。`, "overhang-measure"],
      ["本締め", "4本を対角の順に少しずつ均等に締める。電動工具は使わない。締めすぎるとインサートを傷めるので、しっかり締まったところで止める。" + tb],
    ]],
    ["ブーツに合わせる", [
      ["サイズと左右", "ブーツを入れ、かかとがヒールカップの奥に収まり、ストラップの長さに余裕があるか確かめる（27.5cmは日本公式のMの上限）。ラチェットが足の外側に来る向きが目安。" + tb, "size-m"],
      ["フットベッドの左右", `L＝左足・R＝右足。${S.rd.regular ? "レギュラーなので L がノーズ側（前足）、R がテール側（後足）" : "グーフィーなので R がノーズ側（前足）、L がテール側（後足）"}。入れたら、傾きの高い側が外側（板の中心から遠い側）に来ているか見る。つま先の下はトゥランプで上がっているので、土踏まずのあたりで、かかとから同じ距離の2点を比べる。` + tb, "cant"],
      ["トゥランプ", "つま先の下の台を工具なしで前後にずらし、ブーツのつま先の下にすき間ができない位置にする。" + tb, "toe-ramp"],
      ["アンクルストラップ", "締めたときにパッドの中心が足首の前に来るように合わせる。締まり切らなければ短く、ラチェットに届かなければ長く（MicroMaxで微調整）。" + tb, "ankle-strap"],
      ["トゥストラップ", "つま先に被せる形。つま先の上側に被さり、ずれて甲に乗らない長さにする。" + tb, "toe-strap"],
      ["前傾", `「${LEAN[S.lean]}」にする（「設定と図」で変えられる）。RHYTHMは工具なしで動かせる。`, "forward-lean"],
      ["ハイバックの向き", "回せる場合は、板のかかと側エッジと平行に近づけるとヒールサイドの反応が直接的。" + tb + " RHYTHMで回せるかは実物で確認。" + tc, "highback-parallel"],
    ]],
    ["確認する", [
      ["記録", "ページ上部の「この設定で板に取り付けた」を押す。あとで図の設定と板の設定の違いが分かる。"],
      ["緩みの確認", "滑る前と、1本滑った後にネジの緩みを確認する。" + tb, "screw-check-timing"],
    ]],
  ];
  let no = 0;
  $("mount-steps").innerHTML = groups.map(([name, items]) => `<h3>${name}</h3><ol class="steps check" start="${no + 1}">` +
    items.map(([t, body, f]) => { const id = `mount-${no++}`; return `<li><label><input type="checkbox" data-check="${id}"${st[id] ? " checked" : ""}><span><b>${t}:</b> ${body}</span></label>${fig(f)}</li>`; }).join("") +
    `</ol>`).join("") + `<p class="read"><button class="btn-ghost small" data-check-reset="mount">チェックを外す</button></p>`;
  $("floor-tape").innerHTML = `<p class="read">テープで貼る足形: 前後の足の中心の間隔 <b>${cm(F.x - B.x)}cm</b>、前足 <b>${deg(S.ft.angle)}</b>・後足 <b>${deg(S.bk.angle)}</b>（「図で確認」の上から見た図と同じ形）。</p>`;
}

// ---------- PCとスマホでデータを受け渡す（リンク・QRコード） ----------
// サーバーがないので自動同期はできない。保存データを圧縮して URL の #import= に入れ、もう片方の端末で開いて取り込む。
const b64u = {
  enc: (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
  dec: (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};
const pipeBytes = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
async function packData() {
  const data = { v: 1, state: store.get(STORE, null), log: readLog(), mounted: store.get(MOUNTED, null), checks: checkState() };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return typeof CompressionStream === "function" ? "z." + b64u.enc(await pipeBytes(bytes, new CompressionStream("deflate-raw"))) : "j." + b64u.enc(bytes);
}
async function unpackData(t) {
  const bytes = b64u.dec(t.slice(2)), raw = t.startsWith("z.") ? await pipeBytes(bytes, new DecompressionStream("deflate-raw")) : bytes;
  const data = JSON.parse(new TextDecoder().decode(raw));
  if (!data || data.v !== 1) throw new Error("形式が違う");
  return data;
}
// 受け取ったデータは形をそろえてから保存する（壊れた・細工されたリンクで画面が壊れないように）
const num0 = (v) => (Number.isFinite(+v) ? Math.round(+v) : 0);
const str = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
function cleanSnap(s) {
  if (!s || typeof s !== "object") return null;
  const f = (x = {}) => ({ angle: num0(x.angle), shift: num0(x.shift), slot: num0(x.slot) });
  return { key: s.key in D.boards ? s.key : Object.keys(D.boards)[0], width: num0(s.width), ft: f(s.ft), bk: f(s.bk), lean: Math.max(0, Math.min(3, num0(s.lean))), preset: s.preset in D.presets ? s.preset : null };
}
function cleanLog(e) {
  const set = e && cleanSnap(e.set);
  return set && { date: str(e.date, 10), snow: str(e.snow, 40), place: str(e.place, 100), feel: e.feel in FEEL ? e.feel : "same", note: str(e.note), set };
}
async function importData(t) {
  showTab("log");
  try { history.replaceState(null, "", location.pathname + "#log"); } catch { /* 使えない環境では何もしない */ }
  let data;
  try { data = await unpackData(t); } catch { alert("データを読み取れませんでした。リンクが途中で切れていないか確認してください。"); return; }
  const inLog = (Array.isArray(data.log) ? data.log : []).map(cleanLog).filter(Boolean), cur = readLog();
  const mounted = data.mounted && cleanSnap(data.mounted.set) ? { date: str(data.mounted.date, 10), set: cleanSnap(data.mounted.set) } : null;
  if (!confirm("もう片方の端末のデータを取り込みます。\n" + (data.state ? "・設定: 送った側の設定に置き換える\n" : "") +
    `・記録: ${inLog.length}件を合わせる（同じ記録は1つにまとめる）\n` + (data.checks ? "・チェック: 送った側に置き換える\n" : "") +
    (mounted ? "・板に取り付けた設定: 日付の新しい方を使う\n" : "") + "よろしいですか？")) return;
  if (data.state && typeof data.state === "object") store.set(STORE, data.state); // 数値のチェックは restore() で行う
  const seen = new Set(cur.map((x) => JSON.stringify(x)));
  store.set(LOG, cur.concat(inLog.filter((x) => !seen.has(JSON.stringify(x)))).sort((a, b) => String(a.date).localeCompare(String(b.date))));
  if (data.checks && typeof data.checks === "object") store.set(CHECK, Object.fromEntries(Object.entries(data.checks).filter(([k, v]) => /^[\w-]{1,40}$/.test(k) && (v === 1 || v === true)).map(([k]) => [k, 1])));
  const m = store.get(MOUNTED, null);
  if (mounted && (!m || mounted.date >= String(m.date))) store.set(MOUNTED, mounted);
  location.reload();
}

// ---------- 保存まわりの共通 ----------
const LEAN = ["一番弱く", "1段強く", "2段強く", "3段強く"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const store = {
  get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できない環境では何もしない */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* 同上 */ } },
};
const STORE = "snowboard.setup.v1", LOG = "snowboard.setupLog.v1", MOUNTED = "snowboard.setupMounted.v1", CHECK = "snowboard.setupCheck.v1";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// ---------- 設定の保存と復元 ----------
function save() {
  store.set(STORE, { v: D.version, key: S.key, bd: S.bd, es: S.es, rd: S.rd, ft: S.ft, bk: S.bk, lean: S.lean, edge: S.edge });
}
function restore() {
  const o = store.get(STORE, null);
  if (!o || !D.boards[o.key]) return false;
  loadBoard(o.key);
  const nums = (dst, src) => { for (const k of Object.keys(dst)) if (typeof dst[k] === "number" && src && Number.isFinite(+src[k]) && src[k] !== null && src[k] !== "") dst[k] = +src[k]; };
  if (o.v === D.version) { nums(S.bd, o.bd); nums(S.es, o.es); } // 板データの形が変わっていたら数値は捨てる
  nums(S.rd, o.rd);
  if (o.rd && typeof o.rd.regular === "boolean") S.rd.regular = o.rd.regular;
  const m = G.maxShift(S.bd.holesPerRow), lim = (v, lo, hi) => Math.max(lo, Math.min(hi, +v || 0));
  const fix = (f = {}) => ({ angle: lim(Math.round((+f.angle || 0) / 3) * 3, -30, 45), shift: lim(f.shift, -m, m), slot: lim(f.slot, -D.discSlot, D.discSlot) });
  S.ft = fix(o.ft); S.bk = fix(o.bk); S.lean = lim(o.lean, 0, 3); S.edge = lim(o.edge || 30, 5, 70);
  return true;
}

// ---------- 設定のスナップショットと差分 ----------
function snapshot() {
  const F = foot(true), B = foot(false);
  return { key: S.key, width: Math.round(F.x - B.x), ft: { ...S.ft }, bk: { ...S.bk }, lean: S.lean, preset: presetMatch() };
}
const setText = (s) => `幅${cm(s.width)}cm・前足${deg(s.ft.angle)}・後足${deg(s.bk.angle)}・前傾${LEAN[s.lean] ?? "?"}`;
function diffList(a, b) {
  if (!a) return [];
  const out = [];
  if (a.width !== b.width) out.push(`幅 ${cm(a.width)}→${cm(b.width)}cm`);
  if (a.ft.angle !== b.ft.angle) out.push(`前足 ${deg(a.ft.angle)}→${deg(b.ft.angle)}`);
  if (a.bk.angle !== b.bk.angle) out.push(`後足 ${deg(a.bk.angle)}→${deg(b.bk.angle)}`);
  if (a.lean !== b.lean) out.push(`前傾 ${LEAN[a.lean]}→${LEAN[b.lean]}`);
  if (a.width === b.width && ["shift", "slot"].some((k) => a.ft[k] !== b.ft[k] || a.bk[k] !== b.bk[k])) out.push("穴の位置（幅は同じ）");
  return out;
}
const chipsHtml = (list) => list.map((t) => `<span class="chip">${esc(t)}</span>`).join("");

// ---------- いまのセッティング（ページ上部） ----------
function renderHero() {
  const F = foot(true), B = foot(false);
  const item = (label, value, unit, sw) =>
    `<div><span class="k">${sw ? `<span class="swatch sw-${sw}"></span>` : ""}${label}</span>` +
    `<span class="v${unit === null ? " text" : ""}">${value}${unit ? `<small>${unit}</small>` : ""}</span></div>`;
  $("hero-spec").innerHTML =
    item("スタンス幅", cm(F.x - B.x), "cm") + item("前足の角度", deg(S.ft.angle), "", "front") +
    item("後足の角度", deg(S.bk.angle), "", "back") + item("前傾", LEAN[S.lean], null);
  const chips = (front, ft) => holePair(front, ft.holeX).map((v) => `<span class="tape-chip">${v}</span>`).join("・");
  $("hero-mount").innerHTML =
    `<span><span class="swatch sw-front"></span> 前足のネジ穴: ノーズ先端から ${chips(true, F)} cm（${slotText(S.ft.slot)}）</span>` +
    `<span><span class="swatch sw-back"></span> 後足のネジ穴: テール先端から ${chips(false, B)} cm（${slotText(S.bk.slot)}）</span>`;
  const m = store.get(MOUNTED, null), d = m ? diffList(m.set, snapshot()) : null;
  $("hero-mounted").innerHTML = !m
    ? "板に付けたら「この設定で板に取り付けた」を押しておくと、あとで図の設定と板の設定の違いが分かります。"
    : !d.length ? `板に付いている設定（${esc(m.date)}に記録）と同じです。`
    : `板に付いている設定（${esc(m.date)}に記録）から変えた所: ${chipsHtml(d)}` +
      (d.length > 1 ? ` <span class="warn-inline">${ICON("triangle-alert", { size: 15 })} ${d.length}か所。1回に1か所がおすすめ</span>` : "");
}

// ---------- 記録（調整ログ） ----------
const FEEL = { first: "初めての設定", good: "良くなった", same: "変わらない", bad: "悪くなった" };
const readLog = () => { const a = store.get(LOG, []); return Array.isArray(a) ? a : []; };

function renderLog() {
  const log = readLog(), cur = snapshot(), last = log[log.length - 1], d = diffList(last && last.set, cur);
  const m = store.get(MOUNTED, null), dm = m ? diffList(m.set, cur) : [];
  $("log-diff").innerHTML = (!last
    ? `最初の記録になります。いまのセッティング: <b>${setText(cur)}</b>`
    : !d.length ? `前回の記録（${esc(last.date)}）から変えた所はありません。`
    : `前回の記録（${esc(last.date)}）から変えた所: ${chipsHtml(d)}` +
      (d.length > 1 ? `<br><span class="warn-inline">${ICON("triangle-alert", { size: 15 })} ${d.length}か所変わっています。どれが効いたか分かるよう、1回に1か所がおすすめ。</span>` : "")) +
    (dm.length ? `<br><span class="warn-inline">${ICON("triangle-alert", { size: 15 })} 図の設定が、板に付いている設定と違います。実際に滑った設定で記録してください。</span>` : "");
  if (!$("log-date").value) $("log-date").value = today();
  $("log-list").innerHTML = log.length
    ? log.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => {
        const dd = diffList(log[i - 1] && log[i - 1].set, e.set);
        return `<li class="log-item"><header><span><b>${esc(e.date)}</b> ${esc(e.place)} ${esc(e.snow)}</span><span>${FEEL[e.feel] || ""}</span></header>` +
          `<div class="log-set">${setText(e.set)}</div>` + (dd.length ? `<div>${chipsHtml(dd)}</div>` : "") +
          (e.note ? `<p>${esc(e.note)}</p>` : "") +
          `<div class="ctl-actions"><button class="btn-ghost small" data-log-restore="${i}">この設定を図に戻す</button>` +
          `<button class="btn-ghost small" data-log-del="${i}">削除</button></div></li>`;
      }).join("")
    : `<li class="log-empty">まだ記録がありません。滑った日に、上のフォームから残してください。</li>`;
}

// ---------- 読みもの（setup-content.js） ----------
const CT = globalThis.SETUP_CONTENT || null;
const checkState = () => store.get(CHECK, {}) || {};
const gradeTag = (g) => (g ? ` <span class="tag tag-${String(g).toLowerCase()}">${esc(g)}</span>` : "");
const srcLinks = (list) => (list && list.length
  ? ` <span class="hint">出典 ${list.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">[${i + 1}]</a>`).join(" ")}</span>` : "");
// アイコン（vendor/lucide.js）。読み込めなければ何も出さない
const ICON = (name, o) => (globalThis.LUCIDE ? LUCIDE.icon(name, o) : "");
function fillIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    if (el.dataset.iconDone) continue;
    el.innerHTML = ICON(el.dataset.icon, { size: +el.dataset.size || 18 });
    el.dataset.iconDone = "1";
  }
}

// 説明の図（setup-diagrams.js）。読み込めなければ図なしで表示する
const DG = globalThis.SETUP_DIAGRAMS;
const fig = (id) => (DG && id ? DG.html(id) : "");
const sectionHtml = (s) =>
  `<section class="su-panel"><h2>${esc(s.title)}</h2>` + (s.intro ? `<p class="read">${esc(s.intro)}</p>` : "") +
  `<dl class="why">${(s.items || []).map((it) => `<dt>${esc(it.h)}</dt><dd>${esc(it.body)}${gradeTag(it.grade)}${srcLinks(it.sources)}${fig(it.fig)}</dd>`).join("")}</dl></section>`;

function renderChecks() {
  if (!CT) return;
  const st = checkState();
  $("ride-checks").innerHTML = CT.ride.checklists.map((l) => {
    const done = l.items.filter((_, i) => st[`${l.id}-${i}`]).length;
    return `<h3>${esc(l.title)} <span class="check-progress">${done}/${l.items.length}</span></h3><ul class="checklist">` +
      l.items.map((t, i) => `<li><label><input type="checkbox" data-check="${esc(l.id)}-${i}"${st[`${l.id}-${i}`] ? " checked" : ""}><span>${esc(t)}</span></label></li>`).join("") +
      `</ul><button class="btn-ghost small" data-check-reset="${esc(l.id)}">チェックを外す</button>`;
  }).join("");
}

function renderGlossary() {
  if (!CT) return;
  const q = ($("glossary-filter").value || "").trim();
  const list = CT.glossary.filter((g) => !q || g.term.includes(q) || g.def.includes(q));
  $("glossary").innerHTML = list.length
    ? list.map((g) => `<dt>${esc(g.term)}</dt><dd>${esc(g.def)}${gradeTag(g.grade)}${fig(g.fig)}</dd>`).join("")
    : `<dd class="hint">「${esc(q)}」に当てはまる用語はありません。</dd>`;
}

// setup.html に直接書いた説明の図と、表の行の「図」ボタン
function fillStaticFigs() {
  for (const box of document.querySelectorAll("div[data-fig]")) box.innerHTML = fig(box.dataset.fig);
  for (const tr of document.querySelectorAll("tr[data-fig]")) {
    if (!DG || !DG.has(tr.dataset.fig) || tr.querySelector(".fig-btn")) continue;
    tr.cells[0].insertAdjacentHTML("beforeend", ` <button type="button" class="fig-btn" data-fig-open aria-expanded="false">${ICON("spline", { size: 13 })}図</button>`);
  }
}

// ---------- 上達のロードマップ ----------
// 「次へ進む目安」のチェックは他のチェックリストと同じ仕組みで保存する（id: grow-<段階>-<番号>）。
// 全部チェックが付いた段階はクリア。いちばん手前の未クリアの段階が「いまここ」。
const anim = (id) => (globalThis.SETUP_ANIM && id && SETUP_ANIM.has(id) ? SETUP_ANIM.html(id) : "");
const stageDone = (s, st) => s.checks.every((_, i) => st[`grow-${s.id}-${i}`]);
function growCurrent() {
  const g = CT.grow, st = checkState(), i = g.stages.findIndex((s) => !stageDone(s, st));
  return (i < 0 ? g.stages[g.stages.length - 1] : g.stages[i]).id;
}

function growVideo(v) {
  return `<div class="video"><button type="button" class="video-play" data-yt="${esc(v.videoId)}" aria-label="${esc(v.title)}を再生">${ICON("play", { size: 18 })}</button>` +
    `<div class="video-meta"><b>${esc(v.title)}</b><span class="hint">${esc(v.channel)}${v.minutes ? `・約${Math.round(v.minutes)}分` : ""}</span>` +
    (v.why ? `<span>${esc(v.why)}</span>` : "") +
    `<a class="hint" href="https://www.youtube.com/watch?v=${esc(v.videoId)}" target="_blank" rel="noopener">YouTubeで開く</a></div></div>`;
}

function growStage(s, st, cur) {
  const n = s.checks.filter((_, i) => st[`grow-${s.id}-${i}`]).length, isCur = s.id === cur, isDone = stageDone(s, st);
  const figure = (s.anims || []).map(anim).join("") || fig(s.fig);
  const points = (s.points || []).length
    ? `<h4>動きのポイント</h4><dl class="why">${s.points.map((p) => `<dt>${esc(p.h)}</dt><dd>${esc(p.body)}${gradeTag(p.grade)}${srcLinks(p.sources)}</dd>`).join("")}</dl>` : "";
  const drills = (s.drills || []).length
    ? `<h4>練習メニュー</h4><ol class="steps">${s.drills.map((d) => `<li><b>${esc(d.name)}</b> <span class="hint">${esc(d.where)}</span>` +
      `<ol class="drill">${d.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` +
      `<span class="drill-goal">できたと分かる目安: ${esc(d.goal)}</span>${gradeTag(d.grade)}${srcLinks(d.sources)}</li>`).join("")}</ol>` : "";
  const mistakes = (s.mistakes || []).length
    ? `<h4>よくある失敗</h4><div class="table-wrap"><table class="su-table"><tr><th>こうなったら</th><th>原因</th><th>直し方</th></tr>` +
      s.mistakes.map((m) => `<tr><td>${esc(m.sign)}</td><td>${esc(m.cause)}</td><td>${esc(m.fix)}${gradeTag(m.grade)}${srcLinks(m.sources)}</td></tr>`).join("") + `</table></div>` : "";
  const videos = (s.videos || []).length
    ? `<h4>動画で見る <span class="hint">電波のある所で。タップすると再生（YouTube）</span></h4><div class="videos">${s.videos.map(growVideo).join("")}</div>` +
      (s.searchQuery ? `<p class="hint"><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(s.searchQuery)}" target="_blank" rel="noopener">${ICON("search", { size: 15 })} YouTubeでほかの動画を探す</a></p>` : "") : "";
  const checks = `<h4>次へ進む目安 <span class="check-progress">${n}/${s.checks.length}</span></h4><ul class="checklist">` +
    s.checks.map((c, i) => `<li><label><input type="checkbox" data-check="grow-${esc(s.id)}-${i}"${st[`grow-${s.id}-${i}`] ? " checked" : ""}><span>${esc(c)}</span></label></li>`).join("") + `</ul>`;
  const badge = isCur ? `<span class="badge">いまここ</span>` : isDone ? `<span class="badge done">クリア</span>` : "";
  return `<details class="su-panel stage${isCur ? " now" : ""}" data-stage="${esc(s.id)}"${isCur ? " open" : ""}><summary><span class="ic-open">${ICON("chevron-right", { size: 16 })}</span><b>${esc(s.title)}</b><span class="stage-badge">${badge}</span>` +
    `<span class="check-progress">${n}/${s.checks.length}</span></summary>` +
    `<p class="read">${esc(s.goal)}</p>${figure}${points}${drills}${mistakes}${videos}${checks}` +
    `<p class="read"><b>見直すセッティング:</b> ${esc(s.setting)}${gradeTag(s.grade)}</p>` +
    (s.note ? `<p class="read hint">${esc(s.note)}</p>` : "") +
    (s.safety ? `<p class="warn">安全: ${esc(s.safety)}</p>` : "") +
    ((s.sources || []).length ? `<p class="read">${srcLinks(s.sources)}</p>` : "") + `</details>`;
}

function renderGrow() {
  if (!CT) return;
  const g = CT.grow, st = checkState(), cur = growCurrent(), now = g.stages.find((s) => s.id === cur) || g.stages[0];
  const done = g.stages.filter((s) => stageDone(s, st)).length;
  $("grow").innerHTML =
    `<section class="su-panel"><h2>上達のロードマップ</h2><p class="read">${esc(g.intro)}</p>` +
    `<p class="read" id="grow-now"><b>いまここ: ${esc(now.title)}</b>（${g.stages.length}段階中 ${done}段階クリア）</p>` +
    `<p class="hint">各段階の「次へ進む目安」にチェックを付けると、次の段階が「いまここ」になります。チェックはこの端末に保存されます。動く図は再生ボタンで動き、スライダーでコマ送りできます。</p></section>` +
    g.stages.map((s) => growStage(s, st, cur)).join("") +
    `<p class="callout">基本姿勢〜カービング入門の練習メニューは、フォーム分析アプリの「<a href="index.html#lessons">${ICON("book-open", { size: 15 })} レッスン</a>」と「<a href="index.html#training">${ICON("dumbbell", { size: 15 })} オフトレ</a>」にあります。</p>`;
  if (globalThis.SETUP_ANIM) SETUP_ANIM.attach($("grow"));
}

// チェックを付け外ししたときに、進み具合と「いまここ」だけを書き換える（描き直すと入力中の位置が飛ぶため）
function growUpdate() {
  if (!CT) return;
  const g = CT.grow, st = checkState(), cur = growCurrent(), done = g.stages.filter((s) => stageDone(s, st)).length;
  const now = g.stages.find((s) => s.id === cur) || g.stages[0];
  const head = $("grow-now");
  if (head) head.innerHTML = `<b>いまここ: ${esc(now.title)}</b>（${g.stages.length}段階中 ${done}段階クリア）`;
  for (const s of g.stages) {
    const el = document.querySelector(`details.stage[data-stage="${s.id}"]`);
    if (!el) continue;
    const n = s.checks.filter((_, i) => st[`grow-${s.id}-${i}`]).length;
    for (const p of el.querySelectorAll(".check-progress")) p.textContent = `${n}/${s.checks.length}`;
    el.classList.toggle("now", s.id === cur);
    const b = el.querySelector(".stage-badge");
    if (b) b.innerHTML = s.id === cur ? `<span class="badge">いまここ</span>` : stageDone(s, st) ? `<span class="badge done">クリア</span>` : "";
  }
}

function renderContent() {
  const none = `<section class="su-panel"><p class="warn">読みもののデータ（setup-content.js）を読み込めませんでした。</p></section>`;
  if (!CT) { for (const id of ["ride-sections", "gear-extra", "care", "grow"]) $(id).innerHTML = none; return; }
  $("ride-sections").innerHTML = CT.ride.sections.map(sectionHtml).join("");
  $("gear-extra").innerHTML = CT.gear.sections.map(sectionHtml).join("");
  $("care").innerHTML = CT.care.sections.map(sectionHtml).join("");
  renderGrow();
  $("faq").innerHTML = CT.faq.map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}${gradeTag(f.grade)}${srcLinks(f.sources)}</p>${fig(f.fig)}</details>`).join("");
  $("sources-extra").innerHTML = (CT.sources || []).map((s) => `<li>${esc(s.label)}: <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></li>`).join("");
  renderGlossary();
  renderChecks();
}

// ---------- 取り付けシート（印刷） ----------
function buildPrintSheet() {
  const F = foot(true), B = foot(false), k = presetMatch(), d = new Date();
  const row = (label, v) => `<tr><th>${label}</th><td>${v}</td></tr>`;
  const before = CT ? CT.ride.checklists.find((l) => l.id === "before") : null;
  $("print-sheet").innerHTML =
    `<h1>${esc(D.boards[S.key].label)} 取り付けシート</h1>` +
    `<p>${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 作成　${k ? `プリセット: ${D.presets[k].label}` : "プリセットから変更した設定"}　${S.rd.regular ? "レギュラー（左足が前）" : "グーフィー（右足が前）"}</p>` +
    `<div class="ps-svg">${$("top").outerHTML.replace('id="top"', 'id="top-print"')}</div>` +
    `<table>${row("スタンス幅", `${cm(F.x - B.x)}cm（床テストの足形もこの間隔）`)}` +
    row("前足", `${deg(S.ft.angle)}　${holesText(true, F.holeX)}（2列とも）　${slotText(S.ft.slot)}`) +
    row("後足", `${deg(S.bk.angle)}　${holesText(false, B.holeX)}（2列とも）　${slotText(S.bk.slot)}`) +
    row("前傾", LEAN[S.lean]) + `</table>` +
    `<h2>取り付けの確認</h2><ul class="ps-check">` +
    ["#3のプラスドライバーで、4本を対角の順に少しずつ均等に締めた（電動工具は使わない）", "つま先とかかとのはみ出しがほぼ同じ", "トゥランプがブーツのつま先に合っている",
      "ストラップの中心がブーツの中心に来ている", "1本滑ったあと、ネジの緩みを確認した"].map((t) => `<li>${t}</li>`).join("") + `</ul>` +
    (before ? `<h2>${esc(before.title)}</h2><ul class="ps-check">${before.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "");
}

// ---------- スマホで表を読みやすく（見出しを各セルに付けてカード型にする） ----------
function stackTables() {
  for (const table of document.querySelectorAll(".su-table")) {
    const rows = [...table.rows], head = rows.find((r) => [...r.cells].every((c) => c.tagName === "TH") && !r.classList.contains("group"));
    if (!head) continue;
    table.classList.add("stack");
    const labels = [...head.cells].map((c) => [...c.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()); // バッジ（選択中）は見出しに含めない
    head.classList.add("head");
    for (const r of rows) {
      if (r === head || r.classList.contains("group") || r.classList.contains("fig-row")) continue;
      [...r.cells].forEach((c, i) => { if (labels[i]) c.dataset.label = labels[i]; });
    }
  }
}

// ---------- 全体 ----------
function render() {
  $("ft-angle-out").textContent = deg(S.ft.angle);
  $("bk-angle-out").textContent = deg(S.bk.angle);
  $("ft-shift-out").textContent = shiftText(S.ft.shift);
  $("bk-shift-out").textContent = shiftText(S.bk.shift);
  $("ft-slot-out").textContent = slotText(S.ft.slot);
  $("bk-slot-out").textContent = slotText(S.bk.slot);
  renderTop(); renderStanceGuide(); renderPresets(); renderAngleRead(); renderDragTable(); renderMount(); renderDetail(true); renderDetail(false); renderSide(); renderCarve(); renderMap(); renderWarnings(); renderHero(); renderLog(); stackTables(); save();
}

for (const input of inputs) {
  input.addEventListener("input", () => {
    const k = input.dataset.k, v = parseFloat(input.value) * (+input.dataset.mul || 1);
    const [lo, hi] = LIMITS[k] || [-Infinity, Infinity];
    const ok = Number.isFinite(v) && v >= lo && v <= hi &&
      !(k === "bd.holesPerRow" && v % 2 !== 1) &&
      !(k === "bd.effectiveEdge" && v > S.bd.totalLength - 40) &&
      !(k === "bd.totalLength" && v < S.bd.effectiveEdge + 40) &&
      !(k === "bd.noseDiff" && (S.bd.totalLength - Math.abs(v)) / 2 < S.bd.effectiveEdge / 2 + 40);
    input.classList.toggle("bad", !ok);
    if (!ok) return;
    setK(k, v);
    if (k === "bd.holesPerRow") {
      const m = G.maxShift(v);
      for (const f of [S.ft, S.bk]) f.shift = Math.max(-m, Math.min(m, f.shift));
      syncInputs();
    }
    render();
  });
}
$("board").addEventListener("change", (e) => { loadBoard(e.target.value); applyPreset("beginner"); syncInputs(); render(); });
$("regular").addEventListener("change", (e) => { S.rd.regular = e.target.value === "1"; render(); });
$("edge").addEventListener("input", (e) => { S.edge = +e.target.value; renderCarve(); save(); });
$("lean").addEventListener("change", (e) => { S.lean = +e.target.value; render(); });

function showTab(name) {
  for (const t of document.querySelectorAll("[data-tab]")) t.setAttribute("aria-selected", t.dataset.tab === name);
  for (const p of document.querySelectorAll("[data-panel]")) p.hidden = p.dataset.panel !== name;
  try { history.replaceState(null, "", "#" + name); } catch { /* 使えない環境では何もしない */ }
  const bar = document.querySelector(".su-tabs"), panel = document.querySelector(`[data-panel="${name}"]`);
  const y = panel.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - 8;
  if (window.scrollY > y) window.scrollTo(0, y); // 下の方でタブを押しても、新しいタブの先頭が見える
  fitFigs(name);
}

// 横スクロールする図を見せたい所に合わせる（隠れたタブでは幅が0なので、開いたときに行う）
function fitFigs(name) {
  const ids = name === "setup" ? ["top", "side"] : name === "why" ? ["map"] : [];
  for (const id of ids) {
    const box = $(id).parentElement;
    box.scrollLeft = id === "map" ? box.scrollWidth : (box.scrollWidth - box.clientWidth) / 2; // マップはスタイルの枠がある右側
  }
}

document.addEventListener("click", (e) => {
  const fo = e.target.closest("[data-fig-open]");
  if (fo) { // 表の行の図を、その行のすぐ下に開く・閉じる
    const tr = fo.closest("tr"), next = tr.nextElementSibling, open = !!next && next.classList.contains("fig-row");
    if (open) next.remove(); else tr.insertAdjacentHTML("afterend", `<tr class="fig-row"><td colspan="${tr.cells.length}">${fig(tr.dataset.fig)}</td></tr>`);
    fo.setAttribute("aria-expanded", String(!open));
    return;
  }
  const yt = e.target.closest("[data-yt]");
  if (yt) { // 動画はタップされてから読み込む（通信量とページの重さを抑えるため）
    yt.closest(".video").outerHTML = `<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${esc(yt.dataset.yt)}?autoplay=1" title="解説動画" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    return;
  }
  const step = e.target.closest("[data-step]");
  if (step) {
    const input = step.parentElement.querySelector('input[type="range"]');
    const v = Math.max(+input.min, Math.min(+input.max, +input.value + +step.dataset.step * (+input.step || 1)));
    if (v !== +input.value) { input.value = v; input.dispatchEvent(new Event("input")); }
    return;
  }
  const reset = e.target.closest("[data-check-reset]");
  if (reset) {
    if (!confirm("このリストのチェックをすべて外します。よろしいですか？")) return;
    const st = checkState();
    for (const k of Object.keys(st)) if (k.startsWith(reset.dataset.checkReset + "-")) delete st[k];
    store.set(CHECK, st); renderChecks(); renderMount();
    return;
  }
  const t = e.target.closest("[data-tab], [data-goto], [data-card], [data-preset]");
  if (!t) return;
  if (t.dataset.goto) { S.card = presetMatch() || S.card; renderPresets(); stackTables(); }
  if (t.dataset.tab || t.dataset.goto) return showTab(t.dataset.tab || t.dataset.goto);
  S.card = t.dataset.card || t.dataset.preset;
  if (t.dataset.preset) { applyPreset(t.dataset.preset); syncInputs(); render(); } else { renderPresets(); stackTables(); }
});

document.addEventListener("change", (e) => {
  const c = e.target.closest("[data-check]");
  if (!c) return;
  const st = checkState();
  if (c.checked) st[c.dataset.check] = 1; else delete st[c.dataset.check];
  store.set(CHECK, st);
  if (c.dataset.check.startsWith("grow-")) { growUpdate(); return; }
  const ul = c.closest("ul.checklist"), progress = ul && ul.previousElementSibling && ul.previousElementSibling.querySelector(".check-progress");
  if (progress) { const boxes = [...ul.querySelectorAll("input")]; progress.textContent = `${boxes.filter((b) => b.checked).length}/${boxes.length}`; }
});

const TAG_TITLE = { A: "A: 物理・幾何で導ける", B: "B: 業界の目安（複数の情報源が一致）", C: "C: 推定・未確定（実物で確認）" };
document.addEventListener("mouseover", (e) => {
  const t = e.target.closest(".tag");
  if (t && !t.title) t.title = TAG_TITLE[t.textContent.trim()] || "";
});

$("reset-all").addEventListener("click", () => {
  if (!confirm("板・ライダー・足の設定を初期値に戻します（記録とチェックは消えません）。よろしいですか？")) return;
  store.del(STORE);
  S.es = clone(D.estimates); S.rd = clone(D.rider); S.edge = 30;
  loadBoard(Object.keys(D.boards)[0]); applyPreset("beginner"); S.card = "beginner";
  syncInputs(); render();
});
$("mark-mounted").addEventListener("click", () => { store.set(MOUNTED, { date: today(), set: snapshot() }); renderHero(); renderLog(); });

$("log-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const log = readLog();
  log.push({ date: $("log-date").value || today(), snow: $("log-snow").value, place: $("log-place").value.trim(), feel: $("log-feel").value, note: $("log-note").value.trim(), set: snapshot() });
  store.set(LOG, log);
  $("log-note").value = "";
  renderLog();
});
$("log-list").addEventListener("click", (e) => {
  const r = e.target.closest("[data-log-restore]"), d = e.target.closest("[data-log-del]"), log = readLog();
  if (r) {
    const s = log[+r.dataset.logRestore].set;
    if (D.boards[s.key] && s.key !== S.key) loadBoard(s.key);
    Object.assign(S.ft, s.ft); Object.assign(S.bk, s.bk); S.lean = s.lean || 0;
    const m = G.maxShift(S.bd.holesPerRow); // 記録のあとで穴の数を変えていても、ある穴に収める
    for (const f of [S.ft, S.bk]) { f.shift = Math.max(-m, Math.min(m, f.shift | 0)); f.slot = Math.max(-D.discSlot, Math.min(D.discSlot, f.slot | 0)); }
    syncInputs(); render(); showTab("setup");
  }
  if (d && confirm("この記録を削除しますか？")) { log.splice(+d.dataset.logDel, 1); store.set(LOG, log); renderLog(); }
});
$("glossary-filter").addEventListener("input", renderGlossary);
$("sync-make").addEventListener("click", async () => {
  const out = $("sync-out");
  if (location.protocol === "file:") { out.innerHTML = `<p class="warn">PCのファイルとして開いているので、このリンクは他の端末では開けません。公開したページから使ってください。</p>`; return; }
  const url = `${location.origin}${location.pathname}#import=${await packData()}`;
  let qr = "";
  if (typeof qrcode === "function" && url.length <= 2800) { const q = qrcode(0, "L"); q.addData(url); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); }
  out.innerHTML = (qr ? `<div class="sync-qr">${qr}</div><p class="hint">PCの画面のQRコードを、スマホのカメラで読み取る。</p>` : `<p class="note">データが多くてQRコードに入りません。リンクで送ってください。</p>`) +
    `<p><button class="btn-ghost" type="button" id="sync-share">${navigator.share ? "リンクを共有（LINE・メールなど）" : "リンクをコピー"}</button> <span id="sync-msg" class="hint"></span></p>`;
  $("sync-share").addEventListener("click", async () => {
    try {
      if (navigator.share) await navigator.share({ title: "スノボ セッティングのデータ", url });
      else { await navigator.clipboard.writeText(url); $("sync-msg").textContent = "コピーしました"; }
    } catch { /* 共有をやめたときなど */ }
  });
});
$("sync-paste").addEventListener("submit", (e) => {
  e.preventDefault();
  const m = $("sync-link").value.match(/#import=([\w.-]+)/);
  if (m) importData(m[1]); else alert("「#import=」を含むリンクを貼り付けてください。");
});
$("print-btn").addEventListener("click", () => { buildPrintSheet(); window.print(); });
window.addEventListener("beforeprint", buildPrintSheet);

$("stance-guide").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-width]");
  if (!btn) return;
  const r = G.resolveWidth(S.bd, +btn.dataset.width, S.bd.holesPerRow);
  Object.assign(S.ft, r.front);
  Object.assign(S.bk, r.back);
  syncInputs(); render();
});

$("board").innerHTML = Object.entries(D.boards).map(([k, b]) => `<option value="${k}">${b.label}</option>`).join("");
$("map").closest(".svg-box").insertAdjacentHTML("afterend", `<p id="map-read" class="read"></p>`);
if (!restore()) { loadBoard(Object.keys(D.boards)[0]); applyPreset("beginner"); }
S.card = presetMatch() || "beginner";
syncInputs();
renderContent();
fillStaticFigs();
fillIcons();
render();
fitFigs("setup");
const hash = location.hash.slice(1);
if (hash.startsWith("import=")) importData(hash.slice(7));
else if (hash && document.querySelector(`[data-panel="${hash}"]`)) showTab(hash);
})();
