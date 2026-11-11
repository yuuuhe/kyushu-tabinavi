'use strict';
/* 九州たびナビ — 2026/11/14〜24 の九州旅行用。ビルド不要の素の JS。 */

const TRIP_DAYS = Array.from({ length: 11 }, (_, i) => {
  const d = new Date(2026, 10, 14 + i);
  return `2026-11-${String(d.getDate()).padStart(2, '0')}`;
});
const CAR_FROM = '2026-11-15';        // レンタカーが使えるのはこの日から（小倉駅から）
const JMA_LAST = '2026-11-18';        // 気象庁の週間予報が届く最後の日（11/11時点）
const RELIABLE_UNTIL = '2026-11-18';  // これより後は「参考」表示
const HOLIDAYS = ['2026-11-21', '2026-11-22', '2026-11-23'];
const JMA_CODE = { 福岡: '400000', 佐賀: '410000', 長崎: '420000', 熊本: '430000', 大分: '440000', 宮崎: '450000', 鹿児島: '460100' };
const PREFS = ['福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島'];
const TAGS = ['絶景', '紅葉', '雨OK', '夜', '車なしOK', '★行きたい'];
const CAT_COLOR = { 絶景: '#0f766e', 自然: '#16a34a', 温泉: '#dc2626', 歴史: '#7c3aed', 街歩き: '#d97706', グルメ: '#db2777', 体験: '#2563eb' };
const WD = ['日', '月', '火', '水', '木', '金', '土'];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 容量・プライベートモード */ } },
};

const S = {
  spots: [], hubs: [], transit: null, car: null, normals: null,
  byId: {}, carIdx: {},
  filter: { q: '', pref: '', cat: '', sort: 'rec', tags: new Set(), view: 'list' },
  here: null, map: null, markers: null,
  plan: null, weather: null,
};

function defaultPlan() {
  const days = {};
  TRIP_DAYS.forEach((d) => (days[d] = { base: '', spots: [], memo: '' }));
  days['2026-11-14'].base = 'hakata';
  days['2026-11-14'].memo = '飛行機で福岡空港着。この日は車なし（地下鉄・電車）。';
  days['2026-11-15'].base = 'kokura';
  days['2026-11-15'].memo = '小倉駅へ。ここからレンタカー可。';
  return { wants: [], days, weatherDefault: 'hakata' };
}
const savePlan = () => store.set('plan', S.plan);

/* ---------- 共通 ---------- */
function place(id) {
  if (!id) return null;
  if (id === 'here') return S.here ? { id: 'here', name: '現在地', lat: S.here.lat, lng: S.here.lng } : null;
  return S.byId[id] || null;
}
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function fmtMin(m) {
  if (m == null) return '—';
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  return h ? `${h}時間${mm ? mm + '分' : ''}` : `${mm}分`;
}
function dayLabel(d) {
  const dt = new Date(d + 'T00:00:00+09:00');
  const wd = WD[dt.getDay()];
  return { md: `${dt.getMonth() + 1}/${dt.getDate()}`, wd, cls: HOLIDAYS.includes(d) || wd === '日' ? 'sun' : wd === '土' ? 'sat' : '' };
}
function gmap(kind, from, to) {
  const ll = (p) => `${p.lat},${p.lng}`;
  if (kind === 'search') return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(to.name)}&center=${ll(to)}`;
  const o = from && from.id !== 'here' ? `&origin=${ll(from)}` : '';
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${ll(to)}&travelmode=${kind}`;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
}
function placeOptions(selected, { withHere = false, withEmpty = '' } = {}) {
  let h = withEmpty ? `<option value="">${esc(withEmpty)}</option>` : '';
  if (withHere) h += `<option value="here"${selected === 'here' ? ' selected' : ''}>📍 現在地</option>`;
  h += '<optgroup label="主要都市・駅">' + S.hubs.map((x) => `<option value="${x.id}"${x.id === selected ? ' selected' : ''}>${esc(x.name)}</option>`).join('') + '</optgroup>';
  PREFS.forEach((p) => {
    h += `<optgroup label="${p}">` + S.spots.filter((s) => s.prefecture === p)
      .map((s) => `<option value="${s.id}"${s.id === selected ? ' selected' : ''}>${esc(s.name)}</option>`).join('') + '</optgroup>';
  });
  return h;
}

