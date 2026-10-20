[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $Query,

    [ValidateRange(1, 200)]
    [int] $Limit = 20,

    [string[]] $Path
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$defaultSources = @(
    'docs/TASK_BOARD.md',
    'docs/INTERCOM.md',
    'docs/AUDIT.jsonl',
    'docs/R3_RESULTS.jsonl',
    'docs/SUGGESTIONS.md',
    'docs/ONBOARDING.md',
    'docs/WORKER_PROMPT.md',
    'docs/VERIFIER_PROMPT.md',
    'docs/PROMPT28S_AUDIT_LITE.md',
    'docs/ARCHITECTURE.md',
    'docs/LIMITATIONS.md',
    'docs/RUN_ANALYSIS_login_20261011.md',
    'docs/CLAIMS_MATRIX.md',
    'docs/FINAL_EVAL.md',
    'docs/FINAL_STATE.md',
    'docs/CLAUDE_CHECKPOINT_DUMP.txt',
    'agents/README.md',
    'agents/memory/PROJECT_HANDOFF.md',
    '.agents/skills/project-intercom/SKILL.md',
    '.agents/skills/project-taskboard/SKILL.md',
    'CODEX_PROJECT_MEMORY.md',
    'opencode-memory/memory.jsonl'
)

if ($Path -and $Path.Count -gt 0) {
    $sources = $Path
} else {
    $sources = $defaultSources
}

$pattern = [regex]::new([regex]::Escape($Query), [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
$projectMemoryEntityNames = @(
    'workspace', 'capstone-project', 'campaign-status', 'provider-quotas',
    'open-work', 'agent-conventions', 'tooling', 'review3-program',
    'agent-roles', 'review3-workflow', 'd37-closeout-2026-10-17',
    'prompt27-program-2026-10-17', 'prompt28s-aud-lite',
    'mega-run-onboarding', 'worker-3'
)
$results = [System.Collections.Generic.List[object]]::new()

function Add-MatchResult {
    param([string] $File, [int] $Line, [string] $Text)
    if ($results.Count -ge $Limit) { return }
    $clean = ($Text -replace '\s+', ' ').Trim()
    if ($clean.Length -gt 280) { $clean = $clean.Substring(0, 277) + '...' }
    $results.Add([pscustomobject]@{
        Path = [System.IO.Path]::GetRelativePath($repo, $File)
        Line = $Line
        Excerpt = $clean
    })
}

function Add-JsonStrings {
    param([object] $Value, [string] $File, [int] $Line)
    if ($results.Count -ge $Limit -or $null -eq $Value) { return }
    if ($Value -is [string]) {
        if ($pattern.IsMatch($Value)) { Add-MatchResult -File $File -Line $Line -Text $Value }
        return
    }
    if ($Value -is [System.Collections.IDictionary]) {
        foreach ($entry in $Value.GetEnumerator()) {
            Add-JsonStrings -Value $entry.Value -File $File -Line $Line
            if ($results.Count -ge $Limit) { return }
        }
        return
    }
    if ($Value -is [psobject] -and $Value -isnot [string] -and $Value -isnot [ValueType]) {
        $properties = @($Value.PSObject.Properties | Where-Object { $_.MemberType -in @('NoteProperty', 'Property', 'AliasProperty') })
        if ($properties.Count -gt 0) {
            foreach ($property in $properties) {
                Add-JsonStrings -Value $property.Value -File $File -Line $Line
                if ($results.Count -ge $Limit) { return }
            }
            return
        }
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        foreach ($item in $Value) {
            Add-JsonStrings -Value $item -File $File -Line $Line
            if ($results.Count -ge $Limit) { return }
        }
    }
}

foreach ($source in $sources) {
    if ($results.Count -ge $Limit) { break }
    $candidate = if ([System.IO.Path]::IsPathRooted($source)) { $source } else { Join-Path $repo $source }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $file = (Resolve-Path -LiteralPath $candidate).Path

    $allLines = [System.IO.File]::ReadAllLines($file)
    $reverse = [System.IO.Path]::GetFileName($file) -in @('INTERCOM.md', 'SUGGESTIONS.md', 'AUDIT.jsonl', 'R3_RESULTS.jsonl', 'memory.jsonl')
    $indexes = if ($reverse) { ($allLines.Length - 1)..0 } else { 0..($allLines.Length - 1) }

    if ([System.IO.Path]::GetFileName($file) -eq 'memory.jsonl') {
        foreach ($index in $indexes) {
            if ($results.Count -ge $Limit) { break }
            $line = $allLines[$index]
            $lineNo = $index + 1
            try {
                $record = ConvertFrom-Json -InputObject $line -ErrorAction Stop
                if ($record.type -ne 'entity' -or $record.name -notin $projectMemoryEntityNames) { continue }
                $before = $results.Count
                Add-JsonStrings -Value $record -File $file -Line $lineNo
                if ($results.Count -eq $before -and $pattern.IsMatch($line)) {
                    Add-MatchResult -File $file -Line $lineNo -Text $line
                }
            } catch {
                $isProjectRecord = $false
                foreach ($entityName in $projectMemoryEntityNames) {
                    $namePattern = '"name"\s*:\s*"' + [regex]::Escape($entityName) + '"'
                    if ([regex]::IsMatch($line, $namePattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
                        $isProjectRecord = $true
                        break
                    }
                }
                if ($isProjectRecord -and $pattern.IsMatch($line)) { Add-MatchResult -File $file -Line $lineNo -Text $line }
            }
        }
    } else {
        foreach ($index in $indexes) {
            if ($results.Count -ge $Limit) { break }
            if ($pattern.IsMatch($allLines[$index])) { Add-MatchResult -File $file -Line ($index + 1) -Text $allLines[$index] }
        }
    }
}

if ($results.Count -eq 0) {
    'No matches.'
} else {
    $results | Format-Table -Wrap -AutoSize | Out-String -Width 220
}
