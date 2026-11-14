$ErrorActionPreference = 'Stop'
$telegramPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $telegramPython)) {
    python -m venv (Join-Path $PSScriptRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Telegram Python environment.' }
}
& $telegramPython -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install the Telegram dependencies.' }
& $telegramPython (Join-Path $PSScriptRoot 'setup_account.py')
if ($LASTEXITCODE -ne 0) { throw 'Telegram setup did not complete.' }
