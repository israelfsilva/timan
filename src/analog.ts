import { BrailleCanvas } from './braille.ts';
import { type Color, paint } from './theme.ts';

// Analog clock in Braille, 31 cells wide = 62 dots. The height depends on the
// cell aspect k (see aspect.ts): vertical distances are divided by k so dots
// don't come out stretched. With k = 1 it is 14 rows = 56 dots.
// Dial: one dot per minute, a tick every 5, and the minutes (60, 05…55) outside.

export const ANALOG_WIDTH = 31;

// Center in the middle of cell 15, on the boundary between the two middle rows. Radii in dots.
const CX = 31;
const DIAL = 21;
const TICK = 18;
const LABELS = 26;
const HOUR_HAND = 11;
const MINUTE_HAND = 17;
const SECOND_HAND = 19;

// Layers in priority order: in a shared cell, the highest wins.
const DIAL_LAYER = 1;
const SECOND_LAYER = 2;
const HAND_LAYER = 3;
const LAYER_COLOR: Record<number, Color> = { [DIAL_LAYER]: 'land', [SECOND_LAYER]: 'landBand', [HAND_LAYER]: 'lit' };

// Rows for aspect k: the labels (radius LABELS / k vertically) plus 2 dots of
// margin above and below, rounded to an even number so the center lands on a row boundary.
export function analogRows(k: number): number {
	return 2 * Math.ceil((LABELS / k + 2) / 4);
}

// Dot at `r` from the center at fraction `turn` of a revolution (0 = 12 o'clock, clockwise),
// centered at (CX, cy), with the vertical divided by k.
function polar(cy: number, k: number, turn: number, r: number): [number, number] {
	const a = turn * 2 * Math.PI;
	return [CX + r * Math.sin(a), cy - (r / k) * Math.cos(a)];
}

// `wall` is a wallClock (UTC fields = wall time); without it, just the dial
// (unknown zone). analogRows(k) rows of 31 columns.
export function renderAnalog(wall: Date | undefined, k: number): string[] {
	const rows = analogRows(k);
	const cy = rows * 2;
	const at = (turn: number, r: number) => polar(cy, k, turn, r);
	const canvas = new BrailleCanvas(ANALOG_WIDTH, rows);

	// Thick hand: three parallel strokes, half a dot apart along the perpendicular.
	const thickHand = (turn: number, length: number) => {
		const a = turn * 2 * Math.PI;
		const [nx, ny] = [Math.cos(a) * 0.6, (Math.sin(a) * 0.6) / k];
		const [x, y] = at(turn, length);
		for (const j of [-1, 0, 1]) canvas.line(CX + j * nx, cy + j * ny, x + j * nx, y + j * ny, HAND_LAYER);
	};

	for (let i = 0; i < 60; i++) {
		if (i % 5 === 0) canvas.line(...at(i / 60, TICK), ...at(i / 60, DIAL), DIAL_LAYER);
		else canvas.set(...at(i / 60, DIAL), DIAL_LAYER);
	}
	if (wall) {
		const h = wall.getUTCHours() % 12;
		const m = wall.getUTCMinutes();
		const s = wall.getUTCSeconds();
		canvas.line(CX, cy, ...at(s / 60, SECOND_HAND), SECOND_LAYER);
		thickHand((m + s / 60) / 60, MINUTE_HAND);
		thickHand((h + m / 60 + s / 3600) / 12, HOUR_HAND);
	}

	// Minutes outside the dial, centered on the ring dot. Ties round away from
	// the center so both sides mirror (60 and 30 land on 14–15).
	const labels = new Map<string, string>();
	for (let i = 0; i < 60; i += 5) {
		const [x, y] = at(i / 60, LABELS);
		const v = Math.round((x / 2 - 1) * 1e6) / 1e6; // sin(π) is not exactly 0
		const col = v > CX / 2 - 1 ? Math.round(v) : -Math.round(-v);
		const row = Math.min(rows - 1, Math.floor(y / 4));
		const text = String(i || 60).padStart(2, '0');
		labels.set(`${col},${row}`, text[0]!);
		labels.set(`${col + 1},${row}`, text[1]!);
	}

	const lines: string[] = [];
	for (let row = 0; row < rows; row++) {
		let line = '';
		for (let col = 0; col < ANALOG_WIDTH; col++) {
			const label = labels.get(`${col},${row}`);
			const layer = canvas.layer(col, row);
			if (label) line += paint(label, { fg: 'secondary' });
			else line += layer ? paint(canvas.char(col, row), { fg: LAYER_COLOR[layer]! }) : canvas.char(col, row);
		}
		lines.push(line);
	}
	return lines;
}
