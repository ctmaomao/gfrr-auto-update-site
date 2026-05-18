# Manual operator wrapper for the weekly QQQ Market Pricing refresh.
# Use -? or -Help for usage. This script is not for CI.
param(
  [Alias('?')]
  [switch]$Help,
  [Alias('NoBrowser')]
  [switch]$SkipBrowser,
  [string]$CsvPath,
  [switch]$AutoConfirm,
  [switch]$DryRun,
  [switch]$NoCommit
)

$ErrorActionPreference = 'Stop'

$ExpectedHeader = 'Date,Close/Last,Volume,Open,High,Low'
$NasdaqUrl = 'https://www.nasdaq.com/market-activity/etf/qqq/historical'
$InputDirRelative = 'manual-artifacts/market-pricing/manual-weekly-input'
$SanitizedOutputRelative = 'manual-artifacts/market-pricing/sanitized-output'
$HistoryFile = 'data/market-pricing-history.json'
$MetricsFile = 'data/market-pricing-metrics.json'
$DownloadPattern = 'HistoricalData_*.csv'

function Write-Info($Message) {
  Write-Host $Message -ForegroundColor Cyan
}

function Write-Ok($Message) {
  Write-Host $Message -ForegroundColor Green
}

function Write-Warn($Message) {
  Write-Host $Message -ForegroundColor Yellow
}

function Fail($Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
  Write-Error -Message $Message -ErrorAction Stop
}

function Show-Usage {
  @"
QQQ weekly refresh wrapper

Usage:
  powershell -ExecutionPolicy Bypass -File scripts\refresh-qqq-data.ps1 [options]

Options:
  -SkipBrowser / -NoBrowser   Skip opening Nasdaq.com and poll Downloads only.
  -CsvPath <path>             Use an existing HistoricalData_*.csv directly.
  -AutoConfirm                Skip the human commit confirmation.
  -DryRun                     Run through sanitizer + M-24 dry-run only.
  -NoCommit                   Run through check:all, then skip git commit/push.
  -? / -Help                  Print this usage screen.

Operator flow:
  1. The script opens Nasdaq QQQ historical data in your default browser.
  2. Click 1M (or 6M if you missed a week), then Download Data.
  3. The script validates, moves, sanitizes, previews, confirms, writes,
     recomputes metrics, runs check:all, then commits and pushes data files.

This is a manual operator tool, not a CI workflow.
"@
}

function Get-RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $scriptDir '..')).Path
}

function Invoke-LoggedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$StepName
  )

  Write-Info "Running: $FilePath $($ArgumentList -join ' ')"
  $lines = @()
  & $FilePath @ArgumentList 2>&1 | ForEach-Object {
    $line = $_.ToString()
    $lines += $line
    Write-Host $line
  }
  $exitCode = $LASTEXITCODE

  if ($exitCode -ne 0) {
    Fail "$StepName failed with exit code $exitCode. Review the output above and fix that step before retrying."
  }

  return ($lines -join [Environment]::NewLine)
}

function Invoke-LoggedCommandAllowFail {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList
  )

  $lines = @()
  & $FilePath @ArgumentList 2>&1 | ForEach-Object {
    $line = $_.ToString()
    $lines += $line
    Write-Host $line
  }
  return @{
    ExitCode = $LASTEXITCODE
    Output = ($lines -join [Environment]::NewLine)
  }
}

function Read-ChoiceWithTimeout {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [Parameter(Mandatory = $true)][string[]]$Allowed,
    [Parameter(Mandatory = $true)][string]$Default,
    [int]$TimeoutSeconds = 30
  )

  Write-Host $Prompt -NoNewline -ForegroundColor Yellow
  Write-Host " " -NoNewline
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ([Console]::KeyAvailable) {
      $key = [Console]::ReadKey($true).KeyChar.ToString()
      Write-Host $key
      foreach ($allowedValue in $Allowed) {
        if ($key.Equals($allowedValue, [System.StringComparison]::OrdinalIgnoreCase)) {
          return $allowedValue.ToUpperInvariant()
        }
      }
      Write-Warn "Invalid choice '$key'. Allowed: $($Allowed -join '/')."
      Write-Host $Prompt -NoNewline -ForegroundColor Yellow
      Write-Host " " -NoNewline
    }
    Start-Sleep -Milliseconds 200
  }

  Write-Host ""
  Write-Warn "No input within $TimeoutSeconds seconds. Defaulting to $Default."
  return $Default.ToUpperInvariant()
}

function Read-JsonFile($Path, $Label) {
  if (!(Test-Path -LiteralPath $Path)) {
    Fail "$Label does not exist at $Path. Investigate the preceding command output."
  }

  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    Fail "$Label exists but is not valid JSON: $Path. Error: $($_.Exception.Message)"
  }
}

