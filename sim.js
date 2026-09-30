// sim.js — 3Dシミュレーターの本体。シーンを組み、動きを再生し、足裏・数値・場面の説明を更新する。
import * as THREE from "./vendor/three.module.min.js";
import { V, D2R } from "./sim-geo.js";
import { createRider } from "./sim-body.js";
import { boardShape, boardLift, createBoard } from "./sim-board.js";
import { MOTIONS, MISTAKES, finalize, sampleAt } from "./sim-motion.js";
import { createWorld, createTrail, createSpray } from "./sim-world.js";
import { createSoles, readouts, RAMP_CSS } from "./sim-hud.js";
import { ACT_STOPS } from "./sim-muscles.js";

const $ = (id) => document.getElementById(id);
const G = 9.81;

// ---------- セッティング（setup.html の保存データがあれば使う） ----------
function loadSetup() {
  const D = globalThis.SETUP_DATA;
  let o = null;
  try { o = JSON.parse(localStorage.getItem("snowboard.setup.v1") || "null"); } catch { /* 読めなければ既定値 */ }
  const key = o && D.boards[o.key] ? o.key : "craft155_2025";
  const bd = { ...D.boards[key] };
  if (o && o.bd) for (const k of ["totalLength", "effectiveEdge", "waistWidth", "sidecutRadius", "refStance", "setback"]) if (Number.isFinite(+o.bd[k]) && o.bd[k] !== null) bd[k] = +o.bd[k];
  const rd = { ...D.rider, ...(o && o.rd) };
  let stance = { xF: 0.26, xR: -0.26, angF: 18, angR: -6 }, mine = false;
  if (o && o.ft && o.bk) {
    const fx = (front, f) => (-bd.setback + (front ? 1 : -1) * (bd.refStance / 2 + D.holePitch * (+f.shift || 0) + (+f.slot || 0))) / 1000;
    stance = { xF: fx(true, o.ft), xR: fx(false, o.bk), angF: +o.ft.angle || 0, angR: +o.bk.angle || 0 };
    mine = true;
  }
  return { bd, rd, stance, mine, label: D.boards[key].label };
}
const SET = loadSetup();
const sh = boardShape(SET.bd, SET.stance);
const rider = createRider({ heightCm: +SET.rd.height || 173, massKg: +SET.rd.weight || 62 });
const M_KG = rider.mass;

// ---------- シーン ----------
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 6000);
const world = createWorld(scene);
const board = createBoard(sh);
world.slope.add(rider.root, board.group);
rider.root.traverse((o) => o.layers.enable(1));
board.group.traverse((o) => o.layers.enable(1));
const trail = createTrail(world.slope), spray = createSpray(world.slope);

