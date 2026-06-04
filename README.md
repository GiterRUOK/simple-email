# Simple Mail Editor

**Simple Mail** 是面向运营与开发的轻量邮件可视化编辑器。文档模型固定为四层（Doc → Section → Column → Block），导出链路为 JSON → MJML → HTML，可嵌入 React、Vue 或任意前端项目。

```text
Doc → Section → Column → Block    // 仅四层，Block 不可再嵌套子组件
左栏组件区 │ 中间画布区 │ 右栏属性配置区
```

## 目录

- [npm 包](#npm-包)
- [特性](#特性)
- [仓库结构](#仓库结构)
- [开发与构建](#开发与构建)
- [安装与集成](#安装与集成)
- [快速开始](#快速开始)
- [MailEditor API 速览](#maileditor-api-速览)
- [画布清空与重置](#画布清空与重置)
- [界面主题与品牌色](#界面主题与品牌色)
- [UI 选项 `ui`](#ui-选项-ui)
- [构造选项（画布行为）](#构造选项画布行为)
- [变量系统](#变量系统)
- [动态变量节（dynamicVariant）](#动态变量节dynamicvariant)
- [设计稿剪贴板](#设计稿剪贴板)
- [图片资源 `imageAssets`](#图片资源-imageassets)
- [框架集成示例](#框架集成示例)
- [自定义组件](#自定义组件)
- [集成说明](#集成说明)
- [操作手册](#操作手册)
- [设计与代码模式](#设计与代码模式)
- [数据模型速览](#数据模型速览)
- [路线图](#路线图)
- [设计取舍](#设计取舍)
- [许可证](#许可证)

---

## npm 包

安装与业务代码中的 import 使用下列 **scoped 包名**：

| 包名 | 内容 |
|------|------|
| `@simple-mail/core` | 编辑器引擎、`MailEditor`、类型与工具函数；样式入口 `@simple-mail/core/style.css` |
| `@simple-mail/blocks` | 内置组件与示例自定义块（`builtinBlocks`、`allBlocks`） |

本仓库在 Git 中目录名为 `simple-mail`；npm 上 monorepo 根包名为 `mail-editor-pancake`（因无 scope 的 `simple-mail` 已被占用）。**集成时请只安装并 import `@simple-mail/*`**，不要依赖 `mail-editor-pancake/packages/...` 这类深路径。

本地 link 整仓开发时，依赖名可能为 `mail-editor-pancake`，但代码中仍应写 `@simple-mail/core` 等，并在构建工具里配置 alias（见 [安装与集成](#安装与集成)）。

```ts
import { MailEditor } from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { allBlocks } from '@simple-mail/blocks';
```

仓库目录结构：

```text
simple-mail/
├── packages/core/    →  @simple-mail/core
├── packages/blocks/  →  @simple-mail/blocks
└── playground/vanilla/   演示项目（不随 npm 发布）
```

---

## 特性

- 框架无关核心（vanilla TS），可用于 React / Vue / 原生项目
- 严格两级 SortableJS 拖拽：Section 排序 + Column 内 Block 排序；**仅从 hover 出现的 ⋮⋮ 图标拖动**，避免点选文本时误拖
- **画布内联编辑**：双击 Text/Button 等；浮动工具条支持加粗/斜体/下划线/删除线、字体、字号、颜色、对齐、列表、链接、清除格式
- **HTML 白名单清洗**：富文本进入 MJML 前清洗标签与属性；`<font>` → `<span style>`
- **MJML 管线**：内部 `EmailDoc` JSON → MJML → 邮件客户端可用 HTML
- 双模式：设计态 + 源码态（文档级只读 MJML/HTML；组件级可锁定 `lockedMjml`）
- 内置块：文本、HTML(raw)、图片、按钮、分隔线、间距、Hero、社交组，以及 1/2/3 列布局；示例自定义：Logo、单链社交、页脚
- **图片字段**：手输 URL；可选上传（`uploadImage`）、内置图库（`imageGallery`）、自管图床（`pickImageFromGallery`）
- 撤销/重做、键盘删除、复制 Section/Block；**复制/导入设计稿**（JSON 信封）
- **界面主题**：浅色 / 深色 / 跟随系统；画布仍为白纸贴近成品
- **品牌色**：`accentColor` / `setAccentColor`；可选顶栏拾色器
- **仅搭正文**：`ui.hideMailMeta` 隐藏主题、Preheader 与顶栏「邮件设置」
- **清空 / 重置**：`presetDoc` 与 `initialDoc` 分离
- **变量系统**：`setVariables`；`kind: link | image`；顶栏 `{{ }}` 弹层
- **动态变量节**（可选）：`Section.attrs.dynamicVariantKey`，导出时整节替换为 `{{key}}`，由业务侧注入最终 HTML（如券包区块）
- **点空白取消选中**：`clearSelectionOnCanvasMargin`
- 包体：核心 + MJML + CodeMirror + 富文本，gzip ≈ 580–590KB（主要来自 `mjml-browser`）

---

## 仓库结构

```text
simple-mail/
├─ packages/
│  ├─ core/      @simple-mail/core    store / 渲染 / 三栏 UI / 拖拽 / 代码模式
│  └─ blocks/    @simple-mail/blocks  内置块 + 示例自定义块
├─ playground/
│  └─ vanilla/   原生 TS 演示（pnpm dev）
├─ package.json  name: mail-editor-pancake（monorepo 根）
└─ pnpm-workspace.yaml
```

---

## 开发与构建

环境：**Node ≥ 20**，**pnpm ≥ 10**（见根 `packageManager`）。

```bash
cd simple-mail
pnpm install
pnpm dev          # playground，默认 http://localhost:5173
pnpm build        # 构建 packages/core、packages/blocks → dist/
pnpm typecheck    # 全包类型检查
pnpm lint         # biome check
pnpm --filter @simple-mail/playground-vanilla build
```

若你正在本地修改本仓库源码，请在 monorepo 根执行 `pnpm build` 后再刷新引用方项目，以保证 `dist` 与类型声明一致。

---

## 安装与集成

### 从 npm 安装

```bash
pnpm add @simple-mail/core @simple-mail/blocks
pnpm add codemirror mjml-browser sortablejs
```

`@simple-mail/core` 依赖 CodeMirror、MJML 与 SortableJS，请在项目中一并安装，以便打包工具能正确解析。

```ts
import { MailEditor } from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { builtinBlocks, allBlocks } from '@simple-mail/blocks';
```

- 仅需内置块时用 `builtinBlocks`；需要 Logo/页脚等示例时用 `allBlocks`，或与业务 `defineBlock` 合并。
- `@simple-mail/blocks` 依赖 `@simple-mail/core`，版本宜对齐。

### 本地 link（参与本仓库开发时）

在你的项目 `package.json` 中 link 本仓库根包，并安装与 core 相同的运行时依赖：

```json
{
  "dependencies": {
    "mail-editor-pancake": "link:../simple-mail",
    "@codemirror/lang-html": "^6.4.9",
    "@codemirror/state": "^6.5.2",
    "@codemirror/view": "^6.36.2",
    "codemirror": "^6.0.1",
    "mjml-browser": "^4.15.3",
    "sortablejs": "^1.15.6"
  }
}
```

import 路径仍使用 `@simple-mail/*`。以 Vite 为例，将 alias 指向 `node_modules/mail-editor-pancake/packages` 下对应子包，并将这些包排除在依赖预构建之外：

```ts
// vite.config.ts 示意
const mailEditorPkgRoot = path.resolve(__dirname, 'node_modules/mail-editor-pancake/packages');

export default defineConfig({
  resolve: {
    alias: {
      '@simple-mail/core': path.join(mailEditorPkgRoot, 'core'),
      '@simple-mail/core/style.css': path.join(mailEditorPkgRoot, 'core/dist/style.css'),
      '@simple-mail/blocks': path.join(mailEditorPkgRoot, 'blocks'),
      // link 时建议将 codemirror / mjml-browser / sortablejs 解析到你项目中的安装路径
      codemirror: path.dirname(require.resolve('codemirror/package.json')),
      'mjml-browser': path.dirname(require.resolve('mjml-browser/package.json')),
      sortablejs: path.dirname(require.resolve('sortablejs/package.json')),
    },
  },
  optimizeDeps: {
    exclude: ['@simple-mail/core', '@simple-mail/blocks'],
  },
});
```

若界面行为与最新源码不一致：先在编辑器仓库执行 `pnpm build`，再删除你项目中的 `node_modules/.vite` 并重启开发服务器。

### 发布

当前可发布子包：

| 包名 | 说明 |
|------|------|
| `@simple-mail/core` | 引擎 + 样式 `style.css` |
| `@simple-mail/blocks` | 内置与示例块定义 |

npm 上仅发布 `@simple-mail/core` 与 `@simple-mail/blocks`。根包 `mail-editor-pancake` 仅用于 monorepo 与本地 link。发布前需在各子包执行 build，且 `package.json` 的 `files` 包含 `dist`。

---

## 快速开始

```ts
import { MailEditor } from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { allBlocks } from '@simple-mail/blocks';

const editor = new MailEditor({
  container: document.getElementById('app')!,
  blocks: allBlocks,
  initialDoc: {
    meta: { subject: '欢迎', width: 600 },
    variables: [{ key: 'user.name', label: '用户名', sample: '张三' }],
    sections: [],
  },
  // presetDoc: businessDefault,   // 顶栏「重置内容」目标，见下文
  // ui: { hideMailMeta: true, preferSliderControls: true },
  autoWrapSection: true,
  onChange: (doc) => console.log(doc),
});

const { mjml, html } = editor.export({ withSampleVariables: true });
```

构造后请用 `setVariables` 注入业务变量列表。若只写在 `initialDoc.variables` 中，后续 `setValue` 恢复文档时可能被空数组覆盖。

```ts
editor.setVariables([
  { key: 'username', label: '用户名', sample: '张三' },
  { key: 'couponLink', label: '优惠券链接', kind: 'link', sample: '#' },
]);
```

---

## MailEditor API 速览

| 方法 / 属性 | 说明 |
|-------------|------|
| `store` | 内部 Store，高级场景可读状态 |
| `registry` | 块注册表 |
| `getValue()` / `setValue(doc)` | 读写完整 `EmailDoc`；`setValue` 清空撤销栈 |
| `export({ withSampleVariables? })` | `{ mjml, html }` |
| `setVariables` / `getVariables` | 变量列表；`setValue` 后仍会写回 |
| `insertVariableKey` / `insertVariableElement` / `insertVariable` | 插入占位符 |
| `clearCanvas()` / `resetToPreset()` / `setPresetDoc(partial)` | 画布清空与重置 |
| `setTheme` / `getTheme` | `light` \| `dark` \| `system` |
| `setAccentColor` / `getAccentColor` | 品牌色 `#RRGGBB` |
| `copyDocDesign()` | 复制设计稿 JSON 到剪贴板 |
| `openImportDocDesign()` / `importDocDesignFromJson(raw)` | 导入设计稿 |
| `registerBlock(def)` | 运行时注册块 |
| `setSelection(sel \| null)` | 程序化选中 |
| `destroy()` | 卸载 DOM 与监听 |

更多工具函数见 `@simple-mail/core` 导出（变量 HTML、动态变量节、`docClipboard`、`openImageGalleryModal` 等）。

---

## 画布清空与重置

顶栏位于撤销/重做右侧（可用 `ui.hideTopbarClearCanvas` / `hideTopbarResetContent` 隐藏）：

| 按钮 | 行为 |
|------|------|
| **清空画布** | 移除所有 Section/Block；保留 `meta`、`styles`、`variables`；可撤销 |
| **重置内容** | 恢复为 **`presetDoc`** 快照；未传时等同构造时 `initialDoc` 合并结果 |

```ts
const editor = new MailEditor({
  container: el,
  blocks: allBlocks,
  initialDoc: loadedFromApi,
  presetDoc: businessDefaultTemplate,
  onChange: (doc) => save(doc),
});
```

---

## 界面主题与品牌色

构造参数 `theme?: 'light' | 'dark' | 'system'`（默认 `light`）。

```ts
editor.setTheme('dark');
editor.getTheme();
```

根节点带有 `data-sm-theme`。可在你的应用中通过覆盖 `.sm-root` 上的 CSS 变量调整配色。

| 方式 | 说明 |
|------|------|
| `accentColor?: string` | 构造时 `#RRGGBB`；无效值告警并忽略 |
| `showAccentColorPicker?: boolean` | 顶栏原生颜色控件，默认 `false` |
| `setAccentColor(hex \| null \| '')` | 运行时覆盖；空则恢复默认 |
| `getAccentColor()` | 仅显式覆盖；未设返回 `undefined` |

---

## UI 选项 `ui`

`MailEditor` 的 `ui?: EditorUiOptions`：

| 字段 | 说明 |
|------|------|
| `preferSliderControls?` | 右栏数值/内边距/宽度等用滑块增强控件；字重仍为五档平铺 |
| `hideMailMeta?` | 隐藏右栏主题、Preheader；文档级仅「版式 + 全局样式」 |
| `hideTopbarTitle?` | 隐藏顶栏产品标题 |
| `hideTopbarMailSettings?` | 隐藏顶栏「邮件设置」 |
| `hideTopbarFullscreen?` | 隐藏全屏按钮 |
| `hideTopbarClearCanvas?` / `hideTopbarResetContent?` | 隐藏清空 / 重置 |
| `hideTopbarDocClipboard?` | 隐藏「复制设计稿」「导入设计稿」 |
| `hideTopbarInsertVariable?` | 隐藏顶栏「插入变量」（改由应用内其他入口插入时） |
| `topbarCompact?` | 顶栏默认仅图标（窄屏/嵌入） |
| `topbarLabels?` | `auto`（默认）\| `never` \| `always`；与 `topbarCompact` 配合 |
| `topbarCompactMinWidth?` | `topbarLabels: auto` 时展示文案的最小宽度 px，默认 1200 |
| `paletteBlockGroupTitle?` | 左栏合并分组标题，默认「组件」 |
| `customPaletteTooltipSuffix?` | custom 块无 `paletteTooltip` 时的 title 后缀 |
| `hiddenPaletteBlockTypes?` | 注册但不显示在左栏的 type（如组合块内部用的 divider） |
| `enableDynamicVariantKey?` | 开启 Section「动态变量名」、画布标识、palette 动态节；默认 `false` |

---

## 构造选项（画布行为）

| 字段 | 说明 |
|------|------|
| `container` | 挂载 DOM（必填） |
| `blocks?` | 块定义列表 |
| `engine?` | 目前仅 `'mjml'`；预留 `'table'` |
| `initialDoc?` | 首次进入画布 |
| `presetDoc?` | 「重置内容」目标 |
| `autoWrapSection?` | 默认 `true`：拖到 Section 间隙自动包单列 Section |
| `clearSelectionOnCanvasMargin?` | 点画布留白取消选中 |
| `theme?` / `accentColor?` / `showAccentColorPicker?` | 见上 |
| `imageAssets?` | 见 [图片资源](#图片资源-imageassets) |
| `onChange?` | 文档变更（防抖） |

---

## 变量系统

### 数据模型

```ts
interface Variable {
  key: string;
  label: string;
  sample?: string;
  kind?: 'text' | 'link' | 'image';
}
```

| `kind` | 「插入元素」行为 |
|--------|------------------|
| `text` | `{{key}}` |
| `link` | `<a href="{{key}}">…</a>` |
| `image` | 新建 image 块，`src` 为 `{{key}}` |

`setValue` / `resetToPreset` 后，通过 `setVariables` 注入的列表仍会写回 `doc.variables`。

### 插入 API

| 方法 | 说明 |
|------|------|
| `insertVariableKey(v)` | 纯文本 `{{key}}` |
| `insertVariableElement(v)` | link / image 片段 |
| `insertVariable(v)` | 同 `insertVariableKey`（兼容） |

优先级：内联编辑光标 → 聚焦的 input/textarea → 选中 Block 主文本字段 → 末尾新建 text 块。

### 配套工具函数

```ts
import {
  buildBodyVariableKeyInsert,
  buildBodyVariableElementInsert,
  buildLinkVariableHtml,
  normalizeVariable,
  tokenToVariableKey,
  variablePlaceholder,
} from '@simple-mail/core';
```

`buildBodyVariableInsert` 为兼容保留；插入正文时优先使用 `buildBodyVariableKeyInsert` 与 `buildBodyVariableElementInsert`。

### 变量插入入口

| 场景 | 入口 |
|------|------|
| 发件主题、Preheader 等表单字段 | 应用内表单旁的插入控件 |
| 邮件正文 | 编辑器顶栏 `{{ }}`（可通过 `hideTopbarInsertVariable` 关闭） |

---

## 动态变量节（dynamicVariant）

适用于「整节 HTML 由业务系统按 key 渲染」的场景。为 Section 设置 `attrs.dynamicVariantKey` 后，导出时该节正文变为 `{{key}}` 占位符，实际内容由你的服务端或前端在发送前写入。

- 右栏编辑入口默认关闭；设置 `ui.enableDynamicVariantKey: true` 后可在界面中配置 key，画布会显示节标识。
- 左栏组合块可通过 `expandPaletteDrop` 返回 `{ blocks, sectionAttrs: { dynamicVariantKey: '…' } }` 一次创建动态节。
- 文档中已保存的 key 在导出时始终生效，与 UI 开关无关。

相关 API（自 `@simple-mail/core` 导出）：

```ts
import {
  DYNAMIC_VARIANT_HTML_ATTR,
  dynamicVariantPlaceholder,
  extractDynamicVariantSlots,
  getSectionDynamicVariantKey,
  isDynamicVariantSection,
  renderSectionBodyHtml,
  annotateDynamicVariantHtmlAttributes,
} from '@simple-mail/core';
```

`Section.attrs.meta` 为任意 JSON 扩展字段，编辑器不参与渲染，仅随 `EmailDoc` 一并序列化保存。

---

## 设计稿剪贴板

顶栏 **复制设计稿** / **导入设计稿**（`ui.hideTopbarDocClipboard` 可隐藏）。

- 复制：信封 `{ kind: 'simple-mail/doc', formatVersion: 1, doc }` 写入系统剪贴板。
- 导入：粘贴 JSON 或裸 `EmailDoc`（`version: '1'`），覆盖当前画布（可撤销）。

```ts
await editor.copyDocDesign();
editor.openImportDocDesign();
editor.importDocDesignFromJson(raw); // 与对话框「应用」相同

import {
  DOC_CLIPBOARD_KIND,
  parseDocClipboard,
  regenerateDocIds,
  serializeDocClipboard,
} from '@simple-mail/core';
```

跨实例迁移时可用 `regenerateDocIds` 避免 id 冲突。

---

## 图片资源 `imageAssets`

编辑器仅在文档中保存图片 URL；上传、图库与存储由你的应用实现。

| 字段 | 作用 |
|------|------|
| `uploadImage?(file, ctx)` | 右栏「上传」→ HTTPS URL |
| `imageGallery?` | 内置图库弹层（`showGallery: true`） |
| `pickImageFromGallery?(ctx)` | 自管图床；与 `imageGallery` 并存时**优先内置图库** |
| `showUpload?` | 默认 `true`（有 `uploadImage` 时） |
| `showGallery?` | 默认 `false` |

`ImageFieldContext`：`blockId` / `propKey` / `currentUrl`。

内置图库实现 `ImageGalleryAdapter`：`listItems({ query, page })`（`page` 从 0 起）、可选 `uploadFile` / `addByUrl` / `deleteItem`。弹层根 `.sm-gallery-modal`，可用 CSS 变量改主题。

```ts
import { openImageGalleryModal } from '@simple-mail/core';
```

邮件图片需公网 URL；`data:` / CID 需自行扩展 MJML。

---

## 框架集成示例

### React

```tsx
import { useEffect, useRef } from 'react';
import { MailEditor, type EmailDoc } from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { allBlocks } from '@simple-mail/blocks';

export function MailEditorView({
  value,
  presetDoc,
  onChange,
}: {
  value?: Partial<EmailDoc>;
  presetDoc?: Partial<EmailDoc>;
  onChange?: (d: EmailDoc) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const editor = new MailEditor({
      container: ref.current!,
      blocks: allBlocks,
      initialDoc: value,
      presetDoc,
      ui: { hideTopbarTitle: true },
      onChange,
    });
    return () => editor.destroy();
  }, []);
  return <div ref={ref} style={{ height: '100vh' }} />;
}
```

### Vue 3

```vue
<script setup lang="ts">
import { markRaw, onMounted, onBeforeUnmount, ref } from 'vue';
import { MailEditor, type BlockDefinition, type EmailDoc } from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { allBlocks } from '@simple-mail/blocks';

const props = defineProps<{
  modelValue?: Partial<EmailDoc>;
  presetDoc?: Partial<EmailDoc>;
  blocks?: BlockDefinition<any>[];
}>();
const emit = defineEmits<{ 'update:modelValue': [EmailDoc] }>();
const el = ref<HTMLDivElement>();
let editor: MailEditor | null = null;

onMounted(() => {
  const defs = props.blocks ?? allBlocks;
  const stable = defs.map((d) => markRaw(d));
  editor = new MailEditor({
    container: el.value!,
    blocks: stable,
    initialDoc: props.modelValue,
    presetDoc: props.presetDoc,
    ui: { hideMailMeta: true, hideTopbarTitle: true },
    clearSelectionOnCanvasMargin: true,
    onChange: (doc) => emit('update:modelValue', doc),
  });
});
onBeforeUnmount(() => editor?.destroy());
</script>

<template>
  <div ref="el" class="simple-mail-editor-host" style="height: 100vh" />
</template>
```

`blocks` 经 Vue 响应式代理时，`expandPaletteDrop` 等函数字段可能失效，务必 **`markRaw`** 每个 `BlockDefinition`。

---

## 自定义组件

```ts
import { defineBlock } from '@simple-mail/core';

export const couponBlock = defineBlock<{ title: string; code: string }>({
  type: 'custom:coupon',
  name: '优惠券',
  category: 'custom',
  icon: '<svg width="24" height="24">…</svg>',
  defaultProps: { title: '专属优惠', code: 'WELCOME10' },
  schema: [
    { key: 'code', label: '券码', type: 'text' },
    { key: 'title', label: '标题', type: 'text', inheritGlobal: true },
  ],
  inlineEditable: {
    selector: '.coupon-title',
    mode: 'rich',
    multiline: false,
    propKey: 'title',
    placeholder: '双击编辑',
  },
  toMjml: (p) => `<mj-text>…</mj-text>`,
  renderPreview: (p) => `<div class="coupon-title">…</div>`,
});

new MailEditor({ container, blocks: [...allBlocks, couponBlock] });
```

### `schema` 字段类型

`text | textarea | number | color | select | switch | image | url | spacing | socialLinkList`

- `selectVariant: 'segmented'`：少量互斥选项（如对齐）
- `inheritGlobal: true`：右栏「继承全局」开关
- `image`：由 `imageAssets` 控制上传/图库

### `inlineEditable`

| 字段 | 说明 |
|------|------|
| `selector?` | 在 `renderPreview` DOM 中定位；缺省为根 |
| `mode` | `rich`（清洗 HTML）\| `plain` \| `html`（原始 HTML，mj-raw） |
| `multiline?` | `false` 时 Enter 提交 |
| `propKey` | 写回的 props 键 |
| `placeholder?` | 空值提示 |

### `expandPaletteDrop`（组合拖入）

```ts
expandPaletteDrop?: (createBlock) => Block[] | { blocks: Block[]; sectionAttrs?: Partial<SectionAttrs> };
```

从左栏拖入时展开为多个通用块；文档 JSON **不出现**该 palette 的 `type`。拖到 Section 间隙时可带 `sectionAttrs`（含 `dynamicVariantKey`、`meta`）。

---

## 集成说明

- **依赖版本**：安装 `@simple-mail/core` 时，请同时安装 `codemirror`、`mjml-browser`、`sortablejs`，版本与 core 的 `peerDependencies` / 文档示例保持一致。
- **import 路径**：统一使用 `@simple-mail/core`、`@simple-mail/blocks`，不要使用 `mail-editor-pancake/packages/...`。
- **Vue 3**：将 `blocks` 数组中的每个 `BlockDefinition` 用 `markRaw` 包裹后再传入，否则 `expandPaletteDrop` 等函数可能失效。
- **Vite + 本地 link**：在 `optimizeDeps.exclude` 中加入 `@simple-mail/core`、`@simple-mail/blocks`；按需配置 alias 与上述运行时依赖的解析路径。
- **本地开发本仓库**：修改 `packages/core` 后执行 `pnpm build`，再在引用项目中刷新；异常时清除 `.vite` 缓存后重启 dev server。

---

## 操作手册

| 操作 | 触发方式 |
|------|----------|
| 选中 Section / Block | 单击 |
| 编辑内容 | 双击；或选中后 ✎ |
| 提交 / 取消编辑 | 失焦、单行 Enter / Esc |
| 列表 | Shift+Enter 软换行；空项 Enter 退出列表 |
| 拖拽排序 | 仅 ⋮⋮ 图标 |
| 删除 | Delete/Backspace 或工具条 |
| 复制块/节 | 工具条 ⎘ |
| 撤销/重做 | ⌘Z / ⌘⇧Z |
| 清空 / 重置 | 顶栏按钮或 API |
| 变量 | 顶栏 `{{ }}` 或 API |
| 设计稿 | 顶栏复制/导入 |
| 点空白取消选中 | `clearSelectionOnCanvasMargin: true` |
| Esc（设计态） | 块 → Section → 文档级面板 |
| 源码/设计切换 | 顶栏 |
| 导出 HTML | 顶栏 |

---

## 设计与代码模式

- **设计模式**：三栏 WYSIWYG 预览（非真实邮件 HTML）。
- **源码模式**：只读整份 MJML + 编译 HTML，可复制。
- **组件级代码**（右栏「代码」Tab）：编辑 `lockedMjml`，禁用属性面板，可恢复默认。
- **导出 HTML**：顶栏下载，`withSampleVariables` 替换示例值。

---

## 数据模型速览

```ts
interface EmailDoc {
  version: '1';
  meta: { subject: string; preheader?: string; width: number | string };
  variables: Variable[];
  styles: GlobalStyles; // 含 fontWeight 档位、listIndentDefaultPx 等
  sections: Section[];
}

interface Section {
  id: string;
  type: 'section';
  layout: '1' | '1-1' | '1-2' | '2-1' | '1-1-1';
  attrs: SectionAttrs; // padding、preserveColumnsOnMobile、columnGap、width、dynamicVariantKey、meta
  columns: Column[];
}

interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  lockedMjml?: string;
}
```

- `initialDoc`：首次画布。
- `presetDoc`：重置目标；编辑已保存邮件时勿与 `initialDoc` 混为一谈。

---

## 路线图

- [x] M1 · Schema → MJML → HTML + 内置组件
- [x] M2 · 三栏 UI、拖拽、撤销/重做
- [x] M3 · 自定义块、变量、代码模式、设计稿剪贴板、动态变量节
- [ ] M4 · `@simple-mail/react` / `@simple-mail/vue` 适配器
- [ ] iframe 预览（Outlook ghost padding）
- [ ] 模板市场（EmailDoc JSON）
- [ ] i18n（zh-CN / en）

---

## 设计取舍

| 取舍点 | 选择 | 原因 |
|--------|------|------|
| 画布 HTML | 轻量预览 DOM | iframe 内 Sortable 难控；真实效果靠 MJML |
| 嵌套 | 严格四层 | 限制结构深度，减少邮件排版与拖拽异常 |
| 输出 | MJML 优先 | Outlook/Gmail 兼容；可预留 table 引擎 |
| 文档级源码回写 | 只读 | MJML→doc 反推风险大 |
| 状态 | immutable + history | 核心零 UI 框架依赖 |
| 包体 | gzip ≈ 580KB | 主因 mjml-browser |
| 默认内边距 | Section 左右 16；块上下 8 | 版心由节统一 |

---

## 许可证

MIT
