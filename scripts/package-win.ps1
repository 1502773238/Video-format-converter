$ErrorActionPreference = 'Stop'

$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

pnpm stage:binaries
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm exec electron-builder --win nsis portable --x64
exit $LASTEXITCODE
