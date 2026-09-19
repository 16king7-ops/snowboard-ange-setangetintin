// 動く図（コマ送りできるアニメ）。setup-diagrams.js の部品 K を使う。setup.js より前に読み込む。
// 使い方: SETUP_ANIM.html("id") で図のHTMLを作り、DOMに入れた後に SETUP_ANIM.attach(親要素) で再生できるようにする。
// 図の決まりは setup-diagrams.js と同じ（本文にないことを描かない・色は .dg-* クラス・文字は11以上）。
(() => {
  const DG = globalThis.SETUP_DIAGRAMS;
  if (!DG) return;
  const K = DG.K, ANIMS = {};
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // 動きを作るための小物（t は 0〜1）
  const A = {
    K,
    lerp: (a, b, t) => a + (b - a) * t,
    // 0〜1 の t のうち、from〜to の区間だけを 0〜1 に伸ばす（区間の外は 0 か 1）
    seg: (t, from, to) => Math.max(0, Math.min(1, (t - from) / (to - from))),
    ease: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), // ゆっくり始まってゆっくり終わる
    easeOut: (t) => 1 - (1 - t) * (1 - t),
    // 点の並びを t の所まで描く（軌跡を伸ばす）
    trail: (pts, t, cls = "dg-line") => {
      const n = Math.max(2, Math.round(pts.length * Math.max(0, Math.min(1, t))));
      return n < 2 ? "" : K.polyline(pts.slice(0, n), cls);
    },
    at: (pts, t) => pts[Math.max(0, Math.min(pts.length - 1, Math.round((pts.length - 1) * t)))],
    // S字ターンの軌跡（上が山側、下へ進む）。amp=横の振れ幅、turns=ターンの数
    sPath: (cx, y0, y1, amp, turns, steps = 160) => {
      const out = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        out.push([cx + Math.sin(u * Math.PI * turns) * amp, A.lerp(y0, y1, u)]);
      }
      return out;
    },
    // 軌跡の向き（度）。上から見た図で板の向きに使う
    dirDeg: (pts, i) => {
      const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
      return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    },
  };

  const html = (id) => {
    const d = ANIMS[id];
    if (!d) return "";
    const w = d.w || 320, h = d.h || 200;
    return `<figure class="dg-fig anim" data-anim="${esc(id)}">` +
      `<svg class="dg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(d.cap || id)}"></svg>` +
      `<div class="anim-ctl">` +
      `<button type="button" class="anim-play" data-anim-play aria-label="再生">▶</button>` +
      `<input type="range" class="anim-seek" min="0" max="1000" value="0" step="1" aria-label="コマ送り">` +
      `<span class="anim-phase"></span></div>` +
      (d.cap ? `<figcaption>${esc(d.cap)}</figcaption>` : "") + `</figure>`;
  };

  // 図を描いて、再生ボタンとスライダーを動くようにする
  function attach(root = document) {
    const reduce = globalThis.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const fig of (root.querySelectorAll ? root.querySelectorAll("figure[data-anim]") : [])) {
      if (fig.dataset.animReady) continue;
      const d = ANIMS[fig.dataset.anim];
      if (!d) { fig.remove(); continue; }
      fig.dataset.animReady = "1";
      const svg = fig.querySelector("svg"), seek = fig.querySelector(".anim-seek"), play = fig.querySelector(".anim-play"), ph = fig.querySelector(".anim-phase");
      const dur = (d.dur || 6) * 1000;
      let t = 0, playing = false, last = 0, raf = 0;
      const phaseName = (t) => {
        if (!d.phases) return "";
        let name = "";
        for (const p of d.phases) if (t >= p.at) name = p.name;
        return name;
      };
      const frame = () => {
        try { svg.innerHTML = d.draw(A, t); } catch (e) { console.error(`アニメ ${fig.dataset.anim} の描画に失敗:`, e); stop(); }
        seek.value = Math.round(t * 1000);
        ph.textContent = phaseName(t);
      };
      const step = (now) => {
        if (!playing) return;
        t += (now - last) / dur;
        last = now;
        if (t >= 1) t = d.loop === false ? 1 : 0;
        frame();
        if (t === 1 && d.loop === false) return stop();
        raf = requestAnimationFrame(step);
      };
      const start = () => { playing = true; play.textContent = "⏸"; play.setAttribute("aria-label", "一時停止"); last = performance.now(); raf = requestAnimationFrame(step); };
      function stop() { playing = false; play.textContent = "▶"; play.setAttribute("aria-label", "再生"); cancelAnimationFrame(raf); }
      play.addEventListener("click", () => (playing ? stop() : start()));
      seek.addEventListener("input", () => { stop(); t = +seek.value / 1000; frame(); });
      // 画面から出たら止める（電池とスクロールのため）
      if (globalThis.IntersectionObserver) {
        new IntersectionObserver((es) => { for (const e of es) if (!e.isIntersecting && playing) stop(); }, { threshold: 0.1 }).observe(fig);
      }
      frame();
      if (!reduce && d.autoplay) start();
    }
  }

  globalThis.SETUP_ANIM = { A, ANIMS, html, attach, add: (defs) => Object.assign(ANIMS, defs), has: (id) => id in ANIMS };
})();

