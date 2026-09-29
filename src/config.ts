import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ASPECT_MAX, ASPECT_MIN } from './aspect.ts';
import { type Clock, DST_MODES, type DstMode, normalizeZone } from './time.ts';

// T0 é sempre a zona local do sistema e não é gravado; slots são T1..T9 por posição.
export interface Slot {
	code: string;
	zone: string;
	name?: string;
	dst: DstMode;
}

export interface Config {
	version: 1;
	clock: Clock;
	local_name?: string;
	local_dst?: DstMode; // override de DST do T0; ausente = auto
	slots: Slot[];
	// cellAspect: k calibrado (aspect.ts); ausente = pergunta ao terminal.
	ui: { showZones: boolean; cellAspect?: number };
}

export const MAX_SLOTS = 9;

export function defaultConfig(): Config {
	return {
		version: 1,
		clock: '12h',
		slots: [
			{ code: 'NYC', zone: 'America/New_York', dst: 'auto' },
			{ code: 'LON', zone: 'Europe/London', dst: 'auto' },
			{ code: 'TYO', zone: 'Asia/Tokyo', dst: 'auto' },
			{ code: 'HKG', zone: 'Asia/Hong_Kong', dst: 'auto' },
		],
		ui: { showZones: true },
	};
}

// Config ilegível ou inválido: exit 1.
export class ConfigError extends Error {}
// Argumentos errados: exit 2.
export class UsageError extends Error {}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
	const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
	return join(base, 'timan', 'config.json');
}

// Cria o arquivo com os defaults só se ele não existir; nunca sobrescreve um existente.
export function loadConfig(path: string): Config {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw new ConfigError(`${path}: ${(err as Error).message}`);
		const config = defaultConfig();
		saveConfig(path, config);
		return config;
	}

	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (err) {
		const msg = (err as Error).message;
		const pos = /\(line (\d+) column (\d+)\)/.exec(msg);
		const where = pos ? `${path}:${pos[1]}:${pos[2]}` : path;
		throw new ConfigError(`${where}: ${msg.replace(/\s*\(line \d+ column \d+\)/, '')}`);
	}
	return validate(data, path);
}

// Estrito na estrutura. A zona de cada slot não é checada aqui: zona desconhecida
// derruba só a própria linha (quem exibe avisa). Campos novos (dst, local_dst, ui)
// são opcionais no arquivo: ausentes viram o padrão, e o próximo save grava a forma completa.
function validate(data: unknown, path: string): Config {
	const fail = (what: string) => new ConfigError(`${path}: ${what}`);
	if (!isObject(data)) throw fail('expected a JSON object');
	if (data.version !== 1) throw fail(`version ${JSON.stringify(data.version)} not supported`);
	if (data.clock !== '12h' && data.clock !== '24h') throw fail('clock must be "12h" or "24h"');
	if (data.local_name !== undefined && typeof data.local_name !== 'string') throw fail('local_name must be a string');
	if (data.local_dst !== undefined && !isDstMode(data.local_dst)) throw fail(DST_ERROR.replace('dst', 'local_dst'));
	if (data.ui !== undefined && (!isObject(data.ui) || (data.ui.showZones !== undefined && typeof data.ui.showZones !== 'boolean'))) {
		throw fail('ui must be {"showZones": true | false}');
	}
	const aspect = isObject(data.ui) ? data.ui.cellAspect : undefined;
	if (aspect !== undefined && (typeof aspect !== 'number' || !(aspect >= ASPECT_MIN && aspect <= ASPECT_MAX))) {
		throw fail(`ui.cellAspect must be a number between ${ASPECT_MIN} and ${ASPECT_MAX}`);
	}
	if (!Array.isArray(data.slots)) throw fail('slots must be a list');
	if (data.slots.length > MAX_SLOTS) throw fail(`at most ${MAX_SLOTS} slots`);

	const slots = data.slots.map((s: unknown, i): Slot => {
		const ref = `T${i + 1}`;
		if (!isObject(s) || typeof s.code !== 'string' || typeof s.zone !== 'string') {
			throw fail(`${ref}: expected {"code": "...", "zone": "..."}`);
		}
		if (s.name !== undefined && typeof s.name !== 'string') throw fail(`${ref}: name must be a string`);
		if (s.dst !== undefined && !isDstMode(s.dst)) throw fail(`${ref}: ${DST_ERROR}`);
		return { code: s.code, zone: s.zone, ...(s.name !== undefined && { name: s.name }), dst: s.dst ?? 'auto' };
	});

	return {
		version: 1,
		clock: data.clock,
		...(data.local_name !== undefined && { local_name: data.local_name }),
		...(data.local_dst !== undefined && { local_dst: data.local_dst }),
		slots,
		ui: {
			showZones: isObject(data.ui) && data.ui.showZones === false ? false : true,
			...(typeof aspect === 'number' && { cellAspect: aspect }),
		},
	};
}

