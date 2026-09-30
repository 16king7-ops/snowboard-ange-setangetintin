// sim-motion.js — 動きの生成。斜面の座標（x=斜面を横切る向き、y=斜面の法線、z=フォールライン下向き）で、
// 板の通り道・向き・エッジ角と、体の姿勢パラメータを 1/60 秒ごとに作る（再生時はその間を補間）。
// 力学: 雪が体を押す力 = 体重 ×（加速度 − 重力）。ターン中は向心加速度、グラトリは重心の上下の加速度を含む。
import { D2R } from "./sim-geo.js";

const G = 9.81, DT = 1 / 240, EVERY = 4;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// 基本姿勢（ext=脚の伸び: 股関節〜足首の距離 ÷ 脚の長さ。0.9で膝がおよそ50°曲がる）
export const BASE = {
  ext: 0.9, lean: 12, twist: 10, pyaw: 0, roll: 0, sbend: 0, kneeDrive: 0.15, kneeIn: 0.1,
  aLf: 25, aLa: 30, aLe: 35, aRf: 18, aRa: 25, aRe: 35, lookYaw: 0, lookDown: 12,
  cx: 0, cxb: null, cz: 0, edge: 0, pitch: 0, bend: 0, press: 0, tuck: 0, air: 0, spray: 0, trail: 0.02, carve: 0,
};
export const NUM_KEYS = Object.keys(BASE).filter((k) => k !== "cxb").concat(["t", "x", "z", "psi", "bpsi", "v", "ax", "ay", "az", "cxb"]);

// キーフレーム [[t, v], ...] を滑らかにつなぐ
function kf(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], sstep(keys[i - 1][0], keys[i][0], t));
  return keys[keys.length - 1][1];
}
// 前足の荷重の割合 → 板の上の圧の中心 x
const cxOf = (sh, frac) => sh.stance.xR + frac * (sh.stance.xF - sh.stance.xR);

// ターンの左右で値が違うものを、切り替えで連続につなぐ（p=0と1で左右の中間）
function sided(p, dir, toe, heel) {
  const own = dir < 0 ? toe : heel, mid = (toe + heel) / 2, w = 1 - sstep(0, 0.3, p) + sstep(0.78, 1, p);
  return own + (mid - own) * w;
}
// 次のターンへの先行（肩・視線）。ヒール側へ入るとき +、トゥ側へ入るとき −
const lead = (p, dir) => (-dir) * sstep(0.72, 1, p) + dir * (1 - sstep(0, 0.28, p));

// ---------- ターン（カービング / ずらし） ----------
function turns(o) {
  return (ctx) => {
    const { sh } = ctx, al = o.slope * D2R, H = o.H * D2R, out = [];
    let t = 0, x = 0, z = 0, psi = H * 0.95, dir = -1, p = 0.02, n = 0, v = o.v0, step = 0, at = 0;
    // 速さ: 重力の斜面方向の成分で加速し、雪の摩擦と空気抵抗で減速する。
    // 摩擦は「速すぎるときは板をずらして強める」（スピードの調整）として v0 の近くに保つ
    const cD = 0.004;
    while (n < o.count) {
      const env = Math.sin(Math.PI * p) ** 0.8;
      const eMax = (dir < 0 ? o.edgeToe : o.edgeHeel) * D2R, th = eMax * env;
      const kap = o.carve ? sstep(2 * D2R, 14 * D2R, th) / (sh.R * Math.cos(th)) : env ** 1.2 / o.R;
      const psiDot = dir * v * kap, span = 2 * H;
      const load = Math.hypot(v * psiDot, G * Math.cos(al)) / G, mu = clamp(o.mu + o.muGain * (v - o.v0), 0.02, 0.6);
      at = G * Math.sin(al) * Math.cos(psi) - mu * load * G - cD * v * v;
      if (step % EVERY === 0) {
        const s = { ...BASE, t, x, z, psi, v, ph: 0 };
        s.ax = at * Math.sin(psi) + v * psiDot * Math.cos(psi);
        s.az = at * Math.cos(psi) - v * psiDot * Math.sin(psi);
        s.ay = 0;
        s.edge = -dir * th;
        const beta = o.carve ? 0 : o.skid * D2R * Math.sin(Math.PI * clamp((p - 0.12) / 0.88, 0, 1) ** 1.5);
        s.bpsi = psi + dir * beta;
        o.pose(s, p, dir, env, sh);
        s.bend = o.carve ? sh.carveBend(th) * 0.95 : 0;
        s.carve = o.carve ? 1 : 0;
        s.trail = o.carve ? 0.035 : 0.06 + sh.L * Math.sin(beta) * 0.75;
        s.spray = o.carve ? clamp((v * v * kap / 9.81 - 0.6) * 0.8, 0, 1) * sstep(0.45, 0.8, p) : clamp(Math.sin(beta) * 2.2, 0, 1) * env;
        s.turn = dir;
        s.ph = o.phase(p, dir);
        out.push(s);
      }
      p += Math.max(Math.abs(psiDot) / span, 1 / o.minT) * DT;
      psi += psiDot * DT;
      x += v * Math.sin(psi) * DT; z += v * Math.cos(psi) * DT;
      v = Math.max(1, v + at * DT);
      t += DT; step++;
      if (p >= 1) { p -= 1; dir = -dir; n++; }
    }
    return { samples: out, slope: o.slope };
  };
}