function Get-LatestSanitizerReport($Since) {
  $base = Join-Path (Get-Location) $SanitizedOutputRelative
  if (!(Test-Path -LiteralPath $base)) {
    Fail "Sanitized output directory is missing: $SanitizedOutputRelative. The sanitizer did not write output."
  }

  $candidate = Get-ChildItem -LiteralPath $base -Directory |
    Where-Object {
      $_.LastWriteTime -ge $Since -and
      (Test-Path -LiteralPath (Join-Path $_.FullName 'sanitization-report.json'))
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($null -eq $candidate) {
    Fail "No new sanitized-output/<timestamp>/sanitization-report.json found after sanitizer run. The sanitizer exits 0 for some no-output cases; inspect $SanitizedOutputRelative."
  }

  return Join-Path $candidate.FullName 'sanitization-report.json'
}

function Assert-DataFilesClean {
  $status = & git status --porcelain -- $HistoryFile $MetricsFile
  if ($LASTEXITCODE -ne 0) {
    Fail "git status failed while checking data file cleanliness."
  }
  if ($status) {
    Fail "$HistoryFile or $MetricsFile already has uncommitted changes. Commit/stash/revert them before running this refresh."
  }
}

function Wait-ForDownloadedCsv {
  param(
    [Parameter(Mandatory = $true)][datetime]$StartTime,
    [int]$TimeoutSeconds = 300
  )

  $downloads = Join-Path $env:USERPROFILE 'Downloads'
  if (!(Test-Path -LiteralPath $downloads)) {
    Fail "Downloads folder not found at $downloads. Use -CsvPath to provide the CSV directly."
  }

  Write-Info "Polling $downloads for $DownloadPattern newer than $StartTime ..."
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $candidate = Get-ChildItem -LiteralPath $downloads -Filter $DownloadPattern -File |
      Where-Object { $_.LastWriteTime -ge $StartTime } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1

    if ($null -ne $candidate) {
      $size1 = $candidate.Length
      Start-Sleep -Seconds 1
      $candidate.Refresh()
      if ($candidate.Length -eq $size1) {
        Write-Ok "Detected: $($candidate.Name) (mtime=$($candidate.LastWriteTime))"
        return $candidate.FullName
      }
    }

    Start-Sleep -Seconds 2
  }

  Fail "No fresh $DownloadPattern detected within 5 minutes. In Nasdaq.com, choose 1M or 6M, click Download Data, then retry. You can also use -CsvPath."
}

function Validate-CsvHeader($Path) {
  if (!(Test-Path -LiteralPath $Path)) {
    Fail "CSV file not found: $Path"
  }

  $firstLine = Get-Content -LiteralPath $Path -TotalCount 1
  if ($firstLine -ne $ExpectedHeader) {
    Fail "CSV header mismatch. Expected '$ExpectedHeader' but got '$firstLine'. Nasdaq may have changed the export format; inspect the CSV before retrying."
  }
  Write-Ok "CSV header validated: $ExpectedHeader"
}

function Move-CsvToInputDir {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$Today
  )

  $inputDir = Join-Path (Get-Location) $InputDirRelative
  if (!(Test-Path -LiteralPath $inputDir)) {
    New-Item -ItemType Directory -Force -Path $inputDir | Out-Null
  }

  $targetPath = Join-Path $inputDir "$Today.csv"
  if (Test-Path -LiteralPath $targetPath) {
    $choice = Read-ChoiceWithTimeout -Prompt "File $Today.csv already exists in input dir. [O]verwrite, [S]kip, [A]bort? (default A)" -Allowed @('O', 'S', 'A') -Default 'A' -TimeoutSeconds 30
    if ($choice -eq 'A') {
      Fail "Operator aborted because $targetPath already exists."
    }
    if ($choice -eq 'S') {
      Write-Warn "Skipping move. Existing input file will be used: $targetPath"
      return $targetPath
    }
    Remove-Item -LiteralPath $targetPath -Force
  }

  Move-Item -LiteralPath $SourcePath -Destination $targetPath
  Write-Ok "Moved CSV to $targetPath"
  return $targetPath
}

