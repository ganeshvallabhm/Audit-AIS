<#
.SYNOPSIS
    Create a compressed custom-format PostgreSQL backup (.dump) and SHA-256 verification sidecar.
.EXAMPLE
    .\backend\scripts\backup_db.ps1 -Database companyaudit
#>
param(
    [string]$ContainerName = "companyaudit-postgres",
    [string]$DbHost = "localhost",
    [int]$DbPort = 5433,
    [string]$DbUser = "companyaudit",
    [string]$Database = "companyaudit",
    [string]$OutputDir = "$PSScriptRoot\..\backups",
    [switch]$UseDockerExec
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dumpPath = Join-Path -Path $OutputDir -ChildPath "${Database}_${timestamp}.dump"
$shaPath = "${dumpPath}.sha256"

$hasPgDump = [bool](Get-Command pg_dump -ErrorAction SilentlyContinue)
$useDocker = $UseDockerExec -or (-not $hasPgDump)

if ($useDocker) {
    Write-Host "Running pg_dump inside Docker container '$ContainerName'..."
    $dockerArgs = @(
        "exec", $ContainerName,
        "pg_dump", "-U", $DbUser, "-d", $Database, "-Fc", "--no-owner", "--no-privileges"
    )
    $cmd = "docker " + ($dockerArgs -join " ") + " > `"$dumpPath`""
    cmd /c $cmd
    if ($LASTEXITCODE -ne 0) {
        throw "Docker pg_dump failed with exit code $LASTEXITCODE"
    }
} else {
    Write-Host "Running local pg_dump against ${DbHost}:${DbPort}/${Database}..."
    & pg_dump -h $DbHost -p $DbPort -U $DbUser -d $Database -Fc --no-owner --no-privileges -f $dumpPath
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE"
    }
}

$hash = (Get-FileHash -Path $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
"${hash}  $(Split-Path -Leaf $dumpPath)" | Out-File -FilePath $shaPath -Encoding ascii -NoNewline

$sizeMb = [math]::Round((Get-Item $dumpPath).Length / 1MB, 2)
Write-Host "Backup complete: $dumpPath (${sizeMb} MB)"
Write-Host "SHA-256 checksum written: $shaPath ($hash)"

