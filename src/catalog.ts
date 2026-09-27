import { modernZone, offsetMinutes } from './time.ts';

// Catálogo curado: uma cidade representativa por offset. Só nome e ID IANA; o offset
// é sempre calculado na hora (o comentário é o horário padrão, para referência).

export interface CatalogEntry {
	name: string;
	zone: string;
}

export const CATALOG: readonly CatalogEntry[] = [
	{ name: 'PAGO PAGO', zone: 'Pacific/Pago_Pago' }, // −11:00
	{ name: 'HONOLULU', zone: 'Pacific/Honolulu' }, // −10:00
	{ name: 'MARQUESAS', zone: 'Pacific/Marquesas' }, // −09:30
	{ name: 'ANCHORAGE', zone: 'America/Anchorage' }, // −09:00
	{ name: 'LOS ANGELES', zone: 'America/Los_Angeles' }, // −08:00
	{ name: 'DENVER', zone: 'America/Denver' }, // −07:00
	{ name: 'CHICAGO', zone: 'America/Chicago' }, // −06:00
	{ name: 'NEW YORK', zone: 'America/New_York' }, // −05:00
	{ name: 'HALIFAX', zone: 'America/Halifax' }, // −04:00
	{ name: "ST. JOHN'S", zone: 'America/St_Johns' }, // −03:30
	{ name: 'SÃO PAULO', zone: 'America/Sao_Paulo' }, // −03:00
	{ name: 'NORONHA', zone: 'America/Noronha' }, // −02:00
	{ name: 'AZORES', zone: 'Atlantic/Azores' }, // −01:00
	{ name: 'UTC', zone: 'Etc/UTC' }, // 00:00 (o Intl aceita, mas supportedValuesOf não lista)
	{ name: 'LONDON', zone: 'Europe/London' }, // 00:00
	{ name: 'PARIS', zone: 'Europe/Paris' }, // +01:00
	{ name: 'CAIRO', zone: 'Africa/Cairo' }, // +02:00
	{ name: 'MOSCOW', zone: 'Europe/Moscow' }, // +03:00
	{ name: 'TEHRAN', zone: 'Asia/Tehran' }, // +03:30
	{ name: 'DUBAI', zone: 'Asia/Dubai' }, // +04:00
	{ name: 'KABUL', zone: 'Asia/Kabul' }, // +04:30
	{ name: 'KARACHI', zone: 'Asia/Karachi' }, // +05:00
	{ name: 'DELHI', zone: 'Asia/Kolkata' }, // +05:30
	{ name: 'KATHMANDU', zone: 'Asia/Kathmandu' }, // +05:45
	{ name: 'DHAKA', zone: 'Asia/Dhaka' }, // +06:00
	{ name: 'YANGON', zone: 'Asia/Yangon' }, // +06:30
	{ name: 'BANGKOK', zone: 'Asia/Bangkok' }, // +07:00
	{ name: 'HONG KONG', zone: 'Asia/Hong_Kong' }, // +08:00
	{ name: 'EUCLA', zone: 'Australia/Eucla' }, // +08:45
	{ name: 'TOKYO', zone: 'Asia/Tokyo' }, // +09:00
	{ name: 'DARWIN', zone: 'Australia/Darwin' }, // +09:30
	{ name: 'ADELAIDE', zone: 'Australia/Adelaide' }, // +09:30
	{ name: 'SYDNEY', zone: 'Australia/Sydney' }, // +10:00
	{ name: 'LORD HOWE', zone: 'Australia/Lord_Howe' }, // +10:30
	{ name: 'NOUMÉA', zone: 'Pacific/Noumea' }, // +11:00
	{ name: 'AUCKLAND', zone: 'Pacific/Auckland' }, // +12:00
	{ name: 'CHATHAM', zone: 'Pacific/Chatham' }, // +12:45
	{ name: 'TONGA', zone: 'Pacific/Tongatapu' }, // +13:00
	{ name: 'KIRITIMATI', zone: 'Pacific/Kiritimati' }, // +14:00
].map((e) => ({ ...e, name: e.name.normalize('NFC') }));

// Catálogo ordenado pelo offset atual (oeste → leste), desempate pelo nome, sem as
// zonas de `exclude` (os favoritos, T0 incluído). Compara pelo nome IANA atual, para
// um local Asia/Calcutta excluir Asia/Kolkata.
export function catalogFor(at: Date, exclude: string[]): CatalogEntry[] {
	const skip = new Set(exclude.map(modernZone));
	return CATALOG.filter((e) => !skip.has(modernZone(e.zone)))
		.map((e) => ({ e, offset: offsetMinutes(e.zone, at) }))
		.sort((a, b) => a.offset - b.offset || a.e.name.localeCompare(b.e.name))
		.map(({ e }) => e);
}
