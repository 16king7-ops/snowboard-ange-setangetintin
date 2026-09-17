// オフラインで開けるようにするサービスワーカー。
// ファイルを更新して公開するときは VERSION を上げる（上げないと、次に開いたときまで古いファイルが出る）。
const VERSION = "v1";
const CACHE = "snowboard-" + VERSION;
const FILES = [
  "./", "setup.html", "setup.css", "setup.js", "setup-data.js", "setup-content.js", "setup-diagrams.js", "vendor/qrcode.js",
  "index.html", "styles.css", "app.js", "lessons.js", "reference.js", "training.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("snowboard-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// このサイトのファイルと Google Fonts は「キャッシュを先に返し、裏でネットから更新」。
// それ以外（フォーム分析の MediaPipe など）は通常どおりネットから（オフラインでは使えない）。
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  const font = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (req.method !== "GET" || (url.origin !== location.origin && !font)) return;
  const hit = caches.match(req, { ignoreSearch: true });
  const net = fetch(req).then(async (res) => {
    if (res.ok) await (await caches.open(CACHE)).put(req, res.clone());
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith(hit.then((r) => r || net));
});
