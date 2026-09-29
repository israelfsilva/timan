import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ANALOG_WIDTH, analogRows, renderAnalog } from '../src/analog.ts';
import { setColorMode } from '../src/theme.ts';

setColorMode('none');

const at = (hms: string, k = 1) => renderAnalog(new Date(`2026-09-25T${hms}Z`), k);
const blank = (s: string) => /^⠀*$/.test(s);
const cells = (line: string, from: number, to: number) => [...line].slice(from, to).join('');

describe('renderAnalog', () => {
	it('k = 1: 14 rows of 31 columns', () => {
		assert.equal(analogRows(1), 14);
		for (const t of ['00:00:00', '10:08:36', '23:59:59']) {
			const lines = at(t);
			assert.equal(lines.length, 14);
			for (const l of lines) assert.equal([...l].length, ANALOG_WIDTH);
		}
	});

	it('height follows k: taller cell, fewer rows', () => {
		assert.equal(analogRows(1.2), 12);
		assert.equal(analogRows(0.8), 18);
		for (const k of [0.8, 1.2, 1.5]) assert.equal(renderAnalog(undefined, k).length, analogRows(k));
	});

	// Lit dots of the dial (Braille only; the labels are text) in dot coordinates.
	const DOT_BITS = [
		[0x01, 0x02, 0x04, 0x40],
		[0x08, 0x10, 0x20, 0x80],
	];
	function dots(lines: string[]): [number, number][] {
		const out: [number, number][] = [];
		lines.forEach((line, row) =>
			[...line].forEach((ch, col) => {
				const mask = ch.codePointAt(0)! - 0x2800;
				if (mask <= 0 || mask > 0xff) return;
				for (let dx = 0; dx < 2; dx++) {
					for (let dy = 0; dy < 4; dy++) if (mask & DOT_BITS[dx]![dy]!) out.push([col * 2 + dx, row * 4 + dy]);
				}
			}),
		);
		return out;
	}

	for (const k of [1, 1.2]) {
		it(`k = ${k}: 12–6 vertically ÷ 3–9 horizontally, times k, is 1 ± 0.05`, () => {
			// Dial only: the extreme dots are the tips of the 12, 3, 6 and 9 ticks.
			const d = dots(renderAnalog(undefined, k));
			const xs = d.map(([x]) => x);
			const ys = d.map(([, y]) => y);
			const ratio = (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs));
			assert.ok(Math.abs(ratio * k - 1) <= 0.05, `ratio × k = ${ratio * k}`);
		});
	}

	it('k = 1.2: labels still surround the dial', () => {
		const lines = renderAnalog(new Date('2026-09-25T10:08:36Z'), 1.2);
		assert.equal(cells(lines[0]!, 14, 16), '60');
		assert.equal(cells(lines[11]!, 14, 16), '30');
		assert.equal(cells(lines[6]!, 1, 3), '45');
		assert.equal(cells(lines[6]!, 28, 30), '15');
	});

	it('minutes around the dial, mirrored', () => {
		const lines = at('10:08:36');
		assert.equal(cells(lines[0]!, 14, 16), '60');
		assert.equal(cells(lines[13]!, 14, 16), '30');
		assert.equal(cells(lines[7]!, 1, 3), '45');
		assert.equal(cells(lines[7]!, 28, 30), '15');
		assert.equal(cells(lines[1]!, 8, 10), '55');
		assert.equal(cells(lines[1]!, 21, 23), '05');
		assert.equal(cells(lines[12]!, 8, 10), '35');
		assert.equal(cells(lines[12]!, 21, 23), '25');
	});

	it('3:00:00: hour hand right, minute and second hands up', () => {
		const lines = at('03:00:00');
		assert.ok(!blank(cells(lines[6]!, 16, 21)));
		assert.ok(blank(cells(lines[6]!, 8, 14)) && blank(cells(lines[7]!, 8, 14)));
		assert.ok(!blank(cells(lines[3]!, 15, 16)));
		assert.ok(blank(cells(lines[10]!, 12, 19)));
	});

	it('12:45:00: minute hand left', () => {
		const lines = at('00:45:00');
		assert.ok(!blank(cells(lines[6]!, 9, 14) + cells(lines[7]!, 9, 14)));
		assert.ok(blank(cells(lines[6]!, 17, 23) + cells(lines[7]!, 17, 23)));
	});

	it('6:30:30: all hands down', () => {
		const lines = at('06:30:30');
		assert.ok(!blank(cells(lines[9]!, 14, 16)));
		assert.ok(blank(cells(lines[4]!, 12, 19)));
	});
});
