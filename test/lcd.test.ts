import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LCD_WIDTH, SMALL_ROWS, SMALL_WIDTH, renderLcd, renderSmallLcd } from '../src/lcd.ts';

// Aceso = o próprio caractere; apagado = pontos, para ver o fantasma no snapshot.
const ghost = (s: string, on: boolean) => (on ? s : s.replace(/./g, '·'));
const litOnly = (s: string, on: boolean) => (on ? s : s.replace(/./g, ' '));

describe('renderLcd', () => {
	it('grade 6×5 com fantasma: o exemplo da especificação', () => {
		assert.deepEqual(renderLcd('9:08', ghost), [
			'······  ▄▄▄▄▄▄     ▄▄▄▄▄▄  ▄▄▄▄▄▄',
			'·    ·  █    █  ▪  █    █  █    █',
			'······  ▀▀▀▀▀█     █····█  █▀▀▀▀█',
			'·    ·  ·    █  ▪  █    █  █    █',
			'······  ▀▀▀▀▀▀     ▀▀▀▀▀▀  ▀▀▀▀▀▀',
		]);
	});

	it('os dez dígitos', () => {
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

	it('--:-- deixa tudo apagado, menos o separador', () => {
		const lines = renderLcd('--:--', ghost);
		assert.equal(lines.join('').replace(/[·\s▪]/g, ''), '');
		assert.equal(lines[1]![16], '▪');
	});

	it('largura fixa', () => {
		for (const t of ['9:08', '12:34', '--:--']) {
			for (const l of renderLcd(t, ghost)) assert.equal(l.length, LCD_WIDTH);
		}
	});

	it('células vizinhas no mesmo estado viram um trecho só', () => {
		const runs: string[] = [];
		renderLcd('88:88', (s) => (runs.push(s), s));
		// Tudo aceso: por dígito, 1 trecho na linha de cima, 2 nas de lado, 1 no meio e embaixo.
		assert.ok(runs.includes('▄▄▄▄▄▄') && runs.includes('█▀▀▀▀█') && runs.includes('▀▀▀▀▀▀'));
		assert.equal(runs.length, 4 * (1 + 2 + 1 + 2 + 1) + 2);
	});
});

describe('renderSmallLcd', () => {
	it('grade 4×3 terminando na metade de cima, com fantasma', () => {
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

	it('os dez dígitos', () => {
		const digits = ['01', '23', '45', '67', '89'].map((s) => renderSmallLcd(s, litOnly));
		assert.deepEqual(digits, [
			['█▀▀█    █', '█  █    █', '▀▀▀▀    ▀'],
			['▀▀▀█ ▀▀▀█', '█▀▀▀ ▀▀▀█', '▀▀▀▀ ▀▀▀▀'],
			['█  █ █▀▀▀', '▀▀▀█ ▀▀▀█', '   ▀ ▀▀▀▀'],
			['█▀▀▀ ▀▀▀█', '█▀▀█    █', '▀▀▀▀    ▀'],
			['█▀▀█ █▀▀█', '█▀▀█ ▀▀▀█', '▀▀▀▀ ▀▀▀▀'],
		]);
	});

	it('-- deixa tudo apagado; tamanho fixo', () => {
		const lines = renderSmallLcd('--', ghost);
		assert.equal(lines.join('').replace(/[·\s]/g, ''), '');
		assert.equal(lines.length, SMALL_ROWS);
		for (const l of lines) assert.equal(l.length, SMALL_WIDTH);
	});
});