// ---------- 動く図（見本） ----------
// 定義: { cap, w, h, dur: 秒, loop, phases: [{at, name}], draw: (A, t) => SVGの中身 }
SETUP_ANIM.add({
  // 緩斜面のS字ターン: 軌跡が伸び、乗るエッジと荷重が変わる
  "a-sturn": {
    cap: "緩斜面のS字ターン。板が谷を向くにつれて前足に乗せ、山回りでエッジを使って速さを整える。青＝かかと側エッジ、オレンジ＝つま先側エッジ。",
    h: 250, dur: 9,
    phases: [{ at: 0, name: "谷回り: 板が谷を向く" }, { at: 0.22, name: "山回り: エッジで整える" }, { at: 0.45, name: "切り替え" }, { at: 0.6, name: "谷回り（反対側）" }, { at: 0.82, name: "山回り" }],
    draw: (A, t) => {
      const K = A.K, pts = A.sPath(160, 30, 214, 60, 2.2), i = Math.round((pts.length - 1) * t), p = pts[i], deg = A.dirDeg(pts, i);
      const dn = Math.cos((deg - 90) * Math.PI / 180); // 板が谷（下）を向くほど 0 に近い
      // 曲がる向き（軌跡の曲がり方）で、乗るエッジが変わる
      const q = pts[Math.max(0, i - 6)], r = pts[Math.min(pts.length - 1, i + 6)];
      const cross = (p[0] - q[0]) * (r[1] - p[1]) - (p[1] - q[1]) * (r[0] - p[0]);
      const heel = cross > 0 ? 1 : -1;
      let b = K.rect(26, 22, 268, 214, "dg-snow");
      b += K.text(160, 16, "上が山側・下へ進む", { a: "middle", cls: "t-s t-dim" });
      for (const x of [50, 270]) b += K.arrow(x, 40, x, 220, "dim", 6);
      b += K.text(50, 34, "谷（まっすぐ下る向き）", { cls: "t-s t-dim" });
      b += A.trail(pts, t, "dg-guide");
      // 板（上から）: 長い辺が進む向き。乗っているエッジに色を付ける
      const edge = heel > 0 ? "dg-front" : "dg-back";
      b += K.tr(p[0], p[1], K.rect(-10, -32, 20, 64, "dg-board", { rx: 10 }) + K.line(heel > 0 ? -10 : 10, -28, heel > 0 ? -10 : 10, 28, edge, { "stroke-width": 4 }), deg - 90);
      // 荷重の位置: 板が谷を向くほど前（進む向き側）
      const load = 0.55 * (1 - Math.abs(dn)) + 0.1, rad = (deg) * Math.PI / 180;
      b += K.circle(p[0] + Math.cos(rad) * 26 * load, p[1] + Math.sin(rad) * 26 * load, 5.5, "dg-front");
      b += K.text(p[0] + (heel > 0 ? 18 : -18), p[1] - 40, heel > 0 ? "かかと側エッジ" : "つま先側エッジ", { a: heel > 0 ? "start" : "end", cls: "t-s t-b halo " + (heel > 0 ? "t-front" : "t-back") });
      b += K.text(160, 246, Math.abs(dn) < 0.55 ? "板が谷を向くとき: 前足に乗せる（●）" : "山回り: " + (heel > 0 ? "かかと側" : "つま先側") + "エッジでずらして整える", { a: "middle", cls: "t-s t-b halo" });
      return b;
    },
  },
  // オーリー: しゃがむ → 前足を引き上げテールを踏む → 反発で跳ぶ → 着地
  "a-ollie": {
    cap: "オーリー。しゃがんでから前足を引き上げ、後ろ足でテールを踏み、板の反発で跳ぶ。",
    h: 210, dur: 6,
    phases: [{ at: 0, name: "しゃがむ" }, { at: 0.28, name: "前足を引き上げ、テールを踏む" }, { at: 0.5, name: "反発で跳ぶ" }, { at: 0.68, name: "空中で足を引き上げる" }, { at: 0.86, name: "両足で着地" }],
    draw: (A, t) => {
      const K = A.K, y0 = 168, bx = 96; // bx = テール側の端
      const crouch = A.ease(A.seg(t, 0, 0.28)), pop = A.ease(A.seg(t, 0.28, 0.5)), up = A.ease(A.seg(t, 0.5, 0.68)), tuck = A.seg(t, 0.68, 0.86), land = A.ease(A.seg(t, 0.86, 1));
      const rot = -16 * pop * (1 - up); // ノーズを上げた角度（テールを支点に）
      const hgt = (up * 40 + tuck * 6) * (1 - land); // 跳んだ高さ
      const sink = crouch * 14 * (1 - pop) + land * 12; // ひざの曲げ（しゃがみ・着地の吸収）
      const R = (dx, dy) => { const a = rot * Math.PI / 180; return [bx + dx * Math.cos(a) - dy * Math.sin(a), y0 - hgt + dx * Math.sin(a) + dy * Math.cos(a)]; };
      // 板（横から・ノーズが右）: 先端が反り上がった形
      const top = [R(-6, -12), R(10, -6), R(60, -6), R(110, -6), R(126, -14)];
      const bot = [R(126, -8), R(110, 0), R(60, 0), R(10, 0), R(-6, -6)];
      let b = K.line(16, y0 + 2, 304, y0 + 2, "dg-line") + K.text(302, y0 + 16, "雪面", { a: "end", cls: "t-s t-dim" });
      b += K.polygon(top.concat(bot), "dg-board");
      // 足の位置（板の上）とからだ
      const bf = R(26, -8), ff = R(96, -8), hip = [(bf[0] + ff[0]) / 2 + 2, (bf[1] + ff[1]) / 2 - 56 + sink];
      b += K.person({
        head: [hip[0] + 3, hip[1] - 38], neck: [hip[0] + 2, hip[1] - 28], hip,
        lKnee: [bf[0] + 2, hip[1] + 20 - sink * 0.3], lFoot: bf,
        rKnee: [ff[0] - 2, hip[1] + 18 - sink * 0.3], rFoot: ff,
        lElbow: [hip[0] - 26, hip[1] - 20 - crouch * 6], lHand: [hip[0] - 44, hip[1] - 30 - up * 10],
        rElbow: [hip[0] + 26, hip[1] - 18 - crouch * 6], rHand: [hip[0] + 44, hip[1] - 28 - up * 10],
      });
      const msg = land > 0.15 ? "両足で着地して、そのまま滑る"
        : up > 0.15 ? "テールの反発で上に跳ぶ"
        : pop > 0.15 ? "前足を引き上げながら、後ろ足でテールを踏む"
        : "ひざを曲げてしゃがむ（力をためる）";
      if (pop > 0.1 && up < 0.9) {
        b += K.arrow(ff[0] + 16, ff[1] - 10, ff[0] + 16, ff[1] - 34, "front", 6) + K.text(ff[0] + 21, ff[1] - 38, "前足を上げる", { cls: "t-s t-b halo" });
        b += K.arrow(bf[0] - 14, bf[1] - 26, bf[0] - 14, bf[1] - 4, "back", 6) + K.text(bf[0] - 19, bf[1] - 30, "テールを踏む", { a: "end", cls: "t-s t-b halo" });
      }
      if (up > 0.3 && land < 0.2) b += K.arrow(bx + 60, y0 - hgt - 44, bx + 60, y0 - hgt - 66, "ok", 7);
      b += K.text(160, 22, msg, { a: "middle", cls: "t-s t-b halo" });
      return b;
    },
  },
});

