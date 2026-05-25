import { Registry, defineBlock } from '../registry/registry';
import { renderDoc } from '../renderer';
import { Store, pruneSectionIfEmpty } from '../store/store';
import type {
  BlockDefinition,
  EditorUiOptions,
  EmailDoc,
  RenderEngine,
  Selection,
  Variable,
} from '../types';
import { clear, h } from '../utils/dom';
import { Canvas } from './Canvas';
import { ExportModal } from './ExportModal';
import { LeftPanel } from './LeftPanel';
import { PreviewModal } from './PreviewModal';
import { RichTextToolbar } from './RichTextToolbar';
import { RightPanel } from './RightPanel';
import { SourceView } from './SourceView';
import { Topbar, type EditorMode } from './Topbar';
import type { EditorTheme } from './theme';
import type { ImageAssetsHandlers } from './imageAssets';
import { accentPrimarySoftRgba, normalizeAccentHex } from '../utils/accentColor';

import './styles.css';

export interface EditorOptions {
  /** 挂载点 */
  container: HTMLElement;
  /** 初始文档；不传时使用空文档 */
  initialDoc?: Partial<EmailDoc>;
  /** 自定义组件定义（除内置组件之外） */
  blocks?: BlockDefinition<any>[];
  /** 渲染引擎，目前仅 'mjml'。预留 'table' 切换 */
  engine?: RenderEngine;
  /**
   * 把 Block 拖到 sections 之间的空白处时，是否自动包一个一列 Section。
   * - true（默认）：宽容，运营即使没瞄准列也能落下，自动加壳
   * - false：严格，只允许拖到现有列内；落到顶层会被 SortableJS 显示为禁止
   */
  autoWrapSection?: boolean;
  /**
   * 为 true 时：点击中栏灰色衬底、画布内空白（未点到 Section/块）等会提交内联编辑并清空选中，
   * 右栏回到文档级面板（邮件设置 / 版式与全局样式；若 `ui.hideMailMeta` 则仅版式与全局样式）。
   * 默认 false；需要「点空白取消选中」的宿主再设为 true。
   */
  clearSelectionOnCanvasMargin?: boolean;
  /** 文档变更回调（防抖发出） */
  onChange?: (doc: EmailDoc) => void;
  /**
   * 品牌/主题色（#RRGGBB），映射为界面上的 --sm-primary / --sm-primary-soft（强调、选区、主按钮等）。
   * 不传则使用 styles 里与 light/dark/system 配套的默认紫/靛。
   */
  accentColor?: string;
  /** 为 true 时在顶栏显示主题色拾取（原生 color 控件）；默认 false，仅通过 accentColor / setAccentColor 由宿主控制也可 */
  showAccentColorPicker?: boolean;
  /**
   * 编辑器外框主题。`system` 随 `prefers-color-scheme`；邮件画布仍默认白纸以便预览成品。
   * @default 'light'
   */
  theme?: EditorTheme;
  /**
   * 可选。为 `type: 'image'` 提供上传 / 图床；`showUpload` 默认 true（有 uploadImage 时），`showGallery` 默认 false。
   */
  imageAssets?: ImageAssetsHandlers;
  /** 右栏控件形态等可选 UI 偏好。 */
  ui?: EditorUiOptions;
}

/**
 * 编辑器主类。所有外部能力都通过它暴露。
 *
 * 使用示例（vanilla）：
 *   const editor = new MailEditor({
 *     container: document.getElementById('app')!,
 *     blocks: [/* 自定义组件 *\/],
 *     // imageAssets: { uploadImage, pickImageFromGallery, showGallery: true }  // 可选，见 README
 *   });
 *   editor.setVariables([{ key: 'user.name', label: '用户名', sample: '张三' }]);
 *   editor.export(); // -> { mjml, html }
 */
export class MailEditor {
  readonly store: Store;
  readonly registry: Registry;
  private opts: EditorOptions;
  private root: HTMLElement;
  private theme: EditorTheme;
  private mode: EditorMode = 'design';
  private topbar!: Topbar;
  private leftPanel!: LeftPanel;
  private canvas!: Canvas;
  private rightPanel!: RightPanel;
  private sourceView!: SourceView;
  private toolbar!: RichTextToolbar;
  private body: HTMLElement;
  private changeTimer: number | null = null;
  /** 显式品牌色时覆盖 CSS 变量；未设置则由 styles 按 light/dark 使用默认紫/靛 */
  private accentColorOverride: string | undefined;
  /** 顶栏开关：是否在画布上始终显示 Section / Block 轻量虚线边框 */
  private showLayoutBorders = false;
  private systemThemeMq: MediaQueryList | null = null;
  private readonly _onSystemThemeMqChange = () => {
    if (this.accentColorOverride) this._applyAccentVars();
  };

