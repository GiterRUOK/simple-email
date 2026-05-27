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
- 自定义组件示例：公司 Logo、业务社交链接（X / Rabbit / Facebook / TikTok / Instagram）、页脚
- **图片字段**：`type: 'image'` 支持手输 URL；可选 **右侧「上传」**（`uploadImage`）与 **内置图库弹层**（`imageGallery` + `showGallery: true`）；仍支持完全自管的 `pickImageFromGallery`
- 撤销/重做、键盘删除、复制 Section/Block
- **界面主题**：顶栏 **太阳 / 月亮 / 显示器** 图标切换浅色、深色、跟随系统（`prefers-color-scheme`）；中间邮件画布仍为白纸以贴近成品
- **品牌色**：可选 `accentColor` / `setAccentColor`，覆盖强调色与选区色；可选顶栏拾色器
- **仅搭正文**：`ui.hideMailMeta` 隐藏主题 / Preheader 与顶栏「邮件设置」，保留版式宽度与全局样式
- **画布清空 / 重置**：顶栏「清空画布」「重置内容」；`presetDoc` 与 `initialDoc` 分离，编辑已保存邮件时重置仍回到业务预置模板
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
pnpm build               # 构建 packages/core、packages/blocks（产出 dist/index.js、dist/style.css、dist/index.d.ts 等）
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
  /**
   * initialDoc 为 Partial<EmailDoc>：可预置 meta / styles / variables / sections（画布结构）。
   * 未写的字段会与默认空邮件合并；仅搭正文且由宿主管发件主题时可将 subject、preheader 留空，并配合 ui.hideMailMeta。
   */
  initialDoc: {
    meta: { subject: '欢迎', width: 600 },
    variables: [{ key: 'user.name', label: '用户名', sample: '张三' }],
    sections: [],
  },
  /**
   * 顶栏「重置内容」恢复的目标（与 initialDoc 独立）。
   * 编辑页打开已保存邮件时：initialDoc = 当前稿，presetDoc = 业务默认模板。
   * 未传时与 initialDoc 合并结果一致。
   */
  // presetDoc: defaultTemplatePartial,
  /** 右栏控件形态等，见下文「UI 选项 ui」 */
  // ui: { preferSliderControls: true, hideMailMeta: true },
  // autoWrapSection: true（默认）— 把 Block 拖到 Section 之间空白处时
  // 自动包一个一列 Section。设为 false 则强制只能拖入现有列内。
  // 唯一块被删或拖走后，会去掉因此变空的 Section，无需再删一次壳子。
  autoWrapSection: true,
  onChange: (doc) => console.log(doc),
  /**
   * 可选：见 README「图片资源 imageAssets」（uploadImage、内置 imageGallery、自管 pickImageFromGallery）。
   */
  // imageAssets 见下方；演示见 playground（内置图库 + 侧栏上传）
  // imageAssets: { uploadImage, imageGallery: adapter, showGallery: true },
});

const { mjml, html } = editor.export({ withSampleVariables: true });

// 整份替换文档（例如切换模板）；会先失焦右栏避免旧值残留
// editor.setValue(nextDoc);

// 清空画布（仅 sections 置空，保留 meta / styles / variables；可 ⌘Z 撤销）
// editor.clearCanvas();

// 恢复为 presetDoc（或构造时 initialDoc）快照
// editor.resetToPreset();

// 异步加载默认模板后更新重置目标
// editor.setPresetDoc(defaultTemplatePartial);
```

### 画布清空与重置

顶栏位于 **撤销 / 重做** 右侧（可用 `ui` 隐藏，见下表）：

| 按钮 | 行为 |
|------|------|
| **清空画布** | 移除所有 Section / Block；`meta`、`styles`、`variables` 不变。操作前浏览器 `confirm` 确认；记入撤销栈（⌘Z 可恢复）。 |
| **重置内容** | 整份替换为 **`presetDoc`** 快照（未传 `presetDoc` 时等同构造时的 `initialDoc` 合并结果）。操作前 `confirm` 确认；**不**走撤销栈（与 `setValue` 相同，会清空 history）。 |

**宿主常见写法**：新建页 `initialDoc` 与 `presetDoc` 同为默认模板；编辑页 `initialDoc` 为接口返回的 `jsonContent`，`presetDoc` 仍为业务预置结构，避免「重置」把用户带回打开时的草稿。

```ts
const editor = new MailEditor({
  container: el,
  blocks: allBlocks,
  initialDoc: loadedFromApi,      // 当前画布
  presetDoc: businessDefaultTemplate, // 顶栏「重置内容」
  onChange: (doc) => save(doc),
});
```

### 界面主题

构造参数 `theme?: 'light' | 'dark' | 'system'`（默认 `light`）。顶栏图标组与运行时 API 同步：

```ts
editor.setTheme('dark');
editor.setTheme('system'); // 随系统明暗
editor.getTheme();
```

根节点会设置 `data-sm-theme`，也可在宿主侧用 CSS 变量（`.sm-root` 上）覆盖配色。

### 品牌色（强调色）

界面主色对应 CSS 变量 `--sm-primary`、`--sm-primary-soft`（主按钮、选区、链接强调等）。不传则随 light/dark/system 使用内置紫/靛。

| 方式 | 说明 |
|------|------|
| 构造参数 `accentColor?: string` | `#RRGGBB`（支持 3/6 位 hex）；无效值会告警并忽略 |
| 构造参数 `showAccentColorPicker?: boolean` | 为 `true` 时在顶栏显示原生颜色控件；默认 `false` |
| `editor.setAccentColor('#RRGGBB' \| null \| '')` | 运行时覆盖；`null` / 空字符串 表示恢复 CSS 默认 |
| `editor.getAccentColor()` | 仅返回**当前显式覆盖**；未设置时为 `undefined` |

