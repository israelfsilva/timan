class Timan < Formula
  desc "World time in the terminal, inspired by the Casio AE-1200WH"
  homepage "https://github.com/israelfsilva/timan"
  url "https://registry.npmjs.org/@israelfsilva/timan/-/timan-1.0.0.tgz"
  sha256 "84723129a18e96a9611928335923d08eb76b430af5a4965a7b92ad84fdde29bd"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_equal "timan #{version}", shell_output("#{bin}/timan --version").strip
    # Without a TTY timan prints the table; T0 is always the local zone.
    assert_match(/^T0 /, pipe_output(bin/"timan", ""))
  end
end
