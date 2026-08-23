$currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$tikzDir = 'E:\tikz-editor-master\tikz-editor-master'
if ($currentPath -notlike "*$tikzDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$currentPath;$tikzDir", 'User')
    Write-Host 'Added to PATH successfully'
} else {
    Write-Host 'Already in PATH'
}
