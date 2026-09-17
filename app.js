// スノボ フォーム分析 — メインロジック
// MediaPipe Tasks Vision (PoseLandmarker) をCDNから読み込み、姿勢を骨格表示する。

const MP_VERSION = "0.10.14";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let mpModule = null;       // import済みモジュール
let visionFileset = null;  // FilesetResolverの結果（共有）
let coachLevel = "beginner"; // beginner | turn | carving（アドバイスの難易度）

// PoseLandmarkerはタイムスタンプが単調増加でないとエラーになるため、パネルごとに生成する。
async function loadMediaPipe() {
  if (!mpModule) {
    mpModule = await import(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`
    );
  }
  if (!visionFileset) {
    visionFileset = await mpModule.FilesetResolver.forVisionTasks(WASM_URL);
  }
  return mpModule;
}

async function createPoseLandmarker() {
  const mp = await loadMediaPipe();
  return mp.PoseLandmarker.createFromOptions(visionFileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// 骨格の接続定義（MediaPipe Pose 33点）
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],   // 腕・肩
  [11, 23], [12, 24], [23, 24],                        // 胴
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],    // 左脚
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],    // 右脚
];

// ===== 共通ヘルパ（3機能で共有） =====

// 比較対象関節（足首・膝・股関節）。胴の傾きは別計算。
const COMPARE_JOINTS = [
  { key: "rKnee", name: "右膝",     a: 24, b: 26, c: 28 },
  { key: "lKnee", name: "左膝",     a: 23, b: 25, c: 27 },
  { key: "rHip",  name: "右股関節", a: 12, b: 24, c: 26 },
  { key: "lHip",  name: "左股関節", a: 11, b: 23, c: 25 },
  { key: "rAnk",  name: "右足首",   a: 26, b: 28, c: 32 },
  { key: "lAnk",  name: "左足首",   a: 25, b: 27, c: 31 },
];

// 角度差の色分け閾値（比較機能・readout 共通）
const CMP_GOOD = 8, CMP_WARN = 18;
const CMP_COLORS = { good: "#34e1c4", warn: "#ffd166", bad: "#ff6b6b", na: "rgba(147,163,181,0.5)" };
function cmpColor(diff) {
  if (diff == null) return CMP_COLORS.na;
  return diff < CMP_GOOD ? CMP_COLORS.good : diff < CMP_WARN ? CMP_COLORS.warn : CMP_COLORS.bad;
}

// 骨格を hip中点原点・(肩中点-hip中点)距離スケールで正規化（体格/位置/距離差を吸収）。
// aspect(=動画の幅/高さ)でx座標を補正し、縦長/横長の違いによる角度の歪みをなくす。
function normalizePose(lm, aspect = 1) {
  if (!lm || !lm[23] || !lm[24] || !lm[11] || !lm[12]) return null;
  const cx = (p) => p.x * aspect; // アスペクト補正したx
  const hipMid = { x: (cx(lm[23]) + cx(lm[24])) / 2, y: (lm[23].y + lm[24].y) / 2 };
  const shMid  = { x: (cx(lm[11]) + cx(lm[12])) / 2, y: (lm[11].y + lm[12].y) / 2 };
  const hipW   = Math.hypot(cx(lm[23]) - cx(lm[24]), lm[23].y - lm[24].y);
  let scale = Math.hypot(shMid.x - hipMid.x, shMid.y - hipMid.y);
  scale = Math.max(scale, hipW, 0.05); // 胴長が縮んでも骨盤幅/下限でクランプ
  const norm = lm.map((p) =>
    p ? { x: (p.x * aspect - hipMid.x) / scale, y: (p.y - hipMid.y) / scale,
          z: (p.z ?? 0), visibility: p.visibility ?? 1 } : null
  );
  return { norm, hipMid, shMid, scale, aspect };
}

// 正規化座標(norm)から比較用の角度辞書を作成。visibility 低い関節は除外。
function computeJointAngles(norm) {
  const ang = {};
  const ok = (i) => norm[i] && (norm[i].visibility ?? 1) >= 0.5;
  COMPARE_JOINTS.forEach(({ key, a, b, c }) => {
    if (ok(a) && ok(b) && ok(c)) ang[key] = angleAt(norm[a], norm[b], norm[c]);
  });
  if (ok(11) && ok(12)) {
    const sh = { x: (norm[11].x + norm[12].x) / 2, y: (norm[11].y + norm[12].y) / 2 };
    ang.torso = (Math.atan2(sh.x, -sh.y) * 180) / Math.PI; // 鉛直からの左右傾き(±)
  }
  return ang;
}

// HTMLエスケープ（記録メモ・履歴表示で innerHTML 構築に使用）
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// landmark のディープコピー（基準登録・記録で生 lm を凍結）
function cloneLandmarks(lm) {
  return lm.map((p) => p ? { x: p.x, y: p.y, z: p.z ?? 0, visibility: p.visibility ?? 1 } : null);
}

class Panel {
  constructor(root, label) {
    this.root = root;
    this.label = label;
    this.fps = 30;
    this.tool = "none";        // none | pen | line | angle
    this.color = "#34e1c4";
    this.poseOn = false;
    this.poseLandmarker = null;
    this.poseLoop = null;
    this._rvfcId = null;
    this.lastPoseTs = -1;
    this.anglePoints = [];     // 角度計測のクリック点
    this.drawing = false;
    this.startPt = null;
    this.savedImage = null;    // 直線描画中のスナップショット
    this.onPlayStateChange = null;

    // 3機能で共有する状態
    this.lastLandmarks = null;  // 最新フレームのlandmarks（全機能共有の唯一キャッシュ）
    this.lastAngles = null;     // _drawAutoAngles がキャッシュ {rightKnee,...}（記録用）
    this.balance = null;        // _updateBalance がキャッシュ（記録用）
    this.compareOn = false;     // お手本重畳ON/OFF
    this._sm = { knee: null, bal: null, lean: null }; // アドバイス用の平滑化値
    this._cmpAccum = null; // お手本比較の再生区間の平均（再生中に蓄積）
    this._scanning = false; // 自動レビュー実行中フラグ

    this.q = (sel) => root.querySelector(sel);
    root.querySelector(".panel-label").textContent = label;

    this._bindDropZone();
  }

  _bindDropZone() {
    const dz = this.q(".drop-zone");
    const input = this.q(".file-input");
    this.q(".file-pick").addEventListener("click", (e) => {
      e.stopPropagation();
      input.click();
    });
    dz.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.files[0]) this.loadVideo(input.files[0]);
    });
    this.q(".cam-pick").addEventListener("click", (e) => {
      e.stopPropagation();
      this.startCamera();
    });
    ["dragenter", "dragover"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove("dragover");
      })
    );
    dz.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("video/")) this.loadVideo(file);
    });
  }

  _stopCamera() {
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    const v = this.q(".video");
    if (v) v.srcObject = null;
    this.root.classList.remove("is-camera");
  }

  async startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("このブラウザ/環境ではカメラを使えません。");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false });
    } catch (e) {
      alert("カメラを開始できませんでした。ブラウザのカメラ許可を確認してください。\n" + e);
      return;
    }
    this._stopCamera();
    if (this.videoUrl) { URL.revokeObjectURL(this.videoUrl); this.videoUrl = null; }
    this.stream = stream;
    const video = this.q(".video");
    video.removeAttribute("src");
    video.srcObject = stream;
    video.muted = true;

    this.q(".drop-zone").hidden = true;
    this.q(".stage").hidden = false;
    this.root.dataset.state = "camera";
    this.root.classList.add("is-camera");
    if (!this._stageBound) { this._bindStage(); this._stageBound = true; }
    this.q(".reload").textContent = "■ カメラ停止";

    try { await video.play(); } catch (e) { /* ignore */ }
    this._resizeCanvases();
    this._updateTime();
    if (!this.poseOn) this.togglePose(); // 姿勢を自動表示
    else { this.lastPoseTs = -1; this._startPoseLoop(); }
  }

  loadVideo(file) {
    this._stopCamera();
    if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
    this.videoUrl = URL.createObjectURL(file);

    const video = this.q(".video");
    video.srcObject = null;
    video.src = this.videoUrl;

    this.q(".drop-zone").hidden = true;
    this.q(".stage").hidden = false;
    this.root.dataset.state = "loaded";

    if (!this._stageBound) {
      this._bindStage();
      this._stageBound = true;
    }
    this.q(".reload").textContent = "↺ 変更";

    video.addEventListener(
      "loadedmetadata",
      () => {
        this._resizeCanvases();
        this._updateTime();
      },
      { once: true }
    );
  }

  _bindStage() {
    const video = this.q(".video");
    const seek = this.q(".seek");
    const poseCanvas = this.q(".pose-canvas");
    const drawCanvas = this.q(".draw-canvas");

    // 再生 / コマ送り
    this.q(".play").addEventListener("click", () => this.togglePlay());
    this.q(".step-fwd").addEventListener("click", () => this.step(1));
    this.q(".step-back").addEventListener("click", () => this.step(-1));

    video.addEventListener("play", () => this._reflectPlay(true));
    video.addEventListener("pause", () => this._reflectPlay(false));
    video.addEventListener("timeupdate", () => this._updateTime());
    video.addEventListener("seeked", () => {
      this._updateTime();
      if (this._scanning) return; // スキャン中は手動検出するため二重実行を防ぐ
      if (this.poseOn) this._detectOnce();
    });

    // シーク
    seek.addEventListener("input", () => {
      if (!video.duration) return;
      video.currentTime = (seek.value / 1000) * video.duration;
    });

    // 速度
    const speedSlider = this.q(".speed-slider");
    speedSlider.addEventListener("input", () => {
      video.playbackRate = parseFloat(speedSlider.value);
      this.q(".speed-val").textContent = parseFloat(speedSlider.value).toFixed(1) + "x";
    });

    // fps
    this.q(".fps-input").addEventListener("change", (e) => {
      this.fps = Math.max(1, Math.min(120, parseInt(e.target.value) || 30));
      e.target.value = this.fps;
    });

    // 骨格トグル
    this.q(".pose-toggle").addEventListener("click", () => this.togglePose());

    // 描画ツール
    this.root.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => this.selectTool(btn.dataset.tool));
    });
    this.q(".color-input").addEventListener("input", (e) => (this.color = e.target.value));
    this.q(".clear-draw").addEventListener("click", () => this.clearDrawing());

    // お手本比較
    this.q(".capture-ref").addEventListener("click", () => this.captureReference());
    this.q(".compare-toggle").addEventListener("click", () => this.toggleCompare());

    // コーチ欄の「最もズレた瞬間で止めて見る」
    this.q(".coach-panel").addEventListener("click", (e) => {
      const b = e.target.closest(".coach-jump");
      if (!b) return;
      const v = this.q(".video");
      v.pause();
      v.currentTime = Math.max(0, parseFloat(b.dataset.jump) || 0);
    });

    // 自動レビュー
    this.q(".auto-review").addEventListener("click", () => this.runAutoReview());
    this.q(".review-panel").addEventListener("click", (e) => {
      const b = e.target.closest(".review-item");
      if (!b) return;
      const v = this.q(".video");
      v.pause();
      v.currentTime = Math.max(0, parseFloat(b.dataset.t) || 0);
    });

    // 記録
    this.q(".record-btn").addEventListener("click", () => this.saveRecord());

    // 動画変更 / カメラ停止
    this.q(".reload").addEventListener("click", () => {
      this.q(".video").pause();
      this._stopCamera();
      this._stopPoseLoop();
      this.q(".reload").textContent = "↺ 変更";
      this.q(".stage").hidden = true;
      this.q(".drop-zone").hidden = false;
      this.root.dataset.state = "empty";
      this._clearBalance();
      this._clearCompareReadout();
      this._clearCoach();
      this._clearReview();
    });

    // 描画イベント
    drawCanvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    drawCanvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    drawCanvas.addEventListener("pointerup", (e) => this._onPointerUp(e));

    window.addEventListener("resize", () => this._resizeCanvases());
    const ro = new ResizeObserver(() => this._resizeCanvases());
    ro.observe(this.q(".video-wrap"));

    this._refreshCompareButtons();
  }

  // ---------- 再生制御 ----------
  togglePlay() {
    const v = this.q(".video");
    if (v.paused) v.play();
    else v.pause();
  }

  _reflectPlay(playing) {
    this.q(".play").textContent = playing ? "⏸" : "▶";
    if (playing) this._resetCmpAccum(); // 再生開始ごとに比較の平均をリセット
    if (playing && this.poseOn) this._startPoseLoop();
    if (this.onPlayStateChange) this.onPlayStateChange(playing);
  }

  step(dir) {
    const v = this.q(".video");
    if (!v.duration || !isFinite(v.duration)) return;
    v.pause();
    const dt = dir / this.fps;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + dt));
  }

  _updateTime() {
    const v = this.q(".video");
    if (!v.duration || !isFinite(v.duration)) return;
    this.q(".seek").value = (v.currentTime / v.duration) * 1000;
    this.q(".time-readout").textContent =
      `${v.currentTime.toFixed(2)}s / ${v.duration.toFixed(2)}s`;
  }

  // ---------- キャンバスサイズ ----------
  _resizeCanvases() {
    const v = this.q(".video");
    const w = v.clientWidth;
    const h = v.clientHeight;
    if (!w || !h) return;
    [".pose-canvas", ".balance-canvas", ".draw-canvas"].forEach((sel) => {
      const c = this.q(sel);
      if (!c) return;
      // 既存の描画を保持するため、drawキャンバスは内容を退避して復元
      if (sel === ".draw-canvas" && c.width && c.height) {
        const tmp = document.createElement("canvas");
        tmp.width = c.width;
        tmp.height = c.height;
        tmp.getContext("2d").drawImage(c, 0, 0);
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(tmp, 0, 0, w, h);
      } else {
        c.width = w;
        c.height = h;
      }
    });
    // リサイズでpose/balance/重畳が消えるため、停止中でも再描画（残像対策）
    if (this.poseOn) this._detectOnce();
  }

  // ---------- 骨格検出 ----------
  async togglePose() {
    const btn = this.q(".pose-toggle");
    const status = this.q(".pose-status");
    this.poseOn = !this.poseOn;
    btn.dataset.on = String(this.poseOn);

    if (this.poseOn) {
      if (!this.poseLandmarker) {
        status.hidden = false;
        status.classList.remove("error");
        status.textContent = "AIモデルを読み込み中…（初回は数秒）";
        try {
          this.poseLandmarker = await createPoseLandmarker();
        } catch (err) {
          status.classList.add("error");
          status.textContent = "骨格検出の読み込みに失敗しました（ネット接続を確認してください）";
          this.poseOn = false;
          btn.dataset.on = "false";
          console.error(err);
          return;
        }
      }
      status.hidden = false;
      status.classList.remove("error");
      this.lastPoseTs = -1;
      const vid = this.q(".video");
      if (!vid.paused && !vid.ended) {
        status.textContent = "骨格検出: ON";
        this._startPoseLoop();
      } else {
        status.textContent = "骨格検出: ON ／ ▶再生でリアルタイム追従（コマ送り・シークも可）";
        this._detectOnce();
      }
    } else {
      status.textContent = "骨格検出: OFF";
      this._clearPose();
      this._clearBalance();
      this._clearCompareReadout();
      this._clearCoach();
      this._stopPoseLoop();
    }
  }

  // 再生中は1フレームごとに検出。requestVideoFrameCallback があればそれを使い、
  // 無ければ requestAnimationFrame にフォールバックする。
  _startPoseLoop() {
    const v = this.q(".video");
    this._stopPoseLoop();
    if (typeof v.requestVideoFrameCallback === "function") {
      const cb = () => {
        if (!this.poseOn) { this._rvfcId = null; return; }
        this._detectOnce();
        if (!v.paused && !v.ended) this._rvfcId = v.requestVideoFrameCallback(cb);
        else this._rvfcId = null;
      };
      this._rvfcId = v.requestVideoFrameCallback(cb);
    } else {
      const loop = () => {
        if (!this.poseOn || v.paused || v.ended) { this.poseLoop = null; return; }
        this._detectOnce();
        this.poseLoop = requestAnimationFrame(loop);
      };
      this.poseLoop = requestAnimationFrame(loop);
    }
  }

  _stopPoseLoop() {
    if (this.poseLoop) { cancelAnimationFrame(this.poseLoop); this.poseLoop = null; }
    const v = this.q(".video");
    if (this._rvfcId && v && typeof v.cancelVideoFrameCallback === "function") {
      v.cancelVideoFrameCallback(this._rvfcId);
    }
    this._rvfcId = null;
  }

  _detectOnce() {
    const v = this.q(".video");
    if (!this.poseLandmarker || !v.videoWidth) return;
    // タイムスタンプは単調増加が必須。シーク後に巻き戻った場合は加算してずらす。
    let ts = v.currentTime * 1000;
    if (ts <= this.lastPoseTs) ts = this.lastPoseTs + 1;
    this.lastPoseTs = ts;
    try {
      const result = this.poseLandmarker.detectForVideo(v, ts);
      this._drawPose(result);
    } catch (err) {
      console.error(err);
    }
  }

  _drawPose(result) {
    const c = this.q(".pose-canvas");
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    if (!result.landmarks || !result.landmarks.length) {
      // landmarks 消失フレーム: 共有状態と全オーバーレイをリセット
      this.lastLandmarks = null;
      this.lastAngles = null;
      this.balance = null;
      this._clearBalance();
      this._clearCompareReadout();
      this._clearCoach();
      return;
    }

    const lm = result.landmarks[0];
    this.lastLandmarks = lm; // 全機能共有の唯一のlandmarksキャッシュ
    const W = c.width, H = c.height;

    // 接続線
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(90, 169, 255, 0.9)";
    POSE_CONNECTIONS.forEach(([a, b]) => {
      if (!lm[a] || !lm[b]) return;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
      ctx.stroke();
    });

    // 関節点
    ctx.fillStyle = "#34e1c4";
    lm.forEach((p, i) => {
      if (i < 11) return; // 顔の細かい点は省略
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 固定描画順: 自動角度 → 重心(別canvas) → コーチング → お手本ゴースト(pose-canvas相乗り)
    this._drawAutoAngles(ctx, lm, W, H); // this.lastAngles を更新
    this._updateBalance(lm);             // balance-canvas 描画 + this.balance 更新
    this._updateCoach();                 // 数値→改善アドバイスに翻訳
    this._drawRefOverlay(ctx, lm, W, H); // お手本ゴースト + compare-readout
  }

  _drawAutoAngles(ctx, lm, W, H) {
    const angles = [
      { name: "右膝", key: "rightKnee", a: 24, b: 26, c: 28 },
      { name: "左膝", key: "leftKnee", a: 23, b: 25, c: 27 },
      { name: "右股関節", key: "rightHip", a: 12, b: 24, c: 26 },
      { name: "左股関節", key: "leftHip", a: 11, b: 23, c: 25 },
    ];
    const cache = {};
    ctx.font = "bold 13px system-ui";
    angles.forEach(({ name, key, a, b, c }) => {
      if (!lm[a] || !lm[b] || !lm[c]) return;
      const A = { x: lm[a].x * W, y: lm[a].y * H };
      const B = { x: lm[b].x * W, y: lm[b].y * H };
      const C = { x: lm[c].x * W, y: lm[c].y * H };
      const deg = angleAt(A, B, C);
      cache[key] = deg;
      const txt = `${name} ${Math.round(deg)}°`;
      ctx.fillStyle = "rgba(6,35,30,0.8)";
      const w = ctx.measureText(txt).width + 8;
      ctx.fillRect(B.x + 6, B.y - 16, w, 18);
      ctx.fillStyle = "#34e1c4";
      ctx.fillText(txt, B.x + 10, B.y - 2);
    });
    this.lastAngles = Object.keys(cache).length ? cache : null; // 記録機能の角度ソース
  }

  _clearPose() {
    const c = this.q(".pose-canvas");
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
  }

  // ---------- 重心バランス分析 ----------
  // landmarks(正規化座標)から重心バランス指標を計算（純関数・描画副作用なし）
  _computeBalance(lm) {
    const v = (i) => (lm[i] ? (lm[i].visibility ?? 1) : 0);
    const pt = (i) => ({ x: lm[i].x, y: lm[i].y });
    // 使える側だけで中点を取る（片側欠損に強い）
    const mid = (i, j) => {
      const vi = v(i), vj = v(j);
      if (vi < 0.2 && vj < 0.2) return null;
      if (vi < 0.2) return pt(j);
      if (vj < 0.2) return pt(i);
      return { x: (lm[i].x + lm[j].x) / 2, y: (lm[i].y + lm[j].y) / 2 };
    };
    const shoulderMid = mid(11, 12);
    const hipMid = mid(23, 24);
    const ankleMid = mid(27, 28);
    if (!shoulderMid || !hipMid || !ankleMid) return null;

    // CoM: 骨盤寄りの加重平均（解剖学的近似）
    const com = {
      x: hipMid.x * 0.65 + shoulderMid.x * 0.35,
      y: hipMid.y * 0.65 + shoulderMid.y * 0.35,
    };

    // 左右スケール: 足首幅 or 肩幅の大きい方
    const ankleW = Math.abs((lm[27]?.x ?? 0) - (lm[28]?.x ?? 0));
    const shoulderW = Math.abs((lm[11]?.x ?? 0) - (lm[12]?.x ?? 0));
    const scale = Math.max(ankleW, shoulderW, 0.001);
    const ratio = (com.x - ankleMid.x) / (scale / 2);
    const balancePct = Math.max(-1, Math.min(1, ratio)) * 100; // +右 / -左

    // 前傾角(体幹): 鉛直(上)からの符号付き角度。+で画面右へ傾き
    const trunk = { x: shoulderMid.x - hipMid.x, y: shoulderMid.y - hipMid.y };
    const lean = (Math.atan2(trunk.x, -trunk.y) * 180) / Math.PI;
    const spine = { x: shoulderMid.x - ankleMid.x, y: shoulderMid.y - ankleMid.y };
    const spineLean = (Math.atan2(spine.x, -spine.y) * 180) / Math.PI;

    const view = shoulderW < 0.12 ? "side" : "front"; // カメラ向き簡易推定
    const conf = (v(11) + v(12) + v(23) + v(24) + v(27) + v(28)) / 6;

    return {
      com, shoulderMid, hipMid, ankleMid,
      balancePct: Math.round(balancePct),
      lean: Math.round(lean * 10) / 10,
      spineLean: Math.round(spineLean * 10) / 10,
      view, conf: Math.round(conf * 100) / 100,
      t: this.q(".video").currentTime,
    };
  }

  // 計算→保持→オーバーレイ描画 / 数値カード更新
  _updateBalance(lm) {
    const b = this._computeBalance(lm);
    this.balance = b; // 記録機能が参照する最新値
    const c = this.q(".balance-canvas");
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    const card = this.q(".balance-readout");
    if (!b) { if (card) card.hidden = true; return; }
    const W = c.width, H = c.height;
    const low = b.conf < 0.5;
    const sideUnsure = b.view === "side";

    // CoM マーカー（菱形）
    const cx = b.com.x * W, cy = b.com.y * H;
    ctx.save();
    ctx.globalAlpha = low ? 0.4 : 1;
    ctx.fillStyle = "#34e1c4";
    ctx.strokeStyle = "#06231e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 9, cy);
    ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 9, cy);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // CoMから鉛直の重力線
    ctx.strokeStyle = "rgba(52,225,196,0.5)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, b.ankleMid.y * H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 左右バランスバー（下部オーバーレイ）
    const barW = Math.min(W * 0.4, 220), barH = 10;
    const bx = (W - barW) / 2, by = H - 26;
    ctx.save();
    ctx.globalAlpha = sideUnsure ? 0.45 : 1;
    ctx.fillStyle = "rgba(6,35,30,0.7)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = "rgba(255,255,255,0.25)"; // 中央線
    ctx.fillRect(bx + barW / 2 - 1, by - 3, 2, barH + 6);
    const frac = Math.max(-1, Math.min(1, b.balancePct / 100));
    const fillFrom = bx + barW / 2;
    const fillW = (barW / 2) * frac;
    ctx.fillStyle = Math.abs(b.balancePct) > 30 ? "#ff6b6b" : "#34e1c4";
    ctx.fillRect(Math.min(fillFrom, fillFrom + fillW), by, Math.abs(fillW), barH);
    ctx.restore();

    // HTML数値カード
    if (card) {
      const dir = b.balancePct > 0 ? "右" : b.balancePct < 0 ? "左" : "中央";
      card.hidden = false;
      card.classList.toggle("warn", Math.abs(b.balancePct) > 30);
      card.innerHTML =
        `<div class="bal-row"><span>左右荷重</span><b>${dir} ${Math.abs(b.balancePct)}%</b></div>` +
        `<div class="bal-row"><span>上体の傾き</span><b>${b.lean > 0 ? "右" : "左"}${Math.abs(b.lean)}°</b></div>` +
        (sideUnsure ? `<div class="bal-note">横向き? 左右値は参考値</div>` : "") +
        (low ? `<div class="bal-note">検出不安定</div>` : "");
    }
  }

  _clearBalance() {
    const c = this.q(".balance-canvas");
    if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
    const card = this.q(".balance-readout");
    if (card) card.hidden = true;
    this.balance = null;
  }

  // ---------- コーチング（数値→改善アドバイス） ----------
  _updateCoach() {
    const el = this.q(".coach-panel");
    if (!el) return;
    const a = this.lastAngles, b = this.balance;
    if (!a && !b) { el.hidden = true; return; }

    // お手本重畳中は「お手本との差」を優先してアドバイス
    const ref = Panel.sharedRefPose;
    if (this.compareOn && ref && ref.angles && this.lastLandmarks) {
      const cur = normalizePose(this.lastLandmarks, this._videoAspect());
      if (cur) {
        const curAng = computeJointAngles(cur.norm);
        const v = this.q(".video");
        if (v && !v.paused && !v.ended) {
          // 再生中: チラつかない「区間の平均」を表示
          this._accumCompare(curAng, ref.angles);
          this._renderCompareSummary(el);
          return;
        }
        // 一時停止/コマ送り中: その1コマの詳細を表示
        const refTips = coachTipsVsRef(curAng, ref.angles);
        if (refTips.length) {
          const rank = { bad: 0, warn: 1, good: 2 };
          refTips.sort((x, y) => rank[x.level] - rank[y.level]);
          el.hidden = false;
          el.dataset.mode = "detail";
          el.innerHTML =
            `<div class="coach-title">💡 お手本との比較（この1コマ）</div>` +
            refTips.slice(0, 3).map((t) => `<div class="coach-tip ${t.level}">${t.text}</div>`).join("") +
            `<div class="coach-note">お手本フォームとの関節角度の差から算出。</div>`;
          return;
        }
      }
    }

    const ema = (p, v, k = 0.35) => (p == null ? v : p * (1 - k) + v * k);
    const kneeVals = [];
    if (a) {
      if (a.leftKnee != null) kneeVals.push(a.leftKnee);
      if (a.rightKnee != null) kneeVals.push(a.rightKnee);
    }
    const kneeRaw = kneeVals.length ? kneeVals.reduce((x, y) => x + y, 0) / kneeVals.length : null;
    if (kneeRaw != null) this._sm.knee = ema(this._sm.knee, kneeRaw);
    if (b && b.balancePct != null) this._sm.bal = ema(this._sm.bal, b.balancePct);
    if (b && b.lean != null) this._sm.lean = ema(this._sm.lean, b.lean);

    const tips = coachTips({
      kneeAvg: this._sm.knee,
      balancePct: this._sm.bal == null ? null : Math.round(this._sm.bal),
      lean: this._sm.lean == null ? null : Math.round(this._sm.lean),
      view: b ? b.view : "front",
      conf: b ? b.conf : null,
    });
    if (!tips.length) { el.hidden = true; return; }

    const rank = { bad: 0, warn: 1, good: 2 };
    tips.sort((x, y) => rank[x.level] - rank[y.level]);
    el.hidden = false;
    el.innerHTML =
      `<div class="coach-title">💡 アドバイス</div>` +
      tips.slice(0, 3).map((t) => `<div class="coach-tip ${t.level}">${t.text}</div>`).join("") +
      `<div class="coach-note">※一般的な目安です。コブ・パウダー・斜度で最適姿勢は変わります。</div>`;
  }

  _clearCoach() {
    const el = this.q(".coach-panel");
    if (el) { el.hidden = true; el.innerHTML = ""; }
    this._sm = { knee: null, bal: null, lean: null };
    this._cmpAccum = null;
  }

  _resetCmpAccum() {
    this._cmpAccum = { n: 0, nK: 0, nH: 0, nT: 0, sumK: 0, sumH: 0, sumT: 0, sumScore: 0, worst: -1, worstT: 0, tick: 0 };
  }

  // お手本との差を1フレーム分、平均に足し込む（再生中に呼ばれる）
  _accumCompare(cur, ref) {
    if (!this._cmpAccum) this._resetCmpAccum();
    const a = this._cmpAccum;
    const avg = (x, y) => {
      const xs = [x, y].filter((v) => v != null);
      return xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : null;
    };
    const ck = avg(cur.lKnee, cur.rKnee), rk = avg(ref.lKnee, ref.rKnee);
    const ch = avg(cur.lHip, cur.rHip), rh = avg(ref.lHip, ref.rHip);
    const diffs = [];
    ["rKnee", "lKnee", "rHip", "lHip", "rAnk", "lAnk", "torso"].forEach((k) => {
      if (cur[k] != null && ref[k] != null) diffs.push(Math.abs(cur[k] - ref[k]));
    });
    if (!diffs.length) return;
    const meanAbs = diffs.reduce((p, q) => p + q, 0) / diffs.length;
    a.n++;
    a.sumScore += Math.max(0, 100 - meanAbs * 2.2);
    if (ck != null && rk != null) { a.sumK += ck - rk; a.nK++; }
    if (ch != null && rh != null) { a.sumH += ch - rh; a.nH++; }
    if (cur.torso != null && ref.torso != null) { a.sumT += Math.abs(cur.torso) - Math.abs(ref.torso); a.nT++; }
    const t = this.q(".video").currentTime;
    if (meanAbs > a.worst) { a.worst = meanAbs; a.worstT = t; }
  }

  _renderCompareSummary(el) {
    const a = this._cmpAccum;
    if (!a || !a.n) { el.hidden = true; return; }
    a.tick++;
    if (el.dataset.mode === "summary" && a.tick % 5 !== 0) return; // 5フレームに1回だけ更新（読みやすさ優先）

    const tips = [];
    if (a.nK) {
      const d = a.sumK / a.nK;
      const lvl = Math.abs(d) < 10 ? "good" : Math.abs(d) < 20 ? "warn" : "bad";
      tips.push({ lvl, t: Math.abs(d) < 10 ? "膝の曲げはお手本とほぼ同じ ✓"
        : `膝が平均で お手本より ${Math.round(Math.abs(d))}° ${d > 0 ? "伸びています（もっと曲げる）" : "深く曲がっています"}` });
    }
    if (a.nH) {
      const d = a.sumH / a.nH;
      if (Math.abs(d) >= 10) tips.push({ lvl: "warn", t: `腰が平均 ${Math.round(Math.abs(d))}° ${d > 0 ? "伸び気味（股関節から前傾を）" : "前傾深め"}` });
    }
    if (a.nT) {
      const d = a.sumT / a.nT;
      if (d >= 12) tips.push({ lvl: "warn", t: "上体の傾きがお手本より大きめ（軸をまっすぐ）" });
    }
    const avgScore = Math.round(a.sumScore / a.n);
    const rank = { bad: 0, warn: 1, good: 2 };
    tips.sort((x, y) => rank[x.lvl] - rank[y.lvl]);

    el.hidden = false;
    el.dataset.mode = "summary";
    el.innerHTML =
      `<div class="coach-title">💡 お手本との比較（再生区間の平均）</div>` +
      tips.slice(0, 3).map((t) => `<div class="coach-tip ${t.lvl}">${t.t}</div>`).join("") +
      `<div class="coach-summary-row">一致度 平均 <b>${avgScore}</b> ／ ${a.n}フレーム</div>` +
      `<button class="coach-jump" data-jump="${a.worstT.toFixed(2)}">▶ 最もズレた瞬間で止めて見る</button>` +
      `<div class="coach-note">スロー（速度スライダー）やコマ送り（⏮⏭ / ←→）にすると1コマずつ細部まで見られます。</div>`;
  }

  // ---------- 理想フォーム比較 ----------
  _videoAspect() {
    const v = this.q(".video");
    return (v && v.videoWidth && v.videoHeight) ? v.videoWidth / v.videoHeight : 1;
  }

  captureReference() {
    if (!this.lastLandmarks) {
      this._setCompareStatus("基準にするフレームで骨格を検出してから登録してください", true);
      return;
    }
    const lm = cloneLandmarks(this.lastLandmarks);
    const asp = this._videoAspect();
    const n = normalizePose(lm, asp);
    if (!n) { this._setCompareStatus("腰・肩が検出できず基準登録できません", true); return; }
    Panel.sharedRefPose = {
      schemaVersion: 1,
      landmarks: lm,
      norm: n.norm,
      angles: computeJointAngles(n.norm),
      aspect: asp,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem("snowboard.refPose", JSON.stringify(Panel.sharedRefPose));
    } catch (e) { console.warn("基準フォームの保存に失敗", e); }
    this._setCompareStatus("基準フォームを登録しました ✓");
    panels.forEach((p) => p._refreshCompareButtons());
  }

  toggleCompare() {
    if (!Panel.sharedRefPose) {
      this._setCompareStatus("先に「基準登録」で基準フォームを登録してください（自分のベストランでもOK）", true);
      return;
    }
    this.compareOn = !this.compareOn;
    this.q(".compare-toggle").dataset.on = String(this.compareOn);
    this._resetCmpAccum();
    if (!this.compareOn) {
      this._clearCompareReadout();
      this._setCompareStatus("基準と重畳: OFF");
      if (this.poseOn) this._detectOnce(); // ゴーストを消すため再描画
      return;
    }
    if (!this.poseOn) {
      this._setCompareStatus("重畳には骨格検出(骨格ボタン)をONにしてください", true);
    } else {
      const src = Panel.sharedRefPose.source ? `（お手本: ${Panel.sharedRefPose.source}）` : "";
      this._setCompareStatus("基準と重畳: ON" + src);
      this._detectOnce();
    }
  }

  // 基準フォーム(正規化座標)を現フレームの胴に合わせて逆変換しゴースト描画 + ズレ色分け
  _drawRefOverlay(ctx, lm, W, H) {
    if (!this.compareOn || !Panel.sharedRefPose) return;
    const ref = Panel.sharedRefPose;
    const cur = normalizePose(lm, this._videoAspect());
    if (!cur) return;
    const place = (np) => np ? {
      x: ((np.x * cur.scale + cur.hipMid.x) / cur.aspect) * W,
      y: (np.y * cur.scale + cur.hipMid.y) * H,
    } : null;
    const curAng = computeJointAngles(cur.norm);
    const jointKey = { 11: "lHip", 12: "rHip", 23: "lHip", 24: "rHip",
                       25: "lKnee", 26: "rKnee", 27: "lAnk", 28: "rAnk" };
    const sev = (key) => {
      if (ref.angles[key] == null || curAng[key] == null) return -1;
      const d = Math.abs(curAng[key] - ref.angles[key]);
      return d < CMP_GOOD ? 0 : d < CMP_WARN ? 1 : 2;
    };
    const sevColor = [CMP_COLORS.good, CMP_COLORS.warn, CMP_COLORS.bad];
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 4;
    ctx.setLineDash([6, 4]);
    POSE_CONNECTIONS.forEach(([a, b]) => {
      const A = place(ref.norm[a]), B = place(ref.norm[b]);
      if (!A || !B) return;
      const s = Math.max(sev(jointKey[a]), sev(jointKey[b]));
      ctx.strokeStyle = s < 0 ? CMP_COLORS.na : sevColor[s];
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
    this._renderCompareReadout(ref.angles, curAng);
  }

  _renderCompareReadout(refAng, curAng) {
    const el = this.q(".compare-readout");
    if (!el) return;
    el.hidden = false;
    let sum = 0, n = 0;
    const items = COMPARE_JOINTS.concat([{ key: "torso", name: "胴の傾き" }]);
    const rows = items.map((j) => {
      if (refAng[j.key] == null || curAng[j.key] == null) return "";
      const d = Math.abs(curAng[j.key] - refAng[j.key]);
      sum += d; n++;
      return `<div class="cmp-row"><span>${j.name}</span>` +
             `<b style="color:${cmpColor(d)}">${d.toFixed(0)}°</b></div>`;
    }).join("");
    const score = n ? Math.max(0, Math.round(100 - (sum / n) * 2.2)) : 0;
    el.innerHTML = `<div class="cmp-score">一致度 ${score}</div>${rows}`;
  }

  _clearCompareReadout() {
    const el = this.q(".compare-readout");
    if (el) { el.hidden = true; el.innerHTML = ""; }
  }

  _setCompareStatus(msg, isError = false) {
    const s = this.q(".compare-status");
    if (!s) return;
    s.hidden = false;
    s.classList.toggle("error", isError);
    s.textContent = msg;
  }

  _refreshCompareButtons() {
    const has = !!Panel.sharedRefPose;
    const btn = this.q(".compare-toggle");
    if (!btn) return;
    btn.disabled = !has;
    btn.title = has ? "基準フォームを重畳" : "先に基準登録が必要です";
  }

  // ---------- 自動レビュー（動画全体スキャン） ----------
  async runAutoReview() {
    if (this.root.dataset.state !== "loaded" || this._scanning) return;
    const v = this.q(".video");
    if (!v.duration || !isFinite(v.duration)) return;
    const btn = this.q(".auto-review");
    const panel = this.q(".review-panel");

    if (!this.poseLandmarker) {
      panel.hidden = false;
      panel.innerHTML = `<div class="review-title">🔍 AIモデルを読み込み中…（初回は数秒）</div>`;
      try { this.poseLandmarker = await createPoseLandmarker(); }
      catch (e) {
        panel.innerHTML = `<div class="review-title">🔍 自動レビュー</div><div class="review-empty">骨格AIの読み込みに失敗しました（ネット接続を確認）</div>`;
        return;
      }
    }

    this._scanning = true;
    btn.disabled = true;
    v.pause();
    this._stopPoseLoop();
    panel.hidden = false;
    panel.innerHTML = `<div class="review-title">🔍 自動レビュー中… <span class="review-prog">0%</span></div>`;

    const dur = v.duration;
    const aspect = this._videoAspect();
    const ref = Panel.sharedRefPose;
    const step = dur > 120 ? 0.3 : 0.2;
    const wasT = v.currentTime;
    const seekTo = (t) => new Promise((res) => {
      const on = () => { v.removeEventListener("seeked", on); res(); };
      v.addEventListener("seeked", on);
      v.currentTime = t;
    });
    const samples = [];
    let ts = (this.lastPoseTs || 0) + 1;
    try {
      for (let t = 0; t <= dur - 0.05; t += step) {
        await seekTo(t);
        ts += 50; this.lastPoseTs = ts;
        let res;
        try { res = this.poseLandmarker.detectForVideo(v, ts); } catch (e) { continue; }
        if (res.landmarks && res.landmarks.length) {
          const lm = res.landmarks[0];
          const n = normalizePose(lm, aspect);
          const ang = n ? computeJointAngles(n.norm) : {};
          const bal = this._computeBalance(lm);
          let refDiff = null;
          if (ref && ref.angles && n) {
            const ks = ["rKnee", "lKnee", "rHip", "lHip", "rAnk", "lAnk", "torso"];
            const ds = ks.filter((k) => ang[k] != null && ref.angles[k] != null).map((k) => Math.abs(ang[k] - ref.angles[k]));
            if (ds.length) refDiff = ds.reduce((a, b) => a + b, 0) / ds.length;
          }
          samples.push({ t, ang, bal, refDiff });
          this._drawPose(res); // 進行中の骨格を表示
        }
        const pe = panel.querySelector(".review-prog");
        if (pe) pe.textContent = Math.round((t / dur) * 100) + "%";
      }
    } finally {
      this._scanning = false;
      btn.disabled = false;
      await seekTo(Math.min(wasT, dur));
      if (this.poseOn) this._detectOnce(); else this._clearPose();
    }

    const issues = analyzeReview(samples, !!(ref && ref.angles));
    this._renderReview(panel, issues);
  }

  _renderReview(panel, issues) {
    if (!issues.length) {
      panel.innerHTML = `<div class="review-title">🔍 自動レビュー</div><div class="review-empty">大きな崩れは見つかりませんでした 👍 良い感じです！</div>`;
      return;
    }
    panel.innerHTML =
      `<div class="review-title">🔍 自動レビュー（${issues.length}件・クリックでその瞬間へ）</div>` +
      issues.map((e) => `<button class="review-item ${e.sev}" data-t="${e.t.toFixed(2)}">
          <span class="ri-time">${fmtTime(e.t)}</span>
          <span class="ri-label">${escapeHtml(e.label)}</span>
          <span class="ri-advice">${escapeHtml(e.advice)}</span>
        </button>`).join("");
  }

  _clearReview() {
    const p = this.q(".review-panel");
    if (p) { p.hidden = true; p.innerHTML = ""; }
  }

  static loadSavedRef() {
    try {
      const raw = localStorage.getItem("snowboard.refPose");
      if (raw) { Panel.sharedRefPose = JSON.parse(raw); return; }
    } catch (e) { console.warn(e); }
    // 保存が無ければ、組み込みのお手本（上手い人）を既定の基準にする
    const d = window.SNOW_DEFAULT_REF;
    if (d && d.landmarks) {
      const n = normalizePose(d.landmarks, d.aspect || 1);
      if (n) {
        Panel.sharedRefPose = {
          schemaVersion: 1,
          landmarks: d.landmarks,
          norm: n.norm,
          angles: computeJointAngles(n.norm),
          aspect: d.aspect || 1,
          savedAt: null,
          source: d.source,
          builtin: true,
        };
      }
    }
  }

  // ---------- 描画ツール ----------
  selectTool(tool) {
    this.tool = this.tool === tool ? "none" : tool;
    this.root.querySelectorAll(".tool-btn[data-tool]").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.tool === this.tool && this.tool !== "none")
    );
    const dc = this.q(".draw-canvas");
    dc.classList.toggle("active", this.tool !== "none");
    this.anglePoints = [];

    // 使い方ヒント（押すだけでは何も起きないので案内）
    const hint = this.q(".tool-hint");
    if (hint) {
      const msgs = {
        angle: "📐 角度ツール: 測りたい関節を中心に、動画上を3点クリック（例: 股関節 → 膝 → 足首）",
        line: "📏 直線ツール: 動画上をドラッグして直線を引く",
        pen: "✏️ ペンツール: 動画上をドラッグして書き込み",
      };
      if (this.tool === "none" || !msgs[this.tool]) {
        hint.hidden = true;
        hint.textContent = "";
      } else {
        hint.hidden = false;
        hint.textContent = msgs[this.tool];
      }
    }
  }

  _canvasPt(e) {
    const c = this.q(".draw-canvas");
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  }

  _onPointerDown(e) {
    if (this.tool === "none") return;
    const ctx = this.q(".draw-canvas").getContext("2d");
    const pt = this._canvasPt(e);

    if (this.tool === "angle") {
      this.anglePoints.push(pt);
      this._drawAnglePoints();
      if (this.anglePoints.length === 3) {
        this._finalizeAngle();
        this.anglePoints = [];
      }
      return;
    }

    this.drawing = true;
    this.startPt = pt;
    if (this.tool === "line") {
      const c = this.q(".draw-canvas");
      this.savedImage = ctx.getImageData(0, 0, c.width, c.height);
    } else if (this.tool === "pen") {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    }
  }

  _onPointerMove(e) {
    if (!this.drawing) return;
    const ctx = this.q(".draw-canvas").getContext("2d");
    const pt = this._canvasPt(e);
    if (this.tool === "pen") {
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    } else if (this.tool === "line") {
      ctx.putImageData(this.savedImage, 0, 0);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.startPt.x, this.startPt.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  }

  _onPointerUp() {
    this.drawing = false;
    this.savedImage = null;
  }

  _drawAnglePoints() {
    const ctx = this.q(".draw-canvas").getContext("2d");
    ctx.fillStyle = this.color;
    this.anglePoints.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _finalizeAngle() {
    const [A, B, C] = this.anglePoints;
    const ctx = this.q(".draw-canvas").getContext("2d");
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(C.x, C.y);
    ctx.stroke();

    const deg = angleAt(A, B, C);
    const txt = `${Math.round(deg)}°`;
    ctx.font = "bold 16px system-ui";
    ctx.fillStyle = "rgba(6,35,30,0.85)";
    const w = ctx.measureText(txt).width + 10;
    ctx.fillRect(B.x + 8, B.y - 10, w, 22);
    ctx.fillStyle = this.color;
    ctx.fillText(txt, B.x + 13, B.y + 6);
  }

  clearDrawing() {
    const c = this.q(".draw-canvas");
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    this.anglePoints = [];
  }

  // ---------- 記録 ----------
  // video + pose + balance + draw を320pxに合成してJPEG dataURLを返す
  _snapshotDataUrl() {
    const v = this.q(".video");
    if (!v || !v.videoWidth) return "";
    const aspect = v.videoWidth / v.videoHeight;
    const W = 320, H = Math.round(W / aspect);
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const ctx = off.getContext("2d");
    try { ctx.drawImage(v, 0, 0, W, H); } catch (e) { return ""; }
    const pc = this.q(".pose-canvas");
    if (this.poseOn && pc && pc.width) ctx.drawImage(pc, 0, 0, W, H);
    const bc = this.q(".balance-canvas");
    if (this.poseOn && bc && bc.width) ctx.drawImage(bc, 0, 0, W, H);
    const dc = this.q(".draw-canvas");
    if (dc && dc.width) ctx.drawImage(dc, 0, 0, W, H);
    try { return off.toDataURL("image/jpeg", 0.6); } catch (e) { return ""; }
  }

  saveRecord() {
    if (this.root.dataset.state !== "loaded") { alert("先に動画を読み込んでください"); return; }
    const note = (prompt("メモ（任意・空欄可）", "") ?? "").slice(0, 200);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const rec = {
      schemaVersion: 1,
      id: (crypto.randomUUID ? crypto.randomUUID() : "r" + Date.now() + Math.random().toString(16).slice(2)),
      ts: now.toISOString(),
      dateKey,
      label: this.label,
      angles: this.lastAngles ? { ...this.lastAngles } : null,
      balance: this.balance ? this.balance.balancePct : null,
      note,
      thumb: this._snapshotDataUrl(),
    };
    if (RecordStore.add(rec)) {
      const status = this.q(".pose-status");
      status.hidden = false;
      status.classList.remove("error");
      status.textContent = "記録しました ✓";
      setTimeout(() => { if (status.textContent === "記録しました ✓") status.hidden = true; }, 1800);
    }
  }
}

// 基準ポーズの全Panel共有スロット
Panel.sharedRefPose = null;

// お手本（基準フォーム）の関節角度と、現フレームの角度を比べてアドバイスを出す
function coachTipsVsRef(cur, ref) {
  const tips = [];
  const avg = (a, b) => {
    const xs = [a, b].filter((v) => v != null);
    return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null;
  };
  const TH = 10; // 許容差（度）

  const ck = avg(cur.lKnee, cur.rKnee), rk = avg(ref.lKnee, ref.rKnee);
  if (ck != null && rk != null) {
    const d = ck - rk;
    if (d > TH) tips.push({ level: "bad", text: `膝がお手本より伸びています（約${Math.round(d)}°浅い）。もっと曲げて低く構えましょう。` });
    else if (d < -TH) tips.push({ level: "warn", text: `膝はお手本より深く曲がっています（約${Math.round(-d)}°）。` });
    else tips.push({ level: "good", text: "膝の曲げはお手本とほぼ同じ ✓" });
  }

  const ch = avg(cur.lHip, cur.rHip), rh = avg(ref.lHip, ref.rHip);
  if (ch != null && rh != null) {
    const d = ch - rh;
    if (d > TH) tips.push({ level: "warn", text: `腰が伸びて上体が起き気味（お手本より約${Math.round(d)}°）。股関節から前傾を作りましょう。` });
    else if (d < -TH) tips.push({ level: "warn", text: `お手本より前傾が深めです（約${Math.round(-d)}°）。` });
  }

  if (cur.torso != null && ref.torso != null) {
    const d = Math.abs(cur.torso) - Math.abs(ref.torso);
    if (d > 12) tips.push({ level: "warn", text: "上体の傾きがお手本より大きいです。軸をまっすぐ保ちましょう。" });
  }
  return tips;
}

// 検出した数値から、レベル別の平易な改善アドバイスを生成する
function coachTips(m) {
  const tips = [];
  const dir = (v) => (v > 0 ? "右" : "左");
  const level = coachLevel; // beginner | turn | carving

  if (m.conf != null && m.conf < 0.4) {
    tips.push({ level: "warn", text: "検出が不安定です。全身がはっきり映る明るい動画だと精度が上がります。" });
  }

  // 膝の曲げ（初心者は棒立ちになりがち。基本中の基本）
  if (m.kneeAvg != null) {
    const k = Math.round(m.kneeAvg);
    if (level === "beginner") {
      if (m.kneeAvg > 168) tips.push({ level: "bad", text: `棒立ちになっています（膝 ${k}°）。膝を軽く曲げ、いつでもしゃがめる姿勢が基本です。` });
      else if (m.kneeAvg > 155) tips.push({ level: "warn", text: `もう少し膝を曲げましょう（${k}°）。膝のクッションで安定します。` });
      else tips.push({ level: "good", text: `良い構えです。膝が曲がっています（${k}°）✓` });
    } else {
      if (m.kneeAvg > 165) tips.push({ level: "bad", text: `膝が伸び気味（${k}°）。曲げて低く構えると安定します。` });
      else if (m.kneeAvg > 150) tips.push({ level: "warn", text: `もう少し膝を曲げると安定します（${k}°）。` });
      else if (m.kneeAvg >= 100) tips.push({ level: "good", text: `膝の曲げは良好（${k}°）✓` });
      else tips.push({ level: "warn", text: `深い屈伸（${k}°）。低すぎると動きづらくなります。` });
    }
  }

  // 左右バランス（横向き撮影では意味が薄いので出さない）
  if (m.balancePct != null && m.view !== "side") {
    const ab = Math.abs(m.balancePct);
    const th1 = level === "beginner" ? 25 : 18;
    const th2 = level === "beginner" ? 40 : 35;
    if (ab > th2) tips.push({ level: "bad", text: `${dir(m.balancePct)}に乗りすぎ（${ab}%）。板の真ん中・両足の真上に立つ意識を。` });
    else if (ab > th1) tips.push({ level: "warn", text: `やや${dir(m.balancePct)}寄り（${ab}%）。中心に乗ると安定します。` });
    else tips.push({ level: "good", text: `左右バランス良好（${ab}%）✓` });
  }

  // 上体の傾き
  if (m.lean != null) {
    const ab = Math.abs(m.lean);
    if (level === "beginner") {
      if (ab > 22) tips.push({ level: "warn", text: `上体が${dir(m.lean)}に傾いています（${ab}°）。背骨をまっすぐ、板の真上に立つ意識を。` });
    } else if (ab > 28) {
      tips.push({ level: "warn", text: `上体が${dir(m.lean)}に傾きすぎ（${ab}°）。腰から角付けし上体を起こすと、よりキレのあるターンに。` });
    }
  }

  // 初心者: 基本姿勢が取れていたら次の意識ポイントを提示
  if (level === "beginner" && !tips.some((t) => t.level !== "good")) {
    tips.push({ level: "good", text: "基本姿勢OK。あとは目線を進行方向へ、肩の力を抜いてリラックス。" });
  }

  return tips;
}

// 左右の膝角度の平均
function avgKnee(ang) {
  const xs = [ang.lKnee, ang.rKnee].filter((v) => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// 秒数を m:ss 表記に
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function finishEvt(e) {
  const ratio = e.val / e.th;
  e.sev = ratio >= 1.3 ? "bad" : "warn";
  e.score = ratio + (e.lastT - e.startT) * 0.1; // 重症度＋継続時間で優先度
  return e;
}

// スキャン結果(samples)から問題区間を検出してイベント配列を返す
function analyzeReview(samples, hasRef) {
  const lvl = coachLevel;
  const TH = { knee: lvl === "beginner" ? 168 : 165, bal: lvl === "beginner" ? 35 : 30, lean: 25, ref: 22 };
  const dets = [
    { type: "knee", label: "棒立ち（膝が伸びている）", advice: "膝を曲げて低く構える", th: TH.knee,
      val: (s) => { const k = avgKnee(s.ang); return (k != null && k > TH.knee) ? k : null; } },
    { type: "bal", label: "重心が左右に偏り", advice: "板の真ん中・両足の真上に", th: TH.bal,
      val: (s) => (s.bal && s.bal.view !== "side" && Math.abs(s.bal.balancePct) > TH.bal) ? Math.abs(s.bal.balancePct) : null },
    { type: "lean", label: "上体が傾きすぎ", advice: "背骨をまっすぐ、軸を板の真上に", th: TH.lean,
      val: (s) => (s.bal && Math.abs(s.bal.lean) > TH.lean) ? Math.abs(s.bal.lean) : null },
  ];
  if (hasRef) dets.push({ type: "ref", label: "お手本と大きく違う", advice: "お手本と重ねて差を確認", th: TH.ref,
    val: (s) => (s.refDiff != null && s.refDiff > TH.ref) ? s.refDiff : null });

  const events = [];
  dets.forEach((d) => {
    let cur = null;
    samples.forEach((s) => {
      const v = d.val(s);
      if (v != null) {
        if (cur && s.t - cur.lastT <= 0.6) { cur.lastT = s.t; if (v > cur.val) { cur.val = v; cur.t = s.t; } }
        else { if (cur) events.push(finishEvt(cur)); cur = { type: d.type, label: d.label, advice: d.advice, th: d.th, val: v, t: s.t, startT: s.t, lastT: s.t }; }
      } else if (cur && s.t - cur.lastT > 0.6) { events.push(finishEvt(cur)); cur = null; }
    });
    if (cur) events.push(finishEvt(cur));
  });
  return events.sort((a, b) => b.score - a.score).slice(0, 12);
}

// 3点 A-B-C のBを頂点とする角度（度）
function angleAt(A, B, C) {
  const v1 = { x: A.x - B.x, y: A.y - B.y };
  const v2 = { x: C.x - B.x, y: C.y - B.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m1 = Math.hypot(v1.x, v1.y);
  const m2 = Math.hypot(v2.x, v2.y);
  if (!m1 || !m2) return 0;
  let cos = dot / (m1 * m2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

// ---------- 記録ストア（localStorage） ----------
const RECORDS_KEY = "snowboard.records.v1";

const RecordStore = {
  all() {
    try {
      return JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]");
    } catch (e) {
      console.error("record parse failed", e);
      return [];
    }
  },
  _save(list) {
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      // 容量超過: 古い側のサムネイルを間引いて再試行
      console.warn("localStorage quota, trimming thumbnails", e);
      const trimmed = list.map((r, i) =>
        i < Math.ceil(list.length / 3) ? { ...r, thumb: "" } : r
      );
      try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify(trimmed));
        return true;
      } catch (e2) {
        alert("保存容量が不足しています。古い記録を削除してください。");
        return false;
      }
    }
  },
  add(rec) {
    const list = this.all();
    list.push(rec);
    return this._save(list);
  },
  remove(id) {
    this._save(this.all().filter((r) => r.id !== id));
  },
  importMerge(arr) {
    if (!Array.isArray(arr)) throw new Error("不正なファイル形式です");
    const existing = this.all();
    const ids = new Set(existing.map((r) => r.id));
    const merged = existing.concat(arr.filter((r) => r && r.id && !ids.has(r.id)));
    merged.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    this._save(merged);
  },
};

// ---------- 履歴モーダル ----------
function openHistoryModal() {
  document.getElementById("history-modal").hidden = false;
  renderHistoryList();
  renderGraph();
}
function closeHistoryModal() {
  document.getElementById("history-modal").hidden = true;
}

function renderHistoryList() {
  const wrap = document.getElementById("history-list");
  const list = RecordStore.all().sort((a, b) => new Date(b.ts) - new Date(a.ts));
  if (!list.length) { wrap.innerHTML = '<p class="hist-empty">記録がありません</p>'; return; }
  const byDate = {};
  list.forEach((r) => { (byDate[r.dateKey] ||= []).push(r); });
  wrap.innerHTML = Object.keys(byDate).map((dk) => {
    const rows = byDate[dk].map((r) => {
      const a = r.angles;
      const ang = a
        ? `膝 L${Math.round(a.leftKnee)}°/R${Math.round(a.rightKnee)}° 股 L${Math.round(a.leftHip)}°/R${Math.round(a.rightHip)}°`
        : "角度未計測";
      const bal = r.balance == null ? "" : ` ｜ 重心 ${r.balance}`;
      const t = new Date(r.ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      const thumb = r.thumb
        ? `<img class="hist-thumb" src="${r.thumb}" alt="">`
        : '<div class="hist-thumb hist-thumb--none">—</div>';
      return `<div class="hist-row">${thumb}<div class="hist-meta">` +
             `<div class="hist-time">${t} ｜ ${escapeHtml(r.label || "")}</div>` +
             `<div class="hist-ang">${ang}${bal}</div>` +
             (r.note ? `<div class="hist-note">${escapeHtml(r.note)}</div>` : "") +
             `</div><button class="btn-ghost hist-del" data-id="${r.id}">削除</button></div>`;
    }).join("");
    return `<div class="hist-group"><h4>${dk}</h4>${rows}</div>`;
  }).join("");
  wrap.querySelectorAll(".hist-del").forEach((b) =>
    b.addEventListener("click", () => {
      RecordStore.remove(b.dataset.id);
      renderHistoryList();
      renderGraph();
    })
  );
}

// canvas自前の折れ線グラフ（指標の時系列推移）
function renderGraph() {
  const canvas = document.getElementById("history-graph");
  const ctx = canvas.getContext("2d");
  const metric = document.getElementById("graph-metric").value; // knee|hip|balance
  const cssW = canvas.clientWidth || 560, cssH = 200;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const isTr = metric === "training";
  const recs = isTr
    ? TrainingStore.all().slice().sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((s) => ({ ts: s.date, dateKey: s.date, _n: s.drills.length }))
    : RecordStore.all().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const pick = (r, side) => {
    if (isTr) return r._n;
    if (metric === "balance") return r.balance;
    if (!r.angles) return null;
    return metric === "knee"
      ? (side === "L" ? r.angles.leftKnee : r.angles.rightKnee)
      : (side === "L" ? r.angles.leftHip : r.angles.rightHip);
  };
  const series = (isTr || metric === "balance")
    ? [{ side: "-", color: "#34e1c4" }]
    : [{ side: "L", color: "#34e1c4" }, { side: "R", color: "#5aa9ff" }];
  const vals = [];
  recs.forEach((r) => series.forEach((s) => { const v = pick(r, s.side); if (v != null) vals.push(v); }));
  if (vals.length < 1) {
    ctx.fillStyle = "#93a3b5"; ctx.font = "13px system-ui";
    ctx.fillText("データが足りません", 14, cssH / 2);
    return;
  }
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (metric === "balance") { lo = Math.min(lo, -10); hi = Math.max(hi, 10); }
  if (isTr) { lo = 0; hi = Math.max(hi, 5); }
  const pad = (hi - lo) * 0.12 || 5; lo -= pad; hi += pad;
  if (isTr) lo = 0; // 件数は0始まりに固定
  const L = 40, R = 12, T = 12, B = 26;
  const px = (i) => L + (recs.length <= 1 ? (cssW - L - R) / 2 : i * (cssW - L - R) / (recs.length - 1));
  const py = (v) => T + (1 - (v - lo) / (hi - lo)) * (cssH - T - B);
  // グリッド & Y軸ラベル
  ctx.strokeStyle = "#28323f"; ctx.fillStyle = "#93a3b5"; ctx.font = "10px system-ui"; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const v = lo + (hi - lo) * g / 4, y = py(v);
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(cssW - R, y); ctx.stroke();
    ctx.fillText(Math.round(v), 6, y + 3);
  }
  // 0基準線（バランス）
  if (metric === "balance" && lo < 0 && hi > 0) {
    ctx.strokeStyle = "#1f8e7d";
    ctx.beginPath(); ctx.moveTo(L, py(0)); ctx.lineTo(cssW - R, py(0)); ctx.stroke();
  }
  // 系列折れ線
  series.forEach((s) => {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
    let started = false;
    recs.forEach((r, i) => {
      const v = pick(r, s.side); if (v == null) return;
      const x = px(i), y = py(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    recs.forEach((r, i) => {
      const v = pick(r, s.side); if (v == null) return;
      ctx.beginPath(); ctx.arc(px(i), py(v), 3, 0, Math.PI * 2); ctx.fill();
    });
  });
  // X軸日付ラベル（最大6件間引き）
  ctx.fillStyle = "#93a3b5"; ctx.font = "10px system-ui"; ctx.textAlign = "center";
  const stepN = Math.max(1, Math.ceil(recs.length / 6));
  recs.forEach((r, i) => { if (i % stepN) return; ctx.fillText(r.dateKey.slice(5), px(i), cssH - 8); });
  ctx.textAlign = "left";
}

// ---------- レッスン ----------
// YouTube URLからvideo IDを抽出（watch?v= / youtu.be のみ。playlistは埋め込み不可）
function ytId(url) {
  const m = url.match(/[?&]v=([\w-]{11})/) || url.match(/youtu\.be\/([\w-]{11})/);
  return m ? m[1] : null;
}

function renderLessons() {
  const body = document.getElementById("lessons-body");
  const data = window.SNOW_LESSONS;
  if (!data || !data.lessons) {
    body.innerHTML = '<p class="hist-empty">レッスンデータが読み込めませんでした</p>';
    return;
  }
  const li = (arr) => arr.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const vid = (v) => {
    const id = ytId(v.url);
    const embed = id ? `<button class="v-embed-btn btn-ghost" data-id="${id}">▶ ここで再生</button>` : "";
    return `<div class="lesson-video">
        <div class="v-title">${escapeHtml(v.title)}</div>
        <div class="v-channel">${escapeHtml(v.channel)}</div>
        <div class="v-why">${escapeHtml(v.why)}</div>
        <div class="v-actions">
          <a class="btn-ghost" href="${encodeURI(v.url)}" target="_blank" rel="noopener">YouTubeで開く</a>
          ${embed}
        </div>
        <div class="v-embed-wrap"></div>
      </div>`;
  };
  body.innerHTML =
    `<div class="lessons-note">${escapeHtml(data.progressionNote || "")}</div>` +
    data.lessons.map((L) => `
      <div class="lesson">
        <div class="lesson-head">
          <span class="lesson-caret">▶</span>
          <span class="lesson-title">${escapeHtml(L.title)}</span>
        </div>
        <div class="lesson-body">
          <div class="lesson-goal">🎯 ${escapeHtml(L.goal)}</div>
          <h5>やること</h5><ul>${li(L.steps)}</ul>
          <h5>よくあるミス</h5><ul>${li(L.commonMistakes)}</ul>
          <h5>アプリでの確認方法</h5><p class="app-check">${escapeHtml(L.appCheck)}</p>
          <h5>理想の目安</h5><p class="ideal">${escapeHtml(L.idealTargets)}</p>
          ${L.evidence && L.evidence.length ? `<h5>📚 根拠（なぜこの練習か）</h5><ul class="evidence">${li(L.evidence)}</ul>` : ""}
          ${L.sources && L.sources.length ? `<div class="lesson-sources"><b>出典:</b> ${L.sources.map((s) => `<a href="${encodeURI(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a>`).join(" ／ ")}</div>` : ""}
          <h5>お手本動画</h5>
          <div class="lesson-videos">${L.videos.map(vid).join("")}</div>
          <a class="lesson-search btn-ghost" href="https://www.youtube.com/results?search_query=${encodeURIComponent(L.searchQuery)}" target="_blank" rel="noopener">🔍 YouTubeでもっと探す</a>
        </div>
      </div>`).join("") +
    (data.references && data.references.length
      ? `<div class="lessons-refs"><h5>📚 このレッスンの主な出典（指導団体・教本・スポーツ医学）</h5><ul>${data.references.map((s) => `<li><a href="${encodeURI(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a></li>`).join("")}</ul></div>`
      : "");

  body.querySelectorAll(".lesson-head").forEach((h) =>
    h.addEventListener("click", () => h.parentElement.classList.toggle("open"))
  );
  body.querySelectorAll(".v-embed-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const wrap = b.closest(".lesson-video").querySelector(".v-embed-wrap");
      if (wrap.querySelector("iframe")) { wrap.innerHTML = ""; b.textContent = "▶ ここで再生"; return; }
      wrap.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${b.dataset.id}" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      b.textContent = "■ 閉じる";
    })
  );
  const first = body.querySelector(".lesson");
  if (first) first.classList.add("open"); // 最初のレッスンを開いておく
}

// ---------- オフトレ（家トレ記録） ----------
function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const TRAIN_KEY = "snowboard.training.v1";
const TrainingStore = {
  all() { try { return JSON.parse(localStorage.getItem(TRAIN_KEY) || "[]"); } catch (e) { return []; } },
  _save(l) { try { localStorage.setItem(TRAIN_KEY, JSON.stringify(l)); } catch (e) { console.warn(e); } },
  logToday(drills) {
    const list = this.all();
    const k = ymd(new Date());
    const s = list.find((x) => x.date === k);
    if (s) s.drills = Array.from(new Set(s.drills.concat(drills)));
    else list.push({ date: k, drills: [...drills] });
    this._save(list);
  },
  stats() {
    const list = this.all();
    const days = new Set(list.map((s) => s.date));
    let streak = 0;
    const d = new Date();
    if (!days.has(ymd(d))) d.setDate(d.getDate() - 1); // 今日未実施でも前日からの連続は保持
    while (days.has(ymd(d))) { streak++; d.setDate(d.getDate() - 1); }
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthCount = list.filter((s) => s.date.startsWith(mk)).length;
    return { streak, monthCount, total: list.length, days };
  },
};

function renderTraining() {
  const body = document.getElementById("training-body");
  const T = window.SNOW_TRAINING;
  if (!T || !T.dryland) { body.innerHTML = '<p class="hist-empty">データを読み込めませんでした</p>'; return; }
  const st = TrainingStore.stats();
  const today = ymd(new Date());
  const sess = TrainingStore.all().find((s) => s.date === today);
  const done = new Set(sess ? sess.drills : []);
  const dl = T.dryland;
  const evHtml = dl.evidence && dl.evidence.length
    ? `<h5>📚 根拠（オフトレが効く理由）</h5><ul class="evidence">${dl.evidence.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : "";
  const refHtml = dl.references && dl.references.length
    ? `<div class="lesson-sources"><b>出典:</b> ${dl.references.map((s) => `<a href="${encodeURI(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a>`).join(" ／ ")}</div>` : "";
  body.innerHTML =
    `<div class="lessons-note">${escapeHtml(T.dryland.intro)}<br><br><b>進め方:</b> ${escapeHtml(T.dryland.weekly)}${evHtml}${refHtml}</div>` +
    `<div class="tr-stats"><div><b>${st.streak}</b><span>連続日数</span></div><div><b>${st.monthCount}</b><span>今月</span></div><div><b>${st.total}</b><span>合計</span></div></div>` +
    T.dryland.drills.map((d) => `
      <label class="tr-drill">
        <input type="checkbox" class="tr-check" value="${d.key}" ${done.has(d.key) ? "checked" : ""}>
        <div class="tr-info">
          <div class="tr-name">${escapeHtml(d.name)}<span class="tr-target">${escapeHtml(d.target)}</span></div>
          <div class="tr-how">${escapeHtml(d.how)}</div>
          <div class="tr-why">💪 ${escapeHtml(d.why)}</div>
        </div>
      </label>`).join("") +
    `<button id="tr-save" class="btn-accent tr-save">✓ 今日の記録を保存</button>`;
  body.querySelector("#tr-save").addEventListener("click", () => {
    const checked = Array.from(body.querySelectorAll(".tr-check:checked")).map((c) => c.value);
    if (!checked.length) { alert("やったメニューにチェックを入れてください"); return; }
    TrainingStore.logToday(checked);
    renderTraining();
  });
}

// ---------- 学習（イメトレ / 目標 / クイズ） ----------
let _learnTab = "imagery";
let _quiz = { i: 0, score: 0, answered: false };

function renderLearn() {
  const body = document.getElementById("learn-body");
  const T = window.SNOW_TRAINING;
  document.querySelectorAll(".learn-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === _learnTab));
  if (!T) { body.innerHTML = '<p class="hist-empty">データを読み込めませんでした</p>'; return; }
  if (_learnTab === "imagery") {
    body.innerHTML =
      `<div class="lessons-note">頭の中で滑りを再現する『イメージトレーニング』。雪がなくても効果的です。</div>` +
      `<ul class="learn-list">${T.imagery.tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
  } else if (_learnTab === "goals") {
    const saved = localStorage.getItem("snowboard.goalNote") || "";
    body.innerHTML =
      `<div class="lessons-note">次シーズンの目標を立てましょう。下の問いを参考に。メモは自動保存されます。</div>` +
      `<ul class="learn-list">${T.imagery.goals.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` +
      `<label class="goal-label">あなたの目標メモ</label><textarea id="goal-note" class="goal-note" placeholder="ここに書く（自動保存）">${escapeHtml(saved)}</textarea>`;
    const ta = body.querySelector("#goal-note");
    ta.addEventListener("input", () => localStorage.setItem("snowboard.goalNote", ta.value));
  } else {
    renderQuiz(body);
  }
}

function renderQuiz(body) {
  const Q = window.SNOW_TRAINING.quiz;
  if (_quiz.i >= Q.length) {
    const best = Math.max(_quiz.score, parseInt(localStorage.getItem("snowboard.quizBest") || "0", 10));
    localStorage.setItem("snowboard.quizBest", String(best));
    body.innerHTML = `<div class="quiz-end"><div class="quiz-score">${_quiz.score} / ${Q.length} 正解</div>` +
      `<div class="quiz-best">自己ベスト: ${best} / ${Q.length}</div>` +
      `<button id="quiz-retry" class="btn-accent">もう一度</button></div>`;
    body.querySelector("#quiz-retry").addEventListener("click", () => { _quiz = { i: 0, score: 0, answered: false }; renderQuiz(body); });
    return;
  }
  const q = Q[_quiz.i];
  body.innerHTML =
    `<div class="quiz-prog">第 ${_quiz.i + 1} 問 / ${Q.length}　（正解 ${_quiz.score}）</div>` +
    `<div class="quiz-q">${escapeHtml(q.q)}</div>` +
    `<div class="quiz-choices">${q.choices.map((c, idx) => `<button class="quiz-choice" data-idx="${idx}">${escapeHtml(c)}</button>`).join("")}</div>` +
    `<div class="quiz-explain" hidden></div>` +
    `<button id="quiz-next" class="btn-accent" hidden>次へ</button>`;
  const choices = body.querySelectorAll(".quiz-choice");
  choices.forEach((btn) => btn.addEventListener("click", () => {
    if (_quiz.answered) return;
    _quiz.answered = true;
    const idx = parseInt(btn.dataset.idx, 10);
    choices.forEach((b, i) => { b.disabled = true; if (i === q.answer) b.classList.add("correct"); });
    if (idx === q.answer) _quiz.score++; else btn.classList.add("wrong");
    const ex = body.querySelector(".quiz-explain");
    ex.hidden = false;
    ex.innerHTML = `${idx === q.answer ? "⭕ 正解！" : "❌ 不正解"}<br>${escapeHtml(q.explain)}`;
    const nx = body.querySelector("#quiz-next");
    nx.hidden = false;
    nx.addEventListener("click", () => { _quiz.i++; _quiz.answered = false; renderQuiz(body); });
  }));
}

function exportRecords() {
  const blob = new Blob([JSON.stringify(RecordStore.all(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `snowboard-records-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importRecords(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      RecordStore.importMerge(JSON.parse(reader.result));
      renderHistoryList();
      renderGraph();
    } catch (e) {
      alert("インポートに失敗しました: " + e.message);
    }
  };
  reader.readAsText(file);
}

// ---------- アプリ初期化 ----------
const panelsEl = document.getElementById("panels");
const template = document.getElementById("panel-template");
const panels = [];

function makePanel(label) {
  const frag = template.content.cloneNode(true);
  const root = frag.querySelector(".panel");
  panelsEl.appendChild(frag);
  const panel = new Panel(root, label);
  panels.push(panel);
  return panel;
}

function setMode(mode) {
  // 既存パネルを保持しつつ枚数を調整
  panelsEl.className = "panels " + mode;
  document.querySelectorAll(".mode-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.mode === mode)
  );
  const syncControls = document.querySelector(".sync-controls");

  if (mode === "dual" && panels.length < 2) {
    makePanel("比較 B（自分の別ラン）");
  }
  if (mode === "single" && panels.length > 1) {
    // 2枚目を非表示にせず、残す（再度dualで使えるように）— ここでは単純に隠す
    panels[1].root.style.display = "none";
  } else if (panels[1]) {
    panels[1].root.style.display = "";
  }
  syncControls.hidden = mode !== "dual";
}

// 同期再生コントロール
document.getElementById("sync-play").addEventListener("click", () => {
  const anyPaused = panels.some((p) => p.q(".video").paused && p.root.dataset.state === "loaded");
  panels.forEach((p) => {
    if (p.root.dataset.state !== "loaded") return;
    const v = p.q(".video");
    if (anyPaused) v.play();
    else v.pause();
  });
});
document.getElementById("sync-step-fwd").addEventListener("click", () => {
  panels.forEach((p) => p.root.dataset.state === "loaded" && p.step(1));
});
document.getElementById("sync-step-back").addEventListener("click", () => {
  panels.forEach((p) => p.root.dataset.state === "loaded" && p.step(-1));
});

document.querySelectorAll(".mode-btn").forEach((btn) =>
  btn.addEventListener("click", () => setMode(btn.dataset.mode))
);

// レベル選択（アドバイスの難易度）
const levelSel = document.getElementById("coach-level");
coachLevel = localStorage.getItem("snowboard.level") || "beginner";
levelSel.value = coachLevel;
levelSel.addEventListener("change", () => {
  coachLevel = levelSel.value;
  localStorage.setItem("snowboard.level", coachLevel);
});

// 履歴モーダルの配線
const historyModal = document.getElementById("history-modal");
document.getElementById("open-history").addEventListener("click", openHistoryModal);
document.getElementById("close-history").addEventListener("click", closeHistoryModal);
historyModal.addEventListener("click", (e) => {
  if (e.target === historyModal) closeHistoryModal(); // 背景クリックで閉じる
});
document.getElementById("graph-metric").addEventListener("change", renderGraph);
document.getElementById("export-records").addEventListener("click", exportRecords);
document.getElementById("import-records").addEventListener("click", () =>
  document.getElementById("import-file").click()
);
document.getElementById("import-file").addEventListener("change", (e) => {
  if (e.target.files[0]) importRecords(e.target.files[0]);
  e.target.value = "";
});

// レッスンモーダルの配線
const lessonsModal = document.getElementById("lessons-modal");
document.getElementById("open-lessons").addEventListener("click", () => {
  renderLessons();
  lessonsModal.hidden = false;
});
document.getElementById("close-lessons").addEventListener("click", () => { lessonsModal.hidden = true; });
lessonsModal.addEventListener("click", (e) => {
  if (e.target === lessonsModal) lessonsModal.hidden = true; // 背景クリックで閉じる
});

// オフトレ・学習モーダルの配線
const trainingModal = document.getElementById("training-modal");
document.getElementById("open-training").addEventListener("click", () => { renderTraining(); trainingModal.hidden = false; });
// セッティング画面などから index.html#lessons / #training で直接開けるように
if (location.hash === "#lessons") document.getElementById("open-lessons").click();
if (location.hash === "#training") document.getElementById("open-training").click();
document.getElementById("close-training").addEventListener("click", () => { trainingModal.hidden = true; });
trainingModal.addEventListener("click", (e) => { if (e.target === trainingModal) trainingModal.hidden = true; });

const learnModal = document.getElementById("learn-modal");
document.getElementById("open-learn").addEventListener("click", () => {
  _learnTab = "imagery"; _quiz = { i: 0, score: 0, answered: false };
  renderLearn(); learnModal.hidden = false;
});
document.getElementById("close-learn").addEventListener("click", () => { learnModal.hidden = true; });
learnModal.addEventListener("click", (e) => { if (e.target === learnModal) learnModal.hidden = true; });
document.querySelectorAll(".learn-tab").forEach((b) => b.addEventListener("click", () => {
  _learnTab = b.dataset.tab;
  if (_learnTab === "quiz") _quiz = { i: 0, score: 0, answered: false };
  renderLearn();
}));

const allModals = [historyModal, lessonsModal, trainingModal, learnModal];

// キーボードショートカット（先頭のloaded panel基準）
document.addEventListener("keydown", (e) => {
  // モーダル表示中は Esc で閉じ、他キーは抑止
  if (allModals.some((m) => !m.hidden)) {
    if (e.code === "Escape") allModals.forEach((m) => { m.hidden = true; });
    return;
  }
  if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
  const p = panels.find((p) => p.root.dataset.state === "loaded" && p.root.style.display !== "none");
  if (!p) return;
  if (e.code === "Space") { e.preventDefault(); p.togglePlay(); }
  else if (e.code === "ArrowRight") { e.preventDefault(); p.step(1); }
  else if (e.code === "ArrowLeft") { e.preventDefault(); p.step(-1); }
});

// 起動
Panel.loadSavedRef();
makePanel("動画 A");
setMode("single");
panels.forEach((p) => p._refreshCompareButtons());
