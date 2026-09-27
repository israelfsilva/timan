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
// Só o que muda entre os casos: [linha 1, analógico, mapa, zonas, folga].
const shape = (cols: number, rows: number, showZones = true, face: Face = 'map') => {
	const l = layout(cols, rows, showZones, face);
	return l && [l.topRows, l.analog, l.map, l.zonesRows, l.padTop];
};

// Ocupa o terminal inteiro: exatamente rows linhas de cols colunas.
function assertFills(lines: string[], cols: number, rows: number): void {
	assert.equal(lines.length, rows);
	for (const l of lines) assert.equal(visibleWidth(l), cols);
}

// Largura do mapa desenhado: o comprimento da régua.
const rulerWidth = (lines: string[]) => lines.find((l) => l.includes('┴'))!.match(/┴[┴─]*/)![0].length;

describe('computeLayout', () => {
	it('tudo cabe: analógico + mapa em cima (16), info + digital (7), zonas com o resto e 3 linhas de atalhos', () => {
		assert.deepEqual(layout(140, 40), { topRows: 16, analog: true, map: true, toggle: false, info: true, zonesRows: 14, padTop: 0 });
		assert.deepEqual(shape(80, 31), [16, true, true, 5, 0]);
	});

	it('k = 1,2: a linha 1 encolhe com o analógico (12 + bordas) e as zonas ganham o resto', () => {
		assert.deepEqual(computeLayout(140, 40, { face: 'map', showZones: true, aspect: 1.2 }), {
			topRows: 14,
			analog: true,
			map: true,
			toggle: false,
			info: true,
			zonesRows: 16,
			padTop: 0,
		});
	});

	it('largura: analógico + 36 colunas de mapa lado a lado a partir de 71; abaixo, m alterna', () => {
		assert.deepEqual(shape(71, 40), [16, true, true, 12, 0]);
		assert.deepEqual(layout(70, 40), { topRows: 16, analog: false, map: true, toggle: true, info: false, zonesRows: 12, padTop: 0 });
		assert.deepEqual(shape(70, 40, true, 'analog'), [16, true, false, 12, 0]);
	});

	it('largura: info ao lado do digital a partir de 79 (33 + bloco de 44 + bordas)', () => {
		assert.equal(layout(79, 40)!.info, true);
		assert.equal(layout(78, 40)!.info, false);
	});

	it('altura: zonas até 3 linhas úteis, depois sai o analógico, depois as zonas, depois a linha 1', () => {
		assert.deepEqual(shape(140, 30), [15, false, true, 5, 0]); // sem analógico, mapa encolhe
		assert.deepEqual(shape(140, 25), [10, false, true, 5, 0]);
		assert.deepEqual(shape(140, 24), [14, false, true, 0, 0]); // zonas saem
		assert.deepEqual(shape(140, 20), [10, false, true, 0, 0]);
		assert.deepEqual(shape(140, 19), [0, false, false, 9, 0]); // linha 1 sai
		assert.deepEqual(shape(140, 15), [0, false, false, 5, 0]);
		assert.deepEqual(shape(140, 14), [0, false, false, 0, 2]); // só info + digital, centralizados
		assert.equal(layout(140, 30)!.toggle, false); // falta de altura não é caso do m
	});

	it('zonas ocultas: a linha 1 cresce com a altura', () => {
		assert.deepEqual(shape(140, 40, false), [30, true, true, 0, 0]);
		assert.deepEqual(shape(140, 26, false), [16, true, true, 0, 0]);
		assert.deepEqual(shape(140, 25, false), [15, false, true, 0, 0]);
		assert.deepEqual(shape(140, 19, false), [0, false, false, 0, 4]);
	});

	it('pequeno demais cai na tabela', () => {
		assert.equal(layout(59, 40), undefined);
		assert.equal(layout(140, 9), undefined);
		assert.notEqual(layout(100, 10), undefined); // info ao lado: linha 2 com 7, mais os atalhos
		assert.notEqual(layout(60, 12), undefined); // info dentro: linha 2 com 9, mais os atalhos
	});
});

