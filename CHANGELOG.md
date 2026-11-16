# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。`0.x` 阶段的 **MINOR**（`0.3 → 0.4`）可能包含破坏性变更，**PATCH**（`0.3.0 → 0.3.1`）保持向后兼容。

条目只记录**集成方需要知道的事**：默认值、数据模型（`EmailDoc`）、导出 HTML 产物的变化，以及新增或变更的 API。纯编辑器内交互与样式微调不单列。带「破坏性变更」小节的版本会给出旧行为的等价写法；未列该小节的版本可直接升级。

**发布链路**：CI（`.github/workflows/publish-npm.yml`）在 `v*` tag 上执行 `pnpm build` + `pnpm publish`，只发布 monorepo 根包 `mail-editor-pancake`；`@simple-mail/core` / `@simple-mail/blocks` 尚未单独发布到 npm，集成侧按 README 用构建工具 alias 指向根包内子包。所以**版本号只在根 `package.json` 推进**，本文件每个条目对应一个 `v*` tag；`packages/*` 里的 `0.1.0` 由 `workspace:*` 解析，没有发布含义。

## [Unreleased]

## [0.4.0] - 2026-11-16

### 破坏性变更

- `getValue()` 与 `onChange` 回传的快照默认**不再包含 `doc.variables`**（输出 `[]`）。变量表的权威来源是宿主 `setVariables()`，逐封邮件存副本会随业务侧改 label / sample 各自过期。旧行为等价 `getValue({ variables: 'all' })`。
  - 从不注入变量、只靠 `initialDoc.variables` 携带变量的部署要注意：**升级后首次保存就会把变量表写成 `[]`**（不只是内存里丢）。必须改用 `'all'` 输出，或接入 `setVariables()`。
- `ui.hideMailMeta === true` 时 `meta.subject` / `meta.preheader` 不再落库（此前存的是 i18n 占位文案，容易被宿主当作真值提交给发送端）。`EmailMeta.subject` 类型由 `string` 改为 `string | undefined`。编辑器负责收集主题时保持 `hideMailMeta: false`，行为不变；强制保留用 `getValue({ omitMailMeta: false })`。

### 新增

- `getValue(options)`：`variables: 'none' | 'used' | 'all'`（默认 `'none'`）、`omitMailMeta?: boolean`（默认跟随 `ui.hideMailMeta`）。`'used'` 只保留内容实际引用到的 key 并丢弃 `sample`，适合「离线也要识别未注册变量」的存档。
- 导出 `slimDocForStorage()` 及类型 `SlimDocOptions` / `DocVariablesMode` / `GetValueOptions` / `EditorOptions`，并对已有文档对象（如导入的设计稿 JSON）套用同一裁剪；`collectVariableKeys()` 一并导出。
- `previewVariableResolver`：预览期展开系统变量（站点 Footer 这类只在展示时才组装的内容）。只作用于内置预览弹框与 `export({ previewVariables: true })`，不写入 `EmailDoc`，也不会连带展开业务变量的 sample。

### 变更

- `meta.subject` 缺省时不再产出空的 `<mj-title>`。
- `setValue(doc)` 容忍缺省 `variables`（记为 `[]`）。`meta.subject` 缺省时保持缺省（占位文案只在 `initialDoc` / `setPresetDoc` / `resetToPreset` 三条路径按当前语言填），宿主主题字段不会被编辑器反向覆盖。

## [0.3.1] - 2026-11-12

### 新增

- 变量占位符完整性守卫：`findBrokenVariableTokens()` / `BrokenVariableToken`，检测被富文本样式标签切断的 token（`{<b>{coupon</b>}}` 这类，替换会失配、收件人看到裸 `{{token}}`），导出弹框中先行告警并列出片段。
- 编辑期变量改为原子 chip：`VARIABLE_CHIP_ATTR` / `VARIABLE_CHIP_UNKNOWN_ATTR` / `variableChipHtml()`，从源头阻断路径；不在宿主变量列表内的 key 会以未知态提示。
- 左栏可配置顺序：`paletteGroupOrder`、`paletteBlockOrder`、`paletteSectionBlockOrder`（不传时与 0.3.0 行为一致）。

## [0.3.0] - 2026-09-17

### 新增

- 框选与多选：选择模式快捷键、`Shift` 连选、按 Section / Block 层级选择。
- 局部复制与粘贴：可只复制单列或若干块，剪贴板使用独立的局部信封（`serializeSelectionClipboard` / `parseSelectionClipboard`），粘贴时按 key 并入目标文档变量列表。
- 双击图片直接打开图库。

### 变更

- 文本块默认内容更新（仅影响新插入的块）。

### 修复

- Facebook 链接编译为分享链接，避免被邮件客户端拦截。

## [0.2.8] - 2026-09-16

### 变更

- 默认行高 `1.25 → 1.5`。影响未显式设置过行高的文档，含已存档的旧文档在重开时的渲染。