function Validate-SanitizerReport($ReportPath) {
  $report = Read-JsonFile -Path $ReportPath -Label 'sanitization-report.json'
  $expectedWeeksField = 'totalWeeksProduced'
  if ($null -eq $report.PSObject.Properties[$expectedWeeksField]) {
    Fail "Sanitizer report at $ReportPath missing expected field '$expectedWeeksField'. The sanitizer was updated without updating this wrapper - read scripts/market-pricing/manual-weekly-input-sanitizer-scaffold.mjs and update Validate-SanitizerReport."
  }

  $weeksProduced = 0
  if (-not [int]::TryParse([string]$report.totalWeeksProduced, [ref]$weeksProduced)) {
    Fail "Sanitizer report at $ReportPath has non-numeric expected field '$expectedWeeksField'. The sanitizer was updated without updating this wrapper - read scripts/market-pricing/manual-weekly-input-sanitizer-scaffold.mjs and update Validate-SanitizerReport."
  }

  $headerMismatch = 0
  if ($null -ne $report.rejectionsByReason -and $null -ne $report.rejectionsByReason.header_mismatch) {
    $headerMismatch = [int]$report.rejectionsByReason.header_mismatch
  }

  if ($headerMismatch -gt 0) {
    Fail "Sanitizer report indicates header_mismatch. Inspect $ReportPath and the CSV header."
  }
  if ($weeksProduced -le 0) {
    Fail "Sanitizer produced zero weekly records. Inspect $ReportPath for rejected rows or file-name issues."
  }

  Write-Ok "Sanitizer produced $weeksProduced weekly records. Report: $ReportPath"
  return $report
}

function Parse-MergeSummary($Output) {
  $match = [regex]::Match($Output, 'would_merge_summary=incoming=(\d+), added=(\d+), updated=(\d+), total=(\d+)')
  if (!$match.Success) {
    Fail "M-24 dry-run succeeded but did not print would_merge_summary. Ensure PR #223 / M-62 is present on this branch."
  }

  $updatedLine = [regex]::Match($Output, 'would_update_iso_weeks=([^\r\n]+)')
  $updatedIsoWeeks = ''
  if ($updatedLine.Success) {
    $updatedIsoWeeks = $updatedLine.Groups[1].Value
  }

  return @{
    Incoming = [int]$match.Groups[1].Value
    Added = [int]$match.Groups[2].Value
    Updated = [int]$match.Groups[3].Value
    Total = [int]$match.Groups[4].Value
    UpdatedIsoWeeks = $updatedIsoWeeks
  }
}

function Confirm-Commit($Summary) {
  Write-Host ""
  Write-Warn "About to commit: added $($Summary.Added) new isoWeeks, updated $($Summary.Updated) existing isoWeeks. Total history records will be $($Summary.Total)."
  if ($Summary.Updated -gt 0) {
    Write-Warn "WARNING: $($Summary.Updated) existing weeks will be revised. Updated isoWeeks: $($Summary.UpdatedIsoWeeks)"
    Write-Warn "This usually means Nasdaq republished historical data. Proceed only if this looks correct."
  }

  if ($AutoConfirm) {
    Write-Warn "WARNING: -AutoConfirm enabled. Bypassing all operator review."
    Write-Warn "Updated isoWeeks (if any) will be committed WITHOUT human inspection. Use only in trusted automation."
    return
  }

  $choice = Read-ChoiceWithTimeout -Prompt "Proceed with commit? [Y/N] (default N)" -Allowed @('Y', 'N') -Default 'N' -TimeoutSeconds 60
  if ($choice -ne 'Y') {
    Fail "Operator declined commit. No history or metrics commit was run."
  }
}

function Print-LatestMetricsSummary {
  $metrics = Read-JsonFile -Path $MetricsFile -Label $MetricsFile
  if ($null -eq $metrics.records -or $metrics.records.Count -eq 0) {
    Write-Warn "Metrics file has no records to summarize."
    return
  }

  Write-Info "Latest metric records:"
  $start = [Math]::Max(0, $metrics.records.Count - 3)
  for ($i = $start; $i -lt $metrics.records.Count; $i += 1) {
    $record = $metrics.records[$i]
    Write-Host ("  {0}: close={1} ma60={2} zScore={3}" -f $record.date, $record.close, $record.ma60, $record.zScore)
  }
}