function phaseIndex(bounds, end) {
  return (p, dir) => { let i = 0; while (i < bounds.length - 1 && p >= bounds[i + 1]) i++; if (p >= end) i = 0; return i * 2 + (dir < 0 ? 0 : 1); };
}

const CARVE_PH = [
  ["切り替え", "板がいったんフラットになって次のエッジへ移る。重心が板の上を横切る。雪から受ける力は体重の0.6〜0.9倍に下がり（抜重）、前後の足はほぼ半々。"],
  ["ターン前半（谷回り）", "前足を少し多め（55〜65%）に踏んで新しいエッジを立てる。板がたわみ、サイドカーブの形で曲がり始める。重力が曲がる向きを助けるので、荷重はまだ大きくない。"],
  ["フォールライン", "エッジ角が最大に近い。体は雪面側へ大きく傾くが、上半身は脚ほど倒さない（くの字）。重心はエッジの真上ではなく、その内側にある。"],
  ["ターン後半（山回り）", "重力が曲がりに逆らうので、荷重が一番大きくなる所（体重の1.3〜1.8倍）。脚で受け止め、終わりにかけて少し後足寄りで抜けていく。"],
];
const S_PH = [
  ["切り替え（抜重）", "伸び上がって板への荷重を抜く（体重の0.7〜0.9倍）。軽くなったすきに、板を次のターンの向きへ。"],
  ["先行動作", "肩と胸を先に次のターンの方向へ向ける。板は少し遅れてついてくる。前足に多めに乗る（60〜70%）。"],
  ["ターン中盤", "エッジを軽く立て、膝を曲げながら荷重をかけていく。"],
  ["ずらし（山回り）", "板を少し横にずらしてスピードを調整する所。雪煙が出る。荷重は体重の1.1〜1.3倍。"],
];
const SIDE_TXT = {
  toe: "トゥサイド（つま先側）: 膝と腰を雪面側へ入れ、すねでブーツのタンを押す。ふくらはぎ（下腿三頭筋）と太もも前（大腿四頭筋）が働く。",
  heel: "ヒールサイド（かかと側）: お尻を落として座るように。腰から上を前へ折ってバランスを取る。ハイバックにふくらはぎを預け、すねの前（前脛骨筋）でつま先を引き上げる。",
};
const sidePhases = (list) => list.flatMap(([n, tx]) => [{ name: "トゥサイド・" + n, text: tx, sub: SIDE_TXT.toe }, { name: "ヒールサイド・" + n, text: tx, sub: SIDE_TXT.heel }]);