// ---------- 重心・力・角度の表示 ----------
function label() {
  const c = document.createElement("canvas"); c.width = 320; c.height = 64;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  // 文字は視点の距離によらず画面上で同じ大きさ
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  sp.scale.set(0.2, 0.04, 1); sp.renderOrder = 20;
  let last = "";
  sp.set = (text, color) => {
    if (text === last) return; last = text;
    const g = c.getContext("2d"); g.clearRect(0, 0, 320, 64); g.font = "bold 30px 'BIZ UDPGothic', sans-serif";
    const w = Math.min(316, g.measureText(text).width + 20);
    g.fillStyle = "rgba(255,255,255,.88)"; g.fillRect((320 - w) / 2, 8, w, 48);
    g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 160, 33);
    tex.needsUpdate = true;
  };
  return sp;
}
const ov = new THREE.Group(); world.slope.add(ov);
const checker = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); for (let i = 0; i < 4; i++) { g.fillStyle = i % 3 ? "#111" : "#f5c518"; g.fillRect((i % 2) * 32, (i >> 1) * 32, 32, 32); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const comBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), new THREE.MeshBasicMaterial({ map: checker, depthTest: false }));
comBall.renderOrder = 15;
const copDot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe0452c, depthTest: false }));
copDot.renderOrder = 15;
const arrow = (c) => { const a = new THREE.ArrowHelper(V(0, 1, 0), V(), 1, c, 0.12, 0.07); a.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 14; } }); return a; };
const aSnow = arrow(0xe0452c), aGrav = arrow(0x2f6fd6), aInert = arrow(0xf0a030);
const lSnow = label(), lGrav = label(), lInert = label(), lCom = label();
const lineMat = (c, o = 1) => new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: o });
const mkLine = (c, n, o) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: n }, () => V())), lineMat(c, o)); l.renderOrder = 13; l.frustumCulled = false; return l; };
const forceLine = mkLine(0xe0452c, 2, 0.6);
const forceGroup = new THREE.Group();
forceGroup.add(comBall, copDot, aSnow, aGrav, aInert, lSnow, lGrav, lInert, lCom, forceLine);
const angGroup = new THREE.Group();
const lnSnow = mkLine(0x333333, 2), lnBase = mkLine(0xe0622c, 2), lnNorm = mkLine(0x888888, 2, 0.8), lnIncl = mkLine(0x2f6fd6, 2), arcEdge = mkLine(0xe0622c, 16), arcIncl = mkLine(0x2f6fd6, 16);
const lEdge = label(), lIncl = label();
angGroup.add(lnSnow, lnBase, lnNorm, lnIncl, arcEdge, arcIncl, lEdge, lIncl);
ov.add(forceGroup, angGroup);
const setLine = (l, pts) => { const p = l.geometry.attributes.position; pts.forEach((v, i) => p.setXYZ(i, v.x, v.y, v.z)); p.needsUpdate = true; };
const arc = (l, c, a, b, r) => { const n = l.geometry.attributes.position.count, pts = []; for (let i = 0; i < n; i++) { const t = i / (n - 1), d = a.clone().multiplyScalar(1 - t).addScaledVector(b, t).normalize(); pts.push(c.clone().addScaledVector(d, r)); } setLine(l, pts); };

// ---------- 状態（サンプル → 板の向き・位置・力） ----------
let M = null, slopeA = 0;
const Yax = V(0, 1, 0), Xax = V(1, 0, 0), Zax = V(0, 0, 1);
function stateAt(s) {
  const bq = new THREE.Quaternion().setFromAxisAngle(Yax, s.bpsi - Math.PI / 2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(Xax, s.edge)).multiply(new THREE.Quaternion().setFromAxisAngle(Zax, s.pitch));
  const air = s.airborne ? 1 : 0;
  const bp = V(s.x, boardLift(sh, bq, s) + (s.air || 0), s.z);
  const gv = V(0, -G * Math.cos(slopeA), G * Math.sin(slopeA));
  const acc = V(s.ax, s.ay, s.az);
  const F = air ? V() : acc.clone().sub(gv).multiplyScalar(M_KG);
  const Yb = Yax.clone().applyQuaternion(bq);
  // バランスの向き: 上下の加速度で力が一瞬小さくなるときに、向きが斜面に沿って倒れないよう下限を付ける
  const n = air ? Yb : V(s.ax, Math.max(s.ay, -0.3 * G), s.az).sub(gv).normalize();
  const side = Math.max(-1, Math.min(1, s.edge / (10 * D2R)));
  const onBoard = (x) => V(x, sh.yAt(x, s.bend, s.press), Math.abs(side) > 0.02 ? side * sh.hw(x) * (Math.abs(side) > 0.99 ? 1 : Math.abs(side)) : s.cz).applyQuaternion(bq).add(bp);
  const up = V(0, Math.cos(slopeA), -Math.sin(slopeA));
  const ly = (s.lookYaw || 0) * D2R, ld = (s.lookDown || 0) * D2R;
  const look = V(Math.sin(s.psi + ly), 0, Math.cos(s.psi + ly)).multiplyScalar(Math.cos(ld)).addScaledVector(up, -Math.sin(ld)).normalize();
  // 手を雪に着く目標: 圧の中心から板の横方向にターンの内側へ約0.5m（前の手はノーズ寄り、後ろの手はテール寄り）
  let hands = null;
  if (s.touchL > 0.001 || s.touchR > 0.001) {
    const Xb = Xax.clone().applyQuaternion(bq), Zb = Zax.clone().applyQuaternion(bq), inward = Zb.clone().multiplyScalar(Math.sign(s.edge) || 1).setY(0).normalize(), c = onBoard(s.cx);
    const at = (dx) => c.clone().addScaledVector(inward, 0.5).addScaledVector(Xb.clone().setY(0).normalize(), dx).setY(0.05);
    hands = { L: at(0.22), R: at(-0.15) };
  }
  return { s, bq, bp, sh, n, C: onBoard(s.cxb ?? s.cx), Cp: onBoard(s.cx), F, air, up, look, gv, acc, hands };
}
const comOff = (s) => rider.pose(stateAt({ ...s, air: 0, airborne: 0, ay: 0 })).com.y;

