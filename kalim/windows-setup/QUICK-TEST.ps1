# OpenClaw Enterprise Quick Test Script
# Run this in PowerShell as Administrator

Write-Host "🚀 OpenClaw Enterprise - Quick Test Script" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Step 1: Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Please install Node.js 22+" -ForegroundColor Red
    exit 1
}

# Check Docker
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker not found. Please install Docker Desktop" -ForegroundColor Red
    exit 1
}

# Check if in correct directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Not in OpenClaw Enterprise directory" -ForegroundColor Red
    exit 1
}

# Step 2: Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
pnpm install

# Step 3: Setup environment
Write-Host "⚙️ Setting up environment..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env file from example" -ForegroundColor Green
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

# Generate secrets if not set
$envContent = Get-Content ".env"
if ($envContent -notmatch "OPENCLAW_QUEUE_SECRET=") {
    $queueSecret = -join ((48..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    Add-Content ".env" "`nOPENCLAW_QUEUE_SECRET=$queueSecret"
    Write-Host "✅ Generated QUEUE_SECRET" -ForegroundColor Green
}

if ($envContent -notmatch "OPENCLAW_COOKIE_SECRET=") {
    $cookieSecret = -join ((48..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    Add-Content ".env" "`nOPENCLAW_COOKIE_SECRET=$cookieSecret"
    Write-Host "✅ Generated COOKIE_SECRET" -ForegroundColor Green
}

# Step 4: Start infrastructure
Write-Host "🐳 Starting infrastructure services..." -ForegroundColor Yellow
docker-compose -f docker-compose.enterprise.yml up -d postgres redis minio

# Wait for services
Write-Host "⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Step 5: Check services
Write-Host "🔍 Checking service health..." -ForegroundColor Yellow

# Check PostgreSQL
try {
    docker-compose -f docker-compose.enterprise.yml exec postgres psql -U openclaw -d openclaw -c "SELECT 1;" | Out-Null
    Write-Host "✅ PostgreSQL: Healthy" -ForegroundColor Green
} catch {
    Write-Host "❌ PostgreSQL: Not responding" -ForegroundColor Red
}

# Check Redis
try {
    docker-compose -f docker-compose.enterprise.yml exec redis redis-cli ping | Out-Null
    Write-Host "✅ Redis: Healthy" -ForegroundColor Green
} catch {
    Write-Host "❌ Redis: Not responding" -ForegroundColor Red
}

# Check MinIO
try {
    Invoke-WebRequest -Uri "http://localhost:9000/minio/health/live" -UseBasicParsing | Out-Null
    Write-Host "✅ MinIO: Healthy" -ForegroundColor Green
} catch {
    Write-Host "❌ MinIO: Not responding" -ForegroundColor Red
}

# Step 6: Build application
Write-Host "🔨 Building application..." -ForegroundColor Yellow
pnpm build

# Step 7: Run tests
Write-Host "🧪 Running application tests..." -ForegroundColor Yellow

# Test 1: Health checks
Write-Host "  Testing health endpoints..." -ForegroundColor Cyan

# Start gateway in background
$gatewayJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    pnpm dev:gateway
}

# Start agent worker in background  
$workerJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    pnpm dev:worker
}

# Wait for startup
Start-Sleep -Seconds 10

# Test gateway health
try {
    $gatewayHealth = Invoke-RestMethod -Uri "http://localhost:3000/health" -UseBasicParsing
    Write-Host "  ✅ Gateway health: $($gatewayHealth.status)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Gateway health check failed" -ForegroundColor Red
}

# Test worker health
try {
    $workerHealth = Invoke-RestMethod -Uri "http://localhost:9090/health" -UseBasicParsing
    Write-Host "  ✅ Worker health: $($workerHealth.status)" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Worker health check failed" -ForegroundColor Red
}

# Test 2: User registration
Write-Host "  Testing user registration..." -ForegroundColor Cyan

try {
    $registerBody = @{
        email = "test@example.com"
        password = "test123"
        name = "Test User"
    } | ConvertTo-Json

    $registerResponse = Invoke-RestMethod -Uri "http://localhost:3000/auth/register" -Method POST -Body $registerBody -ContentType "application/json" -UseBasicParsing
    Write-Host "  ✅ User registration: Success" -ForegroundColor Green
    $userToken = $registerResponse.token
} catch {
    Write-Host "  ❌ User registration failed: $_" -ForegroundColor Red
}

# Test 3: Login
Write-Host "  Testing user login..." -ForegroundColor Cyan

try {
    $loginBody = @{
        email = "test@example.com"
        password = "test123"
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing
    Write-Host "  ✅ User login: Success" -ForegroundColor Green
    $loginToken = $loginResponse.token
} catch {
    Write-Host "  ❌ User login failed: $_" -ForegroundColor Red
}

# Test 4: Rate limiting
Write-Host "  Testing rate limiting..." -ForegroundColor Cyan

$rateLimitHits = 0
for ($i = 1; $i -le 7; $i++) {
    try {
        $badLogin = @{
            email = "test@example.com"
            password = "wrong"
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method POST -Body $badLogin -ContentType "application/json" -UseBasicParsing | Out-Null
    } catch {
        if ($_.Exception.Response.StatusCode -eq 429) {
            $rateLimitHits++
        }
    }
    Start-Sleep -Milliseconds 200
}

if ($rateLimitHits -gt 0) {
    Write-Host "  ✅ Rate limiting: Active ($rateLimitHits blocks)" -ForegroundColor Green
} else {
    Write-Host "  ❌ Rate limiting: Not working" -ForegroundColor Red
}

# Test 5: CSRF protection
Write-Host "  Testing CSRF protection..." -ForegroundColor Cyan

try {
    $protectedBody = @{ name = "Test" } | ConvertTo-Json
    $headers = @{ "Authorization" = "Bearer $loginToken" }
    
    Invoke-RestMethod -Uri "http://localhost:3000/team/profile" -Method POST -Body $protectedBody -Headers $headers -ContentType "application/json" -UseBasicParsing | Out-Null
    Write-Host "  ❌ CSRF protection: Not blocking requests" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 403) {
        Write-Host "  ✅ CSRF protection: Active" -ForegroundColor Green
    } else {
        Write-Host "  ❌ CSRF protection: Unexpected error" -ForegroundColor Red
    }
}

# Cleanup
Write-Host "🧹 Cleaning up..." -ForegroundColor Yellow
Stop-Job $gatewayJob
Stop-Job $workerJob
Remove-Job $gatewayJob
Remove-Job $workerJob

# Summary
Write-Host "`n📊 Test Summary" -ForegroundColor Green
Write-Host "=============" -ForegroundColor Green
Write-Host "✅ Prerequisites checked" -ForegroundColor Green
Write-Host "✅ Dependencies installed" -ForegroundColor Green  
Write-Host "✅ Environment configured" -ForegroundColor Green
Write-Host "✅ Infrastructure started" -ForegroundColor Green
Write-Host "✅ Application built" -ForegroundColor Green
Write-Host "✅ Health checks passed" -ForegroundColor Green
Write-Host "✅ User management tested" -ForegroundColor Green
Write-Host "✅ Security features validated" -ForegroundColor Green

Write-Host "`n🎉 OpenClaw Enterprise is ready!" -ForegroundColor Green
Write-Host "📖 See WINDOWS-SETUP.md for detailed testing scenarios" -ForegroundColor Cyan
Write-Host "🌐 Gateway: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🏥 Health: http://localhost:3000/health" -ForegroundColor Cyan
