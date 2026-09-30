// sim-muscles.js — 筋肉。起始・停止（と途中の通過点）を骨に付け、毎フレームその間に紡錘形を張る。
// 縮むと太く、伸びると細くなる（体積をだいたい保つ）。色は「どれだけ使っているか」の推定値。
import * as THREE from "./vendor/three.module.min.js";
import { V } from "./sim-geo.js";

// p: [骨, x, y, z]（外側 +x、左右は自動で反転）/ g: 使われ方のグループ / r: 最大半径 / f: 厚み比（平たい筋）/ o: 平たい面の外向き / b: 筋腹の範囲（残りは腱）
export const MUSCLES = [
  { n: "大腿直筋", g: "quad", r: 0.02, b: [0.04, 0.8], p: [["pelvis", 0.1, 0.045, 0.05], ["thigh", 0.015, -0.18, 0.058], ["thigh", 0.005, -0.36, 0.052], ["shank", 0, -0.06, 0.036]] },
  { n: "外側広筋", g: "quad", r: 0.03, f: 0.7, o: [1, 0, 0.3], b: [0, 0.85], p: [["thigh", 0.06, -0.07, 0.005], ["thigh", 0.058, -0.22, 0.02], ["thigh", 0.035, -0.37, 0.035], ["shank", 0.012, -0.05, 0.036]] },
  { n: "内側広筋", g: "quad", r: 0.026, b: [0.1, 0.9], p: [["thigh", 0.0, -0.14, 0.03], ["thigh", -0.035, -0.3, 0.028], ["thigh", -0.025, -0.39, 0.035], ["shank", -0.008, -0.05, 0.036]] },
  { n: "大腿二頭筋", g: "ham", r: 0.02, b: [0.08, 0.85], p: [["pelvis", 0.06, -0.075, -0.045], ["thigh", 0.035, -0.22, -0.05], ["thigh", 0.04, -0.37, -0.04], ["shank", 0.04, -0.05, -0.015]] },
  { n: "半腱様筋", g: "ham", r: 0.017, b: [0.08, 0.7], p: [["pelvis", 0.05, -0.08, -0.045], ["thigh", -0.01, -0.22, -0.052], ["thigh", -0.03, -0.38, -0.035], ["shank", -0.03, -0.08, 0.005]] },
  { n: "半膜様筋", g: "ham", r: 0.019, b: [0.15, 0.85], p: [["pelvis", 0.055, -0.07, -0.04], ["thigh", -0.015, -0.25, -0.042], ["shank", -0.035, -0.03, -0.02]] },
  { n: "大殿筋", g: "glute", r: 0.055, f: 0.45, o: [0.4, 0, -1], p: [["pelvis", 0.02, 0.08, -0.09], ["pelvis", 0.085, 0.0, -0.105], ["thigh", 0.06, -0.1, -0.04], ["thigh", 0.048, -0.14, -0.025]] },
  { n: "中殿筋", g: "gmed", r: 0.036, f: 0.5, o: [1, 0, 0], p: [["pelvis", 0.13, 0.1, -0.02], ["pelvis", 0.14, 0.04, -0.02], ["thigh", 0.065, -0.045, -0.005]] },
  { n: "大腿筋膜張筋・腸脛靭帯", g: "gmed", r: 0.013, b: [0, 0.3], p: [["pelvis", 0.125, 0.07, 0.045], ["thigh", 0.07, -0.1, 0.012], ["thigh", 0.06, -0.3, 0.005], ["shank", 0.035, -0.03, 0.015]] },
  { n: "腸腰筋", g: "flex", r: 0.02, p: [["lumbar", 0.03, 0.12, 0.02], ["pelvis", 0.07, 0.02, 0.045], ["thigh", 0.015, -0.085, -0.01]] },
  { n: "内転筋群", g: "add", r: 0.034, f: 0.7, o: [-1, 0, 0], p: [["pelvis", 0.03, -0.045, 0.045], ["thigh", -0.03, -0.17, 0.0], ["thigh", -0.032, -0.33, -0.012]] },
  { n: "薄筋", g: "add", r: 0.01, b: [0, 0.8], p: [["pelvis", 0.015, -0.05, 0.055], ["thigh", -0.05, -0.25, -0.005], ["shank", -0.03, -0.08, 0.01]] },
  { n: "縫工筋", g: "flex", r: 0.009, p: [["pelvis", 0.12, 0.08, 0.055], ["thigh", 0.0, -0.18, 0.058], ["thigh", -0.045, -0.36, 0.0], ["shank", -0.028, -0.08, 0.015]] },
  { n: "腓腹筋（内側）", g: "calf", r: 0.024, b: [0, 0.6], p: [["thigh", -0.025, -0.39, -0.03], ["shank", -0.022, -0.12, -0.055], ["shank", -0.005, -0.3, -0.04], ["foot", 0, -0.035, -0.065]] },
  { n: "腓腹筋（外側）", g: "calf", r: 0.02, b: [0, 0.52], p: [["thigh", 0.025, -0.39, -0.03], ["shank", 0.022, -0.12, -0.05], ["shank", 0.005, -0.3, -0.04], ["foot", 0, -0.035, -0.065]] },
  { n: "ヒラメ筋", g: "calf", r: 0.024, f: 0.6, o: [0, 0, -1], b: [0.05, 0.78], p: [["shank", 0.02, -0.08, -0.03], ["shank", 0, -0.24, -0.045], ["shank", 0, -0.37, -0.035], ["foot", 0, -0.03, -0.063]] },
  { n: "前脛骨筋", g: "tib", r: 0.014, b: [0, 0.62], p: [["shank", 0.022, -0.07, 0.02], ["shank", 0.018, -0.22, 0.03], ["shank", 0.0, -0.4, 0.035], ["foot", -0.018, -0.045, 0.07]] },
  { n: "長腓骨筋", g: "peron", r: 0.011, b: [0, 0.6], p: [["shank", 0.042, -0.06, -0.012], ["shank", 0.038, -0.25, -0.01], ["shank", 0.03, -0.42, -0.025], ["foot", 0.035, -0.055, 0.075]] },
  { n: "腹直筋", g: "abs", r: 0.034, f: 0.28, o: [0, 0, 1], p: [["pelvis", 0.02, -0.03, 0.07], ["lumbar", 0.045, 0.05, 0.13], ["lumbar", 0.05, 0.15, 0.14], ["thorax", 0.06, 0.12, 0.165]] },
  { n: "外腹斜筋", g: "obl", r: 0.042, f: 0.3, o: [1, 0, 0.3], p: [["thorax", 0.13, 0.1, 0.07], ["lumbar", 0.13, 0.1, 0.06], ["pelvis", 0.13, 0.09, 0.02]] },
  { n: "脊柱起立筋", g: "erec", r: 0.024, p: [["pelvis", 0.03, 0.04, -0.095], ["lumbar", 0.03, 0.08, -0.062], ["thorax", 0.035, 0.05, -0.075], ["thorax", 0.03, 0.25, -0.07]] },
  { n: "広背筋", g: "lat", r: 0.05, f: 0.2, o: [0, 0, -1], p: [["lumbar", 0.02, 0.08, -0.065], ["thorax", 0.11, 0.08, -0.065], ["thorax", 0.14, 0.18, -0.045], ["uarm", 0.005, -0.06, 0.015]] },
  { n: "大胸筋", g: "pec", r: 0.045, f: 0.3, o: [0, 0, 1], p: [["thorax", 0.025, 0.19, 0.17], ["thorax", 0.1, 0.2, 0.145], ["uarm", 0.01, -0.06, 0.025]] },
  { n: "僧帽筋（上部）", g: "trap", r: 0.022, f: 0.35, o: [0, 0.5, -1], p: [["neck", 0.01, 0.07, -0.03], ["thorax", 0.1, 0.3, -0.04], ["thorax", 0.165, 0.28, -0.01]] },
  { n: "僧帽筋（中・下部）", g: "trap", r: 0.035, f: 0.25, o: [0, 0, -1], p: [["thorax", 0.01, 0.08, -0.088], ["thorax", 0.07, 0.17, -0.088], ["thorax", 0.14, 0.265, -0.05]] },
  { n: "三角筋（前部）", g: "delt", r: 0.016, p: [["thorax", 0.13, 0.28, 0.05], ["uarm", 0.03, -0.05, 0.03], ["uarm", 0.012, -0.14, 0.005]] },
  { n: "三角筋（中部）", g: "delt", r: 0.017, p: [["thorax", 0.18, 0.285, 0.0], ["uarm", 0.045, -0.05, 0.0], ["uarm", 0.012, -0.14, 0.005]] },
  { n: "三角筋（後部）", g: "delt", r: 0.016, p: [["thorax", 0.15, 0.27, -0.05], ["uarm", 0.03, -0.05, -0.03], ["uarm", 0.012, -0.14, 0.005]] },
  { n: "上腕二頭筋", g: "bic", r: 0.02, b: [0.12, 0.85], p: [["thorax", 0.15, 0.24, 0.035], ["uarm", 0.0, -0.12, 0.03], ["uarm", 0.0, -0.24, 0.025], ["farm", 0.008, -0.04, 0.012]] },
  { n: "上腕三頭筋", g: "tri", r: 0.022, b: [0.05, 0.8], p: [["thorax", 0.155, 0.2, -0.03], ["uarm", 0.0, -0.12, -0.032], ["uarm", 0, -0.25, -0.03], ["farm", 0, 0.025, -0.028]] },
  { n: "前腕の屈筋群", g: "fore", r: 0.021, b: [0, 0.6], p: [["uarm", -0.035, -0.29, 0.0], ["farm", -0.015, -0.08, 0.015], ["farm", -0.005, -0.2, 0.012], ["hand", 0, -0.04, 0.01]] },
  { n: "前腕の伸筋群", g: "fore", r: 0.019, b: [0, 0.6], p: [["uarm", 0.03, -0.29, 0.0], ["farm", 0.018, -0.08, -0.01], ["farm", 0.01, -0.2, -0.012], ["hand", 0, -0.04, -0.01]] },
  { n: "胸鎖乳突筋", g: "neck", r: 0.011, p: [["head", 0.05, 0.02, -0.005], ["neck", 0.03, 0.06, 0.03], ["thorax", 0.02, 0.27, 0.125]] },
];
// 左右がない骨（体幹・頭）
const CENTER = new Set(["pelvis", "lumbar", "thorax", "neck", "head"]);

