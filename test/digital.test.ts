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
// Segundos pequenos sem cor (acesos e apagados iguais), para comparar com o fim das linhas.
const small = (secs: string) => renderSmallLcd(secs, (s) => s);

// Margem de cada lado quando a linha é centralizada em `width`.
function margins(line: string, width: number): [number, number] {
	const left = line.length - line.trimStart().length;
	return [left, width - visibleWidth(line.trimEnd())];
}

describe('renderDigital', () => {
	it('com info: info, bloco e data centralizados', () => {
		const lines = render();
		assert.equal(lines.length, DIGITAL_ROWS);
		assert.equal(lines[0]!.trim(), 'T1 · NEW YORK · UTC−04:00 · EDT · DST');
		assert.equal(lines[6]!.trim(), 'FRI 25 SEP 2026');
		for (const i of [0, 6]) {
			const [l, r] = margins(lines[i]!, 78);
			assert.ok(Math.abs(l - r) <= 1, `linha ${i}: ${l} × ${r}`);
		}
		// O bloco inteiro (dígitos + AM/PM e segundos) é que centraliza.
		const indent = Math.floor((78 - DIGITAL_BLOCK) / 2);
		assert.equal(lines[1]!.search(/\S/), indent);
		assert.equal(visibleWidth(lines[5]!), indent + DIGITAL_BLOCK);
	});

	it('sem info: WORLD TIME, o bloco e a bateria', () => {
		const lines = render(row(), '12h', 78, false, '87% · 4 HOUR BATTERY');
		assert.equal(lines.length, DIGITAL_ROWS);
		assert.equal(lines[0]!.trim(), 'WORLD TIME');
		assert.ok(lines[1]!.endsWith('  PM'));
		assert.ok(!lines.join('').includes('NEW YORK'));
		assert.ok(lines[5]!.endsWith('  ' + small('36')[2]));
		assert.equal(lines[6]!.trim(), '87% · 4 HOUR BATTERY');
		for (const i of [0, 6]) {
			const [l, r] = margins(lines[i]!, 78);
			assert.ok(Math.abs(l - r) <= 1, `linha ${i}: ${l} × ${r}`);
		}
	});

	it('com info: a bateria vai junto da data', () => {
		assert.equal(render(row(), '12h', 78, true, '87% BATTERY · CHARGING')[6]!.trim(), 'FRI 25 SEP 2026 · 87% BATTERY · CHARGING');
	});

	it('à direita dos dígitos: AM/PM em cima, segundos em LCD pequeno alinhados embaixo', () => {
		const lines = render();
		assert.ok(lines[1]!.endsWith('▄▄▄▄▄▄  PM'));
		assert.ok(!/PM|AM/.test(lines.slice(2, 6).join('')));
		assert.ok(lines[2]!.endsWith('█')); // linha 1 dos dígitos: nada à direita
		small('36').forEach((s, i) => assert.ok(lines[3 + i]!.endsWith('  ' + s), lines[3 + i]));
	});

	it('24h: sem AM/PM e com os dígitos no mesmo lugar', () => {
		const h12 = render(row(), '12h');
		const h24 = render(row(), '24h');
		assert.ok(!h24.join('').includes('PM'));
		for (let i = 1; i < 6; i++) assert.equal(h24[i]!.search(/[▄█▀▪]/), h12[i]!.search(/[▄█▀▪]/));
	});

	it('DST forçado: sem a abreviação da IANA', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'NYC', zone: 'America/New_York', dst: 'off' as const }] };
		assert.equal(render(row(config))[0]!.trim(), 'T1 · NEW YORK · UTC−05:00 · STD*');
	});

	it('zona do catálogo: sem o ref', () => {
		const { rows, favorites } = zoneList(defaultConfig(), LOCAL, AT);
		assert.equal(render(rows[favorites]!)[0]!.trim(), 'PAGO PAGO · UTC−11:00');
	});

	it('zona desconhecida: relógio apagado, sem quebrar', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'TYO', zone: 'Asia/Tokio', dst: 'auto' as const }] };
		const lines = render(row(config));
		assert.equal(lines[0]!.trim(), 'T1 · TOKIO · zona desconhecida');
		assert.ok(lines[5]!.endsWith('  ' + small('--')[2]));
		assert.equal(lines[6]!.trim(), '');
	});

	it('largura pequena: nome encurta, nada estoura', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'X', zone: 'America/New_York', name: 'A'.repeat(60), dst: 'auto' as const }] };
		for (const l of render(row(config), '12h', 58)) assert.ok(visibleWidth(l) <= 58, l);
		assert.ok(render(row(config), '12h', 58)[0]!.includes('…'));
	});
});

describe('renderInfo', () => {
	it('data e fuso na altura do título e da bateria; nome no meio', () => {
		const lines = info();
		assert.equal(lines.length, DIGITAL_ROWS);
		assert.deepEqual(
			lines.map((l) => (l === RULE ? RULE : l.trim())),
			['FRI 25 SEP 2026', RULE, '', 'NEW YORK', '', RULE, 'UTC−04:00 · EDT · DST'],
		);
		for (const i of [0, 3, 6]) {
			const [l, r] = margins(lines[i]!, 31);
			assert.ok(Math.abs(l - r) <= 1, `linha ${i}: ${l} × ${r}`);
		}
	});

	it('título: o ref do favorito, ou zone no catálogo', () => {
		const { rows, favorites } = zoneList(defaultConfig(), LOCAL, AT);
		assert.equal(infoTitle(rows[1]!), 'T1');
		assert.equal(infoTitle(rows[favorites]!), 'zone');
	});

	it('zona desconhecida e nome longo: sem data, nome encurta', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'X', zone: 'Asia/Tokio', name: 'A'.repeat(60), dst: 'auto' as const }] };
		const lines = info(row(config));
		assert.equal(lines[0]!.trim(), '');
		assert.ok(lines[3]!.includes('…'));
		assert.equal(lines[6]!.trim(), 'zona desconhecida');
		for (const l of lines) assert.ok(visibleWidth(l) <= 31, l);
	});
});
