param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$distPath = Join-Path $projectRoot "dist"
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$releaseVersion = [string]$manifest.version

if ($Version -and $Version -ne $releaseVersion) {
  throw "Requested version $Version does not match manifest version $releaseVersion."
}

if ($manifest.name -ne "SILroom-Dev") {
  throw "The unpacked manifest must use the SILroom-Dev name."
}

New-Item -ItemType Directory -Path $distPath -Force | Out-Null
$stagePath = Join-Path $distPath (".silroom-webstore-stage-" + [guid]::NewGuid().ToString("N"))
$destination = Join-Path $distPath "SILroom-$releaseVersion-webstore-upload.zip"
$packageItems = @(
  "manifest.json",
  "popup.html",
  "popup.js",
  "README.md",
  "assets",
  "src",
  "styles"
)

try {
  New-Item -ItemType Directory -Path $stagePath -Force | Out-Null
  foreach ($item in $packageItems) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $item) -Destination $stagePath -Recurse -Force
  }

  $releaseManifestPath = Join-Path $stagePath "manifest.json"
  $releaseManifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $releaseManifestPath | ConvertFrom-Json
  $releaseManifest.name = "SILroom"
  $releaseManifest.action.default_title = "SILroom"
  $releaseManifestJson = $releaseManifest | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($releaseManifestPath, $releaseManifestJson, [Text.UTF8Encoding]::new($false))

  Compress-Archive -Path (Join-Path $stagePath "*") -DestinationPath $destination -CompressionLevel Optimal -Force

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($destination)
  try {
    $manifestEntry = $archive.GetEntry("manifest.json")
    if (-not $manifestEntry) {
      throw "The packaged manifest is missing."
    }

    $reader = [IO.StreamReader]::new($manifestEntry.Open())
    try {
      $packagedManifest = $reader.ReadToEnd() | ConvertFrom-Json
    } finally {
      $reader.Dispose()
    }

    $blockedEntries = @(
      $archive.Entries | Where-Object {
        $_.FullName -match '^(dist|tests|docs|store-assets|scripts)/' -or
        $_.FullName -match '^\.playwright-cli/'
      }
    )

    if ($packagedManifest.name -ne "SILroom") {
      throw "The packaged extension name is not SILroom."
    }
    if ($packagedManifest.action.default_title -ne "SILroom") {
      throw "The packaged action title is not SILroom."
    }
    if ([string]$packagedManifest.version -ne $releaseVersion) {
      throw "The packaged version does not match $releaseVersion."
    }
    if ($blockedEntries.Count -gt 0) {
      throw "Development-only files were included in the package."
    }

    [pscustomobject]@{
      ok = $true
      zip = (Resolve-Path -LiteralPath $destination).Path
      name = $packagedManifest.name
      version = [string]$packagedManifest.version
      entries = $archive.Entries.Count
      bytes = (Get-Item -LiteralPath $destination).Length
    } | ConvertTo-Json
  } finally {
    $archive.Dispose()
  }
} finally {
  if (Test-Path -LiteralPath $stagePath) {
    $resolvedDist = [IO.Path]::GetFullPath($distPath)
    $resolvedStage = [IO.Path]::GetFullPath($stagePath)
    if (-not $resolvedStage.StartsWith($resolvedDist + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Unsafe staging path: $resolvedStage"
    }
    if (-not (Split-Path -Leaf $resolvedStage).StartsWith(".silroom-webstore-stage-")) {
      throw "Unexpected staging folder: $resolvedStage"
    }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
}