const NR = 12, NA = 10; // 輪の数・1周の点の数

function fiberTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + ((x * 37) % 11) / 90})`; g.fillRect(x, 0, 1, 64); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 使われ方 0〜1 → 色（暗い赤 → 赤 → 橙 → 黄）
const STOPS = [[0, [0.36, 0.1, 0.11]], [0.35, [0.72, 0.18, 0.16]], [0.7, [0.98, 0.5, 0.18]], [1, [1, 0.88, 0.35]]];
export function actColor(a, out = [0, 0, 0]) {
  a = Math.max(0, Math.min(1, a));
  for (let i = 1; i < STOPS.length; i++) if (a <= STOPS[i][0]) {
    const [a0, c0] = STOPS[i - 1], [a1, c1] = STOPS[i], t = (a - a0) / (a1 - a0);
    for (let k = 0; k < 3; k++) out[k] = c0[k] + (c1[k] - c0[k]) * t;
    return out;
  }
  return out;
}
export const ACT_STOPS = STOPS;

// Catmull-Rom で点列上の位置
function crAt(P, u, out) {
  const S = P.length - 1, f = Math.min(S - 1e-6, u * S), i = Math.floor(f), t = f - i;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(S, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  for (const c of ["x", "y", "z"]) out[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
  return out;
}

export function createMuscles(k) {
  const list = [];
  for (const def of MUSCLES) for (const sx of [1, -1]) {
    const side = sx > 0 ? "L" : "R";
    list.push({
      def, side, sx,
      pts: def.p.map(([b, x, y, z]) => ({ bone: CENTER.has(b) ? b : b + side, off: V(x * sx, y, z).multiplyScalar(k) })),
      out: def.o ? V(def.o[0] * sx, def.o[1], def.o[2]).normalize() : null,
      L0: 0,
    });
  }
  const nv = list.length * NR * (NA + 1);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = [];
  list.forEach((m, mi) => {
    const o = mi * NR * (NA + 1);
    for (let j = 0; j < NR; j++) for (let i = 0; i <= NA; i++) { const v = o + j * (NA + 1) + i; uv[v * 2] = i / NA; uv[v * 2 + 1] = j / (NR - 1); }
    for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NA; i++) {
      const a = o + j * (NA + 1) + i, b = a + NA + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: fiberTexture(), roughness: 0.55, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  mesh.castShadow = true;

  const W = [], c = V(), c2 = V(), T = V(), N = V(), B = V(), tmp = V(), rgb = [0, 0, 0];
  const TEN = [0.88, 0.84, 0.76];
  // F: 骨ごとの {p, q}（ワールド）/ act: "quadL" などの使われ方
  function update(F, act, init = false) {
    list.forEach((m, mi) => {
      for (let i = 0; i < m.pts.length; i++) {
        const a = m.pts[i], f = F[a.bone];
        W[i] = (W[i] || V()).copy(a.off).applyQuaternion(f.q).add(f.p);
      }
      W.length = m.pts.length;
      let L = 0;
      for (let i = 1; i < W.length; i++) L += W[i].distanceTo(W[i - 1]);
      if (init || !m.L0) m.L0 = L;
      const bulge = Math.max(0.8, Math.min(1.35, Math.sqrt(m.L0 / L)));
      const outW = m.out ? tmp.copy(m.out).applyQuaternion(F[m.pts[0].bone].q) : tmp.set(0, 0, 1).applyQuaternion(F[m.pts[0].bone].q);
      const d = m.def, r0 = d.r * k, flat = d.f || 1, [b0, b1] = d.b || [0, 1];
      actColor(act[d.g + m.side] ?? act[d.g] ?? 0.1, rgb);
      const o = mi * NR * (NA + 1);
      for (let j = 0; j < NR; j++) {
        const u = j / (NR - 1);
        crAt(W, u, c);
        crAt(W, Math.min(1, u + 0.02), c2); T.copy(c2);
        crAt(W, Math.max(0, u - 0.02), c2); T.sub(c2).normalize();
        N.copy(outW).addScaledVector(T, -outW.dot(T)).normalize();
        B.crossVectors(T, N);
        const s = (u - b0) / (b1 - b0), belly = s <= 0 || s >= 1 ? 0 : Math.sin(Math.PI * s) ** 0.8;
        const r = r0 * (0.16 + 0.84 * belly) * (belly > 0 ? bulge : 1);
        const mix = Math.min(1, belly * 1.6);
        for (let i = 0; i <= NA; i++) {
          const a = (i / NA) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a), v = (o + j * (NA + 1) + i) * 3;
          pos[v] = c.x + N.x * r * flat * cs + B.x * r * sn;
          pos[v + 1] = c.y + N.y * r * flat * cs + B.y * r * sn;
          pos[v + 2] = c.z + N.z * r * flat * cs + B.z * r * sn;
          let nx = N.x * cs / flat + B.x * sn, ny = N.y * cs / flat + B.y * sn, nz = N.z * cs / flat + B.z * sn;
          const l = Math.hypot(nx, ny, nz) || 1;
          nor[v] = nx / l; nor[v + 1] = ny / l; nor[v + 2] = nz / l;
          for (let q = 0; q < 3; q++) col[v + q] = TEN[q] + (rgb[q] - TEN[q]) * mix;
        }
      }
    });
    geo.attributes.position.needsUpdate = geo.attributes.normal.needsUpdate = geo.attributes.color.needsUpdate = true;
  }
  return { mesh, update, list };
}
