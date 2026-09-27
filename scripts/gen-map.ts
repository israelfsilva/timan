// Gera src/world.ts: bitset 96×40 de terra, a partir do Natural Earth 110m land.
// Rodar manualmente: npm run gen:map
//
// Cada ponto Braille cobre 3,75° × 3,75°. Longitude −180..180, latitude
// +82,5..−67,5 (Antártida cortada). O ponto é terra se o centro dele cai
// dentro de algum polígono. Índice do bit = y·96 + x, LSB primeiro.
import { writeFileSync } from 'node:fs';

const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';
const W = 96;
const H = 40;
const STEP = 3.75;
const TOP = 82.5;

type Ring = [number, number][];
type Geometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };

// Regra par-ímpar sobre todos os anéis do polígono: buracos saem de graça.
function inPolygon(lon: number, lat: number, rings: Ring[]): boolean {
	let inside = false;
	for (const ring of rings) {
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const [xi, yi] = ring[i]!;
			const [xj, yj] = ring[j]!;
			if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
		}
	}
	return inside;
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`${SOURCE}: HTTP ${res.status}`);
const geojson = (await res.json()) as { features: { geometry: Geometry }[] };

const polygons = geojson.features.flatMap((f) =>
	f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
);

const bits = new Uint8Array((W * H) / 8);
for (let y = 0; y < H; y++) {
	const lat = TOP - (y + 0.5) * STEP;
	for (let x = 0; x < W; x++) {
		const lon = -180 + (x + 0.5) * STEP;
		if (polygons.some((p) => inPolygon(lon, lat, p))) {
			const i = y * W + x;
			bits[i >> 3]! |= 1 << (i & 7);
		}
	}
}

const base64 = Buffer.from(bits).toString('base64');
writeFileSync(
	new URL('../src/world.ts', import.meta.url),
	`// Gerado por scripts/gen-map.ts a partir do Natural Earth 110m land. Não editar.
// Bitset ${W}×${H} (${bits.length} bytes), índice = y·${W} + x, LSB primeiro.
export const WORLD_WIDTH = ${W};
export const WORLD_HEIGHT = ${H};
export const WORLD = '${base64}';
`,
);
console.log(`src/world.ts: ${bits.length} bytes, ${bits.reduce((n, b) => n + popcount(b), 0)} pontos de terra`);

function popcount(b: number): number {
	let n = 0;
	for (; b; b &= b - 1) n++;
	return n;
}