/* ---------- 起動 ---------- */
async function load() {
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
  const [spots, hubs, transit, car, normals] = await Promise.all([
    get('data/spots.json'), get('data/hubs.json'), get('data/transit.json'), get('data/car_matrix.json'), get('data/normals.json'),
  ]);
  Object.assign(S, { spots, hubs, transit, car, normals });
  hubs.forEach((h) => (S.byId[h.id] = { ...h, isHub: true }));
  spots.forEach((s) => (S.byId[s.id] = s));
  car.ids.forEach((id, i) => (S.carIdx[id] = i));
  S.plan = store.get('plan', null) || defaultPlan();
  TRIP_DAYS.forEach((d) => (S.plan.days[d] ||= { base: '', spots: [], memo: '' }));
  S.weather = store.get('weather', null);
}

function init() {
  // タブ
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  // 情報
  $('#infoBtn').addEventListener('click', () => $('#info').showModal());
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => {
    if (e.target === d || e.target.matches('[data-close]')) d.close();
  }));
  // ネット状態
  const net = () => { $('#netBadge').hidden = navigator.onLine; };
  addEventListener('online', net); addEventListener('offline', net); net();

  initSearch();
  initMove();
  initWeather();
  renderPlan();
  initIO();
}

function showTab(name) {
  $$('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'plan') renderPlan();
  if (name === 'weather') renderWeather();
  if (name === 'search' && S.filter.view === 'map') setTimeout(() => S.map?.invalidateSize(), 50);
  scrollTo(0, 0);
}

/* ---------- 探す ---------- */
function initSearch() {
  $('#fPref').innerHTML += PREFS.map((p) => `<option>${p}</option>`).join('');
  const cats = [...new Set(S.spots.map((s) => s.category))];
  $('#fCat').innerHTML += cats.map((c) => `<option>${c}</option>`).join('');
  $('#tagChips').innerHTML = TAGS.map((t) => `<button class="chip" data-tag="${t}">${t}</button>`).join('');

  $('#q').addEventListener('input', (e) => { S.filter.q = e.target.value.trim(); renderSpots(); });
  $('#fPref').addEventListener('change', (e) => { S.filter.pref = e.target.value; renderSpots(); });
  $('#fCat').addEventListener('change', (e) => { S.filter.cat = e.target.value; renderSpots(); });
  $('#fSort').addEventListener('change', (e) => {
    S.filter.sort = e.target.value;
    if (S.filter.sort === 'near') locate(renderSpots); else renderSpots();
  });
  $('#tagChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    const t = b.dataset.tag;
    S.filter.tags.has(t) ? S.filter.tags.delete(t) : S.filter.tags.add(t);
    b.classList.toggle('on');
    renderSpots();
  });
  $$('.seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#spotList').addEventListener('click', (e) => {
    const li = e.target.closest('[data-id]'); if (li) openDetail(li.dataset.id);
  });
  renderSpots();
}

