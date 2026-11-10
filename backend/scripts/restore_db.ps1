<#
.SYNOPSIS
    Verify SHA-256 sidecar and restore a compressed custom-format PostgreSQL backup (.dump).
.EXAMPLE
    .\backend\scripts\restore_db.ps1 -BackupPath .\backend\backups\companyaudit_20261110_120000.dump -Database companyaudit_test -Force
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,
    [string]$ContainerName = "companyaudit-postgres",
    [string]$DbHost = "localhost",
    [int]$DbPort = 5433,
    [string]$DbUser = "companyaudit",
    [string]$Database = "companyaudit",
    [switch]$UseDockerExec,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -Path $BackupPath)) {
    throw "Backup file not found: $BackupPath"
}

$resolvedBackup = (Resolve-Path -Path $BackupPath).Path
$shaFile = "${resolvedBackup}.sha256"

if (Test-Path -Path $shaFile) {
    $expectedHash = ((Get-Content -Path $shaFile -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -Path $resolvedBackup -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expectedHash -ne $actualHash) {
        throw "SHA-256 verification failed for $resolvedBackup. Expected $expectedHash, got $actualHash."
    }
    Write-Host "SHA-256 checksum verified: $actualHash"
} else {
    Write-Warning "No .sha256 sidecar found next to $resolvedBackup; proceeding without hash verification."
}

if (-not $Force) {
    $confirm = Read-Host "WARNING: This will overwrite objects in database '$Database' (--clean --if-exists). Type RESTORE to continue"
    if ($confirm -ne "RESTORE") {
        Write-Host "Restore cancelled."
        exit 1
    }
}

$hasPgRestore = [bool](Get-Command pg_restore -ErrorAction SilentlyContinue)
$useDocker = $UseDockerExec -or (-not $hasPgRestore)

if ($useDocker) {
    Write-Host "Restoring into Docker container '$ContainerName' database '$Database'..."
    $cmd = "docker exec -i $ContainerName pg_restore -U $DbUser -d $Database --clean --if-exists --no-owner --no-privileges < `"$resolvedBackup`""
    cmd /c $cmd
    if ($LASTEXITCODE -ne 0) {
        throw "Docker pg_restore failed with exit code $LASTEXITCODE"
    }
} else {
    Write-Host "Restoring into ${DbHost}:${DbPort}/${Database} via local pg_restore..."
    & pg_restore -h $DbHost -p $DbPort -U $DbUser -d $Database --clean --if-exists --no-owner --no-privileges $resolvedBackup
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore failed with exit code $LASTEXITCODE"
    }
}

Write-Host "Database '$Database' restore completed cleanly."

