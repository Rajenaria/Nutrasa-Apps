[CmdletBinding()]
param(
    [ValidateSet('Diagnose', 'Setup', 'Run')]
    [string] $Phase = 'Diagnose',
    [string] $Database = 'nutrasa_it_419e5962579e4d22a83a8ff1ecea417f',
    [switch] $RecoverWriter
)

$ErrorActionPreference = 'Stop'
$expectedDatabase = 'nutrasa_it_419e5962579e4d22a83a8ff1ecea417f'
$credentialKeys = @('NUTRASA_IT_ADMIN_URL', 'NUTRASA_IT_DATABASE_URL',
    'NUTRASA_IT_READER_URL', 'NUTRASA_IT_WRITER_URL', 'NUTRASA_IT_CONFIRM_DATABASE',
    'NUTRASA_IT_GOVERNANCE_CONFIRM', 'NUTRASA_IT_CATALOG_PREFLIGHT_CONFIRM',
    'NUTRASA_IT_CATALOG_LINEAGE_CONFIRM', 'PGPASSWORD')

function ConvertTo-LocalConnection {
    param([string] $TargetDatabase, [string] $Role, [string] $Password)
    $allowedRoles = @('nutrasa_it_admin', ($TargetDatabase + '_migrator'),
        ($TargetDatabase + '_runtime'), ($TargetDatabase + '_writer'))
    if ($TargetDatabase -cne 'nutrasa_it_419e5962579e4d22a83a8ff1ecea417f' -or
        $Role -cnotin $allowedRoles -or [string]::IsNullOrEmpty($Password) -or
        $Password.IndexOfAny([char[]]@(0, 10, 13)) -ge 0) {
        throw 'STOP: local credential binding rejected.'
    }
    return 'postgresql://{0}:{1}@127.0.0.1:5433/{2}' -f $Role, [Uri]::EscapeDataString($Password), $TargetDatabase
}

function Read-LocalConnection {
    param([string] $Role, [string] $Label)
    $secret = Read-Host $Label -AsSecureString
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        return ConvertTo-LocalConnection -TargetDatabase $Database -Role $Role -Password $plain
    }
    finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
        $plain = $null
        $secret.Dispose()
    }
}

function Invoke-LocalNode {
    param([string] $Action)
    & $node $cli --action $Action --database $Database
    if ($LASTEXITCODE -ne 0) { throw 'STOP: local Node stage failed; no retry.' }
}

# Validate before prompting or changing the process environment. Setup cannot reuse this database.
if ($Database -cne $expectedDatabase) { throw 'STOP: target is outside the approved recovery profile.' }
if ($Phase -eq 'Setup') {
    throw 'STOP: existing target must not be provisioned again. Future setup must reuse provision.sql under separate approval.'
}
if ($RecoverWriter -and $Phase -ne 'Diagnose') { throw 'STOP: password recovery is Diagnose only.' }
foreach ($name in @('PGOPTIONS','PGREPLICATION','PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPASSFILE','NODE_OPTIONS') + $credentialKeys) {
    if ([Environment]::GetEnvironmentVariable($name, 'Process')) { throw "STOP: $name is already set." }
}
if ($env:PGPORT -and $env:PGPORT -ne '5433') { throw 'STOP: PGPORT must be absent or 5433.' }
$node = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$cli = Join-Path $PSScriptRoot 'local-integration-cli.ts'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) { throw 'STOP: PostgreSQL 18 psql unavailable.' }

Push-Location -LiteralPath (Join-Path $PSScriptRoot '../..')
try {
    $env:NUTRASA_IT_ADMIN_URL = Read-LocalConnection -Role 'nutrasa_it_admin' -Label 'Password ADMIN testing'
    Invoke-LocalNode -Action 'preflight'

    if ($Phase -eq 'Diagnose') {
        if (-not $RecoverWriter) { return }
        $resetPlan = Invoke-LocalNode -Action 'reset-arguments' | ConvertFrom-Json
        $resetArguments = @($resetPlan | ForEach-Object { $_ })
        try {
            $adminUrl = [Uri]$env:NUTRASA_IT_ADMIN_URL
            $env:PGPASSWORD = [Uri]::UnescapeDataString(($adminUrl.UserInfo -split ':', 2)[1])
            Write-Host 'ONE writer password reset: enter the new WRITER password twice at the native prompts.'
            & $psql @resetArguments
            $resetExitCode = $LASTEXITCODE
            if ($resetExitCode -ne 0) { throw 'STOP: writer password reset failed; no retry.' }
            Write-Host 'WRITER PASSWORD RESET EXIT CODE: 0'
        }
        finally {
            [Environment]::SetEnvironmentVariable('PGPASSWORD', $null, 'Process')
            $adminUrl = $null
        }
        # Capture once: both clients consume this same credential, never ask for it independently.
        $env:NUTRASA_IT_WRITER_URL = Read-LocalConnection -Role ($Database + '_writer') -Label 'Repeat the NEW WRITER password for both read-only login checks'
        Invoke-LocalNode -Action 'check-writer'
        return
    }

    # Run is deliberately separate and requires its own owner approval; Diagnose never falls through.
    $env:NUTRASA_IT_DATABASE_URL = Read-LocalConnection -Role ($Database + '_migrator') -Label 'Password MIGRATOR target'
    $env:NUTRASA_IT_READER_URL = Read-LocalConnection -Role ($Database + '_runtime') -Label 'Password RUNTIME target'
    $env:NUTRASA_IT_WRITER_URL = Read-LocalConnection -Role ($Database + '_writer') -Label 'Password WRITER target'
    $env:NUTRASA_IT_CONFIRM_DATABASE = $Database
    $env:NUTRASA_IT_GOVERNANCE_CONFIRM = $Database
    $env:NUTRASA_IT_CATALOG_PREFLIGHT_CONFIRM = $Database
    $env:NUTRASA_IT_CATALOG_LINEAGE_CONFIRM = $Database
    Invoke-LocalNode -Action 'preflight-run'
    & npm.cmd run test:integration:catalog-lineage
    $suiteExitCode = $LASTEXITCODE
    Write-Host "CATALOG LINEAGE RETEST EXIT CODE: $suiteExitCode"
    if ($suiteExitCode -ne 0) { throw 'STOP: integration failed; no retry or cleanup.' }
}
catch {
    # Native/Node stages provide only safe status. Do not echo PowerShell exceptions with local variables.
    Write-Host 'STOP: local integration workflow stopped. Preserve state; no retry or cleanup.'
    exit 1
}
finally {
    foreach ($name in $credentialKeys) {
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    Pop-Location
}
