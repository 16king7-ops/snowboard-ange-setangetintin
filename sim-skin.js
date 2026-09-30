// sim-skin.js — 関節で滑らかに曲がる肌と服。立った姿勢で体の表面を輪切りの断面を積み重ねて作り、
// 各頂点を近くの骨の動きで混ぜて動かす（スキニング）。服は同じ形を少し膨らませ、しわを付ける。
import * as THREE from "./vendor/three.module.min.js";

// 立った姿勢での骨の付け根（身長173cm、m）。骨の向きはどれも回転なし
const R0 = { pelvis: [0, 0.915, 0], lumbar: [0, 0.985, -0.04], thorax: [0, 1.155, -0.04], neck: [0, 1.455, -0.06], head: [0, 1.575, -0.03] };
for (const [s, sx] of [["L", 1], ["R", -1]]) Object.assign(R0, {
  ["thigh" + s]: [sx * 0.088, 0.915, 0], ["shank" + s]: [sx * 0.088, 0.49, 0], ["foot" + s]: [sx * 0.088, 0.07, 0],
  ["uarm" + s]: [sx * 0.18, 1.39, -0.05], ["farm" + s]: [sx * 0.18, 1.09, -0.05], ["hand" + s]: [sx * 0.18, 0.84, -0.05],
});

// 輪: [高さ(または長さ方向の位置), 横の半径a, 奥行きの半径b, 中心のずれ, 重み{骨: 割合}]
const TORSO = [
  [0.79, 0.1, 0.07, -0.02, { pelvis: 1 }], [0.83, 0.15, 0.105, -0.02, { pelvis: 1 }], [0.88, 0.17, 0.115, -0.015, { pelvis: 1 }],
  [0.95, 0.168, 0.105, -0.005, { pelvis: 1 }], [1.01, 0.152, 0.095, 0.005, { pelvis: 0.6, lumbar: 0.4 }], [1.07, 0.138, 0.09, 0.012, { lumbar: 1 }],
  [1.13, 0.14, 0.093, 0.015, { lumbar: 0.7, thorax: 0.3 }], [1.2, 0.148, 0.1, 0.018, { lumbar: 0.3, thorax: 0.7 }], [1.27, 0.155, 0.107, 0.018, { thorax: 1 }],
  [1.34, 0.162, 0.11, 0.012, { thorax: 1 }], [1.4, 0.168, 0.105, 0, { thorax: 1 }], [1.445, 0.172, 0.092, -0.015, { thorax: 1 }],
  [1.47, 0.13, 0.075, -0.025, { thorax: 0.8, neck: 0.2 }], [1.49, 0.07, 0.062, -0.02, { thorax: 0.5, neck: 0.5 }],
];
const NECK = [[1.47, 0.056, 0.056, -0.025, { neck: 0.8, thorax: 0.2 }], [1.53, 0.053, 0.053, -0.012, { neck: 1 }], [1.59, 0.05, 0.05, 0.0, { neck: 0.5, head: 0.5 }]];
const HEAD = (() => { const out = []; for (let i = 0; i <= 12; i++) { const y = 1.508 + (i / 12) * 0.222, u = (y - 1.625) / 0.112, r = Math.sqrt(Math.max(0.02, 1 - u * u)); out.push([y, 0.074 * r, 0.094 * r, 0.02 - 0.01 * u, { head: 1 }]); } return out; })();
const UARM = [[1.43, 0.045, 0.045, 0, { uarm: 0.5, thorax: 0.5 }], [1.41, 0.05, 0.05, 0, { uarm: 0.7, thorax: 0.3 }], [1.37, 0.052, 0.05, 0, { uarm: 1 }], [1.3, 0.045, 0.045, 0, { uarm: 1 }],
  [1.22, 0.042, 0.043, 0.003, { uarm: 1 }], [1.15, 0.038, 0.039, 0, { uarm: 1 }], [1.1, 0.036, 0.036, 0, { uarm: 0.5, farm: 0.5 }]];
