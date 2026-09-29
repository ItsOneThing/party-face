# 验证记录

本项目已发布到 GitHub Pages，并完成 Supabase 后端密钥、表字段访问和正式网站 CORS 的只读验证。真人识别准确率、照片签名链接和并发仍需实测。

通过的检查：

- 9 个 Python 单元测试：Drive 链接校验、递归与分页去重、非法人脸向量、超过 1000 条导入检查点的恢复、未扫描文件拒绝、纯相册导入后补建人脸索引、公开构建不包含管理员页面/密钥、模型文件 SHA-256 完整性、新式 Supabase secret key 不作为 JWT 发送。
- 实际 Edge Function 代码在 Node VM 中运行，模拟数据库与 Storage：活动访问码格式、错误来源、请求大小、非法模型/向量/分页、关闭活动、限流、意大利语活动名、相册统计、无需向量的浏览请求、筛选参数校验、签名缩略图返回、结果不泄露人脸向量。模拟服务不是云端联调。
- SQL 在本地 PGlite 0.5.8 / pgvector 扩展 0.0.9（PostgreSQL WebAssembly）中执行：001 / 002 / 003 三个迁移（验证距离 0.45 在阈值 0.42 时排除、0.50 时接受；此测试不代表真人准确率）、包含未识别照片的 41 张相册完整分页、分类与文件名筛选（含字面百分号）、访客无权直接调用浏览函数、跨活动隔离、同一照片多脸去重、40 个结果分两页且不丢失、失败导入事务回滚、替换旧人脸、模型不匹配拒绝、anon 不能读表或调用匹配函数、关闭/过期活动无结果、请求计数限额、缩略图 bucket 为私有。Supabase 特有网关和 Storage 行为仍需真实项目联调。
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


## FaceNet512 upgrade (2026-09-29)

- Actual in-app browser, synthetic input only: the local ONNX model produced 512 finite values, L2 norm 1.0000; one warm computation took approximately 0.10 seconds. This excludes first download, model initialization, detection and alignment, and is not a mobile benchmark or an accuracy test.
- Synthetic math tests cover alignment rotation/translation/scale, degenerate landmarks, RGB prewhitening and L2 normalization.
- Supabase SQL tests apply migrations 001–004 and verify coexisting 128/512-dimensional events, correct matching, model dimension rejection and normalization rejection.
- Edge tests cover new-model validation and info response while retaining legacy requests, access-token checks, rate limits and signed thumbnails.
- Importer tests cover 512-dimensional normalized descriptors and the existing import/resume and public-build boundaries.
- New-model evaluation with consenting participants, calibration and held-out false-match/recall measurements, real mobile first-load performance and cloud deployment remain pending.
- The local model lab is excluded from public builds and does not upload selected images or vectors.

Run `node tests/facenet_test.mjs` in addition to the tests above.


## Local person grouping preview (2026-09-29)

- `node tests/person_groups_test.mjs`: complete-link admission rejects weak chains; co-photo constraints prevent merging different co-occurring faces; ambiguous membership stays separate; moving/splitting/merging, unique photo lists, duplicate IDs and descriptor validation checked.
- Actual browser example (schematic images, no real-face recognition): three groups merged into two; the intentionally misplaced A sample moved from B into A; group A then links three photos, B one. Crop/original preview and correction UI exercised.
- Public build excludes local review page and scripts. No cloud write, persistence or production query changes.
- Actual consenting event-photo clustering quality, ordering sensitivity and scale/performance remain unverified.


## Reviewed group persistence and querying (2026-09-29)

- Postgres integration now applies 001–005: a front-face match returns its manually linked side-face photo; unreviewed winners and ambiguous nearest groups return nothing; draft saves do not publish; unpublished edits preserve the live snapshot; invalid ownership, incomplete membership, dimensions and visitor permissions are rejected. Reimport makes snapshots stale and prevents querying/publishing them.
- Edge mocked-backend test verifies published groups route to match_person_groups while ungrouped events retain match_photos.
- 12 Python tests cover local event credential verification, consent/model checks, string face IDs beyond JavaScript precision, signature consistency and private-build boundaries.
- Cloud migration and real deployment were not executed. Real photo group accuracy and end-user performance remain to be tested.

## Online administrator collaboration

- `node tests/admin_edge_test.mjs`: verifies the caller through Auth /user, ignores forged actor/role fields, rejects missing/invalid/anonymous/unconfirmed sessions, maps permission/conflict/rate errors, bounds body size, enforces CORS and signs private previews without exposing backend credentials.
- SQL integration applies 001–006 against a synthetic auth.users table: event-scoped memberships, editor publication denial, outsider/cross-event denial, grant revocation, service-only RPC/table access, stale-index recovery, creator audit, two writers on the same baseline, publication baseline/latest-draft checks and per-account budget.
- Public asset build includes the authenticated review page while still excluding the local importer, model lab, .env and local-data. Login sessions are kept in page memory.
- Real Supabase credentials, account creation, production authentication and concurrent users were not exercised. No real photo reimport, migration execution or production deployment was performed in this change.

- `node tests/admin_auth_test.mjs`: rejects secret/service keys in public configuration, clears the password field, gates owner controls, keeps tokens only in memory, shares concurrent refreshes, retains session on conflict and discards in-flight results after sign-out. Browser login-page preview has no console errors; missing public-key configuration disables login with an explicit setup message.

- Unified admin hub: exact loopback origin only embeds import.html; the production page offers a link without making loopback requests. Tab switching preserves the importer iframe and keyboard navigation works. Browser preview confirms the local configuration is connected and the reviewer login panel appears on tab switch. Python public-build checks also exclude import.html.

- Login-first gate: importer iframe is not loaded anonymously and is unloaded on signout. Local import APIs verify Auth identity and the local UID allowlist on every request, including photo downloads. Unit checks reject missing, unassigned, anonymous, unconfirmed and expired/invalid sessions.


## Integrated online import

- `node tests/online_import_edge_test.mjs`: confirmed Auth, verified actor ownership, editor/outsider denial, explicit creator allowlist, folder ancestry checks, tamper-proof photo tickets, model/consent/vector/thumbnail validation, bounded bodies, private key redaction, browse-only save and owner-only publication.
- Admin hub attaches the same-origin online importer only after login, preserves the iframe on tab switches, and unloads on sign-out.
- Browser preview and live deployment checks do not constitute a real participant face accuracy or capacity test. No real biometric reimport is performed automatically.
