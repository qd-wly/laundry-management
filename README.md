# 布草送洗管理

适用于 Surface Pro 8 这类可触控设备的本地管理网站，面向单人使用场景。

当前方案：

- 前端：Vue 3 + Vant
- 运行方式：本地网站
- 本地数据库：`server/data/laundry-data.json`
- 本地缓存：浏览器 IndexedDB，仅作为页面运行缓存
- 数据备份：JSON 导入导出 + Excel 导出
- 代码同步：继续使用 Git / GitHub

## 项目目录

- 代码目录：`C:\Local\LocalCode\布草送洗管理`
- 文档目录：`C:\Local\上班库\02_Work\AI\布草送洗管理`
- 原始记录目录：`C:\Local\上班库\02_Work\所有\运营管理\物业管理\布草\送洗记录`

## 常用命令

```bash
npm install
npm run seed:history
npm run build
npm run local
npm run start:local-site
```

说明：

- `npm run seed:history`：从原始 Markdown 记录生成历史导入种子
- `npm run build`：构建本地网站静态文件到 `docs/`
- `npm run local`：启动本地网站和本地数据接口
- `npm run start:local-site`：一键构建并打开本地网站

## 本地使用

最简单的方式：

- 双击项目根目录下的 `打开布草送洗管理.bat`

它会自动：

- 构建最新页面
- 启动本地网站
- 打开浏览器访问 `http://127.0.0.1:8788`

## 数据说明

- 实际业务数据默认写入：`server/data/laundry-data.json`
- 每次覆盖写入前，会在 `server/data/backups/` 下生成一份时间戳备份
- `server/data/laundry-data.json` 已加入 `.gitignore`，不会跟着代码一起推到 GitHub

## 当前功能

- 送洗登记
- 批次列表
- 批次详情更新
- 统计查询
- 人员管理
- 导入 2026 年 3 月历史记录
- 导出 Excel
- 导出 / 导入本地 JSON 备份