const FARM = [[1.06, 0.038, 0.037, 0, { farm: 1 }], [1.0, 0.037, 0.034, 0.003, { farm: 1 }], [0.94, 0.031, 0.027, 0, { farm: 1 }], [0.87, 0.026, 0.02, 0, { farm: 0.6, hand: 0.4 }]];
const HAND = [[0.85, 0.016, 0.03, 0.003, { hand: 1 }], [0.81, 0.017, 0.045, 0.006, { hand: 1 }], [0.77, 0.015, 0.043, 0.006, { hand: 1 }], [0.73, 0.01, 0.03, 0.004, { hand: 1 }]];
const THIGH = [[0.97, 0.075, 0.075, 0, { thigh: 0.5, pelvis: 0.5 }], [0.9, 0.085, 0.085, 0, { thigh: 0.7, pelvis: 0.3 }], [0.83, 0.08, 0.082, 0.003, { thigh: 1 }], [0.74, 0.072, 0.074, 0.005, { thigh: 1 }],
  [0.64, 0.063, 0.064, 0.006, { thigh: 1 }], [0.56, 0.053, 0.055, 0.006, { thigh: 1 }], [0.5, 0.05, 0.052, 0.008, { thigh: 0.5, shank: 0.5 }]];
const SHANK = [[0.45, 0.05, 0.05, 0.002, { shank: 1 }], [0.38, 0.052, 0.056, -0.012, { shank: 1 }], [0.3, 0.046, 0.05, -0.01, { shank: 1 }], [0.2, 0.035, 0.037, -0.004, { shank: 1 }],
  [0.12, 0.028, 0.03, 0, { shank: 0.6, foot: 0.4 }], [0.085, 0.03, 0.034, 0, { foot: 0.7, shank: 0.3 }]];
// 足は前後方向の管（輪は縦の面）。[前後の位置z, 横の半径, 縦の半径, 高さ]
const FOOT = [[-0.066, 0.02, 0.022, 0.035], [-0.05, 0.03, 0.036, 0.04], [0.0, 0.036, 0.04, 0.04], [0.06, 0.04, 0.034, 0.034], [0.12, 0.045, 0.024, 0.026], [0.17, 0.042, 0.017, 0.02], [0.205, 0.03, 0.012, 0.017]];

// 服の範囲と膨らみ: 部位ごとに [最低の高さ, 最高の高さ, 膨らみ(m)]
export const CLOTH = {
  jacket: { torso: [0.86, 1.52, 0.03], neck: [1.46, 1.55, 0.03], arm: [0.86, 9, 0.024] },
  pants: { torso: [0.78, 1.1, 0.028], leg: [0.2, 9, 0.032] },
};

const SEG = 24; // 1周の点の数
const sgn = (v) => (v < 0 ? -1 : 1);

