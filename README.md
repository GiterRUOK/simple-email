# Simple Mail Editor

面向运营的轻量邮件可视化编辑器。聚焦邮件场景，用**严格扁平化的组件树** + **MJML 输出引擎**，
解决 GrapesJS 在邮件场景下"任意嵌套 → 拖拽混乱 → 文本组件消失"的痛点。

```text
Doc → Section → Column → Block       // 仅四层，不允许 Block 再含子组件
左栏组件区 │ 中间画布区 │ 右栏属性配置区
```

## 特性

- 框架无关核心（vanilla TS），可用于 React / Vue / 原生项目
- 严格两级 SortableJS 拖拽：Section 排序 + Column 内 Block 排序，**只能从 hover 出现的 ⋮⋮ 拖拽图标拖动**，避免点选文本时误拖
- **画布内联富文本编辑**：双击 Text/Button 直接编辑；选中文字浮动工具条提供加粗/斜体/下划线/删除线、字体、字号、颜色、左/中/右对齐、有序/无序列表、链接、清除格式
- **HTML 安全清洗**：富文本输入会被白名单清洗（标签 + 属性），`<font>` → `<span style>`，确保进入 MJML 的内容是邮件兼容的 inline-style HTML
- 兼容性输出：内部维护 JSON Schema，导出时编译为 MJML，再由 MJML 编译为 Outlook/Gmail 可用 HTML
- 双模式：设计态 + 源码态（文档级只读 MJML/HTML，组件级可编辑 MJML 锁定）
- 内置组件：文本、图片、按钮、分隔线、间距，以及 1/2/3 列布局
- 自定义组件示例：公司 Logo、社交链接、页脚
- **图片字段**：`type: 'image'` 支持手输 URL；可选 **右侧「上传」**（`uploadImage`）与 **内置图库弹层**（`imageGallery` + `showGallery: true`）；仍支持完全自管的 `pickImageFromGallery`
- 撤销/重做、键盘删除、复制 Section/Block
- 包体可控：核心 + MJML + CodeMirror + 富文本，gzip ≈ 586KB

## 仓库结构

```text
simple-mail/
├─ packages/
│  ├─ core/      @simple-mail/core    核心引擎（store / 渲染 / 三栏 UI / 拖拽 / 代码模式）
│  └─ blocks/    @simple-mail/blocks  内置组件 + 自定义示例
└─ playground/
   └─ vanilla/   原生 TS 演示
```

## 快速开始

```bash
pnpm install
pnpm dev                 # 启动 vanilla playground，默认 http://localhost:5173
pnpm typecheck           # 全包类型检查
pnpm --filter @simple-mail/playground-vanilla build   # 产出静态站点
```

## 在你的项目里使用

### Vanilla / 任意框架

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
  // autoWrapSection: true（默认）— 把 Block 拖到 Section 之间空白处时
  // 自动包一个一列 Section。设为 false 则强制只能拖入现有列内。
  autoWrapSection: true,
  onChange: (doc) => console.log(doc),
  /**
   * 可选：见 README「图片资源 imageAssets」（uploadImage、内置 imageGallery、自管 pickImageFromGallery）。
   */
  // imageAssets 见下方；演示见 playground（内置图库 + 侧栏上传）
  // imageAssets: { uploadImage, imageGallery: adapter, showGallery: true },
});

