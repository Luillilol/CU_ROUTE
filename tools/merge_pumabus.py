"""
Build data/pumabus.json from:
  tools/source/locations.geojson        -> stops (coordinates, description, photo, routes)
  tools/source/mapeo_progreso.geojson   -> geojson.io progress (cross-check + drawn route lines)
  tools/pumabus_routes_order.json       -> stop order of the 13 routes (official PDF)

Usage:  python3 tools/merge_pumabus.py
Prints a report of every issue found.
"""
import json, math, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOC = json.load(open(ROOT / 'tools/source/locations.geojson', encoding='utf-8'))
PROG = json.load(open(ROOT / 'tools/source/mapeo_progreso.geojson', encoding='utf-8'))
ORDER = json.load(open(ROOT / 'tools/pumabus_routes_order.json', encoding='utf-8'))

WAIT_MIN = 8  # assumption when a route has no wait_min


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


# Spellings that normalization alone cannot reconcile -> canonical (PDF) name
ALIASES = {
    'psquiatriaysaludmental': 'Psiquiatría y Salud Mental',
    'enalltedificiosayb': 'ENALLT Edif. A y B',
    'enaltcele': 'ENALLT Edif. A y B',
    'baseestadiooimpico': 'Base Estadio Olímpico',
    'basemetro': 'Base Metro Universidad',
    'facultadmveterinaria': 'Facultad de Veterinaria',
    'insitutodegeofisica': 'Instituto de Geofísica',
    'investigacionesfiologicas': 'Investigaciones Filológicas',
    'pistadecalentamietoii': 'Pista de calentamiento II',
}

route_names = []
for r in ORDER['routes']:
    for s in r['stops']:
        if s not in route_names:
            route_names.append(s)
canon_by_norm = {norm(n): n for n in route_names}


def canonical(name):
    k = norm(name)
    return canon_by_norm.get(k) or ALIASES.get(k)


def hav(a, b):
    R = 6371000
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


issues = {'typos': [], 'unmatched': [], 'coords': [], 'membership': [], 'missing': [], 'lines': []}

# ---------------------------------------------------------------- 1. stops from locations.geojson
stops = {}  # canonical name -> stop
for f in LOC['features']:
    p = f['properties']
    c = canonical(p['name'])
    if not c:
        issues['unmatched'].append(f"locations: \"{p['name']}\" no aparece en ninguna ruta del PDF")
        continue
    if p['name'] != c and norm(p['name']) != norm(c):
        issues['typos'].append(f"locations: \"{p['name']}\" → \"{c}\"")
    stops[c] = {
        'id': re.sub(r'[^a-z0-9_]', '_', p['key']),
        'name': c,
        'lat': round(f['geometry']['coordinates'][1], 6),
        'lon': round(f['geometry']['coordinates'][0], 6),
        'description': p.get('description', ''),
        'photo': p.get('photo', ''),
        '_routes_declared': p.get('routes', []),
    }

for n in route_names:
    if n not in stops:
        issues['missing'].append(f"\"{n}\" está en el PDF pero no en locations.geojson")

# ---------------------------------------------------------------- 2. cross-check with progress file
prog_points = {}
for f in PROG['features']:
    if f['geometry']['type'] != 'Point':
        continue
    name = f['properties']['name']
    pt = f['geometry']['coordinates']
    c = canonical(name)
    if norm(name) == 'pumitas':  # single "Pumitas" in progress: nearest of Pumitas I / II
        c = min(('Pumitas I', 'Pumitas II'), key=lambda n: hav(pt, (stops[n]['lon'], stops[n]['lat'])))
    if not c:
        issues['unmatched'].append(f"progreso: \"{name}\" no se pudo asociar a ninguna parada")
        continue
    if name.strip() != c and norm(name) != norm(c):
        issues['typos'].append(f"progreso: \"{name}\" → \"{c}\"")
    prog_points[c] = pt
    if c in stops:
        d = hav(pt, (stops[c]['lon'], stops[c]['lat']))
        if d > 25:
            issues['coords'].append((d, c))

# ---------------------------------------------------------------- 3. route membership (declared vs PDF)
pdf_routes = {n: set() for n in stops}
for r in ORDER['routes']:
    num = int(r['id'][1:])
    for s in r['stops']:
        if s in pdf_routes:
            pdf_routes[s].add(num)
for n, s in stops.items():
    declared = set(s.pop('_routes_declared'))
    real = pdf_routes[n]
    if declared != real:
        extra = sorted(declared - real)
        miss = sorted(real - declared)
        msg = f"{n}: locations dice {sorted(declared)}, el PDF dice {sorted(real)}"
        issues['membership'].append(msg)
    s['routes'] = sorted(real)

# ---------------------------------------------------------------- 4. drawn route lines (measured distances)
drawn = {}
for f in PROG['features']:
    if f['geometry']['type'] != 'LineString':
        continue
    rid = str(f['properties'].get('id') or '')
    coords = f['geometry']['coordinates']
    seq, dists, acc, prev = [], [], 0.0, None
    for v in coords:
        if prev:
            acc += hav(prev, v)
        prev = v
        best = min(prog_points, key=lambda n: hav(v, prog_points[n]))
        if hav(v, prog_points[best]) <= 30:
            if seq and seq[-1] == best:
                continue
            if seq:
                dists.append(round(acc))
            seq.append(best)
            acc = 0.0
    drawn[rid] = (seq, dists, f['properties'])

# ---------------------------------------------------------------- 5. build lines
lines = []
for r in ORDER['routes']:
    seq = r['stops']
    line = {
        'id': r['id'], 'name': r['name'], 'color': r['color'],
        'wait_min': WAIT_MIN, 'circular': True,
        'stops': [stops[s]['id'] for s in seq if s in stops],
    }
    if r['id'] in drawn:
        dseq, dists, props = drawn[r['id']]
        expected = seq + [seq[0]]
        if dseq == expected:
            line['segment_meters'] = dists
            line['wait_min'] = props.get('wait_min', WAIT_MIN)
            line['color'] = props.get('color', line['color'])
        else:
            issues['lines'].append(f"{r['name']}: la línea dibujada no sigue el orden del PDF "
                                   f"(dibujada: {len(dseq)} paradas, esperado: {len(expected)})")
    lines.append(line)

data = {
    'speed_kmh': 15,
    'transfer_penalty_min': 2,
    'detour_factor': 1.3,
    'stops': list(stops.values()),
    'lines': lines,
}
(ROOT / 'data/pumabus.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

# ---------------------------------------------------------------- report
print(f"✓ data/pumabus.json: {len(stops)} paradas, {len(lines)} rutas")
print(f"  Rutas con distancias medidas del dibujo: {[k for k in drawn if k]}")
print("\n== Erratas en nombres (corregidas automáticamente) ==")
for t in issues['typos']: print('  ', t)
print("\n== Paradas no asociadas ==")
for t in issues['unmatched'] or ['(ninguna)']: print('  ', t)
print("\n== Paradas del PDF que faltan ==")
for t in issues['missing'] or ['(ninguna)']: print('  ', t)
print("\n== Coordenadas distintas entre archivos (> 25 m) ==")
for d, n in sorted(issues['coords'], reverse=True): print(f"   {n}: {d:.0f} m")
print("\n== Rutas declaradas en locations ≠ PDF ==")
for t in issues['membership'] or ['(ninguna)']: print('  ', t)
print("\n== Líneas dibujadas ==")
for t in issues['lines'] or ['(todas coinciden con el PDF)']: print('  ', t)