function locate(cb) {
  if (!navigator.geolocation) { toast('この端末では現在地が使えません'); return; }
  toast('現在地を取得中…');
  navigator.geolocation.getCurrentPosition(
    (p) => { S.here = { lat: p.coords.latitude, lng: p.coords.longitude }; cb && cb(); },
    () => { toast('現在地を取得できませんでした'); S.filter.sort = 'rec'; $('#fSort').value = 'rec'; cb && cb(); },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

function recScore(s) {
  let sc = 0;
  if (s.tags.includes('絶景')) sc += 3;
  if (s.tags.includes('紅葉')) sc += 2;
  if (S.plan.wants.includes(s.id)) sc += 1;
  return sc;
}

function filteredSpots() {
  const f = S.filter, q = f.q.toLowerCase();
  let list = S.spots.filter((s) => {
    if (f.pref && s.prefecture !== f.pref) return false;
    if (f.cat && s.category !== f.cat) return false;
    for (const t of f.tags) {
      if (t === '★行きたい') { if (!S.plan.wants.includes(s.id)) return false; }
      else if (!s.tags.includes(t)) return false;
    }
    if (q && !(s.name + s.description + s.november_highlight + s.prefecture + s.category).toLowerCase().includes(q)) return false;
    return true;
  });
  if (f.sort === 'near' && S.here) list = list.map((s) => ({ s, d: km(S.here, s) })).sort((a, b) => a.d - b.d).map((x) => x.s);
  else if (f.sort === 'pref') list.sort((a, b) => PREFS.indexOf(a.prefecture) - PREFS.indexOf(b.prefecture));
  else list.sort((a, b) => recScore(b) - recScore(a) || PREFS.indexOf(a.prefecture) - PREFS.indexOf(b.prefecture));
  return list;
}

function spotCard(s) {
  const want = S.plan.wants.includes(s.id) || assignedDay(s.id);
  const d = S.filter.sort === 'near' && S.here ? `<span class="dist">${km(S.here, s).toFixed(1)}km</span>` : '';
  const badges = s.tags.filter((t) => t !== '車なしOK').map((t) => `<span class="badge">${t}</span>`).join('')
    + (s.transit_friendly ? '' : '<span class="badge">車が便利</span>')
    + (s.needs_check ? '<span class="badge warn">要確認あり</span>' : '');
  return `<li class="card" data-id="${s.id}">
    <h3>${want ? '<span class="star">★</span>' : ''}${esc(s.name)}${d}</h3>
    <div class="meta">${s.prefecture}・${s.category}・滞在 約${fmtMin(s.stay_minutes)}</div>
    <div class="hl">${esc(s.november_highlight)}</div>
    <div class="badges">${badges}</div></li>`;
}

function renderSpots() {
  const list = filteredSpots();
  $('#count').textContent = `${list.length}件`;
  $('#nearNote').hidden = S.filter.sort !== 'near';
  $('#spotList').innerHTML = list.map(spotCard).join('') || '<li class="empty">条件に合うスポットがありません</li>';
  if (S.filter.view === 'map') renderMarkers(list);
}

function setView(v) {
  if (v === 'map' && !navigator.onLine) { toast('オフラインなので地図は出せません。リストで表示します'); v = 'list'; }
  S.filter.view = v;
  $$('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  $('#map').hidden = v !== 'map';
  $('#spotList').hidden = v === 'map';
  if (v === 'map') {
    if (!S.map) {
      S.map = L.map('map', { zoomControl: true }).setView([32.75, 130.75], 7);
      L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',
      }).addTo(S.map);
      S.markers = L.layerGroup().addTo(S.map);
      S.map.on('popupopen', (e) => {
        const b = e.popup.getElement().querySelector('[data-open]');
        b && b.addEventListener('click', () => openDetail(b.dataset.open));
      });
    }
    setTimeout(() => S.map.invalidateSize(), 50);
    renderMarkers(filteredSpots());
  }
}

function renderMarkers(list) {
  if (!S.markers) return;
  S.markers.clearLayers();
  list.forEach((s) => {
    L.circleMarker([s.lat, s.lng], {
      radius: s.tags.includes('絶景') ? 9 : 7, color: '#fff', weight: 2,
      fillColor: CAT_COLOR[s.category] || '#555', fillOpacity: 0.95,
    }).bindPopup(`<b>${esc(s.name)}</b><br>${s.prefecture}・${s.category}<br><button data-open="${s.id}">詳しく見る</button>`).addTo(S.markers);
  });
  if (S.here) L.circleMarker([S.here.lat, S.here.lng], { radius: 6, color: '#2563eb', fillOpacity: 1 }).bindPopup('現在地').addTo(S.markers);
}

/* ---------- 詳細 ---------- */
function assignedDay(id) { return TRIP_DAYS.find((d) => S.plan.days[d].spots.includes(id)); }

function openDetail(id) {
  const s = S.byId[id]; if (!s) return;
  const want = S.plan.wants.includes(id);
  const day = assignedDay(id);
  const hub = S.byId[s.hub];
  const hubCar = carMin(s.hub, id);
  const dayOpts = TRIP_DAYS.map((d) => { const l = dayLabel(d); return `<option value="${d}"${d === day ? ' selected' : ''}>${l.md}(${l.wd})</option>`; }).join('');
  $('#detailBody').innerHTML = `
    <h2>${esc(s.name)}</h2>
    <div class="muted">${s.prefecture}・${s.category}・滞在 約${fmtMin(s.stay_minutes)}</div>
    <div class="badges">${s.tags.map((t) => `<span class="badge">${t}</span>`).join('')}${s.needs_check ? '<span class="badge warn">要確認あり</span>' : ''}</div>
    <p>${esc(s.description)}</p>
    <div class="kv"><b>11月の見どころ</b>${esc(s.november_highlight)}</div>
    <div class="kv"><b>最寄りの主要駅</b>${esc(hub?.name)}（車で約${fmtMin(hubCar)}・渋滞なし）${s.transit_friendly ? '' : '<br><span class="muted">公共交通だと行きにくい場所です。車が便利。</span>'}</div>
    ${s.needs_check ? '<p class="note">⚠ 日程・状況に「要確認」の項目があります。出典や公式サイトで確かめてください。</p>' : ''}
    <div class="linkrow">
      <a href="${gmap('search', null, s)}" target="_blank" rel="noopener">Googleマップで見る</a>
      <a href="${gmap('driving', null, s)}" target="_blank" rel="noopener">🚗 車で行く</a>
      <a href="${gmap('transit', null, s)}" target="_blank" rel="noopener">🚃 電車・バスで行く</a>
      ${s.source_url ? `<a href="${esc(s.source_url)}" target="_blank" rel="noopener">出典</a>` : ''}
    </div>
    <div class="linkrow">
      <button id="dWant" class="${want ? 'ghost' : ''}">${want ? '★ 行きたい（解除）' : '☆ 行きたいに追加'}</button>
      <button id="dMove" class="ghost">ここへの所要時間</button>
    </div>
    <div class="adddate">
      <select id="dDay"><option value="">日付に追加…</option>${dayOpts}</select>
      <button id="dDayBtn" class="small">${day ? '移動' : '追加'}</button>
    </div>
    <button class="close" data-close>閉じる</button>`;
  $('#dWant').onclick = () => { toggleWant(id); openDetail(id); renderSpots(); };
  $('#dMove').onclick = () => {
    $('#detail').close();
    const base = todayBase();
    $('#mFrom').value = base || 'hakata'; $('#mTo').value = id; renderMove(); showTab('move');
  };
  $('#dDayBtn').onclick = () => {
    const d = $('#dDay').value; if (!d) return;
    assignToDay(id, d); toast(`${dayLabel(d).md} に追加しました`); openDetail(id); renderSpots();
  };
  const dlg = $('#detail');
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('div').scrollTop = 0;
}

function todayBase() {
  const now = new Date();
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const day = S.plan.days[d] || S.plan.days[TRIP_DAYS[0]];
  return day.base;
}
function toggleWant(id) {
  const w = S.plan.wants;
  const i = w.indexOf(id);
  i >= 0 ? w.splice(i, 1) : w.push(id);
  savePlan();
}
function assignToDay(id, d) {
  TRIP_DAYS.forEach((x) => { const a = S.plan.days[x].spots; const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); });
  S.plan.days[d].spots.push(id);
  S.plan.wants = S.plan.wants.filter((x) => x !== id);
  savePlan();
}

