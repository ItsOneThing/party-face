# 验证记录

本项目已发布到 GitHub Pages，并完成 Supabase 后端密钥、表字段访问和正式网站 CORS 的只读验证。真人识别准确率、照片签名链接和并发仍需实测。

通过的检查：

- 9 个 Python 单元测试：Drive 链接校验、递归与分页去重、非法人脸向量、超过 1000 条导入检查点的恢复、未扫描文件拒绝、纯相册导入后补建人脸索引、公开构建不包含管理员页面/密钥、模型文件 SHA-256 完整性、新式 Supabase secret key 不作为 JWT 发送。
- 实际 Edge Function 代码在 Node VM 中运行，模拟数据库与 Storage：活动访问码格式、错误来源、请求大小、非法模型/向量/分页、关闭活动、限流、意大利语活动名、相册统计、无需向量的浏览请求、筛选参数校验、签名缩略图返回、结果不泄露人脸向量。模拟服务不是云端联调。
- SQL 在本地 PGlite 0.5.8 / pgvector 扩展 0.0.9（PostgreSQL WebAssembly）中执行：001 / 002 两个迁移、包含未识别照片的 41 张相册完整分页、分类与文件名筛选（含字面百分号）、访客无权直接调用浏览函数、跨活动隔离、同一照片多脸去重、40 个结果分两页且不丢失、失败导入事务回滚、替换旧人脸、模型不匹配拒绝、anon 不能读表或调用匹配函数、关闭/过期活动无结果、请求计数限额、缩略图 bucket 为私有。Supabase 特有网关和 Storage 行为仍需真实项目联调。
- 浏览器查看了中文版桌面布局和意大利语 390 × 844 手机布局，语言切换、隐私弹窗、示例结果与页脚。
- 新增相册在实际浏览器中验证：24 → 30 张分页、分类筛选、文件名无结果与清空、放大后上一张/下一张与 Esc 关闭、中文切换；意大利语 390 × 844 视口无横向溢出。截图 `gallery-preview.png` 中为示例插画。
- 实际浏览器加载固定版本 face-api.js 模型，空白图片检测得到 0 张人脸。这只验证模型加载与推理，不代表真人匹配准确率。
- 相册自动更新在 Node 模拟 DOM / 后端中验证：无变化时不重新下载照片页；新照片保留分页与筛选；后台页、放大预览不检查；失败后暂停自动更新，手动重试保留已有照片。真实导入期间的在线自动更新仍需活动开放后验证。
- JavaScript 语法检查、Python 编译和公开网站构建通过。

仍需执行：

- Google Drive 文件列表已扫描到 306 张照片；仍需验证每张下载权限和完整导入结果。
- 带真实活动访问码的查询与 Storage 签名缩略图联调。
- 真人自拍与活动照片匹配、阈值校准、侧脸/暗光/远处小脸漏检评估。
- iPhone 和 Android 真实设备上的首次加载与计算耗时。
- 10 / 50 / 100 / 250 同时查询的真实云端压力测试。工具是 `tools/load_test.py`，不能把本地模拟测试当成已通过真实 250 并发。

运行本地自动测试：

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/edge_test.mjs
node tests/gallery_test.mjs
```

`edge_test.mjs` 使用 Node 24 的 TypeScript 类型擦除 API。该工具仅用于验证，网站本身不需要 Node。

SQL 本地测试可使用官方 npm 包 `@electric-sql/pglite@0.5.8` 和 `@electric-sql/pglite-pgvector@0.0.9`，向脚本传两个包的绝对目录：

```sh
node tests/sql_test.mjs /path/to/pglite/package /path/to/pglite-pgvector/package
```

本地网页有模型检查页：<http://127.0.0.1:8765/diagnostics.html>。这个页面和管理员工具都不会被公开构建发布。