## [0.2.7] - 2026-09-14

### 变更

- 内联样式应用与清理逻辑重构，减少富文本产生的冗余 `span`；导出产物更干净，无 API 变化。

## [0.2.6] - 2026-09-10

### 新增

- 链接合法性校验，避免被邮件客户端清洗掉的无效 `href`。
- 自带布局的组件拖入时按落点层级区分，可精确放入列内或 Section 间隙。

### 变更

- 多列宽度改为内联输出，修复小屏堆叠失效。

## [0.2.5] - 2026-09-09

### 修复

- 480px 断点下的列换行行为。

## [0.2.4] - 2026-09-08

### 破坏性变更

- 移除「内容背景」配置项，仅保留页面背景：`styles.contentBackgroundColor` 退出文档模型。

### 变更

- 读取旧文档时自动迁移：`contentBackgroundColor` 被剥离，缺失的 `backgroundColor` 由它回填（`migrateLegacyStyles`），存档无需手工转换。

### 修复

- 富文本栏字号取值不稳定；锚点下划线无法移除。

## [0.2.3] - 2026-09-04

### 新增

- 小屏多列堆叠后的纵向间距可设置。
- 多列布局组合可拖入创建新 Section；小屏列间距渲染规则落地。

## [0.2.2] - 2026-08-18

### 新增

- 图片资源权限管控：`imageAssets.permissions`（`ImageAssetPermissions`）按 `upload` / `addUrl` / `delete` 三类动作校验，无权限时可置灰提示或直接隐藏（`noPermissionMode`），提示文案可覆盖；同时导出 `resolveAssetPermission()` 与相关类型供宿主复用。

### 变更

- 界面术语统一为「图库」（原「图床」），涉及内置 i18n 文案与文档；自定义组件文案不受影响。

## [0.2.1] - 2026-07-21

### 修复

- 文本块占位文案未随语言切换。

## [0.2.0] - 2026-07-20

### 新增

- 内置国际化：`locale` 选语言，随包提供 `zh-CN` / `en-US`；`messages` 可覆盖任意条文案。内置块定义改为按语言生成（`createAllBlocks({ locale })` / `createBuiltinBlocks({ locale })`），英文环境下需显式传入，否则块默认内容仍是中文。

### 变更

- 富文本选区复制优化；浮动工具条定位修正。

## [0.1.1] - 2026-06-04

- 发布修复，无功能变化。

## [0.1.0] - 2026-06-04

### 新增

- 动态变量名：Section `dynamicVariantKey`，由 `enableDynamicVariantKey` 开关控制（默认关闭）。
- 设计稿 JSON 导出 / 导入。
- 布局列数可配置，`3 列` 并入 `2 列`体系（旧文档按对应列数渲染）。
- 变体面板可固定、可配置是否显示变体入口、点击他处自动关闭；变体示例补充 link / image 类型；自定义块可与其内部块合并。
- 自定义组件支持左栏自定义标签；列表缩进控制；列表局部选中后改类型；撤销重做优化；代码模式容量与内容修复。

## [0.0.9] - 2026-05-28

### 新增

- 变体系统优化（插入与展示）。

### 变更

- 画布清空 / 重置不再二次确认。

### 修复

- 社交图标显示。

## [0.0.8] - 2026-05-27

### 新增

- 画布清空与重置。
- 自定义颜色面板。
- Section / Block 虚线边框可显隐；空的单列自动移除；文本编辑中也可切换布局；右栏显示聚焦面包屑。

### 变更

- `1:2` / `2:1` 布局合并为两列块（旧文档按两列渲染）。
- 默认字号与字重档位调整，字重表示改为数字档位。

## [0.0.7] - 2026-05-18

### 新增

- 一次插入组合布局内的多个块；窄屏适配优化；全屏模式。

## [0.0.6] 及更早（2026-04-28 ~ 2026-05-18）

- 奠基阶段：四层文档模型与 JSON → MJML → HTML 导出链路、富文本行内编辑、组件（文本 / 图片 / 按钮 / Hero / 社交 / 原始 HTML）、图片上传与图库、主题与主题色、多列与内外间距、可选主题与 Preheader、类型声明与发布链路。

---

## 版本号说明

排障时用到的几个事实：

- `0.0.1` – `0.0.6` 只打了 git tag，未发布到 npm（CI 调通阶段）；npm 上最早可用版本是 `0.0.0` 与 `0.0.7`。
- `0.3.2` **不存在**：该号从未发布，版本号直接从 `0.3.1` 跳到 `0.4.0`（0.4.0 含破坏性变更，不应落在 `^0.3.1` 的自动升级范围内）。
- tag `v0.2.4` 与 `v0.2.5` 指向同一提交（`89e06d9`），`0.2.5` 的实际内容在 `0e9378f`。按 tag 做 `git diff` 对照时以本文件的日期段为准。
- `0.1.x` 及更早条目为 2026-11 回填，只列主要能力，不作为迁移依据。
