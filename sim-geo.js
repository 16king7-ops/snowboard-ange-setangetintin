// sim-geo.js — 形を作る道具（骨・ウェア・ボードの形）。すべてコードで作る。
// 座標: 各骨の「根元の関節」が原点。立った姿勢で +X=体の左、+Y=上、+Z=体の前。長さは身長173cmのときのm。
// 左右がある骨は「外側が +x」で書き、右側は x を反転する（sx=-1）。
import * as THREE from "./vendor/three.module.min.js";

export const D2R = Math.PI / 180;
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const M4 = THREE.Matrix4, Q = THREE.Quaternion;

export const COL = {
  bone: 0xe9e1cc, cart: 0xc9dde0, disc: 0x8fb0c4, dark: 0x3b2f2a, tooth: 0xf4f1e6,
  jacket: 0x2f5d62, jacket2: 0xd9a441, pants: 0x3a3f4b, boot: 0x1d1f22, sole: 0x2b2b2b,
  helmet: 0xe8e4da, lens: 0xff7a2f, strapG: 0x202226, skin: 0xd9ad8c, glove: 0x25272b,
};

// ---------- 基本の形 ----------
export function paint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

// 位置・色つきのジオメトリを1つにまとめる（描画の回数を減らす）
export function merge(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3).fill(1), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, ov * 3);
    if (g.index) for (const i of g.index.array) idx[oi++] = i + ov;
    else for (let i = 0; i < c; i++) idx[oi++] = i + ov;
    ov += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// 左右反転用: 外側 +x で書いた点を右側では反転
const mx = (p, sx) => [p[0] * sx, p[1], p[2]];

// 球（楕円体）。s=各軸の半径、r=回転(rad)
export function ball(p, r, s = [1, 1, 1], seg = 12, rot = [0, 0, 0]) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, (seg * 0.67) | 0));
  g.applyMatrix4(new M4().compose(V(...p), new Q().setFromEuler(new THREE.Euler(...rot)), V(s[0] * r, s[1] * r, s[2] * r)));
  return g;
}

// a から b への円柱（r0 が a 側、r1 が b 側）
export function rod(a, b, r0, r1 = r0, seg = 8) {
  const A = V(...a), B = V(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.applyMatrix4(new M4().compose(A.clone().add(B).multiplyScalar(0.5), new Q().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)));
  return g;
}

