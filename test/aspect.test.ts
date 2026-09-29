import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampAspect, parseCellSize, takeCellSize } from '../src/aspect.ts';
import { calibrationFrame } from '../src/calibrate.ts';
import { setColorMode } from '../src/theme.ts';

setColorMode('none');

describe('parseCellSize', () => {
	it('valid reply: k = height / (2 · width)', () => {
		assert.equal(parseCellSize('\x1b[6;20;10t'), 1);
		assert.equal(parseCellSize('\x1b[6;24;10t'), 1.2);
		assert.equal(parseCellSize('\x1b[6;17;8t'), 17 / 16);
	});

	it('malformed is ignored', () => {
		for (const bad of [
			'\x1b[6;20t', // width missing
			'\x1b[6;20;10', // no t
			'\x1b[4;600;800t', // reply to a different query (14t)
			'\x1b[6;a;10t',
			'\x1b[6;0;10t',
			'\x1b[6;20;0t',
			'\x1b[6;100;10t', // k = 5, implausible
			'x\x1b[6;20;10t',
		]) {
			assert.equal(parseCellSize(bad), undefined, JSON.stringify(bad));
		}
	});

	it('absent', () => {
		assert.equal(parseCellSize(''), undefined);
	});
});

describe('takeCellSize', () => {
	it('takes the reply out from between keys', () => {
		assert.deepEqual(takeCellSize('a\x1b[6;24;10tq'), { aspect: 1.2, rest: 'aq' });
	});

	it("malformed is taken out too, so it doesn't become a key, but without k", () => {
		assert.deepEqual(takeCellSize('\x1b[6;0;10t'), { rest: '' });
	});

	it('absent: the chunk goes through untouched', () => {
		assert.deepEqual(takeCellSize('\x1b[A'), { rest: '\x1b[A' });
		assert.deepEqual(takeCellSize(''), { rest: '' });
	});
});

describe('clampAspect', () => {
	it('rounds to hundredths and stays in range', () => {
		assert.equal(clampAspect(1 + 0.05 + 0.05 + 0.05), 1.15);
		assert.equal(clampAspect(0.1), 0.5);
		assert.equal(clampAspect(9), 2);
	});
});

describe('calibrationFrame', () => {
	it('current k in the footer, the panel follows the analog height', () => {
		const at = new Date('2026-09-25T10:08:36Z');
		const one = calibrationFrame(at, 1, 80, 30);
		const tall = calibrationFrame(at, 1.2, 80, 30);
		assert.ok(one.some((l) => l.includes(' k 1.00 ─')));
		assert.ok(tall.some((l) => l.includes(' k 1.20 ─')));
		const box = (ls: string[]) => ls.filter((l) => /[│╭╰]/.test(l)).length;
		assert.equal(box(one), 16);
		assert.equal(box(tall), 14);
	});
});
