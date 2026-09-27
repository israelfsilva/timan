class Timan < Formula
  desc "World time in the terminal, inspired by the Casio AE-1200WH"
  homepage "https://github.com/israelfsilva/timan"
  url "https://registry.npmjs.org/@israelfsilva/timan/-/timan-0.1.0.tgz"
  sha256 "3a9204811b2a0348efa510079281f8000aa1fd97aea88a6542bdb4f452026ced"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_equal "timan #{version}", shell_output("#{bin}/timan --version").strip
    # Sem TTY o timan imprime a tabela; T0 é sempre o fuso local.
    assert_match(/^T0 /, pipe_output(bin/"timan", ""))
  end
end
