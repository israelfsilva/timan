#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runCalibration } from './calibrate.ts';
import { type Config, ConfigError, UsageError, configPath, loadConfig } from './config.ts';
import { powerLine, readPower } from './battery.ts';
import { DIGITAL_ROWS, renderDigital } from './digital.ts';
import { panel } from './panel.ts';
import { buildRows, renderTable } from './table.ts';
import { localZone } from './time.ts';
import { runTui } from './tui.ts';

const USAGE = `usage:
  timan                  world clock (TUI; plain table when piped or under 60 columns)
  timan calibrate        fix the analog face's proportions: +/− adjust, enter saves, esc quits
  timan --version        print the version

keys in the TUI:
  ↑/↓        move through the list (favorites, then the catalog)
  ←/→        previous/next favorite
  f, space   add/remove the selected zone as a favorite (T0 stays)
  d          DST for a favorite: auto → on → off
  z          show/hide the zones panel
  m          map ↔ analog, when both don't fit side by side
  t          12/24h
  q, Ctrl+C  quit`;

// package.json fica um nível acima tanto de src/ quanto de dist/.
function version(): string {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
	return pkg.version;
}

function printTable(config: Config): void {
	const rows = buildRows(config, localZone(), new Date());
	for (const r of rows) {
		if (!r.time) console.error(`timan: warning: ${r.ref} "${r.zone}": unknown zone`);
	}
	console.log(renderTable(rows, config.clock, !process.stdout.isTTY));
}

// Painel digital isolado, uma vez, na largura do terminal: T1 (ou T0, sem slots).
async function demoDigital(config: Config): Promise<void> {
	const rows = buildRows(config, localZone(), new Date());
	const row = rows[1] ?? rows[0]!;
	const width = process.stdout.columns || 80;
	const body = renderDigital(row, { clock: config.clock, at: new Date(), width: width - 2, info: true, power: powerLine(await readPower()) });
	console.log(panel('digital', body, width, DIGITAL_ROWS + 2).join('\n'));
}

function run(argv: string[]): void {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }, demo: { type: 'string' } },
	});
	if (values.help) {
		console.log(USAGE);
		return;
	}
	if (values.version) {
		console.log(`timan ${version()}`);
		return;
	}
	// --demo digital: só o painel digital, para ajuste visual; fora do --help.
	if (values.demo !== undefined) {
		if (values.demo === 'analog') throw new UsageError('--demo analog is now: timan calibrate');
		if (values.demo !== 'digital') throw new UsageError(`unknown demo: ${values.demo} (use digital)`);
		return void demoDigital(loadConfig(configPath()));
	}

	if (positionals[0] === 'calibrate' && positionals.length === 1) {
		if (!process.stdout.isTTY || !process.stdin.isTTY) throw new UsageError('calibrate needs an interactive terminal');
		const path = configPath();
		return runCalibration(loadConfig(path), path);
	}
	if (positionals.length) throw new UsageError(`unknown command: ${positionals.join(' ')}\n\n${USAGE}`);

	// Favoritos e DST se editam na TUI (f, d); zonas fora do catálogo, direto no config.json.
	const path = configPath();
	const config = loadConfig(path);
	if (process.stdout.isTTY && process.stdin.isTTY && process.stdout.columns >= 60) runTui(config, path);
	else printTable(config);
}

try {
	run(process.argv.slice(2));
} catch (err) {
	// parseArgs lança TypeError com code ERR_PARSE_ARGS_* para opções inválidas.
	const parseError = String((err as NodeJS.ErrnoException).code ?? '').startsWith('ERR_PARSE_ARGS');
	if (err instanceof UsageError || parseError) {
		console.error(`timan: ${(err as Error).message}`);
		process.exitCode = 2;
	} else if (err instanceof ConfigError) {
		console.error(`timan: ${err.message}`);
		process.exitCode = 1;
	} else {
		throw err;
	}
}