// 点列を通る管（太さは r0 → r1 に変わる）
export function tube(pts, r0, r1 = r0, seg = 16, rs = 7) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)));
  const fr = curve.computeFrenetFrames(seg, false);
  const pos = [], nor = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    const u = j / seg, c = curve.getPointAt(u), r = r0 + (r1 - r0) * u, N = fr.normals[j], B = fr.binormals[j];
    for (let i = 0; i <= rs; i++) {
      const a = (i / rs) * Math.PI * 2, cs = -Math.cos(a), sn = Math.sin(a);
      const n = V().addScaledVector(N, cs).addScaledVector(B, sn).normalize();
      nor.push(n.x, n.y, n.z);
      pos.push(c.x + r * n.x, c.y + r * n.y, c.z + r * n.z);
    }
  }
  for (let j = 1; j <= seg; j++) for (let i = 1; i <= rs; i++) {
    const a = (rs + 1) * (j - 1) + (i - 1), b = (rs + 1) * j + (i - 1), c = (rs + 1) * j + i, d = (rs + 1) * (j - 1) + i;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// 薄い三角の板（肩甲骨など）
function plate(a, b, c, t) {
  const A = V(...a), B = V(...b), C = V(...c);
  const n = B.clone().sub(A).cross(C.clone().sub(A)).normalize().multiplyScalar(t / 2);
  const P = [A.clone().add(n), B.clone().add(n), C.clone().add(n), A.clone().sub(n), B.clone().sub(n), C.clone().sub(n)];
  const tri = [0, 1, 2, 3, 5, 4, 0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5, 2, 5, 0, 0, 5, 3], pos = [];
  for (const i of tri) pos.push(P[i].x, P[i].y, P[i].z);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function lathe(prof, seg = 20, s = [1, 1, 1], p = [0, 0, 0]) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.applyMatrix4(new M4().compose(V(...p), new Q(), V(...s)));
  return g;
}

// ---------- 骨格 ----------
const B = COL.bone;

function vertebra(p, r, h, spine, out) {
  const [x, y, z] = p;
  out.push(
    paint(rod([x, y - h / 2, z], [x, y + h / 2, z], r, r * 0.95, 10), B),
    paint(rod([x, y, z - r * 0.7], [x, y - spine * 0.45, z - r - spine], r * 0.3, r * 0.18, 5), B), // 棘突起
    paint(rod([x - r * 1.7, y + h * 0.1, z - r * 0.55], [x + r * 1.7, y + h * 0.1, z - r * 0.55], r * 0.22, r * 0.22, 5), B), // 横突起
    paint(rod([x, y + h / 2, z], [x, y + h / 2 + h * 0.3, z], r * 0.93, r * 0.93, 10), COL.disc), // 椎間板
  );
}

export function spineGeo(part) {
  const out = [];
  if (part === "lumbar") for (let i = 0; i < 5; i++) { const y = 0.012 + i * 0.031; vertebra([0, y, 0.012 * Math.sin((Math.PI * y) / 0.17)], 0.021, 0.022, 0.03, out); }
  if (part === "thorax") for (let i = 0; i < 12; i++) {
    const y = 0.012 + i * 0.0245, s = y / 0.3;
    vertebra([0, y, -0.025 * Math.sin(Math.PI * s) - 0.02 * s], 0.018 - 0.006 * s, 0.017 - 0.004 * s, 0.035, out);
  }
  if (part === "neck") for (let i = 0; i < 7; i++) { const y = 0.008 + i * 0.016, s = y / 0.12; vertebra([0, y, 0.012 * Math.sin(Math.PI * s) + 0.03 * s], 0.011, 0.011, i === 0 ? 0.03 : 0.018, out); }
  return out;
}

// 肋骨12対・胸骨・鎖骨・肩甲骨（胸郭の骨に固定）
export function thoraxGeo() {
  const out = spineGeo("thorax");
  const W = [0.055, 0.08, 0.1, 0.115, 0.125, 0.132, 0.136, 0.137, 0.135, 0.13, 0.12, 0.1];
  const Dp = [0.1, 0.12, 0.135, 0.145, 0.152, 0.158, 0.162, 0.165, 0.162, 0.155, 0.12, 0.09];
  for (let k = 0; k < 12; k++) {
    const y0 = 0.29 - k * 0.0245, a = W[k], d = Dp[k], cz = (d - 0.045) / 2, bz = (d + 0.045) / 2;
    const drop = 0.05 + k * 0.004, th0 = -Math.PI / 2 + 0.35;
    const th1 = k < 7 ? Math.acos(Math.min(1, 0.022 / a)) : k < 10 ? 0.95 : -0.15;
    const thB = k < 10 ? th1 - (k < 7 ? 0.5 : 0.35) : th1; // ここから先は軟骨
    for (const sx of [1, -1]) {
      const at = (th) => { const u = (th - th0) / Math.PI; return [sx * a * Math.cos(th), y0 - drop * u + (k < 7 && th > thB ? (th - thB) * 0.03 : 0), cz + bz * Math.sin(th)]; };
      const bone = [[sx * 0.014, y0 + 0.004, -0.004]], cart = [];
      for (let i = 0; i <= 10; i++) bone.push(at(th0 + ((thB - th0) * i) / 10));
      out.push(paint(tube(bone, 0.0055, 0.0055, 22, 5), B));
      if (thB < th1) {
        for (let i = 0; i <= 4; i++) cart.push(at(thB + ((th1 - thB) * i) / 4));
        if (k >= 7) cart.push([sx * 0.035, 0.105 + (9 - k) * 0.012, 0.16]); // 仮肋: 上の軟骨へ合流
        out.push(paint(tube(cart, 0.0048, 0.0042, 8, 5), COL.cart));
      }
    }
  }
  out.push(paint(ball([0, 0.185, 0.163], 1, [0.018, 0.085, 0.007], 10, [-0.12, 0, 0]), B)); // 胸骨
  out.push(paint(ball([0, 0.262, 0.148], 1, [0.028, 0.02, 0.008], 10), B)); // 胸骨柄
  for (const sx of [1, -1]) {
    out.push(paint(tube([[sx * 0.018, 0.27, 0.145], [sx * 0.07, 0.277, 0.125], [sx * 0.12, 0.28, 0.065], [sx * 0.165, 0.284, 0.01]], 0.0075, 0.0068, 14, 6), B)); // 鎖骨
    out.push(paint(plate([sx * 0.065, 0.268, -0.075], [sx * 0.09, 0.105, -0.078], [sx * 0.158, 0.232, -0.038], 0.006), B)); // 肩甲骨
    out.push(paint(tube([[sx * 0.07, 0.24, -0.085], [sx * 0.13, 0.26, -0.07], [sx * 0.17, 0.276, -0.02]], 0.006, 0.005, 10, 5), B)); // 肩甲棘
    out.push(paint(ball([sx * 0.17, 0.278, -0.008], 1, [0.016, 0.006, 0.014], 8), B)); // 肩峰
    out.push(paint(ball([sx * 0.152, 0.232, -0.028], 0.012, [0.6, 1, 1], 8), COL.cart)); // 関節窩
  }
  return merge(out);
}

export function lumbarGeo() { return merge(spineGeo("lumbar")); }

export function neckGeo() { return merge(spineGeo("neck")); }

export function skullGeo() {
  const out = [
    paint(ball([0, 0.072, -0.005], 1, [0.074, 0.083, 0.095], 22), B),
    paint(ball([0, 0.019, 0.056], 1, [0.052, 0.046, 0.046], 14), B),
    paint(tube([[-0.05, 0.012, 0.0], [-0.046, -0.033, 0.045], [0, -0.046, 0.088], [0.046, -0.033, 0.045], [0.05, 0.012, 0.0]], 0.009, 0.009, 22, 6), B), // 下あご
    paint(tube([[-0.035, -0.005, 0.068], [0, -0.011, 0.092], [0.035, -0.005, 0.068]], 0.0065, 0.0065, 10, 5), COL.tooth),
    paint(ball([0, 0.025, 0.097], 0.011, [0.7, 1.1, 0.35]), COL.dark),
  ];
  for (const sx of [1, -1]) {
    out.push(paint(ball([sx * 0.031, 0.051, 0.078], 0.018, [1, 0.9, 0.4]), COL.dark)); // 眼窩
    out.push(paint(rod([sx * 0.062, 0.035, 0.012], [sx * 0.046, 0.033, 0.066], 0.007, 0.008, 6), B)); // 頬骨
  }
  return merge(out);
}

export function pelvisGeo() {
  const bowl = new THREE.LatheGeometry([[0.055, -0.02], [0.075, 0.012], [0.105, 0.05], [0.13, 0.085], [0.14, 0.108], [0.13, 0.118]].map(([r, y]) => new THREE.Vector2(r, y)), 28, 55 * D2R, 250 * D2R);
  bowl.scale(1, 1, 0.72); bowl.translate(0, 0, -0.018);
  const out = [paint(bowl, B)];
  out.push(paint(ball([0, 0.04, -0.09], 1, [0.045, 0.062, 0.018], 12, [-0.45, 0, 0]), B)); // 仙骨
  out.push(paint(rod([0, -0.02, -0.105], [0, -0.05, -0.095], 0.01, 0.005, 6), B)); // 尾骨
  out.push(paint(rod([0.032, -0.042, 0.064], [-0.032, -0.042, 0.064], 0.011, 0.011, 8), B)); // 恥骨結合
  for (const sx of [1, -1]) {
    const ring = new THREE.TorusGeometry(0.027, 0.009, 6, 14);
    ring.applyMatrix4(new M4().compose(V(sx * 0.052, -0.055, 0.03), new Q().setFromEuler(new THREE.Euler(0, sx * 1.1, 0)), V(1, 1.2, 1)));
    out.push(paint(ring, B)); // 閉鎖孔のまわり（恥骨・坐骨）
    const cup = new THREE.TorusGeometry(0.026, 0.006, 6, 16);
    cup.applyMatrix4(new M4().compose(V(sx * 0.082, 0, 0.005), new Q().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), V(1, 1, 1)));
    out.push(paint(cup, COL.cart)); // 寛骨臼
    out.push(paint(ball([sx * 0.062, -0.082, -0.04], 0.016, [1, 1.2, 1]), B)); // 坐骨結節
    out.push(paint(ball([sx * 0.12, 0.08, 0.052], 0.009), B)); // 上前腸骨棘
  }
  return merge(out);
}