export function createSkin(k, { cloth = null, color = 0xd8a888, roughness = 0.6, map = null } = {}) {
  const pos = [], nrm = [], uv = [], idx = [], bi = [], bw = [];
  const bones = Object.keys(R0), bid = Object.fromEntries(bones.map((b, i) => [b, i]));
  // 管を作る。rings: [[t, a, b, off, weights]], at(t, a, b, off, th) → [x,y,z]、closeTop/Bottom で端を閉じる
  function tube(rings, side, at, wrinkle = 0) {
    const base = pos.length / 3;
    // 面の表裏: 管の向き × 周の向き が外向きになるかを調べ、逆なら三角形の順を反転する
    const r0 = rings[0], r1 = rings[1], c0 = at(r0[0], 0, 0, r0[3], 0), c1 = at(r1[0], 0, 0, r1[3], 0);
    const p0 = at(r0[0], r0[1], r0[2], r0[3], 0), pt = at(r0[0], r0[1], r0[2], r0[3], 0.01);
    const d = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]], tg = [pt[0] - p0[0], pt[1] - p0[1], pt[2] - p0[2]], o = [p0[0] - c0[0], p0[1] - c0[1], p0[2] - c0[2]];
    const cr = [d[1] * tg[2] - d[2] * tg[1], d[2] * tg[0] - d[0] * tg[2], d[0] * tg[1] - d[1] * tg[0]];
    const inv = cr[0] * o[0] + cr[1] * o[1] + cr[2] * o[2] < 0;
    rings.forEach(([t, a, b, off, w], j) => {
      const ws = Object.entries(w).map(([n, v]) => [bid[n + (n in R0 ? "" : side)], v]).sort((p, q) => q[1] - p[1]);
      for (let i = 0; i <= SEG; i++) {
        const th = (i / SEG) * Math.PI * 2;
        const wr = wrinkle ? 1 + wrinkle * (Math.sin(th * 7 + t * 40) * 0.5 + Math.sin(th * 3 - t * 23) * 0.5) : 1;
        const p = at(t, a * wr, b * wr, off, th);
        pos.push(...p); uv.push(i / SEG, t * 3);
        bi.push(ws[0][0], (ws[1] || ws[0])[0]); bw.push(ws[0][1], ws[1] ? ws[1][1] : 0);
      }
      if (j) for (let i = 0; i < SEG; i++) { const q = base + (j - 1) * (SEG + 1) + i, r = q + SEG + 1; inv ? idx.push(q, q + 1, r, r, q + 1, r + 1) : idx.push(q, r, q + 1, r, r + 1, q + 1); }
    });
    // 両端を閉じる（中心の点へ扇形に）
    for (const [j, first] of [[0, true], [rings.length - 1, false]]) {
      const [t, , , off, w] = rings[j], c = pos.length / 3, ring = base + j * (SEG + 1);
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < SEG; i++) { cx += pos[(ring + i) * 3]; cy += pos[(ring + i) * 3 + 1]; cz += pos[(ring + i) * 3 + 2]; }
      pos.push(cx / SEG, cy / SEG, cz / SEG); uv.push(0.5, t * 3);
      bi.push(bi[ring * 2], bi[ring * 2 + 1]); bw.push(bw[ring * 2], bw[ring * 2 + 1]);
      for (let i = 0; i < SEG; i++) (first !== inv) ? idx.push(c, ring + i, ring + i + 1) : idx.push(c, ring + i + 1, ring + i);
      void off; void w;
    }
  }
  // 縦の管（輪は水平面）。形は角の丸い楕円
  const vert = (x0, z0) => (y, a, b, off, th) => {
    const c = Math.cos(th), s = Math.sin(th);
    return [x0 + a * sgn(c) * Math.abs(c) ** 0.85, y, z0 + off + b * sgn(s) * Math.abs(s) ** 0.85];
  };
  const clip = (rings, part) => {
    if (!cloth) return rings;
    const lim = CLOTH[cloth][part];
    if (!lim) return null;
    const r = rings.filter(([t]) => t >= lim[0] && t <= lim[1]);
    return r.length > 1 ? r.map(([t, a, b, off, w]) => [t, a + lim[2], b + lim[2] * 0.9, off, w]) : null;
  };
  const wrk = cloth ? 0.035 : 0;
  const add = (rings, part, side, at) => { const r = clip(rings, part); if (r) tube(r, side, at, wrk); };
  add(TORSO, "torso", "", vert(0, 0));
  if (!cloth || CLOTH[cloth].neck) add(NECK, "neck", "", vert(0, 0));
  if (!cloth) {
    // 頭: 鼻・耳の出っ張りを足す
    tube(HEAD, "", (y, a, b, off, th) => {
      const c = Math.cos(th), s = Math.sin(th), front = Math.exp(-(((th - Math.PI / 2) / 0.28) ** 2)) * Math.exp(-(((y - 1.605) / 0.022) ** 2));
      const ear = Math.exp(-((Math.min(Math.abs(th), Math.abs(th - Math.PI), Math.abs(th - 2 * Math.PI)) / 0.3) ** 2)) * Math.exp(-(((y - 1.625) / 0.025) ** 2));
      return [(a + ear * 0.012) * c, y, off + (b + front * 0.016) * s];
    });
  }
  for (const [side, sx] of [["L", 1], ["R", -1]]) {
    const ax = sx * 0.18, lx = sx * 0.088;
    // 腕は肩から指先まで、脚は股から足首まで1本の管（肘・膝は2本の骨の間で重みを混ぜて滑らかに曲がる）
    add([...UARM, ...FARM, ...(cloth ? [] : HAND)], "arm", side, vert(ax, -0.05));
    add([...THIGH, ...SHANK], "leg", side, vert(lx, 0));
    if (!cloth) tube(FOOT.map(([z, a, b, y]) => [z, a, b, y, { foot: 1 }]), side, (z, a, b, y, th) => [lx + a * Math.cos(th), y + b * Math.sin(th), z]);
  }

  const n = pos.length / 3;
  const geo = new THREE.BufferGeometry();
  const rest = new Float32Array(pos), restN = new Float32Array(n * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  restN.set(geo.attributes.normal.array);
  const mat = new THREE.MeshStandardMaterial({ color, roughness, map, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = true;
  const BI = new Uint8Array(bi), BW = new Float32Array(bw), R = bones.map((b) => R0[b]);
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, m = new Float32Array(bones.length * 12), q = new THREE.Quaternion(), mx = new THREE.Matrix4();

  // F: 骨ごとの { p, q }（ワールド）
  function update(F) {
    bones.forEach((b, i) => {
      const f = F[b]; mx.makeRotationFromQuaternion(q.copy(f.q)); const e = mx.elements, o = i * 12;
      m[o] = e[0]; m[o + 1] = e[1]; m[o + 2] = e[2]; m[o + 3] = e[4]; m[o + 4] = e[5]; m[o + 5] = e[6]; m[o + 6] = e[8]; m[o + 7] = e[9]; m[o + 8] = e[10];
      m[o + 9] = f.p.x; m[o + 10] = f.p.y; m[o + 11] = f.p.z;
    });
    for (let v = 0; v < n; v++) {
      let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0;
      for (let j = 0; j < 2; j++) {
        const w = BW[v * 2 + j]; if (!w) continue;
        const b = BI[v * 2 + j], o = b * 12, r = R[b];
        const lx = (rest[v * 3] - r[0]) * k, ly = (rest[v * 3 + 1] - r[1]) * k, lz = (rest[v * 3 + 2] - r[2]) * k;
        x += w * (m[o] * lx + m[o + 3] * ly + m[o + 6] * lz + m[o + 9]);
        y += w * (m[o + 1] * lx + m[o + 4] * ly + m[o + 7] * lz + m[o + 10]);
        z += w * (m[o + 2] * lx + m[o + 5] * ly + m[o + 8] * lz + m[o + 11]);
        const ax = restN[v * 3], ay = restN[v * 3 + 1], az = restN[v * 3 + 2];
        nx += w * (m[o] * ax + m[o + 3] * ay + m[o + 6] * az); ny += w * (m[o + 1] * ax + m[o + 4] * ay + m[o + 7] * az); nz += w * (m[o + 2] * ax + m[o + 5] * ay + m[o + 8] * az);
      }
      P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
      const l = Math.hypot(nx, ny, nz) || 1; N[v * 3] = nx / l; N[v * 3 + 1] = ny / l; N[v * 3 + 2] = nz / l;
    }
    geo.attributes.position.needsUpdate = geo.attributes.normal.needsUpdate = true;
  }
  return { mesh, update, mat };
}

// 服の布の凹凸（法線マップ）
export function fabricNormal() {
  const N = 128, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), img = g.createImageData(N, N), h = new Float32Array(N * N);
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N * N; i++) h[i] = r();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const H = (xx, yy) => h[((yy + N) % N) * N + ((xx + N) % N)] + 0.6 * Math.sin((xx + yy * 0.3) * 0.9);
    const dx = H(x + 1, y) - H(x - 1, y), dy = H(x, y + 1) - H(x, y - 1), l = Math.hypot(dx * 0.4, dy * 0.4, 1), o = (y * N + x) * 4;
    img.data[o] = (-dx * 0.4 / l * 0.5 + 0.5) * 255; img.data[o + 1] = (-dy * 0.4 / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
}
