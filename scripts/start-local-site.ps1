$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

Write-Host ''
Write-Host '== 布草送洗管理 ==' -ForegroundColor Cyan
Write-Host '1. 构建本地网页'
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host '构建失败，请先处理报错。' -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host '2. 打开本地站点 http://127.0.0.1:8788'
Start-Process 'http://127.0.0.1:8788'

Write-Host '3. 启动本地数据服务'
Write-Host '关闭此窗口即可停止本地站点。' -ForegroundColor Yellow
npm run local
