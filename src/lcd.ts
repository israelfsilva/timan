// 7-segment clock with "ghosts": every segment is always drawn,
// the unlit ones in a color close to the background (the LCD's 88:88).

// Segments a..g → bits 0..6.
const DIGITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

const A = 1 << 0;
const B = 1 << 1;
const C = 1 << 2;
const D = 1 << 3;
const E = 1 << 4;
const F = 1 << 5;
const G = 1 << 6;

// 6×5 grid for one digit. Each cell has two halves (top, bottom), and each half
// lights up if any of its segments is lit: corners and the middle are shared
// joints, so bars close at the ends (5 and 2 have no gaps) and the stems
// don't run past the middle bar (the 4).
//   ▄af ▄a ▄a ▄a ▄a ▄ab
//   █f  ·  ·  ·  ·  █b
//   █   ▀g ▀g ▀g ▀g █        middle: top = f|g|e, bottom = e (and b|g|c, c on the right)
//   █e  ·  ·  ·  ·  █c
//   ▀de ▀d ▀d ▀d ▀d ▀cd
type Cell = [top: number, bottom: number];
const row = (left: Cell, mid: Cell, right: Cell): Cell[] => [left, mid, mid, mid, mid, right];
const GRID: Cell[][] = [
	row([0, F | A], [0, A], [0, A | B]),
	row([F, F], [0, 0], [B, B]),
	row([F | G | E, E], [G, 0], [B | G | C, C]),
	row([E, E], [0, 0], [C, C]),
	row([E | D, 0], [D, 0], [C | D, 0]),
];

// 4×3 grid for the seconds: same rules, with each segment in half a cell.
// Ends on the top half, like the big grid, so the baselines line up.
//   █af ▀a ▀a █ab        left: top = f|a, bottom = f (and a|b, b on the right)
//   █e  ▀g ▀g █c         left: top = f|g|e, bottom = e (and b|g|c, c on the right)
//   ▀de ▀d ▀d ▀cd
const small = (left: Cell, mid: Cell, right: Cell): Cell[] => [left, mid, mid, right];
const SMALL_GRID: Cell[][] = [
	small([F | A, F], [A, 0], [A | B, B]),
	small([F | G | E, E], [G, 0], [B | G | C, C]),
	small([E | D, 0], [D, 0], [C | D, 0]),
];

// Glyph and state of a cell; undefined = empty. With one half lit and the other
// unlit, only the lit one is drawn (the other half's ghost disappears).
function cell([top, bottom]: Cell, mask: number): [string, boolean | undefined] {
	const t = top ? (mask & top) !== 0 : undefined;
	const b = bottom ? (mask & bottom) !== 0 : undefined;
	if (t !== undefined && b !== undefined) return t === b ? ['█', t] : [t ? '▀' : '▄', true];
	if (t !== undefined) return ['▀', t];
	if (b !== undefined) return ['▄', b];
	return [' ', undefined];
}

export const LCD_ROWS = 5;

// 4 digits of 6, 2 columns between digits and "  ▪  " between hours and minutes.
export const LCD_WIDTH = 33;

export const SMALL_ROWS = 3;

// 2 digits of 4 with 1 column between them.
export const SMALL_WIDTH = 9;

// Paints a run of lit (on) or unlit segment.
export type SegmentPainter = (text: string, on: boolean) => string;

// Row `r` of a digit (or unlit, if `ch` isn't a digit). Neighboring cells
// in the same state become a single run: fewer ANSI escapes.
function digitRow(grid: Cell[][], r: number, ch: string, paint: SegmentPainter): string {
	const mask = /\d/.test(ch) ? DIGITS[Number(ch)]! : 0;
	let out = '';
	let run = '';
	let state: boolean | undefined; // undefined = empty
	const flush = () => {
		out += state === undefined ? run : paint(run, state);
		run = '';
	};
	for (const c of grid[r]!) {
		const [glyph, s] = cell(c, mask);
		if (s !== state && run) flush();
		state = s;
		run += glyph;
	}
	flush();
	return out;
}

// `time` as "H:MM", "HH:MM" or "--:--" (all unlit). A one-digit hour
// gets a ghost 8 on the left. The ▪ separator sits on rows 1 and 3.
export function renderLcd(time: string, paint: SegmentPainter): string[] {
	const m = /^(.?.):(..)$/.exec(time);
	if (!m) throw new Error(`invalid time for the LCD: ${time}`);
	const [h1, h2] = m[1]!.padStart(2, ' ');
	const [m1, m2] = m[2]!;

	return GRID.map((_, r) => {
		const digit = (ch: string) => digitRow(GRID, r, ch, paint);
		const sep = r === 1 || r === 3 ? `  ${paint('▪', true)}  ` : '     ';
		return digit(h1!) + '  ' + digit(h2!) + sep + digit(m1!) + '  ' + digit(m2!);
	});
}

// Seconds in small digits: `secs` with two digits, or "--" (all unlit).
export function renderSmallLcd(secs: string, paint: SegmentPainter): string[] {
	const [s1, s2] = secs;
	return SMALL_GRID.map((_, r) => digitRow(SMALL_GRID, r, s1!, paint) + ' ' + digitRow(SMALL_GRID, r, s2!, paint));
}
