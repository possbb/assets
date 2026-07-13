# Excel 安全迁移助手

此工具只读取以下工作表中的非敏感业务字段：账户余额、年度收入、年度支出、固定资产和股票期权、银行账户和证照信息。

它刻意不读取或输出备注、账号/卡号、证件号、地址、密码、PIN、验证码、邮箱或附件路径。账户机构、归属人、资产权益比例、负债余额和内部资产转换会进入人工复核队列。

在 `web` 目录运行：

```powershell
& 'C:\Users\possb\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\tools\import-workbook.mjs 'D:\资产文件\资产数据-NEW 26.7.8.xlsx'
```

默认输出为 `web/.local-import/asset-manager-import.json`。打开本地应用后，用“导入备份”选择该 JSON；应用会保留数据并忽略外层的 `review` 报告。完成复核后，应将这个临时 JSON 移至加密位置或删除。