export function femurGeo(sx) {
  const m = (p) => mx(p, sx);
  return merge([
    paint(ball([0, 0, 0], 0.023, [1, 1, 1], 14), COL.cart),
    paint(rod([0, 0, 0], m([0.045, -0.035, 0]), 0.014, 0.015), B),
    paint(ball(m([0.058, -0.047, -0.008]), 0.017, [1, 1.3, 1]), B),
    paint(ball(m([0.015, -0.085, -0.016]), 0.008), B),
    paint(tube([m([0.046, -0.058, 0]), m([0.03, -0.2, 0.008]), m([0.012, -0.36, 0.0])], 0.0135, 0.014, 12, 8), B),
    paint(rod(m([0.012, -0.34, 0]), [0, -0.39, -0.004], 0.015, 0.036, 10), B),
    paint(ball(m([0.022, -0.408, -0.008]), 0.022, [1, 1, 1.2]), COL.cart),
    paint(ball(m([-0.022, -0.408, -0.008]), 0.023, [1, 1, 1.2]), COL.cart),
  ]);
}

export function patellaGeo() { return paint(ball([0, 0, 0], 0.022, [1, 1.1, 0.45], 12), B); }

export function shankGeo(sx) {
  const m = (p) => mx(p, sx);
  return merge([
    paint(ball([0, -0.02, -0.003], 1, [0.04, 0.02, 0.03], 14), B),
    paint(ball(m([0, -0.055, 0.026]), 0.011), B),
    paint(tube([[0, -0.03, 0], m([-0.004, -0.2, 0.004]), m([-0.006, -0.39, 0])], 0.017, 0.011, 12, 8), B),
    paint(ball(m([-0.004, -0.404, 0]), 1, [0.022, 0.016, 0.02]), B),
    paint(ball(m([-0.024, -0.415, 0.002]), 0.01), B),
    paint(rod(m([0.036, -0.045, -0.012]), m([0.032, -0.42, -0.014]), 0.006, 0.006, 6), B), // 腓骨
    paint(ball(m([0.036, -0.045, -0.012]), 0.01), B),
    paint(ball(m([0.031, -0.428, -0.012]), 0.011), B),
  ]);
}

