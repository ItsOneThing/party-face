# partyface 配置与部署指南

免费活动照片查找网站：朋友选择自拍，在浏览器本机生成人脸特征，再通过 Supabase 搜索活动照片；点击结果跳到 Google Drive 原图。支持中文和意大利语，品牌为 **partyface**。

默认进入“自拍找照片”，也可切换到“浏览全部照片”：按 Drive 子文件夹分类、文件名筛选、每页 24 张、点击放大并连续翻看，最后打开 Drive 原图。没有匹配结果或识别失败时会提供浏览入口。浏览不要求自拍，也不加载识别模型。

页脚：**有任何问题，可以找OneThing**。照片来源：**passion lab polimi摄影社**。

## 当前交付状态

- 网站、双语页面、本地导入工具、Supabase SQL / Edge Function、GitHub Pages 部署流程已生成。
- 使用固定版本 face-api.js 0.22.2；新克隆的项目先运行模型下载脚本，GitHub Actions 也会自动下载。
- 仓库维护者的网站已发布，Supabase 接口和表访问已验证。新部署仍需自行创建项目、配置密钥、导入照片并开放活动；未配置接口时显示预览插画。真人识别效果与 250 并发尚未完成实测。
- 250 位参加者不是 250 个同时请求。并发容量依赖人脸总数、网络和免费数据库算力；不能在实测前承诺几秒或绝不卡顿。

## 先看页面（不需要云账号）

在 Mac 双击 `start.command`，保持终端打开，然后访问：

- 中文：<http://127.0.0.1:8765/>
- Italiano：<http://127.0.0.1:8765/?lang=it>
- 本地活动发布工具：<http://127.0.0.1:8765/admin.html>

`start.command` 优先使用本地 `.venv`，其次使用已有 Codex Python 运行时。其他电脑需要 Python 3.10+：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python tools/download_models.py
cp .env.example .env
.venv/bin/python tools/server.py
```

Python 依赖仅 Pillow。网页不需要 npm 安装或前端构建。服务仅监听 `127.0.0.1:8765`；导入期间不要关闭网页、终端或让电脑休眠。

## 1. 创建 Supabase 免费项目

1. 在 <https://supabase.com/dashboard> 创建 **Free** 组织和项目。建议选择靠近参加者的区域。不要升级到付费计划。
2. 打开项目 SQL Editor，依次运行 `supabase/migrations/001_party_face.sql` 和 `supabase/migrations/002_gallery.sql`（各一次）。这会创建私有人脸表、活动表、匹配/浏览函数和私有缩略图 bucket。已运行 001 的项目只需运行 002，再更新 Edge Function。
3. 在项目设置找到 Project URL，以及后端使用的 `service_role` JWT API key 或 `sb_secret_...` secret key。填入本机 `.env`：

```dotenv
SUPABASE_URL=https://你的项目ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=仅在本地填写的后端密钥
GOOGLE_DRIVE_API_KEY=下一步创建的API密钥
PUBLIC_SITE_URL=https://你的GitHub用户名.github.io/party-face/
```

密钥不要发聊天、不要写进 `public/config.js`、不要提交 GitHub。`.env` 和 `local-data/` 已被 Git 忽略。浏览器只得到本地临时会话码，不得到云端密钥。

## 2. 配置免费查询接口

在 Supabase Dashboard → Edge Functions 新建名为 `search-photos` 的函数，粘贴 `supabase/functions/search-photos/index.ts` 的完整代码。

- 关闭该函数的 **Verify JWT / legacy JWT verification**。这是免注册接口，代码自身校验随机活动访问码；不等于公开数据库表。
- 在函数 Secrets 中设置：
  - `ALLOWED_ORIGINS=https://你的GitHub用户名.github.io,http://127.0.0.1:8765`（逗号分隔；只填写 origin，不含仓库路径，也不以 `/` 结尾）。
  - `RATE_LIMIT_SALT=至少32位随机字符串`（例如本地运行 `python3 -c 'import secrets; print(secrets.token_hex(32))'`）。
