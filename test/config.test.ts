import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
	type Config,
	ConfigError,
	UsageError,
	addFavorite,
	addSlot,
	configPath,
	defaultConfig,
	favoriteCode,
	loadConfig,
	nextDst,
	removeSlot,
	saveConfig,
	setDst,
} from '../src/config.ts';

function tempPath(): string {
	return join(mkdtempSync(join(tmpdir(), 'timan-')), 'timan', 'config.json');
}

const codes = (c: { slots: { code: string }[] }) => c.slots.map((s) => s.code);

describe('configPath', () => {
	it('respeita XDG_CONFIG_HOME', () => {
		assert.equal(configPath({ XDG_CONFIG_HOME: '/x' }), '/x/timan/config.json');
	});

	it('usa ~/.config sem XDG_CONFIG_HOME', () => {
		assert.match(configPath({}), /\/\.config\/timan\/config\.json$/);
	});
});

describe('loadConfig', () => {
	it('cria os defaults na primeira execução', () => {
		const path = tempPath();
		assert.deepEqual(loadConfig(path), defaultConfig());
		assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), defaultConfig());
	});

	it('lê o que foi salvo', () => {
		const path = tempPath();
		const config = { ...defaultConfig(), clock: '24h' as const, local_name: 'SÃO PAULO' };
		saveConfig(path, config);
		assert.deepEqual(loadConfig(path), config);
	});

	it('JSON corrompido é erro com linha e coluna, e o arquivo não é tocado', () => {
		const path = tempPath();
		saveConfig(path, defaultConfig());
		const broken = '{\n\t"version": 1,\n}\n';
		writeFileSync(path, broken);
		assert.throws(() => loadConfig(path), (err: Error) => {
			assert.ok(err instanceof ConfigError);
			assert.ok(err.message.startsWith(`${path}:3:1: `), err.message);
			return true;
		});
		assert.equal(readFileSync(path, 'utf8'), broken);
	});

	it('estrutura inválida é erro', () => {
		const path = tempPath();
		saveConfig(path, defaultConfig());
		writeFileSync(path, JSON.stringify({ version: 2, clock: '12h', slots: [] }));
		assert.throws(() => loadConfig(path), ConfigError);
		writeFileSync(path, JSON.stringify({ version: 1, clock: '12h', slots: [{ code: 'X' }] }));
		assert.throws(() => loadConfig(path), /T1/);
	});

	it('zona desconhecida não é erro de config', () => {
		const path = tempPath();
		const config: Config = { ...defaultConfig(), slots: [{ code: 'TYO', zone: 'Asia/Tokio', dst: 'auto' }] };
		saveConfig(path, config);
		assert.deepEqual(loadConfig(path), config);
	});

	it('config antigo, sem dst e sem ui, carrega com os padrões e não é reescrito', () => {
		const path = tempPath();
		saveConfig(path, defaultConfig());
		const old = JSON.stringify({ version: 1, clock: '12h', slots: [{ code: 'NYC', zone: 'America/New_York' }] });
		writeFileSync(path, old);
		const config = loadConfig(path);
		assert.deepEqual(config.slots, [{ code: 'NYC', zone: 'America/New_York', dst: 'auto' }]);
		assert.deepEqual(config.ui, { showZones: true });
		assert.equal(config.local_dst, undefined);
		assert.equal(readFileSync(path, 'utf8'), old);
	});

	it('ida e volta com dst, local_dst e ui', () => {
		const path = tempPath();
		const config: Config = {
			...defaultConfig(),
			local_dst: 'off',
			slots: [{ code: 'SYD', zone: 'Australia/Sydney', dst: 'on' }],
			ui: { showZones: false, cellAspect: 1.15 },
		};
		saveConfig(path, config);
		assert.deepEqual(loadConfig(path), config);
	});

	it('dst, local_dst e ui inválidos são erro', () => {
		const path = tempPath();
		saveConfig(path, defaultConfig());
		const base = { version: 1, clock: '12h', slots: [{ code: 'NYC', zone: 'America/New_York' }] };
		for (const [bad, msg] of [
			[{ ...base, slots: [{ ...base.slots[0], dst: 'yes' }] }, /T1: dst deve ser/],
			[{ ...base, local_dst: true }, /local_dst deve ser/],
			[{ ...base, ui: { showZones: 'no' } }, /ui deve ser/],
			[{ ...base, ui: [] }, /ui deve ser/],
			[{ ...base, ui: { cellAspect: '1.2' } }, /cellAspect deve ser/],
			[{ ...base, ui: { cellAspect: 3 } }, /cellAspect deve ser/],
		] as const) {
			writeFileSync(path, JSON.stringify(bad));
			assert.throws(() => loadConfig(path), msg);
		}
	});
});

