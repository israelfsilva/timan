import { ANALOG_WIDTH, analogRows, renderAnalog } from './analog.ts';
import { queryCellSize, takeCellSize } from './aspect.ts';
import { type Config, MAX_SLOTS, addFavorite, nextDst, removeSlot, saveConfig, setDst } from './config.ts';
import { type Power, powerLine, readPower } from './battery.ts';
import { DIGITAL_BLOCK, DIGITAL_ROWS, infoTitle, renderDigital, renderInfo } from './digital.ts';
import { besides, panel } from './panel.ts';
import { CATALOG_REF, type Row, tableLines, zoneList } from './table.ts';
import { paint, visibleWidth } from './theme.ts';
import { dstOffsets, localZone, modernZone } from './time.ts';
import { mapSize, renderMap } from './worldmap.ts';

// Tela estilo btop, ocupando o terminal inteiro:
//   ╭─ analog ─╮╭─ map ─────────────────╮   linha 1: analógico fixo + mapa flexível
//   ╰──────────╯╰───────────────────────╯
//   ╭─ T1 ─────╮╭─ digital ────────────╮   linha 2: info fixo + digital flexível, altura fixa (sem o info, o digital o absorve)
//   ╰──────────╯╰──────────────────────╯
//   ╭─ zones ──────────────────────────╮   linha 3: o resto da altura
//   ╰──────────────────────────────────╯
//                                              (linha em branco)
//         ↑↓ zona  ·  ←→ favorito  ·  …        atalhos (ou aviso), centralizados
//                                              (linha em branco)
// Prioridade quando falta espaço: digital > mapa > zonas > analógico.
const ANALOG_PANEL = ANALOG_WIDTH + 2;
const ZONES_MIN = 3 + 2; // 3 linhas úteis + bordas
const FOOTER_ROWS = 3; // os atalhos com uma linha em branco antes e depois
const MAP_MIN_COLS = 36; // largura útil mínima do painel do mapa ao lado do analógico
const MAP_ROW_MIN = 10; // linha 1 só com o mapa: 6 linhas de mapa + régua + índices + bordas
const MIN_COLS = 60;
const INFO_MIN_COLS = ANALOG_PANEL + DIGITAL_BLOCK + 2; // info ao lado do digital

// O que a tecla m alterna quando o analógico e o mapa não cabem lado a lado.
export type Face = 'map' | 'analog';

export interface TuiState {
	config: Config;
	selected: number; // índice em zoneList: favoritos (0 = T0) e depois o catálogo
	face: Face; // painel da linha 1 quando só cabe um
	aspect: number; // k da célula (aspect.ts): config, resposta do terminal ou 1
	notice?: string; // aviso breve no lugar dos atalhos
	power?: Power; // última leitura da bateria (ou uptime), embaixo do digital
}

export interface Layout {
	topRows: number; // altura da linha 1 (0 = sem linha 1)
	analog: boolean;
	map: boolean;
	toggle: boolean; // só um dos dois por falta de largura: m alterna (por falta de altura, só o mapa)
	info: boolean; // painel de info ao lado do digital; sem ele, o digital mostra a info
	zonesRows: number; // altura do painel de zonas (0 = sem painel)
	padTop: number; // folga acima quando sobra altura (só o digital na tela)
}

const DIGITAL_PANEL = DIGITAL_ROWS + 2; // altura da linha 2, com ou sem o info ao lado

