# RutaCU 🚌🚲

**La mejor ruta entre dos puntos de Ciudad Universitaria**, comparando los 9 algoritmos de búsqueda vistos en clase sobre dos mapas independientes: **Pumabús** y **BiciPuma**.

Proyecto final · Inteligencia Artificial · Facultad de Ingeniería, UNAM.
Unidad: **Representación de problemas y búsqueda de soluciones** + interfaz gráfica.

---

## Cómo usarlo

1. Elige el mapa: **Pumabús** o **BiciPuma**.
2. Elige origen (A) y destino (B) en las listas, o con clic en el mapa (primero A, luego B).
3. Elige algoritmo y criterio.
4. Botones:
   - **▶ Animar**: muestra cómo crece la frontera (verde) y los nodos expandidos (naranja).
   - **⏭ Paso**: avanza una expansión a la vez (ideal para explicar en la presentación).
   - **⚡ Resolver**: resultado inmediato.
   - **📊 Comparar los 9**: ejecuta todos los algoritmos y llena la tabla.

## Algoritmos

| Algoritmo | Óptimo en costo | Nota |
|---|---|---|
| BFS | No (sí en número de pasos) | Prueba de meta al generar |
| DFS | No | Búsqueda en grafo, nunca entra en ciclos |
| DLS | No | Límite ℓ configurable; si ℓ es muy chico no encuentra ruta |
| IDDFS | No (sí en número de pasos) | Repite DLS con ℓ = 0, 1, 2… |
| DFBB | **Sí** | Poda cuando g + h ≥ mejor costo encontrado |
| Bidireccional | **Sí** | UCS hacia adelante y hacia atrás (aristas invertidas) |
| UCS | **Sí** | Cola de prioridad por g(n) |
| Greedy Best-First | No | Cola de prioridad por h(n) |
| A* | **Sí** | Cola de prioridad por f(n) = g(n) + h(n) |

## Formulación del problema

**BiciPuma** (grafo no dirigido)
- Estado: nodo (estación o cruce de ciclovía). A y B deben ser estaciones.
- Acciones: pedalear a un nodo vecino.
- Costo: minutos (metros ÷ velocidad) o metros, según el criterio.
- Heurística: distancia en línea recta (haversine) en la misma unidad.

**Pumabús** (grafo dirigido: cada ruta va en un solo sentido)
- Estado: `(parada, ruta)`; antes de abordar, `ruta = null`.
- Acciones: **abordar** (costo = espera promedio), **avanzar** a la siguiente parada (costo = tiempo de viaje) y **transbordar** a otra ruta en la misma parada (costo = espera + penalización).
- Meta: cualquier estado cuya parada sea B.
- Criterios: más rápida (minutos) o menos transbordos (peso grande por transbordo).
- Heurística: distancia en línea recta ÷ velocidad máxima del autobús.

**Admisibilidad:** cada tramo mide al menos la distancia en línea recta y ningún vehículo supera la velocidad máxima, así que h(n) nunca sobreestima; además es consistente (desigualdad del triángulo). Por eso A*, UCS, DFBB y la búsqueda bidireccional devuelven la ruta óptima, y las pruebas automáticas lo verifican.

## Supuestos (documentar en el reporte)

- Velocidad promedio del Pumabús: `speed_kmh` (por defecto 15–18 km/h); de la bici: 12 km/h.
- Espera promedio por ruta: `wait_min`. Penalización por transbordo: `transfer_penalty_min`.
- Si un tramo no trae su longitud real, se estima como línea recta × `detour_factor`.
- No se consideran tráfico, horarios ni disponibilidad de bicicletas.

---

## Correrlo en tu computadora

Los navegadores no permiten cargar los JSON si abres `index.html` con doble clic. Usa un servidor local:

```bash
cd rutacu
python -m http.server 8000
# abre http://localhost:8000
```
(O la extensión **Live Server** de VS Code.)

## Pruebas del motor

```bash
node tests/run.js
```
Comprueba:
1. El grafo del Metro (Tlatelolco → Allende): los algoritmos óptimos coinciden con un óptimo calculado por fuerza bruta.
2. **Todos los pares** A→B de ambos mapas, con ambos criterios: los algoritmos óptimos dan el mismo costo, IDDFS da los mismos pasos que BFS, todas las rutas empiezan en A y terminan en B, y la heurística nunca sobreestima.

Corre las pruebas **cada vez que cambies los datos**.

---