const DST_ERROR = 'dst must be "auto", "on" or "off"';

function isDstMode(v: unknown): v is DstMode {
	return DST_MODES.includes(v as DstMode);
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Grava em arquivo temporário e renomeia, para nunca deixar um config pela metade.
export function saveConfig(path: string, config: Config): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(config, null, '\t') + '\n');
	renameSync(tmp, path);
}

function checkSlot(config: Config, code: string, zone: string): Slot {
	const upper = code.toUpperCase();
	if (!/^[A-Z]{2,4}$/.test(upper)) throw new UsageError(`invalid code: ${code} (2 to 4 letters)`);
	const dup = config.slots.findIndex((s) => s.code.toUpperCase() === upper);
	if (dup !== -1) throw new UsageError(`code ${upper} already used by T${dup + 1}`);
	const normalized = normalizeZone(zone);
	if (!normalized) throw new UsageError(`unknown zone: ${zone}`);
	return { code: upper, zone: normalized, dst: 'auto' };
}

// As funções abaixo não mutam: devolvem um novo Config.

export function addSlot(config: Config, code: string, zone: string): Config {
	if (config.slots.length >= MAX_SLOTS) throw new UsageError(`slot limit of ${MAX_SLOTS} reached`);
	return { ...config, slots: [...config.slots, checkSlot(config, code, zone)] };
}

// Remove e compacta: com T1..T4, rm T3 faz T4 virar T3.
export function removeSlot(config: Config, n: number): Config {
	if (n > config.slots.length) throw new UsageError(`T${n} does not exist`);
	return { ...config, slots: config.slots.filter((_, i) => i !== n - 1) };
}

// Código de 3 letras derivado do nome, sem acento: SÃO PAULO → SAO, ST. JOHN'S → STJ.
// Em colisão, primeira letra + duas outras em ordem; por fim, duas letras + A..Z.
export function favoriteCode(name: string, taken: readonly string[]): string {
	const used = new Set(taken.map((c) => c.toUpperCase()));
	const l = name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z]/g, '').padEnd(2, 'X');
	const candidates = [l.slice(0, 3)];
	for (let a = 1; a < l.length; a++) for (let b = a + 1; b < l.length; b++) candidates.push(l[0]! + l[a]! + l[b]!);
	for (let c = 65; c <= 90; c++) candidates.push(l.slice(0, 2) + String.fromCharCode(c));
	return candidates.find((c) => c.length >= 2 && !used.has(c))!;
}

// Favorita uma zona no próximo slot livre, com o nome dado (o do catálogo).
export function addFavorite(config: Config, zone: string, name: string): Config {
	const added = addSlot(config, favoriteCode(name, config.slots.map((s) => s.code)), zone);
	const slots = [...added.slots];
	slots[slots.length - 1] = { ...slots.at(-1)!, name: name.normalize('NFC') };
	return { ...added, slots };
}

// Override de DST do Tn (T0 = local_dst, omitido quando auto).
export function setDst(config: Config, n: number, mode: DstMode): Config {
	if (n === 0) {
		const { local_dst: _, ...rest } = config;
		return mode === 'auto' ? rest : { ...rest, local_dst: mode };
	}
	if (n > config.slots.length) throw new UsageError(`T${n} does not exist`);
	return { ...config, slots: config.slots.map((s, i) => (i === n - 1 ? { ...s, dst: mode } : s)) };
}

// auto → on → off → auto.
export function nextDst(mode: DstMode): DstMode {
	return DST_MODES[(DST_MODES.indexOf(mode) + 1) % DST_MODES.length]!;
}
