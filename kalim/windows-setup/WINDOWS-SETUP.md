# OpenClaw Enterprise - Windows Setup & Testing Guide

## 🚀 Quick Start (15 Minutes)

### Prerequisites
```powershell
# Install Node.js 22+ (if not installed)
winget install OpenJS.NodeJS

# Install Docker Desktop (if not installed)
winget install Docker.DockerDesktop

# Install Git (if not installed)
winget install Git.Git
```

### Step 1: Clone & Setup
```powershell
# Navigate to project directory
cd C:\Users\qures\Downloads\nabi-app-git\openclaw-enterprise

# Install dependencies
pnpm install

# Copy environment file
Copy-Item ".env.example" ".env"

# Generate required secrets
$env:OPENCLAW_QUEUE_SECRET = -join ((48..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$env:OPENCLAW_COOKIE_SECRET = -join ((48..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$env:OPENCLAW_SECRETS_KEY = -join ((48..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# Generate JWT key pair
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in private.pem -out public.pem
$env:OPENCLAW_JWT_PRIVATE_KEY = Get-Content "private.pem" -Raw
$env:OPENCLAW_JWT_PUBLIC_KEY = Get-Content "public.pem" -Raw
```

### Step 2: Update .env File
```powershell
# Open .env file and add these values:
notepad .env
```

Add to .env:
```
OPENCLAW_QUEUE_SECRET=your-generated-secret
OPENCLAW_COOKIE_SECRET=your-generated-secret  
OPENCLAW_SECRETS_KEY=your-generated-secret
OPENCLAW_JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
[your private key content]
-----END PRIVATE KEY-----
OPENCLAW_JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
[your public key content]  
-----END PUBLIC KEY-----
OPENCLAW_GATEWAY_TOKEN=gateway-token-32-chars
DATABASE_URL=postgres://openclaw:openclaw@localhost:5432/openclaw
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
OPENCLAW_S3_BUCKET=openclaw
OPENCLAW_TEAM_ADMIN_EMAIL=admin@openclaw.local
OPENCLAW_TEAM_ADMIN_PASSWORD=admin123
OPENCLAW_PUBLIC_BASE_URL=http://localhost:3000
```

### Step 3: Start Services
```powershell
# Start infrastructure services
docker-compose -f docker-compose.enterprise.yml up -d postgres redis minio

# Wait 30 seconds for services to start
Start-Sleep -Seconds 30

# Build and start application
pnpm build
pnpm dev
```

## 🧪 Testing Scenarios

### 1. Basic Health Check
```powershell
# Test gateway health
Invoke-RestMethod -Uri "http://localhost:3000/health" -Method GET

# Test agent worker health  
Invoke-RestMethod -Uri "http://localhost:9090/health" -Method GET
```

### 2. Multi-User Testing
```powershell
# Create first user (admin)
$body = @{
    email = "admin@openclaw.local"
    password = "admin123"
    name = "Admin User"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/auth/register" -Method POST -Body $body -ContentType "application/json"
$adminToken = $response.token

# Create second user (regular)
$body2 = @{
    email = "user@openclaw.local" 
    password = "user123"
    name = "Regular User"
} | ConvertTo-Json

$response2 = Invoke-RestMethod -Uri "http://localhost:3000/auth/register" -Method POST -Body $body2 -ContentType "application/json"
$userToken = $response2.token

# Test both users can login
$adminLogin = @{
    email = "admin@openclaw.local"
    password = "admin123"
} | ConvertTo-Json

$userLogin = @{
    email = "user@openclaw.local"
    password = "user123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method POST -Body $adminLogin -ContentType "application/json"
Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method POST -Body $userLogin -ContentType "application/json"
```

### 3. RBAC Testing
```powershell
# Admin can access admin routes (should work)
$headers = @{
    "Authorization" = "Bearer $adminToken"
    "Content-Type" = "application/json"
}

# List users (admin only)
Invoke-RestMethod -Uri "http://localhost:3000/admin/users" -Method GET -Headers $headers

# Try with regular user token (should fail)
$userHeaders = @{
    "Authorization" = "Bearer $userToken" 
    "Content-Type" = "application/json"
}

try {
    Invoke-RestMethod -Uri "http://localhost:3000/admin/users" -Method GET -Headers $userHeaders
} catch {
    Write-Host "Expected: Regular user cannot access admin routes"
}

# Test user status update (admin only)
$updateBody = @{ status = "disabled" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/admin/users/[user-id]" -Method POST -Body $updateBody -Headers $headers
```

