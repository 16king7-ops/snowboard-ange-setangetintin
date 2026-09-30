// sim-body.js — 人体モデル。骨ごとに「位置と向き」を解き、骨格・関節・筋肉・ウェアを置く。
// 姿勢の解き方: 足はバインディングに固定。骨盤の位置を動かして「重心が、エッジの接点から雪が押し返す力の向きに伸ばした線の上」に来るようにする。
// 膝は2本の骨の長さから決める（逆運動学）。そのあと床反力から各関節のモーメントを出し、筋肉の使われ方を推定する。
import * as THREE from "./vendor/three.module.min.js";
import * as G from "./sim-geo.js";
import { createMuscles } from "./sim-muscles.js";

const { V, D2R } = G;
const Q = THREE.Quaternion;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 身長173cmのときの骨の長さと付け根（m）
const OFF = {
  lumbar: V(0, 0.07, -0.04), thorax: V(0, 0.17, 0), neck: V(0, 0.3, -0.02), head: V(0, 0.12, 0.03),
  shoulder: V(0.18, 0.235, -0.01), hip: 0.088, thigh: 0.425, shank: 0.42, uarm: 0.3, farm: 0.25,
};
// 体の各部の質量比と重心の位置（de Leva 1996 を元に簡略化）
const SEG = [
  ["pelvis", 0.1117, [0, 0.04, 0]], ["lumbar", 0.1633, [0, 0.08, 0.05]], ["thorax", 0.1596, [0, 0.15, 0.06]], ["head", 0.0694, [0, 0.08, 0.02]],
  ["uarmL", 0.0271, [0, -0.17, 0]], ["farmL", 0.0162, [0, -0.11, 0]], ["handL", 0.0061, [0, -0.07, 0]],
  ["uarmR", 0.0271, [0, -0.17, 0]], ["farmR", 0.0162, [0, -0.11, 0]], ["handR", 0.0061, [0, -0.07, 0]],
  ["thighL", 0.1416, [0, -0.175, 0]], ["shankL", 0.0433, [0, -0.187, 0]], ["footL", 0.0137, [0, -0.04, 0.05]],
  ["thighR", 0.1416, [0, -0.175, 0]], ["shankR", 0.0433, [0, -0.187, 0]], ["footR", 0.0137, [0, -0.04, 0.05]],
].map(([b, f, c]) => ({ b, f, c: V(...c) }));
const UPPER = new Set(["lumbar", "thorax", "head", "uarmL", "farmL", "handL", "uarmR", "farmR", "handR"]);
export const BONES = ["pelvis", "lumbar", "thorax", "neck", "head", "uarmL", "farmL", "handL", "uarmR", "farmR", "handR", "thighL", "shankL", "footL", "thighR", "shankR", "footR"];

// 滑走面からくるぶし（足首の関節）まで: 板12mm + バインディング18mm + ソール27mm + 足首の高さ70mm×身長比
const ankleUp = (k) => 0.057 + 0.07 * k;
export const BOOT_FWD = 0.0725; // ブーツの中心は足首の関節よりつま先側

function basis(y, zHint) {
  const Y = y.clone().normalize(), X = V().crossVectors(Y, zHint).normalize(), Z = V().crossVectors(X, Y);
  return new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}
const rq = (x, y, z, order = "XYZ") => new Q().setFromEuler(new THREE.Euler(x * D2R, y * D2R, z * D2R, order));
const ax = (q, x, y, z) => V(x, y, z).applyQuaternion(q);

