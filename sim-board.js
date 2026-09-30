// sim-board.js — ボードの形（サイドカット・先端のロッカー・たわみ）とバインディング。
// 板の座標: +x=ノーズ、+y=板の上（滑走面が y=0）、+z=つま先側。長さは m。
import * as THREE from "./vendor/three.module.min.js";
import { V, D2R, rod, tube, merge, paint } from "./sim-geo.js";

// spec は setup の板データ（mm）。stance = { xF, xR, angF, angR }（m・度）
export function boardShape(spec, stance) {
  const L = spec.totalLength / 1000, he = spec.effectiveEdge / 2000, W = spec.waistWidth / 1000, R = spec.sidecutRadius / 1000;
  const half = L / 2, tipRise = 0.06, sag = (x) => R - Math.sqrt(R * R - x * x), wc = W / 2 + sag(he);
  // 半幅: 有効エッジ内はサイドカットの円弧、先端は丸く絞る
  const hw = (x) => {
    const a = Math.abs(x);
    if (a <= he) return W / 2 + sag(a);
    const u = Math.min(1, (a - he) / (half - he));
    return wc * Math.sqrt(Math.max(0, 1 - u ** 2.4));
  };
  const kick = (x) => { const a = Math.abs(x); return a <= he ? 0 : tipRise * ((a - he) / (half - he)) ** 2; };
  const soft = (d, w) => (d <= 0 ? 0 : d < w ? (d * d) / (2 * w) : d - w / 2);
  // 滑走面の高さ。bend=カービングのたわみ（中央が雪側へ, m）、press=プレス（+テール/−ノーズ, rad）
  const yAt = (x, bend = 0, press = 0) => {
    let y = kick(x);
    if (bend && Math.abs(x) < he) y -= bend * (1 - (x / he) ** 2);
    if (press > 0) y += Math.tan(press) * soft(stance.xR - x, 0.12);
    if (press < 0) y += Math.tan(-press) * soft(x - stance.xF, 0.12);
    return y;
  };
  // カービングで滑走面をエッジの円弧に沿わせるのに要るたわみ（setup と同じ式: sag × tan(エッジ角)）
  const carveBend = (edge) => sag(he) * Math.tan(Math.min(Math.abs(edge), 70 * D2R));
  return { L, half, he, W, wc, R, hw, yAt, carveBend, sag, stance, thick: (x) => 0.005 + 0.007 * Math.max(0, 1 - (Math.abs(x) / half) ** 3) };
}

// ねじれの角度（rad）: 前足の位置で +tors°、後足の位置で −tors°、その間は直線、外側は一定
export const twistAt = (sh, x, tors = 0) => (tors ? tors * D2R * Math.max(-1, Math.min(1, x / sh.stance.xF)) : 0);

// 板のいちばん低い点が雪面（または空中の高さ）に来るように、中心の高さを求める
const probe = [];
for (let i = 0; i <= 24; i++) probe.push(-1 + i / 12);
export function boardLift(sh, q, s) {
  let low = Infinity;
  const p = V();
  for (const u of probe) {
    const x = u * sh.half * 0.985, y = sh.yAt(x, s.bend, s.press), w = sh.hw(x);
    for (const z of [w, -w]) { p.set(x, y, z).applyQuaternion(q); if (p.y < low) low = p.y; }
  }
  return -low;
}

function topTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#e9e4d6"; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#23404a"; g.fillRect(0, 0, 1024, 256);
  const grd = g.createLinearGradient(0, 0, 1024, 0);
  grd.addColorStop(0, "#c65d2e"); grd.addColorStop(0.5, "#e0a64a"); grd.addColorStop(1, "#c65d2e");
  g.fillStyle = grd; g.fillRect(0, 100, 1024, 56);
  g.strokeStyle = "rgba(240,236,224,.85)"; g.lineWidth = 3;
  for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(0, 30 + i * 32); g.bezierCurveTo(300, 10 + i * 30, 700, 60 + i * 28, 1024, 30 + i * 32); g.globalAlpha = 0.18; g.stroke(); }
  g.globalAlpha = 1; g.fillStyle = "#f0ece0"; g.font = "bold 44px sans-serif"; g.textAlign = "center"; g.fillText("155", 512, 142);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ボードの見た目。update(s) で毎フレームたわみを反映する
