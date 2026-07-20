<#
.SYNOPSIS
  Audits Windows licensing status across a list of hosts and writes a JSON
  report matching the shape of data/licenses.js.

.DESCRIPTION
  Phase 1 (now): run this by hand from a machine that can reach your hosts
  over WinRM (or run it locally on each host with -ComputerName the local
  name). Review the output, then hand-copy the confirmed expiresOn / status
  values into data/licenses.js.

  Phase 2 (later): once you trust the output, wrap this same script in a
  Scheduled Task (daily) on a jump box. Point -OutFile at a path your git
  remote can push from, or POST the JSON to wherever the dashboard fetches
  live data from. No other change needed — the schema already matches
  data/licenses.js.

.EXAMPLE
  .\audit-licenses.ps1 -ComputerName HV10,HV11,DC-98,DC-99 -OutFile licenses-audit.json

.NOTES
  Requires WinRM enabled on target hosts (Enable-PSRemoting) and an account
  with local admin rights on each. Run from an elevated PowerShell prompt.
#>
param(
  [Parameter(Mandatory = $true)]
  [string[]]$ComputerName,

  [string]$OutFile = "licenses-audit.json"
)

# LicenseStatus enum from SoftwareLicensingProduct:
#   0 Unlicensed | 1 Licensed | 2 OOBGrace | 3 OOTGrace
#   4 NonGenuineGrace | 5 Notification | 6 ExtendedGrace
$statusMap = @{
  0 = "Unlicensed"
  1 = "Licensed"
  2 = "Out-of-box grace"
  3 = "Out-of-tolerance grace"
  4 = "Non-genuine grace"
  5 = "Notification (license lapsed — this is what forces reboots)"
  6 = "Extended grace"
}

$results = foreach ($computer in $ComputerName) {
  Write-Host "Auditing $computer..." -ForegroundColor Cyan
  try {
    $scriptBlock = {
      Get-CimInstance -ClassName SoftwareLicensingProduct -Filter "PartialProductKey is not null" |
        Select-Object Name, Description, LicenseStatus, GracePeriodRemaining, PartialProductKey
    }

    if ($computer -eq $env:COMPUTERNAME) {
      $products = & { Invoke-Command -ScriptBlock $scriptBlock }
    } else {
      $products = Invoke-Command -ComputerName $computer -ScriptBlock $scriptBlock -ErrorAction Stop
    }

    foreach ($p in $products) {
      $expiresOn = $null
      # GracePeriodRemaining is in minutes; only meaningful once the license
      # has left the fully-licensed state (status 1).
      if ($p.LicenseStatus -ne 1 -and $p.GracePeriodRemaining -gt 0) {
        $expiresOn = (Get-Date).AddMinutes($p.GracePeriodRemaining).ToString("yyyy-MM-dd")
      }

      [PSCustomObject]@{
        host       = $computer
        product    = $p.Name
        description = $p.Description
        licenseStatus = $statusMap[[int]$p.LicenseStatus]
        expiresOn  = $expiresOn
        auditedAt  = (Get-Date).ToString("o")
      }
    }
  } catch {
    Write-Warning "Failed to audit $computer`: $($_.Exception.Message)"
    [PSCustomObject]@{
      host       = $computer
      product    = $null
      description = $null
      licenseStatus = "AUDIT FAILED — $($_.Exception.Message)"
      expiresOn  = $null
      auditedAt  = (Get-Date).ToString("o")
    }
  }
}

$results | ConvertTo-Json -Depth 4 | Out-File -FilePath $OutFile -Encoding utf8
Write-Host "`nWrote $($results.Count) record(s) to $OutFile" -ForegroundColor Green
$results | Format-Table host, product, licenseStatus, expiresOn -AutoSize
