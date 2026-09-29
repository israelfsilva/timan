import type { Config } from './config.ts';
import { LCD_ROWS, LCD_WIDTH, SMALL_ROWS, SMALL_WIDTH, renderLcd, renderSmallLcd } from './lcd.ts';
import { RULE } from './panel.ts';
import { CATALOG_REF, type Row } from './table.ts';
import { paint, visibleWidth } from './theme.ts';
import { formatClock, formatDate, formatOffset, zoneAbbr } from './time.ts';

// TUI row 2: info panel on the left and digital on the right, at the same height.
//   ╭─ T1 ──────────────╮╭─ digital ──────────────────────────────────────────╮
//   │  FRI 25 SEP 2026  ││                    WORLD TIME                      │
//   ├───────────────────┤│  ▄▄▄▄▄▄  ▄▄▄▄▄▄     ▄▄▄▄▄▄  ▄▄▄▄▄▄  PM             │
//   │                   ││  …                                                 │
//   │     NEW YORK      ││                                  ▄▄▄▄ ▄▄▄▄         │
//   │                   ││                                  ▄▄▄█ █▄▄▄         │
//   ├───────────────────┤│  ▀▀▀▀▀▀  ▀▀▀▀▀▀     ▀▀▀▀▀▀  ▀▀▀▀▀▀  ▄▄▄█ █▄▄█         │
//   │ UTC−04:00 · EDT   ││               87% · 4 HOUR BATTERY                 │
//   ╰───────────────────╯╰────────────────────────────────────────────────────╯
// As on the AE-1200WH: WORLD TIME printed above the display and the battery below (battery.ts).
// The info panel's date and zone line up with the title and battery; the name, with the middle of the digits.
// The digits already have half a cell of breathing room (▄ on top, ▀ at the bottom).
// Without width for the info panel beside it, the digital absorbs it at the same height: info
// in place of the title and the date next to the battery.

export const DIGITAL_ROWS = LCD_ROWS + 2; // title (or info), digits and battery (or date)

// The digits, 2 spaces and the right column: AM/PM on top, small seconds
// aligned at the bottom. The column stays reserved in 24h so the block doesn't shift.
export const DIGITAL_BLOCK = LCD_WIDTH + 2 + SMALL_WIDTH;

export interface DigitalOptions {
	clock: Config['clock'];
	at: Date;
	width: number;
	info?: boolean; // info and date inside the digital (no info panel beside it)
	power?: string; // battery line (battery.ts), below the digits
}

const minus = (s: string) => s.replace(/^-/, '−');
const sec = (s: string) => paint(s, { fg: 'secondary' });

function center(s: string, width: number): string {
	return ' '.repeat(Math.max(0, Math.floor((width - visibleWidth(s)) / 2))) + s;
}

function truncate(s: string, width: number): string {
	return s.length > width ? s.slice(0, Math.max(1, width - 1)) + '…' : s;
}

// UTC−04:00 · EDT · DST. The abbreviation comes from IANA (EDT, BST); with forced DST it would lie, so it goes.
function offsetLine(row: Row, at: Date): string {
	const t = row.time;
	if (!t) return 'unknown zone';
	return [`UTC${minus(formatOffset(t.offset))}`, row.dst === 'auto' ? zoneAbbr(row.zone, at) : undefined, t.dstLabel].filter(Boolean).join(' · ');
}

// Info panel title: the favorite's ref, or "zone" for the catalog.
export function infoTitle(row: Row): string {
	return row.ref === CATALOG_REF ? 'zone' : row.ref;
}

// Info panel body: date, name and zone, separated by rules.
export function renderInfo(row: Row, at: Date, width: number): string[] {
	const date = row.time ? formatDate(row.time.wall) : '';
	const name = paint(truncate(row.name, width - 2), { fg: 'lit', bold: true });
	return [center(sec(date), width), RULE, '', center(name, width), '', RULE, center(sec(truncate(offsetLine(row, at), width - 2)), width)];
}

// Info on a single line; the name is what shrinks when it doesn't fit.
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
	// The block centers as a unit (by its full width, with seconds), not line by line.
	const indent = ' '.repeat(Math.max(0, Math.floor((width - DIGITAL_BLOCK) / 2)));
	const block = lcd.map((l, i) => {
		const s = small[i - (LCD_ROWS - SMALL_ROWS)];
		const right = s ?? (i === 0 && ampm ? paint(ampm, { fg: 'lit' }) : '');
		return indent + l + (right && '  ' + right);
	});

	const power = opts.power ?? '';
	if (!opts.info) return [center(sec('WORLD TIME'), width), ...block, center(sec(power), width)];
	const date = t ? formatDate(t.wall) : '';
	const bottom = truncate([date, power].filter(Boolean).join(' · '), width);
	return [center(infoLine(row, at, width), width), ...block, center(sec(bottom), width)];
}