describe('fitFooter', () => {
	const items: [string, number][] = [['a aa', 2], ['b bb', 1], ['c cc', 3], ['q sair', 0]];
	it('afrouxa o separador e depois tira os de menor prioridade', () => {
		assert.equal(fitFooter(items, 40), 'a aa  ·  b bb  ·  c cc  ·  q sair');
		assert.equal(fitFooter(items, 30), 'a aa · b bb · c cc · q sair');
		assert.equal(fitFooter(items, 25), 'a aa  ·  b bb  ·  q sair');
		assert.equal(fitFooter(items, 6), 'q sair');
	});
});

describe('renderScreen', () => {
	it('140×40: analógico + mapa, info + digital, zonas embaixo', () => {
		const lines = screen(defaultConfig(), 1, 140, 40);
		assertFills(lines, 140, 40);
		assert.ok(lines[0]!.startsWith('╭─ analog ─'));
		assert.ok(lines[0]!.includes('╮╭─ map ─'));
		assert.ok(lines[16]!.startsWith('╭─ T1 ─'));
		assert.ok(lines[16]!.includes('╮╭─ digital ─'));
		// Info com a largura do analógico: data, nome e fuso entre divisores.
		const info = lines.slice(17, 22).map((l) => l.slice(0, 33));
		assert.deepEqual(info.map((l) => l.slice(1, -1).trim()), ['FRI 25 SEP 2026', '─'.repeat(31), 'NEW YORK', '─'.repeat(31), 'UTC−04:00 · EDT · DST']);
		assert.ok(info[1]!.startsWith('├') && info[1]!.endsWith('┤'));
		assert.ok(lines[23]!.startsWith('╭─ zones ─'));
		assert.ok(lines[24]!.startsWith('│ ★ T0  SAO PAULO'));
		assert.ok(lines[25]!.startsWith('│ ▸ T1  NEW YORK     −04:00     −1h   9:08:36 PM  FRI 25      DST'));
		// Atalhos fora da caixa, centralizados, com uma linha em branco antes e depois.
		assert.ok(lines[36]!.startsWith('╰─') && !lines[36]!.includes('q sair'));
		assert.equal(lines[37]!.trim(), '');
		assert.equal(lines[39]!.trim(), '');
		const footer = '↑↓ zona  ·  ←→ favorito  ·  f favoritar  ·  d DST  ·  z zonas  ·  t 12/24  ·  q sair';
		assert.equal(lines[38]!.trim(), footer);
		assert.ok(Math.abs(lines[38]!.indexOf('↑') - (140 - lines[38]!.trimEnd().length)) <= 1);
	});

	it('mapa na maior área proporcional, centralizado no painel', () => {
		const lines = screen(defaultConfig(), 1, 140, 40);
		assert.equal(rulerWidth(lines), 57); // 12 linhas de mapa × 4,8
		// Painel do mapa: borda em 33 (depois das 33 colunas do analógico) e em 139.
		const ruler = lines.find((l) => l.includes('┴'))!;
		const left = ruler.indexOf('┴') - 34;
		const right = 138 - ruler.lastIndexOf('─');
		assert.ok(Math.abs(left - right) <= 1, `${left} × ${right}`);
	});

	it('zonas ocultas: o mapa cresce na altura, o analógico fica fixo e centralizado', () => {
		const lines = screen(hidden(), 1, 140, 40);
		assertFills(lines, 140, 40);
		assert.ok(!lines.some((l) => l.includes('╭─ zones')));
		assert.ok(rulerWidth(lines) > 57);
		const sixty = lines.findIndex((l) => l.includes('60⠀'));
		assert.equal(sixty, 1 + Math.floor((30 - 2 - 14) / 2)); // 14 linhas no meio de 28
		assert.ok(lines[30]!.includes('╭─ digital ─'));
		assert.ok(lines[38]!.includes('z zonas')); // atalhos embaixo
	});

	it('70 colunas: um painel só em cima, m troca qual, e o digital leva a info', () => {
		const map = screen(defaultConfig(), 1, 70, 40, 'map');
		assertFills(map, 70, 40);
		assert.ok(map[0]!.startsWith('╭─ map ─') && !map[0]!.includes('analog'));
		assert.ok(map[38]!.includes('m mapa/analógico'));
		assert.ok(map[16]!.startsWith('╭─ digital ─'));
		assert.equal(map[17]!.slice(1, -1).trim(), 'T1 · NEW YORK · UTC−04:00 · EDT · DST');
		const analog = screen(defaultConfig(), 1, 70, 40, 'analog');
		assert.ok(analog[0]!.startsWith('╭─ analog ─') && !analog[0]!.includes('map'));
		const row = analog.find((l) => l.includes('60⠀'))!;
		const left = row.indexOf('⠀') - 1;
		assert.ok(Math.abs(left - (70 - 2 - 31 - left)) <= 1); // centralizado na linha toda
	});

	it('80×20: sem espaço para as zonas, fica o mapa (prioridade maior)', () => {
		const lines = screen(defaultConfig(), 1, 80, 20);
		assertFills(lines, 80, 20);
		assert.ok(lines[0]!.startsWith('╭─ map ─'));
		assert.ok(!lines.some((l) => l.includes('╭─ zones') || l.includes('╭─ analog')));
		assert.ok(!lines[18]!.includes('m mapa'));
	});

	it('pouca altura: só info + digital, centralizados, e os atalhos embaixo', () => {
		const lines = screen(defaultConfig(), 1, 100, 14);
		assertFills(lines, 100, 14);
		assert.ok(lines[2]!.startsWith('╭─ T1 ─') && lines[2]!.includes('╭─ digital ─'));
		assert.ok(lines[8]!.startsWith('╰───') && !lines[8]!.includes('q sair'));
		assert.ok(lines[12]!.includes('q sair'));
	});

	it('catálogo sem as favoritas, e a seleção nele mexe no relógio e no mapa', () => {
		const table = screen(defaultConfig(), 0, 140, 80).filter((l) => /^│ [★▸ ] (T\d|·) /.test(l));
		assert.equal(table.length, 5 + 34); // favoritos + catálogo (39 − 5 que já são favoritas)
		assert.equal(table.filter((l) => l.includes('NEW YORK')).length, 1);
		assert.equal(table.filter((l) => /S[AÃ]O PAULO/.test(l)).length, 1);
		const lines = screen(defaultConfig(), 5, 140, 40); // o primeiro do catálogo
		assert.ok(lines.some((l) => l.startsWith('│ ▸ ·   PAGO PAGO')));
		assert.ok(lines[16]!.startsWith('╭─ zone ─'));
		assert.ok(lines[19]!.includes('PAGO PAGO'));
		assert.ok(lines[14]!.includes('·'));
	});

	it('DST forçado: indicador na tabela e no digital, sem a abreviação da IANA', () => {
		const config = { ...defaultConfig(), slots: defaultConfig().slots.map((s, i) => (i === 0 ? { ...s, dst: 'off' as const } : s)) };
		const lines = screen(config, 1, 140, 40);
		assert.equal(lines[21]!.slice(1, 32).trim(), 'UTC−05:00 · STD*');
		assert.ok(lines[25]!.includes('−05:00     −2h   8:08:36 PM  FRI 25      STD*'));
	});

	it('aviso no lugar dos atalhos', () => {
		const lines = screen(defaultConfig(), 0, 140, 40, 'map', 'T0 é a zona local; não sai dos favoritos');
		assert.ok(lines[38]!.includes(' T0 é a zona local; não sai dos favoritos '));
		assert.ok(!lines[38]!.includes('q sair'));
	});

	it('24h: sem AM/PM', () => {
		const lines = screen({ ...defaultConfig(), clock: '24h' }, 1, 140, 40);
		assert.ok(!lines.slice(16, 23).join('').includes('PM'));
		assert.ok(lines[25]!.includes('21:08:36'));
	});

	it('lista rola para manter a seleção visível, contando o separador', () => {
		const lines = screen(defaultConfig(), 30, 140, 40); // bem no meio do catálogo
		assertFills(lines, 140, 40);
		assert.ok(lines.slice(24, 36).some((l) => l.startsWith('│ ▸ ·')));
		assert.ok(!lines.some((l) => l.includes('T0  SAO PAULO')));
		const last = screen(defaultConfig(), 38, 140, 40); // último do catálogo
		assert.ok(last[35]!.startsWith('│ ▸ ·   KIRITIMATI'));
	});

	it('zona desconhecida selecionada: relógios apagados, sem quebrar', () => {
		const config = { ...defaultConfig(), slots: [{ code: 'TYO', zone: 'Asia/Tokio', dst: 'auto' as const }] };
		const lines = screen(config, 1, 140, 40);
		assertFills(lines, 140, 40);
		assert.equal(lines[19]!.slice(1, 32).trim(), 'TOKIO');
		assert.equal(lines[21]!.slice(1, 32).trim(), 'zona desconhecida');
	});

	it('terminal pequeno cai na tabela só dos favoritos', () => {
		for (const [cols, rows] of [[59, 40], [140, 6]] as const) {
			const lines = screen(defaultConfig(), 1, cols, rows);
			assert.equal(lines[0], 'T0  SAO PAULO  −03:00  local  10:08 PM  FRI 25');
			assert.equal(lines.length, 5 + 2);
			assert.ok(lines.at(-1)!.includes('amplie o terminal'));
		}
	});
});