// カービングの姿勢（Sonnet 5.5 と照合した目安: 膝 トゥ25〜40°/ヒール30〜45°、肩は進行方向へ トゥ+10〜25°/ヒール+20〜35°、前足荷重 50→60→55→45%）
function carvePose(s, p, dir, env, sh) {
  const comp = Math.sin(Math.PI * clamp((p - 0.05) / 0.95, 0, 1) ** 1.25);
  s.ext = lerp(0.95, dir < 0 ? 0.83 : 0.85, comp);
  // トゥ側: 膝を深く曲げてすねを倒し、上半身は脚より起こす（くの字）。ヒール側: 腰から上を前へ折る
  s.lean = sided(p, dir, 6, 22);
  s.twist = sided(p, dir, 14, 20) + 8 * lead(p, dir);
  s.kneeDrive = sided(p, dir, 0.9, 0.05);
  s.kneeIn = sided(p, dir, 0.25, 0.05);
  s.aLf = sided(p, dir, 30, 34); s.aLa = sided(p, dir, 36, 34); s.aLe = 35;
  s.aRf = sided(p, dir, 12, 28); s.aRa = sided(p, dir, 22, 20); s.aRe = sided(p, dir, 30, 40);
  s.lookYaw = 32 * ((dir) * (1 - sstep(0.7, 1, p)) + (-dir) * sstep(0.7, 1, p));
  s.lookDown = 8;
  s.cx = cxOf(sh, kf([[0, 0.5], [0.22, 0.61], [0.5, 0.55], [0.82, 0.44], [1, 0.5]], p));
}

function slidePose(s, p, dir, env, sh) {
  const comp = Math.sin(Math.PI * clamp((p - 0.1) / 0.9, 0, 1) ** 1.3);
  s.ext = lerp(0.965, 0.87, comp);
  s.lean = sided(p, dir, 9, 22);
  s.twist = sided(p, dir, 10, 22) + 22 * lead(p, dir);
  s.kneeDrive = sided(p, dir, 0.4, 0.05);
  s.kneeIn = sided(p, dir, 0.2, 0.05);
  s.aLf = sided(p, dir, 28, 40); s.aLa = sided(p, dir, 40, 42); s.aLe = 30;
  s.aRf = sided(p, dir, 15, 30); s.aRa = sided(p, dir, 28, 25); s.aRe = 35;
  s.lookYaw = 38 * ((dir) * (1 - sstep(0.65, 1, p)) + (-dir) * sstep(0.65, 1, p));
  s.lookDown = 12;
  s.cx = cxOf(sh, kf([[0, 0.55], [0.2, 0.66], [0.5, 0.58], [0.85, 0.5], [1, 0.55]], p));
}

// ---------- 基本姿勢と重心移動 ----------
function stance() {
  return (ctx) => {
    const { sh } = ctx, v = 3.2, out = [];
    const K = {
      frac: [[0, 0.5], [2.2, 0.5], [2.9, 0.72], [4.4, 0.72], [5.2, 0.3], [6.7, 0.3], [7.4, 0.5]],
      edge: [[0, 0], [7.4, 0], [8.1, 8], [9.6, 8], [10.3, -8], [11.8, -8], [12.5, 0]],
      ext: [[0, 0.9], [8.1, 0.89], [10.3, 0.88], [12.5, 0.9]],
    };
    const ph = [[0, 0], [2.4, 1], [4.8, 2], [7.4, 0], [7.8, 3], [10.0, 4], [12.3, 0]];
    for (let t = 0; t <= 13.5; t += DT * EVERY) {
      const s = { ...BASE, t, x: 0, z: v * t, psi: 0, bpsi: 0, v, ax: 0, ay: 0, az: 0 };
      s.cx = cxOf(sh, kf(K.frac, t));
      s.edge = kf(K.edge, t) * D2R;
      s.ext = kf(K.ext, t);
      s.lean = 12 + (kf(K.edge, t) > 0 ? kf(K.edge, t) : 0) * 1.2;
      s.kneeDrive = 0.15 + Math.max(0, kf(K.edge, t)) * 0.08;
      s.trail = 0.18;
      let i = 0; while (i < ph.length - 1 && t >= ph[i + 1][0]) i++;
      s.ph = ph[i][1];
      out.push(s);
    }
    return { samples: out, slope: 9 };
  };
}