export function createBoard(sh) {
  const xs = [];
  for (let i = 0; i <= 100; i++) { const u = -1 + i / 50; xs.push(Math.sign(u) * Math.abs(u) ** 0.9 * sh.half); }
  const n = xs.length, pos = new Float32Array(n * 8 * 3), uv = new Float32Array(n * 8 * 2), idx = [];
  // 1断面あたり8頂点: 上面(つま先,かかと) 滑走面(つま先,かかと) つま先側面(上,下) かかと側面(上,下)
  for (let i = 0; i < n; i++) for (let k = 0; k < 8; k++) { uv[(i * 8 + k) * 2] = (xs[i] + sh.half) / sh.L; uv[(i * 8 + k) * 2 + 1] = k % 2 ? 1 : 0; }
  const groups = [[0, 1], [2, 3], [4, 5], [6, 7]];
  for (const [gi, [a, b]] of groups.entries()) {
    for (let i = 0; i < n - 1; i++) {
      const p = i * 8, q = (i + 1) * 8;
      idx.push(p + a, q + a, p + b, q + a, q + b, p + b);
    }
    void gi;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const per = (n - 1) * 6;
  geo.setIndex(idx);
  geo.addGroup(0, per, 0); geo.addGroup(per, per, 1); geo.addGroup(per * 2, per * 2, 2);
  const mats = [
    new THREE.MeshStandardMaterial({ map: topTexture(), roughness: 0.45, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }),
  ];
  const mesh = new THREE.Mesh(geo, mats);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);

  // バインディング（板の上、足の角度で回す）。+z=つま先、+x=ノーズ側
  const bmat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6, vertexColors: true, side: THREE.DoubleSide });
  const bindings = [];
  for (const [x, ang] of [[sh.stance.xF, sh.stance.angF], [sh.stance.xR, sh.stance.angR]]) {
    const hb = new THREE.CylinderGeometry(0.068, 0.07, 0.2, 18, 1, true, Math.PI / 2 + 0.25, Math.PI - 0.5);
    hb.applyMatrix4(new THREE.Matrix4().compose(V(0, 0.135, -0.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(14 * D2R, 0, 0)), V(1, 1, 1)));
    const cup = new THREE.CylinderGeometry(0.066, 0.066, 0.05, 18, 1, true, Math.PI / 2, Math.PI);
    cup.translate(0, 0.045, -0.088);
    const base = new THREE.BoxGeometry(0.12, 0.014, 0.25).translate(0, 0.019, 0.0);
    const g = merge([
      paint(base, 0x2a2d31), paint(rod([0, 0.026, 0], [0, 0.031, 0], 0.06, 0.06, 20), 0x55595e), paint(hb, 0x2a2d31), paint(cup, 0x2a2d31),
      paint(tube([[-0.058, 0.05, -0.035], [-0.046, 0.13, -0.012], [0, 0.155, 0.0], [0.046, 0.13, -0.012], [0.058, 0.05, -0.035]], 0.014, 0.014, 18, 6), 0x3a3e44),
      paint(tube([[-0.052, 0.04, 0.1], [0, 0.085, 0.13], [0.052, 0.04, 0.1]], 0.008, 0.008, 12, 5), 0x3a3e44),
    ]);
    const b = new THREE.Mesh(g, bmat);
    b.castShadow = true;
    b.rotation.y = ang * D2R;
    b.userData.x = x; b.userData.ang = ang * D2R;
    group.add(b);
    bindings.push(b);
  }

  function update(s) {
    for (let i = 0; i < n; i++) {
      const x = xs[i], y = sh.yAt(x, s.bend, s.press), w = sh.hw(x), t = sh.thick(x), o = i * 24;
      // ねじれ: 板の長さ方向の軸まわりに回す（前足の位置で +tors°）
      const a = twistAt(sh, x, s.tors), ca = Math.cos(a), sa = Math.sin(a);
      const set = (k, px, py, pz) => { pos[o + k * 3] = px; pos[o + k * 3 + 1] = py * ca - pz * sa; pos[o + k * 3 + 2] = py * sa + pz * ca; };
      set(0, x, y + t, w); set(1, x, y + t, -w);
      set(2, x, y, -w); set(3, x, y, w);
      set(4, x, y + t, w); set(5, x, y, w);
      set(6, x, y, -w); set(7, x, y + t, -w);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    for (const b of bindings) {
      const x = b.userData.x, a = twistAt(sh, x, s.tors), y = sh.yAt(x, s.bend, s.press) + sh.thick(x);
      b.position.set(x, y * Math.cos(a), y * Math.sin(a));
      b.rotation.set(a, b.userData.ang, 0, "XYZ");
    }
  }
  update({ bend: 0, press: 0 });
  return { group, update, mats };
}
