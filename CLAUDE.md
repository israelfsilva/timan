# Diretrizes do Projeto

# Regras de domínio (não negociáveis)

1. Guardar **IDs IANA**, nunca offsets fixos. DST deve ser automático.
2. Embutir tzdata: `import _ "time/tzdata"`.
3. Diferença entre fusos em **minutos** (Índia +5:30, Nepal +5:45).
4. "Dia" = diferença de **datas civis** entre o fuso e o T0 (−1, 0, +1), não derivado de horas.

## Cores

Tema verde-LCD usando `lipgloss.AdaptiveColor`: fundo do destaque #173220 · segmento aceso #C9F2B0 · segmento apagado #1F2A20 · terra #4F6B52 · terra na faixa #B7EC9A · texto secundário #6F8571 · bordas #3A4A3C. Deixe as cores num único lugar para facilitar um tema âmbar depois.