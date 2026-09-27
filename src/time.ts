// Fusos via Intl, sem dependências. Tudo parte do offset em minutos:
// hora de parede = instante UTC + offset, e a data civil sai dela.

// O ICU embutido no Node ainda usa nomes antigos para algumas zonas
// (Intl.supportedValuesOf lista Asia/Calcutta, não Asia/Kolkata).
// Mapeia para o nome atual da IANA.
const RENAMES: Record<string, string> = {
	'Africa/Asmera': 'Africa/Asmara',
	'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
	'America/Catamarca': 'America/Argentina/Catamarca',
	'America/Coral_Harbour': 'America/Atikokan',
	'America/Cordoba': 'America/Argentina/Cordoba',
	'America/Godthab': 'America/Nuuk',
	'America/Indianapolis': 'America/Indiana/Indianapolis',
	'America/Jujuy': 'America/Argentina/Jujuy',
	'America/Louisville': 'America/Kentucky/Louisville',
	'America/Mendoza': 'America/Argentina/Mendoza',
	'Asia/Calcutta': 'Asia/Kolkata',
	'Asia/Katmandu': 'Asia/Kathmandu',
	'Asia/Rangoon': 'Asia/Yangon',
	'Asia/Saigon': 'Asia/Ho_Chi_Minh',
	'Atlantic/Faeroe': 'Atlantic/Faroe',
	'Europe/Kiev': 'Europe/Kyiv',
	'Pacific/Enderbury': 'Pacific/Kanton',
	'Pacific/Ponape': 'Pacific/Pohnpei',
	'Pacific/Truk': 'Pacific/Chuuk',
};

export function modernZone(id: string): string {
	return RENAMES[id] ?? id;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(zone: string): Intl.DateTimeFormat {
	let f = formatters.get(zone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' });
		formatters.set(zone, f);
	}
	return f;
}

// Offset UTC da zona no instante dado, em minutos (Nepal = +345).
export function offsetMinutes(zone: string, at: Date): number {
	const name = offsetFormatter(zone).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value;
	const m = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name ?? '');
	if (!m) throw new Error(`offset inesperado para ${zone}: ${name}`);
	if (!m[1]) return 0;
	const minutes = Number(m[2]) * 60 + Number(m[3]);
	return m[1] === '-' ? -minutes : minutes;
}

// Date cujos campos UTC (getUTCHours, getUTCDate...) são a hora de parede com o offset dado.
export function wallClockAt(at: Date, offset: number): Date {
	return new Date(at.getTime() + offset * 60_000);
}

// Date cujos campos UTC (getUTCHours, getUTCDate...) são a hora de parede na zona.
export function wallClock(zone: string, at: Date): Date {
	return wallClockAt(at, offsetMinutes(zone, at));
}

export function diffMinutes(zone: string, t0: string, at: Date): number {
	return offsetMinutes(zone, at) - offsetMinutes(t0, at);
}

// Diferença de datas civis entre dois offsets no mesmo instante (−1, 0, +1), não derivada de horas.
export function civilDayDiff(offset: number, t0Offset: number, at: Date): number {
	const civil = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	return (civil(wallClockAt(at, offset)) - civil(wallClockAt(at, t0Offset))) / 86_400_000;
}

// Diferença de datas civis entre a zona e o T0 (−1, 0, +1), não derivada de horas.
export function dayDiff(zone: string, t0: string, at: Date): number {
	return civilDayDiff(offsetMinutes(zone, at), offsetMinutes(t0, at), at);
}

// Override de DST por zona: auto segue a IANA; on/off forçam o offset de verão/padrão.
export type DstMode = 'auto' | 'on' | 'off';

export const DST_MODES: readonly DstMode[] = ['auto', 'on', 'off'];

// Offsets padrão e de verão, derivados da própria zona em 1º de janeiro e 1º de julho:
// o menor é o padrão, o que cobre o hemisfério sul. std === dst → zona sem DST.
export function dstOffsets(zone: string, year: number): { std: number; dst: number } {
	const jan = offsetMinutes(zone, new Date(Date.UTC(year, 0, 1)));
	const jul = offsetMinutes(zone, new Date(Date.UTC(year, 6, 1)));
	return { std: Math.min(jan, jul), dst: Math.max(jan, jul) };
}

