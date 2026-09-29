import { ANALOG_WIDTH, analogRows, renderAnalog } from './analog.ts';
import { queryCellSize, takeCellSize } from './aspect.ts';
import { type Config, MAX_SLOTS, addFavorite, nextDst, removeSlot, saveConfig, setDst } from './config.ts';
import { type Power, powerLine, readPower } from './battery.ts';
import { DIGITAL_BLOCK, DIGITAL_ROWS, infoTitle, renderDigital, renderInfo } from './digital.ts';
import { besides, panel } from './panel.ts';
import { CATALOG_REF, type Row, tableLines, zoneList } from './table.ts';
import { paint, visibleWidth } from './theme.ts';
import { dstOffsets, localZone, modernZone } from './time.ts';
import { mapSize, renderMap } from './worldmap.ts';

// btop-style screen, filling the whole terminal:
//   ╭─ analog ─╮╭─ map ─────────────────╮   row 1: fixed analog + flexible map
//   ╰──────────╯╰───────────────────────╯
//   ╭─ T1 ─────╮╭─ digital ────────────╮   row 2: fixed info + flexible digital, fixed height (without info, the digital absorbs it)
//   ╰──────────╯╰──────────────────────╯
//   ╭─ zones ──────────────────────────╮   row 3: the rest of the height
//   ╰──────────────────────────────────╯
//                                              (blank line)
//         ↑↓ zone  ·  ←→ favorite  ·  …        shortcuts (or a notice), centered
//                                              (blank line)
// Priority when space runs out: digital > map > zones > analog.
const ANALOG_PANEL = ANALOG_WIDTH + 2;
const ZONES_MIN = 3 + 2; // 3 usable rows + borders
const FOOTER_ROWS = 3; // the shortcuts with a blank line before and after
const MAP_MIN_COLS = 36; // minimum usable width of the map panel next to the analog
const MAP_ROW_MIN = 10; // row 1 with only the map: 6 map rows + ruler + indices + borders
const MIN_COLS = 60;
const INFO_MIN_COLS = ANALOG_PANEL + DIGITAL_BLOCK + 2; // info beside the digital

// What the m key toggles when the analog and the map don't fit side by side.
export type Face = 'map' | 'analog';

export interface TuiState {
	config: Config;
	selected: number; // index into zoneList: favorites (0 = T0), then the catalog
	face: Face; // row 1 panel when only one fits
	aspect: number; // cell k (aspect.ts): config, terminal reply, or 1
	notice?: string; // brief notice in place of the shortcuts
	power?: Power; // latest battery reading (or uptime), below the digital
}

export interface Layout {
	topRows: number; // height of row 1 (0 = no row 1)
	analog: boolean;
	map: boolean;
	toggle: boolean; // only one of the two for lack of width: m toggles (for lack of height, only the map)
	info: boolean; // info panel beside the digital; without it, the digital shows the info
	zonesRows: number; // height of the zones panel (0 = no panel)
	padTop: number; // top padding when there is height to spare (only the digital on screen)
}

const DIGITAL_PANEL = DIGITAL_ROWS + 2; // height of row 2, with or without the info beside it

// Panels for the terminal size, or undefined to fall back to the plain table.
// Height: zones shrink down to 3 usable rows; then the analog goes (row 1 keeps
// only the map, at flexible height); then the zones go; finally, row 1.
// Width: without room for the analog + MAP_MIN_COLS, row 1 shows only `face`.
// Row 1 with the analog is as tall as the analog for the cell k, plus the borders.
export function computeLayout(
	cols: number,
	rows: number,
	view: { face: Face; showZones: boolean; aspect: number },
): Layout | undefined {
	const info = cols >= INFO_MIN_COLS;
	if (cols < MIN_COLS || rows < DIGITAL_PANEL + FOOTER_ROWS) return undefined;
	const TOP_ROWS = analogRows(view.aspect) + 2;
	const free = rows - FOOTER_ROWS - DIGITAL_PANEL;
	const zonesMin = view.showZones ? ZONES_MIN : 0;
	const wide = cols >= ANALOG_PANEL + MAP_MIN_COLS + 2;

	let top = 0;
	let analog = false;
	let map = false;
	let toggle = false;
	if (free - zonesMin >= TOP_ROWS) {
		top = view.showZones ? TOP_ROWS : free;
		analog = wide || view.face === 'analog';
		map = wide || view.face === 'map';
		toggle = !wide;
	} else if (free - zonesMin >= MAP_ROW_MIN) {
		top = free - zonesMin;
		map = true;
	} else if (free >= MAP_ROW_MIN) {
		top = free;
		map = true;
	}
	const zonesRows = view.showZones && free - top >= ZONES_MIN ? free - top : 0;
	return {
		topRows: top,
		analog,
		map,
		toggle,
		info,
		zonesRows,
		padTop: Math.floor((free - top - zonesRows) / 2),
	};
}

