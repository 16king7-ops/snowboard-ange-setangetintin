// sim-world.js — 雪山。斜面（圧雪のコーデュロイ・コース脇の土手と木）、空、遠くの山、光、滑った跡、雪煙。
// 斜面のものは slope グループ（x=横切る向き、y=斜面の法線、z=フォールライン下向き）に置き、グループを斜度ぶん傾ける。
import * as THREE from "./vendor/three.module.min.js";
import { V, D2R, merge, paint } from "./sim-geo.js";
import { createTrees } from "./sim-trees.js";

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PISTE = 26; // コースの半幅(m)
// コースの外: 圧雪の端に小さな段（約0.8m）があり、その先の林は緩やかに上がる
export const groundY = (x) => { const a = Math.abs(x) - PISTE; return a > 0 ? 0.8 * (1 - Math.exp(-a / 2.5)) + 0.1 * a : 0; };

// 圧雪のコーデュロイ（フォールラインに沿った細い溝）と雪の粒の凹凸 → 法線マップ
function snowTextures() {
  const N = 512, h = new Float32Array(N * N), r = rng(7);
  const blob = new Float32Array(64 * 64).map(() => r());
  const smooth = (x, y) => { const X = (x / N) * 64, Y = (y / N) * 64, i = Math.floor(X), j = Math.floor(Y), u = X - i, v = Y - j, g = (a, b) => blob[((b & 63) * 64) + (a & 63)]; return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const groove = Math.pow(0.5 + 0.5 * Math.sin((x / N) * Math.PI * 2 * 80), 3);
    h[y * N + x] = groove * 0.6 + smooth(x, y) * 0.8 + r() * 0.25;
  }
  const c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    const nx = -dx * 1.6, ny = -dy * 1.6, l = Math.hypot(nx, ny, 1), o = (y * N + x) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const normal = new THREE.CanvasTexture(c);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.anisotropy = 8;
  // 色のむら（大きな面）
  const c2 = document.createElement("canvas"); c2.width = c2.height = 256;
  const g2 = c2.getContext("2d"), im2 = g2.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const v = 238 + smooth(x * 2, y * 2) * 17, o = (y * 256 + x) * 4; im2.data[o] = v - 6; im2.data[o + 1] = v - 2; im2.data[o + 2] = 255; im2.data[o + 3] = 255; }
  g2.putImageData(im2, 0, 0);
  const color = new THREE.CanvasTexture(c2);
  color.wrapS = color.wrapT = THREE.RepeatWrapping; color.colorSpace = THREE.SRGBColorSpace;
  return { normal, color };
}

function pineGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6).translate(0, 0.8, 0), 0x4a3526)];
  for (let i = 0; i < 4; i++) {
    const y = 1.2 + i * 1.5, r = 2.3 - i * 0.48;
    parts.push(paint(new THREE.ConeGeometry(r, 2.4, 9).translate(0, y + 1.1, 0), 0x1f3b2e));
    parts.push(paint(new THREE.ConeGeometry(r * 0.72, 1.1, 9).translate(0, y + 1.9, 0), 0xf2f5f8));
  }
  return merge(parts);
}

