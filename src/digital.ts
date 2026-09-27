import type { Config } from './config.ts';
import { LCD_ROWS, LCD_WIDTH, SMALL_ROWS, SMALL_WIDTH, renderLcd, renderSmallLcd } from './lcd.ts';
import { RULE } from './panel.ts';
import { CATALOG_REF, type Row } from './table.ts';
import { paint, visibleWidth } from './theme.ts';
import { formatClock, formatDate, formatOffset, zoneAbbr } from './time.ts';

// Linha 2 da TUI: painel de info à esquerda e digital à direita, com a mesma altura.
//   ╭─ T1 ──────────────╮╭─ digital ──────────────────────────────────────────╮
//   │  FRI 25 SEP 2026  ││  ▄▄▄▄▄▄  ▄▄▄▄▄▄     ▄▄▄▄▄▄  ▄▄▄▄▄▄  PM             │
//   ├───────────────────┤│  …                                                 │
//   │     NEW YORK      ││                                  ▄▄▄▄ ▄▄▄▄         │
//   ├───────────────────┤│                                  ▄▄▄█ █▄▄▄         │
//   │ UTC−04:00 · EDT   ││  ▀▀▀▀▀▀  ▀▀▀▀▀▀     ▀▀▀▀▀▀  ▀▀▀▀▀▀  ▄▄▄█ █▄▄█         │
//   ╰───────────────────╯╰────────────────────────────────────────────────────╯
// As três seções do info têm uma linha cada, sem folga, para o espaçamento ser igual;
// os dígitos já têm meia célula de respiro (▄ em cima, ▀ embaixo).
// Sem largura para o info ao lado, o digital o absorve: info na primeira linha, data na última.

export const DIGITAL_ROWS = LCD_ROWS; // ao lado do info
export const DIGITAL_INFO_ROWS = LCD_ROWS + 2; // com o info dentro

// Os dígitos, 2 espaços e a coluna da direita: AM/PM em cima, segundos pequenos
// alinhados embaixo. A coluna fica reservada em 24h, para o bloco não andar.
export const DIGITAL_BLOCK = LCD_WIDTH + 2 + SMALL_WIDTH;

export interface DigitalOptions {
	clock: Config['clock'];
	at: Date;
	width: number;
	info?: boolean; // info e data dentro do digital (sem o painel de info ao lado)
}

const minus = (s: string) => s.replace(/^-/, '−');
const sec = (s: string) => paint(s, { fg: 'secondary' });

function center(s: string, width: number): string {
	return ' '.repeat(Math.max(0, Math.floor((width - visibleWidth(s)) / 2))) + s;
}

function truncate(s: string, width: number): string {
	return s.length > width ? s.slice(0, Math.max(1, width - 1)) + '…' : s;
}

// UTC−04:00 · EDT · DST. A abreviação vem da IANA (EDT, BST); com DST forçado ela mentiria, então sai.
function offsetLine(row: Row, at: Date): string {
	const t = row.time;
	if (!t) return 'zona desconhecida';
	return [`UTC${minus(formatOffset(t.offset))}`, row.dst === 'auto' ? zoneAbbr(row.zone, at) : undefined, t.dstLabel].filter(Boolean).join(' · ');
}

// Título do painel de info: o ref do favorito, ou "zone" para o catálogo.
export function infoTitle(row: Row): string {
	return row.ref === CATALOG_REF ? 'zone' : row.ref;
}

// Corpo do painel de info: data, nome e fuso, separados por divisores.
export function renderInfo(row: Row, at: Date, width: number): string[] {
	const date = row.time ? formatDate(row.time.wall) : '';
	const name = paint(truncate(row.name, width - 2), { fg: 'lit', bold: true });
	return [center(sec(date), width), RULE, center(name, width), RULE, center(sec(truncate(offsetLine(row, at), width - 2)), width)];
}

// Info numa linha só; o nome é o que encurta quando não cabe.
function infoLine(row: Row, at: Date, width: number): string {
	const tail = ' · ' + offsetLine(row, at);
	const head = row.ref === CATALOG_REF ? '' : `${row.ref} · `;
	const name = truncate(row.name, width - head.length - tail.length);
	return sec(head) + paint(name, { fg: 'lit', bold: true }) + sec(tail);
}

export function renderDigital(row: Row, opts: DigitalOptions): string[] {
	const { clock, at, width } = opts;
	const segment = (s: string, on: boolean) => paint(s, { fg: on ? 'lit' : 'unlit' });
	const t = row.time;

	const [hm, ampm] = t ? formatClock(t.wall, clock).split(' ') : ['--:--'];
	const secs = t ? String(t.wall.getUTCSeconds()).padStart(2, '0') : '--';
	const lcd = renderLcd(hm!, segment);
	const small = renderSmallLcd(secs, segment);
	// O bloco centraliza como unidade (pela largura cheia, com segundos), não linha a linha.
	const indent = ' '.repeat(Math.max(0, Math.floor((width - DIGITAL_BLOCK) / 2)));
	const block = lcd.map((l, i) => {
		const s = small[i - (LCD_ROWS - SMALL_ROWS)];
		const right = s ?? (i === 0 && ampm ? paint(ampm, { fg: 'lit' }) : '');
		return indent + l + (right && '  ' + right);
	});

	if (!opts.info) return block;
	const date = t ? sec(formatDate(t.wall)) : '';
	return [center(infoLine(row, at, width), width), ...block, center(date, width)];
}