// ---------- グラトリ ----------
// pre: 踏み切りまで（絶対時刻）/ air: 踏み切りからの時刻 / post: 着地からの時刻。値は BASE からの上書き。frac=前足の荷重割合
function trick(o) {
  return (ctx) => {
    const { sh } = ctx, v = 3.8, al = 8 * D2R, gn = G * Math.cos(al), out = [];
    const at = (tracks, name, t, def) => (tracks[name] ? kf(tracks[name], t) : def);
    const make = (t, tracks, tt, base) => {
      const s = { ...BASE, ...base, t, x: 0, z: v * t, psi: 0, bpsi: 0, v, ax: 0, ay: 0, az: 0 };
      for (const key of Object.keys(tracks)) if (key !== "frac" && key !== "fracB" && key !== "ph") s[key] = kf(tracks[key], tt);
      if (tracks.frac) s.cx = cxOf(sh, kf(tracks.frac, tt));
      s.cxb = tracks.fracB ? cxOf(sh, kf(tracks.fracB, tt)) : null;
      for (const k of ["pitch", "press"]) s[k] *= D2R;
      s.edge = (s.edge || 0) * D2R;
      if (tracks.ph) { let i = 0; while (i < tracks.ph.length - 1 && tt >= tracks.ph[i + 1][0]) i++; s.ph = tracks.ph[i][1]; }
      return s;
    };
    const step = DT * EVERY;
    let t = 0;
    for (; t < o.tTO; t += step) out.push(make(t, o.pre, t, {}));
    if (!o.air) {
      for (; t <= o.tTO + o.postDur; t += step) out.push(make(t, o.post, t - o.tTO, {}));
      return { samples: out, slope: 8 };
    }
    // 空中: 重心は放物線。板の高さ = 重心の高さ − （その姿勢での、板の最下点から重心までの高さ）
    const last = out[out.length - 1], y0 = ctx.comOff(last), air = [];
    let tau = 0, land = null;
    for (; tau < 1.2; tau += step) {
      const s = make(o.tTO + tau, o.air, tau, {});
      const yc = y0 + o.v0 * tau - 0.5 * gn * tau * tau;
      s.air = yc - ctx.comOff(s);
      if (tau > 0.1 && s.air <= 0) { land = tau; break; }
      s.air = Math.max(0, s.air);
      s.ycom = yc;
      air.push(s);
    }
    const Tair = land ?? tau;
    air.forEach((s) => {
      const u = sstep(0, 1, (s.t - o.tTO) / Tair);
      s.bpsi = (o.rot || 0) * D2R * u;
      if (o.lookRot) s.lookYaw = o.lookRot * sstep(0.4, 0.6, (s.t - o.tTO) / Tair);
      if (o.rot) s.twist = kf([[0, o.twistAir], [Tair * 0.6, o.twistAir * 0.5], [Tair, 0]], s.t - o.tTO);
    });
    out.push(...air);
    const tL = o.tTO + Tair;
    for (t = tL; t <= tL + o.postDur; t += step) {
      const s = make(t, o.post, t - tL, {});
      s.bpsi = (o.rot || 0) * D2R;
      if (o.lookRot) s.lookYaw = o.lookRot;
      out.push(s);
    }
    return { samples: out, slope: 8, tLand: tL };
  };
}

