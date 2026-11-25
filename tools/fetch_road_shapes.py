"""
Download the REAL ROAD PATH between every pair of consecutive Pumabús stops,
using the free OSRM routing service (OpenStreetMap roads).

Run it on YOUR computer (needs internet), from the project folder:
    python3 tools/fetch_road_shapes.py
then rebuild the data:
    python3 tools/merge_pumabus.py

Output: tools/source/road_shapes.json
    { "fromId>toId": { "meters": 812, "shape": [[lat, lon], ...], "source": "osrm" }, ... }

The stops stay the only graph nodes. The shape points are auxiliary points used
to (1) measure the real road distance = edge weight and (2) draw the route on
the map along the streets. Segments that look suspicious are listed at the end
so you can fix them by hand (see tools/source/road_fixes.geojson in the README).
"""
import json, math, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.load(open(ROOT / 'data/pumabus.json', encoding='utf-8'))
OUT = ROOT / 'tools/source/road_shapes.json'
OSRM = 'https://router.project-osrm.org/route/v1/driving/'

stops = {s['id']: s for s in DATA['stops']}


def hav(a, b):
    R = 6371000
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def fetch(coords):
    path = ';'.join(f"{s['lon']},{s['lat']}" for s in coords)
    url = f'{OSRM}{path}?overview=false&steps=true&geometries=geojson'
    req = urllib.request.Request(url, headers={'User-Agent': 'RutaCU-UNAM-student-project'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


shapes = json.load(open(OUT, encoding='utf-8')) if OUT.exists() else {}
warnings = []

for line in DATA['lines']:
    seq = [stops[i] for i in line['stops']]
    if line.get('circular'):
        seq = seq + [seq[0]]
    print(f"{line['name']}: {len(seq) - 1} tramos… ", end='', flush=True)
    try:
        res = fetch(seq)
    except Exception as e:
        print(f'ERROR ({e})')
        continue
    if res.get('code') != 'Ok':
        print(f"ERROR ({res.get('code')}: {res.get('message')})")
        continue
    # How far OSRM had to move each stop to put it on a road
    for wp, s in zip(res['waypoints'], seq):
        if wp['distance'] > 40:
            warnings.append(f"{s['name']}: la calle más cercana está a {wp['distance']:.0f} m (¿coordenada fuera de la vialidad?)")
    for i, leg in enumerate(res['routes'][0]['legs']):
        a, b = seq[i], seq[i + 1]
        pts = []
        for step in leg['steps']:
            for lon, lat in step['geometry']['coordinates']:
                p = [round(lat, 6), round(lon, 6)]
                if not pts or pts[-1] != p:
                    pts.append(p)
        meters = leg['distance']
        straight = hav((a['lat'], a['lon']), (b['lat'], b['lon']))
        key = f"{a['id']}>{b['id']}"
        shapes[key] = {'meters': round(meters), 'shape': pts, 'source': 'osrm'}
        if straight > 0 and meters > 3.5 * straight and meters > 900:
            warnings.append(f"{line['name']}: {a['name']} → {b['name']} = {meters:.0f} m por calle "
                            f"vs {straight:.0f} m en línea recta (¿rodeo por un sentido prohibido?)")
    print('ok')
    time.sleep(1.2)  # be polite with the free public server

OUT.write_text(json.dumps(shapes, ensure_ascii=False), encoding='utf-8')
print(f'\n✓ {len(shapes)} tramos guardados en {OUT.relative_to(ROOT)}')
print('\nRevisa estos tramos en el mapa (y corrígelos a mano si están mal):')
for w in warnings or ['(ninguno)']:
    print('  ', w)
print('\nAhora corre:  python3 tools/merge_pumabus.py')
