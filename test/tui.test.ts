import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { type Config, defaultConfig, loadConfig, saveConfig } from '../src/config.ts';
import { setColorMode, visibleWidth } from '../src/theme.ts';
import { type Face, computeLayout, cycleDst, fitFooter, renderScreen, toggleFavorite } from '../src/tui.ts';

setColorMode('none');

const AT = new Date('2026-09-26T01:08:36Z');
const LOCAL = 'America/Sao_Paulo';
const screen = (config: Config, selected: number, cols: number, rows: number, face: Face = 'map', notice?: string) =>
	renderScreen({ config, selected, face, aspect: 1, ...(notice && { notice }) }, LOCAL, AT, cols, rows);
const hidden = (config: Config = defaultConfig()): Config => ({ ...config, ui: { ...config.ui, showZones: false } });
const layout = (cols: number, rows: number, showZones = true, face: Face = 'map') => computeLayout(cols, rows, { face, showZones, aspect: 1 });
// Only what changes between cases: [row 1, analog, map, zones, padding].
const shape = (cols: number, rows: number, showZones = true, face: Face = 'map') => {
	const l = layout(cols, rows, showZones, face);
	return l && [l.topRows, l.analog, l.map, l.zonesRows, l.padTop];
};

// Fills the whole terminal: exactly rows lines of cols columns.
function assertFills(lines: string[], cols: number, rows: number): void {
	assert.equal(lines.length, rows);
	for (const l of lines) assert.equal(visibleWidth(l), cols);
}

// Width of the drawn map: the length of the ruler.
const rulerWidth = (lines: string[]) => lines.find((l) => l.includes('┴'))!.match(/┴[┴─]*/)![0].length;

describe('computeLayout', () => {
	it('everything fits: analog + map on top (16), info + digital (9), zones with the rest and 3 shortcut rows', () => {
		assert.deepEqual(layout(140, 40), { topRows: 16, analog: true, map: true, toggle: false, info: true, zonesRows: 12, padTop: 0 });
		assert.deepEqual(shape(80, 33), [16, true, true, 5, 0]);
	});

	it('k = 1.2: row 1 shrinks with the analog (12 + borders) and the zones get the rest', () => {
		assert.deepEqual(computeLayout(140, 40, { face: 'map', showZones: true, aspect: 1.2 }), {
			topRows: 14,
			analog: true,
			map: true,
			toggle: false,
			info: true,
			zonesRows: 14,
			padTop: 0,
		});
	});

	it('width: analog + 36 map columns side by side from 71; below that, m toggles', () => {
		assert.deepEqual(shape(71, 40), [16, true, true, 12, 0]);
		assert.deepEqual(layout(70, 40), { topRows: 16, analog: false, map: true, toggle: true, info: false, zonesRows: 12, padTop: 0 });
		assert.deepEqual(shape(70, 40, true, 'analog'), [16, true, false, 12, 0]);
	});

	it('width: info beside the digital from 79 (33 + 44 block + borders)', () => {
		assert.equal(layout(79, 40)!.info, true);
		assert.equal(layout(78, 40)!.info, false);
	});

	it('height: zones down to 3 usable rows, then the analog goes, then the zones, then row 1', () => {
		assert.deepEqual(shape(140, 32), [15, false, true, 5, 0]); // no analog, map shrinks
		assert.deepEqual(shape(140, 27), [10, false, true, 5, 0]);
		assert.deepEqual(shape(140, 26), [14, false, true, 0, 0]); // zones go
		assert.deepEqual(shape(140, 22), [10, false, true, 0, 0]);
		assert.deepEqual(shape(140, 21), [0, false, false, 9, 0]); // row 1 goes
		assert.deepEqual(shape(140, 17), [0, false, false, 5, 0]);
		assert.deepEqual(shape(140, 16), [0, false, false, 0, 2]); // only info + digital, centered
		assert.equal(layout(140, 32)!.toggle, false); // lack of height is not a case for m
	});

	it('hidden zones: row 1 grows with the height', () => {
		assert.deepEqual(shape(140, 40, false), [28, true, true, 0, 0]);
		assert.deepEqual(shape(140, 28, false), [16, true, true, 0, 0]);
		assert.deepEqual(shape(140, 27, false), [15, false, true, 0, 0]);
		assert.deepEqual(shape(140, 21, false), [0, false, false, 0, 4]);
	});

	it('too small falls back to the table', () => {
		assert.equal(layout(59, 40), undefined);
		assert.equal(layout(140, 11), undefined);
		assert.notEqual(layout(100, 12), undefined); // row 2 with 9 (info beside or inside), plus the shortcuts
		assert.notEqual(layout(60, 12), undefined);
	});
});