describe('toggleFavorite', () => {
	it('favorita do catálogo, persiste e desfavorita renumerando', () => {
		const path = join(mkdtempSync(join(tmpdir(), 'timan-')), 'config.json');
		const added = toggleFavorite(defaultConfig(), LOCAL, AT, 5).config!; // PAGO PAGO
		assert.deepEqual(added.slots.at(-1), { code: 'PAG', zone: 'Pacific/Pago_Pago', dst: 'auto', name: 'PAGO PAGO' });
		saveConfig(path, added);
		assert.deepEqual(loadConfig(path), added);

		const removed = toggleFavorite(added, LOCAL, AT, 2).config!; // T2 LONDON sai, TOKYO vira T2
		assert.deepEqual(removed.slots.map((s) => s.code), ['NYC', 'TYO', 'HKG', 'PAG']);
	});

	it('T0 protegido e limite de slots, com aviso e sem config novo', () => {
		assert.deepEqual(toggleFavorite(defaultConfig(), LOCAL, AT, 0), { notice: 'T0 é a zona local; não sai dos favoritos' });
		let full = defaultConfig();
		while (full.slots.length < 9) full = toggleFavorite(full, LOCAL, AT, full.slots.length + 1).config!;
		assert.deepEqual(toggleFavorite(full, LOCAL, AT, 10), { notice: 'limite de 9 favoritos' });
	});
});