const GLIDE = { ext: [[0, 0.9]], lean: [[0, 12]], frac: [[0, 0.5]], trail: [[0, 0.16]] };
const TR_PH = ["滑走", "溜め", "テールに乗る", "ポップ", "空中", "着地", "ノーズに乗る", "プレス", "戻す", "予備回旋"];
const TR_TXT = {
  滑走: "板をフラットにして、両足に半々で乗って滑る。",
  溜め: "膝と股関節を曲げて低くなり、伸び上がる準備をする（200〜400ms）。",
  テールに乗る: "後ろ足に体重の70〜90%を乗せ、テールをたわませる。前足は引き上げ始める。",
  ノーズに乗る: "前足に体重の70〜90%を乗せ、ノーズをたわませる。後ろ足は引き上げ始める。",
  ポップ: "脚を一気に伸ばし、たわんだ板の反発で跳ぶ。雪から受ける力は一瞬で体重の2〜3倍になる。",
  空中: "膝を胸へ引きつけて板を持ち上げ、板を水平に戻す。空中では重さがなくなるので、腕や脚は力を使わずに動かせる。",
  着地: "両足同時に着き、膝と股関節で衝撃を吸収する（体重の2〜4倍）。前後はほぼ半々。",
  プレス: "片方の端に乗り続けて、反対側を浮かせる。重心は雪に着いている端の真上に置く（静止したバランス）。",
  戻す: "重心を板の中央へ戻し、浮いていた側を静かに下ろす。",
  予備回旋: "回る向きと逆へ肩をひねって溜める（30〜60°）。踏み切りでほどき、肩が先に回って板が遅れてついてくる。",
};
const trPhases = () => TR_PH.map((n) => ({ name: n, text: TR_TXT[n] }));

function ollieDef(nose, rot = 0) {
  const sg = nose ? -1 : 1, fr = (f) => (nose ? 1 - f : f);
  const wind = rot ? -Math.sign(rot) * 40 : 10;
  return trick({
    tTO: 1.62, v0: rot ? 1.3 : 1.25, rot,
    twistAir: rot ? Math.sign(rot) * 38 : undefined,
    lookRot: rot < 0 ? -360 : 0, // バックサイドは空中の途中で頭を反対の肩へ振る（首は90°までしか回らない）
    pre: {
      ...GLIDE,
      ext: [[0, 0.9], [0.95, 0.9], [1.3, 0.77], [1.47, 0.76], [1.62, 0.95]],
      lean: [[0, 12], [0.95, 12], [1.3, 22], [1.62, 14]],
      frac: [[0, 0.5], [0.95, 0.5], [1.3, fr(0.4)], [1.44, fr(0.2)], [1.53, fr(-0.3)], [1.62, fr(-0.7)]],
      fracB: [[0, 0.5], [0.95, 0.5], [1.3, fr(0.4)], [1.44, fr(0.22)], [1.62, fr(0.25)]],
      pitch: [[0, 0], [1.44, 0], [1.55, sg * 7], [1.62, sg * 18]],
      press: [[0, 0], [1.4, 0], [1.5, sg * 5], [1.62, 0]],
      twist: [[0, 10], [0.95, 10], [1.35, wind], [1.62, rot ? Math.sign(rot) * 30 : 10]],
      aLf: [[0, 25], [1.3, 20], [1.62, 45]], aRf: [[0, 18], [1.3, 10], [1.62, 38]], aLa: [[0, 30], [1.3, 22], [1.62, 28]], aRa: [[0, 25], [1.3, 18], [1.62, 25]],
      spray: [[0, 0], [1.5, 0], [1.6, 0.8], [1.63, 0]],
      trail: [[0, 0.16], [1.44, 0.16], [1.5, 0.08]],
      ph: rot ? [[0, 0], [0.95, 9], [1.44, nose ? 6 : 2], [1.55, 3]] : [[0, 0], [0.95, 1], [1.4, nose ? 6 : 2], [1.55, 3]],
    },
    air: {
      ext: [[0, 0.95], [0.12, 0.79], [0.22, 0.79], [0.34, 0.9]],
      pitch: [[0, sg * 18], [0.16, 0], [0.5, 0]], lean: [[0, 14], [0.2, 20], [0.45, 16]], tuck: [[0, 0], [0.12, 1], [0.35, 0.3]],
      frac: [[0, 0.5]], trail: [[0, 0]],
      aLf: [[0, 45], [0.3, 40]], aRf: [[0, 38], [0.3, 32]], aLa: [[0, 28], [0.4, 38]], aRa: [[0, 25], [0.4, 32]],
      ph: [[0, 4]],
    },
    post: {
      ext: [[0, 0.86], [0.17, 0.72], [0.65, 0.9]], lean: [[0, 16], [0.2, 22], [0.8, 12]], frac: [[0, 0.52], [0.6, 0.5]],
      twist: [[0, 0], [0.8, rot ? -10 : 10]], aLf: [[0, 45], [0.8, 25]], aRf: [[0, 40], [0.8, 18]], aLa: [[0, 45], [0.8, 30]], aRa: [[0, 40], [0.8, 25]],
      spray: [[0, 1], [0.12, 0]], trail: [[0, 0.16]],
      ph: [[0, 5], [0.45, 0]],
    },
    postDur: 1.4,
  });
}