export function createWorld(scene) {
  scene.background = new THREE.Color(0xbcd4ea);
  scene.fog = new THREE.FogExp2(0xcfe0ef, 0.0042);

  // 空（上ほど濃い青）
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "varying vec3 vP; void main(){ float h = clamp(vP.y,0.,1.); vec3 c = mix(vec3(.82,.89,.96), vec3(.27,.5,.82), pow(h,.55)); gl_FragColor = vec4(c,1.); }",
  }));
  scene.add(sky);

  // 遠くの山並み（雪をかぶった稜線）
  {
    const r = rng(3), seg = 240, pos = [], col = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, R = 1500 + 300 * Math.sin(a * 3.1), hgt = 160 + 220 * Math.abs(Math.sin(a * 5.3) * Math.sin(a * 2.2 + 1)) + r() * 70;
      for (const [y, c] of [[-400, [0.45, 0.55, 0.66]], [hgt * 0.55, [0.62, 0.7, 0.8]], [hgt, [0.97, 0.98, 1]]]) { pos.push(Math.cos(a) * R, y, Math.sin(a) * R); col.push(...c); }
    }
    for (let i = 0; i < seg; i++) for (let k = 0; k < 2; k++) { const a = i * 3 + k, b = (i + 1) * 3 + k; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
    m.position.y = -120;
    scene.add(m);
  }

  const sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xbcd6ff, 0xf4f1ea, 1.15));

  // 斜面
  const slope = new THREE.Group();
  scene.add(slope);
  const tex = snowTextures();
  const W = 170, L = 800, geo = new THREE.PlaneGeometry(W, L, 85, 200);
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 280);
  const p = geo.attributes.position, r = rng(11);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, groundY(x) + (Math.abs(x) > PISTE ? r() * 0.25 : 0)); }
  geo.computeVertexNormals();
  tex.normal.repeat.set(W / 2, L / 2);
  tex.color.repeat.set(W / 40, L / 40);
  // 雪の材質: 粒が日差しを跳ね返すきらめき、低い角度から見たときの照り返し、日陰の青み
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf6f9ff, map: tex.color, normalMap: tex.normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.78, metalness: 0 });
  const snowU = { uSun: { value: V(-35, 60, 25).normalize() }, uUp: { value: V(0, 1, 0) } };
  snowMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, snowU);
    sh.vertexShader = "varying vec3 vWPos;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = "varying vec3 vWPos;\nuniform vec3 uSun;\nuniform vec3 uUp;\n" + sh.fragmentShader.replace("#include <opaque_fragment>", `#include <opaque_fragment>
      {
        vec3 Vv = normalize(cameraPosition - vWPos);
        float dist = length(cameraPosition - vWPos);
        // きらめき: 約1.5cmの粒ごとに向きの違う小さな面。日差しを目の方へ跳ね返す粒だけが光る
        vec3 cell = floor(vWPos * 50.0);
        float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 fn = normalize(uUp * 1.3 + vec3(fract(h * 7.13) - 0.5, fract(h * 5.31) - 0.5, fract(h * 3.71) - 0.5));
        float spark = pow(max(dot(fn, normalize(uSun + Vv)), 0.0), 700.0) * step(0.9, fract(h * 91.7));
        gl_FragColor.rgb += vec3(1.0, 0.98, 0.94) * spark * 7.0 * smoothstep(45.0, 4.0, dist);
        // 低い角度からの照り返し（雪面の光沢）と、日の当たらない所の青み
        float fr = pow(1.0 - max(dot(uUp, Vv), 0.0), 5.0);
        gl_FragColor.rgb += vec3(0.95, 0.97, 1.0) * fr * 0.22 * max(dot(uUp, uSun), 0.0);
        float lum = dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.86, 0.93, 1.08), smoothstep(0.9, 0.45, lum));
      }`);
  };
  const ground = new THREE.Mesh(geo, snowMat);
  ground.receiveShadow = true;
  slope.add(ground);

  // コース脇の木（sim-trees.js）とポール
  const trees = createTrees(slope, groundY, PISTE), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xe8612c, roughness: 0.6 });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6).translate(0, 0.8, 0), poleMat, 80);
  for (let i = 0; i < 80; i++) { const sd = i % 2 ? 1 : -1; poles.setMatrixAt(i, m4.compose(V(sd * (PISTE - 0.5), 0, -100 + (i >> 1) * 20), q.identity(), V(1, 1, 1))); }
  slope.add(poles);

  function setSlope(deg) { slope.rotation.x = deg * D2R; trees.orient(deg * D2R); snowU.uUp.value.set(0, Math.cos(deg * D2R), -Math.sin(deg * D2R)); }
  // 太陽と影を見ている場所の近くへ
  function follow(worldPos) {
    sun.target.position.copy(worldPos);
    sun.position.copy(worldPos).add(V(-35, 60, 25));
  }
  return { slope, setSlope, follow, sun };
}

// ---------- 滑った跡 ----------
// pts: [{x, z, w（半幅）, kind: 0=フラット 1=ずらし 2=カービング}]
export function createTrail(slope) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.renderOrder = 1; mesh.frustumCulled = false;
  slope.add(mesh);
  function build(pts) {
    const n = pts.length, pos = new Float32Array(n * 6), col = new Float32Array(n * 6), idx = [];
    const C = [[0.8, 0.85, 0.93], [0.7, 0.77, 0.88], [0.5, 0.58, 0.72]];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l, s = pts[i], y = 0.008;
      pos.set([s.x + nx * s.w, y, s.z + nz * s.w, s.x - nx * s.w, y, s.z - nz * s.w], i * 6);
      const c = C[s.kind], st = s.kind === 1 ? 0.97 + 0.06 * Math.sin(i * 1.7) : 1;
      col.set([c[0] * st, c[1] * st, c[2] * st, c[0], c[1], c[2]], i * 6);
      if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, i * 2, i * 2 + 1, (i - 1) * 2 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 6).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    mesh.geometry.dispose(); mesh.geometry = g;
  }
  const upTo = (i) => mesh.geometry.setDrawRange(0, Math.max(0, i) * 6);
  return { build, upTo, mesh };
}

// ---------- 雪煙 ----------
// 時刻から位置を計算するので、巻き戻しやコマ送りでも同じ見た目になる
export function createSpray(slope) {
  const MAX = 1400, pos = new Float32Array(MAX * 3), alpha = new Float32Array(MAX);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { scale: { value: 300 } },
    vertexShader: "attribute float alpha; varying float vA; uniform float scale; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = scale * (0.05 + 0.1*(1.-alpha)) / -mv.z; gl_Position = projectionMatrix * mv; }",
    fragmentShader: "varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d,d); if (r > .25) discard; gl_FragColor = vec4(vec3(.97,.98,1.), vA * (1. - r*4.) * .8); }",
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  slope.add(pts);
  let parts = [];
  // src: [{t, x, y, z, ox, oz（外向き）, fx, fz（進行方向）, v, amount}]
  function build(src, grav) {
    const r = rng(5);
    parts = [];
    let acc = 0;
    for (const s of src) {
      acc += s.amount * 5;
      while (acc >= 1) {
        acc -= 1;
        const sp = (1 + r() * 2.5) * (0.4 + s.v * 0.12), up = 0.8 + r() * 1.6;
        parts.push({ t: s.t, p: [s.x + (r() - 0.5) * 0.3, s.y + 0.02, s.z + (r() - 0.5) * 0.3],
          v: [s.ox * sp + s.fx * s.v * (0.2 + r() * 0.4) + (r() - 0.5) * 0.8, up, s.oz * sp + s.fz * s.v * (0.2 + r() * 0.4) + (r() - 0.5) * 0.8], life: 0.5 + r() * 0.8 });
      }
    }
    this.grav = grav;
  }
  const api = {
    grav: [0, -9.8, 0], build,
    update(t) {
      let n = 0, lo = 0, hi = parts.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (parts[m].t < t - 1.4) lo = m + 1; else hi = m; }
      for (let i = lo; i < parts.length && parts[i].t <= t && n < MAX; i++) {
        const P = parts[i], a = t - P.t;
        if (a > P.life) continue;
        const d = (1 - Math.exp(-2.2 * a)) / 2.2; // 空気抵抗で減速
        for (let k = 0; k < 3; k++) pos[n * 3 + k] = P.p[k] + P.v[k] * d + 0.5 * api.grav[k] * a * a * 0.6;
        if (pos[n * 3 + 1] < 0.01) pos[n * 3 + 1] = 0.01;
        alpha[n] = 1 - a / P.life;
        n++;
      }
      g.setDrawRange(0, n);
      g.attributes.position.needsUpdate = g.attributes.alpha.needsUpdate = true;
    },
    points: pts, mat,
  };
  api.build = build.bind(api);
  return api;
}