describe('slots', () => {
	it('add acrescenta no fim, com código em maiúsculas e ID como digitado', () => {
		const c = addSlot(defaultConfig(), 'bom', 'Asia/Kolkata');
		assert.deepEqual(c.slots.at(-1), { code: 'BOM', zone: 'Asia/Kolkata', dst: 'auto' });
	});

	it('add valida código, duplicata, zona e limite', () => {
		const c = defaultConfig();
		assert.throws(() => addSlot(c, 'X', 'Asia/Tokyo'), /código inválido/);
		assert.throws(() => addSlot(c, 'lon', 'Europe/Paris'), /já usado em T2/);
		assert.throws(() => addSlot(c, 'PAR', 'Europe/Pariss'), /zona desconhecida/);
		assert.throws(() => addSlot(c, 'OFF', '+03:00'), /zona desconhecida/);
		let full = c;
		for (const code of ['AA', 'BB', 'CC', 'DD', 'EE']) full = addSlot(full, code, 'UTC');
		assert.equal(full.slots.length, 9);
		assert.throws(() => addSlot(full, 'FF', 'UTC'), /limite/);
	});

	it('rm compacta', () => {
		assert.deepEqual(codes(removeSlot(defaultConfig(), 3)), ['NYC', 'LON', 'HKG']);
		assert.throws(() => removeSlot(defaultConfig(), 5), /T5 não existe/);
	});

	it('não muta o config original', () => {
		const c = defaultConfig();
		addSlot(c, 'PAR', 'Europe/Paris');
		removeSlot(c, 1);
		assert.deepEqual(c, defaultConfig());
	});
});

describe('favoritos', () => {
	it('código derivado do nome, sem acento, único', () => {
		assert.equal(favoriteCode('SÃO PAULO', []), 'SAO');
		assert.equal(favoriteCode("ST. JOHN'S", []), 'STJ');
		assert.equal(favoriteCode('LOS ANGELES', ['LOS']), 'LOA');
		assert.equal(favoriteCode('UTC', ['UTC']), 'UTA');
		assert.equal(favoriteCode('NOUMÉA', ['nou']), 'NOM');
	});

	it('addFavorite ocupa o próximo slot com o nome do catálogo', () => {
		const c = addFavorite(defaultConfig(), 'America/Sao_Paulo', 'SÃO PAULO');
		assert.deepEqual(c.slots.at(-1), { code: 'SAO', zone: 'America/Sao_Paulo', dst: 'auto', name: 'SÃO PAULO' });
		assert.equal(c.slots.length, 5);
	});
});

describe('setDst e nextDst', () => {
	it('slot e T0; T0 em auto não grava local_dst', () => {
		assert.equal(setDst(defaultConfig(), 2, 'on').slots[1]!.dst, 'on');
		assert.equal(setDst(defaultConfig(), 0, 'off').local_dst, 'off');
		assert.ok(!('local_dst' in setDst({ ...defaultConfig(), local_dst: 'on' }, 0, 'auto')));
		assert.throws(() => setDst(defaultConfig(), 9, 'on'), UsageError);
	});

	it('auto → on → off → auto', () => {
		assert.deepEqual([nextDst('auto'), nextDst('on'), nextDst('off')], ['on', 'off', 'auto']);
	});
});