function pressDef(nose) {
  const sg = nose ? -1 : 1, fr = (f) => (nose ? 1 - f : f), x = -0.2;
  return trick({
    tTO: 4.6, air: false,
    pre: {
      ...GLIDE,
      frac: [[0, 0.5], [1.0, 0.5], [1.6, fr(x)], [3.4, fr(x)], [4.0, 0.5]],
      fracB: [[0, 0.5], [1.0, 0.5], [1.6, fr(x)], [3.4, fr(x)], [4.0, 0.5]],
      press: [[0, 0], [1.0, 0], [1.6, sg * 12], [2.5, sg * 13], [3.4, sg * 12], [4.0, 0]],
      pitch: [[0, 0], [1.0, 0], [1.6, sg * 12], [2.5, sg * 13], [3.4, sg * 12], [4.0, 0]],
      ext: [[0, 0.9], [1.0, 0.9], [1.6, 0.87], [3.4, 0.87], [4.0, 0.9]],
      lean: [[0, 12], [1.0, 12], [1.6, nose ? 18 : 6], [3.4, nose ? 18 : 6], [4.0, 12]],
      aLa: [[0, 30], [1.6, 40], [3.4, 40], [4.0, 30]], aRa: [[0, 25], [1.6, 36], [3.4, 36], [4.0, 25]],
      aLf: [[0, 25], [1.6, 42], [3.4, 42], [4.0, 25]], aRf: [[0, 18], [1.6, 36], [3.4, 36], [4.0, 18]],
      twist: [[0, 10], [1.6, 15], [4, 10]],
      trail: [[0, 0.16]],
      ph: [[0, 0], [1.0, 7], [3.4, 8], [4.1, 0]],
    },
    post: { ...GLIDE, ph: [[0, 0]] }, postDur: 0.8,
  });
}