function padTo(s: string, width: number): string {
	return s + ' '.repeat(Math.max(0, width - visibleWidth(s)));
}

function truncate(s: string, width: number): string {
	return s.length > width ? s.slice(0, width - 1) + '…' : s;
}

// Shortcuts in display order, each with a priority (lower = dropped last).
// Without the zones panel, z is the way back and sits right after q; ↑↓ does nothing.
function shortcuts(layout: Layout): [string, number][] {
	const zones = layout.zonesRows > 0;
	const items: [string, number | undefined][] = [
		['↑↓ zone', zones ? 1 : undefined],
		['←→ favorite', 2],
		['f favorite', zones ? 4 : 6],
		['d DST', 5],
		['z zones', zones ? 6 : 1],
		['m map/analog', layout.toggle ? 3 : undefined],
		['t 12/24', 7],
		['q quit', 0],
	];
	return items.filter((i): i is [string, number] => i[1] !== undefined);
}

// Fits in `max` columns: first loosens the separator, then drops the lowest priority.
export function fitFooter(items: [string, number][], max: number): string {
	let kept = items;
	for (;;) {
		for (const sep of ['  ·  ', ' · ']) {
			const text = kept.map(([s]) => s).join(sep);
			if (text.length <= max) return text;
		}
		if (kept.length <= 1) return truncate(kept[0]?.[0] ?? '', max);
		const drop = Math.max(...kept.map(([, p]) => p));
		kept = kept.filter(([, p]) => p !== drop);
	}
}

// Shortcut line at the bottom of the screen: the notice, if any, or the shortcuts that fit, centered.
function footerLine(state: TuiState, layout: Layout, cols: number): string {
	const max = cols - 2;
	const text = state.notice ? truncate(state.notice, max) : fitFooter(shortcuts(layout), max);
	const left = Math.floor((cols - text.length) / 2);
	return ' '.repeat(left) + paint(text, { fg: 'secondary' }) + ' '.repeat(cols - left - text.length);
}

// Separator between the favorites and the catalog.
function separator(width: number): string {
	const label = ' all zones ';
	const left = Math.floor((width - label.length) / 2);
	return paint('─'.repeat(left), { fg: 'border' }) + paint(label, { fg: 'secondary' }) + paint('─'.repeat(width - left - label.length), { fg: 'border' });
}

// Zones panel body: favorites, separator and catalog, scrolling to keep the selection visible.
function zonesBody(state: TuiState, data: Row[], favorites: number, width: number, height: number): string[] {
	const list = tableLines(data, state.config.clock, { seconds: true, dst: true });
	const lines: { text: string; row?: number }[] = list.map((text, row) => ({ text, row }));
	if (data.length > favorites) lines.splice(favorites, 0, { text: '' });

	const selLine = lines.findIndex((l) => l.row === state.selected);
	const visible = Math.min(lines.length, height);
	const start = Math.max(0, Math.min(selLine - Math.floor(visible / 2), lines.length - visible));
	const w = width - 2;
	return lines.slice(start, start + visible).map(({ text, row }) => {
		if (row === undefined) return ' ' + separator(w) + ' ';
		const isSel = row === state.selected;
		const mark = isSel ? '▸' : row < favorites ? '★' : ' ';
		const line = padTo(truncate(`${mark} ${text}`, w), w);
		return ' ' + paint(line, isSel ? { fg: 'lit', bg: 'highlight', bold: true } : { fg: row < favorites ? 'lit' : 'secondary' }) + ' ';
	});
}

// Body of height `height` with `lines` centered vertically and, with `width`, horizontally.
function centered(lines: string[], width: number, height: number, contentWidth: number): string[] {
	const indent = ' '.repeat(Math.max(0, Math.floor((width - contentWidth) / 2)));
	const top: string[] = Array(Math.max(0, Math.floor((height - lines.length) / 2))).fill('');
	return [...top, ...lines.map((l) => indent + l)];
}

