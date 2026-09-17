// 説明に添える図（インラインSVG）。setup.js より前に読み込む。
// 説明側は id で参照する（setup-content.js の項目の fig、setup.html の data-fig、表の行の data-fig）。
// 図の決まり:
// - 本文で言っていることだけを描く。推定（C）の内容は図にも「推定」と書く。
// - viewBox は幅320が基準（wide は640）。文字は11以上。色と線は setup.css の .dg-* クラス（色を直接書かない）。
// - 板・ブーツの向き: 横から見た図はつま先（ノーズ）が右。上から見た図は setup.html と同じく、つま先側エッジが上。
(() => {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const n = (v) => Math.round(v * 10) / 10;
  const at = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "")
    .map(([k, v]) => ` ${k}="${esc(typeof v === "number" ? n(v) : v)}"`).join("");
  const P = (pts) => pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
  const RAD = Math.PI / 180;

  // ---------- 共通部品（すべて SVG の文字列を返す） ----------
  const K = {
    esc, n, P, RAD,
    g: (body, o = {}) => `<g${at(o)}>${body}</g>`,
    // 平行移動・回転・拡大（回転は度、時計回りが正）
    tr: (x, y, body, rot = 0, s = 1) => `<g transform="translate(${n(x)} ${n(y)})${rot ? ` rotate(${n(rot)})` : ""}${s !== 1 ? ` scale(${s})` : ""}">${body}</g>`,
    line: (x1, y1, x2, y2, cls = "dg-line", o = {}) => `<line${at({ x1, y1, x2, y2, class: cls, ...o })}/>`,
    path: (d, cls = "dg-line", o = {}) => `<path${at({ d, class: cls, ...o })}/>`,
    polyline: (pts, cls = "dg-line", o = {}) => `<polyline${at({ points: P(pts), class: cls, ...o })}/>`,
    polygon: (pts, cls = "dg-fill", o = {}) => `<polygon${at({ points: P(pts), class: cls, ...o })}/>`,
    rect: (x, y, w, h, cls = "dg-fill", o = {}) => `<rect${at({ x, y, width: w, height: h, class: cls, ...o })}/>`,
    circle: (cx, cy, r, cls = "dg-fill", o = {}) => `<circle${at({ cx, cy, r, class: cls, ...o })}/>`,
    // 文字。o: { cls: "t-b t-dim t-s t-l t-ok t-ng t-front t-back halo", a: "start|middle|end" }。改行は "\n"
    text: (x, y, s, o = {}) => {
      const lines = String(s).split("\n"), lh = o.lh || 15;
      const body = lines.length === 1 ? esc(s) : lines.map((t, i) => `<tspan x="${n(x)}" dy="${i ? lh : 0}">${esc(t)}</tspan>`).join("");
      return `<text${at({ x, y, class: o.cls, "text-anchor": o.a })}>${body}</text>`;
    },
    // 矢印（線＋三角の頭）。cls には "dg-arrow" に色の追加クラス（front back ok ng sky dim）を付けられる
    arrow: (x1, y1, x2, y2, cls = "", head = 7) => {
      const a = Math.atan2(y2 - y1, x2 - x1), hx = x2 - head * Math.cos(a), hy = y2 - head * Math.sin(a), w = head * 0.55;
      return `<g class="dg-arrow ${cls}"><line${at({ x1, y1, x2: hx, y2: hy })}/>` +
        `<polygon points="${P([[x2, y2], [hx + w * Math.sin(a), hy - w * Math.cos(a)], [hx - w * Math.sin(a), hy + w * Math.cos(a)]])}"/></g>`;
    },
    // 円弧（中心・半径・開始角→終了角。0°=右、時計回りが正）
    arc: (cx, cy, r, a1, a2, cls = "dg-line") => {
      const p = (a) => [cx + r * Math.cos(a * RAD), cy + r * Math.sin(a * RAD)], [x1, y1] = p(a1), [x2, y2] = p(a2);
      return `<path class="${cls}" d="M${n(x1)},${n(y1)} A${n(r)},${n(r)} 0 ${Math.abs(a2 - a1) > 180 ? 1 : 0} ${a2 > a1 ? 1 : 0} ${n(x2)},${n(y2)}"/>`;
    },
    // 寸法線（両端に短い線、真ん中に文字）。off で文字を線から離す
    dim: (x1, y1, x2, y2, label, off = -6) => {
      const a = Math.atan2(y2 - y1, x2 - x1), px = -Math.sin(a) * 5, py = Math.cos(a) * 5;
      return `<g class="dg-dim"><line${at({ x1, y1, x2, y2 })}/><line${at({ x1: x1 - px, y1: y1 - py, x2: x1 + px, y2: y1 + py })}/>` +
        `<line${at({ x1: x2 - px, y1: y2 - py, x2: x2 + px, y2: y2 + py })}/></g>` +
        K.text((x1 + x2) / 2 - Math.sin(a) * off, (y1 + y2) / 2 + Math.cos(a) * off + (Math.abs(a) < 0.01 ? 0 : 4), label, { a: "middle", cls: "t-s halo" });
    },
    // 手順の番号（丸数字）
    num: (x, y, k, cls = "") => `<g class="dg-num ${cls}"><circle${at({ cx: x, cy: y, r: 8 })}/><text${at({ x, y: y + 4, "text-anchor": "middle" })}>${esc(k)}</text></g>`,
    // OK / NG のマーク（label を付けると右に文字）
    ok: (x, y, label = "") => `<g class="dg-ok"><circle${at({ cx: x, cy: y, r: 9 })}/><path d="M${n(x - 4)},${n(y)} l3,3.2 l5.5,-6.4"/></g>` + (label ? K.text(x + 14, y + 4, label, { cls: "t-b t-ok" }) : ""),
    ng: (x, y, label = "") => `<g class="dg-ng"><circle${at({ cx: x, cy: y, r: 9 })}/><path d="M${n(x - 3.8)},${n(y - 3.8)} l7.6,7.6 M${n(x + 3.8)},${n(y - 3.8)} l-7.6,7.6"/></g>` + (label ? K.text(x + 14, y + 4, label, { cls: "t-b t-ng" }) : ""),
    // 引き出し線つきの注記（点(x1,y1)を指して、(x2,y2)に文字）
    note: (x1, y1, x2, y2, label, a = "start") => K.line(x1, y1, x2, y2, "dg-thin") + K.circle(x1, y1, 2, "dg-dot") + K.text(x2 + (a === "start" ? 3 : a === "end" ? -3 : 0), y2 + 4, label, { a, cls: "t-s halo" }),

    // ---------- よく使う形 ----------
    // 雪面（左から右へ、y1→y2 の斜面。下側を塗る）
    snow: (x1, y1, x2, y2, depth = 30) => K.polygon([[x1, y1], [x2, y2], [x2, Math.max(y1, y2) + depth], [x1, Math.max(y1, y2) + depth]], "dg-snow"),
    // 板を上から（中心 cx,cy、長さ len、幅 wid、rot 度）。ノーズ・テールは丸く、真ん中が少しくびれる
    boardTop: (cx, cy, len, wid, rot = 0, cls = "dg-board") => {
      const h = len / 2, w = wid / 2, tip = Math.min(w * 1.6, h * 0.25), waist = w * 0.9;
      const d = `M${-h + tip},${-w} Q0,${-waist} ${h - tip},${-w} Q${h},${-w} ${h},0 Q${h},${w} ${h - tip},${w} Q0,${waist} ${-h + tip},${w} Q${-h},${w} ${-h},0 Q${-h},${-w} ${-h + tip},${-w} Z`;
      return K.tr(cx, cy, `<path class="${cls}" d="${d}"/>`, rot);
    },
    // 板を横から（接雪点 x1〜x2、雪面 y、先端の長さ tipLen と高さ rise）。camber は真ん中が浮く高さ（誇張して描く）
    boardSide: (x1, x2, y, o = {}) => {
      const { tipLen = 26, rise = 10, camber = 0, thick = 4, cls = "dg-board" } = o, m = (x1 + x2) / 2;
      const top = `M${x1 - tipLen},${y - rise} Q${x1 - tipLen * 0.3},${y} ${x1},${y} Q${m},${y - camber * 2} ${x2},${y} Q${x2 + tipLen * 0.3},${y} ${x2 + tipLen},${y - rise}`;
      const bot = `L${x2 + tipLen},${y - rise - thick} Q${x2 + tipLen * 0.3},${y - thick} ${x2},${y - thick} Q${m},${y - thick - camber * 2} ${x1},${y - thick} Q${x1 - tipLen * 0.3},${y - thick} ${x1 - tipLen},${y - rise - thick} Z`;
      return `<path class="${cls}" d="${top} ${bot}"/>`;
    },
    // ブーツを横から（かかと下 x,y、つま先は右、s=1で長さ約106・高さ約92）
    bootSide: (x, y, s = 1, cls = "dg-boot") => K.tr(x, y,
      `<path class="${cls}" d="M4,0 L96,0 Q106,0 106,-10 Q106,-24 92,-28 L72,-36 Q62,-40 60,-52 L58,-88 Q58,-92 54,-92 L10,-92 Q4,-92 4,-86 L2,-40 Q0,-20 2,-8 Z"/>` +
      `<path class="dg-sole" d="M4,0 L96,0 Q106,0 106,-8 L2,-8 Z"/>`, 0, s),
    // ブーツを上から（中心 cx,cy、長さ len、幅 wid、rot 度。つま先は rot=0 で上）
    bootTop: (cx, cy, len = 70, wid = 30, rot = 0, cls = "dg-boot") =>
      K.tr(cx, cy, `<rect class="${cls}" x="${n(-wid / 2)}" y="${n(-len / 2)}" width="${n(wid)}" height="${n(len)}" rx="${n(wid / 2)}"/>`, rot),
    // バインディングを横から（かかと下 x,y、s=1でブーツ bootSide と同じ大きさ）。lean はハイバックの前傾（度）
    bindingSide: (x, y, s = 1, o = {}) => {
      const { lean = 8, straps = true, cls = "dg-binding" } = o;
      const hb = K.tr(0, 2, `<path class="${cls}" d="M-6,0 L-12,-80 Q-12,-86 -5,-86 L2,-84 L8,-10 Z"/>`, lean);
      const base = `<rect class="${cls}" x="-8" y="0" width="112" height="7" rx="3"/>`;
      const st = straps ? `<path class="dg-strap" d="M28,-44 Q48,-58 68,-40"/><path class="dg-strap" d="M84,-26 Q98,-34 106,-14"/>` : "";
      return K.tr(x, y, base + hb + st, 0, s);
    },
    // 棒人間。j は関節の座標 { head:[x,y], neck, hip, lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot }（ない関節は描かない）
    person: (j, o = {}) => {
      const { r = 9, cls = "dg-person" } = o, L = (...ks) => ks.every((k) => j[k]) ? `<polyline points="${P(ks.map((k) => j[k]))}"/>` : "";
      return `<g class="${cls}">${j.head ? `<circle cx="${n(j.head[0])}" cy="${n(j.head[1])}" r="${r}"/>` : ""}` +
        L("neck", "hip") + L("neck", "lElbow", "lHand") + L("neck", "rElbow", "rHand") + L("hip", "lKnee", "lFoot") + L("hip", "rKnee", "rFoot") + `</g>`;
    },
  };

  // ---------- 図の登録と出力 ----------
  // 図の定義: { cap: "図の説明（1文）", w: 320, h: 180, wide: false, draw: (K) => "SVGの中身" }
  const FIGS = {};
  const html = (id) => {
    const f = FIGS[id];
    if (!f) return "";
    try {
      const w = f.w || (f.wide ? 640 : 320), h = f.h || 180;
      return `<figure class="dg-fig${f.wide ? " wide" : ""}" data-fig-id="${esc(id)}"><svg class="dg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(f.cap || id)}">${f.draw(K)}</svg>` +
        (f.cap ? `<figcaption>${esc(f.cap)}</figcaption>` : "") + `</figure>`;
    } catch (e) {
      console.error(`図 ${id} の描画に失敗:`, e);
      return "";
    }
  };
  globalThis.SETUP_DIAGRAMS = { K, FIGS, html, add: (defs) => Object.assign(FIGS, defs), has: (id) => id in FIGS };
})();

// ---------- 図（見本） ----------
SETUP_DIAGRAMS.add({
  "screw-cross": {
    cap: "4本のネジは対角の順（1→2→3→4）に、少しずつ何周かに分けて締める。",
    h: 170,
    draw: (K) => {
      const cx = 110, cy = 88, s = 34, pts = [[-1, -1], [1, 1], [1, -1], [-1, 1]];
      let b = K.circle(cx, cy, 62, "dg-binding") + K.circle(cx, cy, 50, "dg-thin");
      b += K.arrow(cx - s + 8, cy - s + 8, cx + s - 10, cy + s - 10, "sky") + K.arrow(cx + s - 8, cy - s + 8, cx - s + 10, cy + s - 10, "sky dim");
      pts.forEach(([dx, dy], i) => { b += K.circle(cx + dx * s, cy + dy * s, 6, "dg-screw") + K.num(cx + dx * (s + 17), cy + dy * (s + 3), i + 1); });
      b += K.text(200, 50, "#3のプラス\nドライバー", { cls: "t-b" });
      b += K.text(200, 96, "対角の順に\n少しずつ均等に", {});
      b += K.ng(206, 142) + K.text(220, 146, "電動工具", { cls: "t-ng t-b" });
      return b;
    },
  },
  "toe-strap": {
    cap: "トゥストラップはつま先に被せる。甲（足の甲）に乗った位置はずれている。",
    h: 150,
    draw: (K) => {
      const shoe = (x, onToe) => K.bindingSide(x, 118, 1, { straps: false }) + K.bootSide(x, 116, 1) +
        (onToe ? `<path class="dg-strap" d="M${x + 84},${116 - 26} Q${x + 100},${116 - 34} ${x + 108},${116 - 12}"/>`
          : `<path class="dg-strap" d="M${x + 58},${116 - 40} Q${x + 72},${116 - 54} ${x + 86},${116 - 30}"/>`);
      return shoe(20, true) + K.ok(26, 16, "つま先に被せる") +
        shoe(180, false) + K.ng(186, 16, "甲に乗っている");
    },
  },
});