describe('fitFooter', () => {
	const items: [string, number][] = [['a aa', 2], ['b bb', 1], ['c cc', 3], ['q quit', 0]];
	it('loosens the separator, then drops the lowest priority', () => {
		assert.equal(fitFooter(items, 40), 'a aa  ·  b bb  ·  c cc  ·  q quit');
		assert.equal(fitFooter(items, 30), 'a aa · b bb · c cc · q quit');
		assert.equal(fitFooter(items, 25), 'a aa  ·  b bb  ·  q quit');
		assert.equal(fitFooter(items, 6), 'q quit');
	});
});

describe('renderScreen', () => {
	it('140×40: analog + map, info + digital, zones below', () => {
		const lines = screen(defaultConfig(), 1, 140, 40);
		assertFills(lines, 140, 40);
		assert.ok(lines[0]!.startsWith('╭─ analog ─'));
		assert.ok(lines[0]!.includes('╮╭─ map ─'));
		assert.ok(lines[16]!.startsWith('╭─ T1 ─'));
		assert.ok(lines[16]!.includes('╮╭─ digital ─'));
		// Info as wide as the analog: date, name and zone between rules.
		const info = lines.slice(17, 24).map((l) => l.slice(0, 33));
		assert.deepEqual(info.map((l) => l.slice(1, -1).trim()), ['FRI 25 SEP 2026', '─'.repeat(31), '', 'NEW YORK', '', '─'.repeat(31), 'UTC−04:00 · EDT · DST']);
		assert.ok(info[1]!.startsWith('├') && info[1]!.endsWith('┤'));
		// Digital: WORLD TIME on top and the battery (empty before the first reading) below.
		assert.equal(lines[17]!.slice(34, -1).trim(), 'WORLD TIME');
		assert.ok(lines[25]!.startsWith('╭─ zones ─'));
		assert.ok(lines[26]!.startsWith('│ ★ T0  SAO PAULO'));
		assert.ok(lines[27]!.startsWith('│ ▸ T1  NEW YORK     −04:00     −1h   9:08:36 PM  FRI 25      DST'));
		// Shortcuts outside the box, centered, with a blank line before and after.
		assert.ok(lines[36]!.startsWith('╰─') && !lines[36]!.includes('q quit'));
		assert.equal(lines[37]!.trim(), '');
		assert.equal(lines[39]!.trim(), '');
		const footer = '↑↓ zone  ·  ←→ favorite  ·  f favorite  ·  d DST  ·  z zones  ·  t 12/24  ·  q quit';
		assert.equal(lines[38]!.trim(), footer);
		assert.ok(Math.abs(lines[38]!.indexOf('↑') - (140 - lines[38]!.trimEnd().length)) <= 1);
	});

	it('map at the largest proportional area, centered in the panel', () => {
		const lines = screen(defaultConfig(), 1, 140, 40);
		assert.equal(rulerWidth(lines), 57); // 12 map rows × 4.8
		// Map panel: border at 33 (after the analog's 33 columns) and at 139.
		const ruler = lines.find((l) => l.includes('┴'))!;
		const left = ruler.indexOf('┴') - 34;
		const right = 138 - ruler.lastIndexOf('─');
		assert.ok(Math.abs(left - right) <= 1, `${left} × ${right}`);
	});

	it('hidden zones: the map grows in height, the analog stays fixed and centered', () => {
		const lines = screen(hidden(), 1, 140, 40);
		assertFills(lines, 140, 40);
		assert.ok(!lines.some((l) => l.includes('╭─ zones')));
		assert.ok(rulerWidth(lines) > 57);
		const sixty = lines.findIndex((l) => l.includes('60⠀'));
		assert.equal(sixty, 1 + Math.floor((28 - 2 - 14) / 2)); // 14 rows in the middle of 26
		assert.ok(lines[28]!.includes('╭─ digital ─'));
		assert.ok(lines[38]!.includes('z zones')); // shortcuts below
	});

	it('70 columns: a single panel on top, m switches which, and the digital takes the info', () => {
		const map = screen(defaultConfig(), 1, 70, 40, 'map');
		assertFills(map, 70, 40);
		assert.ok(map[0]!.startsWith('╭─ map ─') && !map[0]!.includes('analog'));
		assert.ok(map[38]!.includes('m map/analog'));
		assert.ok(map[16]!.startsWith('╭─ digital ─'));
		assert.equal(map[17]!.slice(1, -1).trim(), 'T1 · NEW YORK · UTC−04:00 · EDT · DST');
		const analog = screen(defaultConfig(), 1, 70, 40, 'analog');
		assert.ok(analog[0]!.startsWith('╭─ analog ─') && !analog[0]!.includes('map'));
		const row = analog.find((l) => l.includes('60⠀'))!;
		const left = row.indexOf('⠀') - 1;
		assert.ok(Math.abs(left - (70 - 2 - 31 - left)) <= 1); // centered on the whole row
	});

	it('80×22: no room for the zones, the map stays (higher priority)', () => {
		const lines = screen(defaultConfig(), 1, 80, 22);
		assertFills(lines, 80, 22);
		assert.ok(lines[0]!.startsWith('╭─ map ─'));
		assert.ok(!lines.some((l) => l.includes('╭─ zones') || l.includes('╭─ analog')));
		assert.ok(!lines[20]!.includes('m map'));
	});

	it('little height: only info + digital, centered, and the shortcuts below', () => {
		const lines = screen(defaultConfig(), 1, 100, 14);
		assertFills(lines, 100, 14);
		assert.ok(lines[1]!.startsWith('╭─ T1 ─') && lines[1]!.includes('╭─ digital ─'));
		assert.ok(lines[9]!.startsWith('╰───') && !lines[9]!.includes('q quit'));
		assert.ok(lines[12]!.includes('q quit'));
	});

	it('catalog without the favorites, and selecting in it moves the clock and the map', () => {
		const table = screen(defaultConfig(), 0, 140, 80).filter((l) => /^│ [★▸ ] (T\d|·) /.test(l));
		assert.equal(table.length, 5 + 34); // favorites + catalog (39 − 5 that are already favorites)
		assert.equal(table.filter((l) => l.includes('NEW YORK')).length, 1);
		assert.equal(table.filter((l) => /S[AÃ]O PAULO/.test(l)).length, 1);
		const lines = screen(defaultConfig(), 5, 140, 40); // the first in the catalog
		assert.ok(lines.some((l) => l.startsWith('│ ▸ ·   PAGO PAGO')));
		assert.ok(lines[16]!.startsWith('╭─ zone ─'));
		assert.ok(lines[20]!.includes('PAGO PAGO'));
		assert.ok(lines[14]!.includes('·'));
	});

	it('forced DST: indicator in the table and the digital, without the IANA abbreviation', () => {
		const config = { ...defaultConfig(), slots: defaultConfig().slots.map((s, i) => (i === 0 ? { ...s, dst: 'off' as const } : s)) };
		const lines = screen(config, 1, 140, 40);
		assert.equal(lines[23]!.slice(1, 32).trim(), 'UTC−05:00 · STD*');
		assert.ok(lines[27]!.includes('−05:00     −2h   8:08:36 PM  FRI 25      STD*'));
	});

	it('notice in place of the shortcuts', () => {
		const lines = screen(defaultConfig(), 0, 140, 40, 'map', 'T0 is the local zone; it stays a favorite');
		assert.ok(lines[38]!.includes(' T0 is the local zone; it stays a favorite '));
		assert.ok(!lines[38]!.includes('q quit'));
	});

	it('24h: no AM/PM', () => {
		const lines = screen({ ...defaultConfig(), clock: '24h' }, 1, 140, 40);
		assert.ok(!lines.slice(16, 25).join('').includes('PM'));
		assert.ok(lines[27]!.includes('21:08:36'));
	});

	it('list scrolls to keep the selection visible, counting the separator', () => {
		const lines = screen(defaultConfig(), 30, 140, 40); // right in the middle of the catalog
		assertFills(lines, 140, 40);
		assert.ok(lines.slice(26, 36).some((l) => l.startsWith('│ ▸ ·')));
		assert.ok(!lines.some((l) => l.includes('T0  SAO PAULO')));
		const last = screen(defaultConfig(), 38, 140, 40); // last in the catalog
		assert.ok(last[35]!.startsWith('│ ▸ ·   KIRITIMATI'));
	});

	it('unknown zone selected: clocks blanked, without breaking', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'TYO', zone: 'Asia/Tokio', dst: 'auto' as const }] };
		const lines = screen(config, 1, 140, 40);
		assertFills(lines, 140, 40);
		assert.equal(lines[20]!.slice(1, 32).trim(), 'TOKIO');
		assert.equal(lines[23]!.slice(1, 32).trim(), 'unknown zone');
	});

	it('small terminal falls back to the favorites-only table', () => {
		for (const [cols, rows] of [[59, 40], [140, 6]] as const) {
			const lines = screen(defaultConfig(), 1, cols, rows);
			assert.equal(lines[0], 'T0  SAO PAULO  −03:00  local  10:08 PM  FRI 25');
			assert.equal(lines.length, 5 + 2);
			assert.ok(lines.at(-1)!.includes('enlarge the terminal'));
		}
	});
});

