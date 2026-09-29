import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { uptime } from 'node:os';

// Linha embaixo do digital, em alusão ao "10 YEAR BATTERY" impresso no AE-1200WH:
//   87% · 4 HOUR BATTERY         descarregando, com estimativa
//   87% BATTERY · CHARGING       carregando (ou · AC POWER, na tomada sem carregar)
//   12 DAY UPTIME                sem bateria (desktop) ou sem como ler: o uptime no lugar
// A leitura é assíncrona e esporádica; a tela só formata o último valor.

export type Battery = { kind: 'battery'; percent: number; state: 'discharging' | 'charging' | 'ac'; minutes?: number };
export type Power = Battery | { kind: 'uptime'; seconds: number };

// "10 YEAR" / "4 HOUR" / "35 MINUTE": a maior unidade inteira, no singular como no relógio.
function span(seconds: number): string {
	const units: [string, number][] = [
		['YEAR', 365 * 86400],
		['DAY', 86400],
		['HOUR', 3600],
		['MINUTE', 60],
	];
	for (const [name, size] of units) if (seconds >= size) return `${Math.floor(seconds / size)} ${name}`;
	return '0 MINUTE';
}

export function powerLine(p: Power | undefined): string {
	if (!p) return '';
	if (p.kind === 'uptime') return `${span(p.seconds)} UPTIME`;
	const pct = `${Math.round(p.percent)}%`;
	if (p.state === 'charging') return `${pct} BATTERY · CHARGING`;
	if (p.state === 'ac') return `${pct} BATTERY · AC POWER`;
	return p.minutes !== undefined ? `${pct} · ${span(p.minutes * 60)} BATTERY` : `${pct} BATTERY`;
}

// macOS, `pmset -g batt`:
//   -InternalBattery-0 (id=…)	87%; discharging; 4:32 remaining present: true
export function parsePmset(out: string): Battery | undefined {
	const m = /(\d+)%;\s*([^;]+);\s*(?:(\d+):(\d+) remaining)?/.exec(out);
	if (!m) return undefined;
	const status = m[2]!.trim();
	const state = status === 'discharging' ? 'discharging' : status === 'charging' || status === 'finishing charge' ? 'charging' : 'ac';
	const minutes = m[3] !== undefined ? Number(m[3]) * 60 + Number(m[4]) : undefined;
	return { kind: 'battery', percent: Number(m[1]), state, ...(state === 'discharging' && minutes !== undefined && { minutes }) };
}

// Linux, /sys/class/power_supply/BAT*/: capacity e status; a estimativa sai de energia/potência
// (µWh/µW) ou carga/corrente (µAh/µA), o que o driver expuser.
export function parseSysfs(files: Record<string, string | undefined>): Battery | undefined {
	const percent = Number(files.capacity);
	if (!files.capacity || Number.isNaN(percent)) return undefined;
	const status = files.status?.trim();
	const state = status === 'Discharging' ? 'discharging' : status === 'Charging' ? 'charging' : 'ac';
	const num = (k: string) => (files[k] ? Number(files[k]) : undefined);
	const now = num('energy_now') ?? num('charge_now');
	const rate = num('power_now') ?? num('current_now');
	const minutes = state === 'discharging' && now && rate ? Math.round((now / rate) * 60) : undefined;
	return { kind: 'battery', percent, state, ...(minutes !== undefined && { minutes }) };
}

function run(cmd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => execFile(cmd, args, { timeout: 2000 }, (err, out) => (err ? reject(err) : resolve(out))));
}

async function readLinux(): Promise<Battery | undefined> {
	const base = '/sys/class/power_supply';
	for (const dir of await readdir(base)) {
		const read = (f: string) => readFile(`${base}/${dir}/${f}`, 'utf8').then((s) => s.trim(), () => undefined);
		if ((await read('type')) !== 'Battery') continue;
		const keys = ['capacity', 'status', 'energy_now', 'power_now', 'charge_now', 'current_now'];
		const values = await Promise.all(keys.map(read));
		return parseSysfs(Object.fromEntries(keys.map((k, i) => [k, values[i]])));
	}
	return undefined;
}

// Bateria, se houver e der para ler; senão o uptime. Nunca rejeita.
export async function readPower(): Promise<Power> {
	try {
		const p = process.platform === 'darwin' ? parsePmset(await run('pmset', ['-g', 'batt'])) : process.platform === 'linux' ? await readLinux() : undefined;
		if (p) return p;
	} catch {
		// sem pmset, sem sysfs: cai no uptime
	}
	return { kind: 'uptime', seconds: uptime() };
}
