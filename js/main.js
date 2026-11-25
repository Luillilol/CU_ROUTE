// User interface: Leaflet map + control panel + animation.
// `L` (Leaflet) is loaded as a global script in index.html.

import { ALGORITHMS, algorithmById, runSearch } from './search/index.js';
import { PumabusMap } from './problems/PumabusMap.js';
import { BiciMap } from './problems/BiciMap.js';

const $ = (id) => document.getElementById(id);

const COLORS = {
  start: '#1d3557',
  goal: '#e63946',
  frontier: '#2a9d8f',
  explored: '#f4a261',
  path: '#e63946',
};

const ui = {
  mode: 'pumabus',
  maps: {},
  markers: new Map(), // place id -> { marker, node }
  explored: new Set(),
  frontier: new Set(),
  anim: null, // { gen, problem, algo, opts, raf, running }
  pickNext: 'start',
};

// ---------------------------------------------------------------------------
// Map setup
// ---------------------------------------------------------------------------
const map = L.map('map').setView([19.327, -99.183], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const networkLayer = L.layerGroup().addTo(map);
const pathLayer = L.layerGroup().addTo(map);
const markerLayer = L.featureGroup().addTo(map); // featureGroup supports bringToFront()

const currentMap = () => ui.maps[ui.mode];
const currentAlgo = () => algorithmById($('algo').value);
const searchOpts = () => ({ limit: Number($('limit').value) || 0 });

function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function styleFor(id) {
  const entry = ui.markers.get(id);
  if (!entry) return null;
  const { node } = entry;
  const big = node.selectable;
  const base = { radius: big ? 7 : 4, color: '#333', weight: 1, fillOpacity: 1, fillColor: big ? '#fff' : '#999' };
  if (id === $('start').value) return { ...base, radius: 10, fillColor: COLORS.start, weight: 2 };
  if (id === $('goal').value) return { ...base, radius: 10, fillColor: COLORS.goal, weight: 2 };
  if (ui.explored.has(id)) return { ...base, fillColor: COLORS.explored };
  if (ui.frontier.has(id)) return { ...base, fillColor: COLORS.frontier };
  return base;
}

function paint(id) {
  const entry = ui.markers.get(id);
  const style = styleFor(id);
  if (entry && style) entry.marker.setStyle(style);
}

function paintAll() {
  for (const id of ui.markers.keys()) paint(id);
}

function drawNetwork() {
  networkLayer.clearLayers();
  markerLayer.clearLayers();
  ui.markers.clear();
  const m = currentMap();

  for (const seg of m.drawSegments()) {
    L.polyline(seg.coords, { color: seg.color, weight: 4, opacity: 0.6 })
      .bindTooltip(seg.label, { sticky: true })
      .addTo(networkLayer);
  }

  const bounds = [];
  for (const node of m.drawNodes()) {
    const marker = L.circleMarker([node.lat, node.lon], { radius: 6 })
      .bindTooltip(node.name)
      .addTo(markerLayer);
    if (node.selectable) marker.on('click', () => pickPlace(node.id));
    ui.markers.set(node.id, { marker, node });
    bounds.push([node.lat, node.lon]);
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
  paintAll();
}

function drawRoute(result, problem) {
  pathLayer.clearLayers();
  $('itinerary').innerHTML = '';
  $('summary').textContent = '';
  if (!result.found) {
    setStatus(`No se encontró ruta: ${result.note}`, true);
    return;
  }
  const m = currentMap();
  const places = [];
  for (const s of result.path) {
    const p = problem.placeOf(s);
    if (places[places.length - 1] !== p) places.push(p);
  }
  L.polyline(places.map((p) => m.coordsOf(p)), { color: COLORS.path, weight: 7, opacity: 0.85 }).addTo(pathLayer);

  $('summary').textContent = problem.summarize(result).text;
  for (const line of problem.itinerary(result)) {
    const li = document.createElement('li');
    li.textContent = line;
    $('itinerary').appendChild(li);
  }
  markerLayer.bringToFront(); // keep stops above the route line
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------
function costText(result, problem) {
  if (!result.found) return '—';
  return problem.summarize(result).text;
}

function addResultRow(algo, result, ms, problem, optimalCost = null) {
  const tr = document.createElement('tr');
  const isOpt = optimalCost !== null && result.found && Math.abs(result.cost - optimalCost) < 1e-6;
  if (isOpt) tr.classList.add('optimal');
  const cells = [
    algo.name,
    result.found ? '✓' : result.note,
    costText(result, problem),
    result.stats.expanded,
    result.stats.generated,
    result.stats.maxFrontier,
    ms.toFixed(2),
    result.found ? result.actions.length : '—',
    optimalCost === null ? '' : isOpt ? '✓' : '✗',
  ];
  cells.forEach((c, i) => {
    const td = document.createElement('td');
    td.textContent = c;
    if (i === 8 && c) td.className = c === '✓' ? 'ok' : 'bad';
    tr.appendChild(td);
  });
  $('results').querySelector('tbody').appendChild(tr);
  return tr;
}

// ---------------------------------------------------------------------------
// Search runs
// ---------------------------------------------------------------------------
function makeProblem() {
  return currentMap().makeProblem($('start').value, $('goal').value, $('criterion').value);
}

function stopAnimation() {
  if (ui.anim?.raf) cancelAnimationFrame(ui.anim.raf);
  ui.anim = null;
}

function clearSearch() {
  stopAnimation();
  ui.explored.clear();
  ui.frontier.clear();
  pathLayer.clearLayers();
  $('itinerary').innerHTML = '';
  $('summary').textContent = '';
  paintAll();
}

function applyEvent(ev, problem) {
  if (ev.restart) {
    ui.explored.clear();
    ui.frontier.clear();
    paintAll();
    setStatus(`IDDFS · probando profundidad ℓ = ${ev.depth}`);
    return;
  }
  if (ev.expanded !== undefined) {
    const p = problem.placeOf(ev.expanded);
    ui.frontier.delete(p);
    ui.explored.add(p);
    paint(p);
  }
  for (const s of ev.added ?? []) {
    const p = problem.placeOf(s);
    if (!ui.explored.has(p)) {
      ui.frontier.add(p);
      paint(p);
    }
  }
  if (ev.bound !== undefined) setStatus(`DFBB · nueva cota: ${ev.bound.toFixed(2)}`);
}

function startGenerator() {
  clearSearch();
  const problem = makeProblem();
  const algo = currentAlgo();
  const opts = searchOpts();
  ui.anim = { gen: algo.fn(problem, opts), problem, algo, opts, raf: null };
  setStatus(`${algo.name} · buscando…`);
}

/** Advance n steps. Returns true when the search finished. */
function advance(n) {
  const a = ui.anim;
  for (let i = 0; i < n; i++) {
    const step = a.gen.next();
    if (step.done) {
      finishAnimation(step.value);
      return true;
    }
    applyEvent(step.value, a.problem);
  }
  return false;
}

function finishAnimation(result) {
  const { problem, algo, opts } = ui.anim;
  stopAnimation();
  drawRoute(result, problem);
  // Re-run without animation to measure real execution time.
  const measured = runSearch(makeProblem(), algo, opts);
  addResultRow(algo, measured.result, measured.ms, problem);
  if (result.found) setStatus(`${algo.name} · terminado: ${result.stats.expanded} nodos expandidos`);
}

/**
 * Animation speed. The slider (1..100) maps to STEPS PER SECOND on an
 * exponential scale, so the slow end is really slow:
 *   1 -> 0.5 steps/s (one expansion every 2 s) ... 100 -> 300 steps/s
 */
const MIN_STEPS_PER_SEC = 0.5;
const MAX_STEPS_PER_SEC = 300;

function stepsPerSecond() {
  const v = Number($('speed').value); // 1..100
  return MIN_STEPS_PER_SEC * (MAX_STEPS_PER_SEC / MIN_STEPS_PER_SEC) ** ((v - 1) / 99);
}

function updateSpeedLabel() {
  const sps = stepsPerSecond();
  $('speedLabel').textContent = sps < 1 ? `(1 paso cada ${(1 / sps).toFixed(1)} s)` : `(${sps.toFixed(sps < 10 ? 1 : 0)} pasos/s)`;
}

function animate() {
  if (!ui.anim) startGenerator();
  if (ui.anim.raf) return; // already running
  let last = performance.now();
  let budget = 1; // do the first step right away
  const loop = (now) => {
    if (!ui.anim) return;
    // Accumulate "how many steps we owe" according to the elapsed time.
    budget += ((now - last) / 1000) * stepsPerSecond();
    last = now;
    const n = Math.floor(budget);
    if (n > 0) {
      budget -= n;
      if (advance(n)) return; // search finished
    }
    ui.anim.raf = requestAnimationFrame(loop);
  };
  ui.anim.raf = requestAnimationFrame(loop);
}

function stepOnce() {
  if (!ui.anim) startGenerator();
  else if (ui.anim.raf) {
    cancelAnimationFrame(ui.anim.raf);
    ui.anim.raf = null;
  }
  advance(1);
}

function solveInstant() {
  clearSearch();
  const problem = makeProblem();
  const algo = currentAlgo();
  const { result, ms, explored } = runSearch(problem, algo, searchOpts());
  ui.explored = explored;
  paintAll();
  drawRoute(result, problem);
  addResultRow(algo, result, ms, problem);
  if (result.found) setStatus(`${algo.name} · ${result.stats.expanded} nodos expandidos en ${ms.toFixed(2)} ms`);
}

function compareAll() {
  clearSearch();
  $('results').querySelector('tbody').innerHTML = '';
  const runs = ALGORITHMS.map((algo) => {
    const problem = makeProblem();
    return { algo, problem, ...runSearch(problem, algo, searchOpts()) };
  });
  const ucsRun = runs.find((r) => r.algo.id === 'ucs');
  const optimalCost = ucsRun.result.found ? ucsRun.result.cost : null;

  const minExpanded = Math.min(...runs.filter((r) => r.result.found).map((r) => r.result.stats.expanded));
  for (const r of runs) {
    const tr = addResultRow(r.algo, r.result, r.ms, r.problem, optimalCost);
    if (r.result.found && r.result.stats.expanded === minExpanded) tr.classList.add('best-expanded');
  }

  // Show the A* route and its explored nodes on the map.
  const star = runs.find((r) => r.algo.id === 'astar');
  ui.explored = star.explored;
  paintAll();
  drawRoute(star.result, star.problem);
  setStatus(optimalCost === null ? 'No existe ruta entre A y B' : 'Comparación lista · en el mapa se muestra A*');
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function fillSelect(select, items, getValue, getLabel) {
  select.innerHTML = '';
  for (const it of items) {
    const opt = document.createElement('option');
    opt.value = getValue(it);
    opt.textContent = getLabel(it);
    select.appendChild(opt);
  }
}

function pickPlace(id) {
  $(ui.pickNext).value = id;
  ui.pickNext = ui.pickNext === 'start' ? 'goal' : 'start';
  clearSearch();
  setStatus(`Origen: ${currentMap().name($('start').value)} · Destino: ${currentMap().name($('goal').value)}`);
}

function switchMode(mode) {
  ui.mode = mode;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  const m = currentMap();
  const places = [...m.places()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  fillSelect($('start'), places, (p) => p.id, (p) => p.name);
  fillSelect($('goal'), places, (p) => p.id, (p) => p.name);
  if (places.length > 1) $('goal').value = places[places.length - 1].id;
  fillSelect($('criterion'), m.criteria, (c) => c.id, (c) => c.name);
  $('placeholderBanner').classList.toggle('hidden', !m.data._placeholder);
  $('results').querySelector('tbody').innerHTML = '';
  ui.pickNext = 'start';
  clearSearch();
  drawNetwork();
  setStatus(`Mapa ${m.label}: elige origen y destino.`);
}

function bindEvents() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
  for (const id of ['start', 'goal', 'criterion']) $(id).addEventListener('change', clearSearch);
  $('algo').addEventListener('change', () => {
    $('limitWrap').classList.toggle('hidden', !currentAlgo().usesLimit);
    clearSearch();
  });
  $('run').addEventListener('click', animate);
  $('step').addEventListener('click', stepOnce);
  $('instant').addEventListener('click', solveInstant);
  $('compare').addEventListener('click', compareAll);
  $('speed').addEventListener('input', updateSpeedLabel); // takes effect immediately, even mid-animation
  $('reset').addEventListener('click', () => {
    clearSearch();
    $('results').querySelector('tbody').innerHTML = '';
    setStatus('');
  });
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-store' }); // always load the latest data
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.json();
}

async function init() {
  fillSelect($('algo'), ALGORITHMS, (a) => a.id, (a) => a.name);
  $('algo').value = 'astar';
  bindEvents();
  updateSpeedLabel();
  try {
    const [pumabus, bicipuma] = await Promise.all([loadJSON('data/pumabus.json'), loadJSON('data/bicipuma.json')]);
    ui.maps.pumabus = new PumabusMap(pumabus);
    ui.maps.bicipuma = new BiciMap(bicipuma);
  } catch (err) {
    setStatus(`Error: ${err.message}. Si abriste index.html directamente, usa un servidor local (ver README).`, true);
    return;
  }
  switchMode('pumabus');
}

init();
