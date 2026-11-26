[CmdletBinding()]
param(
    [string]$JavaHome = $(if ($env:JAVA_HOME) { $env:JAVA_HOME } else {
        Join-Path $env:LOCALAPPDATA 'LonetiSmileCollector/toolchain/jdk'
    }),
    [string]$AndroidSdk = $(if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) {
        $env:ANDROID_HOME
    } else { Join-Path $env:LOCALAPPDATA 'LonetiSmileCollector/toolchain/sdk' }),
    [string]$BuildToolsVersion = '35.0.1',
    [string]$SigningDirectory = (Join-Path $env:LOCALAPPDATA 'LonetiSmileCollector/signing')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-BuildTool {
    param([string]$Tool, [string[]]$Arguments)
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$(Split-Path $Tool -Leaf) failed (exit $LASTEXITCODE)."
    }
}

$buildTools = Join-Path $AndroidSdk "build-tools/$BuildToolsVersion"
$androidJar = Join-Path $AndroidSdk 'platforms/android-35/android.jar'
$java = Join-Path $JavaHome 'bin/java.exe'
$javac = Join-Path $JavaHome 'bin/javac.exe'
$aapt2 = Join-Path $buildTools 'aapt2.exe'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$d8 = Join-Path $buildTools 'lib/d8.jar'
$apksigner = Join-Path $buildTools 'lib/apksigner.jar'
foreach ($path in @($java, $javac, $aapt2, $zipalign, $d8, $apksigner, $androidJar)) {
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required Android build tool missing at $path" }
}

$keystore = Join-Path $SigningDirectory 'release.p12'
$protectedPassword = Join-Path $SigningDirectory 'release-password.dpapi'
if (!(Test-Path -LiteralPath $keystore -PathType Leaf) -or
    !(Test-Path -LiteralPath $protectedPassword -PathType Leaf)) {
    throw "The release key and its protected password are required in $SigningDirectory"
}

$manifest = Join-Path $PSScriptRoot 'AndroidManifest.xml'
$manifestXml = [xml](Get-Content -LiteralPath $manifest -Raw)
$androidNamespace = 'http://schemas.android.com/apk/res/android'
$versionCode = $manifestXml.DocumentElement.GetAttribute('versionCode', $androidNamespace)
$versionName = $manifestXml.DocumentElement.GetAttribute('versionName', $androidNamespace)
$sourceRoot = Join-Path $PSScriptRoot 'src'
$resources = Join-Path $PSScriptRoot 'res'
$collector = Join-Path (Split-Path $PSScriptRoot -Parent) 'loneti-smile-collector.user.js'
$extraAssets = Join-Path $PSScriptRoot 'assets'
$outputRoot = Join-Path $PSScriptRoot 'build'
$outputApk = Join-Path $outputRoot 'Loneti-Smile-Collector.apk'
$stage = Join-Path $outputRoot ([Guid]::NewGuid().ToString('N'))
$assets = Join-Path $stage 'assets'
$generated = Join-Path $stage 'gen'
$classes = Join-Path $stage 'classes'
$dex = Join-Path $stage 'dex'