// ==================== 動く図: g1（_work/grow/anims/g1.js から統合） ====================
// 段階1（中斜面の連続ターン）と段階2（カービングの基礎）の動く図。
// 決まりは setup-anim.js / setup-diagrams.js と同じ（色は .dg-* クラス、文字は11以上、本文にないことは描かない）。
(() => {
  const RAD = Math.PI / 180;

  // 上から見た軌跡を作る。90°＝真下（谷）。turn 度だけ向きが変わる。
  // vel(u)=1コマあたりの進む量（間隔＝速さ）、yaw(u)=進む向きに対する板のずれ（度）
  const mk = (A, x0, y0, turn, vel, yaw) => {
    const pts = [], dirs = [], yaws = [], n = 72;
    let x = x0, y = y0;
    for (let i = 0; i <= n; i++) {
      const u = i / n, deg = 90 - turn * A.ease(u);
      pts.push([x, y]); dirs.push(deg); yaws.push(yaw ? yaw(A, u) : 0);
      const v = vel(A, u);
      x += Math.cos(deg * RAD) * v;
      y += Math.sin(deg * RAD) * v;
    }
    return { pts, dirs, yaws, n };
  };

  // 板を上から。前足＝青・後足＝オレンジの線。load は荷重の位置（＋でノーズ側、null で描かない）
  const board = (K, p, deg, load) => {
    let b = K.boardTop(p[0], p[1], 30, 10, deg) +
      K.tr(p[0], p[1], K.line(8, -5, 8, 5, "dg-front", { "stroke-width": 3 }) +
        K.line(-8, -5, -8, 5, "dg-back", { "stroke-width": 3 }), deg);
    if (load == null) return b;
    const a = deg * RAD, lx = p[0] + Math.cos(a) * load, ly = p[1] + Math.sin(a) * load;
    return b + K.circle(lx, ly, 6, load >= 0 ? "dg-front" : "dg-back") + K.circle(lx, ly, 2.2, "dg-dot");
  };

  // ずらした跡（帯）。板の横向きが大きいほど太い
  const bandPath = (K, s, t) => {
    const n = Math.max(2, Math.round(s.n * t) + 1), L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = s.dirs[i] * RAD, hw = Math.max(2, 15 * Math.abs(Math.sin(s.yaws[i] * RAD)));
      L.push([s.pts[i][0] - Math.sin(a) * hw, s.pts[i][1] + Math.cos(a) * hw]);
      R.unshift([s.pts[i][0] + Math.sin(a) * hw, s.pts[i][1] - Math.cos(a) * hw]);
    }
    return K.polygon(L.concat(R), "dg-fill");
  };

  SETUP_ANIM.add({
    // 段階1: 後ろ足に乗ると加速する／前足に乗せると板が回ってきて速さが整う
    "a-fallline": {
      cap: "中斜面のターン。怖くて後ろ足に乗ると、板が谷を向いたまま加速する（左）。板が谷を向くにつれて前足に乗せると、板が回ってきて速さが整う（右）。点の間隔が速さ。",
      h: 250, dur: 8,
      phases: [{ at: 0, name: "板が谷を向く" }, { at: 0.3, name: "荷重が分かれる" }, { at: 0.6, name: "差がつく" }, { at: 0.85, name: "結果" }],
      draw: (A, t) => {
        const K = A.K;
        const ng = mk(A, 82, 58, 0, (A, u) => 0.55 + 2.4 * u);
        const ok = mk(A, 206, 58, 78, (A, u) => 0.55 + 1.35 * A.ease(A.seg(u, 0, 0.4)));
        const i = Math.round(ng.n * t);
        // 荷重の位置: 後ろ足へ残る（−）／板が谷を向くにつれて前足へ（＋）
        const dNg = -2 - 6 * A.ease(A.seg(t, 0, 0.3));
        const dOk = 2 + 6 * A.ease(A.seg(t, 0, 0.35)) - 3 * A.ease(A.seg(t, 0.6, 1));
        let b = K.rect(10, 20, 145, 194, "dg-snow") + K.rect(165, 20, 145, 194, "dg-snow");
        b += K.text(160, 13, "上から見た図。上が山側・同じ斜面で比べる", { a: "middle", cls: "t-s t-dim" });
        b += K.ng(24, 36) + K.text(37, 40, "後ろ足に乗る", { cls: "t-s t-b t-back" });
        b += K.ok(179, 36) + K.text(192, 40, "前足に乗せる", { cls: "t-s t-b t-front" });
        // 通った跡を等間隔の時間で点にする（点の間が広い＝速い）
        for (const s of [ng, ok]) for (let k = 0; k <= i; k += 6) b += K.circle(s.pts[k][0], s.pts[k][1], 2.4, "dg-dot");
        b += board(K, ng.pts[i], ng.dirs[i], dNg) + board(K, ok.pts[i], ok.dirs[i], dOk);
        if (t > 0.72) {
          b += K.text(15, 200, "加速する", { cls: "t-s t-b t-ng halo" });
          b += K.text(171, 186, "板が回ってきた", { cls: "t-s t-b t-ok halo" });
          b += K.text(171, 200, "速さが整う", { cls: "t-s t-b t-ok halo" });
        }
        const msg = t < 0.3 ? "どちらも板が谷を向いたところ\n点の間が広いほど速い（間隔＝速さ）"
          : t < 0.6 ? "左: 怖くて後ろ足に残る\n右: 板が谷を向くにつれて前足へ"
          : t < 0.85 ? "左: 板が谷を向いたまま、どんどん速くなる\n右: 板が回ってきて、速さが整う"
          : "後ろ足に残ると、ブレーキがかからず加速する\n怖くても前足に乗せるほうが、速さを決められる";
        b += K.text(160, 226, msg, { a: "middle", cls: "t-s t-b halo" });
        return b;
      },
    },

    // 段階2: ずらしのターン（太い帯）と、板を立ててずらさないターン（細い線）
    "a-carve-skid": {
      cap: "ターン後半（山回り）の違い。板を横に向けてずらすと跡は太い帯、板を立ててずらさないと跡は細い線になる。つま先側・かかと側どちらでも考え方は同じ。",
      h: 250, dur: 8,
      phases: [{ at: 0, name: "板が谷を向く" }, { at: 0.3, name: "山回りに入る" }, { at: 0.6, name: "板を立てる" }, { at: 0.85, name: "跡の違い" }],
      draw: (A, t) => {
        const K = A.K;
        const yaw = (A, u) => -38 * A.ease(A.seg(u, 0.05, 0.5)); // 板が進む向きより横を向く
        const sk = mk(A, 44, 50, 100, () => 1.5, yaw);
        const cv = mk(A, 199, 50, 100, () => 1.5);
        const i = Math.round(sk.n * t);
        const angSk = 12, angCv = 12 + 30 * A.ease(A.seg(t, 0.25, 0.85)); // 断面のエッジ角（誇張）
        let b = K.rect(10, 18, 145, 116, "dg-snow") + K.rect(165, 18, 145, 116, "dg-snow");
        b += K.text(160, 12, "ターン後半（山回り）を上から見た図。上が山側", { a: "middle", cls: "t-s t-dim" });
        b += K.text(14, 30, "ずらすターン", { cls: "t-s t-b" });
        b += K.text(169, 30, "ずらさないターン", { cls: "t-s t-b" });
        // 跡: 帯（ずらし）と細い線（ずらさない）
        b += bandPath(K, sk, t) + A.trail(cv.pts, t, "dg-line");
        b += board(K, sk.pts[i], sk.dirs[i] + sk.yaws[i], null) + board(K, cv.pts[i], cv.dirs[i], null);
        b += K.text(14, 148, "板が横を向く\n跡＝太い帯（横に削れる）", { cls: "t-s t-b", lh: 13 });
        b += K.text(169, 148, "板の向きに進む\n跡＝細い線（切れている）", { cls: "t-s t-b t-ok", lh: 13 });
        // 断面（後ろから見たイメージ）: 板の傾き＝角付け
        b += K.text(160, 178, "板の傾き（後ろから見た断面・誇張）", { a: "middle", cls: "t-s t-dim" });
        b += K.text(14, 196, "寝たまま（ずれる）", { cls: "t-s t-b" });
        b += K.text(169, 196, "少しずつ立てる（食い込む）", { cls: "t-s t-b t-ok" });
        for (const [bx, ang, dig] of [[55, angSk, false], [210, angCv, true]]) {
          b += K.line(bx - 39, 220, bx + 93, 220, "dg-line");
          b += K.tr(bx, 220, K.rect(0, -6, 34, 6, "dg-board"), -ang);
          b += K.arc(bx, 220, 19, -ang, 0, "dg-thin");
          b += dig
            ? K.polygon([[bx - 4, 220], [bx + 4, 220], [bx, 220 + 3 + ang / 5]], "dg-area-ok")
            : K.rect(bx - 2, 220, 34, 5, "dg-fill");
        }
        const msg = t < 0.3 ? "同じ所を通っても、跡の残り方がちがう"
          : t < 0.6 ? "左: 板を横に向けて、雪をずらして曲がる"
          : t < 0.85 ? "右: 山回りで少しずつ板を立てて、ずらさない"
          : "跡が太い帯＝ずらし／細い線＝ずらさない";
        b += K.text(160, 244, msg, { a: "middle", cls: "t-s t-b halo" });
        return b;
      },
    },
  });
})();