// ==================== 図: ride（_work/diagrams/parts/ride.js から統合） ====================
// part: ride（滑る日の読みもの：流れ止め・リフト・けがと防具・不調時・板の置き方と盗難）
(() => {
  const n = (v) => Math.round(v * 10) / 10;
  // 点(x,y)を中心(cx,cy)まわりに deg 度回して平行移動した座標
  const rp = (cx, cy, deg, x, y) => {
    const a = deg * Math.PI / 180;
    return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
  };
  // 流れ止めのひも（dg-strap を半分の太さで描く）
  const cord = (d) => `<g transform="scale(0.5)"><path class="dg-strap" d="${d.replace(/-?\d+(\.\d+)?/g, (m) => n(m * 2))}"/></g>`;
  // 横から見たブーツの小さい形（かかと下 x,y、つま先は右、s=1で長さ44・高さ36）
  const bootMini = (x, y, s = 1, cls = "dg-boot") =>
    `<path class="${cls}" d="M${n(x)},${n(y)} L${n(x + 38 * s)},${n(y)} Q${n(x + 44 * s)},${n(y)} ${n(x + 44 * s)},${n(y - 6 * s)} Q${n(x + 44 * s)},${n(y - 12 * s)} ${n(x + 36 * s)},${n(y - 15 * s)} L${n(x + 26 * s)},${n(y - 20 * s)} L${n(x + 26 * s)},${n(y - 36 * s)} L${n(x + 2 * s)},${n(y - 36 * s)} Z"/>`;
  // 横から見た足（かかと下 x,y、つま先は右。長さ29・高さ23）
  const foot = (x, y, cls = "dg-boot") => `<path class="${cls}" d="M${n(x)},${n(y)} h24 q5,0 5,-5 q0,-4 -6,-6 l-7,-3 v-9 h-14 q-2,0 -2,2 z"/>`;
  // 上から見た人（板の上に丸）
  const rider = (x, y, rot = 0) => K2.boardTop(x, y, 34, 9, rot) + K2.circle(x, y, 5, "dg-person");
  // 円弧の矢印（中心・半径・開始角→終了角。0°=右、時計回りが正）
  const arcArrow = (cx, cy, r, a1, a2, cls = "") => {
    const N = 14, pts = [];
    for (let i = 0; i <= N; i++) pts.push(rp(cx, cy, a1 + (a2 - a1) * i / N, r, 0));
    const segs = pts.slice(0, -2).map((p, i) => `<line x1="${n(p[0])}" y1="${n(p[1])}" x2="${n(pts[i + 1][0])}" y2="${n(pts[i + 1][1])}"/>`).join("");
    const [p1, p2] = [pts[N - 2], pts[N]];
    return `<g class="dg-arrow ${cls}">${segs}</g>` + K2.arrow(p1[0], p1[1], p2[0], p2[1], cls);
  };
  // 見出し付きの枠
  const box = (x, y, w, h, cls = "dg-fill") => K2.rect(x, y, w, h, cls, { rx: 8 });
  const K2 = SETUP_DIAGRAMS.K; // ローカル関数から使う共通部品

  SETUP_DIAGRAMS.add({
    "leash-why": {
      cap: "流れ止めを付けていれば、外れた板は足から離れない。付けていないと板が斜面を流れ、下にいる人に当たる。",
      h: 192,
      draw: (K) => {
        const k = 70 / 148, ang = Math.atan(k) / K.RAD;
        const board = (cx, cy) => K.tr(cx, cy, K.boardSide(-36, 36, 0, { tipLen: 10, rise: 5, thick: 4 }) +
          K.rect(-24, -11, 12, 7, "dg-binding", { rx: 2 }) + K.rect(12, -11, 12, 7, "dg-binding", { rx: 2 }), ang);
        let b = "";
        // 左: OK（流れ止めあり）
        const yL = (x) => 64 + (x - 6) * k;
        b += K.snow(6, 64, 154, 134, 36) + K.ok(16, 18, "流れ止めあり");
        b += K.person({ head: [42, 38], neck: [43, 46], hip: [46, 66], lElbow: [36, 56], lHand: [32, 66], rElbow: [52, 56], rHand: [58, 64],
          lKnee: [40, 73], lFoot: [38, yL(38)], rKnee: [53, 78], rFoot: [56, yL(56)] }, { r: 6 });
        const cxL = 100;
        b += board(cxL, yL(cxL));
        const [bx, by] = rp(cxL, yL(cxL), ang, -18, -11);
        b += cord(`M${n(bx)},${n(by)} Q${n(bx - 18)},${n(by + 12)} 54,82`);
        b += K.text(80, 156, "板が足から離れない", { a: "middle", cls: "t-s t-ok t-b halo" });
        // 右: NG（流れ止めなし）
        const yR = (x) => 64 + (x - 166) * k;
        b += K.snow(166, 64, 314, 134, 36) + K.ng(176, 18, "流れ止めなし");
        const cxR = 214;
        b += board(cxR, yR(cxR));
        b += K.tr(cxR, yR(cxR), K.line(-56, -8, -44, -8, "dg-thin") + K.line(-52, -16, -42, -16, "dg-thin"), ang);
        const [a1x, a1y] = rp(cxR, yR(cxR), ang, 40, -20), [a2x, a2y] = rp(cxR, yR(cxR), ang, 78, -20);
        b += K.arrow(a1x, a1y, a2x, a2y, "ng");
        b += K.person({ head: [297, 78], neck: [297, 85], hip: [297, 106], lElbow: [289, 90], lHand: [284, 82], rElbow: [305, 90], rHand: [310, 82],
          lKnee: [292, 115], lFoot: [290, yR(290)], rKnee: [302, 119], rFoot: [304, yR(304)] }, { r: 6 });
        b += K.text(240, 156, "下の人に当たる", { a: "middle", cls: "t-s t-ng t-b halo" });
        b += K.line(160, 8, 160, 168, "dg-guide");
        b += K.text(160, 184, "行動規則「流れ止めをつけなければならない」", { a: "middle", cls: "t-s halo" });
        return b;
      },
    },

    "leash-types": {
      cap: "流れ止めは膝下に巻く・ブーツのひものリングに掛ける・布のフックなどのタイプがあり、片側をバインディング前足の内側に固定する。",
      h: 222,
      draw: (K) => {
        let b = "";
        // ① 膝下に巻く
        b += K.num(12, 14, 1);
        b += K.rect(37, 14, 20, 36, "dg-boot", { rx: 4 }) + bootMini(34, 84);
        b += K.line(35, 26, 59, 26, "dg-strap");
        b += cord("M59,28 Q92,40 82,72") + K.circle(82, 72, 2.5, "dg-dot");
        b += K.text(54, 102, "膝下に巻く", { a: "middle", cls: "t-s" });
        // ② ひものリングにフック
        b += K.num(118, 14, 2);
        b += bootMini(128, 84, 1.3);
        b += K.line(152, 44, 161, 41, "dg-thin") + K.line(153, 51, 163, 48, "dg-thin") + K.line(155, 58, 166, 55, "dg-thin");
        b += K.circle(168, 55, 4, "dg-line");
        b += cord("M169,51 Q186,46 194,22") + K.path("M166,58 q6,4 8,-2", "dg-line");
        b += K.text(160, 102, "ひものリングに\nフックを掛ける", { a: "middle", cls: "t-s" });
        // ③ 布のフック（BOA）
        b += K.num(224, 14, 3);
        b += bootMini(234, 84, 1.3);
        b += K.circle(250, 62, 6, "dg-binding") + K.circle(250, 62, 2.2, "dg-dot");
        b += K.line(256, 59, 267, 52, "dg-thin") + K.line(256, 65, 268, 60, "dg-thin");
        b += K.path("M258,38 q8,-9 14,1", "dg-strap");
        b += cord("M271,38 Q292,34 300,16");
        b += K.text(266, 102, "布のフック\nBOAを傷めにくい", { a: "middle", cls: "t-s" });
        b += K.line(8, 126, 312, 126, "dg-guide");
        // 下段: 前足と膝下をつなぐ
        const Y = 204;
        b += K.boardSide(24, 132, 212, { tipLen: 14, rise: 6, thick: 4 });
        b += K.rect(47, 136, 26, 22, "dg-boot", { rx: 4 });
        b += K.bindingSide(44, Y, 0.55, { straps: false }) + K.bootSide(44, Y - 1, 0.55);
        b += K.line(45, 146, 75, 146, "dg-strap");
        b += cord("M101,204 Q128,176 75,147") + K.circle(101, 204, 2.5, "dg-dot");
        b += K.note(75, 146, 150, 150, "もう片側：膝下・ブーツ");
        b += K.note(101, 205, 150, 186, "片側はバインディング\n前足の内側に固定");
        return b;
      },
    },

    "lift-one-foot": {
      cap: "リフトや短い移動は前足だけバインディングに付け、後ろ足で雪を蹴って進む（レギュラーは左足を付ける）。",
      h: 180,
      draw: (K) => {
        let b = K.text(10, 18, "レギュラーは左足を付ける", { cls: "t-b" });
        b += K.boardTop(160, 108, 240, 54);
        b += K.text(46, 72, "ノーズ", { a: "middle", cls: "t-s t-dim" }) + K.text(274, 72, "テール", { a: "middle", cls: "t-s t-dim" });
        // 後ろのバインディング（空）
        b += K.bootTop(208, 108, 62, 28, 6, "dg-binding");
        // 前足（+18°）
        b += K.bootTop(112, 108, 62, 30, -18, "dg-binding") + K.bootTop(112, 108, 54, 22, -18, "dg-boot") + K.bootTop(112, 108, 54, 22, -18, "dg-front");
        b += K.text(112, 70, "前足だけ付ける", { a: "middle", cls: "t-b t-front" });
        // 後ろ足（板の外で蹴る）
        b += K.bootTop(222, 48, 52, 20, -90, "dg-boot") + K.bootTop(222, 48, 52, 20, -90, "dg-back");
        b += K.text(222, 28, "後ろ足で蹴る", { a: "middle", cls: "t-b t-back" });
        b += K.arrow(254, 48, 300, 48, "back");
        // 進む向き
        b += K.arrow(140, 160, 36, 160);
        b += K.text(148, 164, "進む向き（ノーズ側）", { cls: "t-s" });
        return b;
      },
    },

    "lift-ride": {
      cap: "乗っている間は後ろ足で板を支えると前足が楽。降りるときは重心を前にして、足元ではなく前を見る。",
      h: 190,
      draw: (K) => {
        let b = K.line(160, 8, 160, 182, "dg-guide");
        // 左: 乗っている間
        b += K.text(10, 18, "乗っている間", { cls: "t-b" });
        b += K.polyline([[70, 26], [70, 38], [24, 38], [24, 104]], "dg-line");
        b += K.rect(20, 48, 8, 60, "dg-fill", { rx: 2 }) + K.rect(20, 104, 76, 7, "dg-fill", { rx: 2 });
        // 後ろ足（板の下）→ 板 → 前足の順に重ねる
        b += K.person({ hip: [44, 100], rKnee: [92, 104], rFoot: [85, 137] });
        b += K.boardSide(78, 138, 136, { tipLen: 12, rise: 5, thick: 4 });
        b += foot(76, 160) + foot(76, 160, "dg-back");
        b += K.person({ head: [46, 58], neck: [46, 66], hip: [44, 100], lElbow: [58, 86], lHand: [72, 96], lKnee: [84, 98], lFoot: [105, 109] }, { r: 7 });
        b += foot(96, 132) + foot(96, 132, "dg-front");
        b += K.arrow(118, 166, 118, 142, "back");
        b += K.text(112, 108, "前足", { cls: "t-front t-b t-s" });
        b += K.text(10, 158, "後ろ足で\n板を支える", { cls: "t-back t-b t-s" });
        // 右: 降りるとき
        b += K.text(172, 18, "降りるとき", { cls: "t-b" });
        const k = 38 / 158, ang = Math.atan(k) / K.RAD, yS = (x) => 112 + (x - 162) * k;
        b += K.snow(162, 112, 320, 150, 40);
        b += K.tr(234, yS(234), K.boardSide(-40, 40, 0, { tipLen: 10, rise: 5, thick: 4 }), ang);
        const f1 = rp(234, yS(234), ang, -14, -4), f2 = rp(234, yS(234), ang, 14, -4);
        b += K.person({ head: [248, 58], neck: [243, 67], hip: [232, 98], lElbow: [254, 80], lHand: [266, 88], rElbow: [240, 84], rHand: [252, 94],
          lKnee: [236, 111], lFoot: f1, rKnee: [248, 113], rFoot: f2 }, { r: 7 });
        b += K.arrow(256, 56, 312, 56, "ok");
        b += K.text(284, 44, "前を見る", { a: "middle", cls: "t-ok t-b" });
        b += K.arrow(196, 86, 224, 86);
        b += K.text(170, 104, "重心を前に", { cls: "t-b t-s" });
        b += K.line(258, 64, 288, 119, "dg-guide") + K.arrow(286, 115, 291, 124, "ng dim", 6);
        b += K.ng(238, 174) + K.text(252, 178, "足元は見ない", { cls: "t-s t-ng t-b halo" });
        return b;
      },
    },

    "course-edge": {
      cap: "コースの中で立ち止まったり座り込んだりしない。転んだら速やかにコースから出て、バインディングは降り場から離れた端で付ける。",
      h: 200,
      draw: (K) => {
        let b = K.rect(12, -2, 146, 204, "dg-snow");
        b += K.rect(48, 8, 80, 24, "dg-fill", { rx: 4 }) + K.text(88, 24, "リフト降り場", { a: "middle", cls: "t-s" });
        b += K.text(16, 24, "↑山側", { cls: "t-s t-dim" });
        // NG: 降り場の前
        b += rider(88, 56);
        b += K.line(108, 56, 172, 56, "dg-thin") + K.ng(182, 56);
        b += K.text(196, 60, "降り場の前で付けない", { cls: "t-ng t-b t-s" }) + K.text(196, 75, "→ 離れてから付ける", { cls: "t-s" });
        // NG: 真ん中で座る
        b += rider(84, 112);
        b += K.line(104, 112, 172, 112, "dg-thin") + K.ng(182, 112);
        b += K.text(196, 116, "コースの中で\n座り込まない", { cls: "t-ng t-b t-s" });
        // OK: 端へ
        b += K.arrow(92, 122, 124, 158, "ok");
        b += rider(138, 170);
        b += K.line(156, 170, 172, 170, "dg-thin") + K.ok(182, 170);
        b += K.text(196, 174, "端（見通しの\n良い所）で止まる", { cls: "t-ok t-b t-s" });
        b += K.text(18, 150, "転んだら速やかに\nコースから出る", { cls: "t-s halo" });
        return b;
      },
    },

    "injury-stats": {
      cap: "スノーボードで自分から転んだときのけがは、肩を含む腕が69.8%、骨折が45.8%。頭のけがはスキーの約2倍。",
      h: 196,
      draw: (K) => {
        const X0 = 24, W = 260, x = (p) => X0 + W * p / 100;
        let b = K.line(x(50), 24, x(50), 146, "dg-guide") + K.line(x(100), 24, x(100), 146, "dg-guide");
        b += K.num(30, 15, 1) + K.text(44, 19, "けがの部位：肩を含む腕", {});
        b += K.rect(X0, 26, W * 0.698, 14, "dg-binding") + K.text(x(69.8) + 6, 37, "69.8%", { cls: "t-b" });
        b += K.num(30, 57, 2) + K.text(44, 61, "けがの種類：骨折", {});
        b += K.rect(X0, 68, W * 0.458, 14, "dg-binding") + K.text(x(45.8) + 6, 79, "45.8%", { cls: "t-b" });
        b += K.num(30, 99, 3) + K.text(44, 103, "頭のけが（スキーの約2倍）", {});
        b += K.rect(X0, 110, W * 0.109, 12, "dg-binding") + K.text(x(10.9) + 6, 120, "スノーボード 10.9%", { cls: "t-b t-s" });
        b += K.rect(X0, 126, W * 0.059, 12, "dg-fill") + K.text(x(5.9) + 6, 136, "スキー 5.9%", { cls: "t-s" });
        b += K.line(X0, 146, x(100), 146, "dg-thin");
        [0, 50, 100].forEach((p) => { b += K.line(x(p), 146, x(p), 150, "dg-thin") + K.text(x(p), 162, p === 100 ? "100%" : String(p), { a: "middle", cls: "t-s t-dim" }); });
        b += K.text(10, 178, "スノーボードで自分から転んだときのけが", { cls: "t-s t-dim" });
        b += K.text(10, 192, "全国スキー安全対策協議会 2022/2023シーズン報告", { cls: "t-s t-dim" });
        return b;
      },
    },

    "injury-body": {
      cap: "けがの多い部位は肩・手首・頭・膝・腰の順。肩は53.8%が脱臼、手首は61.7%が骨折。",
      h: 210,
      draw: (K) => {
        const J = { head: [160, 38], neck: [160, 51], sL: [136, 60], sR: [184, 60], eL: [116, 82], wL: [102, 100], eR: [204, 82], wR: [218, 100],
          hip: [160, 124], hL: [150, 124], hR: [170, 124], kL: [146, 160], fL: [144, 196], kR: [174, 160], fR: [176, 196] };
        const P = (...ks) => K.polyline(ks.map((k) => J[k]), "");
        let b = K.circle(184, 60, 9, "dg-hl") + K.circle(102, 100, 9, "dg-hl") + K.circle(160, 38, 17, "dg-hl") + K.circle(146, 160, 9, "dg-hl") + K.circle(160, 112, 9, "dg-hl");
        b += K.g(K.circle(160, 38, 13, "") + P("neck", "hip") + P("sL", "sR") + P("sL", "eL", "wL") + P("sR", "eR", "wR") + P("hL", "hR") + P("hL", "kL", "fL") + P("hR", "kR", "fR"), { class: "dg-person" });
        const lab = (px, py, nx, ny, k, t, sub, side) => {
          const tx = side === "L" ? 28 : 244, cx = side === "L" ? 16 : 232;
          return K.line(px, py, nx, ny, "dg-thin") + K.circle(px, py, 2, "dg-dot") + K.num(cx, ny, k) + K.text(tx, ny + 4, t, { cls: "t-b" }) +
            (sub ? K.text(tx, ny + 19, sub, { cls: "t-s halo" }) : "");
        };
        b += lab(184, 60, 222, 60, 1, "肩", "53.8%が脱臼", "R");
        b += lab(102, 100, 56, 100, 2, "手首", "61.7%が骨折", "L");
        b += lab(173, 38, 222, 34, 3, "頭", "", "R");
        b += lab(146, 160, 42, 160, 4, "膝", "", "L");
        b += lab(160, 112, 222, 116, 5, "腰", "", "R");
        b += K.text(10, 204, "番号はけがの多い順", { cls: "t-s t-dim" });
        return b;
      },
    },

    "protectors": {
      cap: "転ぶ回数が多い初心者ほど、ヘルメット・手首ガード・おしりパッドを着ける意味が大きい。",
      h: 200,
      draw: (K) => {
        const J = { neck: [80, 45], sL: [56, 54], sR: [104, 54], eL: [40, 76], wL: [28, 94], eR: [120, 76], wR: [132, 94],
          hip: [80, 118], hL: [70, 118], hR: [90, 118], kL: [66, 152], fL: [64, 188], kR: [94, 152], fR: [96, 188] };
        const P = (...ks) => K.polyline(ks.map((k) => J[k]), "");
        let b = K.g(K.circle(80, 32, 13, "") + P("neck", "hip") + P("sL", "sR") + P("sL", "eL", "wL") + P("sR", "eR", "wR") + P("hL", "hR") + P("hL", "kL", "fL") + P("hR", "kR", "fR"), { class: "dg-person" });
        // ヘルメット
        const helmet = "M63,36 A17,17 0 0 1 97,36 Z";
        b += K.path(helmet, "dg-hl") + K.path(helmet, "dg-line");
        // 手首ガード
        b += K.tr(31.6, 88.6, K.rect(-6, -10, 12, 20, "dg-hl", { rx: 3 }) + K.rect(-6, -10, 12, 20, "dg-line", { rx: 3 }), 33.7);
        b += K.tr(128.4, 88.6, K.rect(-6, -10, 12, 20, "dg-hl", { rx: 3 }) + K.rect(-6, -10, 12, 20, "dg-line", { rx: 3 }), -33.7);
        // おしりパッド（前から見ると腰まわり）
        b += K.rect(62, 106, 36, 26, "dg-hl", { rx: 7 }) + K.rect(62, 106, 36, 26, "dg-guide", { rx: 7 });
        const lead = (x1, y1, y2, t) => K.line(x1, y1, 160, y2, "dg-thin") + K.circle(x1, y1, 2, "dg-dot") + K.text(164, y2 + 4, t, { cls: "t-b" });
        b += lead(97, 28, 28, "ヘルメット");
        b += lead(137, 84, 84, "手首ガード（両手）");
        b += lead(98, 126, 126, "おしりパッド");
        // 横から見た小図
        b += K.rect(168, 142, 144, 54, "dg-thin", { rx: 6 });
        b += K.text(176, 158, "横から見ると", { cls: "t-s t-dim" });
        b += K.person({ head: [284, 150], neck: [284, 156], hip: [282, 171], lKnee: [285, 182], lFoot: [283, 193], rKnee: [280, 182], rFoot: [277, 193], lElbow: [288, 163], lHand: [292, 171] }, { r: 5 });
        const pad = "M281,161 Q270,161 270,171 Q270,181 281,180 Z";
        b += K.path(pad, "dg-hl") + K.path(pad, "dg-line");
        b += K.note(270, 171, 254, 172, "お尻を覆う", "end");
        return b;
      },
    },

    "protector-choose": {
      cap: "3つの防具はそれぞれ守るものが違う。サイズや選び方は、ゴーグル・ウェアと合わせて店頭で着けてみて、ずれないものを選ぶ。",
      h: 172,
      draw: (K) => {
        let b = "";
        // ヘルメット
        b += K.circle(55, 50, 14, "dg-boot");
        const hel = "M37,52 A18,18 0 0 1 73,52 L73,55 L37,55 Z";
        b += K.path(hel, "dg-hl") + K.path(hel, "dg-line");
        b += K.text(55, 86, "ヘルメット", { a: "middle", cls: "t-b" });
        b += K.text(55, 104, "頭を強く\n打ったときの守り", { a: "middle", cls: "t-s" });
        // 手首ガード
        b += K.rect(124, 42, 40, 16, "dg-boot", { rx: 4 });
        b += K.path("M162,38 h14 q10,0 12,8 l2,10 q0,6 -6,6 h-22 z", "dg-boot");
        b += K.rect(144, 36, 30, 28, "dg-hl", { rx: 5 }) + K.rect(144, 36, 30, 28, "dg-line", { rx: 5 });
        b += K.line(152, 36, 152, 64, "dg-thin") + K.line(166, 36, 166, 64, "dg-thin");
        b += K.text(160, 86, "手首ガード", { a: "middle", cls: "t-b" });
        b += K.text(160, 104, "手をついたときの\n手首の骨折対策", { a: "middle", cls: "t-s" });
        // おしりパッド（後ろから）
        const pants = "M240,28 H292 L298,66 H270 L266,48 L262,66 H234 Z";
        b += K.path(pants, "dg-boot");
        b += K.circle(255, 44, 9, "dg-hl") + K.circle(277, 44, 9, "dg-hl") + K.rect(262, 28, 8, 12, "dg-hl", { rx: 3 });
        b += K.path(pants, "dg-line");
        b += K.text(266, 86, "おしりパッド", { a: "middle", cls: "t-b" });
        b += K.text(266, 104, "衝撃をやわらげ\n冷えも防ぐ", { a: "middle", cls: "t-s" });
        b += K.line(8, 128, 312, 128, "dg-guide");
        // 店頭で確かめる
        b += K.circle(42, 154, 10, "dg-boot");
        const h2 = "M29,155 A13,13 0 0 1 55,155 Z";
        b += K.path(h2, "dg-hl") + K.path(h2, "dg-line");
        b += K.arrow(30, 140, 14, 146, "sky", 6) + K.arrow(54, 140, 70, 146, "sky", 6);
        b += K.text(82, 152, "店頭で着けて、", { cls: "t-b" }) + K.text(82, 167, "ずれないか確かめる", { cls: "t-b" });
        return b;
      },
    },

    "patrol": {
      cap: "直せない・けがをしたときは無理に滑り続けず、スキー場のパトロールに連絡する。",
      h: 140,
      draw: (K) => {
        let b = box(6, 20, 90, 72, "dg-area-ng") + box(114, 20, 90, 72, "dg-fill") + box(222, 20, 92, 72, "dg-area-ok");
        b += K.text(51, 52, "直せない・\nけがをした", { a: "middle", cls: "t-b" });
        b += K.text(159, 52, "無理に\n滑り続けない", { a: "middle", cls: "t-b" });
        b += K.text(268, 45, "スキー場の\nパトロール\nに連絡", { a: "middle", cls: "t-b t-ok" });
        b += K.arrow(98, 56, 112, 56) + K.arrow(206, 56, 220, 56);
        b += K.text(160, 124, "用具の調整は信頼できる店舗へ（消費者庁）", { a: "middle", cls: "t-s" });
        return b;
      },
    },

    "tools-pocket": {
      cap: "ネジは滑っているうちに緩むことがあるので、工具をポケットに入れておく。締め直しを頼めるかはスキー場ごとに違う。",
      h: 150,
      draw: (K) => {
        let b = K.text(10, 18, "ポケットに入れておく", { cls: "t-b" });
        // ドライバー
        b += K.line(46, 70, 44, 50, "dg-line");
        b += K.tr(43, 40, K.rect(-7, -14, 14, 26, "dg-screw", { rx: 5 }), -6);
        // マルチツール
        b += K.tr(82, 58, K.rect(-12, -10, 24, 22, "dg-binding", { rx: 4 }) + K.circle(0, 0, 3, "dg-dot"), 8);
        // ポケット
        b += K.rect(14, 64, 92, 72, "dg-fill", { rx: 8 });
        b += K.rect(12, 60, 96, 14, "dg-binding", { rx: 5 });
        b += K.note(50, 36, 112, 36, "ドライバー\n（#3のプラス）");
        b += K.note(92, 60, 112, 90, "スノーボード用\nマルチツール");
        b += K.line(196, 12, 196, 140, "dg-guide");
        // スキー場ごとに違う
        b += box(202, 16, 112, 64);
        b += K.text(258, 36, "締め直しを\n頼めるかは", { a: "middle", cls: "t-s" });
        b += K.text(258, 68, "スキー場ごとに違う", { a: "middle", cls: "t-s t-b" });
        b += K.arrow(258, 86, 258, 104, "sky");
        b += K.text(258, 122, "行く前に", { a: "middle", cls: "t-b" }) + K.text(258, 138, "公式サイトで確認", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "course-blind": {
      cap: "急斜面の下やカーブの先は上から見えにくく、座り込むと衝突の原因になる。端の見通しの良い場所で止まる。",
      h: 222,
      draw: (K) => {
        let b = K.line(160, 26, 160, 216, "dg-guide");
        // 左: 急斜面の下（横から）
        b += K.text(8, 18, "急斜面の下（横から）", { cls: "t-b t-s" });
        b += K.polygon([[0, 62], [70, 74], [100, 150], [158, 160], [158, 222], [0, 222]], "dg-snow");
        b += K.polygon([[70, 74], [100, 150], [158, 160], [158, 140]], "dg-area-ng");
        b += K.person({ head: [20, 38], neck: [21, 44], hip: [23, 56], lElbow: [16, 50], lHand: [12, 56], rElbow: [27, 50], rHand: [32, 55],
          lKnee: [20, 61], lFoot: [18, 65], rKnee: [28, 61], rFoot: [29, 67] }, { r: 5 });
        b += K.line(24, 39, 158, 140, "dg-guide");
        b += K.person({ head: [114, 126], neck: [115, 133], hip: [118, 151], lElbow: [121, 140], lHand: [128, 144], lKnee: [128, 141], lFoot: [137, 154] }, { r: 5 });
        b += K.ng(96, 70) + K.text(108, 74, "上から\n見えない", { cls: "t-ng t-b t-s" });
        // 右: カーブの先（上から）
        b += K.text(170, 18, "カーブの先（上から）", { cls: "t-b t-s" });
        b += K.path("M206,28 L266,28 L266,120 Q266,200 166,200 L166,150 Q206,150 206,110 Z", "dg-snow");
        b += K.circle(182, 96, 11, "dg-fill") + K.circle(191, 118, 12, "dg-fill") + K.circle(192, 76, 9, "dg-fill");
        b += K.text(178, 60, "林など", { a: "middle", cls: "t-s t-dim" });
        b += rider(240, 44);
        b += K.line(236, 50, 201.5, 112, "dg-guide");
        b += rider(186, 176, 90);
        b += K.ng(174, 210) + K.text(187, 214, "上から見えない", { cls: "t-ng t-b t-s" });
        b += rider(248, 92);
        b += K.ok(294, 76) + K.text(294, 100, "見通しの\n良い端", { a: "middle", cls: "t-ok t-b t-s" });
        return b;
      },
    },

    "board-place": {
      cap: "流れ止めを付けたまま、ビンディング側を下にして伏せて置くと滑り落ちにくい。ソールを下にすると、そのまま滑り出す。",
      h: 170,
      draw: (K) => {
        const k = 62 / 148, ang = Math.atan(k) / K.RAD;
        let b = K.line(160, 8, 160, 160, "dg-guide");
        // 左 OK: 伏せて置く
        const yL = (x) => 58 + (x - 6) * k;
        b += K.snow(6, 58, 154, 120, 50) + K.ok(16, 18, "ビンディング側を下に");
        const up = K.rect(-30, -14, 16, 14, "dg-binding", { rx: 3 }) + K.rect(12, -14, 16, 14, "dg-binding", { rx: 3 }) +
          K.boardSide(-45, 45, -14, { tipLen: 10, rise: -5, thick: 4 });
        b += K.tr(84, yL(84), up + cord("M-22,-8 Q-40,2 -64,-1") + K.circle(-64, -1, 2.5, "dg-dot"), ang);
        b += K.text(128, 72, "ソールが上", { a: "middle", cls: "t-s t-dim halo" });
        b += K.text(80, 150, "流れ止めは付けたまま", { a: "middle", cls: "t-s halo" });
        // 右 NG: ソールを下に
        const yR = (x) => 58 + (x - 166) * k;
        b += K.snow(166, 58, 314, 120, 50) + K.ng(176, 18, "ソールを下にして置く");
        const down = K.boardSide(-45, 45, 0, { tipLen: 10, rise: 5, thick: 4 }) +
          K.rect(-30, -18, 16, 14, "dg-binding", { rx: 3 }) + K.rect(12, -18, 16, 14, "dg-binding", { rx: 3 }) +
          K.line(-68, -6, -58, -6, "dg-thin") + K.line(-66, -14, -58, -14, "dg-thin");
        b += K.tr(232, yR(232), down, ang);
        const [a1x, a1y] = rp(232, yR(232), ang, 42, -24), [a2x, a2y] = rp(232, yR(232), ang, 76, -24);
        b += K.arrow(a1x, a1y, a2x, a2y, "ng");
        b += K.text(240, 150, "そのまま滑り出す", { a: "middle", cls: "t-s t-ng t-b halo" });
        return b;
      },
    },

    "board-carry": {
      cap: "エッジは鋭いので、人の多い所では体の横で立てて持つ。肩に担ぐと、振り向いたときに後ろの人に当たることがある。",
      h: 196,
      draw: (K) => {
        let b = K.line(160, 8, 160, 164, "dg-guide");
        // 左 OK
        b += K.ok(14, 18, "体の横で立てて持つ");
        b += K.line(8, 142, 152, 142, "dg-thin");
        b += K.person({ head: [50, 44], neck: [50, 53], hip: [50, 98], lElbow: [40, 74], lHand: [38, 94], rElbow: [62, 76], rHand: [74, 90],
          lKnee: [46, 118], lFoot: [44, 141], rKnee: [56, 118], rFoot: [58, 141] }, { r: 8 });
        b += K.boardTop(82, 94, 96, 20, 90);
        b += K.note(92, 70, 104, 58, "エッジは\n鋭い");
        // 右 NG
        b += K.ng(176, 18, "肩に担ぐ");
        b += K.line(168, 142, 314, 142, "dg-thin");
        b += K.person({ head: [218, 46], neck: [218, 55], hip: [218, 104], lElbow: [206, 74], lHand: [204, 62], rElbow: [230, 80], rHand: [226, 98],
          lKnee: [214, 122], lFoot: [212, 141], rKnee: [224, 122], rFoot: [226, 141] }, { r: 8 });
        b += K.boardTop(216, 64, 100, 14, -6);
        b += K.person({ head: [296, 66], neck: [296, 75], hip: [296, 110], lElbow: [288, 90], lHand: [286, 106], rElbow: [304, 90], rHand: [306, 106],
          lKnee: [292, 126], lFoot: [290, 141], rKnee: [300, 126], rFoot: [302, 141] }, { r: 8 });
        b += arcArrow(216, 62, 58, -40, 6, "ng");
        b += K.text(240, 160, "振り向くと後ろの人に当たる", { a: "middle", cls: "t-s t-ng t-b" });
        // 電車・バス
        b += K.line(8, 170, 312, 170, "dg-guide");
        b += K.rect(12, 175, 34, 14, "dg-fill", { rx: 3 }) + K.rect(16, 178, 7, 5, "dg-boot") + K.rect(26, 178, 7, 5, "dg-boot") + K.rect(36, 178, 7, 5, "dg-boot");
        b += K.circle(20, 190, 2.5, "dg-dot") + K.circle(38, 190, 2.5, "dg-dot");
        b += K.rect(52, 177, 24, 11, "dg-binding", { rx: 5 });
        b += K.text(84, 187, "電車・バスではボードケースに", { cls: "t-s" });
        return b;
      },
    },

    "theft-lock": {
      cap: "休憩中はワイヤーロックで柵やラックなど動かない物につなぐ。ステッカーを貼ると狙われにくいと言われるが、ロックでも完全には防げない。",
      h: 170,
      draw: (K) => {
        let b = K.line(8, 150, 180, 150, "dg-thin");
        b += K.line(12, 50, 12, 150, "dg-line") + K.line(172, 50, 172, 150, "dg-line") + K.line(6, 58, 178, 58, "dg-line") + K.line(6, 100, 178, 100, "dg-thin");
        b += K.text(120, 30, "動かない物につなぐ", { a: "middle", cls: "t-s" });
        // 板
        b += K.boardTop(52, 92, 118, 28, -82);
        const [b1x, b1y] = rp(52, 92, -82, 24, 0), [b2x, b2y] = rp(52, 92, -82, -24, 0), [sx, sy] = rp(52, 92, -82, -2, 0);
        b += K.tr(b1x, b1y, K.rect(-11, -6, 22, 12, "dg-binding", { rx: 3 }), 8) + K.tr(b2x, b2y, K.rect(-11, -6, 22, 12, "dg-binding", { rx: 3 }), 8);
        b += K.tr(sx, sy, K.rect(-6, -5, 12, 10, "dg-hl") + K.rect(-6, -5, 12, 10, "dg-thin"), 8);
        // ワイヤーロック
        b += K.path(`M${n(b1x + 4)},${n(b1y + 4)} Q84,86 102,80`, "dg-line");
        b += K.path("M106,72 Q96,58 106,48 Q118,42 120,58 Q120,68 112,72", "dg-line");
        b += K.rect(100, 72, 14, 16, "dg-screw", { rx: 3 });
        b += K.note(107, 88, 132, 116, "ワイヤーロック", "middle");
        b += K.note(58, 96, 80, 136, "ステッカー");
        // 吹き出し
        b += K.polygon([[196, 34], [186, 42], [196, 46]], "dg-fill") + box(196, 10, 120, 56);
        b += K.text(206, 32, "トイレ・食事の\n休憩中に起きやすい", { cls: "t-s" });
        b += K.polygon([[196, 104], [186, 112], [196, 116]], "dg-fill") + box(196, 78, 120, 84);
        b += K.text(206, 100, "ロックでも\n完全には防げない", { cls: "t-s" });
        b += K.text(206, 146, "→ 長く離れない", { cls: "t-b" });
        return b;
      },
    },
  });
})();

// ==================== 図: boots（_work/diagrams/parts/boots.js から統合） ====================
// part: boots（ブーツ）の図
(() => {
  const { n } = SETUP_DIAGRAMS.K;
  // 楕円の弧を短い線でつないだ矢印（0°=右、時計回りが正）。heads: "end" | "both"
  const arcArrow = (cx, cy, rx, ry, a1, a2, cls = "", heads = "end") => {
    const R = Math.PI / 180, N = 18, p = (a) => [cx + rx * Math.cos(a * R), cy + ry * Math.sin(a * R)];
    const pts = Array.from({ length: N + 1 }, (_, i) => p(a1 + (a2 - a1) * i / N));
    const head = ([x0, y0], [x1, y1], s = 7) => {
      const a = Math.atan2(y1 - y0, x1 - x0), hx = x1 - s * Math.cos(a), hy = y1 - s * Math.sin(a), w = s * 0.55;
      return `<polygon points="${n(x1)},${n(y1)} ${n(hx + w * Math.sin(a))},${n(hy - w * Math.cos(a))} ${n(hx - w * Math.sin(a))},${n(hy + w * Math.cos(a))}"/>`;
    };
    let b = "";
    for (let i = 0; i < N; i++) b += `<line x1="${n(pts[i][0])}" y1="${n(pts[i][1])}" x2="${n(pts[i + 1][0])}" y2="${n(pts[i + 1][1])}"/>`;
    b += head(pts[N - 1], pts[N]);
    if (heads === "both") b += head(pts[1], pts[0]);
    return `<g class="dg-arrow ${cls}">${b}</g>`;
  };
  // ブーツの中の足（横から、ブーツ bootSide と同じ座標。lift でかかとを浮かせる）
  const footIn = (cls = "dg-fill", lift = 0, top = -100) =>
    `<path class="${cls}" d="M16,${top} L17,${-30 - lift} Q17,${-11 - lift} 28,${-11 - lift} L60,-11 L92,-11 Q100,-11 98,-18 Q90,-25 72,-30 L60,-36 Q50,-42 48,-56 L46,${top}"/>`;
  // ブーツを横から（bootSide と同じ形）。足首より上を (32,-40) を軸に ang 度だけ前（つま先側）へ倒す
  const flexBoot = (ang, cls) => {
    const a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), px = 32, py = -40;
    const r = (x, y) => `${n(px + (x - px) * c - (y - py) * s)},${n(py + (x - px) * s + (y - py) * c)}`;
    return `<path class="${cls}" d="M4,0 L96,0 Q106,0 106,-10 Q106,-24 92,-28 L72,-36 Q62,-40 ${r(60, -52)} L${r(58, -88)} Q${r(58, -92)} ${r(54, -92)} L${r(10, -92)} Q${r(4, -92)} ${r(4, -86)} L2,-40 Q0,-20 2,-8 Z"/>`;
  };
  // 靴下（横から、つま先右。幅84・高さ88）
  const SOCK = "M0,0 L30,0 L30,50 Q30,58 40,60 L70,62 Q84,64 84,76 Q84,88 70,88 L16,88 Q0,88 0,72 Z";
  const SOCK_IN = "M7,7 L23,7 L23,54 Q23,66 38,67 L70,69 Q77,70 77,76 Q77,81 70,81 L16,81 Q7,81 7,72 Z";
  // ライナー（横から、bootSide と同じ座標）
  const LINER = "M8,-8 L94,-8 Q102,-10 100,-16 Q95,-23 88,-25 L70,-32 Q58,-37 55,-52 L53,-88 L8,-88 Z";

  SETUP_DIAGRAMS.add({
    "heel-tap": {
      cap: "履いたら、かかとを床にトントンと当ててブーツの奥に収め、そのあとで締める。",
      h: 160,
      draw: (K) => {
        const bx = 74, fy = 142;
        let b = K.line(8, fy, 185, fy, "dg-thin");
        b += K.tr(bx, fy, K.bootSide(0, 0, 1) + footIn("dg-fill", 0, -104) + K.arrow(56, -20, 22, -20, "sky", 6), -12);
        // トントン（上下の矢印）
        b += K.arrow(46, 112, 46, 136) + K.arrow(46, 112, 46, 88);
        b += K.text(34, 76, "トントン", { a: "middle", cls: "t-b" });
        b += K.num(206, 36, 1) + K.text(220, 40, "かかとを床に\nトントン当てる");
        b += K.text(220, 76, "奥に収まる", { cls: "t-sky t-b" });
        b += K.num(206, 116, 2) + K.text(220, 120, "そのあとで\n締める");
        return b;
      },
    },

    "boa-even": {
      cap: "すねと足首が均一に包まれるまで締める。締めすぎはしびれのもと。1本滑ったら締め直す。",
      h: 170,
      draw: (K) => {
        const s = 1.25, bx = 16, fy = 150;
        const band = K.polygon([[4, -86], [57, -86], [59, -52], [66, -40], [3, -38]], "dg-hl");
        let b = K.line(6, fy, 160, fy, "dg-thin");
        b += K.tr(bx, fy, K.bootSide(0, 0, 1) + band + K.circle(30, -56, 6, "dg-binding"), 0, s);
        b += K.text(bx + 30 * s, 24, "すね〜足首", { a: "middle", cls: "t-s" });
        b += K.ok(180, 30, "均一に包む");
        b += K.ng(180, 72, "締めすぎ") + K.text(194, 94, "足がしびれる", { cls: "t-s" });
        b += arcArrow(185, 128, 10, 10, -60, 230, "", "end");
        b += K.text(202, 126, "1本滑ったら\n締め直す", { cls: "t-b" });
        b += K.text(172, 163, "なじんで緩むことが多い", { cls: "t-s t-dim" });
        return b;
      },
    },

    "heel-lift": {
      cap: "膝を曲げてもかかとがほとんど浮かないのが目安。浮くなら①→②→③の順に試す。",
      h: 214,
      draw: (K) => {
        const bx = 26, fy = 150;
        let b = K.line(8, fy, 150, fy, "dg-thin");
        b += K.person({ hip: [22, 8], lKnee: [86, 30], lFoot: [54, 112] });
        b += K.text(94, 30, "膝を曲げる", { cls: "t-s" });
        b += K.tr(bx, fy, K.bootSide(0, 0, 1) +
          K.polygon([[4, -9], [56, -9], [28, -21], [19, -26], [17, -36], [4, -36]], "dg-area-ng") + footIn("dg-guide", 12, -92));
        b += K.line(bx + 10, fy - 16, 40, 170, "dg-thin") + K.circle(bx + 10, fy - 16, 2, "dg-dot");
        b += K.text(12, 180, "かかとの浮き（誇張）", { cls: "t-s halo" });
        b += K.text(12, 196, "ほとんど浮かないのが目安", { cls: "t-s t-b" });
        b += K.text(12, 210, "（6mmほどまでとする解説も）", { cls: "t-s t-dim" });
        // 対策の順番
        const x = 170;
        b += K.text(x - 8, 20, "浮くときは、この順に", { cls: "t-b" });
        b += K.num(x, 48, 1) + K.text(x + 14, 52, "BOAを締め直す");
        b += K.arrow(x, 60, x, 76, "dim", 5);
        b += K.num(x, 88, 2) + K.text(x + 14, 92, "アンクルストラップを\n足首の前に合わせ直す");
        b += K.arrow(x, 116, x, 132, "dim", 5);
        b += K.num(x, 144, 3) + K.text(x + 14, 148, "ショップに相談");
        b += K.text(x + 14, 165, "（熱成形・詰め物など）", { cls: "t-s t-dim" });
        return b;
      },
    },

    "break-in": {
      cap: "はじめはややきつく感じるのが普通。合計3〜5日ほどでなじむという目安（線はイメージ）。",
      h: 170,
      draw: (K) => {
        const X = (d) => 52 + (d - 1) * 38, x0 = 36, y0 = 108, yT = 30;
        const ys = [40, 64, 80, 88, 91];
        let b = K.rect(X(3) - 10, yT, X(5) - X(3) + 20, y0 - yT, "dg-hl");
        b += K.text((X(3) + X(5)) / 2, yT + 14, "なじむ目安", { a: "middle", cls: "t-s t-b" });
        b += K.polyline([[x0, yT - 6], [x0, y0], [X(5) + 18, y0]], "dg-line");
        b += K.text(8, 20, "きつさ", { cls: "t-s t-b" });
        b += K.polyline(ys.map((y, i) => [X(i + 1), y]), "dg-line");
        ys.forEach((y, i) => { b += K.circle(X(i + 1), y, 3, "dg-dot") + K.text(X(i + 1), y0 + 15, `${i + 1}`, { a: "middle", cls: "t-s" }); });
        b += K.text(X(1) + 8, 36, "ややきつい", { cls: "t-s" });
        b += K.text(X(5) + 20, y0 + 15, "日", { cls: "t-s" });
        b += K.text(X(3), y0 + 31, "滑った日数（合計）", { a: "middle", cls: "t-s t-dim" });
        b += K.text(232, 64, "最後は\n1/4サイズほど\n大きく感じる\nという目安も", { cls: "t-s", lh: 14 });
        b += K.ng(18, 158) + K.text(32, 162, "しびれ・強い痛みが続く → ショップへ", { cls: "t-b t-ng" });
        return b;
      },
    },

    "socks": {
      cap: "綿や厚すぎる靴下は避け、薄めでフィットするスノーボード用に。試し履きも同じ靴下で。",
      h: 180,
      draw: (K) => {
        let b = K.ok(20, 16, "薄めでフィット");
        b += K.tr(40, 30, K.path(SOCK, "dg-fill") + K.line(0, 10, 30, 10, "dg-thin"));
        b += K.text(18, 134, "化繊・メリノウール\nのスノーボード用", { cls: "t-s", lh: 14 });
        b += K.line(160, 10, 160, 146, "dg-thin");
        b += K.ng(180, 16, "綿・厚すぎる");
        b += K.tr(200, 30, K.tr(-4, -2, K.path(SOCK, "dg-fill"), 0, 1.1) + K.path(SOCK_IN, "dg-guide"));
        b += K.note(201, 76, 250, 44, "厚い", "start");
        b += K.text(160, 172, "試し履きも、滑る日と同じ靴下で", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "shell-fit": {
      cap: "ライナーを抜いたシェルに靴下で入り、つま先を前に当てて、かかとの後ろに入る指の本数を見る（解説による目安）。",
      h: 196,
      draw: (K) => {
        const s = 1.2, bx = 14, fy = 170;
        let b = K.line(6, fy, 150, fy, "dg-thin");
        const finger = K.rect(5, -112, 12, 100, "dg-hl", { rx: 6 }) + K.rect(5, -112, 12, 100, "dg-thin", { rx: 6 });
        b += K.tr(bx, fy, K.bootSide(0, 0, 1) + K.path("M16,-90 L17,-24 Q17,-11 28,-11 L92,-11 Q104,-11 104,-17 Q100,-24 90,-26 L72,-31 Q58,-37 54,-52 L50,-90", "dg-fill") + finger, 0, s);
        b += K.text(8, 16, "ライナーを抜いたシェル", { cls: "t-b" });
        b += K.note(bx + 11 * s, fy - 106 * s, 38, 38, "指1.5〜2本ほど", "start");
        b += K.text(41, 56, "（解説による目安）", { cls: "t-s t-dim halo" });
        b += K.arrow(bx + 76 * s, fy - 20 * s, bx + 100 * s, fy - 16 * s, "sky", 6);
        b += K.note(bx + 104 * s, fy - 16 * s, 150, 118, "つま先を前に軽く当てる", "start");
        // 小図: ライナーを入れたら
        b += K.rect(174, 18, 140, 82, "dg-thin", { rx: 8 });
        b += K.tr(182, 90, K.bootSide(0, 0, 1) + K.path(LINER, "dg-fill"), 0, 0.46);
        b += K.text(238, 38, "ライナーを\n入れたら", { cls: "t-s t-b", lh: 14 });
        b += K.text(238, 74, "きつめでも\n痛くない程度", { cls: "t-s", lh: 14 });
        return b;
      },
    },

    "boa-dial": {
      cap: "ダイヤルを押し込んで回すと締まり、引き上げると緩む（販売店の説明）。",
      h: 164,
      draw: (K) => {
        const dial = (cx, y, up) => {
          const base = K.path(`M${cx - 58},${y + 8} Q${cx},${y - 2} ${cx + 58},${y + 8}`, "dg-line") +
            K.rect(cx - 24, y - 6, 48, 8, "dg-binding", { rx: 2 });
          const top = y - 6 - (up ? 14 : 0) - 16;
          return base + (up ? K.rect(cx - 5, top + 16, 10, 14, "dg-binding") : "") +
            K.path(`M${cx - 20},${top} L${cx - 20},${top + 16} A20,6 0 0 0 ${cx + 20},${top + 16} L${cx + 20},${top} Z`, "dg-binding") +
            `<ellipse class="dg-binding" cx="${cx}" cy="${top}" rx="20" ry="6"/>`;
        };
        let b = K.line(160, 10, 160, 132, "dg-thin");
        // 左: 押し込んで回す（回す向きは本文にないので両向きの矢印）
        b += K.text(80, 22, "押し込んで回す", { a: "middle", cls: "t-b" });
        b += dial(80, 104, false);
        b += K.arrow(80, 34, 80, 62, "sky", 7);
        b += arcArrow(80, 82, 34, 11, 20, 160, "sky", "both");
        b += K.text(80, 128, "→ 締まる", { a: "middle", cls: "t-l" });
        // 右: 引き上げる
        b += K.text(240, 22, "引き上げる", { a: "middle", cls: "t-b" });
        b += dial(240, 104, true);
        b += K.arrow(240, 62, 240, 32, "sky", 7);
        b += K.text(240, 128, "→ 緩む", { a: "middle", cls: "t-l" });
        b += K.text(160, 156, "脱ぐときはダイヤルを引いてから口を広げると楽", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },

    "boot-flex": {
      cap: "柔らかめのブーツは足首を前に曲げやすい。低速では扱いやすく、高速では支えが弱い。",
      h: 160,
      draw: (K) => {
        const bx = 18, fy = 136, s = 1.05;
        const body = flexBoot(0, "dg-guide") + flexBoot(16, "dg-boot") + K.path("M4,0 L96,0 Q106,0 106,-8 L2,-8 Z", "dg-sole") +
          K.path("M58,-40 Q64,-44 70,-42", "dg-thin");
        let b = K.line(6, fy, 150, fy, "dg-thin");
        b += K.tr(bx, fy, body, 0, s);
        b += arcArrow(bx + 32 * s, fy - 40 * s, 62, 62, -98, -70, "sky", "end");
        b += K.text(12, 154, "（倒れ方は誇張）", { cls: "t-s t-dim" });
        b += K.text(164, 26, "柔らかめ", { cls: "t-l" });
        b += K.text(164, 48, "足首を前に曲げやすい", { cls: "t-b" });
        b += K.ok(172, 76) + K.text(186, 74, "プレス・低速の\nターンで扱いやすい", { cls: "t-ok" });
        b += K.ng(172, 118) + K.text(186, 122, "高速では支えが弱い", { cls: "t-ng" });
        return b;
      },
    },

    "heat-mold": {
      cap: "熱成形はライナーを足の形になじませるもの。サイズ違いは直せないので、初めてならショップに。",
      h: 172,
      draw: (K) => {
        const box = (x, k, icon, label) => K.rect(x, 6, 92, 118, "dg-thin", { rx: 8 }) + K.num(x + 12, 18, k) + icon +
          K.text(x + 46, 88, label, { a: "middle", cls: "t-s", lh: 13 });
        const wave = (x, y) => K.path(`M${x},${y} q-4,-5 0,-10 q4,-5 0,-10`, "dg-line");
        let b = box(6, 1, K.tr(28, 72, K.path(LINER, "dg-fill"), 0, 0.5) + wave(68, 46) + wave(78, 40) + wave(88, 46), "ライナーを\n温める");
        b += K.arrow(99, 60, 113, 60, "", 6);
        b += box(114, 2, K.tr(132, 72, flexBoot(0, "dg-guide") + flexBoot(14, "dg-boot") + K.path("M4,0 L96,0 Q106,0 106,-8 L2,-8 Z", "dg-sole"), 0, 0.46) +
          arcArrow(132 + 32 * 0.46, 72 - 40 * 0.46, 34, 34, -100, -64, "sky", "end"),
          "シェルに戻して\n履き、滑る姿勢\nでなじませる");
        b += K.arrow(207, 60, 221, 60, "", 6);
        b += box(222, 3, K.tr(244, 72, K.path(LINER, "dg-fill") + footIn("dg-guide", 0, -88), 0, 0.5) + K.ok(292, 36), "形が足に\n合う");
        b += K.text(160, 146, "サイズが合わないのを直すものではない", { a: "middle", cls: "t-s t-b" });
        b += K.text(160, 163, "初めてならショップに頼む", { a: "middle", cls: "t-s" });
        return b;
      },
    },

    "ftr-compact": {
      cap: "FTR構造で外寸が約10%コンパクト（メーカー説明）。板からのはみ出しが少なくなる方向（図はイメージ）。",
      h: 178,
      draw: (K) => {
        const cx = 110, cy = 106, L = 120, W = 38, top = 58, bot = 154;
        let b = K.line(14, 12, 38, 12, "dg-guide") + K.text(44, 16, "普通のブーツの外形", { cls: "t-s" });
        b += K.line(14, 30, 38, 30, "dg-line") + K.text(44, 34, "FTR：外寸 約10%コンパクト（メーカー説明）", { cls: "t-s" });
        b += K.rect(-4, top, 328, bot - top, "dg-board");
        b += K.text(312, top + 16, "つま先側エッジ", { a: "end", cls: "t-s halo" });
        b += K.text(312, bot - 8, "かかと側エッジ", { a: "end", cls: "t-s halo" });
        b += K.bootTop(cx, cy, L * 0.9, W * 0.9, 0, "dg-boot") + K.bootTop(cx, cy, L, W, 0, "dg-guide");
        b += K.note(cx + 6, cy - L * 0.47, 160, 48, "はみ出しが減る", "start");
        b += K.note(cx + 6, cy + L * 0.47, 160, 168, "はみ出しが減る", "start");
        return b;
      },
    },

    "size-m": {
      cap: "サロモン日本公式ではMが26.5〜27.5cm。27.5cmは上限なので、収まり方とストラップの余裕を確かめる。",
      h: 188,
      draw: (K) => {
        const X = (cm) => 28 + (cm - 25.5) * 80, y = 56;
        let b = K.rect(X(26.5), 24, X(27.5) - X(26.5), y - 24, "dg-area-ok");
        b += K.text((X(26.5) + X(27.5)) / 2, 45, "M（日本公式）", { a: "middle", cls: "t-b t-ok" });
        b += K.line(X(25.5) - 10, y, X(28.5) + 10, y, "dg-line");
        for (let c = 25.5; c <= 28.51; c += 0.5) {
          b += K.line(X(c), y, X(c), y + (c % 1 ? 5 : 8), "dg-line");
          b += K.text(X(c), y + 21, String(c), { a: "middle", cls: "t-s" + (c === 27.5 ? " t-b" : "") });
        }
        b += K.text(X(28.5) + 20, y + 21, "cm", { cls: "t-s" });
        b += K.arrow(X(27.5), 104, X(27.5), 84, "sky", 6);
        b += K.text(X(27.5), 120, "あなたのブーツ 27.5cm＝上限", { a: "middle", cls: "t-b t-sky" });
        b += K.text(12, 146, "確かめる", { cls: "t-s t-b" });
        b += K.text(66, 146, "・かかとがヒールカップの奥に収まるか\n・ストラップの長さに余裕があるか", { cls: "t-s", lh: 16 });
        b += K.text(12, 182, "海外の販売店では US6.5〜10 とする表も", { cls: "t-s t-dim" });
        return b;
      },
    },
  });
})();

// ==================== 図: binding（_work/diagrams/parts/binding.js から統合） ====================
// part: binding（RHYTHM の各部・調整できる所）
(() => {
  const RAD = Math.PI / 180;
  // 点を回す（度、時計回りが正）
  const rp = (x, y, deg) => [x * Math.cos(deg * RAD) - y * Math.sin(deg * RAD), x * Math.sin(deg * RAD) + y * Math.cos(deg * RAD)];
  // ハイバックを上から（かかとを包む三日月形。原点=かかとの丸みの中心、つま先は上）
  const hbTop = (K, R = 17, t = 5, up = 10, cls = "dg-binding") =>
    K.path(`M${-R},${-up} L${-R},0 A${R},${R} 0 0 0 ${R},0 L${R},${-up} L${R - t},${-up} L${R - t},0 A${R - t},${R - t} 0 0 1 ${-(R - t)},0 L${-(R - t)},${-up} Z`, cls);
  // バインディングを上から（中心0,0、つま先が上、長さ80・幅32）。side: ラチェットの側（-1=左, 1=右, 0=描かない）
  const bindTop = (K, o = {}) => {
    const { side = 0, color = "", hb = true, straps = true } = o;
    let s = K.rect(-16, -40, 32, 80, "dg-binding", { rx: 12 });
    if (color) s += K.rect(-16, -40, 32, 80, `dg-${color}`, { rx: 12 });
    s += K.circle(0, 0, 10, "dg-thin");
    if (hb) s += K.tr(0, 26, hbTop(K));
    if (straps) {
      s += K.line(-19, 10, 19, 10, "dg-strap") + K.line(-18, -27, 18, -27, "dg-strap");
      if (side) s += K.rect(side * 21 - 4, 4, 8, 12, "dg-screw", { rx: 2 }) + K.rect(side * 20 - 4, -33, 8, 12, "dg-screw", { rx: 2 });
    }
    return s;
  };

  SETUP_DIAGRAMS.add({
    "binding-lr": {
      cap: "上から見た板（つま先側が上、レギュラー）。ラチェット（バックル）が各足の外側（小指側）に来る向きが一般的な目安。本体の左右表記は実物で確かめる。",
      h: 194,
      draw: (K) => {
        const cy = 94;
        let b = K.text(160, 16, "上から見た図（つま先側が上）", { cls: "t-s t-dim", a: "middle" });
        b += K.boardTop(160, cy, 304, 76);
        b += K.text(14, cy + 4, "ノーズ", { cls: "t-s t-dim" }) + K.text(306, cy + 4, "テール", { cls: "t-s t-dim", a: "end" });
        [[100, 18, -1, "front", "左足（前）"], [220, -6, 1, "back", "右足（後ろ）"]].forEach(([x, ang, side, c, label]) => {
          b += K.tr(x, cy, bindTop(K, { side, color: c }), -ang);
          b += K.text(x, 44, label, { cls: `t-b t-${c}`, a: "middle" });
          const [rx, ry] = rp(side * 25, 10, -ang);
          b += K.line(x + rx, cy + ry, x + side * 58, 146, "dg-thin") + K.circle(x + rx, cy + ry, 2, "dg-dot");
        });
        b += K.text(160, 158, "ラチェット（バックル）は各足の外側（小指側）", { cls: "t-s t-b", a: "middle" });
        b += K.text(160, 172, "ハイバックとベースは左右非対称", { cls: "t-s t-dim", a: "middle" });
        b += K.text(160, 186, "一般的な目安。左右の表記は実物で確認", { cls: "t-s t-dim", a: "middle" });
        return b;
      },
    },

    "ankle-strap": {
      cap: "締めたときにパッドの中心が足首の前に来る長さにする。長さはラチェット側の帯（MicroMax）で細かく合わせる。",
      h: 190,
      draw: (K) => {
        const X = 34, Y = 130, s = 1.15, P = (x, y) => [X + x * s, Y + y * s];
        let body = K.bindingSide(0, 2, 1, { straps: false }) + K.bootSide(0, 0, 1);
        body += K.line(20, -6, 26, -20, "dg-line") + K.rect(20, -30, 12, 12, "dg-screw", { rx: 2 });
        body += `<path class="dg-strap" d="M30,-28 Q44,-42 64,-48"/>`;
        let b = K.tr(X, Y, body, 0, s);
        const [cx, cy] = P(62, -47), [tx, ty] = P(26, -24);
        b += K.line(cx - 6, cy, 190, cy, "dg-guide") + K.circle(cx, cy, 3, "dg-dot");
        b += K.text(194, cy - 4, "パッドの中心が", { cls: "t-b" }) + K.text(194, cy + 12, "足首の前に来る", { cls: "t-b" });
        b += K.line(tx, ty + 8, tx, 150, "dg-thin") + K.circle(tx, ty + 8, 2, "dg-dot");
        b += K.text(tx - 8, 164, "ラチェット側の帯: MicroMaxで長さを微調整", { cls: "t-s" });
        b += K.text(160, 182, "締まり切らなければ短く ／ ラチェットに届かなければ長く", { cls: "t-s t-dim", a: "middle" });
        return b;
      },
    },

    "overhang-measure": {
      cap: "エッジの真上に定規を垂直に立て、つま先側・かかと側のはみ出しをそろえる。板を傾けてもブーツが雪に擦らない程度に収める。",
      h: 200,
      draw: (K) => {
        const X = 50, Y = 142, L = 66, R = 142;
        // 板の断面（幅方向）＋ベース＋ブーツ（かかと左・つま先右）
        const set = K.rect(L, Y + 7, R - L, 6, "dg-board", { rx: 2 }) + K.rect(72, Y, 64, 7, "dg-binding", { rx: 2 }) + K.bootSide(X, Y, 1);
        let b = K.text(104, 14, "エッジの真上に定規を垂直に", { cls: "t-s", a: "middle" });
        b += set;
        b += K.line(L, 22, L, 180, "dg-guide") + K.line(R, 22, R, 180, "dg-guide");
        b += K.arrow(104, 40, 72, 40, "sky", 6) + K.arrow(104, 40, 136, 40, "sky", 6);
        b += K.text(104, 34, "ずらす", { cls: "t-s t-sky t-b halo", a: "middle" });
        // はみ出しの寸法
        b += K.line(X + 2, 118, X + 2, 180, "dg-thin") + K.line(X + 106, 132, X + 106, 180, "dg-thin");
        b += K.text(162, 158, "板の断面", { cls: "t-s t-dim" });
        b += K.dim(X + 2, 174, L, 174, "") + K.dim(R, 174, X + 106, 174, "");
        b += K.text(40, 193, "かかと側", { cls: "t-s t-b", a: "middle" }) + K.text(104, 193, "＝ そろえる ＝", { cls: "t-s t-b t-sky", a: "middle" }) + K.text(168, 193, "つま先側", { cls: "t-s t-b", a: "middle" });
        // 小図: 傾けたとき
        b += K.line(206, 12, 206, 190, "dg-thin");
        b += K.snow(206, 170, 320, 170, 40);
        b += K.tr(290, 170, K.tr(-R, -(Y + 13), set), 32, 0.62);
        b += K.text(262, 30, "板を傾けても", { cls: "t-s", a: "middle" }) + K.text(262, 45, "雪に擦らない程度", { cls: "t-s", a: "middle" });
        return b;
      },
    },

    "rhythm-asym": {
      cap: "ハイバックとベースが左右非対称。足の外側はしっかり支え、内側はしなる（メーカー説明）。",
      h: 178,
      draw: (K) => {
        const cx = 160, W = 28, hy = 110, R = 32, tx = cx + R + 22;
        let b = K.text(160, 16, "左足を上から見た例（つま先が上）", { cls: "t-s t-dim", a: "middle" });
        // ベース
        b += K.rect(cx - W, 30, 2 * W, 96, "dg-binding", { rx: 20 });
        b += K.circle(cx, 66, 13, "dg-thin");
        // ふち: 外側（左）は厚く、内側（右）は薄い
        b += K.rect(cx - W, 40, 10, 50, "dg-binding", { rx: 3 }) + K.rect(cx + W - 4, 42, 4, 46, "dg-binding", { rx: 2 });
        // ハイバック（かかとを包む）: 外側の壁が厚く、内側の壁は薄い
        b += K.path(`M${cx - R},${hy - 12} L${cx - R},${hy} A${R},${R} 0 0 0 ${cx + R},${hy} L${cx + R},${hy - 12} L${cx + R - 4},${hy - 12} L${cx + R - 4},${hy} A25,26 0 0 1 ${cx - R + 10},${hy} L${cx - R + 10},${hy - 12} Z`, "dg-binding");
        b += K.rect(cx - R - 4, 34, 20, 112, "dg-hl", { rx: 7 });
        // 内側: しなる
        b += K.path(`M${cx + R + 2},44 Q${cx + R + 18},86 ${cx + R + 2},136`, "dg-guide");
        b += K.arrow(cx + R + 2, 88, cx + R + 15, 88, "sky", 5);
        // 外側: しっかり支える
        b += K.line(cx - R - 6, 80, cx - R - 32, 80, "dg-thin") + K.circle(cx - R - 6, 80, 2, "dg-dot");
        b += K.text(cx - R - 36, 74, "外側（小指側）", { cls: "t-s", a: "end" }) + K.text(cx - R - 36, 90, "しっかり支える", { cls: "t-b", a: "end" });
        b += K.text(tx, 84, "内側（親指側）", { cls: "t-s" }) + K.text(tx, 100, "しなる", { cls: "t-b t-sky" });
        // 部品の名前
        b += K.note(cx + 10, 36, tx - 3, 38, "ベース");
        b += K.note(cx + 10, hy + R - 3, tx - 3, 146, "ハイバック（かかと）");
        b += K.text(160, 170, "局所的に当たって痛くなりにくい（メーカー説明）", { cls: "t-s", a: "middle" });
        return b;
      },
    },

    "highback-rot": {
      cap: "ハイバックはベースの中心線に対して最初から12°ひねった形。後から回せるかは実物で確認（C）。",
      h: 184,
      draw: (K) => {
        const cx = 86, cy = 86, hy = cy + 38;
        let b = K.text(8, 16, "上から見た図（つま先が上）", { cls: "t-s t-dim" });
        b += K.line(cx, 26, cx, 162, "dg-guide");
        b += K.rect(cx - 26, cy - 56, 52, 112, "dg-binding", { rx: 18 });
        b += K.text(cx, cy - 34, "ベース", { cls: "t-s t-dim", a: "middle" });
        b += K.circle(cx, cy - 8, 14, "dg-thin");
        // 基準（中心線に直角）と、12°ひねったハイバック
        b += K.line(cx - 66, hy, cx + 66, hy, "dg-guide");
        b += K.tr(cx, hy, hbTop(K, 26, 8, 16) + K.line(-62, 0, 62, 0, "dg-line"), 12);
        b += K.arc(cx, hy, 54, 0, 12, "dg-line");
        { const [lx, ly] = rp(66, 0, 6); b += K.text(cx + lx, hy + ly + 5, "12°", { cls: "t-b halo" }); }
        b += K.line(cx - 20, hy + 16, 40, 160, "dg-thin") + K.circle(cx - 20, hy + 16, 2, "dg-dot");
        b += K.text(8, 174, "ハイバック", { cls: "t-s t-b" });
        b += K.text(cx + 5, 176, "ベースの中心線", { cls: "t-s t-dim" });
        b += K.text(184, 50, "最初から12°", { cls: "t-b" }) + K.text(184, 66, "ひねった形", { cls: "t-b" });
        b += K.text(184, 98, "後から回せるかは", { cls: "t-s" }) + K.text(184, 113, "実物で確認（C）", { cls: "t-s t-b" });
        b += K.text(316, 176, "ひねりの向きは模式", { cls: "t-s t-dim", a: "end" });
        return b;
      },
    },

    cant: {
      cap: "フットベッドは外側が少し高い2.5°の傾き（カント）付き。一般には、脚を開いて立つ形に足裏を合わせ、膝の負担を減らすための構造（B）。",
      h: 180,
      draw: (K) => {
        const Y = 146;
        let b = K.boardSide(24, 156, Y + 8, { tipLen: 14, rise: 6, thick: 5 });
        b += K.person({ head: [90, 18], neck: [90, 28], hip: [90, 70], lElbow: [78, 50], lHand: [74, 70], rElbow: [102, 50], rHand: [106, 70], lKnee: [74, 106], lFoot: [58, 134], rKnee: [106, 106], rFoot: [122, 134] }, { r: 8 });
        // フットベッド（外側が高い。誇張）とブーツ（後ろから）
        [[58, -1], [122, 1]].forEach(([x, side]) => {
          b += K.polygon([[x - 20, Y + 2], [x + 20, Y + 2], [x + 20, Y - 2 - (side > 0 ? 8 : 0)], [x - 20, Y - 2 - (side < 0 ? 8 : 0)]], "dg-binding");
          b += K.tr(x, Y - 6, K.rect(-15, -18, 30, 18, "dg-boot", { rx: 5 }), -side * 11);
        });
        b += K.line(142, 136, 176, 60, "dg-thin") + K.circle(142, 136, 2, "dg-dot");
        b += K.text(180, 50, "外側が少し高い", { cls: "t-b" }) + K.text(180, 66, "2.5°（図は誇張）", { cls: "t-s" });
        b += K.text(180, 100, "足裏を脚の向きに", { cls: "t-s" }) + K.text(180, 115, "合わせる", { cls: "t-s" });
        b += K.text(180, 138, "→ 膝の負担を減らす", { cls: "t-s t-b" }) + K.text(180, 153, "（一般的な説明 B）", { cls: "t-s t-dim" });
        b += K.text(90, 176, "かかと側から見た図", { cls: "t-s t-dim", a: "middle" });
        return b;
      },
    },

    "disc-universal": {
      cap: "ユニバーサルディスクは4x4・2x4・3D・チャンネルの板に取り付けられる。CRAFTは2x4。目盛りの刻みは実物で確認（C）。",
      h: 180,
      draw: (K) => {
        const cx = 58, cy = 82;
        let b = K.circle(cx, cy, 46, "dg-binding");
        for (let a = -150; a <= -30; a += 10) { const [x1, y1] = rp(40, 0, a), [x2, y2] = rp(46, 0, a); b += K.line(cx + x1, cy + y1, cx + x2, cy + y2, "dg-thin"); }
        [45, 135, 225, 315].forEach((a) => { b += K.tr(cx, cy, K.rect(12, -3.5, 20, 7, "dg-thin", { rx: 3.5 }), a); });
        b += K.circle(cx, cy, 6, "dg-thin");
        b += K.text(cx, 146, "ユニバーサル", { cls: "t-s t-b", a: "middle" }) + K.text(cx, 160, "ディスク", { cls: "t-s t-b", a: "middle" });
        const hole = (x, y) => K.circle(x, y, 2.8, "dg-dot");
        const pats = [
          ["4x4", 0, 0, (x, y) => [[-10, -10], [10, -10], [-10, 10], [10, 10]].map(([dx, dy]) => hole(x + dx, y + dy)).join("")],
          ["2x4", 1, 0, (x, y) => [-1, 1].map((r) => [-2, -1, 0, 1, 2].map((i) => hole(x + i * 10, y + r * 10)).join("")).join("")],
          ["3D", 0, 1, (x, y) => [[0, -10], [-11, 8], [11, 8]].map(([dx, dy]) => hole(x + dx, y + dy)).join("")],
          ["チャンネル", 1, 1, (x, y) => K.rect(x - 30, y - 3, 60, 6, "dg-dot", { rx: 3 })],
        ];
        pats.forEach(([name, c, r, f]) => {
          const x0 = 118 + c * 100, y0 = 12 + r * 74, craft = name === "2x4";
          b += K.rect(x0, y0, 94, 66, craft ? "dg-area-ok" : "dg-thin", { rx: 8 });
          b += K.text(x0 + 8, y0 + 16, craft ? "2x4（CRAFT）" : name, { cls: `t-s t-b${craft ? " t-ok" : ""}` });
          b += f(x0 + 47, y0 + 42);
        });
        b += K.text(160, 174, "目盛りの刻みは実物で確認（C）", { cls: "t-s t-dim", a: "middle" });
        return b;
      },
    },

    "disc-adjust": {
      cap: "ディスクはネジを外して動かす。①回して足の角度 ②使う穴を選んでスタンス幅（1穴＝2cm）③溝でつま先・かかと方向にずらして中心の位置を微調整（推定±8mm、実物で確認）。",
      h: 192,
      draw: (K) => {
        const cx = 100, cy = 96, u = 9, R0 = 34; // u = 1cm
        let b = K.rect(-4, 12, 206, 152, "dg-board");
        b += K.text(8, 28, "ノーズ側", { cls: "t-s t-dim" }) + K.text(196, 28, "テール側", { cls: "t-s t-dim", a: "end" });
        b += K.text(8, 158, "上がつま先側", { cls: "t-s t-dim" });
        const rows = [cy - 2 * u, cy + 2 * u];
        rows.forEach((y) => [-2, -1, 0, 1, 2].forEach((i) => { b += K.circle(cx + i * 2 * u, y, 2.8, "dg-dot"); }));
        // ② 1穴ずらした位置（破線）
        b += K.circle(cx + 2 * u, cy, R0, "dg-guide");
        b += K.circle(cx, cy, R0, "dg-binding");
        for (let a = -140; a <= -40; a += 10) { const [x1, y1] = rp(R0 - 5, 0, a), [x2, y2] = rp(R0, 0, a); b += K.line(cx + x1, cy + y1, cx + x2, cy + y2, "dg-thin"); }
        rows.forEach((y) => [cx - 2 * u, cx + 2 * u].forEach((x) => { b += K.rect(x - 3.5, y - 11, 7, 22, "dg-thin", { rx: 3.5 }) + K.circle(x, y, 4, "dg-screw"); }));
        // ① 回す
        const R = 46;
        b += K.arc(cx, cy, R, -132, -48, "dg-line");
        { const [x, y] = rp(R, 0, -138), [px, py] = rp(R, 0, -124); b += K.arrow(cx + px, cy + py, cx + x, cy + y, "", 7); b += K.text(cx + x - 5, cy + y + 2, "＋", { cls: "t-b", a: "end" }); }
        { const [x, y] = rp(R, 0, -42), [px, py] = rp(R, 0, -56); b += K.arrow(cx + px, cy + py, cx + x, cy + y, "", 7); b += K.text(cx + x + 5, cy + y + 2, "−", { cls: "t-b" }); }
        b += K.num(cx, cy - R - 12, 1);
        // ② 穴を選ぶ
        b += K.arrow(cx, cy + R0 + 14, cx + 2 * u, cy + R0 + 14, "", 6) + K.num(cx - 14, cy + R0 + 14, 2);
        b += K.text(cx + 2 * u + 6, cy + R0 + 18, "2cm", { cls: "t-s" });
        // ③ 溝でずらす
        const sx = cx + 2 * u, sy = cy - 2 * u;
        b += K.arrow(sx, sy, sx, sy - 15, "sky", 5) + K.arrow(sx, sy, sx, sy + 15, "sky", 5);
        b += K.line(sx + 6, sy, 166, sy, "dg-thin") + K.num(174, sy, 3);
        // 説明
        b += K.num(220, 42, 1) + K.text(232, 46, "回す: 角度", { cls: "t-s t-b" }) + K.text(214, 62, "＋＝つま先が", { cls: "t-s" }) + K.text(214, 76, "　ノーズ側", { cls: "t-s" });
        b += K.num(220, 104, 2) + K.text(232, 108, "穴を選ぶ", { cls: "t-s t-b" }) + K.text(214, 124, "1穴＝2cm", { cls: "t-s" });
        b += K.num(220, 146, 3) + K.text(232, 150, "溝でずらす", { cls: "t-s t-b" }) + K.text(214, 166, "推定±8mm（C）", { cls: "t-s" });
        b += K.text(160, 184, "ネジを外して動かす。変えるときは3°か1穴ずつ", { cls: "t-s t-dim", a: "middle" });
        return b;
      },
    },

    "forward-lean": {
      cap: "前傾はハイバックを前に倒す量。弱いと楽で脚を動かしやすく、強いとすねが前に押されてヒールサイドの反応が速い。",
      h: 196,
      draw: (K) => {
        const Y = 134, s = 0.9;
        // ブーツ（すねの部分だけ、ハイバックと同じ点を中心に lean 度前に倒す）
        const boot = (lean) => {
          const r = (x, y) => { const [a, c] = rp(x, y - 2, lean); return [a, c + 2]; };
          const top = r(32, -92), shin = [top[0] + 22 * Math.sin(lean * RAD), top[1] - 22 * Math.cos(lean * RAD)];
          const q = (x, y) => K.P([r(x, y)]), s1 = r(58, -64), mid = K.P([[(92 + s1[0]) / 2 - 7, (-28 + s1[1]) / 2 + 5]]);
          const d = `M4,0 L96,0 Q106,0 106,-10 Q106,-24 92,-28 Q${mid} ${K.P([s1])} L${q(58, -88)} Q${q(58, -92)} ${q(54, -92)} L${q(10, -92)} Q${q(4, -92)} ${q(4, -86)} L${q(3, -40)} Q${q(1, -20)} ${q(2, -8)} Z`;
          return K.g(K.polyline([top, shin], ""), { class: "dg-person" }) + K.path(d, "dg-boot") + K.path("M4,0 L96,0 Q106,0 106,-8 L2,-8 Z", "dg-sole");
        };
        const panel = (x, lean, title, l1, l2) => {
          let b = K.text(x - 6, 22, title, { cls: "t-l" });
          b += K.line(x - 8, 40, x - 8, Y, "dg-guide");
          b += K.tr(x, Y, K.bindingSide(0, 2, 1, { lean, straps: false }) + boot(lean), 0, s);
          b += K.text(x + 46, 158, l1, { cls: "t-s t-b", a: "middle" }) + K.text(x + 46, 173, l2, { cls: "t-s", a: "middle" });
          return b;
        };
        let b = panel(46, 1, "弱い", "楽で疲れにくい", "脚を動かしやすい") + panel(206, 18, "強い", "ヒールサイドの反応が速い", "（慣れないと窮屈）");
        { const L = 18 * RAD, p = (x, y) => [206 + s * (x * Math.cos(L) - (y - 2) * Math.sin(L)), Y + s * (x * Math.sin(L) + (y - 2) * Math.cos(L) + 2)];
          const [x1, y1] = p(-2, -62), [x2, y2] = p(26, -62); b += K.arrow(x1, y1, x2, y2, "sky", 6) + K.text(x2 + 6, y2 + 12, "すねを押す", { cls: "t-s t-sky t-b halo" }); }
        b += K.text(160, 191, "何段階あるかは実物で確認（C）", { cls: "t-s t-dim", a: "middle" });
        return b;
      },
    },

    "toe-ramp": {
      cap: "トゥランプ（つま先の下の台）を工具なしで前後にずらし、ブーツのつま先の下にすき間ができない位置にする。",
      h: 192,
      draw: (K) => {
        const Y = 128;
        const panel = (x, ok) => {
          let b = K.bindingSide(x, Y, 1, { straps: false });
          b += K.rect(x + 2, Y - 7, 62, 7, "dg-binding", { rx: 1 });
          b += K.rect(ok ? x + 62 : x + 42, Y - 7, 40, 7, "dg-screw", { rx: 1 });
          if (!ok) b += K.rect(x + 82, Y - 7, 20, 7, "dg-area-ng");
          return b + K.bootSide(x, Y - 7, 1);
        };
        let b = K.ok(28, 14, "すき間なし") + K.ng(186, 14, "すき間あり");
        b += panel(24, true) + panel(182, false);
        b += K.arrow(106, 148, 82, 148, "sky", 6) + K.arrow(106, 148, 130, 148, "sky", 6);
        b += K.text(106, 166, "トゥランプを工具なしで前後に", { cls: "t-s", a: "middle" });
        b += K.line(274, 124, 280, 150, "dg-thin") + K.text(280, 166, "すき間（誇張）", { cls: "t-s t-ng t-b", a: "middle" });
        b += K.text(160, 186, "つま先の下が支えられ、トゥサイドに力が伝わる", { cls: "t-s t-b", a: "middle" });
        return b;
      },
    },

    "highback-parallel": {
      cap: "ハイバックを回せる場合、板のかかと側エッジと平行に近づけると反応が直接的（B）。RHYTHMで回せるかは実物で確認（C）。",
      h: 196,
      draw: (K) => {
        const cx = 92, cy = 70, ang = 18, sc = 1.3;
        let b = K.polygon([[-4, 12], [198, 12], [190, 44], [200, 76], [190, 108], [198, 140], [-4, 140]], "dg-board");
        b += K.text(8, 28, "つま先側", { cls: "t-s t-dim" });
        b += K.line(-4, 140, 198, 140, "dg-line") + K.text(8, 156, "かかと側エッジ", { cls: "t-s t-b" });
        let loc = bindTop(K, { hb: false, straps: false });
        loc += K.tr(0, 26, hbTop(K), ang) + K.tr(0, 26, hbTop(K, 17, 5, 10, "dg-guide"));
        b += K.tr(cx, cy, loc, -ang, sc);
        const [dx, dy] = rp(0, 26 * sc, -ang), hx = cx + dx, hy = cy + dy, [ex, ey] = rp(84, 0, -ang);
        b += K.line(hx - 84, hy, hx + 84, hy, "dg-line") + K.line(hx - ex, hy - ey, hx + ex, hy + ey, "dg-guide");
        b += K.text(206, hy + ey + 4, "破線: 足の向き", { cls: "t-s" }) + K.text(206, hy + 4, "実線: エッジと平行", { cls: "t-s t-b" });
        b += K.text(4, 174, "回せる場合、平行に近づけると反応が直接的（B）", { cls: "t-s" });
        b += K.text(4, 190, "RHYTHMで回せるかは実物で確認（C）", { cls: "t-s t-b" });
        return b;
      },
    },
  });
})();

// ==================== 図: care（_work/diagrams/parts/care.js から統合） ====================
// part: care（手入れ: チューン・ワックス・サビ・傷・保管）の図。
// スマホ幅で読めるように、横長（wide）の指示の図もすべて幅320で描く（手順は2段・3列にする）。
(() => {
  const K = SETUP_DIAGRAMS.K;

  // ---------- この part だけで使う小さな絵 ----------
  // ソール（板を裏返した一部、黒い帯）
  const sole = (x, y, w, h = 10) => K.rect(x, y, w, h, "dg-sole", { rx: 2 });
  // ワックスの塊
  const wax = (cx, cy) => K.rect(cx - 8, cy - 5, 16, 10, "dg-screw", { rx: 2 });
  // キッチンペーパー・布で拭く（左右の矢印つき）
  const wipe = (cx, y) => K.tr(cx, y - 6, K.rect(-15, -7, 30, 12, "dg-boot", { rx: 2 }), -6) +
    K.arrow(cx - 4, y - 22, cx - 24, y - 22, "sky", 6) + K.arrow(cx + 4, y - 22, cx + 24, y - 22, "sky", 6);
  // スプレーボトル（ノズルは右。rot で下向きに傾ける）
  const spray = (cx, cy, rot = 0) => K.tr(cx, cy,
    K.rect(-7, -4, 14, 24, "dg-boot", { rx: 3 }) + K.rect(-4, -10, 8, 6, "dg-binding") +
    K.polygon([[-6, -10], [9, -10], [9, -16], [-6, -18]], "dg-binding") + K.line(6, -10, 9, -3, "dg-line") +
    K.line(13, -13, 30, -6, "dg-guide") + K.line(13, -13, 31, -15, "dg-guide") + K.line(13, -13, 26, 2, "dg-guide"), rot);
  // アイロン（先が左）
  const iron = (cx, cy) => K.path(`M${cx - 24},${cy + 6} L${cx + 20},${cy + 6} L${cx + 20},${cy - 3} Q${cx + 16},${cy - 10} ${cx - 6},${cy - 10} Z`, "dg-binding") +
    K.path(`M${cx - 4},${cy - 10} L${cx - 2},${cy - 18} L${cx + 14},${cy - 18} L${cx + 15},${cy - 10}`, "dg-line");
  // ナイロンブラシ（持ち手＋毛）
  const brush = (cx, y) => {
    let b = K.rect(cx - 16, y - 16, 32, 9, "dg-binding", { rx: 3 });
    for (let x = cx - 13; x <= cx + 13; x += 4) b += K.line(x, y - 7, x, y - 1, "dg-thin");
    return b;
  };
  // 時計
  const clock = (cx, cy, r = 15) => K.circle(cx, cy, r, "dg-boot") + K.line(cx, cy, cx, cy - r + 4, "dg-line") + K.line(cx, cy, cx + r - 6, cy, "dg-line");
  // 手順の番号と、列の中央にそろえた文字
  const step = (cx, y0, k, label) => K.num(cx - 42, y0 + 10, k) + K.text(cx, y0 + 80, label, { a: "middle", cls: "t-s", lh: 14 });

  SETUP_DIAGRAMS.add({
    "season-plan": {
      cap: "シーズン10回以内なら、シーズン前にショップでチューンし、あとは簡易ワックスで十分という目安。",
      h: 140,
      draw: (K) => {
        let b = K.text(14, 22, "シーズンに10回以内なら（目安）", { cls: "t-b" });
        // ショップ
        b += K.polygon([[39, 52], [61, 38], [83, 52]], "dg-fill") + K.rect(43, 52, 36, 18, "dg-boot") + K.rect(57, 58, 9, 12, "dg-fill");
        // 簡易ワックス
        [140, 173, 206, 239, 272].forEach((x) => { b += wax(x, 60); });
        // 時間の帯
        b += K.rect(14, 76, 94, 16, "dg-fill", { rx: 3 }) + K.text(61, 88, "シーズン前", { a: "middle", cls: "t-s" });
        b += K.rect(112, 76, 182, 16, "dg-fill", { rx: 3 }) + K.text(203, 88, "シーズン中", { a: "middle", cls: "t-s" });
        b += K.arrow(294, 84, 310, 84, "", 7);
        b += K.text(61, 112, "ショップで\nチューン", { a: "middle", cls: "t-b" });
        b += K.text(203, 112, "あとは簡易ワックスで十分", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "craft-bevel": {
      cap: "CRAFTの工場出荷のエッジ（販売店情報・推定）。区間の位置はおおよそ。この仕様を伝え、一律に研がないよう相談する。",
      h: 216,
      draw: (K) => {
        const cx = 160, cy = 74, len = 292, wid = 60, h = len / 2, w = wid / 2, tip = Math.min(w * 1.6, h * 0.25), waist = w * 0.9, ex = h - tip;
        // boardTop の輪郭と同じ曲線の上に区間を重ねる
        const eY = (x) => { const t = (x / ex + 1) / 2; return w * ((1 - t) ** 2 + t * t) + waist * 2 * (1 - t) * t; };
        const along = (xa, xb, s, off = 0) => { const p = []; for (let i = 0; i <= 12; i++) { const x = xa + (xb - xa) * i / 12; p.push([cx + x, cy + s * (eY(x) - off)]); } return p; };
        const q = (p0, p1, p2, t) => p0 * (1 - t) ** 2 + 2 * p1 * (1 - t) * t + p2 * t * t;
        const cap = (s) => { const p = []; for (let i = 0; i <= 10; i++) { const t = i / 10; p.push([cx + s * q(ex, h, h, t), cy - q(w, w, 0, t)]); } for (let i = 1; i <= 10; i++) { const t = i / 10; p.push([cx + s * q(h, h, ex, t), cy + q(0, w, w, t)]); } return p; };
        let b = K.text(14, 16, "工場出荷の仕様（販売店情報・推定）", { cls: "t-s t-dim" });
        b += K.boardTop(cx, cy, len, wid);
        b += K.polygon(cap(-1), "dg-hl") + K.polygon(cap(1), "dg-hl");
        [-1, 1].forEach((s) => {
          b += K.polyline(along(-ex + 6, -52, s), "dg-strap") + K.polyline(along(52, ex - 6, s), "dg-strap");
          b += K.polygon([...along(-44, 44, s), ...along(-44, 44, s, 5).reverse()], "dg-sole");
        });
        b += K.circle(cx - 50, cy, 11, "dg-binding") + K.circle(cx + 50, cy, 11, "dg-binding");
        // 角度はエッジの外側に書く（ビンディング角度と取り違えないように）
        b += K.text(cx - 96, cy - w - 6, "2°", { a: "middle", cls: "t-b" }) + K.text(cx, cy - w - 6, "3°", { a: "middle", cls: "t-b" }) + K.text(cx + 96, cy - w - 6, "2°", { a: "middle", cls: "t-b" });
        b += K.text(14, 120, "ノーズ", { cls: "t-s t-dim" }) + K.text(306, 120, "テール", { a: "end", cls: "t-s t-dim" }) + K.text(160, 120, "位置はおおよそ", { a: "middle", cls: "t-s t-dim" });
        // 凡例
        b += K.rect(14, 130, 28, 12, "dg-hl", { rx: 2 }) + K.text(50, 140, "先端：エッジを丸める（ディチューン）");
        b += K.line(16, 158, 40, 158, "dg-strap") + K.text(50, 162, "サイドカットの要所：ベベル2°");
        b += K.rect(14, 176, 28, 6, "dg-sole") + K.text(50, 184, "足の間：ベベル3°");
        b += K.text(14, 206, "→ この仕様を伝え、一律に研がないよう相談", { cls: "t-b" });
        return b;
      },
    },

    "wax-frequency": {
      cap: "ワックスの頻度の目安。10回以内ならシーズン前後に1回ずつ、20回以上なら月1回＋大事な日の前。",
      h: 154,
      draw: (K) => {
        let b = wax(252, 16) + K.text(264, 20, "＝ワックス", { cls: "t-s" });
        // 10回以内
        b += K.text(14, 20, "シーズン10回以内", { cls: "t-b" });
        b += K.rect(60, 36, 200, 14, "dg-fill", { rx: 3 }) + K.text(160, 47, "シーズン", { a: "middle", cls: "t-s t-dim" });
        b += wax(36, 43) + wax(284, 43);
        b += K.text(36, 68, "前に1回", { a: "middle", cls: "t-s" }) + K.text(284, 68, "後に1回", { a: "middle", cls: "t-s" });
        // 20回以上
        b += K.text(14, 90, "20回以上", { cls: "t-b" });
        b += K.rect(60, 116, 200, 14, "dg-fill", { rx: 3 }) + K.text(160, 127, "シーズン", { a: "middle", cls: "t-s t-dim" });
        [60, 110, 160, 210].forEach((x) => { b += wax(x + 6, 108); });
        // 大事な日（旗）の直前にワックス
        b += wax(238, 108) + K.line(256, 116, 256, 88, "dg-line") + K.polygon([[256, 88], [270, 92], [256, 96]], "dg-fill");
        b += K.text(116, 146, "月1回", { a: "middle", cls: "t-s" }) + K.text(244, 146, "＋大事な日の前", { a: "middle", cls: "t-s" });
        return b;
      },
    },

    "wax-dry": {
      cap: "ワックスが切れると、エッジ付近のソールが毛羽立つ。黒いソールでは抜けた所が白っぽく見える。",
      h: 166,
      draw: (K) => {
        const x1 = 22, x2 = 298, top = 46, bot = 112;
        let b = K.text(14, 14, "ソール側から見た板の一部", { cls: "t-s t-dim" });
        b += K.polygon([[x1 + 6, top], [x2, top], [x2 - 6, bot], [x1, bot]], "dg-sole");
        b += K.polygon([[x1 + 6, top - 5], [x2, top - 5], [x2, top], [x1 + 6, top]], "dg-binding");
        b += K.polygon([[x1, bot], [x2 - 6, bot], [x2 - 6, bot + 5], [x1, bot + 5]], "dg-binding");
        // 白っぽく毛羽立った帯（ぎざぎざ）
        const band = (y0, dir, xa, xb) => { const p = [[xa, y0]]; for (let x = xa, i = 0; x <= xb; x += 8, i++) p.push([x, y0 + dir * (i % 2 ? 7 : 12)]); p.push([xb, y0]); return p; };
        b += K.polygon(band(top, 1, 60, 250), "dg-snow") + K.polygon(band(bot, -1, 90, 270), "dg-snow");
        b += K.note(150, top + 6, 190, 28, "エッジ付近が毛羽立つ") + K.note(46, top - 3, 30, 28, "エッジ", "end");
        b += K.text(160, 140, "ワックスが抜けた所は白っぽく見える", { a: "middle", cls: "t-b" });
        b += K.text(160, 158, "（黒いソールの場合）", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },

    "sintered": {
      cap: "シンタード（焼結）ソールは、焼き固めた粒のすき間にワックスがしみ込みやすい（拡大したイメージ）。",
      h: 162,
      draw: (K) => {
        const x0 = 18, y0 = 54, cw = 172, ch = 82;
        let b = K.text(14, 16, "ソールの拡大（イメージ）", { cls: "t-s t-dim" });
        b += K.rect(x0, y0, cw, ch, "dg-fill") + K.rect(x0, y0, cw, 42, "dg-hl");
        for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) b += K.circle(x0 + 10 + c * 17, y0 + 9 + r * 16, 6.5, "dg-boot");
        b += K.rect(x0, y0 - 7, cw, 7, "dg-screw");
        b += K.text(x0, y0 - 13, "ワックス", { cls: "t-s" });
        [1, 4, 7].forEach((c) => { const x = x0 + 18.5 + c * 17; b += K.arrow(x, y0 - 3, x, y0 + 40, "sky", 6); });
        b += K.text(x0 + cw / 2, y0 + ch + 16, "焼き固めた小さな粒", { a: "middle", cls: "t-s" });
        b += K.text(204, 72, "ワックスが\nしみ込みやすい", { cls: "t-b", lh: 16 });
        b += K.arrow(240, 98, 240, 112, "", 6);
        b += K.text(204, 130, "こまめにかけるほど\n滑りを保ちやすい", { lh: 16 });
        return b;
      },
    },

    "wax-easy": {
      cap: "アイロンなしの簡易ワックス。5分ほどで終わるが効果は数時間なので、滑る前や昼休みに塗り直す。",
      h: 200,
      draw: (K) => {
        const y0 = 6, sy = 68;
        let b = "";
        // ① リムーバー → ペーパー
        b += spray(34, 40, 50) + sole(12, sy, 86) + wipe(80, sy);
        b += step(55, y0 + 12, "1", "リムーバーを\n吹き付けて\nペーパーで拭く");
        // ② ワックスを塗る（ペーストはコルク）
        b += sole(117, sy, 86) + K.rect(117, sy, 52, 10, "dg-hl") + K.rect(140, sy - 16, 44, 16, "dg-fill", { rx: 3 }) + K.text(162, sy - 4, "コルク", { a: "middle", cls: "t-s" });
        b += K.arrow(156, sy - 26, 132, sy - 26, "sky", 6) + K.arrow(168, sy - 26, 192, sy - 26, "sky", 6);
        b += step(160, y0 + 12, "2", "ワックスを\nムラなく塗る\n（ペーストは\nコルクで擦り込む）");
        // ③ ナイロンブラシ
        b += sole(222, sy, 86) + K.rect(222, sy, 86, 10, "dg-hl") + brush(262, sy) + K.arrow(282, sy - 12, 304, sy - 12, "sky", 6);
        b += step(265, y0 + 12, "3", "ナイロンブラシ\nで仕上げる");
        b += K.line(14, 158, 306, 158, "dg-guide");
        b += K.text(160, 176, "5分ほど ／ 効果は数時間ほど", { a: "middle" });
        b += K.text(160, 192, "→ 滑る前や昼休みに塗り直す", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "wax-hot": {
      cap: "ホットワックスの流れ。アイロンを一か所に当て続けるとソールを傷める恐れがある。",
      h: 236,
      draw: (K) => {
        const cols = [55, 160, 265], rows = [4, 120];
        const sy = (r) => rows[r] + 58;
        let b = "";
        // ① 汚れを落とす
        b += sole(cols[0] - 43, sy(0), 86) + wipe(cols[0], sy(0));
        b += step(cols[0], rows[0], "1", "汚れを落とす");
        // ② アイロンで溶かす（ワックスをアイロンの先に当てて垂らす）
        b += sole(cols[1] - 43, sy(0), 86) + iron(cols[1] + 12, sy(0) - 24) + wax(cols[1] - 18, sy(0) - 26);
        [-14, -6].forEach((d) => { b += K.circle(cols[1] - 18, sy(0) + d, 2.5, "dg-screw"); });
        b += step(cols[1], rows[0], "2", "アイロンで\nワックスを溶かす");
        // ③ 止めずに動かす
        b += sole(cols[2] - 43, sy(0), 86) + K.rect(cols[2] - 43, sy(0), 86, 10, "dg-hl") + iron(cols[2] + 2, sy(0) - 7);
        b += K.arrow(cols[2] - 4, sy(0) - 34, cols[2] - 30, sy(0) - 34, "ok", 6) + K.arrow(cols[2] + 8, sy(0) - 34, cols[2] + 34, sy(0) - 34, "ok", 6);
        b += step(cols[2], rows[0], "3", "止めずに動かす");
        b += K.ng(cols[2] - 38, rows[0] + 94) + K.text(cols[2] - 24, rows[0] + 98, "一か所に当て", { cls: "t-s t-ng" }) + K.text(cols[2] - 24, rows[0] + 112, "続けない", { cls: "t-s t-ng" });
        // ④ 冷ます
        b += sole(cols[0] - 43, sy(1), 86) + K.rect(cols[0] - 43, sy(1), 86, 10, "dg-hl") + clock(cols[0], sy(1) - 22);
        b += step(cols[0], rows[1], "4", "10〜20分ほど\n冷ます");
        // ⑤ スクレーパー（進む先にまだ余分なワックス）
        b += sole(cols[1] - 43, sy(1), 86) + K.rect(cols[1] + 6, sy(1), 37, 10, "dg-hl");
        b += K.tr(cols[1] + 4, sy(1) - 14, K.rect(-4, -18, 8, 34, "dg-fill", { rx: 2 }), 30);
        b += K.arrow(cols[1] + 10, sy(1) - 36, cols[1] + 36, sy(1) - 36, "sky", 6);
        b += step(cols[1], rows[1], "5", "スクレーパーで\n余分を削る");
        // ⑥ ブラシ
        b += sole(cols[2] - 43, sy(1), 86) + brush(cols[2] - 2, sy(1)) + K.arrow(cols[2] + 18, sy(1) - 12, cols[2] + 40, sy(1) - 12, "sky", 6);
        b += step(cols[2], rows[1], "6", "ナイロンブラシ\nで仕上げる");
        return b;
      },
    },

    "boots-dry": {
      cap: "ブーツはBOAをゆるめ、インナーとインソールを出して乾かす。ストーブやドライヤーの熱は使わない。",
      h: 228,
      draw: (K) => {
        let b = K.ok(16, 18, "分けて乾かす") + K.ng(200, 18, "熱で乾かす");
        b += K.line(186, 8, 186, 204, "dg-guide");
        // OK: ブーツ（新聞紙）・インナー・インソール・扇風機
        // インナー・インソール（左）、新聞紙を詰めたブーツ（扇風機の前）
        b += K.path("M12,118 L12,76 Q12,68 20,68 L36,68 Q42,68 42,76 L42,98 L58,102 Q66,106 64,118 Z", "dg-fill");
        b += K.rect(6, 124, 64, 6, "dg-binding", { rx: 3 });
        b += K.tr(66, 6, K.path("M20,64 Q14,52 24,48 Q28,40 37,44 Q46,40 50,49 Q55,57 50,64 Z", "dg-boot") + K.path("M25,52 L44,49 M27,57 L46,55", "dg-thin"));
        b += K.bootSide(82, 124, 0.58);
        b += K.circle(108, 104, 5, "dg-binding") + K.arc(108, 104, 10, 200, 320, "dg-thin");
        b += K.circle(166, 64, 15, "dg-boot") + K.circle(166, 64, 3, "dg-dot") + K.line(166, 50, 166, 78, "dg-thin") + K.line(152, 64, 180, 64, "dg-thin");
        b += K.line(166, 79, 166, 122, "dg-line") + K.line(156, 124, 176, 124, "dg-line");
        b += K.arrow(148, 54, 128, 54, "sky", 6) + K.arrow(148, 74, 128, 74, "sky", 6);
        b += K.text(14, 152, "・BOAをゆるめる\n・インナーとインソールを出す", { cls: "t-s", lh: 15 });
        b += K.text(14, 186, "早く乾かすなら", { cls: "t-s t-dim" }) + K.text(14, 201, "・新聞紙を詰めて扇風機の風", { cls: "t-s" });
        // NG: ストーブ・ドライヤー
        b += K.rect(198, 72, 34, 48, "dg-binding", { rx: 3 });
        [84, 94, 104].forEach((y) => { b += K.line(204, y, 226, y, "dg-thin"); });
        b += K.path("M204,64 q4,-6 0,-12 q-4,-6 0,-12 M215,64 q4,-6 0,-12 q-4,-6 0,-12 M226,64 q4,-6 0,-12 q-4,-6 0,-12", "dg-thin");
        b += K.rect(252, 62, 14, 16, "dg-binding") + K.path("M262,70 Q262,58 276,58 L292,58 Q304,58 304,70 Q304,82 292,82 L286,82 L284,104 L274,104 L272,82 Q262,82 262,70 Z", "dg-binding");
        b += K.arrow(250, 64, 238, 56, "ng", 6) + K.arrow(250, 76, 238, 84, "ng", 6);
        b += K.text(215, 138, "ストーブ", { a: "middle", cls: "t-s" }) + K.text(282, 138, "ドライヤー", { a: "middle", cls: "t-s" });
        b += K.text(196, 164, "→ ソールがはがれる\n→ 臭いの原因", { cls: "t-s t-ng", lh: 15 });
        b += K.text(160, 222, "インナーは外せる場合だけ。無理に引き抜かない", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },

    "edge-rust": {
      cap: "エッジの表面の薄いサビは、消しゴム状のサビ取りで早めに落とし、サビ止めを塗る。",
      h: 214,
      draw: (K) => {
        const rust = (pts) => pts.map(([x, y]) => K.circle(x, y, 2, "dg-back")).join("");
        let b = K.text(14, 18, "エッジの拡大（イメージ）", { cls: "t-s t-dim" });
        b += K.rect(14, 28, 292, 18, "dg-board") + K.rect(14, 46, 292, 10, "dg-binding");
        b += rust([[70, 50], [78, 53], [86, 49], [95, 52], [150, 51], [158, 48], [166, 53], [230, 50], [238, 53]]);
        b += K.note(158, 52, 176, 72, "表面の薄いサビ") + K.note(40, 51, 30, 72, "エッジ（金属）");
        // ① 消しゴム状のサビ取り（右はまだサビが残る）
        b += K.num(22, 96, "1") + K.rect(26, 128, 110, 8, "dg-binding") + rust([[114, 131], [122, 133], [129, 130]]);
        b += K.tr(80, 118, K.rect(-16, -8, 32, 16, "dg-boot", { rx: 3 }), -8);
        b += K.arrow(76, 102, 54, 102, "sky", 6) + K.arrow(84, 102, 106, 102, "sky", 6);
        b += K.text(82, 152, "消しゴム状の\nサビ取りでこする", { a: "middle", cls: "t-s", lh: 14 });
        // ② サビ止め
        b += K.num(176, 96, "2") + K.rect(180, 128, 110, 8, "dg-binding") + K.rect(206, 128, 70, 8, "dg-hl");
        b += K.tr(236, 100, K.rect(-8, -10, 16, 20, "dg-boot", { rx: 3 }) + K.rect(-3, -16, 6, 6, "dg-binding"), 160) + K.circle(242, 121, 2.5, "dg-screw");
        b += K.text(236, 152, "サビ止めを塗る\n（予防）", { a: "middle", cls: "t-s", lh: 14 });
        b += K.text(160, 190, "中まで入り込んだサビは取れない → 早めに", { a: "middle", cls: "t-b" });
        b += K.text(160, 206, "滑った後は水分を拭く（有効と考えられる）", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },

    "coreshot": {
      cap: "ソールを貫いて芯材まで届いた傷がコアショット。水がしみ込む前に補修する。",
      h: 206,
      draw: (K) => {
        const x1 = 96, x2 = 306, yT = 34, yC = 42, yS = 82, yB = 96;
        let b = K.text(14, 18, "板の断面（厚さは誇張）", { cls: "t-s t-dim" });
        b += K.rect(x1, yT, x2 - x1, yC - yT, "dg-binding");
        b += K.rect(x1, yC, x2 - x1, yS - yC, "dg-hl") + K.rect(x1, yC, x2 - x1, yS - yC, "dg-thin");
        b += K.rect(x1 + 10, yS, x2 - x1 - 20, yB - yS, "dg-sole");
        b += K.rect(x1, yS, 10, yB - yS, "dg-binding") + K.rect(x2 - 10, yS, 10, yB - yS, "dg-binding");
        // 浅い傷 / 深い傷（コアショット）
        b += K.polygon([[140, yB + 1], [150, yS + 7], [160, yB + 1]], "dg-snow");
        b += K.polygon([[236, yB + 1], [248, yS - 14], [260, yB + 1]], "dg-snow");
        b += K.arrow(226, 126, 242, yS + 8, "sky", 6) + K.arrow(270, 126, 254, yS + 8, "sky", 6);
        b += K.arrow(248, yS - 16, 238, yS - 32, "sky", 5) + K.arrow(248, yS - 16, 258, yS - 32, "sky", 5);
        // 層の名前
        b += K.note(x1 + 4, yT + 4, 60, yT - 2, "トップ", "end");
        b += K.note(x1 + 4, 62, 60, 58, "芯材", "end");
        b += K.note(x1 + 30, yS + 7, 60, yS + 4, "ソール", "end");
        b += K.note(x1 + 5, yB - 2, 60, yB + 14, "エッジ", "end");
        b += K.text(150, 126, "浅い傷", { a: "middle", cls: "t-b" }) + K.text(150, 141, "ソールの中", { a: "middle", cls: "t-s" });
        b += K.text(248, 144, "コアショット", { a: "middle", cls: "t-b t-ng" }) + K.text(248, 158, "芯材まで届き水が入る", { a: "middle", cls: "t-s" });
        b += K.text(14, 182, "深い傷・進行方向を横切る傷は早めに補修", { cls: "t-b" });
        b += K.text(14, 198, "芯材が見えるなど不安ならショップに相談", { cls: "t-s" });
        return b;
      },
    },

    "offseason-steps": {
      cap: "シーズン後の保管の手順。ワックスははがさずに残して、酸化や汚れを防ぐ。",
      h: 240,
      draw: (K) => {
        const cols = [55, 160, 265], rows = [4, 122];
        const sy = (r) => rows[r] + 58;
        let b = "";
        // ① 汚れを落とす
        b += K.rect(cols[0] - 43, sy(0), 86, 10, "dg-board", { rx: 3 }) + wipe(cols[0], sy(0));
        b += step(cols[0], rows[0], "1", "汚れを落とす");
        // ② 完全に乾かす
        b += K.rect(cols[1] - 43, sy(0), 86, 10, "dg-board", { rx: 3 });
        [-34, -22, -10].forEach((d, i) => { b += K.path(`M${cols[1] - 30 + i * 6},${sy(0) + d} q12,-6 24,0 t24,0`, "dg-guide"); });
        b += step(cols[1], rows[0], "2", "完全に乾かす");
        // ③ 軽いサビを消しゴムで
        b += K.rect(cols[2] - 43, sy(0) + 2, 86, 8, "dg-binding") + K.tr(cols[2], sy(0) - 6, K.rect(-15, -7, 30, 14, "dg-boot", { rx: 3 }), -8);
        b += K.arrow(cols[2] - 4, sy(0) - 24, cols[2] - 24, sy(0) - 24, "sky", 6) + K.arrow(cols[2] + 4, sy(0) - 24, cols[2] + 24, sy(0) - 24, "sky", 6);
        b += step(cols[2], rows[0], "3", "軽いエッジのサビを\n専用の消しゴムで");
        // ④ ソールをクリーニング
        b += spray(cols[0] - 25, sy(1) - 30, 50) + sole(cols[0] - 43, sy(1), 86);
        b += step(cols[0], rows[1], "4", "ソールを\nクリーニング");
        // ⑤ ワックスを残す
        b += sole(cols[1] - 43, sy(1), 86) + K.rect(cols[1] - 43, sy(1) - 6, 86, 6, "dg-screw", { rx: 2 });
        b += K.text(cols[1], sy(1) - 14, "塗ったまま", { a: "middle", cls: "t-s" });
        b += step(cols[1], rows[1], "5", "ワックスを塗り\nはがさずに残す");
        // ⑥ ビンディングを外す
        b += K.rect(cols[2] - 43, sy(1), 86, 10, "dg-board", { rx: 3 }) + K.rect(cols[2] - 20, sy(1) - 8, 40, 8, "dg-binding", { rx: 2 });
        b += K.arrow(cols[2], sy(1) - 12, cols[2], sy(1) - 40, "sky", 6);
        b += step(cols[2], rows[1], "6", "ビンディングを外す\n（難しければネジを\n少し緩める）");
        return b;
      },
    },

    "storage": {
      cap: "温度変化が少なく湿度の低い屋内に、横に寝かせて置く。ベランダ・車内・屋外の物置などは避ける。",
      h: 184,
      draw: (K) => {
        let b = K.ok(16, 18, "屋内に寝かせる") + K.ng(170, 18, "避ける");
        b += K.line(156, 8, 156, 176, "dg-guide");
        // OK: 屋内
        b += K.polyline([[14, 132], [14, 64], [78, 34], [142, 64], [142, 132]], "dg-line") + K.line(8, 132, 148, 132, "dg-line");
        b += K.text(78, 80, "温度変化が少ない", { a: "middle", cls: "t-s" }) + K.text(78, 96, "湿度が低い", { a: "middle", cls: "t-s" });
        b += K.boardSide(38, 118, 128, { tipLen: 12, rise: 5, thick: 4 });
        b += K.text(78, 152, "横に寝かせて置く", { a: "middle", cls: "t-b" });
        // NG の5つ
        const ys = [48, 76, 104, 132, 160], ix = 186, tx = 208;
        // ベランダ（手すり）
        b += K.line(ix - 12, ys[0] - 8, ix + 12, ys[0] - 8, "dg-line") + K.line(ix - 14, ys[0] + 8, ix + 14, ys[0] + 8, "dg-line");
        [-10, -4, 2, 8].forEach((d) => { b += K.line(ix + d + 1, ys[0] - 8, ix + d + 1, ys[0] + 8, "dg-thin"); });
        // 車内
        b += K.path(`M${ix - 14},${ys[1] + 4} L${ix - 14},${ys[1] - 2} L${ix - 8},${ys[1] - 3} L${ix - 4},${ys[1] - 9} L${ix + 7},${ys[1] - 9} L${ix + 11},${ys[1] - 3} L${ix + 14},${ys[1] - 2} L${ix + 14},${ys[1] + 4} Z`, "dg-fill");
        b += K.circle(ix - 7, ys[1] + 5, 3.5, "dg-sole") + K.circle(ix + 7, ys[1] + 5, 3.5, "dg-sole");
        // 屋外の物置
        b += K.polygon([[ix - 12, ys[2] - 5], [ix + 12, ys[2] - 9], [ix + 12, ys[2] + 9], [ix - 12, ys[2] + 9]], "dg-fill") + K.line(ix - 15, ys[2] - 5, ix + 15, ys[2] - 10, "dg-line");
        b += K.rect(ix - 8, ys[2] - 3, 16, 12, "dg-boot") + K.line(ix, ys[2] - 3, ix, ys[2] + 9, "dg-thin") + K.line(ix - 16, ys[2] + 9, ix + 16, ys[2] + 9, "dg-line");
        // 完全な密閉（口を閉じた袋）
        b += K.rect(ix - 12, ys[3] - 9, 24, 18, "dg-fill", { rx: 3 }) + K.rect(ix - 12, ys[3] - 6, 24, 4, "dg-sole");
        // 板の上に物
        b += K.rect(ix - 15, ys[4] + 4, 30, 5, "dg-board", { rx: 2 }) + K.rect(ix - 8, ys[4] - 9, 16, 13, "dg-fill");
        ["ベランダ", "車内", "屋外の物置", "完全な密閉", "板の上に物を置く"].forEach((s, i) => { b += K.text(tx, ys[i] + 4, s); });
        return b;
      },
    },
  });
})();

// ==================== 図: mount（_work/diagrams/parts/mount.js から統合） ====================
// part: mount（床テストと取り付け手順）の図
(() => {
  const { K } = SETUP_DIAGRAMS, RAD = Math.PI / 180, n = K.n;

  // ---------- この part だけで使う部品 ----------
  // 上から見た足形（toe が上のとき rot=0）。a はアプリの角度（+でつま先がノーズ側＝左）
  const footD = (L, W) => {
    const h = L / 2, w = W / 2;
    return `M${n(-w)},${n(-h * 0.35)} Q${n(-w)},${n(-h)} 0,${n(-h)} Q${n(w)},${n(-h)} ${n(w)},${n(-h * 0.35)} ` +
      `L${n(w * 0.78)},${n(h * 0.62)} Q${n(w * 0.78)},${n(h)} 0,${n(h)} Q${n(-w * 0.78)},${n(h)} ${n(-w * 0.78)},${n(h * 0.62)} Z`;
  };
  const footTop = (cx, cy, a, L, W, fill, line) => K.tr(cx, cy, K.path(footD(L, W), fill) + (line ? K.path(footD(L, W), line) : ""), -a);
  // 角度 a のつま先の向き（画面上のベクトル）と、K.arc 用の角度（0°=右・時計回り）
  const toeV = (a, r = 1) => [-Math.sin(a * RAD) * r, -Math.cos(a * RAD) * r];
  const toeA = (a) => -90 - a;
  // 矢じり付きの円弧
  const arcArrow = (cx, cy, r, a1, a2, cls = "dg-line", acls = "", head = 7) => {
    const p = (a) => [cx + r * Math.cos(a * RAD), cy + r * Math.sin(a * RAD)], s = a2 > a1 ? 1 : -1;
    const [x0, y0] = p(a2 - s * (head + 1) / r / RAD), [x2, y2] = p(a2);
    return K.arc(cx, cy, r, a1, a2, cls) + K.arrow(x0, y0, x2, y2, acls, head);
  };
  // 横から見た足（かかと下 x,y、つま先は右、s=1で長さ約46）。足首の位置も返す
  const footSideD = "M0,0 L40,0 Q47,0 45,-5 Q41,-9 30,-11 L15,-18 Q8,-22 4,-18 Q-2,-10 0,0 Z";
  const ANKLE = [8, -15];
  // 小さなドライバー（中心 x,y、長さ約24、45°に傾ける）
  const driver = (x, y, s = 1) => K.tr(x, y, K.rect(-3.5, -12, 7, 11, "dg-binding", { rx: 2.5 }) + K.line(0, -1, 0, 11, "dg-line"), 45, s);

  SETUP_DIAGRAMS.add({
    // ================= 決める順番 =================
    "decide-order": {
      cap: "1・2（向きとプリセット）を決めたら、3〜6の順に進める。迷ったら「体に合う」を最優先、次に目的、最後に好み。",
      h: 186,
      draw: () => {
        let b = K.text(160, 18, "迷ったらこの順で優先", { a: "middle", cls: "t-s t-dim" });
        b += K.rect(10, 28, 118, 40, "dg-area-ok", { rx: 8 }) + K.text(69, 45, "体に合う", { a: "middle", cls: "t-b t-ok" }) +
          K.text(69, 60, "膝がつま先の方向", { a: "middle", cls: "t-s" });
        b += K.text(144, 53, "＞", { a: "middle", cls: "t-l" });
        b += K.rect(160, 34, 64, 28, "dg-fill", { rx: 8 }) + K.text(192, 52, "目的", { a: "middle", cls: "t-b" });
        b += K.text(240, 53, "＞", { a: "middle", cls: "t-l" });
        b += K.rect(256, 34, 54, 28, "dg-fill", { rx: 8 }) + K.text(283, 52, "好み", { a: "middle", cls: "t-b" });
        b += K.line(10, 80, 310, 80, "dg-guide");
        const xs = [42, 122, 202, 282], y = 128;
        // 3 床テスト: テープの足形
        b += footTop(xs[0] - 11, y, 15, 34, 13, "dg-hl", "dg-front") + footTop(xs[0] + 11, y, -9, 34, 13, "dg-hl", "dg-back");
        // 4 取り付ける: 板にディスクとネジ
        b += K.rect(xs[1] - 26, y - 11, 52, 22, "dg-board", { rx: 3 }) + K.circle(xs[1], y, 14, "dg-binding");
        for (const [dx, dy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) b += K.circle(xs[1] + dx, y + dy, 2.6, "dg-screw");
        // 5 ブーツに合わせる
        b += K.bindingSide(xs[2] - 22, y + 16, 0.42, { lean: 8 }) + K.bootSide(xs[2] - 22, y + 15, 0.42);
        // 6 滑って直す
        b += K.snow(xs[3] - 22, y + 3, xs[3] + 28, y + 16, 6) + K.tr(xs[3] + 4, y + 4, K.rect(-14, -2.5, 28, 5, "dg-board", { rx: 2.5 }), 14);
        b += arcArrow(xs[3] - 16, y - 12, 9, 150, 420, "dg-line", "", 6);
        ["床テスト", "取り付ける", "ブーツと\n合わせる", "滑って直す"].forEach((t, i) => {
          b += K.num(xs[i], 98, i + 3) + K.text(xs[i], 162, t, { a: "middle", cls: "t-b", lh: 14 });
          if (i < 3) b += K.arrow(xs[i] + 28, y, xs[i] + 52, y, "", 6);
        });
        b += K.text(xs[3], 177, "1回に1か所", { a: "middle", cls: "t-s" });
        return b;
      },
    },

    // ================= 床テスト =================
    "floor-test": {
      cap: "床にテープで足形を貼り（前足はプラス・後足はマイナスの向き）、その上で深くしゃがむ。膝はつま先の向きに出す。",
      h: 206,
      draw: () => {
        let b = K.num(16, 16, 1) + K.text(29, 20, "テープで足形を貼る", { cls: "t-s t-b" });
        b += K.num(192, 16, 2) + K.text(205, 20, "深くしゃがむ", { cls: "t-s t-b" });
        // 左: 床を上から
        b += K.rect(8, 30, 168, 168, "dg-thin", { rx: 8 });
        const F = [60, 118, 15], B = [124, 118, -9];
        for (const [x, y, a] of [F, B]) {
          const c = a > 0 ? "front" : "back", [vx, vy] = toeV(a, 58);
          b += K.line(x, y + 34, x, y - 62, "dg-guide");
          b += footTop(x, y, a, 56, 22, "dg-hl", `dg-${c}`);
          b += K.arrow(x, y, x + vx, y + vy, c, 6);
          b += K.arc(x, y, 48, -90, toeA(a), `dg-${c}`);
        }
        b += K.text(F[0] - 22, 50, "前足 ＋", { a: "middle", cls: "t-b t-front" }) + K.text(B[0] + 22, 50, "後足 −", { a: "middle", cls: "t-b t-back" });
        b += K.text(92, 70, "破線＝0°", { a: "middle", cls: "t-s t-dim" });
        b += K.dim(F[0], 164, B[0], 164, "足の中心の間隔", 14);
        b += K.text(16, 192, "← ノーズ側", { cls: "t-s t-dim" });
        // 右: 横から見たしゃがむ人（つま先が右）
        const fy = 186, hx = 204, s = 1.1;
        b += K.line(186, fy, 316, fy, "dg-thin");
        b += K.tr(hx, fy, K.path(footSideD, "dg-boot"), 0, s);
        const ank = [hx + ANKLE[0] * s, fy + ANKLE[1] * s], knee = [hx + 44, fy - 52], hip = [hx - 6, fy - 60];
        b += K.person({ head: [hx + 32, fy - 128], neck: [hx + 24, fy - 112], hip, lKnee: knee, lFoot: ank, lElbow: [hx + 48, fy - 94], lHand: [hx + 70, fy - 88] });
        b += K.arrow(knee[0] + 8, knee[1], knee[0] + 46, knee[1], "ok");
        b += K.text(knee[0] + 26, knee[1] - 10, "膝は", { a: "middle", cls: "t-s t-b t-ok" });
        b += K.text(knee[0] + 2, knee[1] + 20, "つま先の", { cls: "t-s t-b t-ok" }) + K.text(knee[0] + 2, knee[1] + 35, "向きに", { cls: "t-s t-b t-ok" });
        return b;
      },
    },

    // ================= 床テストの確認 3つ =================
    "knee-toe": {
      cap: "上から見た前足の例。しゃがんだとき膝がつま先の向きに出ればよい。膝が内側に入るなら、その足の角度を0°側へ3°戻す。",
      h: 212,
      draw: () => {
        let b = K.ok(16, 16, "膝がつま先の向き") + K.ng(176, 16, "膝が内側に入る") + K.line(160, 32, 160, 204, "dg-guide");
        const a = 21, panel = (cx, ng) => {
          const x = cx + 6, y = 140, [tx, ty] = toeV(a, 76), ka = ng ? -9 : a, [kx, ky] = toeV(ka, 64);
          let s = K.line(x, y, x + tx, y + ty, "dg-guide");
          s += footTop(x, y, a, 62, 24, "dg-boot", "dg-front");
          s += K.arrow(x, y, x + kx, y + ky, ng ? "ng" : "ok");
          s += K.circle(x + kx, y + ky, 6, "dg-boot") + K.text(x + kx + (ng ? 11 : -11), y + ky + 4, "膝", { a: ng ? "start" : "end", cls: "t-b" });
          s += K.text(x + tx + (ng ? 0 : 10), y + ty - 8, "つま先の向き", { a: "middle", cls: "t-s t-dim halo" });
          return s;
        };
        b += panel(76, false) + panel(236, true);
        b += K.text(258, 108, "内側へ", { cls: "t-s t-b t-ng" }) + K.text(258, 123, "＝後足の方", { cls: "t-s t-ng" });
        b += K.text(236, 190, "その足の角度を", { a: "middle", cls: "t-s t-b" }) + K.text(236, 204, "0°側へ3°戻す", { a: "middle", cls: "t-s t-b" });
        b += K.text(80, 196, "前足（＋）の例", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },
    "squat-heel": {
      cap: "横から見たしゃがんだ足元。かかとが浮くなら幅を2cm狭く（1穴内側）。足首が硬いと浮きやすいと考えられる（推定）。",
      h: 216,
      draw: () => {
        let b = K.ok(16, 16, "かかとが着く") + K.ng(176, 16, "かかとが浮く") + K.line(160, 30, 160, 190, "dg-guide");
        const fy = 154, s = 1.15, L = 45 * s;
        // しゃがんだ人（足首 ank から上）。k: 膝、hp: 腰（足首から）
        const body = (ank, k = [40, -36], hp = [-8, -44]) => {
          const knee = [ank[0] + k[0], ank[1] + k[1]], hip = [ank[0] + hp[0], ank[1] + hp[1]], neck = [hip[0] + 30, hip[1] - 40];
          return K.person({ head: [neck[0] + 8, neck[1] - 12], neck, hip, lKnee: knee, lFoot: ank, lElbow: [neck[0] + 22, neck[1] + 18], lHand: [neck[0] + 42, neck[1] + 22] }, { r: 8 });
        };
        // OK
        b += K.line(12, fy, 150, fy, "dg-thin");
        b += K.tr(44, fy, K.path(footSideD, "dg-boot"), 0, s) + body([44 + ANKLE[0] * s, fy + ANKLE[1] * s]);
        // NG: つま先を支点にかかとが浮く
        const tx = 204 + L, th = 14, c = Math.cos(th * RAD), sn = Math.sin(th * RAD), rot = (p) => [tx + p[0] * c - p[1] * sn, fy + p[0] * sn + p[1] * c];
        const heel = rot([-L, 0]), ank = rot([-L + ANKLE[0] * s, ANKLE[1] * s]);
        b += K.line(172, fy, 310, fy, "dg-thin");
        b += K.polygon([heel, [heel[0], fy], [tx - 12, fy]], "dg-area-ng");
        b += K.tr(tx, fy, K.tr(-L, 0, K.path(footSideD, "dg-boot"), 0, s), th) + body(ank, [44, -28], [-12, -32]);
        b += K.arrow(heel[0] - 8, fy - 1, heel[0] - 8, heel[1] - 6, "ng", 6);
        b += K.text(heel[0] - 14, fy - 3, "すき間", { a: "end", cls: "t-s t-ng" });
        b += K.text(240, 176, "幅を2cm狭く", { a: "middle", cls: "t-b" }) + K.text(240, 191, "（1穴内側）", { a: "middle", cls: "t-s" });
        b += K.text(160, 210, "足首が硬いと浮きやすいと考えられる（推定C）", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },
    "hip-twist": {
      cap: "上から見た両足。後足を+3°（マイナスを浅く）すると、前足と後足の向きの差（前後の開き）が減り、股関節の負担が減る。角度の差は誇張して描いている。",
      h: 208,
      draw: () => {
        const panel = (cx, back, t1, t2, c1) => {
          const y = 80, o = [cx, 166], R = 50, F = 15;
          const p = (a, r = R) => { const [vx, vy] = toeV(a, r); return [o[0] + vx, o[1] + vy]; };
          const [x1, y1] = p(F), [x2, y2] = p(back);
          let s = K.text(cx, 18, t1, { a: "middle", cls: `t-b ${c1}` }) + K.text(cx, 33, t2, { a: "middle", cls: "t-s" });
          s += footTop(cx - 36, y, F, 50, 19, "dg-boot", "dg-front") + footTop(cx + 36, y, back, 50, 19, "dg-boot", "dg-back");
          for (const [x, a, c] of [[cx - 36, F, "front"], [cx + 36, back, "back"]]) { const [vx, vy] = toeV(a, 38); s += K.arrow(x, y, x + vx, y + vy, c, 6); }
          s += K.path(`M${o[0]},${o[1]} L${n(x1)},${n(y1)} A${R},${R} 0 0 1 ${n(x2)},${n(y2)} Z`, "dg-hl");
          s += K.line(o[0], o[1], x1, y1, "dg-front") + K.line(o[0], o[1], x2, y2, "dg-back");
          s += K.text(cx - 10, 150, "開き", { a: "end", cls: "t-s t-b" });
          return s;
        };
        let b = panel(80, -24, "しんどい", "後足のマイナスが深すぎ", "") + panel(240, -12, "後足を+3°", "マイナスを浅く", "t-back");
        b += K.arrow(146, 92, 176, 92, "", 6);
        // 右: 前の角度を破線で
        const [bx, by] = toeV(-24, 50);
        b += K.line(240, 166, 240 + bx, 166 + by, "dg-guide") + arcArrow(240, 166, 56, toeA(-24), toeA(-12), "dg-back", "back", 6);
        b += K.text(160, 188, "開きが減る → 股関節の負担が減る（B）", { a: "middle", cls: "t-b" });
        b += K.text(160, 204, "角度の差は誇張して描いている", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },

    // ================= 取り付け手順 =================
    "tools-mount": {
      cap: "#3のプラスドライバーとメジャーを用意する。サイズが合わないドライバーはネジ頭をなめる（つぶす）。",
      h: 146,
      draw: () => {
        let b = K.rect(14, 34, 54, 20, "dg-binding", { rx: 7 }) + K.rect(68, 41, 72, 6, "dg-fill", { rx: 1 }) +
          K.polygon([[140, 40], [150, 44], [140, 48]], "dg-fill");
        b += K.text(14, 24, "#3のプラスドライバー", { cls: "t-b" });
        b += K.rect(14, 88, 40, 40, "dg-binding", { rx: 8 }) + K.circle(34, 108, 9, "dg-fill");
        b += K.rect(54, 116, 96, 10, "dg-screw");
        for (let x = 62; x < 150; x += 8) b += K.line(x, 116, x, x % 16 === 14 ? 122 : 119, "dg-thin");
        b += K.text(14, 80, "メジャー", { cls: "t-b" });
        // ネジ頭の拡大
        const cross = (x, y) => K.polygon([[-3, -13], [3, -13], [3, -3], [13, -3], [13, 3], [3, 3], [3, 13], [-3, 13], [-3, 3], [-13, 3], [-13, -3], [-3, -3]].map(([u, v]) => [x + u, y + v]), "dg-sole");
        const worn = (x, y) => K.path(`M${x - 5},${y - 15} Q${x},${y - 18} ${x + 5},${y - 15} Q${x + 6},${y - 6} ${x + 15},${y - 5} Q${x + 18},${y} ${x + 15},${y + 5} ` +
          `Q${x + 6},${y + 6} ${x + 5},${y + 15} Q${x},${y + 18} ${x - 5},${y + 15} Q${x - 6},${y + 6} ${x - 15},${y + 5} Q${x - 18},${y} ${x - 15},${y - 5} Q${x - 6},${y - 6} ${x - 5},${y - 15} Z`, "dg-sole");
        b += K.line(170, 14, 170, 136, "dg-guide");
        b += K.ok(186, 22, "合う") + K.ng(254, 22, "なめた");
        b += K.circle(210, 66, 24, "dg-screw") + cross(210, 66);
        b += K.circle(278, 66, 24, "dg-screw") + worn(278, 66);
        b += K.text(244, 110, "サイズが合わないと", { a: "middle", cls: "t-s" }) + K.text(244, 125, "ネジ頭をなめる（つぶれる）", { a: "middle", cls: "t-s" });
        return b;
      },
    },
    "board-orient": {
      cap: "かかと側のエッジを手前、つま先側のエッジを奥にして置く。レギュラーはノーズが左（「設定と図」の上から見た図と同じ向き）。",
      h: 160,
      draw: () => {
        let b = K.text(160, 18, "奥 ＝ つま先側エッジ", { a: "middle", cls: "t-b" });
        b += K.boardTop(160, 60, 292, 56);
        b += K.text(32, 64, "ノーズ（レギュラー）", { cls: "t-b" }) + K.text(290, 64, "テール", { a: "end", cls: "t-b" });
        b += K.text(14, 110, "手前 ＝ かかと側エッジ", { cls: "t-b" });
        // 手前に立つ自分（上から: 頭と肩）
        b += K.path("M244,154 Q244,136 264,136 Q284,136 284,154 Z", "dg-boot") + K.circle(264, 138, 9, "dg-boot");
        b += K.arrow(264, 124, 264, 96, "sky", 6) + K.text(290, 150, "自分", { cls: "t-s t-b" });
        b += K.text(14, 134, "グーフィーはノーズが右", { cls: "t-s t-dim" });
        b += K.text(14, 151, "「設定と図」の上から見た図と同じ向き", { cls: "t-s t-dim" });
        return b;
      },
    },
    "disc-angle": {
      cap: "板の真横が0°。つま先がノーズ側を向くとプラス、テール側を向くとマイナス（例: 前足+18°、後足−6°）。",
      h: 196,
      draw: () => {
        let b = K.boardTop(160, 84, 304, 100);
        b += K.text(160, 22, "つま先側", { a: "middle", cls: "t-s t-dim" });
        const feet = [[100, 80, 18, "front", "前足"], [220, 80, -6, "back", "後足"]];
        for (const [x, y, a, c, name] of feet) {
          const [vx, vy] = toeV(a, 42);
          b += K.line(x, y + 50, x, y - 42, "dg-guide");
          b += footTop(x, y, a, 52, 21, "dg-boot", `dg-${c}`);
          b += K.arrow(x, y, x + vx, y + vy, c);
          b += K.arc(x, y, 36, -90, toeA(a), `dg-${c}`);
          b += K.text(x - 10, y + 44, name, { a: "end", cls: `t-s t-b t-${c} halo` });
          b += K.text(x, 148, "0°", { a: "middle", cls: "t-s t-dim" });
        }
        b += K.text(66, 56, "+18°", { a: "middle", cls: "t-b t-front halo" }) + K.text(248, 54, "−6°", { a: "middle", cls: "t-b t-back halo" });
        b += K.text(8, 148, "← ノーズ", { cls: "t-s t-b" }) + K.text(312, 148, "テール →", { a: "end", cls: "t-s t-b" });
        b += K.text(160, 170, "つま先がノーズ側＝＋　テール側＝−", { a: "middle", cls: "t-b" });
        b += K.text(160, 188, "目盛りは3°刻み（RHYTHMは実物で確認）", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },
    "holes-place": {
      cap: "インサートは2列（列の間4cm）、同じ列の穴の間は2cmで片足1列に5個。ディスクは黄色の4穴（4cm四方）に入れ、先端から穴の中心までをメジャーで測る。",
      h: 214,
      draw: () => {
        const top = 48, bot = 148, mid = (top + bot) / 2, cx = 196, p = 22, g = 44;
        // 先端側（ノーズ）と、途中を省いた板
        let b = K.path(`M64,${top} L36,${top} Q14,${top} 14,${mid} Q14,${bot} 36,${bot} L64,${bot} L58,${mid + 25} L70,${mid} L58,${mid - 25} Z`, "dg-board");
        b += K.path(`M314,${top} L84,${top} L78,${mid - 25} L90,${mid} L78,${mid + 25} L84,${bot} L314,${bot}`, "dg-board");
        b += K.circle(cx, mid, 40, "dg-guide");
        for (let i = -2; i <= 2; i++) for (const y of [mid - g / 2, mid + g / 2]) b += K.circle(cx + i * p, y, Math.abs(i) === 1 ? 6 : 4, Math.abs(i) === 1 ? "dg-screw" : "dg-fill");
        // 先端から穴の中心まで
        for (const [i, y] of [[-1, 34], [1, 16]]) {
          b += K.line(cx + i * p, y - 4, cx + i * p, mid - g / 2 - 7, "dg-guide");
          b += K.dim(14, y, cx + i * p, y, "", 0) + K.text((14 + cx + i * p) / 2 - (i < 0 ? 6 : -10), y - 4, "先端から ○cm", { a: "middle", cls: "t-s halo" });
        }
        b += K.dim(cx + p, bot - 12, cx + 2 * p, bot - 12, "", 0) + K.text(cx + 2 * p + 8, bot - 8, "2cm", { cls: "t-s halo" });
        b += K.dim(cx + 3 * p + 8, mid - g / 2, cx + 3 * p + 8, mid + g / 2, "", 0) + K.text(cx + 3 * p + 14, mid + 4, "4cm", { cls: "t-s halo" });
        b += K.text(30, mid + 4, "ノーズ", { cls: "t-s t-b halo" });
        b += K.arrow(cx, 166, cx + p, 166, "sky", 6) + K.text(cx - 6, 170, "1穴ずらすと", { a: "end", cls: "t-s" }) + K.text(cx + p + 6, 170, "2cm動く", { cls: "t-s" });
        b += K.text(160, 190, "黄色＝ディスクのネジ4本の穴（4cm四方）", { a: "middle", cls: "t-s" });
        b += K.text(160, 206, "図は前足。後足はテール先端から測る", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },
    "disc-slot": {
      cap: "溝を板の長さ方向に向けるとスタンス幅の微調整（推定±8mm）、幅方向に向けるとつま先・かかとの前後バランスの調整。同時にはできない。動く量は実物で確認。",
      h: 216,
      draw: () => {
        let b = K.rect(6, 34, 308, 100, "dg-board");
        b += K.text(10, 24, "← ノーズ側", { cls: "t-s t-dim" }) + K.text(310, 24, "上がつま先側", { a: "end", cls: "t-s t-dim" });
        b += K.line(160, 34, 160, 134, "dg-guide");
        const disc = (cx, cy, along) => {
          let s = K.circle(cx, cy, 36, "dg-binding");
          for (const k of [-1, 1]) {
            s += along ? K.rect(cx - 25, cy + k * 16 - 5, 50, 10, "dg-fill", { rx: 5 }) : K.rect(cx + k * 16 - 5, cy - 25, 10, 50, "dg-fill", { rx: 5 });
            for (const j of [-1, 1]) s += along ? K.circle(cx + j * 13, cy + k * 16, 4, "dg-screw") : K.circle(cx + k * 16, cy + j * 13, 4, "dg-screw");
          }
          return s;
        };
        b += disc(84, 84, true) + K.arrow(44, 84, 16, 84, "sky", 6) + K.arrow(124, 84, 152, 84, "sky", 6);
        b += disc(236, 84, false) + K.arrow(236, 46, 236, 26, "sky", 6) + K.arrow(236, 122, 236, 142, "sky", 6);
        b += K.text(84, 156, "溝が長さ方向", { a: "middle", cls: "t-b" }) + K.text(84, 172, "→ 幅の微調整", { a: "middle" }) +
          K.text(84, 187, "推定±8mm（C）", { a: "middle", cls: "t-s t-dim" });
        b += K.text(236, 156, "溝が幅方向", { a: "middle", cls: "t-b" }) + K.text(236, 172, "→ つま先・かかと", { a: "middle" }) +
          K.text(236, 187, "の前後バランス", { a: "middle" });
        b += K.text(160, 210, "同時にはできない・動く量は実物で確認", { a: "middle", cls: "t-s t-b" });
        return b;
      },
    },
    "screw-hand": {
      cap: "4本のネジを手で数回まわして入れる（仮止め）。まだ締めない。",
      h: 136,
      draw: () => {
        let b = K.rect(14, 100, 156, 20, "dg-board") + K.rect(34, 88, 116, 12, "dg-binding") + K.rect(86, 100, 18, 16, "dg-fill");
        b += K.rect(91, 70, 8, 40, "dg-fill");
        for (let y = 74; y < 108; y += 5) b += K.line(91, y + 3, 99, y, "dg-thin");
        b += K.rect(80, 62, 30, 8, "dg-screw", { rx: 2 });
        b += K.tr(70, 50, K.rect(-8, -26, 16, 44, "dg-boot", { rx: 8 }), -12) + K.tr(120, 50, K.rect(-8, -26, 16, 44, "dg-boot", { rx: 8 }), 12);
        b += K.path("M141,66 A46,12 0 0 1 49,66", "dg-line") + K.arrow(56, 73, 47, 65, "", 7);
        b += K.text(95, 16, "指でまわす", { a: "middle", cls: "t-s t-b" });
        b += K.text(186, 34, "4本のネジを", { cls: "t-b" }) + K.text(186, 50, "手で数回まわす", { cls: "t-b" });
        b += K.text(186, 112, "まだ締めない", { cls: "t-b t-ng" });
        return b;
      },
    },
    "screw-check-timing": {
      cap: "取り付けた日は滑る前と1本目のあとに緩みを確認する。そのあとも滑る日ごとに、滑る前に確認する。",
      h: 190,
      draw: () => {
        const check = (x, y) => K.circle(x, y, 13, "dg-area-ok") + driver(x, y + 1);
        const dot = (x, y) => K.circle(x, y, 4, "dg-dot");
        let b = K.text(12, 22, "取り付けた日", { cls: "t-b" }) + check(226, 17) + K.text(244, 21, "＝緩みを確認", { cls: "t-s" });
        let y = 56;
        b += K.arrow(16, y, 312, y, "dim", 7);
        b += dot(40, y) + check(120, y) + dot(200, y) + check(276, y);
        [["取り付け", 40], ["滑る前", 120], ["1本目", 200], ["1本目のあと", 276]].forEach(([t, x]) => { b += K.text(x, y + 30, t, { a: "middle", cls: "t-s" }); });
        b += K.text(12, 124, "そのあと、滑る日ごと", { cls: "t-b" });
        y = 154;
        b += K.arrow(16, y, 312, y, "dim", 7);
        b += check(56, y) + dot(136, y) + check(220, y) + K.text(284, y - 6, "…", { a: "middle", cls: "t-b" });
        [["滑る前", 56], ["滑る", 136], ["次の滑る日も", 220]].forEach(([t, x]) => { b += K.text(x, y + 28, t, { a: "middle", cls: "t-s" }); });
        return b;
      },
    },
  });
})();

// ==================== 図: adjust（_work/diagrams/parts/adjust.js から統合） ====================
// part: adjust（困ったとき・変えたいときの調整表と、上達の段階）の図
(() => {
  const K = SETUP_DIAGRAMS.K, RAD = Math.PI / 180;

  // ---------- この part だけで使う小さな部品 ----------
  // 足の角度 a° のつま先の向き（上から見た図、ノーズ左）
  const dir = (a) => [-Math.sin(a * RAD), -Math.cos(a * RAD)];
  // 上から見たブーツ。side: front（青）/ back（オレンジ）。old: 破線（前の位置）
  const foot = (x, y, a, side, o = {}) => {
    const len = o.len || 38, wid = o.wid || 15, [dx, dy] = dir(a), r = len / 2 + 9;
    if (o.old) return K.bootTop(x, y, len, wid, -a, "dg-guide") + K.line(x, y, x + dx * r, y + dy * r, "dg-guide");
    return K.bootTop(x, y, len, wid, -a, "dg-boot") + K.bootTop(x, y, len, wid, -a, "dg-" + side) +
      K.arrow(x, y, x + dx * r, y + dy * r, side, 6);
  };
  const ellipse = (cx, cy, rx, ry, rot, cls) => K.tr(cx, cy, `<ellipse rx="${rx}" ry="${ry}" class="${cls}"/>`, rot);
  // 横から見た板（f(x) が板の下面の y）
  const bandF = (x1, x2, f, thick = 4, cls = "dg-board") => {
    const top = [];
    for (let x = x1; x < x2; x += 3) top.push([x, f(x) - thick]);
    top.push([x2, f(x2) - thick]);
    return K.polygon([...top, ...top.map(([x, y]) => [x, y + thick]).reverse()], cls);
  };
  // 点列に沿った帯（雪面の跡）。wf(0〜1) が幅
  const bandPts = (pts, wf, cls = "dg-fill") => {
    const L = [], R = [];
    pts.forEach(([x, y], i) => {
      const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      const d = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / d, ny = (bx - ax) / d, w = wf(i / (pts.length - 1)) / 2;
      L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]);
    });
    return K.polygon([...L, ...R.reverse()], cls);
  };
  const qpts = (p0, p1, p2, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  });
  // 上から見た滑りの軌跡（左右に振れる波）。turns: [{ L: 縦の長さ, A: 振れ幅 }]
  const snake = (cx, y0, turns, step = 2) => {
    const pts = [];
    let y = y0, s = 1;
    for (const { L, A } of turns) {
      for (let t = 0; t < L; t += step) pts.push([cx + s * A * Math.sin(Math.PI * t / L), y + t]);
      y += L; s = -s;
    }
    pts.push([cx, y]);
    return pts;
  };
  const tip = (pts, cls = "") => { const a = pts[pts.length - 4], z = pts[pts.length - 1]; return K.arrow(a[0], a[1], z[0], z[1], cls, 7); };
  const flag = (x, y) => K.line(x, y, x, y - 20) + K.polygon([[x, y - 20], [x + 13, y - 15.5], [x, y - 11]], "dg-area-ok");
  const slope = (x, y, w, h) => K.rect(x, y, w, h, "dg-snow", { rx: 8 });
  // 「まず」「次に」の行
  const step = (y, k, head, body) => K.num(20, y - 4, k) + K.text(34, y, head, { cls: "t-b" }) + K.text(64, y, body);

  SETUP_DIAGRAMS.add({
    // ================= 調整表 =================
    "fix-narrow": {
      cap: "切り返しが重いとき: まず片足を内側へ1穴（2cm）動かして幅を狭くし、変わらなければ前足を+3°。",
      h: 192,
      draw: () => {
        const cy = 58, fx = 110, bx0 = 214, bx = 196;
        let b = K.text(14, 22, "ノーズ", { cls: "t-s t-dim" }) + K.text(306, 22, "テール", { cls: "t-s t-dim", a: "end" });
        b += K.text(160, 22, "破線＝変える前", { cls: "t-s t-dim", a: "middle" });
        b += K.boardTop(160, cy, 288, 52);
        b += foot(fx, cy, 18, "front", { old: true }) + foot(bx0, cy, -6, "back", { old: true });
        b += foot(fx, cy, 32, "front") + foot(bx, cy, -6, "back");
        b += K.num(46, cy + 1, 2) + K.text(58, cy + 5, "+3°", { cls: "t-b t-front halo" });
        b += K.arrow(bx0 + 4, cy + 36, bx - 4, cy + 36, "back") + K.num(bx0 + 18, cy + 36, 1);
        b += K.dim(fx, cy + 52, bx, cy + 52, "幅が2cm狭くなる", 12);
        b += step(138, 1, "まず", "片足を内側へ1穴（2cm）") + K.text(306, 138, "図は後足の例", { cls: "t-s t-dim", a: "end" });
        b += step(160, 2, "次に", "前足 +3°") + K.text(306, 160, "ずれ・角度は誇張", { cls: "t-s t-dim", a: "end" });
        b += K.text(12, 184, "足が内側に寄って板を回しやすく、膝も動かしやすい（B）", { cls: "t-s" });
        return b;
      },
    },

    "facing": {
      cap: "前足の角度を増やすと、体（骨盤）がノーズ側を向き、進む先が見やすくなる。",
      h: 190,
      draw: () => {
        const cy = 110, cx = 160, fx = 94, bx = 226, o0 = 6, o1 = 15;
        let b = K.arrow(60, 18, 16, 18) + K.text(66, 22, "進む向き", { cls: "t-s" });
        b += K.text(308, 20, "体（骨盤）が", { a: "end" }) + K.text(308, 36, "ノーズ側を向く（B）", { a: "end", cls: "t-b" });
        b += K.boardTop(cx, cy, 292, 52);
        b += foot(fx, cy, 18, "front", { old: true }) + foot(fx, cy, 36, "front") + foot(bx, cy, -6, "back");
        const [d0x, d0y] = dir(o0), [d1x, d1y] = dir(o1), r = 74;
        b += ellipse(cx, cy, 38, 12, -o0, "dg-guide") + ellipse(cx, cy, 38, 12, -o1, "dg-fill");
        b += K.line(cx, cy, cx + d0x * r, cy + d0y * r, "dg-guide") + K.arrow(cx, cy, cx + d1x * r, cy + d1y * r, "sky");
        b += K.text(172, 58, "骨盤の向き", { cls: "t-s halo" });
        b += step(158, 1, "まず", "前足 +3°") + K.text(308, 158, "破線＝前・角度は誇張", { cls: "t-s t-dim", a: "end" });
        b += step(180, 2, "次に", "後足 +3°（マイナスを浅く）");
        return b;
      },
    },

    "heel-lean": {
      cap: "前傾を強くするとハイバックがすねに近づき、すねを後ろへ倒した力がすぐかかと側エッジに伝わる。",
      h: 190,
      draw: () => {
        const s = 0.75, y = 124;
        const scene = (x, lean) => K.rect(x - 14, y + 6.8, 100, 6, "dg-board") +
          K.bindingSide(x, y + 1.5, s, { lean, straps: false }) +
          `<g transform="translate(${x} ${y}) skewX(-10)">${K.bootSide(0, 0, s)}</g>`;
        const L = 64, R = 216;
        let b = K.text(L + 36, 18, "前傾が弱い", { a: "middle", cls: "t-b" }) + K.text(R + 36, 18, "前傾を1段強く", { a: "middle", cls: "t-b" });
        b += K.line(160, 28, 160, 150, "dg-guide");
        b += scene(L, 0) + scene(R, 12);
        for (const x of [L, R]) b += K.arrow(x + 52, y - 58, x + 18, y - 58, "sky") + K.text(x + 36, y - 80, "すねを倒す", { a: "middle", cls: "t-s" });
        b += K.note(L + 8, y - 46, L - 20, y - 30, "すきま", "end");
        b += K.arrow(R - 10, y - 52, R - 14, y + 4, "sky") + K.text(R - 16, y + 30, "かかと側エッジ", { cls: "t-s" });
        b += K.text(L + 36, 170, "すきま（誇張）", { a: "middle", cls: "t-s t-dim" }) + K.text(R + 36, 170, "倒すとすぐ伝わる", { a: "middle", cls: "t-s t-b" });
        b += K.text(160, 186, "すね → ハイバック → かかと側エッジ（B）", { a: "middle", cls: "t-s" });
        return b;
      },
    },

    "drag-touch": {
      cap: "深く傾けたとき、板からはみ出したブーツが雪に当たると、テコで板が持ち上がってエッジが抜ける（ドラグ）。",
      h: 228,
      draw: () => {
        const s = 0.56, W = 56, th = 5, ang = 60, Ys = 124, c = Math.cos(ang * RAD), sn = Math.sin(ang * RAD);
        // 板の断面（つま先側を下に傾けた）。Lb: 断面で見たブーツの長さ（板の中央に置く）
        const sec = (px, Lb, ng) => {
          const sx = Lb / (104 * s), bx = W / 2 - 54 * s * sx, yboot = -2.4;
          const pts = [[0, th], [W, th]];
          for (let t = 0; t <= 1.001; t += 0.1) { const u = 1 - t; pts.push([bx + (u * u * 96 + 2 * u * t * 106 + t * t * 106) * s * sx, yboot - t * t * 10 * s]); }
          const low = pts.reduce((m, p) => (p[0] * sn + p[1] * c > m[0] * sn + m[1] * c ? p : m));
          const tx = px - (low[0] * c - low[1] * sn), ty = Ys - (low[0] * sn + low[1] * c);
          const R = ([x, y]) => [tx + x * c - y * sn, ty + x * sn + y * c];
          const b0 = Math.max(2, bx + 6 * s * sx), b1 = Math.min(W - 2, bx + 100 * s * sx);
          const body = K.rect(0, 0, W, th, "dg-board") + K.rect(b0, -2.4, b1 - b0, 2.4, "dg-binding") +
            `<g transform="translate(${K.n(bx)} ${yboot}) scale(${K.n(sx * 100) / 100} 1)">${K.bootSide(0, 0, s)}</g>`;
          let b = K.snow(px - 86, Ys, px + 54, Ys, 12) + K.tr(tx, ty, body, ang);
          const [ex, ey] = R([W, th]);
          if (ng) {
            b += K.line(ex, ey + 2, ex - 10, Ys + 21, "dg-thin") + K.circle(ex, ey + 2, 2, "dg-dot") + K.text(px - 76, Ys + 33, "エッジが浮く", { cls: "t-s t-b t-ng halo" });
            b += K.line(px, Ys, px + 12, Ys + 20, "dg-thin") + K.circle(px, Ys, 2, "dg-dot") + K.text(px + 8, Ys + 33, "ブーツが", { cls: "t-s" }) + K.text(px + 8, Ys + 47, "雪に当たる", { cls: "t-s" });
          } else {
            const [mx, my] = R([W * 0.35, th]);
            b += K.note(mx, my, mx - 30, my, "板", "end");
            b += K.line(ex, ey, ex - 12, Ys + 21, "dg-thin") + K.circle(ex, ey, 2, "dg-dot") + K.text(ex - 62, Ys + 33, "エッジが雪に接する", { cls: "t-s" });
          }
          return b;
        };
        let b = K.ok(18, 16, "はみ出し小") + K.ng(178, 16, "はみ出し大") + K.line(160, 8, 160, Ys + 48, "dg-guide");
        b += sec(96, W - 4, false) + sec(250, W + 32, true);
        b += K.text(12, 190, "まず", { cls: "t-b" }) + K.text(42, 190, "はみ出しを実測（各エッジ1〜2cm以内 B）", { cls: "t-s" });
        b += K.text(12, 207, "次に", { cls: "t-b" }) + K.text(42, 207, "足の角度を増やす／超えるならワイド板", { cls: "t-s" });
        b += K.text(12, 223, "断面・つま先側の例。傾きとはみ出しは誇張（A）", { cls: "t-s t-dim" });
        return b;
      },
    },

    "chatter": {
      cap: "高速でバタつくときは、板をフラットにしたまま速度を出さず、板を傾けてエッジに乗って滑る。",
      h: 196,
      draw: () => {
        const panel = (p, ok) => {
          const y = 66, x1 = p + 46, x2 = p + 132;
          let b = ok ? K.ok(p + 18, 16, "エッジに乗る") : K.ng(p + 18, 16, "フラットのまま");
          b += K.line(p + 12, y - 12, p + 28, y - 12, "dg-thin") + K.line(p + 6, y - 6, p + 28, y - 6, "dg-thin") + K.line(p + 12, y, p + 28, y, "dg-thin");
          b += K.arrow(p + 70, 38, p + 110, 38) + K.text(p + 66, 42, "速い", { a: "end", cls: "t-s" });
          b += K.boardSide(x1, x2, y, { tipLen: 12, rise: 6, thick: 4 });
          if (!ok) {
            const wave = (x0, yy) => { let d = `M${x0},${yy}`; for (let i = 0; i < 4; i++) d += ` q3,${i % 2 ? 4 : -4} 6,0`; return K.path(d, "dg-line"); };
            b += wave(x1 - 14, y - 16) + wave(x2 - 10, y - 16) + wave(x1 - 14, y + 8) + wave(x2 - 10, y + 8);
            b += K.text(p + 88, y + 30, "板がバタつく（誇張）", { a: "middle", cls: "t-s t-ng" });
          }
          b += K.text(p + 10, 116, "断面", { cls: "t-s t-dim" }) + K.text(p + 10, 131, ok ? "傾ける" : "フラット", { cls: "t-s t-b" }) + K.snow(p + 58, 132, p + 150, 132, 10);
          b += ok ? K.tr(p + 124, 132, K.rect(-54, -5, 54, 5, "dg-board"), 24) : K.rect(p + 76, 127, 54, 5, "dg-board");
          return b;
        };
        let b = panel(0, true) + panel(160, false) + K.line(160, 8, 160, 146, "dg-guide");
        b += K.text(12, 168, "主な原因は板の硬さと振動の吸収（板の特性）", { cls: "t-s" });
        b += K.text(12, 186, "セッティングで変わる量は小さい（B）", { cls: "t-s" });
        return b;
      },
    },

    "switch-mirror": {
      cap: "スイッチでは前後の足が入れ替わり、+18° / −6° は +6° / −18° に見える。後足のマイナスを深くすると、逆向きの角度が普通の向きに近づく。",
      h: 206,
      draw: () => {
        const fx = 116, bx = 204;
        const row = (cy, title, left, fl, bl) => {
          let b = K.text(12, cy - 32, title, { cls: "t-b" });
          b += left ? K.arrow(300, cy - 36, 256, cy - 36) : K.arrow(256, cy - 36, 300, cy - 36);
          b += K.text(248, cy - 32, "進む", { a: "end", cls: "t-s" });
          b += K.text(50, cy + 4, "ノーズ", { a: "end", cls: "t-s t-dim" }) + K.text(270, cy + 4, "テール", { cls: "t-s t-dim" });
          b += K.boardTop(160, cy, 212, 38) + foot(fx, cy, 18, "front", { len: 32, wid: 13 }) + foot(bx, cy, -6, "back", { len: 32, wid: 13 });
          b += K.text(fx, cy + 36, fl, { a: "middle", cls: "t-b t-front" }) + K.text(bx, cy + 36, bl, { a: "middle", cls: "t-b t-back" });
          return b;
        };
        let b = row(54, "いつもの向き（ノーズが前）", true, "前足 +18°", "後足 −6°");
        b += row(146, "スイッチ（テールが前）", false, "後ろ側 −18°", "前側 +6°");
        b += K.text(160, 200, "左右対称に近いほど、2つの見え方が同じになる（A）", { a: "middle", cls: "t-s" });
        return b;
      },
    },

    "press-lever": {
      cap: "プレスはノーズかテールに体重を乗せて板をしならせる。前傾を弱くすると脚を動かしやすく、幅を広くするとテコが長くなる。",
      h: 204,
      draw: () => {
        const g = 128, x1 = 26, x2 = 294, x0 = 252;
        const f = (x) => x < x0 ? g - 34 * Math.pow((x0 - x) / (x0 - x1), 1.5) : g - 7 * Math.pow((x - x0) / (x2 - x0), 2);
        const top = (x) => f(x) - 5, bk = 116, fr = 204;
        let b = K.text(12, 20, "ノーズプレス（例）", { cls: "t-b" });
        b += K.snow(8, g, 312, g, 10) + bandF(x1, x2, f, 5);
        b += K.text(x2, g - 16, "ノーズ", { a: "end", cls: "t-s t-dim" }) + K.text(x1, top(x1) - 8, "テール", { cls: "t-s t-dim" });
        b += K.rect(bk - 10, top(bk) - 4, 20, 4, "dg-binding") + K.rect(fr - 10, top(fr) - 4, 20, 4, "dg-binding");
        b += K.person({ head: [206, 36], neck: [200, 50], hip: [190, 82], lKnee: [152, 96], lFoot: [bk, top(bk) - 4], rKnee: [214, 102], rFoot: [fr, top(fr) - 4], lElbow: [176, 52], lHand: [154, 54], rElbow: [224, 52], rHand: [246, 54] });
        b += K.arrow(256, 60, 256, 94, "sky") + K.text(262, 72, "体重を", { cls: "t-s" }) + K.text(262, 87, "ノーズへ", { cls: "t-s" });
        b += K.line(bk, top(bk) + 8, bk, 160, "dg-guide") + K.line(fr, top(fr) + 8, fr, 160, "dg-guide") + K.dim(bk, 154, fr, 154, "幅", -5);
        b += step(180, 1, "まず", "前傾を弱く → 脚を動かしやすい");
        b += step(198, 2, "次に", "幅を2cm広く → テコが長い（B）");
        return b;
      },
    },

    "ollie-lever": {
      cap: "オーリーは前足を引き上げながら後ろ足でテールを踏み、しなったテールの反発で跳ぶ。",
      h: 192,
      draw: () => {
        const g = 118, xs = [56, 162, 268];
        let b = K.snow(8, g, 312, g, 10) + K.line(109, 26, 109, g - 2, "dg-guide") + K.line(215, 26, 215, g - 2, "dg-guide");
        const hd = (X, k, label) => K.num(X - 42, 16, k) + K.text(X - 30, 20, label, { cls: "t-s" });
        // ① 踏んで引き上げ
        {
          const X = xs[0], f = (x) => g - 22 * (x - (X - 44)) / 88, t = (x) => f(x) - 4;
          b += hd(X, 1, "踏んで引き上げ") + bandF(X - 44, X + 44, f, 4);
          b += K.person({ head: [X - 6, g - 86], neck: [X - 6, g - 76], hip: [X - 4, g - 52], lKnee: [X - 22, g - 38], lFoot: [X - 26, t(X - 26)], rKnee: [X + 12, g - 46], rFoot: [X + 22, t(X + 22)], lElbow: [X - 20, g - 68], lHand: [X - 30, g - 60], rElbow: [X + 8, g - 68], rHand: [X + 18, g - 60] }, { r: 6 });
          b += K.arrow(X - 40, g - 44, X - 40, g - 18, "back", 6) + K.arrow(X + 34, g - 26, X + 34, g - 52, "front", 6);
        }
        // ② しなって反発
        {
          const X = xs[1], f = (x) => g - 30 * Math.pow((x - (X - 44)) / 88, 0.6), t = (x) => f(x) - 4;
          b += hd(X, 2, "しなって反発") + bandF(X - 44, X + 44, f, 4);
          b += K.person({ head: [X - 2, g - 80], neck: [X - 2, g - 70], hip: [X, g - 46], lKnee: [X - 18, g - 32], lFoot: [X - 26, t(X - 26)], rKnee: [X + 16, g - 44], rFoot: [X + 22, t(X + 22)], lElbow: [X - 16, g - 62], lHand: [X - 26, g - 54], rElbow: [X + 12, g - 62], rHand: [X + 22, g - 54] }, { r: 6 });
          b += K.arrow(X - 44, g - 6, X - 44, g - 40, "sky", 6);
        }
        // ③ 跳ぶ
        {
          const X = xs[2], y = g - 20, f = (x) => y - (x < X - 34 ? (X - 34 - x) * 0.5 : x > X + 34 ? (x - X - 34) * 0.5 : 0), t = (x) => f(x) - 4;
          b += hd(X, 3, "跳ぶ") + bandF(X - 44, X + 44, f, 4);
          b += K.person({ head: [X, y - 68], neck: [X, y - 58], hip: [X, y - 38], lKnee: [X - 20, y - 26], lFoot: [X - 22, t(X - 22)], rKnee: [X + 20, y - 26], rFoot: [X + 22, t(X + 22)], lElbow: [X - 14, y - 50], lHand: [X - 24, y - 42], rElbow: [X + 14, y - 50], rHand: [X + 24, y - 42] }, { r: 6 });
          b += K.arrow(X + 36, y - 12, X + 36, y - 46, "sky", 6);
        }
        b += K.text(12, 148, "幅を2cm広く → テコが長くなる（B）", { cls: "t-b" });
        b += K.text(12, 166, "足がキャンバーに乗る（推定 C）");
        b += K.text(12, 184, "ノーリーはノーズで逆", { cls: "t-s t-dim" });
        return b;
      },
    },

    "powder-setback": {
      cap: "前足を内側へ1穴・後足を外側へ1穴で、幅は同じまま中心が2cmテール寄りになり、ノーズが浮きやすい。",
      h: 192,
      draw: () => {
        const cy = 60, fx0 = 114, bx0 = 206, d = 12;
        let b = K.text(fx0 + d / 2, 16, "内側へ1穴", { a: "middle", cls: "t-s t-front" }) + K.text(bx0 + d / 2, 16, "外側へ1穴", { a: "middle", cls: "t-s t-back" });
        b += K.arrow(fx0 - 4, 26, fx0 + d + 4, 26, "front", 6) + K.arrow(bx0 - 4, 26, bx0 + d + 4, 26, "back", 6);
        b += K.text(40, cy + 4, "ノーズ", { a: "end", cls: "t-s t-dim" }) + K.text(280, cy + 4, "テール", { cls: "t-s t-dim" });
        b += K.boardTop(160, cy, 232, 44);
        b += foot(fx0, cy, 18, "front", { old: true, len: 32, wid: 13 }) + foot(bx0, cy, -6, "back", { old: true, len: 32, wid: 13 });
        b += foot(fx0 + d, cy, 18, "front", { len: 32, wid: 13 }) + foot(bx0 + d, cy, -6, "back", { len: 32, wid: 13 });
        const tri = (x, y, cls) => K.polygon([[x, y], [x - 6, y + 9], [x + 6, y + 9]], cls);
        b += tri(160, 86, "dg-guide") + tri(160 + d, 86, "dg-fill") + K.arrow(152, 102, 160 + d + 8, 102, "", 6);
        b += K.text(160 + d + 14, 106, "中心が2cmテール寄り", { cls: "t-s" }) + K.text(146, 106, "破線＝前・誇張", { a: "end", cls: "t-s t-dim" });
        // 横から（上と同じ向き: ノーズが左）
        // テール側は雪に沈む（雪を上に重ねて隠す）
        const f = (x) => 180 - (180 - x) * 0.16 - (x < 50 ? (50 - x) * (50 - x) * 0.02 : 0);
        b += bandF(24, 180, f, 5) + K.snow(8, 172, 196, 172, 18);
        b += K.text(194, 152, "横から", { a: "end", cls: "t-s t-dim" });
        b += K.arrow(34, 138, 34, 118, "sky", 6) + K.text(44, 132, "ノーズが浮きやすい（B）", { cls: "t-s t-b halo" });
        b += K.text(206, 144, "幅は同じまま") + K.text(206, 166, "スイッチを使う日は") + K.text(206, 182, "元に戻す", { cls: "t-b" });
        return b;
      },
    },

    // ================= 上達の段階 =================
    "grow-s0": {
      cap: "木の葉で左右に行き来しながら下り、緩斜面のS字ターンを止まらずにつなげ、行きたい所で止まれるようにする。",
      h: 198,
      draw: () => {
        let b = K.text(12, 18, "① 木の葉", { cls: "t-b" }) + K.text(168, 18, "② S字ターン", { cls: "t-b" }) + K.text(308, 18, "上が山側", { a: "end", cls: "t-s t-dim" });
        b += slope(8, 28, 148, 114) + slope(164, 28, 148, 114);
        const leaf = [[30, 42], [132, 58], [34, 76], [132, 94], [44, 114]];
        b += K.polyline(leaf.slice(0, -1), "dg-line") + K.arrow(132, 94, 48, 113);
        b += flag(40, 134);
        const sp = snake(238, 40, [{ L: 19, A: 42 }, { L: 19, A: 42 }, { L: 19, A: 42 }, { L: 19, A: 42 }], 2).slice(0, -2);
        b += K.polyline(sp, "dg-line") + tip(sp) + flag(250, 134);
        b += K.text(82, 160, "左右に行き来して下りる", { a: "middle", cls: "t-s" }) + K.text(238, 160, "止まらずにつなぐ", { a: "middle", cls: "t-s" });
        b += flag(88, 192) + K.text(106, 188, "行きたい所で止まれる", { cls: "t-b t-ok" });
        return b;
      },
    },

    "grow-s1": {
      cap: "中斜面でずらしながら大回り・中回りを6ターン以上つなぐ。板が谷を向くにつれて前足に乗せていく。",
      h: 206,
      draw: () => {
        let b = K.text(12, 18, "中斜面で6ターン以上つなぐ", { cls: "t-b" }) + K.text(308, 18, "上が山側", { a: "end", cls: "t-s t-dim" });
        b += slope(8, 28, 304, 170);
        const turns = [{ L: 30, A: 56 }, { L: 30, A: 56 }, { L: 30, A: 56 }, { L: 20, A: 30 }, { L: 20, A: 30 }, { L: 20, A: 30 }];
        const sp = snake(88, 40, turns).slice(0, -2);
        b += K.polyline(sp, "dg-line") + tip(sp);
        b += K.text(150, 100, "大回り", { cls: "t-s t-dim" }) + K.text(14, 164, "中回り", { cls: "t-s t-dim" });
        // 1つ目のターンの頂点（板が谷を向く）
        const ax = 88 + 56, ay = 40 + 15;
        b += K.circle(ax, ay, 4, "dg-dot") + K.line(ax + 4, ay, 181, 60, "dg-thin");
        b += K.ok(192, 60) + K.text(206, 56, "板が谷を向くにつれ", { cls: "t-s" }) + K.text(206, 72, "前足に乗せていく", { cls: "t-s t-b" });
        b += K.ng(192, 136) + K.text(206, 132, "後ろ足に乗ると", { cls: "t-s" }) + K.text(206, 148, "かえって加速", { cls: "t-s t-b t-ng" });
        b += K.text(206, 180, "ずらしながら回る", { cls: "t-s t-dim" });
        return b;
      },
    },

    "grow-s2": {
      cap: "ターンは横ずれ → ずらしのターン → ずれないターンの順に身につく。ターン後半（山回り）で板を立ててずれを減らす。",
      h: 200,
      draw: () => {
        let b = K.text(55, 18, "横ずれ", { a: "middle", cls: "t-b" }) + K.text(160, 18, "ずらしのターン", { a: "middle", cls: "t-b" }) + K.text(265, 18, "ずれないターン", { a: "middle", cls: "t-b" });
        b += K.arrow(100, 80, 114, 80, "dim", 6) + K.arrow(206, 80, 220, 80, "dim", 6);
        // 横ずれ: 太い帯
        b += K.rect(28, 38, 54, 86, "dg-fill") + K.boardTop(55, 36, 58, 12);
        // ずらしのターン: 帯が後半で細くなる
        const arc = (dx) => qpts([dx + 36, 34], [dx - 44, 80], [dx + 40, 128], 30);
        b += bandPts(arc(160), (t) => (t < 0.5 ? 20 : 20 - 26 * (t - 0.5)));
        // ずれないターン: 細い線
        const a3 = arc(265);
        b += K.polyline(a3, "dg-line") + tip(a3);
        b += K.arrow(140, 164, 160, 114, "sky") + K.text(12, 170, "ターン後半（山回り）で", { cls: "t-s" }) + K.text(12, 186, "板を立ててずれを減らす", { cls: "t-s t-b" });
        b += K.text(265, 146, "細く掘れた跡", { a: "middle", cls: "t-s t-dim" }) + K.text(308, 190, "上が山側", { a: "end", cls: "t-s t-dim" });
        return b;
      },
    },

    "grow-s3": {
      cap: "緩斜面でいつもの向きとスイッチを交互に切り替える。180で回ると逆向き（スイッチ）で着地する。",
      h: 200,
      draw: () => {
        let b = K.text(12, 18, "緩斜面で交互に", { cls: "t-b" }) + K.text(206, 18, "180で回ると", { cls: "t-b" });
        b += slope(8, 28, 188, 150);
        const zz = [[176, 46], [28, 72], [176, 102], [28, 128], [144, 156]];
        for (let i = 0; i < 4; i++) {
          const [x1, y1] = zz[i], [x2, y2] = zz[i + 1], sw = i % 2 === 1;
          b += K.line(x1, y1, x2 - (x2 - x1) * 0.06, y2 - (y2 - y1) * 0.06, sw ? "dg-guide" : "dg-line") + K.arrow(x1 + (x2 - x1) * 0.9, y1 + (y2 - y1) * 0.9, x2, y2, sw ? "sky" : "", 7);
          b += K.text((x1 + x2) / 2, (y1 + y2) / 2 - 6, sw ? "スイッチ" : "いつもの向き", { a: "middle", cls: "t-s halo" + (sw ? " t-sky" : "") });
        }
        b += K.text(12, 192, "怖ければいつもの向きに戻す", { cls: "t-s t-dim" });
        // 180
        const bx = 258;
        b += K.arrow(248, 36, 218, 36, "", 6) + K.text(254, 40, "進む向き", { cls: "t-s t-dim" });
        b += K.boardTop(bx, 62, 80, 18) + K.text(bx - 32, 66, "ノーズ", { cls: "t-s" }) + K.text(bx, 90, "いつもの向き", { a: "middle", cls: "t-s" });
        b += K.arc(bx + 40, 114, 16, -90, 90, "dg-line") + K.arrow(bx + 42, 130, bx + 36, 130, "", 6) + K.text(bx + 14, 118, "180", { a: "middle", cls: "t-b" });
        b += K.boardTop(bx, 146, 80, 18) + K.text(bx + 32, 150, "ノーズ", { a: "end", cls: "t-s" }) + K.text(bx, 174, "スイッチで着地", { a: "middle", cls: "t-s t-b" });
        return b;
      },
    },

    "grow-s4": {
      cap: "まず止まった状態や平地で、プレス（重心を移してしならせる）・オーリー（後ろ足で踏み切り前足を引き上げる）・フロントサイド180を練習する。",
      h: 240,
      draw: () => {
        const cell = (x, y, label) => K.rect(x + 4, y + 4, 152, 100, "dg-snow", { rx: 8 }) + K.text(x + 12, y + 20, label, { cls: "t-b" });
        const press = (x, y, nose) => {
          const g = y + 94, x1 = x + 22, x2 = x + 138, sgn = nose ? 1 : -1, x0 = nose ? x2 - 16 : x1 + 16, span = x2 - x1 - 16;
          const f = (xx) => { const dd = (xx - x0) * sgn; return dd < 0 ? g - 14 * Math.pow(-dd / span, 1.5) : g - 5 * Math.pow(dd / 16, 2); };
          const t = (xx) => f(xx) - 4, bk = x + 80 - 24 * sgn, fr = x + 80 + 20 * sgn, hx = x + 80 + 18 * sgn;
          return K.line(x + 12, g, x + 148, g, "dg-thin") + bandF(x1, x2, f, 4) +
            K.person({ head: [hx + 2 * sgn, y + 38], neck: [hx, y + 48], hip: [hx - 6 * sgn, y + 66], lKnee: [bk + 14 * sgn, y + 72], lFoot: [bk, t(bk)], rKnee: [fr + 8 * sgn, y + 76], rFoot: [fr, t(fr)], lElbow: [hx - 14, y + 49], lHand: [hx - 28, y + 50], rElbow: [hx + 14, y + 49], rHand: [hx + 28, y + 50] }, { r: 6 });
        };
        let b = cell(0, 0, "ノーズプレス") + press(0, 0, true) + K.text(12, 36, "肩は雪面と平行", { cls: "t-s t-dim" });
        b += cell(160, 0, "テールプレス") + press(160, 0, false);
        b += cell(0, 108, "オーリー");
        {
          const x = 0, y = 108, g = y + 92, X = x + 80, f = (xx) => g - 20 * (xx - (X - 50)) / 100, t = (xx) => f(xx) - 4;
          b += bandF(X - 50, X + 50, f, 4);
          b += K.person({ head: [X - 4, y + 34], neck: [X - 4, y + 44], hip: [X - 2, y + 64], lKnee: [X - 22, y + 74], lFoot: [X - 26, t(X - 26)], rKnee: [X + 14, y + 66], rFoot: [X + 22, t(X + 22)], lElbow: [X - 16, y + 54], lHand: [X - 26, y + 60], rElbow: [X + 8, y + 54], rHand: [X + 18, y + 60] }, { r: 6 });
          b += K.arrow(X - 44, y + 58, X - 44, y + 82, "back", 6) + K.arrow(X + 38, y + 82, X + 38, y + 56, "front", 6);
          b += K.text(x + 12, y + 38, "踏み切る", { cls: "t-s t-back" }) + K.text(x + 150, y + 38, "引き上げる", { a: "end", cls: "t-s t-front" });
        }
        b += cell(160, 108, "フロントサイド180");
        {
          const cx = 240, cy = 108 + 64;
          b += K.boardTop(cx, cy, 90, 18);
          const r = 34, a2 = -172;
          b += K.arc(cx, cy, r, -8, a2, "dg-line");
          const ex = cx + r * Math.cos(a2 * RAD), ey = cy + r * Math.sin(a2 * RAD);
          b += K.arrow(ex - 2, ey - 8, ex - 0.6, ey + 3, "", 7) + K.text(cx, cy + 32, "前後を入れ替える（上から）", { a: "middle", cls: "t-s t-dim" });
        }
        b += K.text(160, 232, "まず止まった状態や平地で", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "grow-s5": {
      cap: "滑りながら、ターンの切り替えでオーリー/ノーリー、ターン中にプレス、リバースターンを入れ、技のあともターンを続ける。",
      h: 208,
      draw: () => {
        let b = K.text(12, 18, "中斜面・人の少ないコースで", { cls: "t-b" }) + K.text(308, 18, "上が山側", { a: "end", cls: "t-s t-dim" });
        b += slope(8, 28, 172, 172);
        const L = 26, A = 50, cx = 94, y0 = 40, turns = Array.from({ length: 6 }, () => ({ L, A }));
        const sp = snake(cx, y0, turns).slice(0, -2);
        b += K.polyline(sp, "dg-line") + tip(sp);
        // 番号は軌跡の上に置き、説明は右に並べる（引き出し線なし）
        const marks = [[cx, y0 + L], [cx - A, y0 + L * 1.5], [cx + A, y0 + L * 2.5]];
        const notes = [["切り替えで", "オーリー/ノーリー"], ["ターン中に", "プレス"], ["リバースターン", "上半身と下半身を", "逆にひねる"]];
        marks.forEach(([x, y], i) => { b += K.num(x, y, i + 1, "sky"); });
        notes.forEach((ls, i) => {
          const ny = 48 + i * 44;
          b += K.num(196, ny - 4, i + 1, "sky") + ls.map((l, j) => K.text(208, ny + j * 15, l, { cls: j ? "t-s" : "t-s t-b" })).join("");
        });
        b += K.arrow(168, y0 + L * 3, 168, y0 + L * 5.8, "sky", 6);
        b += K.text(186, 186, "技のあとも", { cls: "t-s t-b" }) + K.text(186, 201, "ターンが続く", { cls: "t-s t-b" });
        return b;
      },
    },

    "grow-s6": {
      cap: "グラトリは、平地で板の動かし方 → 緩斜面で連続ターン → プレス → オーリー・ノーリー → 180 の順に進める。",
      h: 200,
      draw: () => {
        const steps = ["平地で板の動かし方", "緩斜面で連続ターン", "プレス", "オーリー・ノーリー", "180"];
        let b = K.text(12, 18, "荒れていない、ほどよくゆるんだ緩斜面で", { cls: "t-s" }) + K.text(12, 34, "ヘルメットと手首ガードを着ける", { cls: "t-s t-b" });
        steps.forEach((s, i) => {
          const x = 12 + i * 16, y = 170 - i * 28;
          b += K.rect(x, y, 176, 24, "dg-fill", { rx: 5 }) + K.num(x + 14, y + 12, i + 1) + K.text(x + 28, y + 16, s);
        });
        b += K.arrow(292, 190, 292, 58, "sky") + K.text(286, 70, "順に", { a: "end", cls: "t-s t-b" });
        return b;
      },
    },
  });
})();

// ==================== 図: words（_work/diagrams/parts/words.js から統合） ====================
// 用語集の小さな図（part: words）
(() => {
  const RAD = Math.PI / 180;
  // 上から見た足（靴底の形、つま先が幅広）。a はアプリの角度（ノーズ左の図で、つま先の向き (−sin a, −cos a)）
  const foot = (K, cx, cy, a, cls = "", len = 40, wid = 18) => {
    const l = len / 2, w = wid / 2, n = K.n;
    const d = `M${n(-w)},${n(-l * 0.3)} Q${n(-w)},${-l} 0,${-l} Q${n(w)},${-l} ${n(w)},${n(-l * 0.3)} L${n(w * 0.78)},${n(l * 0.62)} Q${n(w * 0.78)},${l} 0,${l} Q${n(-w * 0.78)},${l} ${n(-w * 0.78)},${n(l * 0.62)} Z`;
    return K.tr(cx, cy, `<path class="dg-boot" d="${d}"/>` + (cls ? `<path class="${cls}" d="${d}"/>` : ""), -a);
  };
  // 横から見た板。yb(x) は板の下面の y
  const side = (K, x1, x2, yb, th = 4) => {
    const xs = [];
    for (let x = x1; x < x2; x += 2) xs.push(x);
    xs.push(x2);
    return K.polygon([...xs.map((x) => [x, yb(x) - th]), ...xs.slice().reverse().map((x) => [x, yb(x)])], "dg-board");
  };
  // 先端の反り上がり（接雪点からの距離 d、先端までの長さ len、高さ rise）
  const lift = (d, len, rise) => d > 0 ? rise * (d / len) ** 2 : 0;
  // 回る矢印（円弧＋先の三角。角度は 0°=右、時計回りが正）
  const turn = (K, cx, cy, r, a1, a2, cls = "") => {
    const p = (a) => [cx + r * Math.cos(a * RAD), cy + r * Math.sin(a * RAD)], s = Math.sign(a2 - a1);
    return K.arc(cx, cy, r, a1, a2 - s * 6) + K.arrow(...p(a2 - s * 12), ...p(a2), cls, 7);
  };
  // 横から見たブーツ＋バインディング（かかと下 x,y、s 倍）。straps はストラップも描く
  const shoe = (K, x, y, s = 1, straps = false) => K.bindingSide(x, y + 2 * s, s, { straps: false }) + K.bootSide(x, y, s) +
    (straps ? K.tr(x, y, `<path class="dg-strap" d="M28,-44 Q48,-58 68,-40"/><path class="dg-strap" d="M84,-26 Q98,-34 106,-14"/>`, 0, s) : "");

  SETUP_DIAGRAMS.add({
    "g-nose-tail": {
      cap: "前の先端がノーズ、後ろの先端がテール。CRAFTはノーズ側が実測で8mm長い（図では見えないほどの差）。",
      h: 126,
      draw: (K) => {
        let b = K.boardTop(160, 60, 276, 44);
        b += K.arrow(118, 20, 52, 20, "sky") + K.text(126, 24, "進む向き", { cls: "t-s t-dim" });
        b += K.note(26, 60, 22, 96, "ノーズ（前の先端）") + K.note(294, 60, 298, 96, "テール（後ろの先端）", "end");
        b += K.text(160, 118, "CRAFT: ノーズ側が実測で8mm長い", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },

    "g-toe-heel": {
      cap: "つま先側のエッジがトゥサイド、かかと側のエッジがヒールサイド。",
      h: 130,
      draw: (K) => {
        let b = K.boardTop(160, 66, 290, 60);
        b += K.path("M51.3,36 Q160,39 268.8,36", "dg-strap") + K.path("M51.3,96 Q160,93 268.8,96", "dg-strap");
        b += foot(K, 118, 66, 18, "dg-front") + foot(K, 196, 66, -6, "dg-back");
        b += K.text(218, 56, "つま先", { cls: "t-s halo" }) + K.text(218, 86, "かかと", { cls: "t-s halo" });
        b += K.text(160, 22, "トゥサイド＝つま先側のエッジ", { a: "middle", cls: "t-b" });
        b += K.text(160, 120, "ヒールサイド＝かかと側のエッジ", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "g-effective-edge": {
      cap: "有効エッジは、板を平らに置いたとき雪に接するエッジの長さ。反り上がった先端は含まない。",
      h: 120,
      draw: (K) => {
        const sy = 80, c1 = 72, c2 = 248;
        let b = K.snow(8, sy, 312, sy, 12);
        b += side(K, 30, 290, (x) => sy - lift(c1 - x, 42, 20) - lift(x - c2, 42, 20));
        b += K.line(c1, sy, c1, 40, "dg-guide") + K.line(c2, sy, c2, 40, "dg-guide");
        b += K.dim(c1, 42, c2, 42, "有効エッジ", -6);
        b += K.circle(c1, sy, 3, "dg-dot") + K.circle(c2, sy, 3, "dg-dot");
        b += K.text(160, 110, "接雪点から接雪点まで（先端の反りは含まない）", { a: "middle", cls: "t-s" });
        return b;
      },
    },

    "g-sidecut": {
      cap: "板の縁のくびれは、大きな円の一部。その半径が小さいほど小回りしやすい。",
      h: 180,
      draw: (K) => {
        // 中心(160,165)・半径110 の円（誇張）。ヒール側の縁がその一部
        let b = K.arc(160, 165, 110, 198, 342, "dg-guide");
        b += K.path("M98,17.9 A110,110 0 0 0 222,17.9 Q244,17.9 244,46 Q244,74.1 222,74.1 A110,110 0 0 0 98,74.1 Q76,74.1 76,46 Q76,17.9 98,17.9 Z", "dg-board");
        b += K.path("M98,74.1 A110,110 0 0 1 222,74.1", "dg-strap");
        b += K.line(160, 165, 160, 58, "dg-line") + K.circle(160, 165, 3, "dg-dot");
        b += K.text(166, 124, "半径", { cls: "t-b halo" }) + K.text(152, 170, "円の中心", { a: "end", cls: "t-s t-dim" });
        b += K.text(12, 146, "縁のくびれは\n円の一部", { cls: "t-s" });
        b += K.text(206, 146, "半径が小さいほど\n小回りしやすい", { cls: "t-b" });
        b += K.text(310, 16, "くびれは誇張", { a: "end", cls: "t-s t-dim" });
        return b;
      },
    },

    "g-camber": {
      cap: "キャンバーは真ん中が浮いた反り。踏むと雪に押し付けられて、反発とグリップが出る。",
      h: 120,
      draw: (K) => {
        const sy = 66;
        let b = K.snow(8, sy, 150, sy, 8) + K.snow(170, sy, 312, sy, 8);
        b += side(K, 18, 142, (x) => sy - (x > 30 && x < 130 ? 9 * Math.sin((x - 30) / 100 * Math.PI) : 0) - lift(30 - x, 12, 6) - lift(x - 130, 12, 6));
        b += K.text(80, 36, "真ん中が浮く", { a: "middle", cls: "t-b" });
        b += K.arrow(150, 44, 172, 44, "", 6);
        b += side(K, 180, 304, (x) => sy - lift(192 - x, 12, 6) - lift(x - 292, 12, 6));
        b += K.arrow(214, 24, 214, 58, "sky") + K.arrow(270, 24, 270, 58, "sky") + K.text(242, 30, "踏む", { a: "middle", cls: "t-b" });
        b += K.text(80, 96, "（高さは誇張）", { a: "middle", cls: "t-s t-dim" });
        b += K.text(242, 96, "雪に押し付けられる", { a: "middle", cls: "t-s" }) + K.text(242, 112, "反発とグリップ", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "g-rocker": {
      cap: "ロッカーは先端側が持ち上がった反り。回しやすく、引っかかりにくい。",
      h: 110,
      draw: (K) => {
        const sy = 70;
        let b = K.snow(8, sy, 312, sy, 8);
        b += side(K, 36, 284, (x) => sy - 26 * ((x - 160) / 124) ** 2);
        b += K.arrow(28, 62, 28, 38, "sky", 6) + K.arrow(292, 62, 292, 38, "sky", 6);
        b += K.text(160, 26, "先端側が持ち上がる（高さは誇張）", { a: "middle", cls: "t-s" });
        b += K.text(160, 100, "回しやすく、引っかかりにくい", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "g-flat": {
      cap: "フラットは反りのない平らな部分。まっすぐ進むときに安定する。",
      h: 110,
      draw: (K) => {
        const sy = 70;
        let b = K.snow(8, sy, 312, sy, 8);
        b += K.rect(96, sy - 10, 128, 14, "dg-hl");
        b += side(K, 26, 294, (x) => sy - lift(70 - x, 44, 18) - lift(x - 250, 44, 18));
        b += K.text(160, 50, "平ら（反りなし）", { a: "middle", cls: "t-b" });
        b += K.arrow(108, 22, 212, 22, "sky") + K.text(222, 26, "まっすぐ", { cls: "t-s t-dim" });
        b += K.text(160, 100, "まっすぐ進むときに安定する", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "g-roc": {
      cap: "Rock Out Camber（サロモンの説明）: 足の間はフラット、足元はキャンバー、先端はロッカー。",
      h: 150,
      draw: (K) => {
        const sy = 84, bump = (x, a) => (x > a && x < a + 50 ? 7 * Math.sin((x - a) / 50 * Math.PI) : 0);
        let b = K.snow(8, sy, 312, sy, 8);
        b += side(K, 20, 300, (x) => sy - lift(70 - x, 50, 22) - lift(x - 250, 50, 22) - bump(x, 70) - bump(x, 200));
        b += K.rect(81, sy - 19, 28, 7, "dg-binding") + K.rect(211, sy - 19, 28, 7, "dg-binding");
        b += K.text(95, sy - 26, "足", { a: "middle", cls: "t-s" }) + K.text(225, sy - 26, "足", { a: "middle", cls: "t-s" });
        const seg = (x1, x2, y, label) => K.line(x1 + 2, y, x2 - 2, y, "dg-thin") + K.line(x1 + 2, y - 4, x1 + 2, y + 4, "dg-thin") +
          K.line(x2 - 2, y - 4, x2 - 2, y + 4, "dg-thin") + K.text((x1 + x2) / 2, y + (y > 100 ? 16 : -8), label, { a: "middle", cls: "t-s" });
        b += seg(20, 70, 106, "ロッカー") + seg(120, 200, 106, "フラット") + seg(250, 300, 106, "ロッカー");
        b += seg(70, 120, 128, "キャンバー") + seg(200, 250, 128, "キャンバー");
        b += K.text(310, 18, "高さは誇張", { a: "end", cls: "t-s t-dim" });
        return b;
      },
    },

    "g-dir-twin": {
      cap: "ディレクショナルツインは、ほぼ前後対称だが、この3つのどれか（1つ以上）で前後差をつけた形。",
      h: 140,
      draw: (K) => {
        let b = K.boardTop(160, 64, 280, 46);
        b += K.line(160, 34, 160, 100, "dg-guide") + K.line(174, 34, 174, 100, "dg-guide");
        b += foot(K, 114, 64, 15, "dg-front", 36, 16) + foot(K, 234, 64, -6, "dg-back", 36, 16);
        b += K.note(26, 64, 14, 22, "ノーズが少し長い") + K.note(294, 64, 306, 22, "テールが硬い", "end");
        b += K.arrow(160, 108, 176, 108, "", 6) + K.text(184, 112, "足の位置が後ろ寄り", { cls: "t-s" });
        b += K.text(152, 112, "板の中心", { a: "end", cls: "t-s t-dim" });
        b += K.text(160, 132, "どれか1つ以上（足のずれは誇張）", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },

    "g-stance-width": {
      cap: "スタンス幅は、前後のバインディングの中心の間隔。",
      h: 124,
      draw: (K) => {
        const cy = 72, f = 100, r = 220;
        let b = K.boardTop(160, cy, 290, 62);
        b += K.circle(f, cy, 16, "dg-binding") + K.circle(r, cy, 16, "dg-binding");
        b += foot(K, f, cy, 18, "dg-front") + foot(K, r, cy, -6, "dg-back");
        b += K.line(f, cy, f, 26, "dg-guide") + K.line(r, cy, r, 26, "dg-guide");
        b += K.circle(f, cy, 3, "dg-dot") + K.circle(r, cy, 3, "dg-dot");
        b += K.dim(f, 28, r, 28, "スタンス幅", -6);
        b += K.text(f, 116, "前足", { a: "middle", cls: "t-s t-b t-front" }) + K.text(r, 116, "後足", { a: "middle", cls: "t-s t-b t-back" });
        b += K.text(160, 116, "中心の間隔", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },

    "g-duck": {
      cap: "ダックスタンスは、前足プラス・後足マイナスで、つま先が外に開いた立ち方。スイッチで滑りやすい。",
      h: 150,
      draw: (K) => {
        const cy = 74, f = 104, r = 216, a = 15;
        let b = K.boardTop(160, cy, 290, 70);
        b += K.line(f, cy - 44, f, cy + 30, "dg-guide") + K.line(r, cy - 44, r, cy + 30, "dg-guide");
        b += foot(K, f, cy, a, "dg-front") + foot(K, r, cy, -a, "dg-back");
        const toe = (x, s, cls) => K.arrow(x - s * Math.sin(a * RAD) * 22, cy - Math.cos(a * RAD) * 22, x - s * Math.sin(a * RAD) * 48, cy - Math.cos(a * RAD) * 48, cls);
        b += toe(f, 1, "front") + toe(r, -1, "back");
        b += K.text(f - 18, 22, "＋", { a: "middle", cls: "t-l t-front" }) + K.text(r + 18, 22, "−", { a: "middle", cls: "t-l t-back" });
        b += K.text(160, 22, "つま先が外に開く", { a: "middle", cls: "t-s" });
        b += K.text(f, 124, "前足 プラス", { a: "middle", cls: "t-s t-b t-front" }) + K.text(r, 124, "後足 マイナス", { a: "middle", cls: "t-s t-b t-back" });
        b += K.text(160, 144, "スイッチで滑りやすい", { a: "middle", cls: "t-b" });
        return b;
      },
    },

    "g-highback": {
      cap: "ハイバックはバインディングのかかと側の背もたれ。ふくらはぎで押すと、ヒールサイドのエッジが立つ。",
      h: 166,
      draw: (K) => {
        let b = K.rect(24, 124, 128, 6, "dg-board") + shoe(K, 40, 122);
        b += K.arrow(92, 70, 42, 70, "sky");
        b += K.text(96, 74, "ふくらはぎで押す", { cls: "t-s t-b halo" });
        b += K.note(39, 56, 60, 20, "ハイバック（かかと側の背もたれ）");
        b += K.text(12, 146, "かかと側", { cls: "t-s t-dim" }) + K.text(152, 146, "つま先側", { a: "end", cls: "t-s t-dim" });
        b += K.arrow(152, 96, 180, 96, "", 6);
        b += K.snow(178, 116, 314, 116, 8);
        b += K.tr(200, 116, K.rect(0, -5, 84, 5, "dg-board") + shoe(K, 10, -6, 0.62), -18);
        b += K.circle(200, 116, 3.5, "dg-dot") + K.line(200, 120, 200, 128, "dg-thin");
        b += K.text(192, 144, "ヒールサイドの", { cls: "t-s" }) + K.text(192, 160, "エッジが立つ", { cls: "t-b" });
        return b;
      },
    },

    "g-flex": {
      cap: "フレックスは板・ブーツ・バインディングの硬さ。数字はブランドごとの目安で、ほかのブランドとは単純に比べにくい。",
      h: 126,
      draw: (K) => {
        const bend = (cx, sag) => {
          const y0 = 44;
          let s = K.polygon([[cx - 60, y0 + 18], [cx - 66, y0 + 26], [cx - 54, y0 + 26]], "dg-fill") + K.polygon([[cx + 60, y0 + 18], [cx + 54, y0 + 26], [cx + 66, y0 + 26]], "dg-fill");
          s = side(K, cx - 66, cx + 66, (x) => y0 + 18 + sag * (1 - ((x - cx) / 60) ** 2), 5) + s;
          return s + K.arrow(cx, 14, cx, y0 + 12 + sag, "sky");
        };
        let b = bend(84, 16) + bend(236, 4);
        b += K.text(160, 20, "同じ力", { a: "middle", cls: "t-s t-dim" });
        b += K.text(84, 100, "柔らかい: 大きくしなる", { a: "middle", cls: "t-s t-b" }) + K.text(236, 100, "硬い: 少ししなる", { a: "middle", cls: "t-s t-b" });
        b += K.text(160, 118, "数字はブランドごとの目安", { a: "middle", cls: "t-s t-dim" });
        return b;
      },
    },

    "g-edge-angle": {
      cap: "エッジ角は、雪面に対して板を傾けた角度。",
      h: 130,
      draw: (K) => {
        const px = 96, py = 106, ang = 28;
        let b = K.snow(8, py, 312, py, 12);
        b += K.tr(px, py, K.rect(0, -6, 116, 6, "dg-board") + shoe(K, 16, -8, 0.7), -ang);
        b += K.arc(px, py, 70, -ang, 0, "dg-line");
        b += K.text(172, 100, "エッジ角", { cls: "t-l halo" });
        b += K.text(310, 102, "雪面", { a: "end", cls: "t-s t-dim" });
        b += K.note(193, 55, 204, 26, "板の断面（幅方向）");
        return b;
      },
    },

    "g-catch-edge": {
      cap: "逆エッジは、進みたい向きと逆側のエッジが雪に引っかかって、急に転ぶこと。",
      h: 150,
      draw: (K) => {
        const px = 196, py = 116;
        let b = K.snow(8, py, 312, py, 12);
        b += K.tr(px, py, K.rect(-112, -6, 112, 6, "dg-board") + shoe(K, -100, -8, 0.8), 12);
        b += K.arrow(96, 34, 24, 34, "sky") + K.text(20, 22, "進みたい向き", { cls: "t-s t-b" });
        b += K.path("M150,34 Q226,30 246,74", "dg-line") + K.arrow(242, 64, 248, 80, "ng", 9);
        b += K.text(252, 50, "急に転ぶ", { cls: "t-b t-ng" });
        b += K.circle(px, py, 3.5, "dg-dot") + K.ng(208, 90) + K.text(222, 94, "逆側のエッジが\n引っかかる", { cls: "t-s t-b t-ng" });
        return b;
      },
    },

    "g-regular-goofy": {
      cap: "レギュラーは左足が前、グーフィーは右足が前。どちらも進む向きがノーズ。",
      h: 160,
      draw: (K) => {
        const row = (cy, reg) => {
          const fx = reg ? 168 : 250, bx = reg ? 250 : 168, s = reg ? 1 : -1;
          let r = K.boardTop(209, cy, 196, 38);
          r += foot(K, fx, cy, 15 * s, "dg-front", 34, 17) + foot(K, bx, cy, -6 * s, "dg-back", 34, 17);
          r += K.text(fx, cy + 4, reg ? "L" : "R", { a: "middle", cls: "t-b t-front" }) + K.text(bx, cy + 4, reg ? "R" : "L", { a: "middle", cls: "t-b t-back" });
          r += reg ? K.arrow(230, cy - 32, 170, cy - 32, "sky") + K.text(238, cy - 28, "進む向き", { cls: "t-s t-dim" })
            : K.arrow(188, cy - 32, 248, cy - 32, "sky") + K.text(180, cy - 28, "進む向き", { a: "end", cls: "t-s t-dim" });
          r += K.text(12, cy - 2, reg ? "レギュラー" : "グーフィー", { cls: "t-b" }) + K.text(12, cy + 14, reg ? "左足が前" : "右足が前", { cls: "t-s" });
          return r;
        };
        return row(50, true) + row(126, false);
      },
    },

    "g-bevel": {
      cap: "ベベルはエッジの角度の付け方。ディチューンはエッジの角を丸めて、引っかかりにくくすること。",
      h: 156,
      draw: (K) => {
        // 左: ベベル（板の角の拡大断面。角度は誇張）。破線は角度を付けない場合の面
        let b = K.text(10, 18, "ベベル（拡大・誇張）", { cls: "t-b" });
        b += K.polygon([[10, 36], [114, 36], [130, 96], [70, 112], [10, 112]], "dg-board");
        b += K.polygon([[130, 96], [112.6, 100.6], [108, 83.2], [125.4, 78.6]], "dg-sole");
        b += K.line(70, 112, 160, 112, "dg-guide") + K.line(130, 96, 130, 34, "dg-guide");
        b += K.arc(70, 112, 48, -14.9, 0, "dg-line") + K.arc(130, 96, 48, -104.9, -90, "dg-line");
        b += K.text(118, 130, "ソール側の角度", { a: "middle", cls: "t-s" }) + K.text(136, 58, "サイド側\nの角度", { cls: "t-s", lh: 14 });
        b += K.note(118, 90, 142, 92, "エッジ");
        // 右: ディチューン
        b += K.line(194, 10, 194, 140, "dg-thin");
        b += K.text(204, 18, "ディチューン", { cls: "t-b" });
        b += K.path("M204,36 L300,36 L300,74 Q300,108 266,108 L204,108 Z", "dg-board");
        b += K.polyline([[300, 74], [300, 108], [266, 108]], "dg-guide");
        b += K.note(290, 96, 252, 126, "角を丸める", "middle");
        b += K.text(252, 146, "引っかかりにくく", { a: "middle", cls: "t-s" });
        return b;
      },
    },

    "g-runtori-gratri": {
      cap: "ラントリは滑りながら（ターンの中で）入れるトリック。グラトリは平らな場所で回ったり弾いたりするトリック。",
      h: 160,
      draw: (K) => {
        let b = K.text(80, 18, "ラントリ", { a: "middle", cls: "t-b" }) + K.text(80, 34, "滑りながら（ターンの中で）", { a: "middle", cls: "t-s" });
        b += K.path("M52,46 C130,58 124,92 80,100 C36,108 34,140 104,146", "dg-line") + K.arrow(96, 145, 110, 147, "", 7);
        b += K.num(116, 72, "技", "sky") + K.num(48, 126, "技", "sky");
        b += K.line(160, 10, 160, 150, "dg-thin");
        b += K.text(240, 18, "グラトリ", { a: "middle", cls: "t-b" }) + K.text(240, 34, "平らな場所で", { a: "middle", cls: "t-s" });
        b += K.snow(172, 134, 312, 134, 12);
        b += side(K, 200, 280, (x) => 110 - lift(212 - x, 12, 6) - lift(x - 268, 12, 6));
        b += turn(K, 240, 90, 38, 200, 340) + K.text(196, 76, "回る", { a: "end", cls: "t-s t-b" });
        b += K.arrow(240, 132, 240, 114, "sky", 6) + K.text(250, 128, "弾く", { cls: "t-s t-b" });
        return b;
      },
    },

    "g-straps": {
      cap: "トゥストラップはつま先、アンクルストラップは足首を押さえる。RHYTHMはどちらもMicroMaxで長さを微調整できる。",
      h: 156,
      draw: (K) => {
        let b = K.rect(14, 124, 134, 6, "dg-board") + shoe(K, 30, 120, 1, true);
        b += K.note(78, 69, 152, 42, "アンクルストラップ") + K.text(155, 60, "足首を押さえる", { cls: "t-s t-dim" });
        b += K.note(127, 93, 160, 96, "トゥストラップ") + K.text(163, 114, "つま先を押さえる", { cls: "t-s t-dim" });
        b += K.text(160, 146, "どちらもMicroMaxで長さを微調整", { a: "middle", cls: "t-s" });
        return b;
      },
    },

    "g-disc": {
      cap: "ディスクはバインディングの中央の円盤。角度を決めて、4本のネジで板に固定する。",
      h: 150,
      draw: (K) => {
        const cx = 100, cy = 76, rot = -15;
        let b = K.rect(-4, 14, 328, 124, "dg-board");
        b += K.bootTop(cx, cy, 124, 58, rot, "dg-binding");
        b += K.circle(cx, cy, 30, "dg-fill");
        for (let a = 0; a < 360; a += 30) {
          const c = Math.cos(a * RAD), s = Math.sin(a * RAD);
          b += K.line(cx + c * 25, cy + s * 25, cx + c * 30, cy + s * 30, "dg-thin");
        }
        // ネジは板のインサート（4cm四方）に入るので板に対して回らない。回るのは台座
        b += [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => K.circle(cx + x * 11, cy + y * 11, 4, "dg-screw")).join("");
        b += turn(K, cx, cy, 44, 150, 210);
        b += K.note(129, 68, 176, 40, "ディスク（中央の円盤）");
        b += K.text(8, 70, "角度を\n決める", { cls: "t-s halo", lh: 14 });
        b += K.note(111, 86, 176, 102, "4本のネジで板に固定");
        return b;
      },
    },
  });
})();