describe('toggleFavorite', () => {
	it('adds from the catalog, persists, and removes renumbering', () => {
		const path = join(mkdtempSync(join(tmpdir(), 'timan-')), 'config.json');
		const added = toggleFavorite(defaultConfig(), LOCAL, AT, 5).config!; // PAGO PAGO
		assert.deepEqual(added.slots.at(-1), { code: 'PAG', zone: 'Pacific/Pago_Pago', dst: 'auto', name: 'PAGO PAGO' });
		saveConfig(path, added);
		assert.deepEqual(loadConfig(path), added);

		const removed = toggleFavorite(added, LOCAL, AT, 2).config!; // T2 LONDON leaves, TOKYO becomes T2
		assert.deepEqual(removed.slots.map((s) => s.code), ['NYC', 'TYO', 'HKG', 'PAG']);
	});

	it('T0 protected and slot limit, with a notice and no new config', () => {
		assert.deepEqual(toggleFavorite(defaultConfig(), LOCAL, AT, 0), { notice: 'T0 is the local zone; it stays a favorite' });
		let full = defaultConfig();
		while (full.slots.length < 9) full = toggleFavorite(full, LOCAL, AT, full.slots.length + 1).config!;
		assert.deepEqual(toggleFavorite(full, LOCAL, AT, 10), { notice: 'limit of 9 favorites' });
	});
});