// Whole screen as lines of width `cols`, without positioning. Pure: takes the instant, local zone and size.
export function renderScreen(state: TuiState, local: string, at: Date, cols: number, rows: number): string[] {
	const { rows: data, favorites } = zoneList(state.config, local, at);
	const layout = computeLayout(cols, rows, { face: state.face, showZones: state.config.ui.showZones, aspect: state.aspect });

	if (layout === undefined) {
		const table = tableLines(data.slice(0, favorites), state.config.clock);
		return [...table.map((l) => truncate(l, cols)), '', paint(truncate('enlarge the terminal to see the map', cols), { fg: 'secondary' })];
	}
	const sel = data[state.selected] ?? data[0]!;
	const out: string[] = Array(layout.padTop).fill(' '.repeat(cols));

	// Row 1: analog at fixed width (or the whole row, if alone) and the map with the rest.
	if (layout.topRows > 0) {
		const inner = layout.topRows - 2;
		const top: string[][] = [];
		const analogPanel = layout.map ? ANALOG_PANEL : cols;
		if (layout.analog) {
			top.push(panel('analog', centered(renderAnalog(sel.time?.wall, state.aspect), analogPanel - 2, inner, ANALOG_WIDTH), analogPanel, layout.topRows));
		}
		if (layout.map) {
			// Favorites mark the map by index; a selected catalog zone shows up as ·.
			const markers = data.flatMap((r, i) =>
				r.time && (i < favorites || r === sel)
					? [{ label: r.ref === CATALOG_REF ? CATALOG_REF : r.ref.slice(1), offset: r.time.offset, selected: r === sel }]
					: [],
			);
			const mapPanel = layout.analog ? cols - ANALOG_PANEL : cols;
			// Margin of 1 on each side; ruler and indices take 2 rows.
			const size = mapSize(mapPanel - 4, inner - 2, state.aspect);
			const map = renderMap(size.width, size.height, markers);
			top.push(panel('map', centered(map, mapPanel - 2, inner, size.width), mapPanel, layout.topRows));
		}
		out.push(...besides(...top));
	}

	// Row 2: info as wide as the analog and the digital with the rest, always.
	const zones = layout.zonesRows > 0;
	const digitalPanel = layout.info ? cols - ANALOG_PANEL : cols;
	const digital = renderDigital(sel, { clock: state.config.clock, at, width: digitalPanel - 2, info: !layout.info, power: powerLine(state.power) });
	const height = DIGITAL_PANEL;
	const row2 = [panel('digital', digital, digitalPanel, height)];
	if (layout.info) row2.unshift(panel(infoTitle(sel), renderInfo(sel, at, ANALOG_PANEL - 2), ANALOG_PANEL, height));
	out.push(...besides(...row2));

	// Row 3: zones, with the rest of the height.
	if (zones) {
		const body = zonesBody(state, data, favorites, cols - 2, layout.zonesRows - 2);
		out.push(...panel('zones', body, cols, layout.zonesRows));
	}
	while (out.length < rows - FOOTER_ROWS) out.push(' '.repeat(cols));
	const blank = ' '.repeat(cols);
	out.push(blank, footerLine(state, layout, cols), blank);
	return out;
}

// Result of a key that touches the config: the new config, or a notice when it does nothing.
export interface Action {
	config?: Config;
	notice?: string;
}

// f/space: a favorite leaves (the ones after it are renumbered), a catalog zone goes into the
// next slot. T0 is the local zone and stays.
export function toggleFavorite(config: Config, local: string, at: Date, selected: number): Action {
	const { rows, favorites } = zoneList(config, local, at);
	const row = rows[selected];
	if (!row) return {};
	if (selected === 0) return { notice: 'T0 is the local zone; it stays a favorite' };
	if (selected < favorites) return { config: removeSlot(config, selected) };
	if (config.slots.length >= MAX_SLOTS) return { notice: `limit of ${MAX_SLOTS} favorites` };
	return { config: addFavorite(config, row.zone, row.name) };
}

// d: auto → on → off → auto, only on favorites and only on zones with DST.
export function cycleDst(config: Config, local: string, at: Date, selected: number): Action {
	const { rows, favorites } = zoneList(config, local, at);
	const row = rows[selected];
	if (!row) return {};
	if (selected >= favorites) return { notice: 'DST is for favorites only (f to add one)' };
	const { std, dst } = dstOffsets(row.zone, at.getUTCFullYear());
	if (std === dst) return { notice: `${row.name}: no daylight saving time` };
	return { config: setDst(config, selected, nextDst(row.dst)) };
}

// Index of the zone in the new list, after the config changes; otherwise the closest to the old one.
function reselect(config: Config, local: string, zone: string, fallback: number): number {
	const { rows } = zoneList(config, local, new Date());
	const i = rows.findIndex((r) => modernZone(r.zone) === modernZone(zone));
	return i !== -1 ? i : Math.min(fallback, rows.length - 1);
}

