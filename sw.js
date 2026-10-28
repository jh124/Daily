// Offline-first app shell: opening Daily never needs to wait for a network request.
// Updates are delivered by a new service worker version; cloud requests stay network-based.
const CACHE='daily-v54';
const ASSETS=[
  './index.html',
  './style.css?v=54',
  './app.mjs?v=54',
  './core.mjs?v=54',
  './cloud.mjs?v=54',
  './cloud-config.mjs',
  './sync-core.mjs?v=54',
  './manifest.webmanifest',
  './icon.svg',
  './icon.png'
];
const assetURLs=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).href));

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('daily-')&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  // Do not intercept unrelated URLs or Supabase requests.
  if(request.mode!=='navigate'&&!assetURLs.has(request.url))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(request.mode==='navigate'?'./index.html':request);
    if(cached)return cached;
    try{
      const response=await fetch(request);
      if(response.ok&&request.mode!=='navigate'){
        event.waitUntil(cache.put(request,response.clone()));
      }
      return response;
    }catch{
      if(request.mode==='navigate')return await cache.match('./index.html')||Response.error();
      return Response.error();
    }
  })());
});