// Painéis para o tamanho do terminal, ou undefined para cair na tabela simples.
// Altura: as zonas encolhem até 3 linhas úteis; depois sai o analógico (a linha 1
// fica só com o mapa, de altura flexível); depois saem as zonas; por fim, a linha 1.
// Largura: sem espaço para o analógico + MAP_MIN_COLS, a linha 1 mostra só `face`.
// A linha 1 com o analógico tem a altura dele para o k da célula, mais as bordas.
export function computeLayout(
	cols: number,
	rows: number,
	view: { face: Face; showZones: boolean; aspect: number },
): Layout | undefined {
	const info = cols >= INFO_MIN_COLS;
	if (cols < MIN_COLS || rows < DIGITAL_PANEL + FOOTER_ROWS) return undefined;
	const TOP_ROWS = analogRows(view.aspect) + 2;
	const free = rows - FOOTER_ROWS - DIGITAL_PANEL;
	const zonesMin = view.showZones ? ZONES_MIN : 0;
	const wide = cols >= ANALOG_PANEL + MAP_MIN_COLS + 2;

	let top = 0;
	let analog = false;
	let map = false;
	let toggle = false;
	if (free - zonesMin >= TOP_ROWS) {
		top = view.showZones ? TOP_ROWS : free;
		analog = wide || view.face === 'analog';
		map = wide || view.face === 'map';
		toggle = !wide;
	} else if (free - zonesMin >= MAP_ROW_MIN) {
		top = free - zonesMin;
		map = true;
	} else if (free >= MAP_ROW_MIN) {
		top = free;
		map = true;
	}
	const zonesRows = view.showZones && free - top >= ZONES_MIN ? free - top : 0;
	return {
		topRows: top,
		analog,
		map,
		toggle,
		info,
		zonesRows,
		padTop: Math.floor((free - top - zonesRows) / 2),
	};
}

function padTo(s: string, width: number): string {
	return s + ' '.repeat(Math.max(0, width - visibleWidth(s)));
}

function truncate(s: string, width: number): string {
	return s.length > width ? s.slice(0, width - 1) + '…' : s;
}

// Atalhos em ordem de exibição, com a prioridade de cada um (menor = some por último).
// Sem o painel de zonas, o z é a volta e fica logo depois do q; ↑↓ não faz nada.
function shortcuts(layout: Layout): [string, number][] {
	const zones = layout.zonesRows > 0;
	const items: [string, number | undefined][] = [
		['↑↓ zone', zones ? 1 : undefined],
		['←→ favorite', 2],
		['f favorite', zones ? 4 : 6],
		['d DST', 5],
		['z zones', zones ? 6 : 1],
		['m map/analog', layout.toggle ? 3 : undefined],
		['t 12/24', 7],
		['q quit', 0],
	];
	return items.filter((i): i is [string, number] => i[1] !== undefined);
}

// Cabe em `max` colunas: primeiro afrouxa o separador, depois tira os de menor prioridade.
export function fitFooter(items: [string, number][], max: number): string {
	let kept = items;
	for (;;) {
		for (const sep of ['  ·  ', ' · ']) {
			const text = kept.map(([s]) => s).join(sep);
			if (text.length <= max) return text;
		}
		if (kept.length <= 1) return truncate(kept[0]?.[0] ?? '', max);
		const drop = Math.max(...kept.map(([, p]) => p));
		kept = kept.filter(([, p]) => p !== drop);
	}
}

// Linha dos atalhos, embaixo da tela: o aviso, se houver, ou os atalhos que couberem, centralizados.
function footerLine(state: TuiState, layout: Layout, cols: number): string {
	const max = cols - 2;
	const text = state.notice ? truncate(state.notice, max) : fitFooter(shortcuts(layout), max);
	const left = Math.floor((cols - text.length) / 2);
	return ' '.repeat(left) + paint(text, { fg: 'secondary' }) + ' '.repeat(cols - left - text.length);
}

// Separador entre os favoritos e o catálogo.
function separator(width: number): string {
	const label = ' all zones ';
	const left = Math.floor((width - label.length) / 2);
	return paint('─'.repeat(left), { fg: 'border' }) + paint(label, { fg: 'secondary' }) + paint('─'.repeat(width - left - label.length), { fg: 'border' });
}