function loadMotion(id, mid = "") {
  const def = MOTIONS.find((m) => m.id === id) || MOTIONS[0];
  const mistake = def.mistakes ? MISTAKES.find((m) => m.id === mid) || null : null;
  slopeA = def.slope * D2R;
  const raw = def.gen({ sh, comOff, mistake });
  M = finalize(raw, { comOff });
  M.def = def; M.mistake = mistake;
  showMistake();
  world.setSlope(raw.slope);
  // 跡と雪煙
  const pts = [], src = [];
  for (const s of M.samples) {
    const st = stateAt(s), e = Math.abs(s.edge) / D2R, c = st.Cp;
    const kind = s.carve && e > 8 ? 2 : e > 3 && !s.carve ? 1 : 0;
    pts.push({ x: kind === 2 ? c.x : s.x, z: kind === 2 ? c.z : s.z, w: s.airborne ? 0 : (s.trail || 0.02) / 2, kind });
    if (s.spray > 0.02 && !s.airborne) {
      const lat = V(s.ax, 0, s.az), l = lat.length(), fx = Math.sin(s.psi), fz = Math.cos(s.psi);
      src.push({ t: s.t, x: c.x, y: 0, z: c.z, ox: l > 0.3 ? -lat.x / l : 0, oz: l > 0.3 ? -lat.z / l : 0, fx, fz, v: s.v, amount: s.spray });
    }
  }
  trail.build(pts);
  spray.build(src, [0, -G * Math.cos(slopeA), G * Math.sin(slopeA)]);
  // 場面の帯
  const runs = [];
  for (const s of M.samples) { const r = runs[runs.length - 1]; if (!r || r.ph !== s.ph) runs.push({ ph: s.ph, t0: s.t, t1: s.t }); else r.t1 = s.t; }
  $("strip").innerHTML = runs.map((r) => `<button style="left:${(r.t0 / M.dur) * 100}%;width:${((r.t1 - r.t0) / M.dur) * 100}%;--h:${(r.ph * 47) % 360}" data-t="${r.t0}" title="${def.phases[r.ph]?.name ?? ""}"></button>`).join("");
  $("motion-desc").textContent = def.desc;
  T = 0; soles.reset(); lastPh = -1;
  const h = def.id + (mistake ? "/" + mistake.id : "");
  if (location.hash.slice(1) !== h) history.replaceState(null, "", "#" + h);
}

