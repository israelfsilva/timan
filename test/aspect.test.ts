import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampAspect, parseCellSize, takeCellSize } from '../src/aspect.ts';
import { calibrationFrame } from '../src/calibrate.ts';
import { setColorMode } from '../src/theme.ts';

setColorMode('none');

describe('parseCellSize', () => {
	it('resposta válida: k = altura / (2 · largura)', () => {
		assert.equal(parseCellSize('\x1b[6;20;10t'), 1);
		assert.equal(parseCellSize('\x1b[6;24;10t'), 1.2);
		assert.equal(parseCellSize('\x1b[6;17;8t'), 17 / 16);
	});

	it('malformada é ignorada', () => {
		for (const bad of [
			'\x1b[6;20t', // falta a largura
			'\x1b[6;20;10', // sem o t
			'\x1b[4;600;800t', // resposta de outra consulta (14t)
			'\x1b[6;a;10t',
			'\x1b[6;0;10t',
			'\x1b[6;20;0t',
			'\x1b[6;100;10t', // k = 5, implausível
			'x\x1b[6;20;10t',
		]) {
			assert.equal(parseCellSize(bad), undefined, JSON.stringify(bad));
		}
	});

	it('ausente', () => {
		assert.equal(parseCellSize(''), undefined);
	});
});

describe('takeCellSize', () => {
	it('tira a resposta do meio das teclas', () => {
		assert.deepEqual(takeCellSize('a\x1b[6;24;10tq'), { aspect: 1.2, rest: 'aq' });
	});

	it('malformada também sai, para não virar tecla, mas sem k', () => {
		assert.deepEqual(takeCellSize('\x1b[6;0;10t'), { rest: '' });
	});

	it('ausente: o trecho segue intacto', () => {
		assert.deepEqual(takeCellSize('\x1b[A'), { rest: '\x1b[A' });
		assert.deepEqual(takeCellSize(''), { rest: '' });
	});
});

describe('clampAspect', () => {
	it('arredonda para centésimos e fica na faixa', () => {
		assert.equal(clampAspect(1 + 0.05 + 0.05 + 0.05), 1.15);
		assert.equal(clampAspect(0.1), 0.5);
		assert.equal(clampAspect(9), 2);
	});
});

describe('calibrationFrame', () => {
	it('k atual no rodapé, o painel acompanha a altura do analógico', () => {
		const at = new Date('2026-09-25T10:08:36Z');
		const one = calibrationFrame(at, 1, 80, 30);
		const tall = calibrationFrame(at, 1.2, 80, 30);
		assert.ok(one.some((l) => l.includes(' k 1,00 ─')));
		assert.ok(tall.some((l) => l.includes(' k 1,20 ─')));
		const box = (ls: string[]) => ls.filter((l) => /[│╭╰]/.test(l)).length;
		assert.equal(box(one), 16);
		assert.equal(box(tall), 14);
	});
});
