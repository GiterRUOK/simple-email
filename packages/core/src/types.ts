/**
 * 邮件文档数据模型。
 *
 * 严格四层结构：Doc → Section → Column → Block。
 * 任何 Block 都不再含子组件（HtmlBlock 是叶子），从而避免 GrapesJS 那种
 * 任意嵌套导致的拖拽混乱。
 */

export interface EmailDoc {
  version: '1';
  meta: EmailMeta;
  variables: Variable[];
  styles: GlobalStyles;
  sections: Section[];
}

export interface EmailMeta {
  subject: string;
  preheader?: string;
  /**
   * 邮件内容区宽度：正整数按 px 存库；也可用字符串显式写 `600px`、`100%` 等。
   */
  width: number | string;
}

export interface GlobalStyles {
  backgroundColor: string;
  contentBackgroundColor: string;
  fontFamily: string;
  fontSize: string;
  /** 全局字重，如 normal / 500 / bold */
  fontWeight: string;
  color: string;
  linkColor: string;
  /** 无单位倍数（如 1.25）或固定值（如 24px） */
  lineHeight: string;
}

export interface Variable {
  /** Mustache 风格变量名，例如 user.name */
  key: string;
  label: string;
  /** 预览数据，仅设计态预览使用 */
  sample?: string;
}

export type SectionLayout = '1' | '1-1' | '1-2' | '2-1' | '1-1-1';

export interface Section {
  id: string;
  type: 'section';
  layout: SectionLayout;
  attrs: SectionAttrs;
  columns: Column[];
}

export interface SectionAttrs {
  backgroundColor?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  /**
   * 默认 false / 未设置：MJML 在小屏会堆叠为多行（符合常见邮件习惯）。
   * 为 true 时在多列 Section 内包一层 `mj-group`，小屏仍并排，列宽按比例保留（字可能很窄）。
   */
  preserveColumnsOnMobile?: boolean;
  /**
   * 多列时相邻列之间的水平间距（px）。单列 Section 忽略。
   * MJML 通过相邻 `mj-column` 对称内边距实现；画布用 flex `gap` 对齐观感。
   */
  columnGap?: number;
  /**
   * 本节内容区最大宽度（窄于邮件 `meta.width` 时居中）。支持 `480`、`480px`、`90%`；留空则与邮件同宽。
   */
  width?: string | number;
}

export interface Column {
  id: string;
  attrs: ColumnAttrs;
  blocks: Block[];
}

export interface ColumnAttrs {
  verticalAlign?: 'top' | 'middle' | 'bottom';
  backgroundColor?: string;
}

/**
 * Block 是注册表驱动的：所有内置/自定义组件都遵循同一个数据形状。
 * 渲染、属性面板、代码模式三方都从注册表读取该 type 的定义。
 */
export interface Block<P extends object = Record<string, unknown>> {
  id: string;
  type: string;
  props: P;
  /**
   * 组件级代码模式锁定：当用户在组件级源码 Tab 编辑后，
   * 我们存下一段原始 MJML，渲染时直接使用而不再走 toMjml(props)。
   * 此时右栏属性面板会被禁用，并提供"恢复为默认"按钮。
   */
  lockedMjml?: string;
}

/* -------------------------------------------------------------------------- */
/*                              组件注册表相关                                  */
/* -------------------------------------------------------------------------- */

export type RenderEngine = 'mjml' | 'table';

export interface BlockSchemaField {
  key: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'color'
    | 'select'
    | 'switch'
    | 'image'
    | 'url'
    | 'spacing'
    | 'socialLinkList';
  /** select 用；socialLinkList 时每行的「平台」下拉候选 */
  options?: { label: string; value: string }[];
  /** number 用 */
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
}

export interface BlockDefinition<P extends object = Record<string, unknown>> {
  /** 唯一类型名，建议 `custom:xxx` 命名空间避免冲突 */
  type: string;
  /** 显示名（左栏） */
  name: string;
  /** 分类，用于左栏分组 */
  category: 'content' | 'custom';
  /** 16x16 SVG 字符串 */
  icon: string;
  /** 默认 props（拖入时使用） */
  defaultProps: P;
  /** 驱动右栏属性面板 */
  schema: BlockSchemaField[];
  /** 渲染为 MJML 片段（用于真实邮件 HTML 输出） */
  toMjml: (props: P, ctx: RenderContext) => string;
  /**
   * 设计态画布的轻量预览 HTML 片段。
   * 不要求像素级还原邮件实际效果，只要"足够像"以便运营点选/拖拽。
   * 不提供则画布显示一个占位框 + 组件名。
   */
  renderPreview?: (props: P, ctx: RenderContext) => string;
  /**
   * 声明组件在画布内可以"双击编辑文本"。
   * 引擎会找到 `selector` 命中的元素，把它变成 contenteditable，
   * 在用户提交时按 `mode` 写回 props（rich：清理后的 innerHTML；html：原始 innerHTML；plain：textContent）。
   */
  inlineEditable?: InlineEditableConfig<P>;
}

export interface InlineEditableConfig<P extends object = Record<string, unknown>> {
  /** 在 renderPreview 输出 DOM 中定位编辑区域；不填则取根元素 */
  selector?: string;
  /** rich：富文本（HTML，提交时清理），plain：纯文本，html：原始 HTML（不清理，对应 mj-raw） */
  mode: 'rich' | 'plain' | 'html';
  /** 单行 / 多行；单行时回车提交且禁止换行 */
  multiline?: boolean;
  /** 提交时把 html / text 写回 props 的某个 key */
  propKey: keyof P & string;
  /** 占位提示（当当前值为空时） */
  placeholder?: string;
}

export interface RenderContext {
  doc: EmailDoc;
  /** 当前激活的渲染引擎，便于自定义组件做差异化输出 */
  engine: RenderEngine;
}

/* -------------------------------------------------------------------------- */
/*                                  事件                                       */
/* -------------------------------------------------------------------------- */

/** MailEditor 可选 UI 行为（不改变文档模型） */
export interface EditorUiOptions {
  /**
   * 为 true 时：右栏数值、内边距（四行滑块+输入）、全局/组件字号（px 滑块）、字重（分段）、
   * Section/按钮/分隔线等「宽度」类文本字段（自适应 / px / % + 滑块）使用增强控件。
   * 默认 false。
   */
  preferSliderControls?: boolean;
}

export interface EditorEvents {
  change: { doc: EmailDoc };
  selectionChange: { selection: Selection | null };
  ready: { doc: EmailDoc };
}

export type Selection =
  | { kind: 'section'; sectionId: string }
  | { kind: 'block'; sectionId: string; columnIndex: number; blockId: string };