// ---------- よくある間違いとお手本 ----------
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
function showMistake() {
  const m = M.mistake;
  $("mistake-box").hidden = !M.def.mistakes;
  $("mistake").value = m ? m.id : "";
  $("mistake-card").innerHTML = m ? `<dl><dt>見た目</dt><dd>${esc(m.look)}</dd><dt>何が起きるか</dt><dd>${esc(m.what)}</dd><dt>直し方</dt><dd>${esc(m.fix)}</dd></dl>` +
    `<p class="src">参考: ${m.src.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join("<br>")}</p>` : "";
  $("ph-mistake").hidden = !m;
  $("ph-mistake").textContent = m ? "間違いの例：" + m.name + (opt.model ? "（青がお手本）" : "") : "";
}
// 同じ瞬間・同じ板の状態で、正しい姿勢ならどうなるか
function modelAt(s) {
  const g = { ...s };
  M.def.pose(g, s.p, s.turn, Math.sin(Math.PI * s.p) ** 0.8, sh);
  return rider.pose(stateAt(g));
}
// お手本は本人の体に隠れないよう手前に重ねる。部品の重なりでまだらにならないよう、先に奥行きだけ書いてから、いちばん手前の面だけを1回塗る
const modelDepth = new THREE.MeshBasicMaterial({ colorWrite: false });
const modelMat = new THREE.MeshBasicMaterial({ color: 0x2f7dff, transparent: true, opacity: 0.38, depthWrite: false, depthFunc: THREE.LessEqualDepth });
function renderModel(res) {
  const bg = scene.background, musc = rider.muscles.mesh.visible;
  scene.background = null; rider.muscles.mesh.visible = false; board.group.visible = false;
  renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
  camera.layers.set(1); rider.apply(res, false); renderer.clearDepth();
  scene.overrideMaterial = modelDepth; renderer.render(scene, camera);
  scene.overrideMaterial = modelMat; renderer.render(scene, camera);
  camera.layers.set(0); scene.overrideMaterial = null; renderer.autoClear = true; renderer.shadowMap.autoUpdate = true;
  scene.background = bg; rider.muscles.mesh.visible = musc; board.group.visible = true;
}

// ---------- カメラ ----------
const VIEWS = {
  chase: { label: "後ろから追う", frame: "travel", yaw: 180, pitch: 16, dist: 5.5 },
  high: { label: "斜め上", frame: "travel", yaw: 135, pitch: 36, dist: 6 },
  front: { label: "前から", frame: "travel", yaw: 0, pitch: 10, dist: 5 },
  toe: { label: "つま先側（正面）", frame: "board", yaw: 0, pitch: 6, dist: 3.4 },
  heel: { label: "かかと側（背中）", frame: "board", yaw: 180, pitch: 6, dist: 3.4 },
  section: { label: "断面（真後ろ・低く）", frame: "travel", yaw: 180, pitch: 2, dist: 3.4 },
  top: { label: "真上", frame: "slope", yaw: 180, pitch: 82, dist: 16 },
  side: { label: "ゲレンデの横から", frame: "slope", yaw: 90, pitch: 10, dist: 13 },
  feet: { label: "足元", frame: "board", yaw: 30, pitch: 32, dist: 1.7, target: "board" },
};
const cam = { view: "high", yaw: 135, pitch: 36, dist: 6, dYaw: 0, dPitch: 0, zoom: 1, ref: null };
function setView(v) {
  cam.view = v; cam.dYaw = 0; cam.dPitch = 0; cam.zoom = 1;
  document.querySelectorAll("#views button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === v));
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const camPos = V(), camTgt = V();
function updateCamera(st, res, dt) {
  const vw = VIEWS[cam.view], s = st.s;
  const refRaw = vw.frame === "travel" ? s.psi : vw.frame === "board" ? s.bpsi - Math.PI / 2 : 0;
  if (cam.ref == null) cam.ref = refRaw;
  cam.ref += wrap(refRaw - cam.ref) * (1 - Math.exp(-dt * (vw.frame === "board" ? 6 : 2.5)));
  const k = 1 - Math.exp(-dt * 4);
  cam.yaw += wrap(vw.yaw * D2R - cam.yaw * D2R) / D2R * k; cam.pitch += (vw.pitch - cam.pitch) * k; cam.dist += (vw.dist - cam.dist) * k;
  const th = cam.ref + (cam.yaw + cam.dYaw) * D2R, pitch = Math.max(-5, Math.min(88, cam.pitch + cam.dPitch)) * D2R;
  const tgt = vw.target === "board" ? st.bp.clone().add(V(0, 0.15, 0)) : res.com.clone().lerp(st.bp, 0.25);
  world.slope.updateMatrixWorld();
  const tW = tgt.applyMatrix4(world.slope.matrixWorld);
  const hd = V(Math.sin(th), 0, Math.cos(th)).applyQuaternion(world.slope.quaternion); hd.y = 0; hd.normalize();
  const dist = cam.dist * cam.zoom * Math.max(1, 0.85 / camera.aspect); // 縦長の画面では少し引く
  const want = tW.clone().addScaledVector(hd, Math.cos(pitch) * dist).add(V(0, Math.sin(pitch) * dist, 0));
  if (!camPos.lengthSq()) camPos.copy(want);
  camPos.lerp(want, 1 - Math.exp(-dt * 8)); camTgt.copy(tW);
  camera.position.copy(camPos); camera.lookAt(camTgt);
  world.follow(tW);
}
// ドラッグで回す・ピンチ/ホイールで寄る・ダブルクリックで戻す
{
  const pts = new Map(); let pinch = 0;
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); });
  canvas.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    const [x0, y0] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { cam.dYaw -= (e.clientX - x0) * 0.35; cam.dPitch += (e.clientY - y0) * 0.25; }
    else { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.zoom = Math.max(0.25, Math.min(4, cam.zoom * pinch / d)); pinch = d; }
  });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.zoom = Math.max(0.25, Math.min(4, cam.zoom * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  canvas.addEventListener("dblclick", () => setView(cam.view));
}

// ---------- 画面の部品 ----------
const soles = createSoles($("soles-cv"), sh, rider.k);
const opt = { model: true, mode: "wear", joints: false, forces: innerWidth > 900, // スマホでは最初は矢印を出さない（体が見えにくいので）
  angles: false, ghosts: false, trail: true };
function applyOpt() {
  rider.setMode(opt.mode, opt.joints || opt.mode === "skeleton");
  forceGroup.visible = opt.forces; angGroup.visible = opt.angles; trail.mesh.visible = opt.trail;
  document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === opt.mode));
  document.querySelectorAll("#toggles input").forEach((i) => { i.checked = !!opt[i.name]; });
  $("legend").hidden = !(opt.mode === "muscle" || opt.mode === "xray");
}
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fb2ff, transparent: true, opacity: 0.2, depthWrite: false });

