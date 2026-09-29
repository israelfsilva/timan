// Single source of colors. For an amber theme, change only PALETTE.

type RGB = readonly [number, number, number];

function hex(h: string): RGB {
	const n = parseInt(h.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const PALETTE = {
	highlight: hex('#173220'), // highlight background (zone band, selected row)
	lit: hex('#C9F2B0'), // lit segment
	unlit: hex('#1F2A20'), // unlit segment
	land: hex('#4F6B52'), // land
	landBand: hex('#B7EC9A'), // land inside the band
	secondary: hex('#6F8571'), // secondary text
	border: hex('#3A4A3C'), // borders
} as const;

export type Color = keyof typeof PALETTE;

type Mode = 'truecolor' | '256' | 'none';

function detectMode(env: NodeJS.ProcessEnv = process.env): Mode {
	if (env.NO_COLOR) return 'none';
	if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 'truecolor';
	return '256';
}

let mode: Mode = detectMode();

// For tests: 'none' produces plain text.
export function setColorMode(m: Mode): void {
	mode = m;
}

// Approximates to the 6×6×6 cube or the xterm-256 gray ramp, whichever is closer.
function to256([r, g, b]: RGB): number {
	const level = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40));
	const steps = [0, 95, 135, 175, 215, 255];
	const [cr, cg, cb] = [level(r), level(g), level(b)];
	const gray = Math.min(23, Math.max(0, Math.round(((r + g + b) / 3 - 8) / 10)));
	const grayV = 8 + 10 * gray;
	const dist = (x: RGB) => (x[0] - r) ** 2 + (x[1] - g) ** 2 + (x[2] - b) ** 2;
	const cubeDist = dist([steps[cr]!, steps[cg]!, steps[cb]!]);
	return dist([grayV, grayV, grayV]) < cubeDist ? 232 + gray : 16 + 36 * cr + 6 * cg + cb;
}

function sgr(color: Color, layer: 38 | 48): string {
	const rgb = PALETTE[color];
	return mode === 'truecolor' ? `${layer};2;${rgb.join(';')}` : `${layer};5;${to256(rgb)}`;
}

export interface Style {
	fg?: Color;
	bg?: Color;
	bold?: boolean;
}

export function paint(text: string, style: Style): string {
	if (mode === 'none' || text === '') return text;
	const codes = [
		...(style.bold ? ['1'] : []),
		...(style.fg ? [sgr(style.fg, 38)] : []),
		...(style.bg ? [sgr(style.bg, 48)] : []),
	];
	return codes.length ? `\x1b[${codes.join(';')}m${text}\x1b[0m` : text;
}

// Visible width (without ANSI sequences). The characters used here are all 1 column wide.
export function visibleWidth(s: string): number {
	return [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
}
