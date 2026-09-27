// Relógio de 7 segmentos com "fantasma": todos os segmentos são sempre desenhados,
// os apagados numa cor quase igual ao fundo (o 88:88 do LCD).

// Segmentos a..g → bits 0..6.
const DIGITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

const A = 1 << 0;
const B = 1 << 1;
const C = 1 << 2;
const D = 1 << 3;
const E = 1 << 4;
const F = 1 << 5;
const G = 1 << 6;

// Grade 6×5 de um dígito. Cada célula tem duas metades (cima, baixo), e cada metade
// acende se qualquer um dos seus segmentos acender: os cantos e o meio são juntas
// compartilhadas, para as barras fecharem nas pontas (o 5 e o 2 não ficam com
// buracos) e as hastes não passarem da barra do meio (o 4).
//   ▄af ▄a ▄a ▄a ▄a ▄ab
//   █f  ·  ·  ·  ·  █b
//   █   ▀g ▀g ▀g ▀g █        meio: cima = f|g|e, baixo = e (e b|g|c, c à direita)
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

// Grade 4×3 dos segundos: mesmas regras, com cada segmento numa metade de célula.
// Termina na metade de cima, como a grade grande, para as bases ficarem alinhadas.
//   █af ▀a ▀a █ab        esquerda: cima = f|a, baixo = f (e a|b, b à direita)
//   █e  ▀g ▀g █c         esquerda: cima = f|g|e, baixo = e (e b|g|c, c à direita)
//   ▀de ▀d ▀d ▀cd
const small = (left: Cell, mid: Cell, right: Cell): Cell[] => [left, mid, mid, right];
const SMALL_GRID: Cell[][] = [
	small([F | A, F], [A, 0], [A | B, B]),
	small([F | G | E, E], [G, 0], [B | G | C, C]),
	small([E | D, 0], [D, 0], [C | D, 0]),
];

// Glifo e estado de uma célula; undefined = vazia. Com uma metade acesa e a outra
// apagada, só a acesa é desenhada (o fantasma da outra metade some).
function cell([top, bottom]: Cell, mask: number): [string, boolean | undefined] {
	const t = top ? (mask & top) !== 0 : undefined;
	const b = bottom ? (mask & bottom) !== 0 : undefined;
	if (t !== undefined && b !== undefined) return t === b ? ['█', t] : [t ? '▀' : '▄', true];
	if (t !== undefined) return ['▀', t];
	if (b !== undefined) return ['▄', b];
	return [' ', undefined];
}

export const LCD_ROWS = 5;

// 4 dígitos de 6, 2 colunas entre os dígitos e "  ▪  " entre hora e minuto.
export const LCD_WIDTH = 33;

export const SMALL_ROWS = 3;

// 2 dígitos de 4 com 1 coluna entre eles.
export const SMALL_WIDTH = 9;

// Pinta um trecho de segmento aceso (on) ou apagado.
export type SegmentPainter = (text: string, on: boolean) => string;

// Linha `r` de um dígito (ou apagado, se `ch` não for dígito). Células vizinhas
// no mesmo estado viram um trecho só: menos escapes ANSI.
function digitRow(grid: Cell[][], r: number, ch: string, paint: SegmentPainter): string {
	const mask = /\d/.test(ch) ? DIGITS[Number(ch)]! : 0;
	let out = '';
	let run = '';
	let state: boolean | undefined; // undefined = vazia
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

// `time` no formato "H:MM", "HH:MM" ou "--:--" (tudo apagado). Hora de um dígito
// ganha um 8 fantasma à esquerda. O separador ▪ fica nas linhas 1 e 3.
export function renderLcd(time: string, paint: SegmentPainter): string[] {
	const m = /^(.?.):(..)$/.exec(time);
	if (!m) throw new Error(`hora inválida para o LCD: ${time}`);
	const [h1, h2] = m[1]!.padStart(2, ' ');
	const [m1, m2] = m[2]!;

	return GRID.map((_, r) => {
		const digit = (ch: string) => digitRow(GRID, r, ch, paint);
		const sep = r === 1 || r === 3 ? `  ${paint('▪', true)}  ` : '     ';
		return digit(h1!) + '  ' + digit(h2!) + sep + digit(m1!) + '  ' + digit(m2!);
	});
}

// Segundos em dígitos pequenos: `secs` com dois dígitos, ou "--" (tudo apagado).
export function renderSmallLcd(secs: string, paint: SegmentPainter): string[] {
	const [s1, s2] = secs;
	return SMALL_GRID.map((_, r) => digitRow(SMALL_GRID, r, s1!, paint) + ' ' + digitRow(SMALL_GRID, r, s2!, paint));
}