let T = 0, playing = true, speed = 1, lastPh = -1, frameN = 0, prev = performance.now();
function sceneAt(t, withMuscles) {
  const s = sampleAt(M.samples, t), st = stateAt(s), res = rider.pose(st);
  rider.apply(res, withMuscles);
  board.group.position.copy(st.bp); board.group.quaternion.copy(st.bq); board.update(s);
  return { s, st, res };
}

function overlays(st, res) {
  const { s } = st, com = res.com, g = st.F.length() / (M_KG * G);
  comBall.position.copy(com); copDot.position.copy(st.Cp); copDot.visible = !st.air;
  lCom.position.copy(com).add(V(0, 0.16, 0)); lCom.set("重心", "#111");
  if (!st.air) {
    aSnow.visible = lSnow.visible = forceLine.visible = true;
    aSnow.position.copy(st.C); aSnow.setDirection(st.n); aSnow.setLength(Math.max(0.2, g * 0.55), 0.12, 0.07);
    lSnow.position.copy(st.C).addScaledVector(st.n, g * 0.55 + 0.12); lSnow.set(`雪が押す力 ${g.toFixed(2)}G`, "#c0301c");
    setLine(forceLine, [st.C, st.C.clone().addScaledVector(st.n, 1.7 * rider.k)]);
  } else { aSnow.visible = lSnow.visible = forceLine.visible = false; }
  aGrav.position.copy(com); aGrav.setDirection(st.up.clone().negate()); aGrav.setLength(0.55, 0.12, 0.07);
  lGrav.position.copy(com).addScaledVector(st.up, -0.7); lGrav.set("重力 1G", "#1f55b0");
  const lat = V(s.ax, 0, s.az), la = lat.length() / G;
  aInert.visible = lInert.visible = la > 0.08 && !st.air;
  if (aInert.visible) { aInert.position.copy(com); aInert.setDirection(lat.clone().negate().normalize()); aInert.setLength(la * 0.55 + 0.05, 0.1, 0.06); lInert.position.copy(com).addScaledVector(lat.clone().normalize(), -(la * 0.55 + 0.25)); lInert.set(`遠心力 ${la.toFixed(2)}G`, "#b86e00"); }
  // 角度（進行方向の断面）
  if (opt.angles) {
    const d = V(Math.sin(s.psi), 0, Math.cos(s.psi)), lat2 = V().crossVectors(Yax, d).normalize();
    const Zb = V(0, 0, 1).applyQuaternion(st.bq), sg = s.edge >= 0 ? 1 : -1, c = st.Cp;
    const baseDir = Zb.clone().multiplyScalar(-sg).addScaledVector(d, -Zb.clone().multiplyScalar(-sg).dot(d)).normalize();
    const snowDir = baseDir.clone().setY(0).normalize();
    setLine(lnSnow, [c.clone().addScaledVector(snowDir, -0.15), c.clone().addScaledVector(snowDir, 0.55)]);
    setLine(lnBase, [c, c.clone().addScaledVector(baseDir, 0.5)]);
    arc(arcEdge, c, snowDir, baseDir, 0.36);
    lEdge.position.copy(c).addScaledVector(snowDir.clone().add(baseDir).normalize(), 0.62); lEdge.set(`エッジ角 ${(Math.abs(s.edge) / D2R).toFixed(0)}°`, "#c0501c");
    const nL = st.n.clone().addScaledVector(d, -st.n.dot(d)).normalize();
    setLine(lnNorm, [c, c.clone().addScaledVector(Yax, 1.1)]);
    setLine(lnIncl, [c, c.clone().addScaledVector(nL, 1.1)]);
    arc(arcIncl, c, Yax, nL, 0.8);
    const incl = Math.atan2(Math.abs(nL.dot(lat2)), nL.dot(Yax)) / D2R;
    lIncl.position.copy(c).addScaledVector(Yax.clone().add(nL).normalize(), 1.2); lIncl.set(`体の傾き ${incl.toFixed(0)}°`, "#1f55b0");
  }
}