// Offset que vale para exibição, diferença, dia civil e mapa.
export function effectiveOffset(zone: string, at: Date, mode: DstMode): number {
	if (mode === 'auto') return offsetMinutes(zone, at);
	const { std, dst } = dstOffsets(zone, at.getUTCFullYear());
	return mode === 'on' ? dst : std;
}

export type DstLabel = '' | 'DST' | 'DST*' | 'STD*';

// DST = auto e em horário de verão; DST*/STD* = forçado; vazio = auto em horário
// padrão, ou zona sem DST (onde o override não tem efeito).
export function dstLabel(zone: string, at: Date, mode: DstMode): DstLabel {
	const { std, dst } = dstOffsets(zone, at.getUTCFullYear());
	if (std === dst) return '';
	if (mode === 'on') return 'DST*';
	if (mode === 'off') return 'STD*';
	return offsetMinutes(zone, at) === dst ? 'DST' : '';
}

// −03:00, +05:45 (com hífen ASCII; quem exibe decide o sinal).
export function formatOffset(minutes: number): string {
	const abs = Math.abs(minutes);
	const hh = String(Math.floor(abs / 60)).padStart(2, '0');
	const mm = String(abs % 60).padStart(2, '0');
	return `${minutes < 0 ? '-' : '+'}${hh}:${mm}`;
}

// +4h, -1h, +8h30, 0h.
export function formatDiff(minutes: number): string {
	if (minutes === 0) return '0h';
	const abs = Math.abs(minutes);
	const h = Math.floor(abs / 60);
	const m = abs % 60;
	return `${minutes < 0 ? '-' : '+'}${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

export type Clock = '12h' | '24h';

// 9:08 PM / 21:08, a partir de um wallClock.
export function formatClock(wall: Date, clock: Clock, seconds = false): string {
	const h = wall.getUTCHours();
	const mm = String(wall.getUTCMinutes()).padStart(2, '0');
	const ss = seconds ? ':' + String(wall.getUTCSeconds()).padStart(2, '0') : '';
	if (clock === '24h') return `${String(h).padStart(2, '0')}:${mm}${ss}`;
	return `${h % 12 || 12}:${mm}${ss} ${h < 12 ? 'AM' : 'PM'}`;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// FRI 25, a partir de um wallClock.
export function formatDay(wall: Date): string {
	return `${WEEKDAYS[wall.getUTCDay()]} ${wall.getUTCDate()}`;
}

// FRI 25 SEP 2026, a partir de um wallClock.
export function formatDate(wall: Date): string {
	return `${formatDay(wall)} ${MONTHS[wall.getUTCMonth()]} ${wall.getUTCFullYear()}`;
}

// Cada locale só conhece as abreviações da sua região (en-US tem EDT, en-GB tem BST).
const ABBR_LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-IN', 'en-NZ', 'en-ZA', 'en-HK', 'en-SG'];

// Abreviação (EDT, BST, IST) quando o ICU conhece uma; undefined se ele só sabe "GMT-3".
export function zoneAbbr(zone: string, at: Date): string | undefined {
	for (const locale of ABBR_LOCALES) {
		const f = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'short' });
		const name = f.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value;
		if (name && !/^(GMT|UTC)/.test(name)) return name;
	}
	return undefined;
}

// America/New_York → NEW YORK; America/Argentina/Buenos_Aires → BUENOS AIRES.
export function zoneName(zone: string): string {
	const last = modernZone(zone).split('/').pop() ?? zone;
	return last.replaceAll('_', ' ').toUpperCase();
}

export function localZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Valida um ID IANA e devolve a grafia a gravar, ou undefined se inválido.
// Aceita o que o usuário digitou (inclusive aliases como US/Eastern), corrigindo
// só maiúsculas; rejeita offsets fixos como "+03:00", que o Intl também aceita.
export function normalizeZone(input: string): string | undefined {
	if (!/^[A-Za-z]/.test(input)) return undefined;
	let resolved: string;
	try {
		resolved = new Intl.DateTimeFormat('en-US', { timeZone: input }).resolvedOptions().timeZone;
	} catch {
		return undefined;
	}
	for (const candidate of [modernZone(resolved), resolved]) {
		if (candidate.toLowerCase() === input.toLowerCase()) return candidate;
	}
	return input;
}

export function isValidZone(zone: string): boolean {
	return normalizeZone(zone) !== undefined;
}

