import { BrailleCanvas } from './braille.ts';
import { paint } from './theme.ts';
import { WORLD, WORLD_HEIGHT, WORLD_WIDTH } from './world.ts';

// Equirectangular world map in Braille: each cell has 2×4 dots.
// At 48 cells wide, 1 dot = 3.75° and 1 hour = 15° = 2 columns.
// Size follows the bitset's proportions (96×40 dots = 360°×150°): with width PW
// in dots, the height is PW · 150/360 / k, where k is the cell aspect (aspect.ts).
// With k = 1, 48×10 cells (4.8:1). Larger than the bitset, it is scaled up by nearest neighbor.

const land = Buffer.from(WORLD, 'base64');

function isLand(x: number, y: number): boolean {
	const i = y * WORLD_WIDTH + x;
	return (land[i >> 3]! & (1 << (i & 7))) !== 0;
}

// Cells per map row at equirectangular proportions: (96/2) / (40/4) = 4.8.
const ASPECT = WORLD_WIDTH / 2 / (WORLD_HEIGHT / 4);

// Largest map at these proportions that fits in width × height cells (without ruler and indices).
// Cells per row: ASPECT · k (taller cell = fewer rows for the same width).
export function mapSize(width: number, height: number, k: number): { width: number; height: number } {
	const ratio = ASPECT * k;
	const w = Math.max(1, Math.min(width, Math.floor(height * ratio)));
	return { width: w, height: Math.max(1, Math.round(w / ratio)) };
}

// Left column of an offset's band (minutes) on a map `width` cells wide.
// With 48 cells it is (offset_h·15 + 180)/7.5 − 1. Wraps at the antimeridian (UTC+14 lands in the Pacific).
export function bandColumn(offset: number, width: number): number {
	const col = Math.floor(((offset / 60) * 15 + 180) * (width / 360)) - 1;
	return ((col % width) + width) % width;
}

// The band's two columns (1 hour = 2 columns at 48 cells). When the band crosses
// the antimeridian, it comes out in two pieces: the last column and the first.
export function bandColumns(offset: number, width: number): [number, number] {
	const col = bandColumn(offset, width);
	return [col, (col + 1) % width];
}

export interface MapMarker {
	label: string; // one character: the Tn index
	offset: number;
	selected: boolean;
}

// `height` map rows, a ruler with ┴ every 3h, and an index row.
// The bitset is resampled by nearest neighbor on both axes.
export function renderMap(width: number, height: number, markers: MapMarker[]): string[] {
	const sel = markers.find((m) => m.selected);
	const band: number[] = sel ? bandColumns(sel.offset, width) : [];
	const inBand = (c: number) => band.includes(c);
	const srcX = (dot: number) => Math.floor((dot * WORLD_WIDTH) / (width * 2));
	const srcY = (dot: number) => Math.floor((dot * WORLD_HEIGHT) / (height * 4));

	const canvas = new BrailleCanvas(width, height);
	for (let y = 0; y < canvas.dotsHigh; y++) {
		for (let x = 0; x < canvas.dotsWide; x++) {
			if (isLand(srcX(x), srcY(y))) canvas.set(x, y);
		}
	}

	const lines: string[] = [];
	for (let row = 0; row < height; row++) {
		let line = '';
		for (let c = 0; c < width; c++) {
			const ch = canvas.char(c, row);
			line += inBand(c) ? paint(ch, { fg: 'landBand', bg: 'highlight' }) : paint(ch, { fg: 'land' });
		}
		lines.push(line);
	}

	// ┴ every 3h = 45°.
	const ticks = new Set(Array.from({ length: 8 }, (_, k) => Math.floor((k * width) / 8)));
	let ruler = '';
	for (let c = 0; c < width; c++) ruler += ticks.has(c) ? '┴' : '─';
	lines.push(paint(ruler, { fg: 'border' }));

	// Each Tn's index in the right column of its band; the selected one wins ties.
	const labels: string[] = Array(width).fill(' ');
	for (const m of [...markers].sort((a, b) => Number(a.selected) - Number(b.selected))) {
		const col = bandColumns(m.offset, width)[1];
		labels[col] = m.selected ? paint(m.label, { fg: 'lit', bold: true }) : paint(m.label, { fg: 'secondary' });
	}
	lines.push(labels.join(''));
	return lines;
}
