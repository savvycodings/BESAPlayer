# Load server/.env and curl local + external APIs.
# Usage: cd server; .\scripts\healthcheck.ps1
# Optional: $env:BASE_URL = "http://192.168.68.86:3050"

$ErrorActionPreference = "Continue"
$ServerDir = Split-Path $PSScriptRoot -Parent
Set-Location $ServerDir

if (-not (Test-Path ".env")) {
    Write-Host "Missing server/.env" -ForegroundColor Red
    exit 1
}

$envJson = node -e @"
require('dotenv').config({ path: '.env' });
const keys = [
  'PORT','DATABASE_URL','PUDO_API_KEY','PUDO_API_BASE_URL',
  'POKEDATA_API_KEY','GEMINI_API_KEY',
  'CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET',
  'RESEND_API_KEY','BETTER_AUTH_URL','BETTER_AUTH_SECRET'
];
const o = {};
for (const k of keys) o[k] = process.env[k] || '';
console.log(JSON.stringify(o));
"@

$cfg = $envJson | ConvertFrom-Json
$port = if ($cfg.PORT) { $cfg.PORT } else { "3050" }
$baseUrl = if ($env:BASE_URL) { $env:BASE_URL.TrimEnd('/') } else { "http://localhost:$port" }
$pudoBase = if ($cfg.PUDO_API_BASE_URL) { $cfg.PUDO_API_BASE_URL.TrimEnd('/') } else { "https://api-pudo.co.za" }

$pass = 0
$fail = 0

function Write-Ok($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green; $script:pass++ }
function Write-Fail($msg, $detail) {
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
    if ($detail) { Write-Host "         $detail" -ForegroundColor DarkGray }
    $script:fail++
}

function Test-HttpGet($label, $url, $headers = @{}) {
    try {
        $params = @{ Uri = $url; Method = "Get"; TimeoutSec = 25; UseBasicParsing = $true }
        if ($headers.Count -gt 0) { $params.Headers = $headers }
        $r = Invoke-WebRequest @params
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) {
            Write-Ok "$label (HTTP $($r.StatusCode))"
            return $true
        }
        Write-Fail "$label (HTTP $($r.StatusCode))"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code) { Write-Fail "$label (HTTP $code)" } else { Write-Fail $label $_.Exception.Message }
    }
    return $false
}

Write-Host "=============================================="
Write-Host " FASAPlayer healthcheck (env: server/.env)"
Write-Host " Local API: $baseUrl"
Write-Host "==============================================`n"

Write-Host "--- Environment keys ---"
foreach ($pair in @(
    @("DATABASE_URL", $cfg.DATABASE_URL),
    @("PUDO_API_KEY", $cfg.PUDO_API_KEY),
    @("POKEDATA_API_KEY", $cfg.POKEDATA_API_KEY),
    @("GEMINI_API_KEY", $cfg.GEMINI_API_KEY),
    @("CLOUDINARY_CLOUD_NAME", $cfg.CLOUDINARY_CLOUD_NAME),
    @("RESEND_API_KEY", $cfg.RESEND_API_KEY)
)) {
    if ($pair[1]) { Write-Ok "$($pair[0]) is set" } else { Write-Host "  [SKIP] $($pair[0]) not set" -ForegroundColor Yellow }
}

Write-Host "`n--- Local server (start: pnpm run dev) ---"
Test-HttpGet "GET /" "$baseUrl/"
Test-HttpGet "GET /api/pudo/lockers" "$baseUrl/api/pudo/lockers"
Test-HttpGet "GET /api/listings/recent" "$baseUrl/api/listings/recent?limit=1"

if ($cfg.DATABASE_URL) {
    Write-Host "`n--- Database ---"
    $dbOut = node -e "const {Client}=require('pg');const c=new Client({connectionString:process.argv[1]});c.connect().then(()=>c.query('SELECT 1')).then(()=>{console.log('ok');return c.end()}).catch(e=>{console.error(e.message);process.exit(1)})" $cfg.DATABASE_URL 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Ok "PostgreSQL connected" } else { Write-Fail "PostgreSQL" $dbOut }
}

if ($cfg.PUDO_API_KEY) {
    Write-Host "`n--- PUDO API (direct) ---"
    $enc = [uri]::EscapeDataString($cfg.PUDO_API_KEY)
    try {
        $r = Invoke-WebRequest -Uri "$pudoBase/lockers-data?api_key=$enc" -Method Get -TimeoutSec 25 -UseBasicParsing
        Write-Ok "GET lockers-data (HTTP $($r.StatusCode))"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 404) {
            Write-Host "  [WARN] PUDO lockers-data HTTP 404 (use local /api/pudo/lockers fallback)" -ForegroundColor Yellow
        } else {
            Write-Fail "GET lockers-data" $(if ($code) { "HTTP $code" } else { $_.Exception.Message })
        }
    }
}

if ($cfg.CLOUDINARY_CLOUD_NAME -and $cfg.CLOUDINARY_API_KEY -and $cfg.CLOUDINARY_API_SECRET) {
    Write-Host "`n--- Cloudinary ---"
    $pair = "{0}:{1}" -f $cfg.CLOUDINARY_API_KEY, $cfg.CLOUDINARY_API_SECRET
    $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
    Test-HttpGet "GET ping" "https://api.cloudinary.com/v1_1/$($cfg.CLOUDINARY_CLOUD_NAME)/ping" @{ Authorization = "Basic $b64" }
}

if ($cfg.RESEND_API_KEY) {
    Write-Host "`n--- Resend ---"
    Test-HttpGet "GET domains" "https://api.resend.com/domains" @{ Authorization = "Bearer $($cfg.RESEND_API_KEY)" }
}

if ($cfg.BETTER_AUTH_URL) {
    Write-Host "`n--- Better Auth (remote) ---"
    $remote = $cfg.BETTER_AUTH_URL.TrimEnd('/')
    Test-HttpGet "GET $remote" "$remote/"
}

Write-Host "`n=============================================="
Write-Host " Results: $pass passed, $fail failed"
Write-Host "=============================================="
if ($fail -gt 0) { exit 1 }