- `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 是 Supabase 预置环境变量，不用写进代码。
- 部署函数后，编辑 `public/config.js` 的 `endpoint`：

```js
window.PARTY_CONFIG = {
  endpoint: "https://你的项目ID.supabase.co/functions/v1/search-photos",
  defaultEvent: "welcome-2026",
  defaultTitle: "迎新会 2026"
};
```

也可以用 Supabase CLI：`supabase link --project-ref 你的项目ID`，再 `supabase functions deploy search-photos --no-verify-jwt`；Secrets 仍通过 Dashboard 设置，避免密钥出现在 shell 历史。

## 3. 配置 Google Drive 导入访问

在 Google Cloud Console 创建项目、启用 **Google Drive API**，创建一个 API key。导入公开文件夹只需 API key，无需给每位参加者做 Google OAuth。

- API 限制只允许 Google Drive API。导入由本地 Python 发请求，不要把 key 设置成“HTTP 网站 referrer 限制”；如需应用限制，可绑定你的固定出口 IP。
- 把 key 填入 `.env` 的 `GOOGLE_DRIVE_API_KEY`。不要放进网页。
- 仅支持你本来就允许通过链接访问的文件。网页能浏览不代表每个子文件的下载权限都已核实；如 API 报错，请检查子文件权限和组织共享规则。
- 原图继续使用 Drive 自身的分享/下载权限。无需在 Supabase 存一份原图。

你的首场活动文件夹已预填：<https://drive.google.com/drive/folders/1Rruj0bvN9gZzSbvtwEVbPRoUshQ0-X7x>。
根目录内的“工作组”“活动”“赞助”都会递归扫描。如果只想发布其中一类，输入对应子文件夹的链接。

## 4. 发布网站到 GitHub Pages

1. 新建 GitHub 仓库（例如 `party-face`），上传项目代码。免费 Pages 使用公开仓库；代码可公开，活动数据和密钥不提交。
2. 确保默认分支是 `main`。Settings → Pages → Source 选择 **GitHub Actions**。
3. 推送 `main` 或手动执行 **Publish partyface** workflow。
4. 工作流只从允许的文件构建 `dist/`。不会发布 `admin.html`、`admin.js`、`.env` 或本地人脸备份。
5. 把得到的网站基础地址填回 `.env` 的 `PUBLIC_SITE_URL`，并确认 Edge Function 的 `ALLOWED_ORIGINS` 与网站 origin 一致。

网页按相对路径加载模型，支持 `用户名.github.io/仓库名/` 子路径。使用免费 `github.io` 域名即可，不用买域名。

GitHub Pages 有容量、流量和用途限制；若以后变成商业 SaaS，不应继续用它作为商业服务托管。官方说明：<https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>。

## 5. 导入与分享这场活动

1. `.env` 配置完成后重启本地服务，打开 `admin.html`。
2. 输入中文/意大利语名称、唯一活动编号和 Drive 链接。
3. 点击“扫描照片并准备活动”，再“开始导入”。新活动默认关闭。
4. 原图在本机下载后生成最长边 2400 px 的分析副本和 640 px 缩略图；不改动 Drive 原图。人脸识别在本机浏览器进行，同步到 Supabase 的是特征和缩略图。
5. 检查导入日志，尤其是零人脸图片。侧脸、远距离大合照可能漏检，本工具不保证找全。
6. 点击“开放活动并生成链接”。链接类似 `https://用户名.github.io/party-face/?event=welcome-2026#key=随机访问码`。
7. 先用自己的真实自拍测试，再分享完整链接到群里。意大利语链接在 `?event=...` 后加 `&lang=it`，保留完整 `#key=...`。

后续活动换新编号和文件夹即可。重复扫描会按 Drive 文件内容校验/修改时间及模型版本跳过已处理项。暂停后可继续；关闭页面或出现失败后重新扫描，可跳过已成功项。失败时单张照片的数据库更新是事务性的，不会留半张人脸索引。

零人脸照片也会进入完整相册。识别模型加载或单张分析失败时，导入工具仍可保存照片供浏览，并标记为未完成识别；以后开启“建立人脸索引”重新扫描可补做。也可以取消该选项，先发布纯相册，再补识别。下载或上传失败的文件仍需重试。

分享链接加 `&view=browse` 可直接进入完整相册，例如 `?event=welcome-2026&lang=it&view=browse#key=...`；默认进入自拍搜索。Supabase 查询故障时提供重试和 Drive 文件夹入口，数据库暂停时网站内的完整相册也无法加载。