function renderGhosts(t) {
  if (!opt.ghosts) return;
  const trick = !M.def.id.match(/carve|slide|stance/), step = trick ? 0.13 : 0.32, n = trick ? 7 : 6;
  const bg = scene.background, musc = rider.muscles.mesh.visible;
  scene.background = null; rider.muscles.mesh.visible = false;
  renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
  scene.overrideMaterial = ghostMat; camera.layers.set(1);
  for (let i = 1; i <= n; i++) { const tg = t - i * step; if (tg < 0) break; sceneAt(tg, false); renderer.render(scene, camera); }
  camera.layers.set(0); scene.overrideMaterial = null; renderer.autoClear = true; renderer.shadowMap.autoUpdate = true;
  scene.background = bg; rider.muscles.mesh.visible = musc;
}

function extras(st) {
  const s = st.s, d = V(Math.sin(s.psi), 0, Math.cos(s.psi)), lat = V(s.ax, 0, s.az);
  lat.addScaledVector(d, -lat.dot(d));
  const aL = lat.length(), lat2 = V().crossVectors(Yax, d).normalize();
  return { G: st.F.length() / (M_KG * G), R: aL > 0.15 ? (s.v * s.v) / aL : 0, incl: st.air ? 0 : Math.atan2(Math.abs(st.n.dot(lat2)), st.n.dot(Yax)) / D2R };
}

function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  if (M) {
    if (playing) { T += dt * speed; if (T > M.dur) { T = 0; soles.reset(); } }
    const { s, st, res } = sceneAt(T, true);
    trail.upTo(Math.floor(T / (M.samples[1].t - M.samples[0].t)));
    spray.update(T);
    overlays(st, res);
    updateCamera(st, res, dt);
    renderer.render(scene, camera);
    const model = M.mistake && opt.model ? modelAt(s) : null;
    if (model) renderModel(model);
    if (opt.ghosts) renderGhosts(T);
    if (model || opt.ghosts) sceneAt(T, false);
    soles.draw(res, s, st.air);
    if (frameN++ % 6 === 0) {
      $("stats").innerHTML = readouts(res, st, { ...extras(st), model }).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      const pF = Math.round(res.foot.L.share * 100);
      $("soles-note").textContent = st.air ? "空中（足裏の圧はゼロ）" : `前足 ${pF}%・後足 ${100 - pF}%`;
    }
    if (s.ph !== lastPh) {
      lastPh = s.ph;
      const p = M.def.phases[s.ph] || { name: "", text: "" };
      $("ph-name").textContent = p.name; $("ph-text").textContent = p.text; $("ph-sub").textContent = p.sub || ""; $("ph-sub").hidden = !p.sub;
    }
    $("seek").value = String(T / M.dur);
    $("time").textContent = `${T.toFixed(1)} / ${M.dur.toFixed(1)}秒`;
  }
  requestAnimationFrame(frame);
}

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
  spray.mat.uniforms.scale.value = r.height * renderer.getPixelRatio() * 0.9;
}
new ResizeObserver(resize).observe(canvas.parentElement);

