/* PWA with club selection, per-club distances and dispersion (with ellipses). */
let map, round = null, holeIndex = 1, markers = {}, polylines = {}, shotsByHole = {};
const holeNumEl = document.getElementById('holeNum');
const strokesEl = document.getElementById('strokes');
const puttsEl = document.getElementById('putts');
const penaltiesEl = document.getElementById('penalties');
const bannerEl = document.getElementById('banner');
const clubSelect = document.getElementById('clubSelect');

function metersToYards(m) { return m * 1.09361; }
function hav(a, b) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s1 = Math.sin(dLat/2), s2 = Math.sin(dLon/2);
  const x = s1*s1 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function toXY(c) {
  const R = 6371000;
  const x = c.lon * Math.PI/180 * R * Math.cos(c.lat * Math.PI/180);
  const y = c.lat * Math.PI/180 * R;
  return {x,y};
}
function computeDispersion(start, end, target) {
  const s = toXY(start), e = toXY(end), t = toXY(target);
  const vx = t.x - s.x, vy = t.y - s.y;
  const vlen = Math.max(1e-6, Math.hypot(vx, vy));
  const ux = vx / vlen, uy = vy / vlen;
  const px = e.x - s.x, py = e.y - s.y;
  const forward = px*ux + py*uy;
  const lateral = px*(-uy) + py*ux;
  return { forward: metersToYards(forward), lateral: metersToYards(lateral) };
}

function saveState() {
  localStorage.setItem('golfRound', JSON.stringify({ round, holeIndex, shotsByHole, scores: getScores(), selectedClub: clubSelect.value }));
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('golfRound'));
    if (!s) return;
    round = s.round; holeIndex = s.holeIndex || 1; shotsByHole = s.shotsByHole || {};
    const scores = s.scores || {};
    strokesEl.value = scores.strokes || 0;
    puttsEl.value = scores.putts || 0;
    penaltiesEl.value = scores.penalties || 0;
    if (s.selectedClub) clubSelect.value = s.selectedClub;
    holeNumEl.textContent = holeIndex;
  } catch {}
}
function getScores() { return { strokes: Number(strokesEl.value), putts: Number(puttsEl.value), penalties: Number(penaltiesEl.value) }; }
function setBanner(msg) { bannerEl.textContent = msg || ''; }
function ensureHoleData(i) { shotsByHole[i] ??= []; markers[i] ??= []; }

function drawHole(i) {
  (markers[i]||[]).forEach(m => m.remove());
  (polylines[i]||[]).forEach(l => l.remove());
  markers[i] = []; polylines[i] = [];
  const shots = shotsByHole[i] || [];
  for (let s=0; s<shots.length; s++) {
    const m = L.marker([shots[s].lat, shots[s].lon], { draggable: true }).addTo(map);
    m.bindTooltip(`${shots[s].club || shots[s].type || 'shot'} • ${s+1}`);
    m.on('dragend', e => {
      const {lat, lng} = e.target.getLatLng();
      shots[s].lat = lat; shots[s].lon = lng;
      refreshPolylines(i); saveState();
    });
    markers[i].push(m);
  }
  refreshPolylines(i);
}
function refreshPolylines(i) {
  (polylines[i]||[]).forEach(l => l.remove());
  polylines[i] = [];
  const shots = shotsByHole[i] || [];
  if (shots.length > 1) {
    const latlngs = shots.map(s => [s.lat, s.lon]);
    const line = L.polyline(latlngs, { color: '#4aa3ff' }).addTo(map);
    polylines[i].push(line);
  }
}
function setHole(i) { holeIndex = i; holeNumEl.textContent = holeIndex; drawHole(i); saveState(); }

function currentGPS(cb) {
  if (!navigator.geolocation) return setBanner('Location not supported');
  navigator.geolocation.getCurrentPosition(
    pos => cb({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }),
    err => setBanner('Location error: ' + err.message),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );
}

function mark(type, club) {
  ensureHoleData(holeIndex);
  currentGPS(loc => {
    if (loc.acc > 20) setBanner('Weak GPS (~' + Math.round(loc.acc) + 'm). You can drag the pin to refine.');
    const shot = { lat: loc.lat, lon: loc.lon, type, club };
    shotsByHole[holeIndex].push(shot);
    const m = L.marker([shot.lat, shot.lon], { draggable: true }).addTo(map);
    m.bindTooltip(`${shot.club || shot.type || 'shot'} • ${shotsByHole[holeIndex].length}`);
    m.on('dragend', e => {
      const {lat, lng} = e.target.getLatLng();
      shot.lat = lat; shot.lon = lng;
      refreshPolylines(holeIndex); saveState();
    });
    markers[holeIndex].push(m);
    refreshPolylines(holeIndex);
    saveState();
  });
}

