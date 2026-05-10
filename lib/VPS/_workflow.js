'use strict';

// Helper sinh nội dung 2 file workflow YAML cho repo VPS
// (tách riêng để file create.js gọn). Đặt helper:true để loader bỏ qua.
module.exports.helper = true;

function generateTmateYml(serverUrl, vpsName, repoFullName) {
    return `name: Create VPS (Auto Restart)

on:
  workflow_dispatch:
  repository_dispatch:
    types: [create-vps]

env:
  VPS_NAME: ${vpsName}
  TMATE_SERVER: nyc1.tmate.io
  GITHUB_TOKEN_VPS: \${{ secrets.GH_TOKEN }}
  NGROK_SERVER_URL: ${serverUrl}

jobs:
  deploy:
    runs-on: windows-latest
    permissions:
      contents: write
      actions: write
    steps:
    - name: Checkout
      uses: actions/checkout@v4
      with:
        token: \${{ secrets.GH_TOKEN }}

    - name: Setup VPS info
      run: |
        mkdir -Force links
        "VPS init - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath "links/${vpsName}.txt" -Encoding UTF8

    - name: Install TightVNC + noVNC + Cloudflared
      shell: pwsh
      run: |
        Invoke-WebRequest -Uri "https://www.tightvnc.com/download/2.8.63/tightvnc-2.8.63-gpl-setup-64bit.msi" -OutFile "tightvnc.msi" -TimeoutSec 60
        Start-Process msiexec.exe -Wait -ArgumentList '/i tightvnc.msi /quiet /norestart ADDLOCAL="Server" SERVER_REGISTER_AS_SERVICE=1 SERVER_ADD_FIREWALL_EXCEPTION=1 SET_USEVNCAUTHENTICATION=1 VALUE_OF_USEVNCAUTHENTICATION=1 SET_PASSWORD=1 VALUE_OF_PASSWORD=hieudz SET_ACCEPTHTTPCONNECTIONS=1 VALUE_OF_ACCEPTHTTPCONNECTIONS=1 SET_ALLOWLOOPBACK=1 VALUE_OF_ALLOWLOOPBACK=1'
        Set-ItemProperty -Path "HKLM:\\SOFTWARE\\TightVNC\\Server" -Name "AllowLoopback" -Value 1 -ErrorAction SilentlyContinue
        Stop-Process -Name "tvnserver" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
        Start-Process -FilePath "C:\\Program Files\\TightVNC\\tvnserver.exe" -ArgumentList "-run -localhost no" -WindowStyle Hidden
        Start-Sleep -Seconds 30
        netsh advfirewall firewall add rule name="Allow VNC 5900" dir=in action=allow protocol=TCP localport=5900
        netsh advfirewall firewall add rule name="Allow noVNC 6080" dir=in action=allow protocol=TCP localport=6080

        python -m pip install --upgrade pip --timeout 60
        pip install --force-reinstall numpy novnc websockify==0.13.0 --timeout 60
        $novncInfo = pip show novnc
        $novncPath = ($novncInfo | Select-String "Location: (.*)").Matches.Groups[1].Value + "\\novnc"
        if (-not (Test-Path "$novncPath/vnc.html")) {
          Invoke-WebRequest -Uri "https://github.com/novnc/noVNC/archive/refs/tags/v1.6.0.zip" -OutFile "noVNC.zip" -TimeoutSec 60
          Expand-Archive -Path "noVNC.zip" -DestinationPath "." -Force
          Move-Item -Path "noVNC-1.6.0" -Destination "noVNC" -Force
          $novncPath = "noVNC"
        }
        Start-Process -FilePath "python" -ArgumentList "-m", "websockify", "6080", "127.0.0.1:5900", "--web", "$novncPath" -RedirectStandardOutput "ws.log" -RedirectStandardError "ws_err.log" -NoNewWindow
        Start-Sleep -Seconds 15

        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "cloudflared.exe" -TimeoutSec 60
        Start-Process -FilePath "cloudflared.exe" -ArgumentList "tunnel", "--url", "http://localhost:6080", "--no-autoupdate", "--edge-ip-version", "auto", "--protocol", "http2", "--logfile", "cloudflared.log" -WindowStyle Hidden
        Start-Sleep -Seconds 40

        $cloudflaredUrl = ""
        for ($i = 1; $i -le 180; $i++) {
          Start-Sleep -Seconds 3
          if (Test-Path "cloudflared.log") {
            $logContent = Get-Content "cloudflared.log" -Raw -ErrorAction SilentlyContinue
            if ($logContent -match 'https://[a-zA-Z0-9-]+\\.trycloudflare\\.com') {
              $cloudflaredUrl = $matches[0]
              break
            }
          }
        }

        if ($cloudflaredUrl) {
          $remoteLink = "$cloudflaredUrl/vnc.html"
          $remoteLink | Out-File -FilePath "remote-link.txt" -Encoding UTF8 -NoNewline
          git config --global user.email "github-actions[bot]@users.noreply.github.com"
          git config --global user.name "github-actions[bot]"
          git add remote-link.txt
          git commit -m "Update remote-link.txt" --allow-empty
          git push origin main --force-with-lease
          try {
            $body = @{ github_token = "$env:GITHUB_TOKEN_VPS"; vnc_link = $remoteLink } | ConvertTo-Json
            Invoke-RestMethod -Uri "${serverUrl}/vps/users" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 20
          } catch { Write-Host "Send link failed: $_" }
        } else {
          "TUNNEL_FAILED" | Out-File -FilePath "remote-link.txt" -Encoding UTF8 -NoNewline
          git add remote-link.txt
          git commit -m "Tunnel failed" --allow-empty
          git push origin main --force-with-lease
          exit 1
        }

        for ($i = 1; $i -le 330; $i++) {
          Write-Host "Running minute $i/330"
          Start-Sleep -Seconds 60
        }

    - name: Auto Restart Workflow
      if: always()
      run: |
        Stop-Process -Name "cloudflared","python","tvnserver" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 10
        $headers = @{ "Accept" = "application/vnd.github+json"; "Authorization" = "Bearer $env:GITHUB_TOKEN_VPS"; "Content-Type" = "application/json"; "X-GitHub-Api-Version" = "2022-11-28" }
        $payload = @{ event_type = "create-vps"; client_payload = @{ vps_name = "${vpsName}"; auto_restart = $true } } | ConvertTo-Json -Depth 2
        Invoke-RestMethod -Uri "https://api.github.com/repos/${repoFullName}/dispatches" -Method Post -Headers $headers -Body $payload -TimeoutSec 30
`;
}

function generateAutoStartYml(repoFullName) {
    return `name: Auto Start VPS on Push

on:
  push:
    branches: [main]
    paths-ignore:
      - 'restart.lock'
      - '.backup/**'
      - 'links/**'
      - 'remote-link.txt'

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger VPS Creation
        run: |
          curl -X POST https://api.github.com/repos/${repoFullName}/dispatches \\
          -H "Accept: application/vnd.github.v3+json" \\
          -H "Authorization: token \${{ secrets.GH_TOKEN }}" \\
          -d '{"event_type":"create-vps","client_payload":{"vps_name":"autovps"}}'
`;
}

module.exports.generateTmateYml = generateTmateYml;
module.exports.generateAutoStartYml = generateAutoStartYml;
