import { paint, visibleWidth } from './theme.ts';

// Painel estilo btop: borda arredondada, título embutido na borda de cima e,
// opcionalmente, um rótulo à direita na borda de baixo.
//   ╭─ title ──────╮
//   │body          │
//   ╰──── footer ──╯
// As linhas do corpo não podem passar de width − 2 (quem chama corta); faltando, completa com branco.
// Uma linha igual a RULE vira um divisor ├───┤ ligado às bordas.
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

	// O rodapé só entra se couber inteiro, com ao menos um traço de cada lado.
	const label = footer ? ` ${footer} ` : '';
	if (label && label.length + 4 <= inner) {
		out.push(b('╰' + '─'.repeat(inner - label.length - 3)) + paint(label, { fg: 'secondary' }) + b('───╯'));
	} else {
		out.push(b('╰' + '─'.repeat(inner) + '╯'));
	}
	return out;
}

// Junta painéis lado a lado; todos devem ter o mesmo número de linhas.
export function besides(...columns: string[][]): string[] {
	return columns[0]!.map((_, i) => columns.map((c) => c[i]!).join(''));
}