// Corpo do painel de zonas: favoritos, separador e catálogo, rolando para manter a seleção visível.
function zonesBody(state: TuiState, data: Row[], favorites: number, width: number, height: number): string[] {
	const list = tableLines(data, state.config.clock, { seconds: true, dst: true });
	const lines: { text: string; row?: number }[] = list.map((text, row) => ({ text, row }));
	if (data.length > favorites) lines.splice(favorites, 0, { text: '' });

	const selLine = lines.findIndex((l) => l.row === state.selected);
	const visible = Math.min(lines.length, height);
	const start = Math.max(0, Math.min(selLine - Math.floor(visible / 2), lines.length - visible));
	const w = width - 2;
	return lines.slice(start, start + visible).map(({ text, row }) => {
		if (row === undefined) return ' ' + separator(w) + ' ';
		const isSel = row === state.selected;
		const mark = isSel ? '▸' : row < favorites ? '★' : ' ';
		const line = padTo(truncate(`${mark} ${text}`, w), w);
		return ' ' + paint(line, isSel ? { fg: 'lit', bg: 'highlight', bold: true } : { fg: row < favorites ? 'lit' : 'secondary' }) + ' ';
	});
}

// Corpo de altura `height` com `lines` centralizado na vertical e, com `width`, na horizontal.
function centered(lines: string[], width: number, height: number, contentWidth: number): string[] {
	const indent = ' '.repeat(Math.max(0, Math.floor((width - contentWidth) / 2)));
	const top: string[] = Array(Math.max(0, Math.floor((height - lines.length) / 2))).fill('');
	return [...top, ...lines.map((l) => indent + l)];
}

// Tela inteira como linhas de largura `cols`, sem posicionamento. Pura: recebe instante, zona local e tamanho.
export function renderScreen(state: TuiState, local: string, at: Date, cols: number, rows: number): string[] {
	const { rows: data, favorites } = zoneList(state.config, local, at);
	const layout = computeLayout(cols, rows, { face: state.face, showZones: state.config.ui.showZones, aspect: state.aspect });

	if (layout === undefined) {
		const table = tableLines(data.slice(0, favorites), state.config.clock);
		return [...table.map((l) => truncate(l, cols)), '', paint(truncate('enlarge the terminal to see the map', cols), { fg: 'secondary' })];
	}
	const sel = data[state.selected] ?? data[0]!;
	const out: string[] = Array(layout.padTop).fill(' '.repeat(cols));

	// Linha 1: analógico com largura fixa (ou a linha toda, se estiver sozinho) e mapa com o resto.
	if (layout.topRows > 0) {
		const inner = layout.topRows - 2;
		const top: string[][] = [];
		const analogPanel = layout.map ? ANALOG_PANEL : cols;
		if (layout.analog) {
			top.push(panel('analog', centered(renderAnalog(sel.time?.wall, state.aspect), analogPanel - 2, inner, ANALOG_WIDTH), analogPanel, layout.topRows));
		}
		if (layout.map) {
			// Favoritos marcam o mapa pelo índice; uma zona do catálogo selecionada entra como ·.
			const markers = data.flatMap((r, i) =>
				r.time && (i < favorites || r === sel)
					? [{ label: r.ref === CATALOG_REF ? CATALOG_REF : r.ref.slice(1), offset: r.time.offset, selected: r === sel }]
					: [],
			);
			const mapPanel = layout.analog ? cols - ANALOG_PANEL : cols;
			// Margem de 1 de cada lado; régua e índices ocupam 2 linhas.
			const size = mapSize(mapPanel - 4, inner - 2, state.aspect);
			const map = renderMap(size.width, size.height, markers);
			top.push(panel('map', centered(map, mapPanel - 2, inner, size.width), mapPanel, layout.topRows));
		}
		out.push(...besides(...top));
	}

	// Linha 2: info com a largura do analógico e digital com o resto, sempre.
	const zones = layout.zonesRows > 0;
	const digitalPanel = layout.info ? cols - ANALOG_PANEL : cols;
	const digital = renderDigital(sel, { clock: state.config.clock, at, width: digitalPanel - 2, info: !layout.info, power: powerLine(state.power) });
	const height = DIGITAL_PANEL;
	const row2 = [panel('digital', digital, digitalPanel, height)];
	if (layout.info) row2.unshift(panel(infoTitle(sel), renderInfo(sel, at, ANALOG_PANEL - 2), ANALOG_PANEL, height));
	out.push(...besides(...row2));

	// Linha 3: zonas, com o resto da altura.
	if (zones) {
		const body = zonesBody(state, data, favorites, cols - 2, layout.zonesRows - 2);
		out.push(...panel('zones', body, cols, layout.zonesRows));
	}
	while (out.length < rows - FOOTER_ROWS) out.push(' '.repeat(cols));
	const blank = ' '.repeat(cols);
	out.push(blank, footerLine(state, layout, cols), blank);
	return out;
}

