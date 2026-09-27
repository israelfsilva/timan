// Única fonte de cores. Para um tema âmbar, troque só PALETTE.

type RGB = readonly [number, number, number];

function hex(h: string): RGB {
	const n = parseInt(h.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const PALETTE = {
	highlight: hex('#173220'), // fundo do destaque (faixa do fuso, linha selecionada)
	lit: hex('#C9F2B0'), // segmento aceso
	unlit: hex('#1F2A20'), // segmento apagado
	land: hex('#4F6B52'), // terra
	landBand: hex('#B7EC9A'), // terra na faixa
	secondary: hex('#6F8571'), // texto secundário
	border: hex('#3A4A3C'), // bordas
} as const;

export type Color = keyof typeof PALETTE;

type Mode = 'truecolor' | '256' | 'none';

function detectMode(env: NodeJS.ProcessEnv = process.env): Mode {
	if (env.NO_COLOR) return 'none';
	if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 'truecolor';
	return '256';
}

let mode: Mode = detectMode();

// Para testes: 'none' produz texto puro.
export function setColorMode(m: Mode): void {
	mode = m;
}

// Aproxima para o cubo 6×6×6 ou para a rampa de cinzas do xterm-256, o que for mais perto.
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

// Largura visível (sem sequências ANSI). Os caracteres usados aqui são todos de largura 1.
export function visibleWidth(s: string): number {
	return [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
}