### 4. Skills Testing
```powershell
# Test file upload and agent interaction
$headers = @{
    "Authorization" = "Bearer $adminToken"
}

# Create a test file
"Test content for agent" | Out-File -FilePath "test.txt"

# Upload file
$fileContent = Get-Content "test.txt" -Raw
$boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
$fileData = @"
--$boundary
Content-Disposition: form-data; name="file"; filename="test.txt"
Content-Type: text/plain

$fileContent
--$boundary--
"@

Invoke-RestMethod -Uri "http://localhost:3000/files" -Method POST -Headers $headers -Body $fileData -ContentType "multipart/form-data; boundary=$boundary"

# Test agent execution
$agentBody = @{
    text = "Hello, can you help me with this file?"
    sessionKey = "test-session-123"
    channel = "web"
    threadId = "thread-123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/agent/run" -Method POST -Body $agentBody -Headers $headers -ContentType "application/json"
```

### 5. Rate Limiting Testing
```powershell
# Test login rate limiting (should trigger after 5 attempts)
for ($i=1; $i -le 7; $i++) {
    try {
        $loginBody = @{
            email = "admin@openclaw.local"
            password = "wrongpassword"
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
        Write-Host "Attempt $i: Success"
    } catch {
        Write-Host "Attempt $i: Rate limited - $_"
    }
    
    Start-Sleep -Milliseconds 100
}
```

### 6. CSRF Protection Testing
```powershell
# Test CSRF protection (should fail without token)
$protectedBody = @{ name = "Test Update" } | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "http://localhost:3000/team/profile" -Method POST -Body $protectedBody -Headers $headers -ContentType "application/json"
} catch {
    Write-Host "Expected: CSRF protection blocked request"
}

# Get CSRF token and try again (should work)
$csrfResponse = Invoke-RestMethod -Uri "http://localhost:3000/team/profile" -Method GET -Headers $headers
$csrfToken = $csrfResponse.csrfToken

$protectedHeaders = @{
    "Authorization" = "Bearer $adminToken"
    "x-csrf-token" = $csrfToken
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri "http://localhost:3000/team/profile" -Method POST -Body $protectedBody -Headers $protectedHeaders
```

### 7. HMAC Verification Testing
```powershell
# Test webhook signature verification
$webhookSecret = "test-webhook-secret"
$payload = @{ message = "test" } | ConvertTo-Json -Compress

# Generate HMAC signature
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($webhookSecret)
$signature = [System.Convert]::ToBase64String($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload)))

# Send webhook with signature
$webhookHeaders = @{
    "x-hub-signature-256" = "sha256=$signature"
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri "http://localhost:3000/webhooks/telegram" -Method POST -Body $payload -Headers $webhookHeaders
```

## 📊 Quick Validation Commands

```powershell
# Check all services are running
docker-compose -f docker-compose.enterprise.yml ps

# Test database connection
docker-compose -f docker-compose.enterprise.yml exec postgres psql -U openclaw -d openclaw -c "SELECT COUNT(*) FROM users;"

# Test Redis connection  
docker-compose -f docker-compose.enterprise.yml exec redis redis-cli ping

# Test MinIO connection
curl -f http://localhost:9000/minio/health/live

# Check application logs
Get-Content "logs/gateway.log" -Tail 20
Get-Content "logs/agent-worker.log" -Tail 20
```

## 🔧 Troubleshooting

### Common Issues
1. **Port conflicts**: Make sure ports 3000, 5432, 6379, 9000 are free
2. **Permission errors**: Run PowerShell as Administrator
3. **Docker issues**: Restart Docker Desktop
4. **Environment errors**: Double-check .env file values

### Quick Reset
```powershell
# Stop all services
docker-compose -f docker-compose.enterprise.yml down

# Clean volumes (optional)
docker volume prune -f

# Restart
docker-compose -f docker-compose.enterprise.yml up -d
pnpm dev
```

## ⏱️ Expected Timeline
- **0-5 min**: Setup and environment configuration
- **5-10 min**: Start services and basic health checks  
- **10-15 min**: Run testing scenarios and validation

This setup provides a complete OpenClaw Enterprise environment with multi-user support, RBAC, skills, and security features working on Windows.