  private readonly _onFullscreenChange = () => {
    const el = smGetFullscreenElement();
    this.topbar?.setFullscreenActive(el === this.root);
  };

  /** design 态 Esc：块 → 父级 Section → 文档级面板（邮件设置或版式/全局样式，取决于 `ui.hideMailMeta`） */
  private _mailEscHandler = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (this.mode !== 'design') return;
    if (!this.store.selection) return;
    if (document.querySelector('.sm-modal__mask.is-open')) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('.sm-modal__mask')) return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
    if (ae && ae !== document.body && !this.root.contains(ae)) return;
    e.preventDefault();
    const sel = this.store.selection;
    if (sel.kind === 'block') {
      this.canvas.commitInlineEdit();
      this.store.setSelection({ kind: 'section', sectionId: sel.sectionId });
      return;
    }
    this._focusMailSettings();
  };

  /**
   * 文档级撤销/重做（捕获阶段）：焦点在右栏 input/CodeMirror 内时，冒泡到 root 的监听太晚，
   * 浏览器会先处理控件内撤销；仅在 store 仍有历史时拦截并走全局 undo/redo。
   */
  private _mailUndoRedoHandler = (e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    const k = e.key.toLowerCase();
    if (k !== 'z') return;
    const t = e.target as Node | null;
    if (!t || !this.root.contains(t)) return;
    const undo = !e.shiftKey;
    const redo = e.shiftKey;
    if (undo && !this.store.canUndo()) return;
    if (redo && !this.store.canRedo()) return;
    e.preventDefault();
    if (undo) this.store.undo();
    else this.store.redo();
  };

  constructor(opts: EditorOptions) {
    this.opts = opts;
    this.registry = new Registry();

    // 注册外部 blocks
    if (opts.blocks) {
      for (const def of opts.blocks) this.registry.register(def);
    }

    const initialDoc = createDefaultDoc(opts.initialDoc);
    this.store = new Store(initialDoc);

    const initialAccent = normalizeAccentHex(this.opts.accentColor ?? '');
    if (
      this.opts.accentColor != null &&
      String(this.opts.accentColor).trim() !== '' &&
      !initialAccent
    ) {
      console.warn('[simple-mail] accentColor 无效，已忽略:', this.opts.accentColor);
    }
    this.accentColorOverride = initialAccent ?? undefined;

    this.theme = opts.theme ?? 'light';
    this.root = h('div', { class: 'sm-root' });
    this._applyThemeAttr();
    this.body = h('div', { class: 'sm-body' });
    opts.container.append(this.root);

    this._buildUI();
    this._bindKeyboard();
    this._bindFullscreen();

    this._applyAccentVars();
    this._refreshAccentMqBinding();
    this._syncTopbarAccentPicker();

    this.store.subscribe(() => this._onChange());
  }

  /* ------------------------------ Public API ------------------------------ */

  setValue(doc: EmailDoc) {
    this._blurRightPanelIfFocused();
    this.store.replace(doc);
  }

  getValue(): EmailDoc {
    return this.store.doc;
  }

  setVariables(vars: Variable[]) {
    this.store.update((d) => {
      d.variables = vars;
    });
  }

  getVariables(): Variable[] {
    return this.store.doc.variables;
  }

  /** 当前界面主题（`system` 不解析为 light/dark）。 */
  getTheme(): EditorTheme {
    return this.theme;
  }

  /** 切换界面主题；写入 `data-sm-theme`，顶栏选择器同步。 */
  setTheme(t: EditorTheme) {
    if (this.theme === t) return;
    this.theme = t;
    this._applyThemeAttr();
    this._applyAccentVars();
    this._refreshAccentMqBinding();
    this.topbar?.syncTheme(t);
    this._syncTopbarAccentPicker();
  }

  /**
   * 品牌/主题色（#RRGGBB）。传 null、undefined 或空字符串则恢复为 light/dark/system 下的 CSS 默认色。
   */
  setAccentColor(hex: string | null | undefined) {
    if (hex == null || String(hex).trim() === '') {
      this.accentColorOverride = undefined;
    } else {
      const n = normalizeAccentHex(String(hex));
      if (!n) {
        console.warn('[simple-mail] setAccentColor 无效，已忽略:', hex);
        return;
      }
      this.accentColorOverride = n;
    }
    this._applyAccentVars();
    this._refreshAccentMqBinding();
    this._syncTopbarAccentPicker();
  }

  /** 当前由选项或 setAccentColor 显式设置的品牌色；未覆盖时为 undefined。 */
  getAccentColor(): string | undefined {
    return this.accentColorOverride;
  }

  /** 导出 MJML 与编译后的 HTML。withSampleVariables=true 时把 {{var}} 替换为 sample 值用于预览。 */
  export(opts: { withSampleVariables?: boolean } = {}) {
    return renderDoc(this.store.doc, this.registry, {
      engine: this.opts.engine ?? 'mjml',
      withSampleVariables: opts.withSampleVariables ?? false,
    });
  }

  registerBlock<P extends object>(def: BlockDefinition<P>) {
    this.registry.register(def);
    this.leftPanel?.refresh();
  }

  setSelection(sel: Selection | null) {
    this.store.setSelection(sel);
  }

  destroy() {
    this._unbindFullscreen();
    this._unbindSystemThemeMqForAccent();
    if (this.changeTimer) window.clearTimeout(this.changeTimer);
    if (smGetFullscreenElement() === this.root) void smExitFullscreen();
    document.removeEventListener('keydown', this._mailEscHandler, true);
    document.removeEventListener('keydown', this._mailUndoRedoHandler, true);
    this.canvas?.destroy?.();
    this.sourceView?.destroy?.();
    this.toolbar?.destroy?.();
    this.root.remove();
  }

  /* -------------------------------- 私有 ---------------------------------- */

  private _applyThemeAttr() {
    this.root.setAttribute('data-sm-theme', this.theme);
  }

  private _chromeIsEffectivelyDark(): boolean {
    if (this.theme === 'dark') return true;
    if (this.theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private _applyAccentVars() {
    if (!this.accentColorOverride) {
      this.root.style.removeProperty('--sm-primary');
      this.root.style.removeProperty('--sm-primary-soft');
      return;
    }
    const dark = this._chromeIsEffectivelyDark();
    this.root.style.setProperty('--sm-primary', this.accentColorOverride);
    this.root.style.setProperty('--sm-primary-soft', accentPrimarySoftRgba(this.accentColorOverride, dark));
  }

  private _unbindSystemThemeMqForAccent() {
    if (this.systemThemeMq) {
      this.systemThemeMq.removeEventListener('change', this._onSystemThemeMqChange);
      this.systemThemeMq = null;
    }
  }

  /** `system` 主题且存在品牌色覆盖时，随系统深浅刷新 --sm-primary-soft */
  private _refreshAccentMqBinding() {
    this._unbindSystemThemeMqForAccent();
    if (this.theme === 'system' && this.accentColorOverride) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', this._onSystemThemeMqChange);
      this.systemThemeMq = mq;
    }
  }

  private _syncTopbarAccentPicker() {
    this.topbar?.syncAccentPicker();
  }

  private _buildUI() {
    this.topbar = new Topbar({
      store: this.store,
      mode: this.mode,
      theme: this.theme,
      accentPickerRoot: this.root,
      showAccentColorPicker: this.opts.showAccentColorPicker === true,
      onAccentChange: (hx) => this.setAccentColor(hx),
      onThemeChange: (t) => this.setTheme(t),
      onModeChange: (m) => this._setMode(m),
      onUndo: () => {
        this.store.undo();
      },
      onRedo: () => {
        this.store.redo();
      },
      onMailSettings: () => this._focusMailSettings(),
      showMailSettingsButton: this.opts.ui?.hideTopbarMailSettings !== true,
      showTitle: this.opts.ui?.hideTopbarTitle !== true,
      onInsertVariable: (anchor) => this._showVariablePopover(anchor),
      onPreview: () => this._showPreview(),
      onExport: () => this._showExport(),
      showFullscreenButton: this.opts.ui?.hideTopbarFullscreen !== true,
      onFullscreenToggle: () => void this._toggleFullscreen(),
      onLayoutBordersToggle: () => this._toggleLayoutBorders(),
    });

    this.toolbar = new RichTextToolbar({ positionRoot: this.root });
    this.leftPanel = new LeftPanel({ registry: this.registry });
    const autoWrap = this.opts.autoWrapSection !== false;
    this.root.classList.toggle('sm-allow-auto-wrap', autoWrap);
    this.canvas = new Canvas({
      store: this.store,
      registry: this.registry,
      toolbar: this.toolbar,
      autoWrapSection: autoWrap,
      clearSelectionOnCanvasMargin: this.opts.clearSelectionOnCanvasMargin === true,
      layerRoot: this.root,
    });
    this.rightPanel = new RightPanel({
      store: this.store,
      registry: this.registry,
      imageAssets: this.opts.imageAssets,
      ui: this.opts.ui,
    });
    this.sourceView = new SourceView({ store: this.store, registry: this.registry });

    this.body.append(this.leftPanel.el, this.canvas.el, this.rightPanel.el);
    this.root.append(this.topbar.el, this.body);
  }

  /** 撤销/替换文档前先失焦右栏，否则 RightPanel 会因「保留焦点」跳过重绘而仍显示旧值 */
  private _blurRightPanelIfFocused() {
    const ae = document.activeElement as HTMLElement | null;
    if (ae && this.rightPanel.el.contains(ae)) ae.blur();
  }

  /** 提交内联编辑并清空选中，右栏回到文档级面板 */
  private _focusMailSettings() {
    this.canvas.commitInlineEdit();
    this.store.setSelection(null);
  }

  private _setMode(m: EditorMode) {
    if (this.mode === m) return;
    if (m !== 'design') this.canvas.commitInlineEdit();
    this.mode = m;
    this.topbar.setMode(m);
    clear(this.body);
    if (m === 'design') {
      this.body.classList.remove('sm-body--source');
      this.body.style.removeProperty('grid-template-columns');
      this.body.append(this.leftPanel.el, this.canvas.el, this.rightPanel.el);
    } else {
      this.body.classList.add('sm-body--source');
      this.body.style.removeProperty('grid-template-columns');
      this.body.append(this.sourceView.el);
      // 见 SourceView.refreshDoc：设计态源码面板未挂载时不更新，否则会一直显示构造函数时的旧快照
      queueMicrotask(() => this.sourceView.refreshDoc());
    }
  }

  private _bindKeyboard() {
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) {
          return;
        }
        const sel = this.store.selection;
        if (!sel) return;
        e.preventDefault();
        if (sel.kind === 'section') {
          this.store.update((d) => {
            d.sections = d.sections.filter((s) => s.id !== sel.sectionId);
          });
          this.store.setSelection(null);
        } else {
          this.store.update((d) => {
            const sec = d.sections.find((s) => s.id === sel.sectionId);
            if (!sec) return;
            const col = sec.columns[sel.columnIndex];
            if (!col) return;
            col.blocks = col.blocks.filter((b) => b.id !== sel.blockId);
            pruneSectionIfEmpty(d, sel.sectionId);
          });
          this.store.setSelection(null);
        }
      }
    });
    document.addEventListener('keydown', this._mailUndoRedoHandler, true);
    document.addEventListener('keydown', this._mailEscHandler, true);
    this.root.tabIndex = 0;
  }

  private _onChange() {
    if (!this.opts.onChange) return;
    if (this.changeTimer) window.clearTimeout(this.changeTimer);
    this.changeTimer = window.setTimeout(() => {
      this.opts.onChange?.(this.store.doc);
      this.changeTimer = null;
    }, 60) as unknown as number;
  }

  private _showVariablePopover(anchor: HTMLElement) {
    const vars = this.store.doc.variables;
    if (!vars.length) {
      alert('当前未配置变量。请先调用 editor.setVariables([...])');
      return;
    }
    const existing = this.root.querySelector('.sm-popover');
    if (existing) {
      existing.remove();
      return;
    }

    const pop = h('div', { class: 'sm-popover' });
    for (const v of vars) {
      pop.append(
        h(
          'button',
          {
            class: 'sm-popover__item',
            type: 'button',
            onclick: () => {
              this._insertVariable(v);
              pop.remove();
            },
          },
          [
            h('span', { class: 'sm-popover__key' }, [`{{${v.key}}}`]),
            h('span', { class: 'sm-popover__label' }, [v.label]),
          ],
        ),
      );
    }

    const rect = anchor.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    pop.style.top = `${rect.bottom - rootRect.top + 4}px`;
    pop.style.left = `${rect.left - rootRect.left}px`;
    this.root.append(pop);

    const onDocClick = (ev: MouseEvent) => {
      if (!pop.contains(ev.target as Node) && ev.target !== anchor) {
        pop.remove();
        document.removeEventListener('click', onDocClick, true);
      }
    };
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  }

  private _insertVariable(v: Variable) {
    const sel = this.store.selection;
    const placeholder = `{{${v.key}}}`;

    // 最高优：正在画布内联编辑的富文本光标处
    const inline = this.canvas.currentInlineEditor;
    if (inline) {
      inline.insertText(placeholder);
      return;
    }

    // 次之：当前聚焦的 input/textarea（属性面板）
    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (
      active &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
      this.root.contains(active)
    ) {
      const start = active.selectionStart ?? active.value.length;
      const end = active.selectionEnd ?? active.value.length;
      active.value = active.value.slice(0, start) + placeholder + active.value.slice(end);
      const ev = new Event('input', { bubbles: true });
      active.dispatchEvent(ev);
      return;
    }

    // 最次：选中 Block 时追加到该 block 的 inlineEditable 字段或第一个文本字段
    if (sel?.kind === 'block') {
      this.store.update((d) => {
        for (const s of d.sections) {
          for (const c of s.columns) {
            const b = c.blocks.find((x) => x.id === sel.blockId);
            if (!b) continue;
            const def = this.registry.get(b.type);
            const key =
              def?.inlineEditable?.propKey ??
              def?.schema.find((f) => f.type === 'text' || f.type === 'textarea')?.key;
            if (key) {
              const cur = String((b.props as any)[key] ?? '');
              (b.props as any)[key] = cur + placeholder;
            }
          }
        }
      });
      return;
    }

    alert('请先双击进入文本编辑、或聚焦一个输入框后再插入变量');
  }

  private _showExport() {
    // 切回设计模式时如果还在内联编辑，先把内容提交进 store
    this.canvas.commitInlineEdit();
    const modal = new ExportModal({
      store: this.store,
      registry: this.registry,
      withSampleVariables: true,
    });
    modal.open(this.root);
  }

  private _showPreview() {
    this.canvas.commitInlineEdit();
    const modal = new PreviewModal({
      store: this.store,
      registry: this.registry,
    });
    modal.open(this.root);
  }

  private _bindFullscreen() {
    if (this.opts.ui?.hideTopbarFullscreen === true) return;
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this._onFullscreenChange);
    this._onFullscreenChange();
  }

  private _unbindFullscreen() {
    document.removeEventListener('fullscreenchange', this._onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this._onFullscreenChange);
  }

  private async _toggleFullscreen() {
    try {
      if (smGetFullscreenElement() === this.root) await smExitFullscreen();
      else await smRequestFullscreen(this.root);
    } catch (err) {
      console.warn('[simple-mail] 全屏不可用:', err);
    }
  }

  private _toggleLayoutBorders() {
    this.showLayoutBorders = !this.showLayoutBorders;
    this.root.classList.toggle('sm-show-layout-borders', this.showLayoutBorders);
    this.topbar.setLayoutBordersActive(this.showLayoutBorders);
  }
}