function exportCSV() {
  let rows = ["Hole,Seq,Lat,Lon,Type,Club,DistanceYds"];
  for (const h in shotsByHole) {
    const arr = shotsByHole[h];
    for (let i=0; i<arr.length; i++) {
      let dist = '';
      if (i>0) {
        const a = arr[i-1], b = arr[i];
        dist = Math.round(metersToYards(hav(a,b)));
      }
      rows.push([h, i+1, arr[i].lat, arr[i].lon, arr[i].type||'shot', arr[i].club||'', dist].join(','));
    }
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'round.csv'; a.click();
  URL.revokeObjectURL(url);
}

function computeSummary() {
  const scores = getScores();
  let totalShots = 0; Object.values(shotsByHole).forEach(arr => totalShots += arr.length);
  // per-club distances from sequential shots
  let clubDistances = {};
  for (const h in shotsByHole) {
    const arr = shotsByHole[h];
    for (let i=1; i<arr.length; i++) {
      const prev = arr[i-1], cur = arr[i];
      const d = Math.round(metersToYards(hav(prev, cur)));
      const name = (cur.type === 'putt') ? 'Putter' : (cur.club || 'Unknown');
      if (cur.type !== 'penalty') {
        (clubDistances[name] ??= []).push(d);
      }
    }
  }
  let perClubAvg = [];
  for (const k in clubDistances) {
    const list = clubDistances[k]; const avg = Math.round(list.reduce((a,b)=>a+b,0)/list.length);
    perClubAvg.push({club:k, avg});
  }
  perClubAvg.sort((a,b)=>b.avg-a.avg);
  return { totalShots, scores, perClubAvg };
}

function showSummary() {
  const s = computeSummary();
  const el = document.getElementById('summaryPanel');
  const cards = document.getElementById('cards');
  cards.innerHTML = '';
  const mk = (t,v)=>{ const d=document.createElement('div');d.className='card';d.innerHTML=`<h3>${t}</h3><p>${v}</p>`; return d; };
  cards.append(mk('Total Shots', s.totalShots));
  cards.append(mk('Strokes', s.scores.strokes));
  cards.append(mk('Putts', s.scores.putts));
  cards.append(mk('Penalties', s.scores.penalties));
  // Bar chart of per-club avg
  drawClubCanvas(s.perClubAvg);
  // Per-club dispersion
  drawDispersionCanvas();
  el.classList.remove('hidden');
}

function closeSummary() { document.getElementById('summaryPanel').classList.add('hidden'); }

function colorForClub(name) {
  const palette = ['#4aa3ff', '#6fbf73', '#f5a524', '#ef5350', '#ab47bc', '#26a69a', '#8d6e63', '#29b6f6', '#ff7043', '#9ccc65'];
  let hash = 0; for (let i=0; i<name.length; i++) hash = (hash*31 + name.charCodeAt(i)) & 0xffffffff;
  return palette[Math.abs(hash) % palette.length];
}

function drawClubCanvas(perClubAvg) {
  const canvas = document.getElementById('clubChart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (!perClubAvg.length) return;
  const w = canvas.width, h = canvas.height, max = Math.max(...perClubAvg.map(x=>x.avg));
  const barW = Math.max(18, Math.floor((w-20)/perClubAvg.length) - 6);
  perClubAvg.forEach((it, i) => {
    const barH = (it.avg / max) * (h - 30);
    const x = 10 + i*(barW+6);
    const y = h - barH - 16;
    ctx.fillStyle = colorForClub(it.club);
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = '#9aa4b2';
    ctx.font = '10px -apple-system, system-ui';
    ctx.fillText(it.club, x, h-4);
  });
}

function drawDispersionCanvas() {
  const canvas = document.getElementById('dispersionChart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const w = canvas.width, h = canvas.height;

  // Build per-club points: for each hole, start = first shot, target = last (rough pin)
  let perClub = {};
  for (const hk in shotsByHole) {
    const arr = shotsByHole[hk];
    if (arr.length < 2) continue;
    const start = arr[0], target = arr[arr.length-1];
    for (let i=1; i<arr.length; i++) {
      const p = arr[i];
      const res = computeDispersion(start, p, target);
      const name = (p.type === 'putt') ? 'Putter' : (p.type === 'penalty') ? 'Penalty' : (p.club || 'Unknown');
      (perClub[name] ??= []).push(res);
    }
  }

  const xScale = x => (x + 50) / 100 * w;
  const yScale = y => h - (y / 300) * h;

  // scatter + ellipse per club
  for (const club in perClub) {
    const pts = perClub[club];
    const color = colorForClub(club);
    // scatter
    ctx.fillStyle = color;
    for (const p of pts) {
      ctx.beginPath(); ctx.arc(xScale(p.lateral), yScale(p.forward), 3, 0, Math.PI*2); ctx.fill();
    }
    // ellipse (1-sigma)
    if (pts.length >= 3) {
      const mean = ptsMean(pts);
      const cov = ptsCov(pts, mean);
      const ell = ellipseFromCov(mean, cov);
      if (ell) drawEllipse(ctx, ell, xScale, yScale, color);
    }
  }

  // axes
  ctx.strokeStyle = '#3a4150';
  ctx.beginPath(); ctx.moveTo(0, yScale(0)); ctx.lineTo(w, yScale(0)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xScale(0), 0); ctx.lineTo(xScale(0), h); ctx.stroke();
  ctx.fillStyle = '#9aa4b2'; ctx.font = '10px -apple-system, system-ui';
  ctx.fillText('Left / Right (yd)', 6, 12);
  ctx.fillText('Forward (yd)', 6, 24);
}

function ptsMean(ps) {
  const n = ps.length;
  let sx=0, sy=0; for (const p of ps) { sx += p.lateral; sy += p.forward; }
  return { x: sx/n, y: sy/n };
}
function ptsCov(ps, m) {
  const n = ps.length;
  let cxx=0, cyy=0, cxy=0;
  for (const p of ps) {
    const dx = p.lateral - m.x, dy = p.forward - m.y;
    cxx += dx*dx; cyy += dy*dy; cxy += dx*dy;
  }
  cxx /= (n-1); cyy /= (n-1); cxy /= (n-1);
  return { cxx, cyy, cxy };
}
function ellipseFromCov(mean, cov) {
  const tr = cov.cxx + cov.cyy;
  const det = cov.cxx*cov.cyy - cov.cxy*cov.cxy;
  const term = Math.sqrt(Math.max(0, tr*tr/4 - det));
  const l1 = tr/2 + term, l2 = tr/2 - term;
  const angle = Math.atan2(l1 - cov.cxx, cov.cxy || 1e-6);
  return { cx: mean.x, cy: mean.y, rx: Math.sqrt(Math.max(l1,0)), ry: Math.sqrt(Math.max(l2,0)), angle };
}
function drawEllipse(ctx, e, xScale, yScale, color) {
  ctx.save();
  ctx.translate(xScale(e.cx), yScale(e.cy));
  ctx.rotate(-e.angle);
  ctx.strokeStyle = color;
  ctx.fillStyle = hexToRgba(color, 0.25);
  ctx.lineWidth = 2;
  ctx.beginPath();
  const sx = (xScale(e.cx+e.rx) - xScale(e.cx));
  const sy = (yScale(e.cy) - yScale(e.cy+e.ry));
  ctx.ellipse(0, 0, Math.abs(sx), Math.abs(sy), 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
function hexToRgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(100,150,200,${a})`;
  return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`;
}

document.getElementById('btnStart').onclick = () => {
  if (round) return;
  round = { id: Date.now() };
  shotsByHole = {}; holeIndex = 1;
  setHole(1);
  saveState();
  document.getElementById('btnStart').disabled = true;
  document.getElementById('btnEnd').disabled = false;
  setBanner('Round started. Pick a club and tap Mark Shot, or tap the map.');
};
document.getElementById('btnEnd').onclick = () => {
  round = null; saveState();
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnEnd').disabled = true;
  setBanner('Round ended.');
};

document.getElementById('markShot').onclick = ()=>mark('shot', clubSelect.value);
document.getElementById('markPutt').onclick = ()=>mark('putt', 'Putter');
document.getElementById('markPenalty').onclick = ()=>mark('penalty', 'Penalty');

document.getElementById('prevHole').onclick = ()=> setHole(Math.max(1, holeIndex-1));
document.getElementById('nextHole').onclick = ()=> setHole(Math.min(18, holeIndex+1));

document.getElementById('exportCSV').onclick = exportCSV;
document.getElementById('summary').onclick = showSummary;
document.getElementById('closeSummary').onclick = closeSummary;

function bootMap() {
  map = L.map('map', { zoomControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  map.setView([40.0,-100.0], 4);

  map.on('click', e => {
    // manual shot at tap location with selected club
    ensureHoleData(holeIndex);
    const shot = { lat: e.latlng.lat, lon: e.latlng.lng, type:'shot', club: clubSelect.value };
    shotsByHole[holeIndex].push(shot);
    const m = L.marker([shot.lat, shot.lon], { draggable: true }).addTo(map);
    m.bindTooltip(`${shot.club} • ${shotsByHole[holeIndex].length}`);
    m.on('dragend', ev => {
      const {lat, lng} = ev.target.getLatLng();
      shot.lat = lat; shot.lon = lng; refreshPolylines(holeIndex); saveState();
    });
    markers[holeIndex].push(m);
    refreshPolylines(holeIndex);
    saveState();
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(p => {
      map.setView([p.coords.latitude, p.coords.longitude], 16);
    });
  }
}

window.addEventListener('load', () => {
  loadState();
  bootMap();
  setHole(holeIndex);
});