export function createRider({ heightCm = 173, massKg = 62 } = {}) {
  const k = heightCm / 173, mass = massKg, Lleg = (OFF.thigh + OFF.shank) * k;
  const root = new THREE.Group();
  const bone = {};
  for (const b of BONES) { const g = new THREE.Group(); g.scale.setScalar(k); root.add(g); bone[b] = g; }

  // ---- 見た目 ----
  const boneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
  const layers = { skel: [], joint: [], cloth: [] };
  const add = (b, geo, mat, layer) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; bone[b].add(m); layers[layer].push(m); return m; };
  add("pelvis", G.pelvisGeo(), boneMat, "skel");
  add("lumbar", G.lumbarGeo(), boneMat, "skel");
  add("thorax", G.thoraxGeo(), boneMat, "skel");
  add("neck", G.neckGeo(), boneMat, "skel");
  add("head", G.skullGeo(), boneMat, "skel");
  for (const [s, sx] of [["L", 1], ["R", -1]]) {
    add("thigh" + s, G.femurGeo(sx), boneMat, "skel");
    add("shank" + s, G.shankGeo(sx), boneMat, "skel");
    add("foot" + s, G.footGeo(sx), boneMat, "skel");
    add("uarm" + s, G.humerusGeo(sx), boneMat, "skel");
    add("farm" + s, G.forearmGeo(sx), boneMat, "skel");
    add("hand" + s, G.handGeo(sx), boneMat, "skel");
  }
  const patella = {};
  for (const s of ["L", "R"]) { patella[s] = new THREE.Mesh(G.patellaGeo(), boneMat); patella[s].scale.setScalar(k); root.add(patella[s]); layers.skel.push(patella[s]); }

  const ballMat = new THREE.MeshStandardMaterial({ color: 0x2bb3c9, roughness: 0.35, emissive: 0x0b3a44 });
  const hingeMat = new THREE.MeshStandardMaterial({ color: 0xf2a33a, roughness: 0.35, emissive: 0x4a2a05 });
  const J = [["thighL", "ball", 0.03], ["thighR", "ball", 0.03], ["shankL", "hinge", 0.022], ["shankR", "hinge", 0.022], ["footL", "hinge", 0.018], ["footR", "hinge", 0.018],
    ["uarmL", "ball", 0.027], ["uarmR", "ball", 0.027], ["farmL", "hinge", 0.017], ["farmR", "hinge", 0.017], ["handL", "ball", 0.014], ["handR", "ball", 0.014],
    ["lumbar", "ball", 0.02], ["thorax", "ball", 0.02], ["neck", "ball", 0.017], ["head", "ball", 0.017]];
  for (const [b, t, r] of J) add(b, G.jointGeo(t, r), t === "ball" ? ballMat : hingeMat, "joint");

  const clothMats = {};
  for (const [name, hex, extra] of [["jacket", G.COL.jacket], ["jacket2", G.COL.jacket2], ["pants", G.COL.pants], ["boot", G.COL.boot], ["sole", G.COL.sole],
    ["helmet", G.COL.helmet], ["lens", G.COL.lens, { metalness: 0.7, roughness: 0.15 }], ["strap", G.COL.strapG], ["skin", G.COL.skin], ["glove", G.COL.glove]]) {
    clothMats[name] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, ...extra });
  }
  for (const b of BONES) {
    const base = b.replace(/[LR]$/, ""), sx = b.endsWith("R") ? -1 : 1;
    for (const [geo, mat] of G.clothGeo(base, sx)) add(b, geo, clothMats[mat], "cloth");
  }
  const muscles = createMuscles(k);
  root.add(muscles.mesh);

  // ---- 姿勢を解く ----
  // st: { bq, bp（板の向き・中心）, sh（板の形）, s（サンプル）, n（支える力の向き）, C（圧の中心）, F（雪が押す力 N）, air, up（真上）, look }
  function pose(st) {
    const { bq, bp, sh, s, n, C } = st;
    const Xb = ax(bq, 1, 0, 0), Yb = ax(bq, 0, 1, 0), Zb = ax(bq, 0, 0, 1);
    const feet = { L: { x: sh.stance.xF, ang: sh.stance.angF }, R: { x: sh.stance.xR, ang: sh.stance.angR } };
    const F = {};
    // 足（ブーツ）は板に固定
    for (const side of ["L", "R"]) {
      const f = feet[side], a = f.ang * D2R;
      const toe = Zb.clone().multiplyScalar(Math.cos(a)).addScaledVector(Xb, Math.sin(a));
      const q = basis(Yb, toe);
      const p = V(f.x, sh.yAt(f.x, s.bend, s.press), 0).applyQuaternion(bq).add(bp).addScaledVector(Yb, ankleUp(k)).addScaledVector(toe, -BOOT_FWD * k);
      F["foot" + side] = { p, q, toe };
    }
    // 骨盤の向き: 支える力の向きを「上」、つま先側（前後の足の角度の平均の6割 + ひねり）を「前」
    const face = ((feet.L.ang + feet.R.ang) / 2 * 0.6 + s.pyaw) * D2R;
    const Zf = Zb.clone().multiplyScalar(Math.cos(face)).addScaledVector(Xb, Math.sin(face));
    const Y0 = n.clone(), Z0 = Zf.addScaledVector(Y0, -Zf.dot(Y0)).normalize(), X0 = V().crossVectors(Y0, Z0);
    const q0 = new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X0, Y0, Z0));
    q0.premultiply(new Q().setFromAxisAngle(X0, s.lean * 0.6 * D2R));
    const Zp = ax(q0, 0, 0, 1);
    // 骨盤の左右の傾き（roll）は、前後の膝の曲がりがだいたいそろうように自動で決める（後ろ膝が少し深い）。背骨で打ち消して上半身は傾けない
    let auto = 0, qp = q0;
    let P = C.clone().addScaledVector(n, 0.82 * k), res = null;
    for (let it = 0; it < 12; it++) {
      qp = new Q().setFromAxisAngle(Zp, (s.roll * D2R) + auto).multiply(q0);
      res = fk(P, qp, s, F, st, Xb, Zb, auto);
      auto = clamp(auto - 0.6 * ((res.rL - res.rR) - 0.02) * Lleg / (0.16 * k), -0.4, 0.4);
      const e = res.com.clone().sub(C);
      const lat = e.addScaledVector(n, -e.dot(n));
      P.addScaledVector(lat, -1 / 0.85);
      const { rL, rR } = res, avg = (rL + rR) / 2, mx = Math.max(rL, rR);
      let tgt = s.ext;
      if (mx - avg > 0.985 - tgt) tgt = 0.985 - (mx - avg);
      P.addScaledVector(n, (tgt - avg) * Lleg * 0.9);
    }
    qp = new Q().setFromAxisAngle(Zp, (s.roll * D2R) + auto).multiply(q0);
    res = fk(P, qp, s, F, st, Xb, Zb, auto);
    res.P = P; res.hipRoll = auto / D2R;
    moments(res, st, feet, Xb, Zb);
    return res;
  }

  function fk(P, qp, s, Ffeet, st, Xb, Zb, auto = 0) {
    const F = { ...Ffeet };
    F.pelvis = { p: P.clone(), q: qp };
    const ql = qp.clone().multiply(new Q().setFromAxisAngle(V(0, 0, 1), -auto)).multiply(rq(s.lean * 0.25, s.twist * 0.35, -s.sbend * 0.5));
    F.lumbar = { p: ax(qp, 0, OFF.lumbar.y * k, OFF.lumbar.z * k).add(P), q: ql };
    const qt = ql.clone().multiply(rq(s.lean * 0.15, s.twist * 0.65, -s.sbend * 0.5));
    F.thorax = { p: ax(ql, 0, OFF.thorax.y * k, 0).add(F.lumbar.p), q: qt };
    // 頭: 見る方向を向き、傾きは水平線に近づける（体幹ほど傾けない）
    F.neck = { p: ax(qt, 0, OFF.neck.y * k, OFF.neck.z * k).add(F.thorax.p) };
    const up = V(0, 1, 0).applyQuaternion(qt).multiplyScalar(0.35).addScaledVector(st.up, 0.65).normalize();
    let look = st.look.clone();
    const tFwd = ax(qt, 0, 0, 1), side = ax(qt, 1, 0, 0);
    const yaw = Math.atan2(look.dot(side), look.dot(tFwd));
    if (Math.abs(yaw) > 1.55) look = tFwd.clone().multiplyScalar(Math.cos(1.55)).addScaledVector(side, Math.sign(yaw) * Math.sin(1.55));
    const qh = basis(up.clone().addScaledVector(look, -up.dot(look)), look);
    const qn = qt.clone().slerp(qh, 0.45);
    F.neck.q = qn;
    F.head = { p: ax(qn, 0, OFF.head.y * k, OFF.head.z * k).add(F.neck.p), q: qh };
    // 腕: [前に上げる, 横に開く, 肘]（度）
    for (const [side2, sx, arm] of [["L", 1, [s.aLf, s.aLa, s.aLe]], ["R", -1, [s.aRf, s.aRa, s.aRe]]]) {
      const qa = qt.clone().multiply(rq(-arm[0], 0, sx * arm[1], "XZY"));
      const sh = ax(qt, sx * OFF.shoulder.x * k, OFF.shoulder.y * k, OFF.shoulder.z * k).add(F.thorax.p);
      F["uarm" + side2] = { p: sh, q: qa };
      const qf = qa.clone().multiply(rq(-arm[2], 0, 0));
      F["farm" + side2] = { p: ax(qa, 0, -OFF.uarm * k, 0).add(sh), q: qf };
      F["hand" + side2] = { p: ax(qf, 0, -OFF.farm * k, 0).add(F["farm" + side2].p), q: qf.clone().multiply(rq(-10, 0, 0)) };
    }
    // 脚: 股関節と足首の距離から膝を決める。膝の向き＝足のつま先の方向（＋つま先側へ押す量・内へ入れる量）
    const L1 = OFF.thigh * k, L2 = OFF.shank * k, r = {};
    for (const [side2, sx] of [["L", 1], ["R", -1]]) {
      const H = ax(qp, sx * OFF.hip * k, 0, 0).add(P), A = F["foot" + side2].p;
      const pole = F["foot" + side2].toe.clone().addScaledVector(Zb, s.kneeDrive).addScaledVector(Xb, (side2 === "L" ? -1 : 1) * s.kneeIn);
      const d = A.clone().sub(H), len = d.length(), u = d.clone().divideScalar(len);
      const lc = clamp(len, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-4);
      const a = (L1 * L1 - L2 * L2 + lc * lc) / (2 * lc), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const pp = pole.addScaledVector(u, -pole.dot(u)).normalize();
      const K = H.clone().addScaledVector(u, a).addScaledVector(pp, h);
      F["thigh" + side2] = { p: H, q: basis(H.clone().sub(K), pp) };
      F["shank" + side2] = { p: K, q: basis(K.clone().sub(A), pp) };
      r["r" + side2] = len / (L1 + L2);
    }
    // 重心
    const com = V();
    for (const g of SEG) com.addScaledVector(ax(F[g.b].q, g.c.x * k, g.c.y * k, g.c.z * k).add(F[g.b].p), g.f);
    return { F, com, ...r };
  }

  // 関節のモーメント（床反力 × 腕の長さ）→ 筋肉の使われ方（0〜1）の推定
  function moments(res, st, feet, Xb, Zb) {
    const { F } = res, s = st.s, Ft = st.F, gN = mass * 9.81;
    const cx = s.cx, xF = feet.L.x, xR = feet.R.x;
    const wF = st.air ? 0 : clamp((cx - xR) / (xF - xR), 0, 1);
    const share = { L: wF, R: 1 - wF };
    // 板の上の圧の中心 → 各足の中の圧の中心（ブーツの中心から、板に沿った向きでずらす）
    // 板の圧の中心がエッジにあっても、ブーツとバインディングがねじりを伝えるので、足の中の圧の中心は少し寄るだけ
    // （目安: トゥ側で前足部に60〜75%、ヒール側でかかとに55〜70%）
    const hwC = st.sh.hw(cx), side = clamp(s.edge / (10 * D2R), -1, 1);
    const lean = Math.abs(side) > 0.01 ? side : clamp(s.cz / Math.max(0.01, hwC), -1, 1);
    const dz = lean > 0 ? 0.032 * lean : 0.04 * lean;
    const mid = (xF + xR) / 2, sN = clamp((cx - mid) / ((xF - xR) / 2), -1.6, 1.6);
    const act = {}, foot = {}, ang = {};
    for (const sd of ["L", "R"]) {
      const f = feet[sd], a = f.ang * D2R;
      let dx = 0.03 * sN;
      if (sd === "R" && cx < xR) dx -= Math.min(0.03, (xR - cx) * 0.15);
      if (sd === "L" && cx > xF) dx += Math.min(0.03, (cx - xF) * 0.15);
      const zL = clamp(dz * Math.cos(a) + dx * Math.sin(a), -0.13, 0.13), xL = clamp(dx * Math.cos(a) - dz * Math.sin(a), -0.045, 0.045);
      const fr = F["foot" + sd], P = ax(fr.q, xL * k, -0.097 * k, (BOOT_FWD + zL) * k).add(fr.p);
      const Fi = Ft.clone().multiplyScalar(share[sd]);
      foot[sd] = { share: share[sd], load: Fi.length() / gN, u: zL, v: xL, P };
      const K = F["shank" + sd].p, H = F["thigh" + sd].p, A = fr.p;
      const Mk = P.clone().sub(K).cross(Fi), Mh = P.clone().sub(H).cross(Fi), Ma = P.clone().sub(A).cross(Fi);
      const kx = Mk.dot(ax(F["thigh" + sd].q, 1, 0, 0)), hx = Mh.dot(ax(F.pelvis.q, 1, 0, 0)), hz = Mh.dot(ax(F.pelvis.q, 0, 0, 1)), axx = Ma.dot(ax(fr.q, 1, 0, 0));
      const sx = sd === "L" ? 1 : -1, ref = mass * 1.1;
      act["quad" + sd] = Math.max(0, kx) / ref;
      act["glute" + sd] = Math.max(0, -hx) / ref;
      act["ham" + sd] = Math.max(0, -kx) / ref * 0.6 + act["glute" + sd] * 0.5;
      act["flex" + sd] = Math.max(0, hx) / ref;
      act["gmed" + sd] = Math.max(0, -sx * hz) / (mass * 0.9);
      act["add" + sd] = Math.max(0, sx * hz) / (mass * 0.9);
      // 足首はブーツとハイバックが大半を受け持つので、計算値の4割
      act["calf" + sd] = Math.max(0, -axx) / mass * 0.4;
      act["tib" + sd] = Math.max(0, axx) / mass * 0.4;
      act["peron" + sd] = act["calf" + sd] * 0.6 + Math.abs(xL) * 4;
      // 角度
      const th = H.clone().sub(K).normalize(), shv = A.clone().sub(K).normalize();
      ang["knee" + sd] = 180 - Math.acos(clamp(th.dot(shv), -1, 1)) / D2R;
      const pq = F.pelvis.q, dn = K.clone().sub(H).normalize();
      ang["hip" + sd] = Math.atan2(dn.dot(ax(pq, 0, 0, 1)), -dn.dot(ax(pq, 0, 1, 0))) / D2R;
      const su = K.clone().sub(A).normalize();
      ang["ankle" + sd] = Math.atan2(su.dot(ax(fr.q, 0, 0, 1)), su.dot(ax(fr.q, 0, 1, 0))) / D2R;
    }
    // 体幹: 上半身の重さ（と慣性）が腰（L5）にかけるモーメント
    const L5 = F.lumbar.p, geff = Ft.clone().multiplyScalar(-1 / mass), Mt = V();
    for (const g of SEG) if (UPPER.has(g.b)) {
      const r = ax(F[g.b].q, g.c.x * k, g.c.y * k, g.c.z * k).add(F[g.b].p).sub(L5);
      Mt.add(r.cross(geff.clone().multiplyScalar(g.f * mass)));
    }
    const tx = Mt.dot(ax(F.pelvis.q, 1, 0, 0)), tz = Mt.dot(ax(F.pelvis.q, 0, 0, 1)), tr = mass * 0.8;
    act.erec = Math.max(0, tx) / tr + 0.08;
    act.abs = Math.max(0, -tx) / tr + 0.05;
    act.oblL = Math.max(0, -tz) / tr + Math.abs(s.twist) / 90 + 0.05;
    act.oblR = Math.max(0, tz) / tr + Math.abs(s.twist) / 90 + 0.05;
    if (st.air) { act.flexL = act.flexR = 0.5 * s.tuck; act.abs += 0.4 * s.tuck; }
    // 腕: 重さを支える分（空中では重さがなくなる）
    const gf = Ft.length() / gN || 0;
    for (const sd of ["L", "R"]) {
      const d = ax(F["uarm" + sd].q, 0, -1, 0), down = ax(F.thorax.q, 0, -1, 0);
      const elev = Math.acos(clamp(d.dot(down), -1, 1));
      act["delt" + sd] = 0.08 + 0.55 * Math.sin(elev) * gf;
      act["trap" + sd] = 0.12 + 0.3 * Math.sin(elev) * gf;
      act["bic" + sd] = 0.06 + 0.25 * Math.sin((s["a" + sd + "e"] || 0) * D2R) * gf;
      act["tri" + sd] = 0.06; act["lat" + sd] = 0.1; act["pec" + sd] = 0.1; act["fore" + sd] = 0.14; act["neck" + sd] = 0.15;
    }
    for (const key of Object.keys(act)) act[key] = clamp(act[key] + 0.04, 0, 1);
    // 見せる角度
    ang.twist = Math.atan2(ax(F.thorax.q, 0, 0, 1).dot(Xb), ax(F.thorax.q, 0, 0, 1).dot(Zb)) / D2R;
    ang.comH = res.com.clone().sub(st.bp).dot(ax(st.bq, 0, 1, 0));
    Object.assign(res, { act, foot, ang });
  }

  // 解いた姿勢を画面の骨に反映する
  const PAT = V(0, 0.045, 0), tq = new Q();
  function apply(res, withMuscles = true) {
    for (const b of BONES) { bone[b].position.copy(res.F[b].p); bone[b].quaternion.copy(res.F[b].q); }
    for (const s of ["L", "R"]) {
      tq.copy(res.F["thigh" + s].q).slerp(res.F["shank" + s].q, 0.5);
      patella[s].quaternion.copy(tq);
      patella[s].position.copy(PAT).multiplyScalar(k).applyQuaternion(tq).add(res.F["shank" + s].p);
    }
    if (withMuscles && muscles.mesh.visible) muscles.update(res.F, res.act);
  }

  // 立った姿勢で筋肉の基準の長さを測る
  {
    const F = {}, I = new Q(), p = (x, y, z) => V(x, y, z).multiplyScalar(k);
    F.pelvis = { p: p(0, 0.915, 0), q: I }; F.lumbar = { p: p(0, 0.985, -0.04), q: I }; F.thorax = { p: p(0, 1.155, -0.04), q: I };
    F.neck = { p: p(0, 1.455, -0.06), q: I }; F.head = { p: p(0, 1.575, -0.03), q: I };
    for (const [s, sx] of [["L", 1], ["R", -1]]) {
      F["thigh" + s] = { p: p(sx * 0.088, 0.915, 0), q: I }; F["shank" + s] = { p: p(sx * 0.088, 0.49, 0), q: I }; F["foot" + s] = { p: p(sx * 0.088, 0.07, 0), q: I };
      F["uarm" + s] = { p: p(sx * 0.18, 1.39, -0.05), q: I }; F["farm" + s] = { p: p(sx * 0.18, 1.09, -0.05), q: I }; F["hand" + s] = { p: p(sx * 0.18, 0.84, -0.05), q: I };
    }
    muscles.update(F, {}, true);
  }

  // 表示の切り替え: mode = "wear" | "muscle" | "skeleton" | "xray"
  function setMode(mode, showJoints) {
    const cloth = mode === "wear" || mode === "xray";
    for (const m of layers.cloth) m.visible = cloth;
    for (const m of layers.skel) m.visible = mode !== "wear";
    muscles.mesh.visible = mode === "muscle" || mode === "xray";
    for (const m of layers.joint) m.visible = showJoints;
    for (const mat of Object.values(clothMats)) {
      if (mat.transparent !== (mode === "xray")) mat.needsUpdate = true; // 透明の切り替えはシェーダーの作り直しが要る
      mat.transparent = mode === "xray"; mat.opacity = mode === "xray" ? 0.22 : 1; mat.depthWrite = mode !== "xray";
    }
  }

  return { root, bone, pose, apply, setMode, k, mass, muscles };
}
