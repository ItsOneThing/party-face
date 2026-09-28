# partyface

[![License: MIT](https://img.shields.io/badge/License-MIT-006b43.svg)](LICENSE)
[![Deploy](https://github.com/ItsOneThing/party-face/actions/workflows/pages.yml/badge.svg)](https://github.com/ItsOneThing/party-face/actions/workflows/pages.yml)

**用一张自拍，找到有你的活动照片。**

*Ritrova le tue foto con un selfie, oppure sfoglia tutti i momenti dell’evento.*

partyface 是一个可重复使用的活动照片网站，支持中文和意大利语。参加者免注册，选择自己的自拍后即可搜索活动照片，也可以切换到完整相册浏览；原图继续保存在 Google Drive。

[访问网站](https://itsonething.github.io/party-face/) · [Italiano](https://itsonething.github.io/party-face/?lang=it) · [部署指南](docs/SETUP.zh-CN.md) · [验证记录](TESTING.md)

> 网站首页不是完整活动链接。照片查询需要组织者完成导入、开放活动，并分享带有 `#key=…` 的活动链接。自拍匹配可能漏检，不能保证找全所有照片。

## 功能

- **自拍搜索**：自拍在浏览器本机分析，原图不上传；查询时只发送人脸特征。
- **完整相册**：无需自拍，按相册分类和文件名筛选，每页加载 24 张。
- **照片预览**：点击放大，支持上一张、下一张和键盘左右切换。
- **Drive 原图**：直接跳转 Google Drive 查看或下载，遵循文件本身的分享权限。
- **双语界面**：中文 / Italiano，深浅绿色主题和手机适配。
- **重复使用**：每场活动使用独立编号、文件夹和访问码，支持断点导入与补建索引。
- **识别兜底**：零人脸照片仍进入相册；分析失败时可先发布浏览相册，再补做人脸索引。

## 工作方式

| 部分 | 技术 | 用途 |
| --- | --- | --- |
| 参加者网站 | HTML / CSS / JavaScript、GitHub Pages | 自拍分析、搜索结果与相册浏览 |
| 人脸识别 | face-api.js 0.22.2 | 在参加者或组织者的浏览器中分析照片 |
| 查询后端 | Supabase Edge Functions、PostgreSQL / pgvector | 验证活动访问码、匹配与分页 |
| 缩略图 | Supabase 私有 Storage | 提供临时签名链接 |
| 原始照片 | Google Drive | 查看及下载原图 |
| 本机导入工具 | Python、Pillow、管理网页 | 扫描文件夹、生成缩略图、建立人脸索引 |

**导入工具只在组织者电脑运行。** 导入完成后，参加者访问线上网站；组织者不需要一直开着电脑。

## 使用流程

**参加者**

1. 打开组织者发来的完整活动链接。
2. 选择自拍并同意人脸检索，或者切换到“浏览全部照片”。
3. 查看结果，点击原图链接前往 Google Drive。

**组织者**

1. 配置 Supabase、Google Drive API 和 GitHub Pages。
2. 在本机打开 `admin.html`，输入活动名称、编号和照片文件夹。
3. 扫描并导入照片，检查失败记录和样本识别效果。
4. 开放活动，先测试，再分享完整活动链接。
5. 下次活动换一个编号和文件夹，复用同一套系统。

## 本地运行

需要 Python 3.10+；网站本身不需要 npm 安装。

```sh
git clone https://github.com/ItsOneThing/party-face.git
cd party-face
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python tools/download_models.py
cp .env.example .env
.venv/bin/python tools/server.py
```

- 网站：[http://127.0.0.1:8765/](http://127.0.0.1:8765/)
- 管理工具：[http://127.0.0.1:8765/admin.html](http://127.0.0.1:8765/admin.html)
- Mac 已配置环境后也可以双击 `start.command`。

本机 `.env` 保存 Supabase 后端密钥和 Google Drive API key。不要把它或 `local-data/` 提交到仓库。详细配置见 [部署指南](docs/SETUP.zh-CN.md)。

## 部署

1. 在 Supabase 依次运行 [001](supabase/migrations/001_party_face.sql) 和 [002](supabase/migrations/002_gallery.sql) 数据库迁移。
2. 部署 [search-photos](supabase/functions/search-photos/index.ts) Edge Function，配置 `ALLOWED_ORIGINS` 和 `RATE_LIMIT_SALT`；由代码验证活动访问码。
3. 在 `public/config.js` 填入自己的公开接口地址，并配置本机 `.env`。
4. 在公开 GitHub 仓库的 **Settings → Pages → Source** 选择 **GitHub Actions**，运行 **Publish partyface**。
5. 使用本机工具导入照片并开放活动。

自动发布只包含允许的访客网页与模型文件；不发布管理页面、密钥或人脸备份。部署时会自动下载固定版本识别资源。

系统以免费计划为目标，不依赖付费 AI 识别服务。平台仍有容量、流量和暂停规则；不能承诺无限免费、几秒完成或 250 人同时访问不卡顿。首次模型下载约 13 MB，真实手机效果和并发容量需要实测。

## 隐私与访问

- 自拍原图留在用户设备，查询向量发送到 Supabase；查询代码不把向量写入数据库，也不记录请求 body。
- 活动照片的人脸特征和缩略图由组织者预先导入后端，人脸特征仍属于敏感数据。
- 数据表开启 RLS，访客不能直接读取人脸表；网页通过受控接口获取临时缩略图链接。
- **持有活动链接的人可以浏览整个活动相册。** 自拍搜索用于找照片，不构成身份验证。
- 组织者应在发布前取得照片使用与人脸检索所需的授权，并说明用途与保留时间。
- 活动照片、访问码、私有缓存和原始人脸数据不属于公开源码。

## 灵感与鸣谢

界面布局与活动照片查找体验受到 [ENDU 活动照片页面](https://www.endu.net/it/events/polimirunspring/photos) 的启发。partyface 是独立开发的项目，与 ENDU 没有官方关联。

- 照片来源：**passion lab polimi摄影社**。
- 人脸识别：[face-api.js](https://github.com/justadudewhohacks/face-api.js)，感谢 Vincent Mühler 和上游贡献者。
- 维护者：[ItsOneThing](https://github.com/ItsOneThing)。有任何问题，可以找 OneThing，或提交 [Issue](https://github.com/ItsOneThing/party-face/issues)。

## 开源许可证

partyface 自有源码与文档采用 [MIT License](LICENSE)。欢迎使用、修改与分发，并保留版权及许可证声明。

**MIT 许可不授予活动照片、第三方品牌或私人数据的使用权。** 第三方依赖保留各自的许可证，见 [第三方说明](THIRD_PARTY_NOTICES.md)。