export function footGeo(sx) {
  const m = (p) => mx(p, sx), out = [
    paint(ball([0, -0.008, 0.008], 1, [0.022, 0.017, 0.03]), COL.cart),
    paint(ball(m([0.004, -0.043, -0.03]), 1, [0.02, 0.024, 0.042], 12, [0.2, 0, 0]), B),
    paint(ball(m([-0.012, -0.03, 0.045]), 1, [0.016, 0.013, 0.01]), B),
    paint(ball(m([0.018, -0.048, 0.048]), 1, [0.014, 0.013, 0.018]), B),
    paint(ball(m([-0.008, -0.038, 0.07]), 1, [0.024, 0.012, 0.012]), B),
  ];
  const bx = [-0.017, -0.006, 0.004, 0.014, 0.024], hx = [-0.022, -0.007, 0.006, 0.018, 0.03], hz = [0.14, 0.146, 0.141, 0.134, 0.124];
  for (let i = 0; i < 5; i++) {
    out.push(paint(rod(m([bx[i], -0.045, 0.075]), m([hx[i], -0.064, hz[i]]), i ? 0.0045 : 0.008, i ? 0.004 : 0.007, 6), B));
    const tip = hz[i] + (i ? 0.036 - i * 0.003 : 0.048);
    out.push(paint(tube([m([hx[i], -0.064, hz[i]]), m([hx[i] - (i ? 0 : 0.002), -0.062, (hz[i] + tip) / 2]), m([hx[i] - (i ? 0 : 0.004), -0.067, tip])], i ? 0.0042 : 0.0065, i ? 0.0035 : 0.006, 6, 5), B));
  }
  return merge(out);
}

