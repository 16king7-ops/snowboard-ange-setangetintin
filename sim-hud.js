// sim-hud.js — 足裏の圧（上から透かして見た図）と、体勢の数値。
import { D2R } from "./sim-geo.js";
import { BOOT_FWD, ZONE } from "./sim-body.js";

// 足の中の形（足首の関節が原点、z=つま先向き、x=ノーズ側）。インソールの輪郭（m）
const INSOLE = [[0, -0.055], [0.022, -0.05], [0.03, -0.02], [0.028, 0.04], [0.042, 0.1], [0.046, 0.14], [0.04, 0.18], [0.025, 0.205], [0, 0.212], [-0.02, 0.21], [-0.038, 0.19], [-0.048, 0.15], [-0.04, 0.1], [-0.022, 0.05], [-0.026, -0.02], [-0.02, -0.05]];
// 右足は小指側が逆（左足=前足: 小指側がノーズ側）
const insole = (sd) => INSOLE.map(([x, z]) => [sd === "L" ? x : -x, z]);
const BOOT = [[-0.054, -0.08], [0.054, -0.08], [0.054, 0.225], [-0.054, 0.225]];

// 圧の色（青→水色→緑→黄→赤）
const RAMP = [[0, [30, 40, 110]], [0.2, [40, 120, 220]], [0.4, [40, 200, 170]], [0.6, [150, 220, 60]], [0.8, [250, 200, 40]], [1, [230, 50, 40]]];
function ramp(v) {
  v = Math.max(0, Math.min(1, v));
  for (let i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) {
    const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], t = (v - a) / (b - a);
    return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(",")})`;
  }
  return "rgb(230,50,40)";
}
export const RAMP_CSS = `linear-gradient(90deg, ${RAMP.map(([p, c]) => `rgb(${c.join(",")}) ${p * 100}%`).join(", ")})`;

// 足の中の圧の割合（かかと〜つま先）: 圧の中心 u が かかと(-0.03)〜母趾球(0.15) のどこか
export const toeShare = (u) => Math.max(0, Math.min(1, (u + 0.03) / 0.18));

export function createSoles(canvas, sh, k) {
  const ctx = canvas.getContext("2d"), trail = { L: [], R: [] };
  const feet = { L: { x: sh.stance.xF, a: sh.stance.angF * D2R }, R: { x: sh.stance.xR, a: sh.stance.angR * D2R } };
  // 足の中の点 → 板の上の点（x, z）
  const toBoard = (sd, xl, zl) => {
    const f = feet[sd], ax = f.x - BOOT_FWD * k * Math.sin(f.a), az = -BOOT_FWD * k * Math.cos(f.a);
    return [ax + xl * k * Math.cos(f.a) + zl * k * Math.sin(f.a), az + zl * k * Math.cos(f.a) - xl * k * Math.sin(f.a)];
  };
  const span = Math.max(0.5, (sh.stance.xF - sh.stance.xR) / 2 + 0.2);

  function draw(res, s, air) {
    const dpr = Math.min(2, devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sc = Math.min((W - 16) / (span * 2), (H - 40) / 0.36), cx0 = W / 2, cy0 = H / 2 - 6;
    const P = (bx, bz) => [cx0 - bx * sc, cy0 - bz * sc]; // ノーズを左、つま先側を上
    // 板の輪郭（中央部分）
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const x = -span + (i / 40) * span * 2; const [px, py] = P(x, sh.hw(x)); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    for (let i = 40; i >= 0; i--) { const x = -span + (i / 40) * span * 2; const [px, py] = P(x, -sh.hw(x)); ctx.lineTo(px, py); }
    ctx.closePath();
    ctx.fillStyle = "rgba(35,64,74,.18)"; ctx.fill();
    // 雪に当たっているエッジ
    const e = s.edge / D2R;
    if (!air && Math.abs(e) > 1.5) {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const x = -span + (i / 40) * span * 2; const [px, py] = P(x, Math.sign(e) * sh.hw(x)); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.strokeStyle = "#e0622c"; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
    ctx.fillText("ノーズ", 4, cy0 + 4); ctx.textAlign = "right"; ctx.fillText("テール", W - 4, cy0 + 4);
    ctx.textAlign = "center"; ctx.fillText("つま先側", W / 2, 11); ctx.fillText("かかと側", W / 2, H - 3);

    for (const sd of ["L", "R"]) {
      const ft = res.foot[sd], path = (pts) => { ctx.beginPath(); pts.forEach(([x, z], i) => { const [px, py] = P(...toBoard(sd, x, z)); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); };
      path(BOOT); ctx.fillStyle = "rgba(20,22,26,.8)"; ctx.fill();
      ctx.save(); path(insole(sd)); ctx.clip();
      // 圧の分布: 母趾球・小趾球・かかとの3点それぞれに山を描く（2点で踏めば山が2つ）。指先も少し受ける
      const uc = ft.u + BOOT_FWD, vc = ft.v, sx = sd === "L" ? 1 : -1, zs = ft.zones || { m1: 0, m5: 0, heel: 0 }, bw = air ? 0 : ft.share * ft.load / Math.max(0.01, ft.share || 1);
      const blobs = [[ZONE.m1, zs.m1, 0.022], [ZONE.m5, zs.m5, 0.021], [ZONE.heel, zs.heel, 0.028], [[-0.024, 0.192], zs.m1 * 0.35, 0.013], [[0.018, 0.172], zs.m5 * 0.3, 0.016]];
      const step = 0.0055;
      for (let z = -0.06; z <= 0.215; z += step) for (let x = -0.05; x <= 0.05; x += step) {
        let v = 0;
        for (const [[bx, bz], w, sg] of blobs) v += w * Math.exp(-(((x - bx * sx) ** 2 + (z - bz) ** 2) / (sg * sg)));
        const val = v * (air ? 0 : ft.share) * (ft.load / Math.max(0.01, ft.share)) / 0.35;
        const [a, b] = P(...toBoard(sd, x, z));
        ctx.fillStyle = ramp(val); ctx.globalAlpha = 0.25 + 0.75 * Math.min(1, val * 3);
        ctx.fillRect(a - step * sc * 0.6, b - step * sc * 0.6, step * sc * 1.25, step * sc * 1.25);
      }
      ctx.restore(); ctx.globalAlpha = 1;
      path(insole(sd)); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.stroke();
      // 母趾球・小趾球・かかとの割合（体重に対する%。圧力インソールのアプリの表示にならう）
      if (!air && ft.share > 0.02) {
        const pct = [zs.m1, zs.m5, zs.heel].map((w) => Math.round(w * ft.share * 100));
        ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
        for (const [k, x, z] of [[0, sd === "L" ? -0.07 : 0.07, 0.15], [1, sd === "L" ? 0.07 : -0.07, 0.15], [2, 0, -0.1]]) {
          const [tx, ty] = P(...toBoard(sd, x, z)); ctx.fillText(pct[k], tx, ty + 3);
        }
      }
      // 圧の中心と、直前の軌跡
      const [px, py] = P(...toBoard(sd, vc, uc));
      const tr = trail[sd]; tr.push([px, py]); if (tr.length > 40) tr.shift();
      ctx.beginPath(); tr.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.5; ctx.stroke();
      // 白い点は3点の圧の平均（圧の中心）。2点で踏んでいるときはその間に来て、そこ自体に圧があるわけではない
      if (!air && ft.share > 0.02) { ctx.beginPath(); ctx.arc(px, py, 3, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "#111"; ctx.stroke(); }
    }
    // 板全体の圧の中心
    if (!air) {
      const [px, py] = P(s.cx, Math.abs(e) > 1 ? Math.sign(e) * sh.hw(s.cx) * 0.9 : s.cz);
      ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.strokeStyle = "#e0622c"; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }
  const reset = () => { trail.L.length = 0; trail.R.length = 0; };
  return { draw, reset };
}

// 数値の表示
export function readouts(res, st, extra) {
  const f = (v, d = 0) => (Number.isFinite(v) ? (Math.abs(v) < 0.5 && d === 0 ? "0" : v.toFixed(d)) : "—");
  const { ang, foot } = res, air = st.air, md = extra.model;
  const toeP = (f) => Math.round(((f.zones?.m1 || 0) + (f.zones?.m5 || 0)) * 100);
  const pF = Math.round(foot.L.share * 100), tF = toeP(foot.L), tR = toeP(foot.R);
  // 間違いの例を見ているときは、お手本（同じ瞬間の正しい姿勢）の値を下に添える
  const cmp = (v, fn) => (md ? `${v}<small class="model">お手本 ${fn(md)}</small>` : v);
  const mP = (r) => Math.round(r.foot.L.share * 100);
  return [
    ["速さ", `${f(st.s.v * 3.6)} km/h`],
    ["雪から受ける力", air ? "0（空中）" : `体重の ${f(extra.G, 2)} 倍`],
    ["ターン半径", extra.R ? `${f(extra.R, 1)} m` : "直進"],
    ["エッジ角", `${f(Math.abs(st.s.edge) / D2R)}°${Math.abs(st.s.edge) > 1 * D2R ? (st.s.edge > 0 ? "（つま先側）" : "（かかと側）") : ""}`],
    ["体の傾き（内傾）", `${f(extra.incl)}°`],
    ["くの字（エッジ角と内傾の差）", `${f(Math.abs(st.s.edge) / D2R - extra.incl)}°`],
    ["前足：後足", air ? "—" : cmp(`${pF} : ${100 - pF}`, (r) => `${mP(r)} : ${100 - mP(r)}`)],
    ["前足部（母趾球＋小趾球）の割合 前/後", air ? "—" : cmp(`${tF}% / ${tR}%`, (r) => `${toeP(r.foot.L)}% / ${toeP(r.foot.R)}%`)],
    ["膝の曲がり 前/後", cmp(`${f(ang.kneeL)}° / ${f(ang.kneeR)}°`, (r) => `${f(r.ang.kneeL)}° / ${f(r.ang.kneeR)}°`)],
    ["股関節の曲がり 前/後", cmp(`${f(ang.hipL)}° / ${f(ang.hipR)}°`, (r) => `${f(r.ang.hipL)}° / ${f(r.ang.hipR)}°`)],
    ["足首の前傾 前/後", cmp(`${f(ang.ankleL)}° / ${f(ang.ankleR)}°`, (r) => `${f(r.ang.ankleL)}° / ${f(r.ang.ankleR)}°`)],
    ["肩の向き（板に対して）", cmp(`${f(ang.twist)}°${ang.twist > 3 ? "（ノーズ側へ開く）" : ang.twist < -3 ? "（テール側へ閉じる）" : ""}`, (r) => `${f(r.ang.twist)}°`)],
    ["重心の高さ（板から）", cmp(`${f(ang.comH * 100)} cm`, (r) => `${f(r.ang.comH * 100)} cm`)],
  ];
}
