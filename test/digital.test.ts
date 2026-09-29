import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Config, defaultConfig } from '../src/config.ts';
import { DIGITAL_BLOCK, DIGITAL_ROWS, infoTitle, renderDigital, renderInfo } from '../src/digital.ts';
import { renderSmallLcd } from '../src/lcd.ts';
import { RULE } from '../src/panel.ts';
import { buildRows, zoneList } from '../src/table.ts';
import { setColorMode, visibleWidth } from '../src/theme.ts';

setColorMode('none');

const AT = new Date('2026-09-26T01:08:36Z');
const LOCAL = 'America/Sao_Paulo';
const row = (config: Config = defaultConfig(), i = 1) => buildRows(config, LOCAL, AT)[i]!;
const render = (r = row(), clock: Config['clock'] = '12h', width = 78, info = true, power?: string) =>
	renderDigital(r, { clock, at: AT, width, info, ...(power !== undefined && { power }) });
const info = (r = row(), width = 31) => renderInfo(r, AT, width);
// Small seconds without color (lit and unlit alike), to compare with the end of the lines.
const small = (secs: string) => renderSmallLcd(secs, (s) => s);

// Margin on each side when the line is centered in `width`.
function margins(line: string, width: number): [number, number] {
	const left = line.length - line.trimStart().length;
	return [left, width - visibleWidth(line.trimEnd())];
}

describe('renderDigital', () => {
	it('with info: info, block and date centered', () => {
		const lines = render();
		assert.equal(lines.length, DIGITAL_ROWS);
		assert.equal(lines[0]!.trim(), 'T1 · NEW YORK · UTC−04:00 · EDT · DST');
		assert.equal(lines[6]!.trim(), 'FRI 25 SEP 2026');
		for (const i of [0, 6]) {
			const [l, r] = margins(lines[i]!, 78);
			assert.ok(Math.abs(l - r) <= 1, `line ${i}: ${l} × ${r}`);
		}
		// The whole block (digits + AM/PM and seconds) is what gets centered.
		const indent = Math.floor((78 - DIGITAL_BLOCK) / 2);
		assert.equal(lines[1]!.search(/\S/), indent);
		assert.equal(visibleWidth(lines[5]!), indent + DIGITAL_BLOCK);
	});

	it('without info: WORLD TIME, the block and the battery', () => {
		const lines = render(row(), '12h', 78, false, '87% · 4 HOUR BATTERY');
		assert.equal(lines.length, DIGITAL_ROWS);
		assert.equal(lines[0]!.trim(), 'WORLD TIME');
		assert.ok(lines[1]!.endsWith('  PM'));
		assert.ok(!lines.join('').includes('NEW YORK'));
		assert.ok(lines[5]!.endsWith('  ' + small('36')[2]));
		assert.equal(lines[6]!.trim(), '87% · 4 HOUR BATTERY');
		for (const i of [0, 6]) {
			const [l, r] = margins(lines[i]!, 78);
			assert.ok(Math.abs(l - r) <= 1, `line ${i}: ${l} × ${r}`);
		}
	});

	it('with info: the battery goes next to the date', () => {
		assert.equal(render(row(), '12h', 78, true, '87% BATTERY · CHARGING')[6]!.trim(), 'FRI 25 SEP 2026 · 87% BATTERY · CHARGING');
	});

	it('right of the digits: AM/PM on top, seconds in small LCD aligned at the bottom', () => {
		const lines = render();
		assert.ok(lines[1]!.endsWith('▄▄▄▄▄▄  PM'));
		assert.ok(!/PM|AM/.test(lines.slice(2, 6).join('')));
		assert.ok(lines[2]!.endsWith('█')); // digits row 1: nothing on the right
		small('36').forEach((s, i) => assert.ok(lines[3 + i]!.endsWith('  ' + s), lines[3 + i]));
	});

	it('24h: no AM/PM and the digits in the same place', () => {
		const h12 = render(row(), '12h');
		const h24 = render(row(), '24h');
		assert.ok(!h24.join('').includes('PM'));
		for (let i = 1; i < 6; i++) assert.equal(h24[i]!.search(/[▄█▀▪]/), h12[i]!.search(/[▄█▀▪]/));
	});

	it('forced DST: without the IANA abbreviation', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'NYC', zone: 'America/New_York', dst: 'off' as const }] };
		assert.equal(render(row(config))[0]!.trim(), 'T1 · NEW YORK · UTC−05:00 · STD*');
	});

	it('catalog zone: without the ref', () => {
		const { rows, favorites } = zoneList(defaultConfig(), LOCAL, AT);
		assert.equal(render(rows[favorites]!)[0]!.trim(), 'PAGO PAGO · UTC−11:00');
	});

	it('unknown zone: clock blanked, without breaking', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'TYO', zone: 'Asia/Tokio', dst: 'auto' as const }] };
		const lines = render(row(config));
		assert.equal(lines[0]!.trim(), 'T1 · TOKIO · unknown zone');
		assert.ok(lines[5]!.endsWith('  ' + small('--')[2]));
		assert.equal(lines[6]!.trim(), '');
	});

	it('narrow width: name shrinks, nothing overflows', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'X', zone: 'America/New_York', name: 'A'.repeat(60), dst: 'auto' as const }] };
		for (const l of render(row(config), '12h', 58)) assert.ok(visibleWidth(l) <= 58, l);
		assert.ok(render(row(config), '12h', 58)[0]!.includes('…'));
	});
});

describe('renderInfo', () => {
	it('date and zone at the height of the title and battery; name in the middle', () => {
		const lines = info();
		assert.equal(lines.length, DIGITAL_ROWS);
		assert.deepEqual(
			lines.map((l) => (l === RULE ? RULE : l.trim())),
			['FRI 25 SEP 2026', RULE, '', 'NEW YORK', '', RULE, 'UTC−04:00 · EDT · DST'],
		);
		for (const i of [0, 3, 6]) {
			const [l, r] = margins(lines[i]!, 31);
			assert.ok(Math.abs(l - r) <= 1, `line ${i}: ${l} × ${r}`);
		}
	});

	it("title: the favorite's ref, or zone for the catalog", () => {
		const { rows, favorites } = zoneList(defaultConfig(), LOCAL, AT);
		assert.equal(infoTitle(rows[1]!), 'T1');
		assert.equal(infoTitle(rows[favorites]!), 'zone');
	});

	it('unknown zone and long name: no date, name shrinks', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'X', zone: 'Asia/Tokio', name: 'A'.repeat(60), dst: 'auto' as const }] };
		const lines = info(row(config));
		assert.equal(lines[0]!.trim(), '');
		assert.ok(lines[3]!.includes('…'));
		assert.equal(lines[6]!.trim(), 'unknown zone');
		for (const l of lines) assert.ok(visibleWidth(l) <= 31, l);
	});
});
