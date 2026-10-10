/* 自分のコードは毎回ネットワークを見に行き、圏外のときだけキャッシュを使う。
   重い vendor/ だけはキャッシュ優先。これで「更新したのに変わらない」が起きない。 */
const CACHE = "utacheck-16.41.54.3";
const ASSETS = [
  "./", "./index.html", "./app.js", "./private-preparation.js", "./private-preparation-source.js", "./private-preparation-ui.js", "./recording-schedule-update.js", "./recording-schedule-ui.js", "./recovery-delivery-scope.js", "./recovery-delivery-store.js", "./recovery-delivery.js", "./startup-backup-inspection.js", "./startup-preserved-backup-inspection.js", "./startup-file-inspection.js", "./startup-file-restoration.js", "./startup-local-storage-inventory.js", "./startup-local-publication-recovery.js", "./startup-local-excel-recovery.js", "./startup-saved-publication-reader.js", "./startup-recovered-show-addition.js", "./recording-inbox.js", "./recording-inbox-ownership.js", "./show-recovery.js", "./manifest.webmanifest",
  "./ui.css", "./ui.js", "./voice-notes.js", "./reading.js", "./gestures.js",
  "./recflow.css", "./ptlink.js", "./ptmac.html",
  "./icon-192.png", "./icon-512.png", "./setlist.json",
  "./print-pdf.js", "./vendor/html2canvas.min.js", "./vendor/jspdf.umd.min.js", "./vendor/pdf.min.js", "./vendor/pdf.worker.min.js", "./vendor/xlsx.full.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// Retain every existing cache while recovery sources remain under investigation.
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

const put = (req, res) => {
  if (!res.ok) return res;
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
        .then((hit) => hit || (e.request.mode === "navigate" ? caches.match("./index.html") : null))
        .then((hit) => hit || Response.error()))
  );
});

// A first automatic preparation may establish single-writer ownership only
// when no legacy editor tab remains. Include hidden and uncontrolled windows.
self.addEventListener('message', event => {
  const data=event.data,port=event.ports&&event.ports[0];
  if(!port||data?.type!=='utacheck-private-preparation-client-check-v1'||typeof data.nonce!=='string'||!/^[a-f0-9]{32}$/.test(data.nonce))return;
  event.waitUntil((async()=>{
    try{
      const scope=new URL(self.registration.scope),source=event.source;
      const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      const editors=windows.filter(client=>{try{const u=new URL(client.url);return u.origin===scope.origin&&u.pathname.startsWith(scope.pathname);}catch(_){return true;}});
      port.postMessage({type:data.type,nonce:data.nonce,single:!!source?.id&&editors.length===1&&editors[0].id===source.id});
    }catch(_){port.postMessage({type:data.type,nonce:data.nonce,single:false});}
    finally{port.close();}
  })());
});

