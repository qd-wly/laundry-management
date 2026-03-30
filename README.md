# 布草送洗管理

手机端布草送洗登记工具，支持：

- 送洗登记、批次管理、月度统计
- IndexedDB 本地存储
- Excel 导出
- GitHub 手动同步
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
```

`npm run seed:history` 会读取原始 Markdown 送洗记录，并生成前端可导入的历史种子数据。