/* ---------- 移動 ---------- */
function carMin(a, b) {
  const i = S.carIdx[a], j = S.carIdx[b];
  if (i == null || j == null) return null;
  return S.car.minutes[i][j];
}
function carKm(a, b) {
  const i = S.carIdx[a], j = S.carIdx[b];
  if (i == null || j == null) return null;
  return S.car.km[i][j];
}

// 電車・バス：主要駅のつながり（目安表）で最短経路を探す。乗換1回につき10分足す
function transitRoute(fromHub, toHub) {
  if (fromHub === toHub) return { legs: [], min: 0, max: 0 };
  const edges = S.transit.edges.filter((e) => e.realistic);
  const adj = {};
  edges.forEach((e) => { (adj[e.a] ||= []).push([e.b, e]); (adj[e.b] ||= []).push([e.a, e]); });
  const dist = { [fromHub]: 0 }, prev = {}, done = new Set();
  while (true) {
    let u = null;
    for (const k in dist) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
    if (u === null || u === toHub) break;
    done.add(u);
    for (const [v, e] of adj[u] || []) {
      const mid = (e.min + e.max) / 2 + (u === fromHub ? 0 : 10);
      if (dist[v] == null || dist[u] + mid < dist[v]) { dist[v] = dist[u] + mid; prev[v] = [u, e]; }
    }
  }
  if (dist[toHub] == null) return null;
  const legs = []; let c = toHub;
  while (c !== fromHub) { const [p, e] = prev[c]; legs.unshift({ from: p, to: c, e }); c = p; }
  const xfer = (legs.length - 1) * 10;
  return { legs, min: legs.reduce((a, l) => a + l.e.min, 0) + xfer, max: legs.reduce((a, l) => a + l.e.max, 0) + xfer };
}
function directEdge(a, b) { return S.transit.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)); }

