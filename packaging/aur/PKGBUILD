# Maintainer: Israel Silva <israeljunior.net@gmail.com>

pkgname=timan
_npmname=@israelfsilva/timan
pkgver=0.1.0
pkgrel=1
pkgdesc="World time in the terminal, inspired by the Casio AE-1200WH"
arch=('any')
url="https://github.com/israelfsilva/timan"
license=('MIT')
depends=('nodejs')
makedepends=('npm' 'jq')
source=("$pkgname-$pkgver.tgz::https://registry.npmjs.org/$_npmname/-/timan-$pkgver.tgz")
noextract=("$pkgname-$pkgver.tgz")
sha256sums=('3a9204811b2a0348efa510079281f8000aa1fd97aea88a6542bdb4f452026ced')

package() {
	npm install -g --prefix "$pkgdir/usr" --cache "$srcdir/npm-cache" "$srcdir/$pkgname-$pkgver.tgz"

	# npm can leave directories world-writable.
	find "$pkgdir/usr" -type d -exec chmod 755 {} +

	# Drop npm's internal fields (_where, _resolved…), which may point at $pkgdir and $srcdir.
	local _pkgjson="$pkgdir/usr/lib/node_modules/$_npmname/package.json"
	local _tmp
	_tmp="$(mktemp)"
	jq 'with_entries(select(.key | startswith("_") | not))' "$_pkgjson" > "$_tmp"
	install -m644 "$_tmp" "$_pkgjson"
	rm "$_tmp"

	install -Dm644 "$pkgdir/usr/lib/node_modules/$_npmname/LICENSE.txt" \
		"$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