// ==================== 動く図: g2（_work/grow/anims/g2.js から統合） ====================
// 動く図: 段階3 スイッチ / 段階4 プレス。setup-anim.js の A と K だけを使う。
SETUP_ANIM.add({
  // スイッチ: 進む向きも目線も下のまま。前になる足・体の向き・かかと側エッジの位置が入れ替わる。足の角度は変えない。
  "a-switch": {
    cap: "スイッチ（逆向き）への切り替え。上から見た図。進む向きも目線も下のままで、前になる足と体の向き、かかと側エッジの位置が入れ替わる。足の角度（ビンディング）は変えない。",
    h: 252, dur: 8,
    phases: [
      { at: 0, name: "いつもの向き" },
      { at: 0.28, name: "一瞬だけ平らに" },
      { at: 0.46, name: "体の向きを入れ替える" },
      { at: 0.62, name: "スイッチ（テールが先）" },
      { at: 0.82, name: "いま前の足を踏む" },
    ],
    draw: (A, t) => {
      const K = A.K, cx = 168;
      const spin = A.ease(A.seg(t, 0.28, 0.62));
      const th = A.lerp(90, 270, spin); // ノーズが向く角度（90°=谷側、270°=山側）
      const cy = A.lerp(78, 148, t);
      const rad = th * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
      // 板の中の点 → 画面の座標（+x=ノーズ側、+y=つま先側。レギュラーなので板の −y 側がかかと側）
      const R = (dx, dy) => [cx + dx * co - dy * si, cy + dx * si + dy * co];
      const flat = spin > 0.12 && spin < 0.88; // 板が横を向いている間＝どちらのエッジも立っていない

      let b = K.rect(24, 22, 272, 190, "dg-snow");
      b += K.text(160, 15, "上から見た図。上が山側・下へ進む", { a: "middle", cls: "t-s t-dim" });
      b += K.arrow(44, 40, 44, 196, "dim", 6) + K.text(26, 34, "谷（下る向き）", { cls: "t-s t-dim" });
      b += K.polyline([[cx, 78], [cx, cy]], "dg-guide"); // 通ってきた跡

      b += K.boardTop(cx, cy, 84, 25, th);
      // かかと側エッジ。板の縁のすぐ外に太い線で描く。立てている間は実線、切り替えの間だけ平ら＝点線
      const e1 = R(-34, -15), e2 = R(34, -15);
      b += flat ? K.line(e1[0], e1[1], e2[0], e2[1], "dg-guide", { "stroke-width": 3 })
        : K.line(e1[0], e1[1], e2[0], e2[1], "dg-line", { "stroke-width": 5 });

      // 足は板に固定。ビンディングの角度はそのまま（前足はノーズ側へ、後足はテール側へ開く）
      const pF = R(20, 0), pB = R(-20, 0);
      for (const [p, deg, cls] of [[pF, th + 162, "dg-front"], [pB, th + 186, "dg-back"]]) {
        b += K.bootTop(p[0], p[1], 28, 13, deg, "dg-boot") + K.bootTop(p[0], p[1], 28, 13, deg, cls);
      }
      b += K.circle(cx, cy, 6, "dg-person"); // 上から見た体（頭）

      // 目線＝進む向き。板が入れ替わっても、見る先はずっと谷側（かかと側エッジの線と離して置く）
      b += K.arrow(cx + 30, cy - 4, cx + 30, cy + 30, "", 7);
      b += K.text(cx + 36, cy - 8, "目線・進む向き", { cls: "t-s t-b halo" });

      // ノーズ・テールの文字はつま先側へ逃がす（板に重ねない）。入れ替わりが見えるので途中も出す
      const nose = R(42, 30), tail = R(-42, 30), toeA = -si > 0 ? "start" : "end";
      b += K.text(nose[0], nose[1] + 4, "ノーズ", { a: toeA, cls: "t-s halo" });
      b += K.text(tail[0], tail[1] + 4, "テール", { a: toeA, cls: "t-s halo" });
      if (flat) {
        b += K.ng(232, 38) + K.text(246, 36, "平らな時間は\n短く", { cls: "t-s t-b t-ng", lh: 13 });
      } else {
        const lead = pF[1] > pB[1] ? pF : pB; // 谷側にある足＝いま前の足
        const step = t >= 0.82; // 板が谷を向いたら、いま前の足に乗る
        b += K.note(lead[0], lead[1], cx - 34, lead[1], step ? "ここを踏む" : "いま前の足", "end");
        if (step) b += K.circle(lead[0], lead[1], 13, pF[1] > pB[1] ? "dg-front" : "dg-back");
        const hl = R(si > 0 ? -36 : 36, -24); // かかと側エッジの山側の端
        b += K.text(hl[0], hl[1] + 4, "かかと側エッジ", { a: si > 0 ? "start" : "end", cls: "t-s halo" });
      }

      const msg = t < 0.28 ? "いつもの向き。ノーズが先・左足（青）が前足。\nかかと側のエッジを軽く立てておく。"
        : t < 0.46 ? "板を一瞬だけ平らにする。\n平らな時間が長いほど逆エッジで転びやすい。"
        : t < 0.62 ? "板をぐるっと回すのではなく、\n体の向きを入れ替える気持ちで。"
        : t < 0.82 ? "スイッチ。右足（オレンジ）が先になる。\n足の角度はそのまま（ビンディングは動かさない）。"
        : "板が谷を向いたら、いま前の足を踏む。\n目線は行きたい先へ（足元を見ない）。";
      b += K.text(160, 228, msg, { a: "middle", cls: "t-s t-b halo", lh: 14 });
      return b;
    },
  },

  // テールプレス: 重心を後ろ足の真上〜すぐ外側へ運んで板をしならせ、ノーズを浮かせる
  "a-press": {
    cap: "テールプレス。横から見た図（ノーズが右）。力で押し下げるのではなく、体の重さを後ろ足の上へ運んで板をしならせる。肩のラインは雪面と平行のまま。",
    h: 206, dur: 7,
    phases: [
      { at: 0, name: "ひざを軽く曲げて立つ" },
      { at: 0.2, name: "重心を後ろ足へ運ぶ" },
      { at: 0.45, name: "ノーズが浮く" },
      { at: 0.66, name: "肩は雪面と平行" },
      { at: 0.86, name: "戻す" },
    ],
    draw: (A, t) => {
      const K = A.K, y0 = 178, xT = 74, xN = 250, xB = 120, xF = 198; // xB=後ろ足 xF=前足
      const p = A.ease(A.seg(t, 0.2, 0.45)) * (1 - A.ease(A.seg(t, 0.86, 1))); // プレスの深さ 0〜1
      // 板の上面の高さ。後ろ足より前は持ち上がり、先端は反り上がる
      const bY = (x) => y0 - (x < 96 ? (96 - x) / 22 * 7 : 0) - (x > 228 ? (x - 228) / 22 * 7 * (1 - p) : 0)
        - (x > xB ? 50 * p * Math.pow((x - xB) / (xN - xB), 1.7) : 0);
      const top = [], bot = [];
      for (let i = 0; i <= 26; i++) { const x = A.lerp(xT, xN, i / 26); top.push([x, bY(x) - 5]); bot.push([x, bY(x)]); }

      let b = K.snow(16, y0 + 2, 304, y0 + 2, 18) + K.text(302, y0 + 16, "雪面", { a: "end", cls: "t-s t-dim" });
      b += K.text(18, y0 + 16, "板のしなりは誇張", { cls: "t-s t-dim" });
      b += K.polygon(top.concat(bot.reverse()), "dg-board");
      const fB = [xB, bY(xB) - 5], fF = [xF, bY(xF) - 5];
      // バインディングは板の傾きに合わせて傾ける（しなった板から浮いて見えないように）
      const slope = (x) => Math.atan2(bY(x + 8) - bY(x - 8), 16) * 180 / Math.PI;
      for (const [x, y] of [fB, fF]) b += K.tr(x, y, K.rect(-13, -5, 26, 5, "dg-binding"), slope(x));

      // からだ: 重心（腰）が真ん中 → 後ろ足のバインディングのすぐ外側へ。腕は横に広げて肩を雪面と平行に
      const hipX = A.lerp((xB + xF) / 2, xB - 18, p), hipY = fB[1] - 62 + p * 8;
      const nx = hipX, ny = hipY - 28;
      b += K.person({
        head: [hipX + 5, hipY - 39], neck: [nx, ny], hip: [hipX, hipY],
        lKnee: [xB - 4, A.lerp(hipY + 22, hipY + 18, p)], lFoot: [fB[0] - 6, fB[1]],
        rKnee: [A.lerp(xF - 8, xF - 14, p), A.lerp(hipY + 20, (hipY + fF[1]) / 2 - 2, p)], rFoot: [fF[0] - 4, fF[1]],
        lElbow: [nx - A.lerp(16, 24, p), ny + A.lerp(12, 5, p)], lHand: [nx - A.lerp(30, 46, p), ny + A.lerp(20, 7, p)],
        rElbow: [nx + A.lerp(16, 24, p), ny + A.lerp(10, 5, p)], rHand: [nx + A.lerp(30, 46, p), ny + A.lerp(18, 7, p)],
      });
      b += K.line(hipX, hipY, hipX, y0, "dg-guide") + K.circle(hipX, hipY, 5.5, "dg-dot"); // 重心と、その真下
      b += K.text(xB - 24, fB[1] - 22, "後ろ足", { a: "end", cls: "t-s t-b t-back halo" });
      b += K.text(xF + 18, fF[1] - 18, "前足", { cls: "t-s t-b t-front halo" });

      if (t >= 0.2 && t < 0.5) {
        b += K.arrow(hipX + 40, hipY - 4, hipX + 12, hipY - 4, "ok", 7);
        b += K.text(hipX + 46, hipY - 8, "体の重さ", { cls: "t-s t-b t-ok halo" });
      }
      if (p > 0.5) { // 浮いた高さ（板のしなり）
        b += K.dim(xN + 6, bY(xN) - 3, xN + 6, y0, "");
        b += K.text(300, bY(xN) - 10, "ノーズが浮く", { a: "end", cls: "t-s t-b halo" });
      }
      if (t >= 0.66 && t < 0.86) { // 保つときの形: 肩は平行、腕は左右に、目線は進む方
        b += K.line(nx - 52, ny, nx + 52, ny, "dg-guide") + K.note(nx - 52, ny, 26, 60, "肩は雪面と平行");
        b += K.arrow(hipX + 18, hipY - 43, hipX + 56, hipY - 43, "", 6);
        b += K.text(hipX + 60, hipY - 47, "目線は進む方へ", { cls: "t-s t-b halo" });
      }
      const msg = t < 0.2 ? "ひざを軽く曲げて立つ。\n板はまだまっすぐ。"
        : t < 0.45 ? "体の重さを後ろ足の上へ運ぶ。\n押し下げるのではなく、乗りに行く。"
        : t < 0.66 ? "重さで板がしなり、ノーズが浮く。\nバインディングのすぐ外側に乗る。"
        : t < 0.86 ? "肩のラインは雪面と平行のまま。\n腕は左右に大きく広げ、目線は進む方へ。"
        : "重心を真ん中に戻す。\nこの出し入れをパタパタと繰り返す。";
      b += K.text(160, 18, msg, { a: "middle", cls: "t-s t-b halo", lh: 14 });
      return b;
    },
  },
});