// Resultado de uma tecla que mexe no config: o config novo, ou um aviso quando não faz nada.
export interface Action {
	config?: Config;
	notice?: string;
}

// f/espaço: favorito sai (os seguintes são renumerados), zona do catálogo entra no
// próximo slot. T0 é a zona local e fica.
export function toggleFavorite(config: Config, local: string, at: Date, selected: number): Action {
	const { rows, favorites } = zoneList(config, local, at);
	const row = rows[selected];
	if (!row) return {};
	if (selected === 0) return { notice: 'T0 is the local zone; it stays a favorite' };
	if (selected < favorites) return { config: removeSlot(config, selected) };
	if (config.slots.length >= MAX_SLOTS) return { notice: `limit of ${MAX_SLOTS} favorites` };
	return { config: addFavorite(config, row.zone, row.name) };
}

// d: auto → on → off → auto, só em favoritos e só em zona com DST.
export function cycleDst(config: Config, local: string, at: Date, selected: number): Action {
	const { rows, favorites } = zoneList(config, local, at);
	const row = rows[selected];
	if (!row) return {};
	if (selected >= favorites) return { notice: 'DST is for favorites only (f to add one)' };
	const { std, dst } = dstOffsets(row.zone, at.getUTCFullYear());
	if (std === dst) return { notice: `${row.name}: no daylight saving time` };
	return { config: setDst(config, selected, nextDst(row.dst)) };
}

// Índice da zona na lista nova, depois de o config mudar; senão o mais perto do antigo.
function reselect(config: Config, local: string, zone: string, fallback: number): number {
	const { rows } = zoneList(config, local, new Date());
	const i = rows.findIndex((r) => modernZone(r.zone) === modernZone(zone));
	return i !== -1 ? i : Math.min(fallback, rows.length - 1);
}

