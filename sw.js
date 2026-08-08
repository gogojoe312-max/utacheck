/* 自分のコードは毎回ネットワークを見に行き、圏外のときだけキャッシュを使う。
   重い vendor/ だけはキャッシュ優先。これで「更新したのに変わらない」が起きない。 */
const CACHE = "utacheck-6.7";
const ASSETS = [
  "./", "./index.html", "./app.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./setlist.json",
  "./vendor/pdf.min.js", "./vendor/pdf.worker.min.js", "./vendor/xlsx.full.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (req, res) => {
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  return res;
};

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Gist や GitHub API など外部との通信には一切触らない。
  // 同期のURLは毎回 ?t=… が変わるので、拾うとキャッシュが際限なく増え、
  // 端末の上限に当たった時にアプリ本体ごと消される。
  // セットリストは端末内に保存済みなので、キャッシュしなくても圏外で困らない。
  if (url.origin !== self.location.origin) return;

  const heavy = url.pathname.includes("/vendor/");

  if (heavy) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => put(e.request, r))));
    return;
  }
  // 自分のコードは古いものを掴まないよう、必ず取り直す
  e.respondWith(
    fetch(e.request, { cache: "no-store" })
      .then((r) => put(e.request, r))
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((hit) => hit || caches.match("./index.html")))
  );
});