export function runTui(initial: Config, path: string): void {
	const { stdin, stdout } = process;
	const state: TuiState = {
		config: initial,
		selected: initial.slots.length ? 1 : 0,
		face: 'map',
		aspect: initial.ui.cellAspect ?? 1,
	};
	let cellQuery: ReturnType<typeof queryCellSize> | undefined;
	let timer: NodeJS.Timeout | undefined;
	let powerTimer: NodeJS.Timeout | undefined;
	let noticeTimer: NodeJS.Timeout | undefined;
	let lastSize = '';
	let done = false;

	const draw = () => {
		const cols = stdout.columns;
		const rows = stdout.rows;
		const lines = renderScreen(state, localZone(), new Date(), cols, rows);
		// Clear the whole screen only when the size changes; otherwise overwrite the lines
		// and erase whatever is left below (the fallback table changes height).
		let s = '';
		const size = `${cols}x${rows}`;
		if (size !== lastSize) {
			s += '\x1b[2J';
			lastSize = size;
		}
		lines.forEach((l, i) => (s += `\x1b[${i + 1};1H${l}\x1b[K`));
		stdout.write(s + '\x1b[J');
	};

	// Redraw at the start of every second.
	const tick = () => {
		draw();
		timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 2);
	};

	// Battery: every 30 s, outside the tick (pmset takes a few ms); the next second shows it.
	const pollPower = () => {
		void readPower().then((p) => {
			if (done) return;
			state.power = p;
			powerTimer = setTimeout(pollPower, 30_000);
		});
	};

	const flash = (text: string) => {
		state.notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => {
			state.notice = undefined;
			draw();
		}, 2500);
		draw();
	};

	const cleanup = () => {
		if (done) return;
		done = true;
		clearTimeout(timer);
		clearTimeout(powerTimer);
		clearTimeout(noticeTimer);
		cellQuery?.cancel();
		stdin.setRawMode(false);
		stdin.pause();
		stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
	};

	const list = () => zoneList(state.config, localZone(), new Date());

	// Save right away (atomic write) and keep the same zone selected.
	const update = (config: Config, zone: string) => {
		state.config = config;
		saveConfig(path, config);
		state.selected = reselect(config, localZone(), zone, state.selected);
		draw();
	};

	// ↑↓: the whole list, without wrapping.
	const moveList = (delta: number) => {
		if (!state.config.ui.showZones) return;
		state.selected = Math.max(0, Math.min(list().rows.length - 1, state.selected + delta));
		draw();
	};

	// ←→: favorites only, wrapping; leaving the catalog, go to the nearest end.
	const moveFavorite = (delta: number) => {
		const n = list().favorites;
		if (state.selected >= n) state.selected = delta > 0 ? 0 : n - 1;
		else state.selected = (state.selected + delta + n) % n;
		draw();
	};

	// Apply the result of a key: a brief notice, or a new config saved.
	const apply = ({ config, notice }: Action) => {
		if (notice) return flash(notice);
		const zone = list().rows[state.selected]?.zone;
		if (config && zone) update(config, zone);
	};

	process.on('exit', cleanup);
	process.on('SIGTERM', () => process.exit(0));
	stdout.write('\x1b[?1049h\x1b[?25l');
	stdin.setRawMode(true);
	stdin.setEncoding('utf8');
	stdin.resume();

	stdin.on('data', (chunk: string) => {
		// The 16t reply arrives on stdin mixed with keys; strip it before the switch.
		const key = cellQuery ? cellQuery.feed(chunk) : takeCellSize(chunk).rest;
		switch (key) {
			case 'q':
			case 'Q':
			case '\x03':
				process.exit(0);
			case '\x1b[A':
			case '\x1bOA':
				return moveList(-1);
			case '\x1b[B':
			case '\x1bOB':
				return moveList(1);
			case '\x1b[D':
			case '\x1bOD':
				return moveFavorite(-1);
			case '\x1b[C':
			case '\x1bOC':
				return moveFavorite(1);
			case 'f':
			case 'F':
			case ' ':
				return apply(toggleFavorite(state.config, localZone(), new Date(), state.selected));
			case 'd':
			case 'D':
				return apply(cycleDst(state.config, localZone(), new Date(), state.selected));
			case 'z':
			case 'Z': {
				const showZones = !state.config.ui.showZones;
				state.config = { ...state.config, ui: { ...state.config.ui, showZones } };
				saveConfig(path, state.config);
				return draw();
			}
			case 'm':
			case 'M':
				state.face = state.face === 'map' ? 'analog' : 'map';
				return draw();
			case 't':
			case 'T':
				state.config = { ...state.config, clock: state.config.clock === '12h' ? '24h' : '12h' };
				saveConfig(path, state.config);
				return draw();
		}
	});
	stdout.on('resize', draw);
	tick();
	pollPower();
	// With no calibrated k, ask the terminal after the first frame (drawn with k = 1).
	if (initial.ui.cellAspect === undefined) {
		cellQuery = queryCellSize(
			(s) => stdout.write(s),
			(k) => {
				state.aspect = k;
				draw();
			},
		);
	}
}