describe('cycleDst', () => {
	it('cycles favorites with DST, including T0', () => {
		const on = cycleDst(defaultConfig(), LOCAL, AT, 1).config!;
		assert.equal(on.slots[0]!.dst, 'on');
		assert.equal(cycleDst(on, LOCAL, AT, 1).config!.slots[0]!.dst, 'off');
		assert.equal(cycleDst(defaultConfig(), 'America/New_York', AT, 0).config!.local_dst, 'on');
	});

	it('no effect on the catalog or on a zone without DST', () => {
		assert.equal(cycleDst(defaultConfig(), LOCAL, AT, 5).notice, 'DST is for favorites only (f to add one)');
		assert.equal(cycleDst(defaultConfig(), LOCAL, AT, 3).notice, 'TOKYO: no daylight saving time');
		assert.equal(cycleDst(defaultConfig(), LOCAL, AT, 0).config, undefined); // São Paulo has no DST
	});
});

// Whole screen, without color. Update with: npm run test:update
describe('snapshots', () => {
	for (const [cols, rows] of [[80, 24], [100, 30], [140, 40], [200, 50]] as const) {
		for (const show of [true, false]) {
			it(`${cols}×${rows} zones ${show ? 'visible' : 'hidden'}`, (t) => {
				const config = show ? defaultConfig() : hidden();
				const lines = screen(config, 1, cols, rows);
				assertFills(lines, cols, rows);
				t.assert.snapshot(lines.join('\n'));
			});
		}
	}
});