function smGetFullscreenElement(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

async function smRequestFullscreen(el: HTMLElement): Promise<void> {
  const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  if (typeof anyEl.requestFullscreen === 'function') await anyEl.requestFullscreen();
  else if (typeof anyEl.webkitRequestFullscreen === 'function') await anyEl.webkitRequestFullscreen();
}

async function smExitFullscreen(): Promise<void> {
  const d = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  if (typeof document.exitFullscreen === 'function') await document.exitFullscreen();
  else if (typeof d.webkitExitFullscreen === 'function') await d.webkitExitFullscreen();
}

/* ----------------------------- 默认空文档 ------------------------------- */

function createDefaultDoc(partial?: Partial<EmailDoc>): EmailDoc {
  const mergedStyles = {
    backgroundColor: '#ffffff',
    contentBackgroundColor: '#ffffff',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '16px',
    fontWeight: '400',
    color: '#433f3f',
    linkColor: '#ff5a00',
    lineHeight: '1.25',
    ...(partial?.styles ?? {}),
  };
  return {
    version: '1',
    meta: {
      subject: '一封新邮件',
      preheader: '',
      width: 600,
      ...(partial?.meta ?? {}),
    },
    variables: partial?.variables ?? [],
    styles: {
      ...mergedStyles,
      fontWeight: mergedStyles.fontWeight ?? '400',
      lineHeight: mergedStyles.lineHeight ?? '1.25',
    },
    sections: partial?.sections ?? [],
  };
}

export { defineBlock };
