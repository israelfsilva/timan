# Timan

World time in the terminal, inspired by the Casio AE-1200WH.

> **Pre-release:** timan is being rewritten; the API and commands may change.

## Install

**npm** (Node.js 18.3 or later):

```sh
npm install -g timan
```

**Homebrew** (macOS and Linux):

```sh
brew install israelfsilva/tap/timan
```

**AUR** (Arch Linux):

```sh
yay -S timan
```

or without an AUR helper:

```sh
git clone https://aur.archlinux.org/timan.git
cd timan
makepkg -si
```

## Usage

```sh
timan              # world clock (TUI; plain table when piped or under 60 columns)
timan --version
timan --help
```
