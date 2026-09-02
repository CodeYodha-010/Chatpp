[Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
$req = [Net.HttpWebRequest]::Create('https://localhost')
$req.ServerCertificateValidationCallback = {$true}
try {
    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $content = $reader.ReadToEnd()
    Write-Host "SUCCESS: Got response, length: $($content.Length)"
    Write-Host "First 200 chars:"
    Write-Host $content.Substring(0, [Math]::Min(200, $content.Length))
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
