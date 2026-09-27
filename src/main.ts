#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runCalibration } from './calibrate.ts';
import { type Config, ConfigError, UsageError, configPath, loadConfig } from './config.ts';
import { DIGITAL_INFO_ROWS, renderDigital } from './digital.ts';
import { panel } from './panel.ts';
import { buildRows, renderTable } from './table.ts';
import { localZone } from './time.ts';
import { runTui } from './tui.ts';

const USAGE = `uso:
  timan                       relógio mundial (TUI; tabela em pipe ou terminal < 60 colunas)
  timan --demo digital        mostra só o painel digital (para ajuste visual)
  timan --demo analog         calibra a proporção da célula: +/− ajusta, enter salva, esc sai
  timan --version             mostra a versão

teclas na TUI:
  ↑/↓        seleção na tabela (favoritos e catálogo)
  ←/→        favorito anterior/próximo
  f, espaço  favorita/desfavorita a zona selecionada (T0 fica)
  d          DST do favorito: auto → on → off
  z          mostra/oculta o painel de zonas
  m          mapa ↔ analógico, quando não cabem os dois lado a lado
  t          12/24h
  q, Ctrl+C  sai`;

// package.json fica um nível acima tanto de src/ quanto de dist/.
function version(): string {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
	return pkg.version;
}

function printTable(config: Config): void {
	const rows = buildRows(config, localZone(), new Date());
	for (const r of rows) {
		if (!r.time) console.error(`timan: aviso: ${r.ref} "${r.zone}": zona desconhecida`);
	}
	console.log(renderTable(rows, config.clock, !process.stdout.isTTY));
}

// Painel digital isolado, uma vez, na largura do terminal: T1 (ou T0, sem slots).
function demoDigital(config: Config): void {
	const rows = buildRows(config, localZone(), new Date());
	const row = rows[1] ?? rows[0]!;
	const width = process.stdout.columns || 80;
	const body = renderDigital(row, { clock: config.clock, at: new Date(), width: width - 2, info: true });
	console.log(panel('digital', body, width, DIGITAL_INFO_ROWS + 2).join('\n'));
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
	if (values.demo !== undefined) {
		const path = configPath();
		if (values.demo === 'digital') return demoDigital(loadConfig(path));
		if (values.demo !== 'analog') throw new UsageError(`demo desconhecida: ${values.demo} (use digital ou analog)`);
		if (!process.stdout.isTTY || !process.stdin.isTTY) throw new UsageError('--demo analog precisa de um terminal interativo');
		return runCalibration(loadConfig(path), path);
	}

	if (positionals.length) throw new UsageError(`comando desconhecido: ${positionals[0]}\n\n${USAGE}`);

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