### Pumabús: datos actuales (fusión automática)
`data/pumabus.json` se genera con:
```bash
python3 tools/merge_pumabus.py
```
Combina `tools/source/locations.geojson` (paradas con descripción y foto), `tools/source/mapeo_progreso.geojson` (avance en geojson.io) y `tools/pumabus_routes_order.json` (orden oficial de las 13 rutas, tomado del PDF de la DGSGM). El script imprime un reporte de erratas, paradas faltantes, coordenadas distintas y líneas mal dibujadas. Vuelve a correrlo y luego `node tests/run.js` cada vez que cambies alguna fuente.

### Distancias reales por calle (pesos de las aristas)
El peso de cada arista "avanzar a la siguiente parada" es **la distancia por calle** entre las dos paradas ÷ velocidad del autobús.
Las paradas son los únicos nodos del grafo; los puntos de la calle son **puntos auxiliares** que solo sirven para medir la distancia y dibujar la ruta.

1. **Automático (OSRM / OpenStreetMap)**, con internet, desde la carpeta del proyecto:
   ```bash
   python3 tools/fetch_road_shapes.py   # descarga el camino por calle de cada tramo (~30 s)
   python3 tools/merge_pumabus.py       # reconstruye data/pumabus.json con esas distancias
   node tests/run.js
   ```
   El script lista los tramos sospechosos (rodeos enormes o paradas lejos de la calle) para revisarlos.
2. **Corrección a mano de un tramo** (tiene prioridad sobre OSRM): en geojson.io dibuja **solo ese tramo** como línea siguiendo la calle, con las propiedades `from` = parada de origen y `to` = parada de destino (nombres como en el PDF). Guárdalo como `tools/source/road_fixes.geojson` (puede tener varios tramos) y vuelve a correr `merge_pumabus.py`. Ejemplo: `tools/source/road_fixes.example.geojson`.
3. Si un tramo no tiene camino, se estima como línea recta × `detour_factor` (1.3).

## Reemplazar los datos de ejemplo (⚠️ lo más importante)

`data/pumabus.json` y `data/bicipuma.json` traen **datos inventados** (aparece un aviso amarillo en la página). Para poner los reales:

### Opción A: dibujar en geojson.io (recomendada)
1. Abre https://geojson.io y ubica CU.
2. **Puntos** (marcador): uno por parada o estación. En la tabla de propiedades agrega `name`.
   - BiciPuma: para un cruce de ciclovías que no es estación agrega `station` = `false`.
3. **Líneas**:
   - **Pumabús**: una línea por ruta, dibujada **en el sentido en que va el autobús**, haciendo clic **sobre cada parada** en orden. Si es circular, termina en la parada inicial. Propiedades: `name`, `wait_min` y, opcionalmente, `id` y `color`.
   - **BiciPuma**: dibuja las ciclovías pasando por encima de las estaciones y cruces que conectan.
4. Guarda: *Save → GeoJSON*. Haz un archivo por mapa.
5. Convierte:
   ```bash
   node tools/geojson-to-data.js pumabus  pumabus.geojson  > data/pumabus.json
   node tools/geojson-to-data.js bicipuma bicipuma.geojson > data/bicipuma.json
   ```
   El script usa la longitud real de la línea dibujada para cada tramo y avisa si algo quedó desconectado.
6. Corre `node tests/run.js` y recarga la página.

Un vértice cuenta como "sobre" una parada si está a menos de 30 m. Para cambiarlo: `SNAP_METERS=50 node tools/...`.

### Opción B: editar el JSON a mano
- **Pumabús**: `stops` (id, name, lat, lon) y `lines` (id, name, color, wait_min, circular, stops en orden).
- **BiciPuma**: `nodes` (id, name, lat, lon, station) y `edges` (from, to y, opcionalmente, meters).

Borra la clave `"_placeholder": true` cuando los datos sean reales; así desaparece el aviso.

---

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "RutaCU: proyecto final de IA"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/rutacu.git
git push -u origin main
```
En GitHub ve a **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
En 1–2 minutos queda en `https://<tu-usuario>.github.io/rutacu/`.

> El repositorio debe ser **público** (o tener GitHub Pro, incluido en el GitHub Student Developer Pack).
> Todo el cálculo corre en el navegador de quien abre la página; GitHub solo entrega los archivos.

## Estructura

```
rutacu/
├── index.html            interfaz
├── css/style.css
├── data/                 mapas (JSON)
├── js/
│   ├── main.js           mapa Leaflet, controles y animación
│   ├── geo.js            haversine y utilidades
│   ├── problems/         PumabusMap.js, BiciMap.js (formulación del problema)
│   └── search/           los 9 algoritmos + cola de prioridad
├── tests/run.js          pruebas del motor (Node)
└── tools/                conversor geojson.io → JSON (no se publica en la app)
```

Mapa base © colaboradores de OpenStreetMap.
