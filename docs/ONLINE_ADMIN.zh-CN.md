# 多人在线核对人物分组

新增 `online-admin.html`，可随 GitHub Pages 发布。每位管理员用自己的 Supabase Auth 邮箱和密码登录；活动权限由组织者在数据库分配。此页只核对已有 FaceNet512 索引，不导入照片，也不开放活动。

## 一次性配置

1. 已有 001–005 的项目，在 Supabase **SQL Editor** 执行 `supabase/migrations/006_online_admin.sql`。新项目按顺序执行 001–006；不要重复运行已执行的建表迁移。
2. 在 **Edge Functions** 新建 `admin-groups`，粘贴 `supabase/functions/admin-groups/index.ts` 的全部代码并部署。函数设置中关闭网关的 **Verify JWT**；代码会在每次请求中调用 Auth `/user` 验证真实登录身份。不能移除这段验证。继续使用项目自带 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 和已有 `ALLOWED_ORIGINS`，后者包含 `https://itsonething.github.io,http://127.0.0.1:8765`。使用 CLI 时：

   ```sh
   supabase functions deploy admin-groups --project-ref 你的项目ID
   ```

3. 在 **Authentication → Users → Add user → Create new user** 为每位管理员创建单独邮箱/密码账号并确认邮箱（界面如果有 Auto Confirm，启用它）。账号不是项目成员，不需要给对方 Supabase Dashboard 权限。密码私下提供给本人。页面不提供公开注册；可在 Auth 设置关闭新用户注册。
4. 复制该用户的 UID。SQL Editor 为**具体活动**授予权限，把下面两个占位值替换成真实 UID 和新的 FaceNet512 活动编号：

   ```sql
   insert into public.event_admins(event_id,user_id,role)
   select id,'替换成用户UID'::uuid,'editor'
   from public.events where slug='替换成活动编号'
   on conflict(event_id,user_id) do update set role=excluded.role;
   ```

   `editor` 可以读取、核对和保存；把负责人对应记录的 role 改为 `owner`，才能发布。角色不会通过注册、邮箱或客户端字段自动获得。活动必须使用新模型并已有索引，旧的 128 维活动不显示。
5. 在项目 **Settings → API Keys** 找公开的 **Publishable key**（`sb_publishable_...`），或 Legacy **anon** key，在 `public/config.js` 填写 `supabasePublishableKey`。`supabaseUrl`、`adminEndpoint` 必须对应同一项目。**绝不能填 Secret key / service_role key**；公开 key 是登录应用的标识，管理员权限仍由登录会话和后端会员表验证。
6. 检查后发布 GitHub Pages，管理员入口为 `https://itsonething.github.io/party-face/online-admin.html`。本地预览入口为 `http://127.0.0.1:8765/online-admin.html`，也连接同一 Supabase。重启本地服务使本地分组工具使用新的版本检查。

这里仅新增文件与配置说明；写代码不会自动执行迁移、建立账号、分配权限或部署云端。

## 怎么协作

登录 → 选择活动 → 确认已有有效的人脸处理授权 → 读取活动 → 核对、合并、移出错分人脸 → 保存草稿。负责人重新读取最新草稿后发布，已开放活动才会使用该发布版本。

草稿保存到 Supabase，其他管理员点击“读取活动”就能看到。不是实时共同编辑，也不会自动合并两份人工修改：两人读取相同版本后，第一人保存成功，第二人保存会收到冲突提示；第二人的修改仍在页面中，须记录后重新读取并重新应用。重新读取会替换未保存内容。人数较多时建议分工轮流保存，减少冲突。

发布必须是最新草稿，且发布基线未变化。保存不改变访客查询；发布不自动开放活动。索引新增、删除或重建后，旧草稿可能过期，必须重新读取并核对。

读取上限为 500 张照片、2000 张人脸；每账号每分钟最多 30 次管理请求。缩略图签名链接有效 15 分钟，预览失效时重新读取。登录会话只保存在页面内存，刷新后需重新登录；打开页面时操作可刷新 token，闲置到登录过期会清空页面数据。未保存编辑会丢失，请及时保存。

撤销管理员权限：

```sql
delete from public.event_admins
where event_id=(select id from public.events where slug='替换成活动编号')
  and user_id='替换成用户UID'::uuid;
```

下次请求立即检查权限。已下载的预览不能被远程撤回，因此仅给可信、获授权的人员分配权限。不要共享服务密钥或管理员密码。

## 验证边界

已用本地 Postgres/WASM、模拟 Auth/Storage 和页面预览检查权限、版本冲突和请求约束。真实 Supabase 登录、两位管理员协作及生产部署需完成配置后验证。人物分组仍需要人工核对；协作功能本身不提高识别准确率，也不替代活动参加者的有效授权。

Supabase 官方依据：[密码登录](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)、[服务器验证用户](https://supabase.com/docs/reference/javascript/auth-getuser)。
