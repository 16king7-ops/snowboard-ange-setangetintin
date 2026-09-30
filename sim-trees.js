// sim-trees.js — ゲレンデの木。すべてコードで作る。
// 針葉樹（オオシラビソ・トウヒ風）: まっすぐな幹に、段（輪生）ごとに枝が放射状に出て先が垂れる。枝は針葉の房の板2枚と、上に積もった雪の板1枚。
// 広葉樹（冬で葉がない）: ダケカンバ（白い幹・曲がりくねる）とブナ（灰色で滑らか・上へ広がる）を、枝分かれをくり返して作る。
import * as THREE from "./vendor/three.module.min.js";
import { merge, paint } from "./sim-geo.js";

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// 針葉の房（枝は左→右。細い小枝から短い針葉がびっしり出る）
function needleTexture() {
  const W = 256, H = 128, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), r = rng(21);
  const twig = (x0, y0, x1, y1, len, n) => {
    g.strokeStyle = "#4a3a2a"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    for (let i = 0; i < n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, l = len * (1 - t * 0.55) * (0.7 + r() * 0.5), ang = Math.atan2(y1 - y0, x1 - x0);
      for (const sd of [-1, 1]) {
        const a = ang + sd * (0.9 + r() * 0.5), sh = 22 + r() * 22;
        g.strokeStyle = `rgb(${sh},${50 + r() * 30 | 0},${34 + r() * 16 | 0})`; g.lineWidth = 1.3 + r();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    }
  };
  twig(4, H / 2, W - 6, H / 2, 30, 90);
  for (let i = 0; i < 7; i++) { const x = 30 + i * 30, sd = i % 2 ? 1 : -1; twig(x, H / 2, x + 40, H / 2 + sd * (26 + r() * 14), 16, 30); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// 枝に積もった雪（ふちの柔らかい塊）
function snowTexture() {
  const W = 256, H = 128, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = 10 + r() * (W - 40), y = H / 2 + (r() - 0.5) * 50 * (1 - x / W * 0.6), rx = 14 + r() * 26 * (1 - x / W * 0.5), ry = rx * (0.45 + r() * 0.3);
    const grd = g.createRadialGradient(x, y - ry * 0.3, 1, x, y, rx);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.7, "rgba(238,244,252,0.95)"); grd.addColorStop(1, "rgba(220,230,245,0)");
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function barkTexture(birch) {
  const c = document.createElement("canvas"); c.width = 64; c.height = 256;
  const g = c.getContext("2d"), r = rng(birch ? 9 : 13);
  g.fillStyle = birch ? "#e4ded4" : "#8f8b84"; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < (birch ? 60 : 30); i++) {
    const y = r() * 256, w = birch ? 6 + r() * 30 : 64, h = birch ? 1 + r() * 3 : 1 + r() * 2;
    g.fillStyle = birch ? `rgba(40,30,25,${0.35 + r() * 0.4})` : `rgba(${r() < 0.5 ? "60,58,54" : "175,172,165"},0.35)`;
    g.fillRect(r() * 64, y, w, h);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 枝1本の板: 付け根 o から方向 dir（水平）へ長さ L、先が droop だけ下がる。roll は枝の軸まわりの傾き
function card(o, yaw, L, W, droop, roll, lift, segs = 3) {
  const pos = [], uv = [], idx = [], cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, x = L * t, y = -droop * t * t + lift, w = W * (1 - 0.55 * t);
    for (const s of [-0.5, 0.5]) {
      const z = s * w, zy = z * sr, zz = z * cr; // 枝の軸まわりに傾ける
      pos.push(o.x + cy * x - sy * zz, o.y + y + zy, o.z + sy * x + cy * zz);
      uv.push(t, s + 0.5);
    }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function mergeUV(list) {
  let nv = 0; for (const g of list) nv += g.attributes.position.count;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); out.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); out.setIndex(idx);
  return out;
}

// 針葉樹1本の形（高さ1に正規化して拡大して使う）
function conifer(seed) {
  const r = rng(seed), H = 1, base = 0.12, needles = [], snow = [], trunk = [];
  trunk.push(paint(new THREE.CylinderGeometry(0.004, 0.022, H, 7).translate(0, H / 2, 0), 0x4b3a2c));
  const whorls = 15;
  for (let w = 0; w < whorls; w++) {
    const f = w / (whorls - 1), y = base + (H - base - 0.04) * f, R = 0.3 * Math.pow(1 - f, 0.95) + 0.03;
    const n = 5 + (r() * 3 | 0), off = r() * 6.28;
    for (let i = 0; i < n; i++) {
      const yaw = off + (i / n) * 6.28 + (r() - 0.5) * 0.4, L = R * (0.8 + r() * 0.35), Wd = L * 0.55 + 0.03, droop = L * (0.25 + 0.2 * (1 - f));
      const o = V(0, y, 0);
      needles.push(card(o, yaw, L, Wd, droop, 0.45, 0), card(o, yaw, L, Wd, droop, -0.45, 0));
      if (r() < 0.85) snow.push(card(o, yaw, L * 0.92, Wd * 0.75, droop, 0, 0.012 + L * 0.02));
    }
  }
  // てっぺん（上へ伸びる芯）
  for (let i = 0; i < 3; i++) needles.push(card(V(0, H - 0.07, 0), i * 2.1, 0.07, 0.05, -0.06, 0.4, 0));
  return { needles: mergeUV(needles), snow: mergeUV(snow), trunk: merge(trunk) };
}

// 葉の落ちた広葉樹（枝分かれをくり返す）
function bare(seed, birch) {
  const r = rng(seed), parts = [];
  const grow = (p, d, L, rad, depth) => {
    // 少し曲がりながら伸びる（ダケカンバは曲がりが大きい）
    const bend = birch ? 0.35 : 0.15, mid = p.clone().addScaledVector(d, L * 0.5).add(V((r() - 0.5) * bend * L, 0, (r() - 0.5) * bend * L)), end = p.clone().addScaledVector(d, L);
    end.add(V((r() - 0.5) * bend * L, 0, (r() - 0.5) * bend * L));
    const curve = new THREE.QuadraticBezierCurve3(p, mid, end);
    const tg = new THREE.TubeGeometry(curve, depth < 2 ? 5 : 2, rad, depth < 2 ? 7 : 4, false);
    const n = tg.attributes.position.count, uv = tg.attributes.uv;
    for (let i = 0; i < n; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * L * 4);
    parts.push(tg);
    if (depth >= 5 || rad < 0.0015) return;
    const kids = depth === 0 ? 4 : 2 + (r() < 0.5 ? 1 : 0);
    const dir = end.clone().sub(mid).normalize();
    for (let i = 0; i < kids; i++) {
      const a = (birch ? 0.5 : 0.38) + r() * 0.35, yaw = r() * 6.28;
      const side = V(Math.cos(yaw), 0, Math.sin(yaw));
      const nd = dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).add(V(0, birch ? 0.05 : 0.18, 0)).normalize();
      const at = depth === 0 ? p.clone().lerp(end, 0.45 + i * 0.14) : end;
      grow(at, nd, L * (0.62 + r() * 0.15), rad * 0.58, depth + 1);
    }
  };
  grow(V(0, 0, 0), V(0, 1, 0), 0.42, 0.028, 0);
  const g = mergeUV(parts.map((p) => { p.deleteAttribute("tangent"); return p; }));
  return g;
}

export function createTrees(slope, groundY, PISTE) {
  const r = rng(42), group = new THREE.Group();
  const needleMat = new THREE.MeshStandardMaterial({ map: needleTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
  const snowMat = new THREE.MeshStandardMaterial({ map: snowTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.75, color: 0xffffff });
  const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const birchMat = new THREE.MeshStandardMaterial({ map: barkTexture(true), roughness: 0.85 });
  const beechMat = new THREE.MeshStandardMaterial({ map: barkTexture(false), roughness: 0.8 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), items = [];
  const place = (count, xmin, xspan, z0, zspan) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const sd = r() < 0.5 ? 1 : -1, x = sd * (PISTE + xmin + r() * xspan), z = z0 + r() * zspan;
      out.push([x, groundY(x) - 0.2, z]);
    }
    return out;
  };
  // 針葉樹: 形は3種類をインスタンスで使い回す（高さ 6〜14m）
  for (let v = 0; v < 3; v++) {
    const t = conifer(100 + v), pts = place(95, 6, 60, -110, 780);
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, pts.length); group.add(m); return m; };
    const ns = mk(t.needles, needleMat), sn = mk(t.snow, snowMat), tr = mk(t.trunk, trunkMat);
    pts.forEach((p, i) => {
      const h = 6 + r() * 8;
      items.push({ ms: [ns, sn, tr], i, p, yaw: r() * 6.28, s: [h * (0.85 + r() * 0.3), h, h * (0.85 + r() * 0.3)] });
      ns.setColorAt(i, col.setHSL(0.37 + r() * 0.05, 0.25 + r() * 0.2, 0.55 + r() * 0.25));
    });
  }
  // 広葉樹（葉なし）: ダケカンバとブナ
  for (const birch of [true, false]) for (let v = 0; v < 2; v++) {
    const geo = bare(300 + v * 7 + (birch ? 1 : 0), birch), pts = place(24, 4, 40, -110, 780);
    const m = new THREE.InstancedMesh(geo, birch ? birchMat : beechMat, pts.length);
    pts.forEach((p, i) => { const h = 7 + r() * 7; items.push({ ms: [m], i, p, yaw: r() * 6.28, s: [h, h, h] }); });
    group.add(m);
  }
  slope.add(group);
  // 木は斜面のグループの中にあるので、斜度ぶん逆に傾けて地面に対して垂直に立てる
  const qy = new THREE.Quaternion(), qx = new THREE.Quaternion(), X = V(1, 0, 0), Y = V(0, 1, 0);
  function orient(alpha) {
    qx.setFromAxisAngle(X, -alpha);
    for (const it of items) {
      m4.compose(V(...it.p), q.copy(qx).multiply(qy.setFromAxisAngle(Y, it.yaw)), V(...it.s));
      for (const m of it.ms) m.setMatrixAt(it.i, m4);
    }
    for (const m of group.children) m.instanceMatrix.needsUpdate = true;
  }
  orient(0);
  return { group, orient };
}