export function humerusGeo(sx) {
  const m = (p) => mx(p, sx);
  return merge([
    paint(ball(m([-0.006, 0, -0.004]), 0.024, [1, 1, 1], 14), COL.cart),
    paint(rod(m([0.004, -0.03, 0]), [0, -0.27, 0], 0.012, 0.011), B),
    paint(ball(m([0.01, -0.13, 0.003]), 0.006), B),
    paint(ball([0, -0.293, 0], 1, [0.03, 0.012, 0.014]), B),
    paint(ball(m([-0.03, -0.292, 0]), 0.008), B),
    paint(rod(m([-0.012, -0.3, 0]), m([0.014, -0.3, 0]), 0.011, 0.011, 10), COL.cart),
  ]);
}

export function forearmGeo(sx) {
  const m = (p) => mx(p, sx);
  return merge([
    paint(rod(m([-0.01, 0.02, -0.012]), m([-0.016, -0.24, 0]), 0.009, 0.005), B), // 尺骨
    paint(ball(m([-0.008, 0.02, -0.016]), 0.011), B),
    paint(rod(m([0.012, -0.008, 0.004]), m([0.018, -0.24, 0]), 0.0055, 0.01), B), // 橈骨
    paint(ball(m([0.012, -0.005, 0.004]), 0.009, [1, 0.6, 1]), COL.cart),
  ]);
}

export function handGeo(sx) {
  const m = (p) => mx(p, sx), out = [paint(ball([0, -0.016, 0], 1, [0.012, 0.014, 0.022]), B)];
  const zs = [0.014, 0.004, -0.006, -0.016];
  for (const z of zs) {
    out.push(paint(rod(m([0, -0.024, z * 0.8]), m([-0.004, -0.083, z]), 0.004, 0.0035, 5), B));
    out.push(paint(tube([m([-0.004, -0.085, z]), m([-0.012, -0.116, z]), m([-0.027, -0.13, z]), m([-0.041, -0.131, z])], 0.0036, 0.003, 8, 5), B));
  }
  out.push(paint(tube([m([0.004, -0.02, 0.018]), m([-0.004, -0.048, 0.035]), m([-0.018, -0.068, 0.041]), m([-0.03, -0.077, 0.039])], 0.0045, 0.0035, 8, 5), B));
  return merge(out);
}

// 関節の目印: 球関節（股・肩）は球、蝶番関節（膝・肘・足首）は軸の向きの円柱
export function jointGeo(type, r) {
  return type === "ball" ? new THREE.SphereGeometry(r, 14, 10) : rod([-r * 1.6, 0, 0], [r * 1.6, 0, 0], r * 0.75, r * 0.75, 14);
}