// ---------- 操作 ----------
$("motion").innerHTML = MOTIONS.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
$("motion").addEventListener("change", (e) => loadMotion(e.target.value, $("mistake").value));
$("mistake").innerHTML = `<option value="">なし（お手本の滑り）</option>` + MISTAKES.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
$("mistake").addEventListener("change", (e) => loadMotion(M.def.id, e.target.value));
$("model-toggle").addEventListener("change", (e) => { opt.model = e.target.checked; showMistake(); });
$("views").innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button type="button" data-v="${k}">${v.label}</button>`).join("");
$("views").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setView(b.dataset.v); });
$("modes").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { opt.mode = b.dataset.m; applyOpt(); } });
$("toggles").addEventListener("change", (e) => { opt[e.target.name] = e.target.checked; applyOpt(); });
const setPlay = (p) => { playing = p; $("play").setAttribute("aria-pressed", p); $("play").innerHTML = LUCIDE.icon(p ? "pause" : "play", { size: 18 }) + (p ? "止める" : "再生"); };
$("play").addEventListener("click", () => setPlay(!playing));
$("seek").addEventListener("input", (e) => { T = +e.target.value * M.dur; setPlay(false); });
$("speed").addEventListener("change", (e) => { speed = +e.target.value; });
$("back").addEventListener("click", () => { setPlay(false); T = Math.max(0, T - 1 / 30); });
$("fwd").addEventListener("click", () => { setPlay(false); T = Math.min(M.dur, T + 1 / 30); });
$("strip").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { T = +b.dataset.t + 0.001; } });
addEventListener("keydown", (e) => { if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return; if (e.key === " ") { e.preventDefault(); setPlay(!playing); } if (e.key === "ArrowRight") $("fwd").click(); if (e.key === "ArrowLeft") $("back").click(); });

$("legend-bar").style.background = `linear-gradient(90deg, ${ACT_STOPS.map(([p, c]) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")}) ${p * 100}%`).join(", ")})`;
$("soles-bar").style.background = RAMP_CSS;
$("setup-note").textContent = `${SET.label}・スタンス幅 ${Math.round((SET.stance.xF - SET.stance.xR) * 100)}cm・前足 ${SET.stance.angF > 0 ? "+" : ""}${SET.stance.angF}°・後足 ${SET.stance.angR > 0 ? "+" : ""}${SET.stance.angR}°・身長 ${SET.rd.height}cm・体重 ${SET.rd.weight}kg` + (SET.mine ? "（セッティングの画面で保存した値）" : "（既定値。セッティングの画面で保存するとその値で動く）");
document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = LUCIDE.icon(el.dataset.icon, { size: +el.dataset.size || 16 }); });

setView("high");
applyOpt();
setPlay(true);
resize();
const [hId, hMis = ""] = location.hash.slice(1).split("/"), first = MOTIONS.find((m) => m.id === hId) ? hId : "carve";
$("motion").value = first;
loadMotion(first, hMis);
requestAnimationFrame(frame);
globalThis.__sim = { get T() { return T; }, set T(v) { T = v; }, get M() { return M; }, loadMotion, modelAt, setView, opt, applyOpt, setPlay, rider, stateAt, sampleAt, renderer, scene, camera };

// オフラインでも開けるように（セッティングの画面と同じサービスワーカー）
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