// id, 名前, 説明, 生成, 場面
export const MOTIONS = [
  { id: "stance", slope: 9, name: "基本姿勢と重心移動", desc: "まっすぐ滑りながら、前足・後足・つま先・かかとへ重心を移す。足裏の圧の変わり方を見る。",
    gen: stance(), phases: [
      { name: "基本姿勢", text: "両足に半々、つま先とかかとにも半々。膝と股関節を軽く曲げ、肩は板とほぼ平行、目線は進行方向。" },
      { name: "前足に乗る", text: "前足に70%。ノーズ側がたわみ、板の向きを変えやすくなる（ターンの始動で使う）。前足は小指側、後足は親指側に圧が寄る。" },
      { name: "後足に乗る", text: "後足に70%。テール側に乗るとブレーキ・安定寄り。乗りすぎると板の向きを変えにくい（初心者の後傾）。" },
      { name: "つま先側に乗る", text: "すねでブーツのタンを押し、つま先側のエッジを少し立てる。圧は母趾球・小趾球（足の前半分）へ。" },
      { name: "かかと側に乗る", text: "ハイバックにふくらはぎを預け、かかと側のエッジを少し立てる。圧はかかとへ。つま先を少し引き上げる。" },
    ] },
  { id: "slide", slope: 12, name: "S字ターン（ずらし）", desc: "板を少しずらしてスピードを調整する、いちばん基本の連続ターン（約15km/h）。",
    gen: turns({ slope: 12, v0: 4.2, mu: 0.14, muGain: 0.12, H: 52, edgeToe: 20, edgeHeel: 16, R: 6.2, skid: 24, count: 5, minT: 3, carve: false, pose: slidePose, phase: phaseIndex([0, 0.12, 0.32, 0.62], 0.92) }),
    phases: sidePhases(S_PH) },
  { id: "carve", slope: 14, name: "カービング", desc: "板をずらさず、エッジで雪を切って曲がる（約23km/h）。ターン半径 = サイドカット半径 × cos(エッジ角)。",
    gen: turns({ slope: 14, v0: 6.2, mu: 0.04, muGain: 0.09, H: 66, edgeToe: 52, edgeHeel: 46, count: 5, minT: 3.5, carve: true, pose: carvePose, phase: phaseIndex([0, 0.12, 0.4, 0.6], 0.92) }),
    phases: sidePhases(CARVE_PH) },
  { id: "ollie", slope: 8, name: "オーリー", desc: "テールをたわませて、その反発で跳ぶ。", gen: ollieDef(false), phases: trPhases() },
  { id: "nollie", slope: 8, name: "ノーリー", desc: "ノーズをたわませて跳ぶ。オーリーの逆。", gen: ollieDef(true), phases: trPhases() },
  { id: "tailpress", slope: 8, name: "テールプレス", desc: "テールに乗ってノーズを浮かせたまま滑る。", gen: pressDef(false), phases: trPhases() },
  { id: "nosepress", slope: 8, name: "ノーズプレス", desc: "ノーズに乗ってテールを浮かせたまま滑る。", gen: pressDef(true), phases: trPhases() },
  { id: "fs180", slope: 8, name: "フロントサイド180", desc: "オーリーで跳び、胸の側から回って（上から見て反時計回り）逆スタンス（スイッチ）で着地。", gen: ollieDef(false, 180), phases: trPhases() },
  { id: "bs180", slope: 8, name: "バックサイド180", desc: "オーリーで跳び、背中の側から回って（上から見て時計回り）逆スタンス（スイッチ）で着地。", gen: ollieDef(false, -180), phases: trPhases() },
];

// 仕上げ: 重心の上下の加速度を加える（抜重・ポップ・着地の衝撃）。comOff(s) = 板の最下点が雪に着いたときの重心の高さ
export function finalize(res, ctx) {
  const S = res.samples, h = S.map((s) => (s.air > 0 || s.ycom != null ? (s.ycom ?? s.air + ctx.comOff(s)) : ctx.comOff(s)));
  const dt = DT * EVERY, acc = h.map((_, i) => (i === 0 || i === h.length - 1 ? 0 : (h[i + 1] - 2 * h[i] + h[i - 1]) / (dt * dt)));
  // ターンは0.2秒の幅でならす（切り替えで体が傾きから起き上がる分）。グラトリはポップと着地の衝撃を残す
  const turn = S[0].turn != null, win = turn ? 12 : 3, lo = turn ? -0.35 * G : -0.6 * G, hi = turn ? 0.5 * G : 3.5 * G;
  S.forEach((s, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(1, i - win); j <= Math.min(S.length - 2, i + win); j++) { sum += acc[j]; n++; }
    s.ay = clamp(n ? sum / n : 0, lo, hi);
    s.airborne = s.air > 0.002 ? 1 : 0;
    if (s.cxb == null) s.cxb = s.cx;
  });
  res.dur = S[S.length - 1].t;
  return res;
}

// 時刻 t のサンプル（前後を直線で補間）
export function sampleAt(S, t) {
  const dt = S[1].t - S[0].t, f = clamp(t / dt, 0, S.length - 1.0001), i = Math.floor(f), u = f - i, a = S[i], b = S[i + 1];
  const s = { ph: u < 0.5 ? a.ph : b.ph, turn: a.turn, airborne: u < 0.5 ? a.airborne : b.airborne };
  for (const k of NUM_KEYS) s[k] = a[k] + (b[k] - a[k]) * u;
  return s;
}
