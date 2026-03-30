# 布草送洗管理

手机端布草送洗登记工具，支持：

- 送洗登记、批次管理、月度统计
- IndexedDB 本地存储
- Excel 导出
- 阿里云服务器同步
- 内置历史月度记录导入

## 目录

- 代码目录：`C:\Local\LocalCode\布草送洗管理`
- 文档目录：`C:\Local\上班库\02_Work\AI\布草送洗管理`
- 原始记录目录：`C:\Local\上班库\02_Work\所有\运营管理\物业管理\布草\送洗记录`

## 常用命令

```bash
npm install
npm run seed:history
npm run dev
npm run build
npm run server
```

`npm run seed:history` 会读取原始 Markdown 送洗记录，并生成前端可导入的历史种子数据。

## 阿里云部署

- 前端构建产物：`docs/`
- 服务端入口：`server/index.mjs`
- 服务端配置样例：`server/config.example.json`

服务端会提供：

- `GET /api/health` 健康检查
- `GET /api/sync` 拉取完整业务数据
- `PUT /api/sync` 覆盖保存完整业务数据

默认数据文件保存在服务端 `server/data/laundry-data.json`。
