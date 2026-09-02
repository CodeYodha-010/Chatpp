$req = [Net.HttpWebRequest]::Create('http://localhost:8080')
$resp = $req.GetResponse()
Write-Host "Status:" $resp.StatusCode
Write-Host "Content-Type:" $resp.ContentType
$reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
$content = $reader.ReadToEnd()
Write-Host "Content length:" $content.Length
Write-Host "Contains ChatApp:" $content.Contains("Chat")
