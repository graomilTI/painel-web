# Instala o túnel do escritório como tarefa agendada do usuário atual (sem precisar de administrador).
#   powershell -ExecutionPolicy Bypass -File instalar-tunel.ps1               # instala/atualiza e inicia
#   powershell -ExecutionPolicy Bypass -File instalar-tunel.ps1 -Desinstalar  # remove a tarefa e para o túnel
# Copia os arquivos para %LOCALAPPDATA%\grm-tunel (não depende desta pasta do repositório) e registra a tarefa
# "GRM Tunel Escritorio": inicia no logon, reinicia sozinha a cada 1 min se cair, roda na bateria, sem limite de tempo.
# O PC precisa ficar ligado, logado, com internet e SEM suspender (Configurações > Sistema > Energia).
param([switch]$Desinstalar)
$ErrorActionPreference = 'Stop'
$nome = 'GRM Tunel Escritorio'
$destino = Join-Path $env:LOCALAPPDATA 'grm-tunel'

function Parar-Instancias {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match 'tunel-escritorio\.js' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" |
    Where-Object { $_.CommandLine -match '127\.0\.0\.1:47213' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($Desinstalar) {
  if (Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $nome -Confirm:$false
  }
  Parar-Instancias
  Write-Host "Tarefa removida e túnel parado. (Arquivos em $destino mantidos.)"
  return
}

$node = (Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Force $destino | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'proxy-saida.js'), (Join-Path $PSScriptRoot 'tunel-escritorio.js') $destino -Force

Parar-Instancias
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"& '{0}' '{1}'`"" -f $node, (Join-Path $destino 'tunel-escritorio.js'))
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config -Force `
  -Description 'Túnel SSH reverso + proxy restrito para os agentes do GRM (VPS) saírem pela rede do escritório.' | Out-Null
Start-ScheduledTask -TaskName $nome
Start-Sleep -Seconds 6
Write-Host "Tarefa '$nome' instalada e iniciada. Log: $env:LOCALAPPDATA\grm-tunel\tunel.log"
Get-Content (Join-Path $destino 'tunel.log') -Tail 4 -ErrorAction SilentlyContinue
