# PowerShell script to extract PostgreSQL version from package.json
# Usage: .\scripts\extract-pg-version.ps1

param(
    [switch]$Env
)

function Extract-PostgreSQLVersion {
    param([string]$PackageVersion)
    
    # Match pattern like "0.1.0+pg17.5" and extract "17.5"
    if ($PackageVersion -match '\+pg(\d+\.\d+)') {
        return $matches[1]
    }
    
    # Fallback: if no match, try to find version in different format
    if ($PackageVersion -match 'pg(\d+\.\d+)') {
        return $matches[1]
    }
    
    throw "Could not extract PostgreSQL version from: $PackageVersion"
}

try {
    # Read package.json
    $packageJson = Get-Content -Path "package.json" -Raw | ConvertFrom-Json
    $pgVersion = Extract-PostgreSQLVersion -PackageVersion $packageJson.version
    
    if ($Env) {
        Write-Output "POSTGRESQL_VERSION=$pgVersion"
    } else {
        Write-Output $pgVersion
    }
} catch {
    Write-Error "Error: $($_.Exception.Message)"
    exit 1
}