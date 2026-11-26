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

function Get-AndroidXDependency {
    param([string]$Artifact, [string]$Sha256)

    $name = Split-Path $Artifact -Leaf
    $file = Join-Path $dependencyCache $name
    if (!(Test-Path -LiteralPath $file -PathType Leaf) -or
        (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $Sha256) {
        $download = Join-Path $stage $name
        Invoke-WebRequest -UseBasicParsing -Uri "https://dl.google.com/dl/android/maven2/$Artifact" -OutFile $download
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $Sha256) {
            throw "SHA256 verification failed for $name."
        }
        Move-Item -LiteralPath $download -Destination $file -Force
    }
    return $file
}

function Expand-DependencyEntry {
    param([string]$Archive, [string]$EntryName, [string]$Destination)

    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        $entry = $zip.GetEntry($EntryName)
        if ($null -eq $entry) { throw "$EntryName is missing from $(Split-Path $Archive -Leaf)." }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $Destination)
    } finally {
        $zip.Dispose()
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
$packExport = Join-Path $PSScriptRoot 'assets/pack-export.js'
$thirdPartyLicenses = Join-Path $PSScriptRoot 'licenses'
$outputRoot = Join-Path $PSScriptRoot 'build'
$outputApk = Join-Path $outputRoot 'Loneti-essentials.apk'
$dependencyCache = Join-Path $outputRoot 'dependencies'
$stage = Join-Path $outputRoot ([Guid]::NewGuid().ToString('N'))
$assets = Join-Path $stage 'assets'
$generated = Join-Path $stage 'gen'
$classes = Join-Path $stage 'classes'
$dex = Join-Path $stage 'dex'

Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Path $assets, $generated, $classes, $dex, $dependencyCache -Force | Out-Null
try {
    $webkitAar = Get-AndroidXDependency 'androidx/webkit/webkit/1.9.0/webkit-1.9.0.aar' `
        '27BC203135F05B984FC218D5A9C709F0949A19A488615F2349EBDCD9E6F722A2'
    $coreAar = Get-AndroidXDependency 'androidx/core/core/1.1.0/core-1.1.0.aar' `
        '76C7CFBE596FE3C09A6983BF1C89E889299C08AC9A3B52CE5182A088D056647E'
    $annotations = Get-AndroidXDependency 'androidx/annotation/annotation/1.2.0/annotation-1.2.0.jar' `
        '9029262BDDCE116E6D02BE499E4AFDBA21F24C239087B76B3B57D7E98B490A36'
    $webkitJar = Join-Path $stage 'webkit.jar'
    $webkitRules = Join-Path $stage 'webkit.proguard'
    $coreJar = Join-Path $stage 'core.jar'
    Expand-DependencyEntry $webkitAar 'classes.jar' $webkitJar
    Expand-DependencyEntry $webkitAar 'proguard.txt' $webkitRules
    Expand-DependencyEntry $coreAar 'classes.jar' $coreJar
    $appRules = Join-Path $stage 'app.proguard'
    @(
        '-keep class org.bedrockbender.lonetismiles.MainActivity { *; }'
        '-dontoptimize'
        '-dontobfuscate'
    ) | Set-Content -LiteralPath $appRules -Encoding ascii

    Copy-Item -LiteralPath $packExport -Destination $assets
    Copy-Item -LiteralPath $collector -Destination (Join-Path $assets 'collector.user.js')
    foreach ($name in @('androidx-apache-2.0.txt', 'chromium-bsd.txt')) {
        Copy-Item -LiteralPath (Join-Path $thirdPartyLicenses $name) -Destination $assets
    }

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
    $compileClasspath = [string]::Join([IO.Path]::PathSeparator, @($androidJar, $webkitJar, $coreJar, $annotations))
    Invoke-BuildTool $javac (@('--release', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-classpath', $compileClasspath,
        '-d', $classes) + $javaSources)

    $classFiles = @(Get-ChildItem -LiteralPath $classes -File -Filter '*.class' -Recurse |
        Sort-Object FullName | ForEach-Object FullName)
    # Shrink WebKit to the APIs this app uses. Core and annotations are compile classpath only.
    Invoke-BuildTool $java (@('-cp', $d8, 'com.android.tools.r8.R8', '--release', '--min-api', '26',
        '--lib', $androidJar, '--classpath', $coreJar, '--classpath', $annotations, '--pg-conf', $webkitRules,
        '--pg-conf', $appRules, '--output', $dex, $webkitJar) + $classFiles)
    if (!(Test-Path -LiteralPath (Join-Path $dex 'classes.dex') -PathType Leaf)) {
        throw 'R8 did not produce the primary DEX file.'
    }

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
        $badging -notcontains "application-label:'Loneti essentials'" -or
        $badging -notcontains "application-label-ru:'Loneti essentials'" -or
        !($badging -match '^launchable-activity:')) {
        throw 'The APK manifest identity, versions, SDK levels, labels or launcher are unexpected.'
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
