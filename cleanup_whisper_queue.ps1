param(
    [switch]$Apply,
    [switch]$Json
)

Set-Location $PSScriptRoot

$dockerArgs = @('compose', 'exec', '-T', 'web', 'python', 'server/scripts/cleanup_whisper_queue.py')
if ($Apply) {
    $dockerArgs += '--apply'
}
if ($Json) {
    $dockerArgs += '--json'
}

& docker @dockerArgs
exit $LASTEXITCODE
