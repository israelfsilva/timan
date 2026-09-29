import { catalogFor } from './catalog.ts';
import type { Config } from './config.ts';
import {
	type DstLabel,
	type DstMode,
	civilDayDiff,
	dstLabel,
	effectiveOffset,
	formatClock,
	formatDay,
	formatDiff,
	formatOffset,
	isValidZone,
	wallClockAt,
	zoneName,
} from './time.ts';

export interface Row {
	ref: string; // T0..T9
	name: string;
	zone: string;
	dst: DstMode;
	// Absent when the zone is unknown. Everything already has the DST override applied.
	time?: {
		offset: number;
		diff: number; // minutes relative to T0
		day: number; // −1, 0, +1 relative to T0
		wall: Date;
		dstLabel: DstLabel;
	};
}

interface RowBase {
	ref: string;
	name: string;
	zone: string;
	dst: DstMode;
}

// Difference and day are against T0's effective offset, so T0's override affects every row.
function withTime(r: RowBase, t0Offset: number, at: Date): Row {
	const row: Row = { ...r, name: r.name.normalize('NFC') };
	if (!isValidZone(r.zone)) return row;
	const offset = effectiveOffset(r.zone, at, r.dst);
	row.time = {
		offset,
		diff: offset - t0Offset,
		day: civilDayDiff(offset, t0Offset, at),
		wall: wallClockAt(at, offset),
		dstLabel: dstLabel(r.zone, at, r.dst),
	};
	return row;
}

function favoriteBases(config: Config, local: string): RowBase[] {
	const t0 = { ref: 'T0', zone: local, name: config.local_name ?? zoneName(local), dst: config.local_dst ?? 'auto' };
	const slots = config.slots.map((s, i) => ({ ref: `T${i + 1}`, zone: s.zone, name: s.name ?? zoneName(s.zone), dst: s.dst }));
	return [t0, ...slots];
}

// T0 first, then T1..Tn in config order.
export function buildRows(config: Config, local: string, at: Date): Row[] {
	const bases = favoriteBases(config, local);
	const t0Offset = effectiveOffset(local, at, bases[0]!.dst);
	return bases.map((r) => withTime(r, t0Offset, at));
}

// Ref for catalog rows, which aren't slots.
export const CATALOG_REF = '·';

// TUI list: the favorites (T0..Tn) and, after them, the catalog without the zones that
// are already favorites. Catalog rows have ref CATALOG_REF and DST always auto.
export function zoneList(config: Config, local: string, at: Date): { rows: Row[]; favorites: number } {
	const favorites = buildRows(config, local, at);
	const t0Offset = favorites[0]!.time?.offset ?? 0;
	const catalog = catalogFor(at, favorites.map((r) => r.zone)).map((e) =>
		withTime({ ref: CATALOG_REF, zone: e.zone, name: e.name, dst: 'auto' }, t0Offset, at),
	);
	return { rows: [...favorites, ...catalog], favorites: favorites.length };
}

// No header and no color. With ascii, the minus sign stays a hyphen for grep.
export function renderTable(rows: Row[], clock: Config['clock'], ascii: boolean): string {
	return tableLines(rows, clock, { ascii }).join('\n');
}

export interface TableOptions {
	ascii?: boolean;
	seconds?: boolean; // the TUI shows seconds
	dst?: boolean; // DST indicator column (DST, DST*, STD*)
}

// One line per Row, with aligned columns.
export function tableLines(rows: Row[], clock: Config['clock'], options: TableOptions = {}): string[] {
	const minus = (s: string) => (options.ascii ? s : s.replace(/^-/, '−'));
	const cells = rows.map((r) => {
		const t = r.time;
		if (!t) return [r.ref, r.name, '?', '?', '?', '?', '', ''];
		return [
			r.ref,
			r.name,
			minus(formatOffset(t.offset)),
			r.ref === 'T0' ? 'local' : minus(formatDiff(t.diff)),
			formatClock(t.wall, clock, options.seconds),
			formatDay(t.wall),
			t.day === 0 ? '' : minus(t.day > 0 ? `+${t.day}` : `${t.day}`),
			t.dstLabel,
		];
	});

	// Number columns right-aligned; text left-aligned.
	const right = [false, false, true, true, true, false, false, false];
	if (!options.dst) right.pop();
	const widths = right.map((_, c) => Math.max(...cells.map((row) => row[c]!.length)));
	return cells.map((row) =>
		right
			.map((r, c) => (r ? row[c]!.padStart(widths[c]!) : row[c]!.padEnd(widths[c]!)))
			.join('  ')
			.trimEnd(),
	);
}
