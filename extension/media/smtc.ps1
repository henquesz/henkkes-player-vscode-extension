# Ponte com o Global System Media Transport Controls (SMTC) do Windows.
# Emite o estado da mídia do navegador como JSON (uma linha por tick) e
# aceita comandos pelo stdin: toggle | next | prev
# Precisa rodar no Windows PowerShell 5.1 (powershell.exe), não no pwsh 7.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

# O stream da thumbnail chega como __ComObject e o PowerShell não consegue
# convertê-lo pra IInputStream numa chamada normal; via reflection o CLR converte.
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod(
    'AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

function Await($op, [Type]$type) {
    $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    if (-not $task.Wait(5000)) { return $null }
    return $task.Result
}

$Manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
                 ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

# Só sessões de navegador (ignora Spotify etc.)
$browserPattern = 'chrome|msedge|firefox|brave|opera|vivaldi'

function Get-TargetSession {
    $sessions = @($Manager.GetSessions()) | Where-Object { $_.SourceAppUserModelId -match $browserPattern }
    if (-not $sessions) { return $null }
    $playing = $sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' } | Select-Object -First 1
    if ($playing) { return $playing }
    return $sessions | Select-Object -First 1
}

function Get-ThumbnailDataUri($props) {
    if (-not $props.Thumbnail) { throw 'o navegador ainda não enviou a capa' }
    $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $stream) { throw 'timeout abrindo a capa' }
    $contentType = $stream.ContentType
    if (-not $contentType) { $contentType = 'image/png' }
    $net = $asStreamForRead.Invoke($null, @($stream))
    $ms = New-Object System.IO.MemoryStream
    $net.CopyTo($ms)
    $net.Dispose()
    if ($ms.Length -eq 0) { throw 'capa vazia' }
    return "data:$contentType;base64," + [Convert]::ToBase64String($ms.ToArray())
}

$script:thumbKey = $null
$script:thumb = $null
$script:tryKey = $null
$script:tries = 0

function Get-State {
    $s = Get-TargetSession
    if (-not $s) { return @{ type = 'state'; active = $false } }

    $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    if (-not $props) { return @{ type = 'state'; active = $false } }

    $info = $s.GetPlaybackInfo()
    $tl = $s.GetTimelineProperties()
    $isPlaying = $info.PlaybackStatus -eq 'Playing'

    # O navegador só atualiza a posição em eventos; extrapola enquanto toca.
    $pos = $tl.Position.TotalSeconds
    $dur = $tl.EndTime.TotalSeconds
    if ($isPlaying) { $pos += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalSeconds }
    if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }

    $state = @{
        type     = 'state'
        active   = $true
        title    = $props.Title
        artist   = $props.Artist
        playing  = $isPlaying
        position = [Math]::Round($pos, 1)
        duration = [Math]::Round($dur, 1)
        source   = $s.SourceAppUserModelId
    }

    # Thumbnail só vai quando muda (é pesada em base64). Tenta até 6 vezes por
    # vídeo (~3 s), porque o navegador às vezes manda a capa depois do título.
    $key = "$($props.Title)|$($props.Artist)"
    if ($key -ne $script:thumbKey) {
        if ($key -ne $script:tryKey) {
            $script:tryKey = $key
            $script:tries = 0
            if ($script:thumb) { $script:thumb = $null; $state.thumb = '' }
        }
        if ($script:tries -lt 6) {
            $script:tries++
            try {
                $t = Get-ThumbnailDataUri $props
                $script:thumbKey = $key
                $script:thumb = $t
                $state.thumb = $t
            } catch {
                if ($script:tries -eq 6) {
                    Write-Json @{ type = 'error'; message = "Capa indisponível: $($_.Exception.Message)" }
                }
            }
        }
    }
    return $state
}

function Invoke-MediaCommand([string]$cmd) {
    $s = Get-TargetSession
    if (-not $s) { return }
    switch ($cmd.Trim()) {
        'toggle' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
        'next'   { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
        'prev'   { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
    }
}

function Write-Json($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 3))
    [Console]::Out.Flush()
}

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$lineTask = $stdin.ReadLineAsync()

while ($true) {
    try {
        while ($lineTask.IsCompleted) {
            $line = $lineTask.Result
            if ($null -eq $line) { exit 0 }   # extensão fechou o stdin
            Invoke-MediaCommand $line
            $lineTask = $stdin.ReadLineAsync()
        }
        Write-Json (Get-State)
    } catch {
        Write-Json @{ type = 'error'; message = $_.Exception.Message }
    }
    Start-Sleep -Milliseconds 500
}