从 Drive 删除的照片**不会自动从网站索引中删除**；请在 Supabase 删除对应 `photos` 记录及缩略图。关闭活动按钮只将 `active` 设为 false。删除整个活动可在后台删除 `events` 对应行，数据库会级联删除照片和人脸；Storage 中该活动 ID 的文件夹需另行删除。本机 `local-data/` 包含缓存、人脸备份和访问码，按需清理并妥善保护，不要上传公开仓库。

## 免费容量、速度与访问限制

系统按免费计划部署设计，仍受数据库、存储、出站流量与活跃度限制。免费项目暂停后需要恢复才能继续查询。额度会变化，以 Dashboard 和官方文档为准：

- <https://supabase.com/docs/guides/platform/billing-on-supabase>
- <https://supabase.com/docs/guides/platform/free-project-pausing>

不使用 Realtime 持续连接。每页 24 张缩略图，滚动/点击再加载，原图下载不经过 Supabase。匹配是**当前活动内的精确欧氏距离搜索**，同一照片去重后分页，不用固定 top-k 截断整个结果集。默认阈值 0.50 需要真实样本校准，不能把距离当准确率。人脸非常多时，精确扫描可能慢，需要实测后决定是否优化。

识别模型资源约 12.5 MB，加上识别库约 13 MB。它们从 GitHub Pages 下载，不占 Supabase 出站流量；手机首次加载取决于网络，不能保证几秒完成。后续由浏览器 HTTP 缓存尽量复用。

后端默认每活动每分钟 1000 次请求、每来源 IP 哈希每分钟 300 次请求、每天搜索与浏览合计 5000 次分页请求和 20000 次活动信息请求。使用数据库原子计数；并发不会绕过计数。共享校园网络可能共用 IP；限流是保护免费额度的措施，不是身份验证。CORS 只限制浏览器来源，不阻止持有链接的人通过脚本调用。活动访问码应只发给参加者。

用真实手机检查：首次模型加载、自拍分析耗时、低端设备、HEIC 提示、多脸拒绝、零脸提示、断网重试、结果分页和 Drive 下载。不要把网站的插画当作识别效果测试。

`tools/load_test.py` 是待配置后执行的并发测试工具。准备同一模型的 128 维向量 JSON 和含活动完整链接的本地文本文件（都放 `local-data/`，不上传 GitHub），然后运行：

```sh
python3 tools/load_test.py \
  --endpoint https://你的项目ID.supabase.co/functions/v1/search-photos \
  --link-file local-data/test-link.txt \
  --vector-file local-data/test-vector.json \
  --origin https://你的GitHub用户名.github.io \
  --levels 10,50,100,250 --run
```

它会真实消耗请求额度，按等级测试同时请求，输出成功/错误数量和 P50/P95；每级间隔 65 秒，避免限流窗口重叠。**这个测试不包含手机模型下载/自拍计算，也不包含原图下载，更不代表真实用户端到端速度。** 不要绕过平台限流，不要连续无限压测。

## 隐私和开源说明

自拍原图不发后端。查询向量由用户设备发给 Supabase，只在查询中使用，不写入数据库；代码不记录请求 body。人脸表开启 RLS 且没有访客读权限；搜索返回匹配照片的临时缩略图链接，浏览返回本活动全部导入照片的临时缩略图链接。持有活动链接的人可浏览完整相册；自拍搜索并不构成身份验证。特征本身仍属于敏感的人脸数据，不代表匿名。

模型、检测选项与特征版本在导入和查询中保持一致。face-api.js 0.22.2 的代码及上游模型资源来自其固定版本仓库；原始许可证保留于 `public/vendor/face-api-LICENSE.txt`。资源清单记录 SHA-256，用于检查本地资源完整性，不是第三方安全审计。模型是较旧的技术，移动端兼容性与识别效果须实测。

## 本地检查

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
python3 tools/build_site.py
```

本地测试验证数据校验、递归导入、断点记录和公开构建范围。SQL 已在本地 PostgreSQL WebAssembly 运行时执行验证；云端 SQL 部署、Storage 签名链接、真人识别与并发仍需连接项目后验证。完整验证记录见 [TESTING.md](../TESTING.md)。