当 `theme` 为 `system` 且设置了品牌色时，浅色/深色下的 soft 透明度会随 `prefers-color-scheme` 更新。

### UI 选项 `ui`

`MailEditor` 的 `ui?: EditorUiOptions`：

| 字段 | 说明 |
|------|------|
| `preferSliderControls?: boolean` | 为 `true` 时右栏数值、内边距、全局/组件字号等使用滑块等增强控件。默认 `false`。 |
| `hideMailMeta?: boolean` | 为 `true` 时：**不展示**右栏「主题」「Preheader」以及顶栏「邮件设置」按钮；右栏文档级面板改为 **「版式」（内容宽度）+「全局样式」**。`doc.meta.subject` / `preheader` 仍在数据模型中，导出 MJML 仍会生成 `<mj-title>`（可为空）、有值时才生成 `<mj-preview>`，适合发件主题由宿主系统单独维护的场景。 |
| `hideTopbarTitle?: boolean` | 隐藏顶栏左侧产品标题（嵌入宿主页时常用）。 |
| `hideTopbarMailSettings?: boolean` | 隐藏顶栏「邮件设置」按钮（与 `hideMailMeta` 叠加使用）。 |
| `hideTopbarFullscreen?: boolean` | 隐藏顶栏全屏按钮。 |
| `hideTopbarClearCanvas?: boolean` | 隐藏顶栏「清空画布」。 |
| `hideTopbarResetContent?: boolean` | 隐藏顶栏「重置内容」。 |

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
import { markRaw, onMounted, onBeforeUnmount, ref } from 'vue';
import { MailEditor, type BlockDefinition, type EmailDoc } from '@simple-mail/core';
import '@simple-mail/core/style.css';
import { allBlocks } from '@simple-mail/blocks';

const props = defineProps<{ modelValue?: EmailDoc; blocks?: BlockDefinition<any>[] }>();
const emit = defineEmits<{ 'update:modelValue': [EmailDoc] }>();
const el = ref<HTMLDivElement>();
let editor: MailEditor | null = null;