// ---------- ウェア ----------
export function clothGeo(bone, sx) {
  const m = (p) => mx(p, sx);
  switch (bone) {
    case "pelvis": return [[merge([ball([0, 0.03, -0.012], 1, [0.18, 0.125, 0.14], 18)]), "pants"]];
    case "lumbar": return [[merge([rod([0, -0.01, 0.02], [0, 0.19, 0.035], 0.15, 0.15, 18)].map((g) => g.scale(1, 1, 0.78) && g)), "jacket"]];
    case "thorax": {
      const t = lathe([[0.001, -0.02], [0.152, 0.0], [0.165, 0.1], [0.172, 0.2], [0.158, 0.265], [0.1, 0.305], [0.001, 0.31]], 22, [1, 1, 0.72], [0, 0, 0.045]);
      const parts = [t, ball([0.17, 0.235, -0.01], 0.064), ball([-0.17, 0.235, -0.01], 0.064)];
      return [[merge(parts), "jacket"], [merge([rod([0.001, 0.12, 0.172], [0.001, 0.3, 0.14], 0.012, 0.012, 6)]), "jacket2"]];
    }
    case "neck": return [[merge([rod([0, -0.01, 0.01], [0, 0.1, 0.03], 0.058, 0.052, 14)]), "jacket2"]];
    case "head": {
      const helmet = new THREE.SphereGeometry(0.122, 24, 14, 0, Math.PI * 2, 0, 0.56 * Math.PI);
      helmet.applyMatrix4(new M4().compose(V(0, 0.058, 0.0), new Q(), V(0.95, 1, 1.07)));
      const lens = new THREE.SphereGeometry(0.108, 24, 6, Math.PI * 0.16, Math.PI * 0.68, 0.4 * Math.PI, 0.2 * Math.PI);
      lens.applyMatrix4(new M4().compose(V(0, 0.052, 0.022), new Q().setFromEuler(new THREE.Euler(0, Math.PI, 0)), V(1, 1, 1.05)));
      const band = new THREE.CylinderGeometry(0.117, 0.117, 0.036, 24, 1, true);
      band.applyMatrix4(new M4().compose(V(0, 0.056, 0.0), new Q(), V(0.96, 1, 1.09)));
      const hood = ball([0, 0.0, -0.03], 1, [0.074, 0.075, 0.07], 14); // 後頭部〜首はネックウォーマー
      return [[merge([ball([0, 0.043, 0.03], 1, [0.074, 0.11, 0.094], 18)]), "skin"], [merge([hood]), "jacket2"], [merge([helmet]), "helmet"], [merge([band]), "strap"], [merge([lens]), "lens"]];
    }
    case "uarm": return [[merge([rod([0, 0.01, 0], [0, -0.3, 0], 0.058, 0.05, 12), ball([0, -0.3, 0], 0.05)]), "jacket"]];
    case "farm": return [[merge([rod([0, 0, 0], [0, -0.23, 0], 0.05, 0.048, 12), rod([0, -0.19, 0], [0, -0.25, 0], 0.052, 0.052, 12)]), "jacket"]];
    case "hand": return [[merge([ball([0, -0.07, 0.004], 1, [0.03, 0.06, 0.042], 12), ball(m([-0.01, -0.06, 0.035]), 0.016, [1, 1.6, 1])]), "glove"]];
    case "thigh": return [[merge([rod([0, 0.04, -0.005], [0, -0.425, 0], 0.092, 0.072, 14), ball([0, -0.425, 0.004], 0.072, [1, 1, 1.05], 14)]), "pants"]];
    case "shank": return [[merge([rod([0, 0, 0], [0, -0.24, 0], 0.074, 0.08, 14)]), "pants"], [merge([rod([0, -0.43, -0.005], [0, -0.2, -0.005], 0.061, 0.066, 16), rod([0, -0.215, -0.005], [0, -0.195, -0.005], 0.068, 0.068, 16)]), "boot"]];
    case "foot": return [[merge([
      ball([0, -0.03, 0.07], 1, [0.053, 0.055, 0.12], 16), ball([0, -0.05, 0.168], 1, [0.051, 0.036, 0.062], 14),
      rod([0, -0.085, -0.03], [0, 0.02, -0.02], 0.056, 0.058, 16),
    ]), "boot"], [merge([rod([0, -0.097, 0.0725], [0, -0.071, 0.0725], 0.001, 0.001, 4), new THREE.BoxGeometry(0.108, 0.026, 0.305).translate(0, -0.084, 0.0725)]), "sole"]];
  }
  return [];
}
