$ErrorActionPreference = "Stop"
$rand = Get-Random -Maximum 100000
$username = "smoke_test_$rand"
$password = "TestPass123!"
$baseUrl = "https://audio-test.accstore.pro.vn"

# 1. Register
Write-Host "Registering user: $username"
$regBody = @{ username=$username; password=$password; email="$username@example.com" } | ConvertTo-Json
try {
    $regResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/register" -Method Post -Body $regBody -ContentType "application/json"
    $regData = $regResponse.Content | ConvertFrom-Json
    $token = $regData.access_token
    if (-not $token) { $token = $regData.token }
    Write-Host "Registration successful. Token acquired."
} catch {
    Write-Host "Registration failed: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Error Body: $($reader.ReadToEnd())"
    }
    exit
}

# 2. Submit SRT
$srtContent = "1`n00:00:00,000 --> 00:00:02,000`nSmoke Test.`n"
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$bodyLines = (
    "--$boundary",
    "Content-Disposition: form-data; name=`"target_language`"",
    "",
    "English",
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"test.srt`"",
    "Content-Type: application/x-subrip",
    "",
    $srtContent,
    "--$boundary--"
) -join $LF

Write-Host "Submitting SRT..."
try {
    $transResponse = Invoke-WebRequest -Uri "$baseUrl/api/translation/start" `
        -Method Post `
        -Body $bodyLines `
        -ContentType "multipart/form-data; boundary=$boundary" `
        -Headers @{ Authorization = "Bearer $token" }
    
    Write-Host "Submission Status Code: $($transResponse.StatusCode)"
    $transBody = $transResponse.Content
    $previewLimit = if ($transBody.Length -lt 800) { $transBody.Length } else { 800 }
    Write-Host "Submission Body (first 800 chars): $($transBody.Substring(0, $previewLimit))"

    # 3. Check Status if ID exists
    $transData = $transBody | ConvertFrom-Json
    $jobId = $transData.request_id
    if (-not $jobId) { $jobId = $transData.id }
    if (-not $jobId) { $jobId = $transData.job_id }

    if ($jobId) {
        Write-Host "Job ID found: $jobId. Checking status..."
        $statusResp = Invoke-WebRequest -Uri "$baseUrl/api/translation/status/$jobId" `
            -Method Get `
            -Headers @{ Authorization = "Bearer $token" }
        
        Write-Host "Status Check Status Code: $($statusResp.StatusCode)"
        $statusBody = $statusResp.Content
        $statusLimit = if ($statusBody.Length -lt 500) { $statusBody.Length } else { 500 }
        Write-Host "Status Check Body (first 500 chars): $($statusBody.Substring(0, $statusLimit))"
    } else {
        Write-Host "No Job ID found in response."
    }
} catch {
    Write-Host "Request failed: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Error Body: $($reader.ReadToEnd())"
    }
}
