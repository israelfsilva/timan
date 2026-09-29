# Records docs/images/timan.gif. Run from the repo root: vhs docs/demo.tape

Output docs/images/timan.gif

Set Shell bash
Set FontSize 14
Set Width 1200
Set Height 780
Set Padding 24
Set Framerate 24
Set TypingSpeed 60ms
Set Theme { "name": "timan", "background": "#0D120E", "foreground": "#C9F2B0", "cursor": "#C9F2B0", "selection": "#173220", "black": "#0D120E", "red": "#C9F2B0", "green": "#C9F2B0", "yellow": "#C9F2B0", "blue": "#C9F2B0", "magenta": "#C9F2B0", "cyan": "#C9F2B0", "white": "#C9F2B0", "brightBlack": "#6F8571", "brightRed": "#C9F2B0", "brightGreen": "#C9F2B0", "brightYellow": "#C9F2B0", "brightBlue": "#C9F2B0", "brightMagenta": "#C9F2B0", "brightCyan": "#C9F2B0", "brightWhite": "#C9F2B0" }

# A throwaway config, so the demo shows the default favorites.
Hide
Type `export COLORTERM=truecolor XDG_CONFIG_HOME="$(mktemp -d)" PS1='$ '` Enter
Type "alias timan='node src/main.ts'" Enter
Type "clear" Enter
Show

Type "timan" Sleep 400ms Enter
Sleep 2s
Right Sleep 1.2s
Right Sleep 1.2s
Right Sleep 1.2s
Right Sleep 1.2s
Type "t" Sleep 1.5s
Type "q"
Sleep 300ms