function initMove() {
  $('#mFrom').innerHTML = placeOptions('hakata', { withHere: true });
  $('#mTo').innerHTML = placeOptions('kum-04');
  $('#mFrom').addEventListener('change', () => { if ($('#mFrom').value === 'here' && !S.here) locate(renderMove); renderMove(); });
  $('#mTo').addEventListener('change', renderMove);
  $('#mSwap').addEventListener('click', () => {
    const a = $('#mFrom').value, b = $('#mTo').value;
    if (a === 'here') { toast('現在地は到着にできません'); return; }
    $('#mFrom').value = b; $('#mTo').value = a; renderMove();
  });
  renderMove();
}

function renderMove() {
  const from = place($('#mFrom').value), to = place($('#mTo').value);
  const out = $('#mResult');
  if (!from || !to) { out.innerHTML = '<div class="panel muted">現在地を取得中です…</div>'; return; }
  if (from.id === to.id) { out.innerHTML = '<div class="panel muted">同じ場所です</div>'; return; }
  const straight = km(from, to);

  // 車
  let carHtml;
  if (from.id === 'here') {
    carHtml = `<p class="muted">現在地からの車の時間は事前計算していません。下の Google マップで確認してください（直線 ${straight.toFixed(1)}km）。</p>`;
  } else {
    const m = carMin(from.id, to.id), k = carKm(from.id, to.id);
    carHtml = `<div class="big">${fmtMin(m)} 〜 ${fmtMin(Math.round(m * 1.3))}</div>
      <div class="muted">${k}km。左は渋滞なしの計算値、右は混雑時の目安（×1.3）。山道は計算値より遅くなりがちです。</div>`;
  }

  // 電車・バス
  const fh = from.id === 'here' ? nearestHub(from) : (from.isHub ? from.id : from.hub);
  const th = to.isHub ? to.id : to.hub;
  let trHtml;
  const de = directEdge(fh, th);
  const r = transitRoute(fh, th);
  const hubName = (id) => S.byId[id].name;
  const endNote = [];
  if (!from.isHub) endNote.push(`出発地〜${hubName(fh)}`);
  if (!to.isHub) endNote.push(`${hubName(th)}〜到着地`);
  if (fh === th) {
    trHtml = `<p>どちらも <b>${hubName(fh)}</b> 周辺です。路線バス・タクシー・車での移動になります（Google マップで確認）。</p>`;
  } else if (!r) {
    trHtml = '<p>目安表にない区間です。Google マップの乗換案内で確認してください。</p>';
  } else {
    const warn = de && !de.realistic ? `<p class="note">⚠ ${esc(de.note)}</p>` : '';
    trHtml = `${warn}<div class="big">${fmtMin(r.min)} 〜 ${fmtMin(r.max)}</div>
      <div class="muted">${hubName(fh)} → ${hubName(th)} の目安${r.legs.length > 1 ? `（乗換${r.legs.length - 1}回・待ち時間は含まず）` : '（乗換待ちは含まず）'}${endNote.length ? `。${endNote.join('、')}の移動は別` : ''}</div>
      <ol class="legs">${r.legs.map((l) => `<li>${hubName(l.from)} → ${hubName(l.to)}：${esc(l.e.how)} 約${fmtMin(l.e.min)}${l.e.max !== l.e.min ? '〜' + fmtMin(l.e.max) : ''}${l.e.note ? `<br><span class="muted">${esc(l.e.note)}</span>` : ''}</li>`).join('')}</ol>`;
  }
  const noTransitSpot = !to.isHub && !to.transit_friendly;

  out.innerHTML = `
    <div class="panel result-block">
      <h2>🚗 車</h2>${carHtml}
      <p class="note">レンタカーは 11/15（小倉駅）から。11/21〜23 は三連休で混雑しやすいです。</p>
    </div>
    <div class="panel result-block">
      <h2>🚃 電車・バス</h2>${trHtml}
      ${noTransitSpot ? '<p class="note">到着地は公共交通だと行きにくい場所です。駅からはタクシー・レンタカーを検討してください。</p>' : ''}
    </div>
    <div class="panel">
      <div class="muted">直線距離 ${straight.toFixed(1)}km</div>
      <div class="linkrow">
        <a href="${gmap('driving', from, to)}" target="_blank" rel="noopener">🚗 Googleマップで経路（車）</a>
        <a href="${gmap('transit', from, to)}" target="_blank" rel="noopener">🚃 Googleマップで乗換案内</a>
      </div>
    </div>`;
}
function nearestHub(p) {
  return S.hubs.filter((h) => h.id !== 'fukuoka-airport').reduce((a, h) => (km(p, h) < km(p, a) ? h : a)).id;
}