New-Item -ItemType Directory -Path $assets, $generated, $classes, $dex -Force | Out-Null
try {
    if (Test-Path -LiteralPath $extraAssets -PathType Container) {
        Get-ChildItem -LiteralPath $extraAssets -Force | Copy-Item -Destination $assets -Recurse -Force
    }
    Copy-Item -LiteralPath $collector -Destination (Join-Path $assets 'collector.user.js') -Force

    $compiledResources = Join-Path $stage 'resources.zip'
    $unsignedApk = Join-Path $stage 'unsigned.apk'
    $alignedApk = Join-Path $stage 'aligned.apk'
    $signedApk = Join-Path $stage 'signed.apk'
    Invoke-BuildTool $aapt2 @('compile', '--dir', $resources, '-o', $compiledResources)
    Invoke-BuildTool $aapt2 @('link', '-o', $unsignedApk, '-I', $androidJar, '--manifest', $manifest,
        '--java', $generated, '--min-sdk-version', '26', '--target-sdk-version', '35',
        '-A', $assets, $compiledResources)

    $javaSources = @(Get-ChildItem -LiteralPath @($sourceRoot, $generated) -File -Filter '*.java' -Recurse |
        Sort-Object FullName | ForEach-Object FullName)
    if (!$javaSources.Count) { throw 'No Java sources found.' }
    Invoke-BuildTool $javac (@('--release', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-classpath', $androidJar,
        '-d', $classes) + $javaSources)

    $classFiles = @(Get-ChildItem -LiteralPath $classes -File -Filter '*.class' -Recurse |
        Sort-Object FullName | ForEach-Object FullName)
    Invoke-BuildTool $java (@('-cp', $d8, 'com.android.tools.r8.D8', '--release', '--min-api', '26',
        '--lib', $androidJar, '--output', $dex) + $classFiles)
    if (!(Test-Path -LiteralPath (Join-Path $dex 'classes.dex') -PathType Leaf)) {
        throw 'D8 did not produce the primary DEX file.'
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $apk = [IO.Compression.ZipFile]::Open($unsignedApk, [IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($file in Get-ChildItem -LiteralPath $dex -File -Filter 'classes*.dex' | Sort-Object Name) {
            $entry = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($apk, $file.FullName, $file.Name)
            $entry.LastWriteTime = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
        }
    } finally {
        $apk.Dispose()
    }

    Invoke-BuildTool $zipalign @('-P', '16', '-f', '4', $unsignedApk, $alignedApk)

    $signingPassword = Get-Content -LiteralPath $protectedPassword -Raw | ConvertTo-SecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($signingPassword)
    $priorPassword = $env:LONETI_APK_STORE_PASSWORD
    try {
        $env:LONETI_APK_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        Invoke-BuildTool $java @('-jar', $apksigner, 'sign', '--ks', $keystore, '--ks-type', 'PKCS12',
            '--ks-key-alias', 'release', '--ks-pass', 'env:LONETI_APK_STORE_PASSWORD',
            '--v4-signing-enabled', 'false', '--out', $signedApk, $alignedApk)
    } finally {
        $env:LONETI_APK_STORE_PASSWORD = $priorPassword
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
        $signingPassword.Dispose()
    }

    Invoke-BuildTool $zipalign @('-c', '-P', '16', '4', $signedApk)
    Invoke-BuildTool $java @('-jar', $apksigner, 'verify', '--verbose', '--print-certs', $signedApk)
    $badging = Invoke-BuildTool $aapt2 @('dump', 'badging', $signedApk)
    $identity = "package: name='org.bedrockbender.lonetismiles' versionCode='$versionCode' versionName='$versionName'"
    if (!($badging -match ('^' + [regex]::Escape($identity))) -or
        ($badging -notcontains "minSdkVersion:'26'" -and $badging -notcontains "sdkVersion:'26'") -or
        $badging -notcontains "targetSdkVersion:'35'" -or
        !($badging -match '^launchable-activity:')) {
        throw 'The APK manifest identity, versions, SDK levels or launcher are unexpected.'
    }
    $badging | Where-Object { $_ -match '^(package:|(?:minSdk|sdk|targetSdk)Version:|launchable-activity:)' }

    $apk = [IO.Compression.ZipFile]::OpenRead($signedApk)
    try {
        $bundledCollector = $apk.GetEntry('assets/collector.user.js')
        if ($null -eq $bundledCollector) { throw 'The APK is missing the collector asset.' }
        $assetStream = $bundledCollector.Open()
        try {
            if ((Get-FileHash -InputStream $assetStream).Hash -ne (Get-FileHash -LiteralPath $collector).Hash) {
                throw 'The bundled collector does not match the website userscript.'
            }
        } finally {
            $assetStream.Dispose()
        }
    } finally {
        $apk.Dispose()
    }

    Move-Item -LiteralPath $signedApk -Destination $outputApk -Force
    Write-Output "Built $outputApk"
} finally {
    $resolvedStage = (Resolve-Path -LiteralPath $stage).ProviderPath
    $resolvedOutput = (Resolve-Path -LiteralPath $outputRoot).ProviderPath
    if ((Split-Path -Parent $resolvedStage) -eq $resolvedOutput) {
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