const { mjml, html } = editor.export({ withSampleVariables: true });
```

### 图片资源 `imageAssets`

编辑器**只把图片存成 props 里的 URL 字符串**（与 MJML `src` 一致），不负责对象存储落地。通过 `MailEditor` 的 **`imageAssets`** 合并配置。

#### 总览

| 字段 | 作用 |
|------|------|
| `uploadImage?: (file, ctx) => Promise<string>` | 属性面板「上传」→ 返回可插入邮件的 **HTTPS 绝对 URL**。 |
| `imageGallery?: ImageGalleryAdapter` | **内置图库弹层**（搜索、分页、选图、可选「链接添加 / 弹层内上传」）。配合 `showGallery: true` 显示「图床」按钮。 |
| `pickImageFromGallery?: (ctx) => Promise<string \| null>` | **完全自管**图床 UI；与 `imageGallery` 可并存，**同时存在时优先打开内置图库**。 |
| `showUpload?` | 是否显示「上传」；仅当配置了 `uploadImage` 时有效，**默认 `true`**。 |
| `showGallery?` | 是否显示「图床」；配置了 `imageGallery` **或** `pickImageFromGallery` 时有效，**默认 `false`**。 |

`ImageFieldContext`（`blockId` / `propKey` / `currentUrl`）在 `uploadImage` 与 `pickImageFromGallery` 中传入，可从 `@simple-mail/core` 导入。

#### 内置图库 `ImageGalleryAdapter`

宿主实现数据与业务，**不写弹框 DOM**。弹层样式根节点为 `.sm-gallery-modal`，可通过 **CSS 变量** 覆盖主题，例如：

```css
.sm-gallery-modal {
  --sm-gallery-cell-bg: #f0f4f8;
  --sm-gallery-thumb-h: 96px;
}
```

| 方法 | 必选 | 说明 |
|------|:----:|------|
| `listItems({ query, page })` | ✅ | `query` 为搜索框文本；`page` 从 **0** 起。返回 `{ items: GalleryItem[], hasMore }`。 |
| `uploadFile?(file)` |  | 若提供，工具栏显示「**上传**」（与搜索、添加同一行）；完成后重新请求第 0 页。 |
| `addByUrl?(url)` |  | 若提供，工具栏显示链接输入与「**添加**」；完成后重新请求第 0 页；校验/落库由宿主完成，失败请 `throw`。 |
| `deleteItem?(id)` |  | 若提供，每张缩略图右上角可删除；成功后重新请求第 0 页；失败请 `throw`。 |

搜索框、链接输入、「添加」「上传」在**同一行**展示（窄屏下自动换行）。

`GalleryItem`：`id`、`url`（写入字段的最终地址）、可选 `thumbnailUrl`、`title`。

进阶：若需在任意时机主动打开同一套 UI，可导入 **`openImageGalleryModal({ adapter, onPick, parent?, onClose? })`**（类型 `OpenImageGalleryModalOptions`）。

#### 与自管图库的关系

仅需要自有弹层时：只配 `pickImageFromGallery` + `showGallery: true`。  
需要本库弹层时：配 `imageGallery` + `showGallery: true`。  
若两者都配，点击「图床」**走 `imageGallery`**。

**注意：** 邮件中图片需**公网可访问** URL；`data:` / CID 需另扩 MJML。`playground` 中 picsum 仅作演示。

### React 集成（最小封装示意）

```tsx
import { useEffect, useRef } from 'react';
import { MailEditor, type EmailDoc } from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { allBlocks } from '@simple-mail/blocks';

export function MailEditorView({ value, onChange }: {
  value?: EmailDoc;
  onChange?: (d: EmailDoc) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const editor = new MailEditor({
      container: ref.current!,
      blocks: allBlocks,
      initialDoc: value,
      onChange,
    });
    return () => editor.destroy();
  }, []);
  return <div ref={ref} style={{ height: '100vh' }} />;
}
```

### Vue 集成（最小封装示意）

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { MailEditor, type EmailDoc } from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { allBlocks } from '@simple-mail/blocks';

const props = defineProps<{ modelValue?: EmailDoc }>();
const emit = defineEmits<{ 'update:modelValue': [EmailDoc] }>();
const el = ref<HTMLDivElement>();
let editor: MailEditor | null = null;

onMounted(() => {
  editor = new MailEditor({
    container: el.value!,
    blocks: allBlocks,
    initialDoc: props.modelValue,
    onChange: (doc) => emit('update:modelValue', doc),
  });
});
onBeforeUnmount(() => editor?.destroy());
</script>

<template>
  <div ref="el" style="height: 100vh" />
</template>
```

## 自定义组件

`defineBlock` 是注册表的入口：

```ts
import { defineBlock } from '@simple-mail/core';

export const couponBlock = defineBlock<{ title: string; code: string; expiresAt: string }>({
  type: 'custom:coupon',
  name: '优惠券',
  category: 'custom',
  icon: '<svg width="24" height="24"...>...</svg>',
  defaultProps: { title: '专属优惠', code: 'WELCOME10', expiresAt: '2026-12-31' },
  schema: [
    { key: 'code', label: '券码', type: 'text' },
    { key: 'expiresAt', label: '到期日', type: 'text' },
  ],
  // 让 title 字段支持画布内双击编辑（可选）
  inlineEditable: {
    selector: '.coupon-title',
    mode: 'rich',          // 'rich' = HTML, 'plain' = textContent
    multiline: false,
    propKey: 'title',
    placeholder: '点这里输入标题',
  },
  // 真实邮件输出（MJML）
  toMjml: (p) => `<mj-text align="center" font-size="20px" font-weight="700">
    <span class="coupon-title">${p.title}</span>
    🎁 ${p.code} <small>(到期 ${p.expiresAt})</small>
  </mj-text>`,
  // 设计态画布的轻量预览（可选）。inlineEditable.selector 必须能命中此预览中的元素。
  renderPreview: (p) => `<div style="text-align:center;padding:16px;font-weight:700;font-size:20px;">
    <span class="coupon-title">${p.title}</span>
    🎁 ${p.code} <small>(到期 ${p.expiresAt})</small>
  </div>`,
});

new MailEditor({ container, blocks: [...allBlocks, couponBlock] });
```

`schema` 字段类型支持：`text | textarea | number | color | select | switch | image | url | spacing | socialLinkList`。其中 **`image`** 渲染为「URL 输入 +（可选）上传 +（可选）图库」，由 `MailEditor` 的 **`imageAssets`** 控制，见上文「图片资源 imageAssets」。
所有字段会在右栏自动渲染表单，change 事件回写 `block.props`。