/* ---------- 天気 ---------- */
const WMO = (c) => {
  if (c === 0) return ['☀️', '快晴'];
  if (c === 1) return ['🌤️', '晴れ'];
  if (c === 2) return ['⛅', '晴れ時々曇り'];
  if (c === 3) return ['☁️', '曇り'];
  if (c === 45 || c === 48) return ['🌫️', '霧'];
  if (c >= 51 && c <= 57) return ['🌦️', '霧雨'];
  if (c >= 61 && c <= 67) return ['🌧️', '雨'];
  if (c >= 71 && c <= 77) return ['🌨️', '雪'];
  if (c >= 80 && c <= 82) return ['🌦️', 'にわか雨'];
  if (c >= 85 && c <= 86) return ['🌨️', 'にわか雪'];
  if (c >= 95) return ['⛈️', '雷雨'];
  return ['❔', '不明'];
};
const JMA_TXT = {
  100: '晴', 101: '晴時々曇', 102: '晴一時雨', 103: '晴時々雨', 104: '晴一時雪', 110: '晴のち時々曇', 111: '晴のち曇', 112: '晴のち一時雨', 113: '晴のち時々雨', 114: '晴のち雨',
  200: '曇', 201: '曇時々晴', 202: '曇一時雨', 203: '曇時々雨', 204: '曇一時雪', 210: '曇のち時々晴', 211: '曇のち晴', 212: '曇のち一時雨', 213: '曇のち時々雨', 214: '曇のち雨',
  300: '雨', 301: '雨時々晴', 302: '雨時々止む', 303: '雨時々雪', 311: '雨のち晴', 313: '雨のち曇', 400: '雪',
};
const jmaText = (c) => JMA_TXT[c] || ({ 1: '晴れ系', 2: '曇り系', 3: '雨系', 4: '雪系' }[String(c)[0]] || '');

function weatherPlaceFor(d) {
  const base = S.plan.days[d].base || S.plan.weatherDefault || 'hakata';
  return S.byId[base] || S.byId.hakata;
}

function initWeather() {
  $('#wDefault').innerHTML = placeOptions(S.plan.weatherDefault || 'hakata');
  $('#wDefault').addEventListener('change', (e) => { S.plan.weatherDefault = e.target.value; savePlan(); fetchWeather(); });
  $('#wRefresh').addEventListener('click', fetchWeather);
  const age = S.weather ? Date.now() - S.weather.fetchedAt : Infinity;
  if (navigator.onLine && age > 3 * 3600 * 1000) fetchWeather(); else renderWeather();
}