describe('cycleDst', () => {
	it('cicla favoritos com DST, inclusive o T0', () => {
		const on = cycleDst(defaultConfig(), LOCAL, AT, 1).config!;
		assert.equal(on.slots[0]!.dst, 'on');
		assert.equal(cycleDst(on, LOCAL, AT, 1).config!.slots[0]!.dst, 'off');
		assert.equal(cycleDst(defaultConfig(), 'America/New_York', AT, 0).config!.local_dst, 'on');
	});

	it('sem efeito no catálogo e em zona sem DST', () => {
		assert.equal(cycleDst(defaultConfig(), LOCAL, AT, 5).notice, 'DST só em favoritos (f para favoritar)');
		assert.equal(cycleDst(defaultConfig(), LOCAL, AT, 3).notice, 'TOKYO: sem horário de verão');
		assert.equal(cycleDst(defaultConfig(), LOCAL, AT, 0).config, undefined); // São Paulo não tem DST
	});
});

// Tela inteira, sem cor. Atualizar com: npm run test:update
describe('snapshots', () => {
	for (const [cols, rows] of [[80, 24], [100, 30], [140, 40], [200, 50]] as const) {
		for (const show of [true, false]) {
			it(`${cols}×${rows} zonas ${show ? 'visíveis' : 'ocultas'}`, (t) => {
				const config = show ? defaultConfig() : hidden();
				const lines = screen(config, 1, cols, rows);
				assertFills(lines, cols, rows);
				t.assert.snapshot(lines.join('\n'));
			});
		}
	}
});