export function runTui(initial: Config, path: string): void {
	const { stdin, stdout } = process;
	const state: TuiState = {
		config: initial,
		selected: initial.slots.length ? 1 : 0,
		face: 'map',
		aspect: initial.ui.cellAspect ?? 1,
	};
	let cellQuery: ReturnType<typeof queryCellSize> | undefined;
	let timer: NodeJS.Timeout | undefined;
	let powerTimer: NodeJS.Timeout | undefined;
	let noticeTimer: NodeJS.Timeout | undefined;
	let lastSize = '';
	let done = false;

	const draw = () => {
		const cols = stdout.columns;
		const rows = stdout.rows;
		const lines = renderScreen(state, localZone(), new Date(), cols, rows);
		// Limpa a tela inteira só quando o tamanho muda; no resto, sobrescreve as linhas
		// e apaga o que sobrar abaixo (a tabela de fallback muda de altura).
		let s = '';
		const size = `${cols}x${rows}`;
		if (size !== lastSize) {
			s += '\x1b[2J';
			lastSize = size;
		}
		lines.forEach((l, i) => (s += `\x1b[${i + 1};1H${l}\x1b[K`));
		stdout.write(s + '\x1b[J');
	};

	// Redesenha no início de cada segundo.
	const tick = () => {
		draw();
		timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 2);
	};

	// Bateria: a cada 30 s, fora do tick (pmset leva alguns ms); o próximo segundo já mostra.
	const pollPower = () => {
		void readPower().then((p) => {
			if (done) return;
			state.power = p;
			powerTimer = setTimeout(pollPower, 30_000);
		});
	};

	const flash = (text: string) => {
		state.notice = text;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => {
			state.notice = undefined;
			draw();
		}, 2500);
		draw();
	};

	const cleanup = () => {
		if (done) return;
		done = true;
		clearTimeout(timer);
		clearTimeout(powerTimer);
		clearTimeout(noticeTimer);
		cellQuery?.cancel();
		stdin.setRawMode(false);
		stdin.pause();
		stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
	};

	const list = () => zoneList(state.config, localZone(), new Date());

	// Grava na hora (escrita atômica) e mantém a mesma zona selecionada.
	const update = (config: Config, zone: string) => {
		state.config = config;
		saveConfig(path, config);
		state.selected = reselect(config, localZone(), zone, state.selected);
		draw();
	};

	// ↑↓: a lista toda, sem dar a volta.
	const moveList = (delta: number) => {
		if (!state.config.ui.showZones) return;
		state.selected = Math.max(0, Math.min(list().rows.length - 1, state.selected + delta));
		draw();
	};

	// ←→: só os favoritos, dando a volta; saindo do catálogo, vai para a ponta mais perto.
	const moveFavorite = (delta: number) => {
		const n = list().favorites;
		if (state.selected >= n) state.selected = delta > 0 ? 0 : n - 1;
		else state.selected = (state.selected + delta + n) % n;
		draw();
	};

	// Aplica o resultado de uma tecla: aviso breve, ou config novo gravado.
	const apply = ({ config, notice }: Action) => {
		if (notice) return flash(notice);
		const zone = list().rows[state.selected]?.zone;
		if (config && zone) update(config, zone);
	};

	process.on('exit', cleanup);
	process.on('SIGTERM', () => process.exit(0));
	stdout.write('\x1b[?1049h\x1b[?25l');
	stdin.setRawMode(true);
	stdin.setEncoding('utf8');
	stdin.resume();

	stdin.on('data', (chunk: string) => {
		// A resposta do 16t chega pelo stdin misturada às teclas; sai antes do switch.
		const key = cellQuery ? cellQuery.feed(chunk) : takeCellSize(chunk).rest;
		switch (key) {
			case 'q':
			case 'Q':
			case '\x03':
				process.exit(0);
			case '\x1b[A':
			case '\x1bOA':
				return moveList(-1);
			case '\x1b[B':
			case '\x1bOB':
				return moveList(1);
			case '\x1b[D':
			case '\x1bOD':
				return moveFavorite(-1);
			case '\x1b[C':
			case '\x1bOC':
				return moveFavorite(1);
			case 'f':
			case 'F':
			case ' ':
				return apply(toggleFavorite(state.config, localZone(), new Date(), state.selected));
			case 'd':
			case 'D':
				return apply(cycleDst(state.config, localZone(), new Date(), state.selected));
			case 'z':
			case 'Z': {
				const showZones = !state.config.ui.showZones;
				state.config = { ...state.config, ui: { ...state.config.ui, showZones } };
				saveConfig(path, state.config);
				return draw();
			}
			case 'm':
			case 'M':
				state.face = state.face === 'map' ? 'analog' : 'map';
				return draw();
			case 't':
			case 'T':
				state.config = { ...state.config, clock: state.config.clock === '12h' ? '24h' : '12h' };
				saveConfig(path, state.config);
				return draw();
		}
	});
	stdout.on('resize', draw);
	tick();
	pollPower();
	// Sem k calibrado, pergunta ao terminal depois do primeiro frame (desenhado com k = 1).
	if (initial.ui.cellAspect === undefined) {
		cellQuery = queryCellSize(
			(s) => stdout.write(s),
			(k) => {
				state.aspect = k;
				draw();
			},
		);
	}
}
