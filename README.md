# 布草送洗管理

面向 Surface Pro 8 这类可触控 Windows 设备的桌面管理程序。

当前方案：

- 桌面壳：Electron
- 界面：Vue 3 + Vant
- 数据文件：本地 JSON
- 备份：自动备份 + JSON 导入导出 + Excel 导出
- 代码管理：Git / GitHub

## 项目目录

- 代码目录：`C:\Local\LocalCode\布草送洗管理`
- 文档目录：`C:\Local\上班库\02_Work\AI\布草送洗管理`
- 原始记录目录：`C:\Local\上班库\02_Work\所有\运营管理\物业管理\布草\送洗记录`

## 常用命令

```bash
npm install
npm run seed:history
npm run build
npm run desktop
npm run dist:win
```

说明：

- `npm run seed:history`：从原始 Markdown 记录生成历史导入种子
- `npm run build`：构建前端页面到 `docs/`
- `npm run desktop`：本地启动桌面程序
- `npm run dist:win`：构建 Windows 便携版可执行文件

## 桌面版使用

当前已可生成 Windows 便携版，产物目录：

- `release\布草送洗管理 0.0.0.exe`
- `release\win-unpacked\`

直接打开便携版 `.exe` 即可使用。

## 数据说明

- 开发环境默认写入：`server/data/laundry-data.json`
- 打包后的便携版优先写入：`exe` 同目录下的 `data\laundry-data.json`
- 每次覆盖写入前，会在 `backups\` 目录生成一份时间戳备份

## 当前功能

- 送洗登记
- 批次列表
- 批次详情更新
- 统计查询
- 人员管理
- 导入 2026 年 3 月历史记录
- 导出 Excel
- 导出 / 导入本地 JSON 备份