function Main {
  if ($Help) {
    Show-Usage
    return
  }

  # Step 1: pre-flight checks.
  $repoRoot = Get-RepoRoot
  Set-Location $repoRoot
  if (!(Test-Path -LiteralPath 'package.json') -or !(Test-Path -LiteralPath '.git')) {
    Fail "Script must run inside the gfrr-auto-update-site repo root. Could not find package.json + .git at $repoRoot."
  }

  $nodeVersion = (& node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(24|25)\.') {
    Fail "Node.js 24.x (or forward-compatible 25.x) is required. Found '$nodeVersion'. Install/use Node 24 before retrying."
  }
  Write-Ok "Node version OK: $nodeVersion"

  & git --version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Fail "git is not available on PATH."
  }

  $inputDir = Join-Path $repoRoot $InputDirRelative
  if (!(Test-Path -LiteralPath $inputDir)) {
    New-Item -ItemType Directory -Force -Path $inputDir | Out-Null
    Write-Ok "Created input directory: $InputDirRelative"
  }

  Assert-DataFilesClean

  # Step 2: date setup.
  $today = (Get-Date).ToString('yyyy-MM-dd')
  $scriptStart = Get-Date
  Write-Info "Refresh date: $today"

  # Steps 3-4: browser open and download polling, unless CsvPath is provided.
  $csvToUse = $CsvPath
  if ([string]::IsNullOrWhiteSpace($csvToUse)) {
    if (!$SkipBrowser) {
      Start-Process $NasdaqUrl
      Write-Warn "Browser opened. In Nasdaq.com: (a) click the [1M] time range selector (or 6M if you missed a week), (b) click Download Data. Then return to this terminal - file detection is automatic."
    } else {
      Write-Warn "Browser open skipped. Waiting for an already-started download."
    }
    $csvToUse = Wait-ForDownloadedCsv -StartTime $scriptStart
  } else {
    $csvToUse = (Resolve-Path $csvToUse).Path
    Write-Info "Using provided CSV: $csvToUse"
  }

  # Steps 5-6: header validation, rename, and move to manual input dir.
  Validate-CsvHeader -Path $csvToUse
  $inputCsv = Move-CsvToInputDir -SourcePath $csvToUse -Today $today
  Write-Info "Input CSV ready: $inputCsv"

  # Step 7: run sanitizer and validate its report.
  $sanitizerStart = Get-Date
  Invoke-LoggedCommand -FilePath 'npm' -ArgumentList @('run', 'market-pricing:manual-weekly-input-sanitizer:run') -StepName 'M-23 sanitizer' | Out-Null
  $sanitizerReportPath = Get-LatestSanitizerReport -Since $sanitizerStart
  Validate-SanitizerReport -ReportPath $sanitizerReportPath | Out-Null

  # Step 8: M-24 dry-run preview and merge summary parse.
  $dryRunOutput = Invoke-LoggedCommand -FilePath 'npm' -ArgumentList @('run', 'market-pricing:first-real-record-write:dry-run') -StepName 'M-24 history merge dry-run'
  $mergeSummary = Parse-MergeSummary -Output $dryRunOutput

  if ($DryRun) {
    Write-Ok "DryRun requested. Stopping after M-24 dry-run preview; no history, metrics, check:all, git commit, or push performed."
    return
  }

  # Step 9: human confirmation.
  Confirm-Commit -Summary $mergeSummary

  # Step 10: commit merged history and verify JSON.
  Invoke-LoggedCommand -FilePath 'npm' -ArgumentList @('run', 'market-pricing:first-real-record-write:commit') -StepName 'M-24 history merge commit' | Out-Null
  Read-JsonFile -Path $HistoryFile -Label $HistoryFile | Out-Null
  Write-Ok "$HistoryFile exists and parses as JSON."

  # Step 11: recompute metrics and verify JSON.
  Invoke-LoggedCommand -FilePath 'npm' -ArgumentList @('run', 'market-pricing:metrics-calculation:commit') -StepName 'M-26 metrics commit' | Out-Null
  Read-JsonFile -Path $MetricsFile -Label $MetricsFile | Out-Null
  Write-Ok "$MetricsFile exists and parses as JSON."

  # Step 12: final full check before any git commit.
  Invoke-LoggedCommand -FilePath 'npm' -ArgumentList @('run', 'check:all') -StepName 'check:all' | Out-Null

  if ($NoCommit) {
    Write-Warn "NoCommit requested. Data files were refreshed and check:all passed, but git add/commit/push was skipped."
    Print-LatestMetricsSummary
    return
  }

  # Step 13: git stage, commit, push.
  & git add $HistoryFile $MetricsFile
  if ($LASTEXITCODE -ne 0) {
    Fail "git add failed for refreshed data files."
  }

  $commitMessage = "chore: refresh QQQ weekly market data ($today, added=$($mergeSummary.Added) updated=$($mergeSummary.Updated) total=$($mergeSummary.Total))"
  & git commit -m $commitMessage
  if ($LASTEXITCODE -ne 0) {
    Fail "git commit failed. If there are no staged changes, inspect $HistoryFile and $MetricsFile."
  }

  $branch = (& git branch --show-current).Trim()
  if ([string]::IsNullOrWhiteSpace($branch)) {
    Fail "Unable to determine current git branch before push."
  }
  & git push origin $branch
  if ($LASTEXITCODE -ne 0) {
    Fail "git push failed for branch $branch. Resolve git remote/auth issues and push manually if needed."
  }

  # Step 14: cleanup/final summary.
  Write-Ok "Refresh complete. $($mergeSummary.Added) new weeks, $($mergeSummary.Updated) updated, total history: $($mergeSummary.Total) records. Commit pushed to $branch."
  Print-LatestMetricsSummary
}

try {
  Main
} catch {
  Write-Host ""
  Write-Host "QQQ weekly refresh aborted." -ForegroundColor Red
  Write-Host "What to do next: read the error above, inspect the named file or npm step, fix the input, then rerun the script. No step is silently continued." -ForegroundColor Yellow
  exit 1
}