// ==================== 動く図: g3（_work/grow/anims/g3.js から統合） ====================
// 動く図（段階4・6: フロントサイド180 / 段階5: ラントリ入門）。
// 書き方は setup-anim.js の見本（a-sturn / a-ollie）と同じ。色と線は setup.css の .dg-* / .t-* クラスだけ。
// 上から見た図: 上が山側・下へ進む。レギュラー（左足が前）。
// 向きの決まりは setup-diagrams.js と同じ（ノーズを左に置くとつま先側エッジが上）。
// 板が回る図なので式で書くと: つま先側エッジ＝ノーズの向きを時計回りに90°回した側。
SETUP_ANIM.add({
  // フロントサイド180: ためる → 目線と肩が先に回る → 板が追いつく → スイッチで着地
  "a-180": {
    cap: "フロントサイド180（上から見た図）。目線と肩を先に谷側へ開き（先行動作）、板があとから180度回って、逆向き（スイッチ）で着地する。前足＝青・後足＝オレンジ。",
    w: 320, h: 250, dur: 8, loop: true,
    phases: [
      { at: 0, name: "ためる（回る方と逆へ）" },
      { at: 0.24, name: "踏み切り: 肩が先に回る" },
      { at: 0.42, name: "空中: 板が追いつく" },
      { at: 0.7, name: "着地（スイッチ）" },
      { at: 0.86, name: "スイッチで滑り続ける" },
    ],
    draw: (A, t) => {
      const K = A.K, cx = 152, y = A.lerp(74, 170, t);
      const wind = A.ease(A.seg(t, 0, 0.24)) * (1 - A.seg(t, 0.24, 0.3)); // ためのひねり（回る方と逆）
      const sh = A.ease(A.seg(t, 0.24, 0.56));  // 肩が回った割合
      const bd = A.ease(A.seg(t, 0.34, 0.72));  // 板が回った割合（肩より遅れて始まる）
      const air = A.seg(t, 0.3, 0.36) * (1 - A.seg(t, 0.64, 0.7)); // 浮いている間（着地の区間と合わせる）
      const bDeg = 90 - 180 * bd;               // ノーズの向き（90=谷）
      const cDeg = 180 + 26 * wind - 180 * sh;  // 胸の向き（180=つま先側）
      const U = (d) => [Math.cos(d * K.RAD), Math.sin(d * K.RAD)];
      const u = U(bDeg), v = U(bDeg + 90), cd = U(cDeg), sv = U(cDeg + 90);
      const BP = (a, c) => [cx + u[0] * a + v[0] * c, y + u[1] * a + v[1] * c]; // a=ノーズ方向, c=つま先側
      const tag = (a, c, s, cls) => { const q = BP(a, c); return K.text(q[0], q[1] + 4, s, { a: v[0] * c >= 0 ? "start" : "end", cls }); };
      // 斜面（上が山側・下へ進む）
      let b = K.rect(20, 34, 280, 178, "dg-snow");
      b += K.arrow(32, 48, 32, 204, "dim", 6) + K.arrow(288, 48, 288, 204, "dim", 6);
      b += K.text(42, 46, "谷（下へ進む）", { cls: "t-s t-dim" });
      b += K.line(cx, 62, cx, 192, "dg-guide");
      // 板（上から）。浮いている間は影をずらして描く
      if (air > 0.05) b += K.boardTop(cx + 3 + 6 * air, y + 4 + 7 * air, 70, 24, bDeg, "dg-guide");
      b += K.boardTop(cx, y, 70, 24, bDeg);
      const f1 = BP(16, -11), f2 = BP(16, 11), r1 = BP(-16, -11), r2 = BP(-16, 11);
      b += K.line(f1[0], f1[1], f2[0], f2[1], "dg-front", { "stroke-width": 3.5 });
      b += K.line(r1[0], r1[1], r2[0], r2[1], "dg-back", { "stroke-width": 3.5 });
      const nose = BP(52, 0);
      b += K.text(nose[0], nose[1] + 4, "ノーズ", { a: "middle", cls: "t-s halo" });
      if (t < 0.24) b += tag(0, 34, "つま先側", "t-s t-dim") + tag(40, -30, "かかと側に乗る", "t-s t-b halo");
      if (t < 0.24 || t > 0.86) {
        b += tag(16, -30, "前足", "t-s t-b t-front halo");
        b += tag(-16, -30, "後足", "t-s t-b t-back halo");
      }
      // からだ（上から）: 肩のライン（太い線）＋頭。目線は谷へ向けたまま
      b += K.line(cx + sv[0] * 19, y + sv[1] * 19, cx - sv[0] * 19, y - sv[1] * 19, "dg-line", { "stroke-width": 4.5 });
      const hx = cx + cd[0] * 16, hy = y + cd[1] * 16;
      b += K.circle(hx, hy, 6, "dg-person");
      b += K.arrow(hx, hy + 11, hx, hy + 30, "", 6);
      if (t < 0.24 || t > 0.86) {
        b += K.text(hx + (v[0] > 0 ? 6 : -6), hy + 28, "目線は谷のまま", { a: v[0] > 0 ? "start" : "end", cls: "t-s halo" });
      }
      if (t < 0.24) b += K.note(hx, hy, cx - 56, y + 46, "頭と肩", "end");
      // 回った角度くらべ（肩が先、板があと）
      const shD = 180 * sh - 26 * wind, bdD = 180 * bd;
      const bar = (yy, lab, deg, note) => K.text(20, yy, lab, { cls: "t-s t-b" }) +
        K.rect(40, yy - 9, 120, 10, "dg-snow") + K.rect(40, yy - 9, 120 * Math.max(0, deg) / 180, 10, "dg-hl") +
        K.text(196, yy, Math.round(deg) + "°", { a: "end", cls: "t-s t-dim" }) +
        K.text(204, yy, note, { cls: "t-s t-dim" });
      b += bar(228, "肩", shD, shD < 0 ? "逆へためる" : "先に回る") + bar(243, "板", bdD, "あとから回る");
      const msg = t < 0.24 ? "かかと側エッジに乗り、回る方と逆へ軽くためる"
        : t < 0.42 ? "先行動作＝目線と肩を先に谷側へ開く"
        : t < 0.7 ? "肩に引かれて、板が180度回る（浮いている間）"
        : t < 0.86 ? "着地点に目線を送り、ひざで吸収して着地"
        : "スイッチ＝前後が入れ替わった向きで滑る";
      b += K.text(160, 20, msg, { a: "middle", cls: "t-s t-b halo" });
      return b;
    },
  },

  // ラントリ入門: ターンの切り替えでオーリー → 着地してそのまま次のターンへ
  "a-runtori": {
    cap: "ラントリ入門（上から見た軌跡）。ターンの切り替え（板が平らになる一瞬）に低いオーリーを入れ、着地したらそのまま次のターンへ。①②が技を入れる所。",
    w: 320, h: 250, dur: 9, loop: true,
    phases: [
      { at: 0, name: "まずはターンだけ" },
      { at: 0.33, name: "①切り替えで跳ぶ" },
      { at: 0.45, name: "着地 → 次のターン" },
      { at: 0.72, name: "②切り替えで跳ぶ" },
      { at: 0.84, name: "同じリズムでターンが続く" },
    ],
    draw: (A, t) => {
      const K = A.K, turns = 2.6, amp = 46, y0 = 52, y1 = 190, ext = 1.15;
      const pts = A.sPath(160, y0, y1, amp, turns);                                  // 滑る所
      const guide = A.sPath(160, y0, y0 + (y1 - y0) * ext, amp, turns * ext, 190);   // 先に続くターン（同じ波の続き）
      const i = Math.round((pts.length - 1) * t), p = pts[i], deg = A.dirDeg(pts, i);
      const U = (d) => [Math.cos(d * K.RAD), Math.sin(d * K.RAD)];
      const u = U(deg), v = U(deg + 90);
      const BP = (a, c) => [p[0] + u[0] * a + v[0] * c, p[1] + u[1] * a + v[1] * c];
      const us = [1 / turns, 2 / turns]; // 切り替え（板が平らになる一瞬）の位置
      const near = us.reduce((a, s) => (Math.abs(t - s) < Math.abs(a) ? t - s : a), 9); // 近い切り替えまでの差
      const air = Math.max(0, 1 - Math.abs(near) / 0.06); // 浮いている間
      const my = (s) => A.lerp(y0, y1, s);
      let b = K.rect(20, 32, 280, 186, "dg-snow");
      b += K.arrow(32, 46, 32, 210, "dim", 6) + K.arrow(288, 46, 288, 210, "dim", 6);
      b += K.text(42, 44, "谷（下へ進む）", { cls: "t-s t-dim" });
      b += K.polyline(guide, "dg-guide") + A.trail(pts, t, "dg-line");
      // 技を入れる所（ターンとターンのつなぎ目）
      b += K.line(160, my(us[0]), 130, my(us[0]) - 12, "dg-thin") + K.num(124, my(us[0]) - 15, "1");
      b += K.text(114, my(us[0]) - 11, "切り替えで技", { a: "end", cls: "t-s halo" });
      b += K.line(160, my(us[1]), 190, my(us[1]) - 12, "dg-thin") + K.num(196, my(us[1]) - 15, "2");
      b += K.text(206, my(us[1]) - 11, "次も同じ所で", { cls: "t-s halo" });
      // 板（上から）。浮いている間は影をずらして描く
      if (air > 0.12) b += K.boardTop(p[0] + 2 + 7 * air, p[1] + 3 + 7 * air, 48, 18, deg, "dg-guide");
      b += K.boardTop(p[0], p[1], 48, 18, deg);
      const f1 = BP(11, -8), f2 = BP(11, 8), r1 = BP(-11, -8), r2 = BP(-11, 8);
      b += K.line(f1[0], f1[1], f2[0], f2[1], "dg-front", { "stroke-width": 3.5 });
      b += K.line(r1[0], r1[1], r2[0], r2[1], "dg-back", { "stroke-width": 3.5 });
      const msg = t < 0.12 ? "技なしで同じリズムのターンを3回 → 4回目に技"
        : t > 0.88 ? "技のあとも、同じ大きさのターンが続く"
        : air > 0.15 ? "切り替えで低く跳ぶ（高さは5cmで十分）"
        : near > 0 && near < 0.14 ? "ひざで吸収して、すぐ次のターンへ"
        : near < 0 && near > -0.14 ? "切り替えの前に低くしゃがんでおく"
        : "ターン: エッジで速さを整える（主役はターン）";
      b += K.text(160, 20, msg, { a: "middle", cls: "t-s t-b halo" });
      b += K.text(160, 236, "技の前後でターンの形が変わらなければ成功", { a: "middle", cls: "t-s t-dim" });
      return b;
    },
  },
});
