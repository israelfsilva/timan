import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LCD_WIDTH, SMALL_ROWS, SMALL_WIDTH, renderLcd, renderSmallLcd } from '../src/lcd.ts';

// Lit = the character itself; unlit = dots, to see the ghost in the snapshot.
const ghost = (s: string, on: boolean) => (on ? s : s.replace(/./g, '·'));
const litOnly = (s: string, on: boolean) => (on ? s : s.replace(/./g, ' '));

describe('renderLcd', () => {
	it('6×5 grid with ghosts: the example from the spec', () => {
		assert.deepEqual(renderLcd('9:08', ghost), [
			'······  ▄▄▄▄▄▄     ▄▄▄▄▄▄  ▄▄▄▄▄▄',
			'·    ·  █    █  ▪  █    █  █    █',
			'······  ▀▀▀▀▀█     █····█  █▀▀▀▀█',
			'·    ·  ·    █  ▪  █    █  █    █',
			'······  ▀▀▀▀▀▀     ▀▀▀▀▀▀  ▀▀▀▀▀▀',
		]);
	});

	it('the ten digits', () => {
		assert.deepEqual(renderLcd('01:23', litOnly), [
			'▄▄▄▄▄▄       ▄     ▄▄▄▄▄▄  ▄▄▄▄▄▄',
			'█    █       █  ▪       █       █',
			'█    █       █     █▀▀▀▀▀  ▀▀▀▀▀█',
			'█    █       █  ▪  █            █',
			'▀▀▀▀▀▀       ▀     ▀▀▀▀▀▀  ▀▀▀▀▀▀',
		]);
		assert.deepEqual(renderLcd('45:67', litOnly), [
			'▄    ▄  ▄▄▄▄▄▄     ▄▄▄▄▄▄  ▄▄▄▄▄▄',
			'█    █  █       ▪  █            █',
			'▀▀▀▀▀█  ▀▀▀▀▀█     █▀▀▀▀█       █',
			'     █       █  ▪  █    █       █',
			'     ▀  ▀▀▀▀▀▀     ▀▀▀▀▀▀       ▀',
		]);
		assert.deepEqual(renderLcd('89:--', litOnly), [
			'▄▄▄▄▄▄  ▄▄▄▄▄▄                   ',
			'█    █  █    █  ▪                ',
			'█▀▀▀▀█  ▀▀▀▀▀█                   ',
			'█    █       █  ▪                ',
			'▀▀▀▀▀▀  ▀▀▀▀▀▀                   ',
		]);
	});

	it('--:-- leaves everything unlit except the separator', () => {
		const lines = renderLcd('--:--', ghost);
		assert.equal(lines.join('').replace(/[·\s▪]/g, ''), '');
		assert.equal(lines[1]![16], '▪');
	});

	it('fixed width', () => {
		for (const t of ['9:08', '12:34', '--:--']) {
			for (const l of renderLcd(t, ghost)) assert.equal(l.length, LCD_WIDTH);
		}
	});

	it('neighboring cells in the same state become a single run', () => {
		const runs: string[] = [];
		renderLcd('88:88', (s) => (runs.push(s), s));
		// All lit: per digit, 1 run on the top row, 2 on the side rows, 1 in the middle and at the bottom.
		assert.ok(runs.includes('▄▄▄▄▄▄') && runs.includes('█▀▀▀▀█') && runs.includes('▀▀▀▀▀▀'));
		assert.equal(runs.length, 4 * (1 + 2 + 1 + 2 + 1) + 2);
	});
});

describe('renderSmallLcd', () => {
	it('4×3 grid ending on the top half, with ghosts', () => {
		assert.deepEqual(renderSmallLcd('36', ghost), [
			'▀▀▀█ █▀▀▀',
			'▀▀▀█ █▀▀█',
			'▀▀▀▀ ▀▀▀▀',
		]);
		assert.deepEqual(renderSmallLcd('71', ghost), [
			'▀▀▀█ ···█',
			'···█ ···█',
			'···▀ ···▀',
		]);
	});

	it('the ten digits', () => {
		const digits = ['01', '23', '45', '67', '89'].map((s) => renderSmallLcd(s, litOnly));
		assert.deepEqual(digits, [
			['█▀▀█    █', '█  █    █', '▀▀▀▀    ▀'],
			['▀▀▀█ ▀▀▀█', '█▀▀▀ ▀▀▀█', '▀▀▀▀ ▀▀▀▀'],
			['█  █ █▀▀▀', '▀▀▀█ ▀▀▀█', '   ▀ ▀▀▀▀'],
			['█▀▀▀ ▀▀▀█', '█▀▀█    █', '▀▀▀▀    ▀'],
			['█▀▀█ █▀▀█', '█▀▀█ ▀▀▀█', '▀▀▀▀ ▀▀▀▀'],
		]);
	});

	it('-- leaves everything unlit; fixed size', () => {
		const lines = renderSmallLcd('--', ghost);
		assert.equal(lines.join('').replace(/[·\s]/g, ''), '');
		assert.equal(lines.length, SMALL_ROWS);
		for (const l of lines) assert.equal(l.length, SMALL_WIDTH);
	});
});