async function fetchWeather() {
  if (!navigator.onLine) { toast('オフラインです。前回の天気を表示します'); renderWeather(); return; }
  $('#wStatus').textContent = '天気を取得中…';
  const places = [...new Map(TRIP_DAYS.map((d) => { const p = weatherPlaceFor(d); return [p.id, p]; })).values()];
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude: places.map((p) => p.lat.toFixed(4)).join(','),
      longitude: places.map((p) => p.lng.toFixed(4)).join(','),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset',
      timezone: 'Asia/Tokyo', start_date: TRIP_DAYS[0], end_date: TRIP_DAYS[TRIP_DAYS.length - 1],
    });
    const res = await fetch(url).then((r) => r.json());
    const arr = Array.isArray(res) ? res : [res];
    if (arr[0]?.error) throw new Error(arr[0].reason);
    const om = {};
    places.forEach((p, i) => { om[p.id] = arr[i].daily; });

    // 気象庁（失敗しても続行）
    const jma = {};
    const prefs = [...new Set(places.map((p) => p.prefecture || p.pref))];
    await Promise.all(prefs.map(async (pref) => {
      try {
        const j = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${JMA_CODE[pref]}.json`).then((r) => r.json());
        const w = j[1].timeSeries;
        const days = {};
        w[0].timeDefines.forEach((t, i) => {
          days[t.slice(0, 10)] = {
            code: w[0].areas[0].weatherCodes[i], pop: w[0].areas[0].pops[i], rel: (w[0].areas[0].reliabilities || [])[i],
            tmax: w[1].areas[0].tempsMax[i], tmin: w[1].areas[0].tempsMin[i],
          };
        });
        jma[pref] = days;
      } catch { /* 気象庁なしでも表示する */ }
    }));
    S.weather = { fetchedAt: Date.now(), om, jma };
    store.set('weather', S.weather);
  } catch (e) {
    toast('天気を取得できませんでした');
  }
  renderWeather();
}

function dayWeather(d) {
  const p = weatherPlaceFor(d);
  const pref = p.prefecture || p.pref;
  const w = S.weather;
  const dd = w?.om?.[p.id];
  const i = dd ? dd.time.indexOf(d) : -1;
  const om = i >= 0 ? { code: dd.weather_code[i], tmax: dd.temperature_2m_max[i], tmin: dd.temperature_2m_min[i], pop: dd.precipitation_probability_max[i], sunset: dd.sunset[i] } : null;
  const jm = w?.jma?.[pref]?.[d] || null;
  const hub = p.isHub ? p.id : p.hub;
  const nm = S.normals.hubs[hub]?.[d.slice(5)] || null;
  return { p, om, jm, nm };
}

function renderWeather() {
  const w = S.weather;
  if (w) {
    const t = new Date(w.fetchedAt);
    $('#wStatus').textContent = `最終取得：${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}${navigator.onLine ? '' : '（オフライン）'}`;
  } else {
    $('#wStatus').textContent = 'まだ天気を取得していません。「更新」を押してください。';
  }
  $('#wList').innerHTML = TRIP_DAYS.map((d) => {
    const { p, om, jm, nm } = dayWeather(d);
    const l = dayLabel(d);
    const ref = d > RELIABLE_UNTIL;
    const [ic, txt] = om ? WMO(om.code) : ['—', '予報なし'];
    const main = om
      ? `${txt}${ref ? ' <span class="badge warn">参考</span>' : ''}<br><span class="hi">${Math.round(om.tmax)}°</span> / <span class="lo">${Math.round(om.tmin)}°</span>　☂ ${om.pop ?? '—'}%`
      : '予報なし（平年値を参照）';
    const subs = [];
    if (jm && d <= JMA_LAST) subs.push(`気象庁：${jmaText(jm.code)} ☂${jm.pop || '—'}%${jm.tmax ? ` ${jm.tmax}°/${jm.tmin}°` : ''}${jm.rel ? `（信頼度${jm.rel}）` : ''}`);
    if (nm) subs.push(`平年：${nm.tmax}°/${nm.tmin}°・雨の日 ${nm.rain_pct}%`);
    if (om?.sunset) subs.push(`日の入り ${om.sunset.slice(11, 16)}`);
    return `<li class="wday">
      <div class="d ${l.cls}">${l.md}<small>(${l.wd})</small></div>
      <div class="ic">${ic}</div>
      <div class="t">${main}</div>
      <div class="sub">📍${esc(p.name)}${subs.length ? '　' + subs.join('　') : ''}</div></li>`;
  }).join('');
}

/* ---------- 旅程 ---------- */
function renderPlan() {
  const wants = S.plan.wants.map((id) => S.byId[id]).filter(Boolean);
  $('#wantList').innerHTML = wants.length
    ? wants.map((s) => `<li><span class="name" data-open="${s.id}">${esc(s.name)}</span><span class="muted">${s.prefecture}</span></li>`).join('')
    : '<li class="empty">「探す」でスポットを開いて ☆ を押すとここに入ります</li>';

  $('#dayList').innerHTML = TRIP_DAYS.map((d) => {
    const day = S.plan.days[d];
    const l = dayLabel(d);
    const { om } = dayWeather(d);
    const wmini = om ? `${WMO(om.code)[0]} ${Math.round(om.tmax)}°/${Math.round(om.tmin)}° ☂${om.pop ?? '—'}%` : '';
    const car = d >= CAR_FROM ? '🚗' : '🚃';
    let prev = day.base;
    const items = day.spots.map((id, i) => {
      const s = S.byId[id]; if (!s) return '';
      const m = prev ? carMin(prev, id) : null;
      const hop = prev && m != null ? `<li class="hop">↓ 車 約${fmtMin(m)}（${esc(S.byId[prev].name)}から）</li>` : '';
      prev = id;
      return `${hop}<li><span class="name" data-open="${id}">${esc(s.name)}</span>
        <button class="ghost" data-act="up" data-d="${d}" data-i="${i}" aria-label="上へ">↑</button>
        <button class="ghost" data-act="down" data-d="${d}" data-i="${i}" aria-label="下へ">↓</button>
        <button class="ghost" data-act="del" data-d="${d}" data-i="${i}" aria-label="外す">✕</button></li>`;
    }).join('');
    const total = day.spots.reduce((a, id) => a + (S.byId[id]?.stay_minutes || 0), 0);
    return `<div class="day">
      <header><h3 class="${l.cls}">${l.md}(${l.wd}) ${car}</h3><span class="wmini">${wmini}</span></header>
      <label>拠点（泊まる場所の近く・天気の場所）<select data-base="${d}">${placeOptions(day.base, { withEmpty: '未設定' })}</select></label>
      <ul class="mini">${items || '<li class="empty">スポット詳細の「日付に追加」で入ります</li>'}</ul>
      ${total ? `<p class="note">滞在の合計 約${fmtMin(total)}（移動時間は別）。日の入りは17時過ぎ、屋外は15時台までに。</p>` : ''}
      <label>メモ（最終便・予約など。予約番号はここに書かないで）<textarea data-memo="${d}" rows="2">${esc(day.memo)}</textarea></label>
    </div>`;
  }).join('');
}

function initPlanEvents() {
  const root = $('#tab-plan');
  root.addEventListener('click', (e) => {
    const n = e.target.closest('[data-open]'); if (n) { openDetail(n.dataset.open); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const arr = S.plan.days[b.dataset.d].spots, i = +b.dataset.i;
    if (b.dataset.act === 'del') { const [id] = arr.splice(i, 1); if (!S.plan.wants.includes(id)) S.plan.wants.push(id); }
    if (b.dataset.act === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    if (b.dataset.act === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
    savePlan(); renderPlan();
  });
  root.addEventListener('change', (e) => {
    const d = e.target.dataset.base;
    if (d) { S.plan.days[d].base = e.target.value; savePlan(); renderPlan(); fetchWeather(); }
  });
  root.addEventListener('input', (e) => {
    const d = e.target.dataset.memo;
    if (d) { S.plan.days[d].memo = e.target.value; savePlan(); }
  });
}

function initIO() {
  initPlanEvents();
  const ta = $('#ioText');
  $('#exportBtn').addEventListener('click', async () => {
    const txt = JSON.stringify({ app: 'kyushu-tabinavi', v: 1, plan: S.plan });
    ta.hidden = false; ta.value = txt; ta.select();
    try { await navigator.clipboard.writeText(txt); toast('コピーしました。メモアプリに貼っておいてください'); }
    catch { toast('下の文字を全部選んでコピーしてください'); }
  });
  $('#importBtn').addEventListener('click', () => {
    if (ta.hidden || !ta.value.trim()) { ta.hidden = false; ta.value = ''; ta.focus(); toast('書き出した文字を貼り付けて、もう一度「読み込み」を押してください'); return; }
    try {
      const o = JSON.parse(ta.value);
      if (o.app !== 'kyushu-tabinavi' || !o.plan?.days) throw new Error();
      if (!confirm('今の旅程を、貼り付けた内容で置き換えます。よろしいですか？')) return;
      S.plan = o.plan; TRIP_DAYS.forEach((d) => (S.plan.days[d] ||= { base: '', spots: [], memo: '' }));
      savePlan(); renderPlan(); renderSpots(); toast('読み込みました');
    } catch { toast('読み込めませんでした。書き出した文字をそのまま貼ってください'); }
  });
}

/* ---------- 開始 ---------- */
load().then(init).catch((e) => {
  document.querySelector('main').innerHTML = `<div class="panel">データを読み込めませんでした：${esc(e.message)}</div>`;
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