### 内联编辑 inlineEditable

| 字段 | 说明 |
|---|---|
| `selector` | 可选；在 `renderPreview` 输出 DOM 中定位编辑区域。不填则取根元素 |
| `mode` | `rich`（保留 HTML，配合富文本工具条）/ `plain`（纯文本，单行/多行） |
| `multiline` | `false` 时回车提交且禁止换行（按钮文字常用） |
| `propKey` | 提交时把 innerHTML（rich）或 textContent（plain）写回该 key |
| `placeholder` | 当字段为空时显示的占位提示 |

提交时机：失焦 / 单行 Enter / Esc 取消。富文本提交前会过一次白名单清洗（保留 `a/b/strong/i/em/u/s/span/p/div/ul/ol/li/h1-h6/br`，属性仅留 `href/target/rel/style/class`，`<font>` 自动转为 `<span style="...">`）。

## 操作手册

| 操作 | 触发方式 |
|---|---|
| 选中 Section | 单击 Section 空白处 |
| 选中 Block | 单击 Block |
| **编辑 Block 内容** | **双击 Block**（文本/按钮）；或选中后点 ✎ 图标 |
| 编辑中提交 | 点击外部 / 单行 Enter / 按工具条按钮后失焦 |
| 编辑中取消 | Esc |
| 拖拽排序 | 仅在 hover 出现的 ⋮⋮ 图标上按住拖动 |
| 删除 | 选中后按 Delete/Backspace；或工具条 🗑 |
| 复制 | 工具条 ⎘ 图标 |
| 撤销 / 重做 | ⌘Z / ⌘⇧Z（顶栏按钮也行） |
| 插入变量 | 顶栏 `{{ }}`：编辑中插到光标处；否则插到聚焦输入框 |
| 切换源码 / 设计 | 顶栏切换 |
| 导出 HTML | 顶栏右上 |

## 设计与代码模式

- **设计模式**：默认。三栏，所见即所得（画布是轻量预览，非真实邮件 HTML）。
- **源码模式（顶栏切换）**：只读展示当前文档的 MJML 与 MJML 编译产物 HTML，可一键复制。切到源码会自动提交内联编辑。
- **组件级代码（右栏 "代码" Tab）**：编辑选中 Block 的 MJML 片段并保存为 `lockedMjml`，
  之后该组件不再走 `toMjml(props)`，属性面板被禁用，可点"恢复默认"取消锁定。
- **导出 HTML**：顶栏右上角，下载经 `withSampleVariables` 替换后的 HTML 文件。

## 数据模型 速览

```ts
interface EmailDoc {
  version: '1';
  meta: { subject: string; preheader?: string; width: number };
  variables: { key: string; label: string; sample?: string }[];
  styles: { backgroundColor; contentBackgroundColor; fontFamily; fontSize; color; linkColor; lineHeight };
  sections: Section[];   // 顺序即视觉顺序
}
interface Section { id; type: 'section'; layout: '1'|'1-1'|'1-2'|'2-1'|'1-1-1'; attrs; columns: Column[] }
// attrs.preserveColumnsOnMobile：多列时可设 true，MJML 包 mj-group，小屏仍为并排列；默认/未设则小屏堆叠列
interface Column  { id; attrs; blocks: Block[] }
interface Block   { id; type; props; lockedMjml? }
```

## 路线图

- [x] M1 · 渲染管线（Schema → MJML → HTML）+ 内置组件
- [x] M2 · 三栏 UI、两级拖拽、撤销/重做、键盘快捷键
- [x] M3 · 自定义组件、变量系统、组件级 + 文档级代码模式
- [ ] M4 · `@simple-mail/react` / `@simple-mail/vue` 适配器包发布
- [ ] iframe 实时预览（Outlook 桌面端 ghost padding 还原）
- [ ] 邮件模板市场（保存/加载 EmailDoc JSON）
- [ ] i18n（zh-CN / en）

## 设计取舍

| 取舍点 | 选择 | 原因 |
|---|---|---|
| 画布是否用真实邮件 HTML | ❌ 走轻量预览 DOM | SortableJS 不能跨 iframe；交互可控更重要。真实预览/导出由 MJML 兜底 |
| 组件树是否允许任意嵌套 | ❌ 严格 4 层 | 这是 GrapesJS 邮件场景翻车根因 |
| 输出引擎 | ✅ MJML 优先，预留 `engine: 'table'` | Outlook/Gmail 兼容性最稳。需要更轻可切换为手写 table |
| 文档级源码可否回写 | ❌ 只读 | MJML/HTML → 反推 doc 风险大；如需直写源码请用组件级代码模式 |
| 状态管理 | 自实现 immutable + history | 核心包零运行时依赖（除功能性依赖） |
| 包体 | gzip ≈ 580KB | 主要来自 mjml-browser，后续 lazy-load 优化 |

## 许可证

MIT