onMounted(() => {
  const defs = props.blocks ?? allBlocks;
  // expandPaletteDrop / schema 等依赖块定义上的函数；props 深度代理可能导致丢失，建议 markRaw
  const stable = defs.map((d) => markRaw(d));
  editor = new MailEditor({
    container: el.value!,
    blocks: stable,
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
**社交组**（`social-group`）另有 **`iconBorderRadius`**（px，默认圆形）、**`iconSpacing`**（图标间距 px，对应 MJML `mj-social` 的 `inner-padding`），画布预览与导出共用同一套圆角/间距逻辑。
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

### 左栏组合模板 `expandPaletteDrop`（可选）

用于「一次拖入、画布内仍是多个通用块」的预设（例如页脚 = 图片 + 若干文本），避免整段 raw MJML，又省去运营逐个从左侧拖组件。

在 `BlockDefinition` 上可选声明：

```ts
expandPaletteDrop?: (createBlock: (type: string) => Block) => Block[];
```

- 从左栏拖入该条目时，引擎会在目标列（或拖到 Section 间隙时自动包裹的**单列 Section**）内 **`splice` 插入**回调返回的多个块；**文档 JSON 里不会出现该定义的 `type`**，仅在注册表中作为左栏卡片存在。
- 回调内请使用传入的 `createBlock('image' | 'text' | …)`，以便 ID、`defaultProps` 与内置块一致。
- `toMjml` / `renderPreview` 仍须在类型上满足 `BlockDefinition`；组合入口可选用占位的 `toMjml: () => ''`（正常不应出现在 `sections` 里）。

**宿主集成注意**

- 修改 `packages/core` 源码（含拖拽、`expandPaletteDrop` 等）后，请在 monorepo 根目录执行 **`pnpm build`** 或 **`pnpm --filter @simple-mail/core build`**，保证 npm/link 宿主的 **`dist`** 与类型声明同步。
- **Vue**：若把 `blocks` 数组作为 **props** 传入再交给 `MailEditor`，响应式代理可能导致块定义上的**函数字段**不可靠；应对每个 `BlockDefinition` 使用 **`markRaw`**（或与之一致的「非响应式」引用）后再传入构造器。参见上文「Vue 集成」示例注释。
- **Vite**：宿主若通过 **`link:` / workspace** 引用本仓库包，建议将 **`@simple-mail/core`、`@simple-mail/blocks`**（以及项目中实际 import 的等价路径，如指向本 monorepo 子包的 specifier）列入 **`optimizeDeps.exclude`**，避免 **依赖预构建缓存**与本地刚构建的 **`dist`** 不一致（常见现象：画布拖拽、`expandPaletteDrop` 等与当前源码不符）。仍异常时可删除宿主项目的 **`node_modules/.vite`** 后重启 dev。

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
| 清空画布 | 顶栏「清空画布」；移除全部 Section/Block，保留全局样式与变量（可撤销） |
| 重置内容 | 顶栏「重置内容」；恢复为 `presetDoc`（或构造时的 `initialDoc`） |
| 插入变量 | 顶栏 `{{ }}`：编辑中插到光标处；否则插到聚焦输入框 |
| 切换源码 / 设计 | 顶栏切换 |
| 导出 HTML | 顶栏右上 |
| 文档级设置（主题 / Preheader / 宽度 / 全局样式） | 未选中画布时右栏展示；`ui.hideMailMeta` 时无主题与 Preheader，且无顶栏「邮件设置」按钮 |

## 设计与代码模式

- **设计模式**：默认。三栏，所见即所得（画布是轻量预览，非真实邮件 HTML）。
- **源码模式（顶栏切换）**：只读展示当前文档的 MJML 与 MJML 编译产物 HTML，可一键复制。切到源码会自动提交内联编辑。
- **组件级代码（右栏 "代码" Tab）**：编辑选中 Block 的 MJML 片段并保存为 `lockedMjml`，
  之后该组件不再走 `toMjml(props)`，属性面板被禁用，可点"恢复默认"取消锁定。
- **导出 HTML**：顶栏右上角，下载经 `withSampleVariables` 替换后的 HTML 文件。

## 数据模型 速览

`EmailDoc` 为单一事实来源；设计 / 导出 / 宿主保存均围绕该 JSON。

- **`initialDoc`**：`Partial<EmailDoc>`，与默认空邮件合并，作为**首次进入画布**的内容。
- **`presetDoc`**：可选，与默认空邮件合并，作为顶栏 **「重置内容」** 的目标；未传时与 `initialDoc` 相同。编辑已保存邮件时应单独传入业务默认模板，勿与 `initialDoc` 混用。
- **`editor.setValue(doc)`**：运行期整份替换（如切换模板）；会清空撤销栈；调用前会尽量失焦右栏输入。
- **`editor.clearCanvas()`** / **`editor.resetToPreset()`** / **`editor.setPresetDoc(partial)`**：与顶栏按钮等价，供宿主程序化调用。

```ts
interface EmailDoc {
  version: '1';
  meta: { subject: string; preheader?: string; width: number | string };
  variables: { key: string; label: string; sample?: string }[];
  styles: { backgroundColor; contentBackgroundColor; fontFamily; fontSize; color; linkColor; lineHeight };
  sections: Section[];   // 顺序即视觉顺序
}
interface Section { id; type: 'section'; layout: '1'|'1-1'|'1-2'|'2-1'|'1-1-1'; attrs; columns: Column[] }
// attrs.preserveColumnsOnMobile：多列时可设 true，MJML 包 mj-group，小屏仍为并排列；默认/未设则小屏堆叠列
// attrs.width：本节最大宽度（px 或 %），窄于邮件宽度时居中；不设则同邮件 meta.width
// attrs.columnGap：多列时列间距 (px)，MJML 通过列对称 padding 实现；单列无效
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
| 默认内边距 | Section 左右 16、上下 0；内容块上下 8、左右 0 | 横向版心由节统一；块只堆纵向节奏，避免左右重复缩进 |

## 许可证

MIT
