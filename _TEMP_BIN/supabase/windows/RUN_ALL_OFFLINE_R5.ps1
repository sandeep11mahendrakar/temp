# OC-DB R5: ONE-GO OFFLINE Windows validation. NO HOSTED ACCESS.
# Invoke after extracting this ZIP, using RemoteSigned:
# Unblock-File .\RUN_ALL_OFFLINE_R5.ps1; & .\RUN_ALL_OFFLINE_R5.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$parent = Join-Path $base ('R5_EVIDENCE_' + $stamp)
$archive = Join-Path $base 'OC_DB_P59_EXECUTOR_FROZEN_R3_AUD_REVIEW.zip'
$helper = Join-Path $base 'OC_DB_R3_WINDOWS_OFFLINE_EVIDENCE_R5.py'
$driverStatus = 'DRIVER_INCOMPLETE'
$exitCode = 125
$outputZip = Join-Path $base ('OCDB_R5_WINDOWS_EVIDENCE_' + $stamp + '.zip')

function Verify-Pinned([string]$relative, [string]$expectedHash) {
    $path = Join-Path $base $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'PINNED_INPUT_MISSING' }
    $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expectedHash) { throw 'PINNED_INPUT_HASH_MISMATCH' }
    return $actual
}
function Lock-PrivateAcl([string]$path, [bool]$directory) {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if ($sid -notmatch '^S-1-(\d+-)+\d+$') { throw 'OWNER_SID_UNAVAILABLE' }
    $ace = if ($directory) { '*' + $sid + ':(OI)(CI)F' } else { '*' + $sid + ':F' }
    & icacls.exe $path '/inheritance:r' '/grant:r' $ace 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'PRIVATE_ACL_FAILURE' }
}
try {
    if ($env:OS -ne 'Windows_NT') { throw 'NATIVE_WINDOWS_REQUIRED' }
    $expected = [ordered]@{
        'OC_DB_P59_EXECUTOR_FROZEN_R3_AUD_REVIEW.zip' = 'cae1405f07c68467914c2297443199c704a3e5df7d6f987244603fa85d5f5c01'
        'OC_DB_R3_WINDOWS_OFFLINE_EVIDENCE_R5.py' = '214df1faa4b05f0776d8bafafbde2d2a4744a07fdf5657e8ebc3c80f7bb47082'
        'patches\fake_adapter.py' = '32cbb6ad7c0deb0de9202404c10a3eac1e03524017c73ad9844e91d8f2ffb329'
        'patches\test_local_adapter_patch_r5.py' = 'dc42401d2a90b9b6a648908be23f1f905b83a34f9fe53fefa2e3486b62e0b3c7'
    }
    foreach ($item in $expected.GetEnumerator()) { [void](Verify-Pinned $item.Key $item.Value) }
    $py = Get-Command py.exe -ErrorAction Stop
    New-Item -ItemType Directory -Path $parent -ErrorAction Stop | Out-Null
    Lock-PrivateAcl $parent $true

    # Only the reviewed local helper runs. All child operations are offline.
    # Never capture raw subprocess output in this PowerShell script.
    & $py.Source '-3' $helper $archive '--output-parent' $parent
    $exitCode = [int]$LASTEXITCODE

    $dirs = @(Get-ChildItem -LiteralPath $parent -Directory |
        Where-Object { $_.Name -like 'OC_DB_R3_LOCAL_EVIDENCE_*' })
    if ($dirs.Count -eq 1) {
        $summary = Join-Path $dirs[0].FullName 'SUMMARY.json'
        if (Test-Path -LiteralPath $summary -PathType Leaf) {
            $state = Get-Content -LiteralPath $summary -Raw | ConvertFrom-Json
            if ($state.status -eq 'LOCAL_EVIDENCE_COLLECTED_INDEPENDENT_AUD_REQUIRED' -or
                $state.status -eq 'INCOMPLETE_OR_FAILED_LOCAL_EVIDENCE' -or
                $state.status -eq 'FAIL_CLOSED_EXCEPTION') {
                $driverStatus = [string]$state.status
            }
        }
    }
    $inputAfter = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($inputAfter -ne $expected['OC_DB_P59_EXECUTOR_FROZEN_R3_AUD_REVIEW.zip']) {
        throw 'R3_ARCHIVE_CHANGED_AFTER_RUN'
    }
    $meta = [ordered]@{
        scope='OFFLINE_ONLY'; hosted='NOT_RUN'; migration='NOT_APPLIED'
        generated_utc=[DateTime]::UtcNow.ToString('o')
        os_version=[Environment]::OSVersion.VersionString
        powershell_version=$PSVersionTable.PSVersion.ToString()
        helper_exit_code=$exitCode
        helper_status=$driverStatus
        r3_zip_sha256=$inputAfter
        r5_helper_sha256=$expected['OC_DB_R3_WINDOWS_OFFLINE_EVIDENCE_R5.py']
        driver='RUN_ALL_OFFLINE_R5.ps1'
        evidence_mode='SANITIZED_AND_PRIVATE'
    }
    $metaPath = Join-Path $parent 'DRIVER_METADATA.json'
    [System.IO.File]::WriteAllText($metaPath, ($meta | ConvertTo-Json -Depth 5),
        (New-Object System.Text.UTF8Encoding($false)))
    Lock-PrivateAcl $metaPath $false

    # Package sanitized evidence even when the helper fails: AUD needs failures too.
    $evidenceItems = @(Get-ChildItem -LiteralPath $parent -Force)
    if ($evidenceItems.Count -lt 1) { throw 'NO_EVIDENCE_ITEMS' }
    Compress-Archive -LiteralPath ($evidenceItems | ForEach-Object FullName) -DestinationPath $outputZip -CompressionLevel Optimal -ErrorAction Stop
    Lock-PrivateAcl $outputZip $false
    $outputHash = (Get-FileHash -LiteralPath $outputZip -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output ('EVIDENCE_ZIP=' + $outputZip)
    Write-Output ('EVIDENCE_SHA256=' + $outputHash)
    Write-Output ('HELPER_EXIT=' + $exitCode)
    Write-Output ('STATUS=' + $driverStatus)
    Write-Output 'AUD_REVIEW_REQUIRED; NOT_HOSTED_TV1_PROOF'
    if ($exitCode -eq 0 -and $driverStatus -eq 'LOCAL_EVIDENCE_COLLECTED_INDEPENDENT_AUD_REQUIRED') { exit 0 }
    exit 1
} catch {
    # Fail closed. Never print an exception message that could contain secrets.
    Write-Output ('LOCAL_RUN_FAILED=' + $_.Exception.GetType().Name)
    Write-Output 'No PASS claimed. Check private local evidence folder; AUD review required.'
    exit 1
}
