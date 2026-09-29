import { paint, visibleWidth } from './theme.ts';

// btop-style panel: rounded border, title embedded in the top border and,
// optionally, a label on the right of the bottom border.
//   ╭─ title ──────╮
//   │body          │
//   ╰──── footer ──╯
// Body lines must not exceed width − 2 (the caller truncates); missing ones are padded with blanks.
// A line equal to RULE becomes a ├───┤ divider joined to the borders.
export const RULE = '\0rule';

export function panel(title: string, body: string[], width: number, height: number, footer?: string): string[] {
	const inner = width - 2;
	const b = (s: string) => paint(s, { fg: 'border' });

	const t = title.length > inner - 4 ? title.slice(0, Math.max(0, inner - 5)) + '…' : title;
	const out = [b('╭─') + ' ' + paint(t, { fg: 'lit', bold: true }) + ' ' + b('─'.repeat(Math.max(0, inner - 3 - t.length)) + '╮')];

	for (let i = 0; i < height - 2; i++) {
		const line = body[i] ?? '';
		if (line === RULE) {
			out.push(b('├' + '─'.repeat(inner) + '┤'));
			continue;
		}
		out.push(b('│') + line + ' '.repeat(Math.max(0, inner - visibleWidth(line))) + b('│'));
	}

	// The footer only goes in if it fits whole, with at least one dash on each side.
	const label = footer ? ` ${footer} ` : '';
	if (label && label.length + 4 <= inner) {
		out.push(b('╰' + '─'.repeat(inner - label.length - 3)) + paint(label, { fg: 'secondary' }) + b('───╯'));
	} else {
		out.push(b('╰' + '─'.repeat(inner) + '╯'));
	}
	return out;
}

// Joins panels side by side; they must all have the same number of lines.
export function besides(...columns: string[][]): string[] {
	return columns[0]!.map((_, i) => columns.map((c) => c[i]!).join(''));
}
