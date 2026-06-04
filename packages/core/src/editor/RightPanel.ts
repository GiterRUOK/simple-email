import { EditorView, basicSetup } from 'codemirror';
import { html as cmHtml } from '@codemirror/lang-html';
import { EditorState } from '@codemirror/state';
import type { Registry } from '../registry/registry';
import { htmlContainsMjmlTags } from '../utils/lockedMjml';
import {
  findBlockLocation,
  findSection,
  isMultiColumnLayout,
  setSectionLayout,
  type Store,
  type DocChangedDetail,
} from '../store/store';
import type {
  Block,
  BlockSchemaField,
  EditorUiOptions,
  EmailDoc,
  Section,
  SectionLayout,
  Variable,
} from '../types';
import { getSectionDynamicVariantKey } from '../utils/dynamicVariantSection';
import { defaultSocialIconBackground } from '../socialDefaults';
import { bindColorPickerInput } from './ColorPickerPopover';
import { normalizeAccentHex } from '../utils/accentColor';
import { clear, h } from '../utils/dom';
import { metaWidthInputString, parseMetaWidthFromUserInput, parseSectionWidthFromUserInput, sectionWidthInputString } from '../utils/contentWidth';
import {
  LIST_INDENT_PRESETS_PX,
  normalizeGlobalListIndentStorage,
  resolveGlobalListIndentPx,
} from '../utils/emailListStyles';
import { FONT_WEIGHT_STEP_OPTIONS, normalizeFontWeightStep } from '../utils/fontWeightSteps';
import type { ImageAssetsHandlers, ImageFieldContext } from './imageAssets';
import { FocusBreadcrumb } from './FocusBreadcrumb';
import { openImageGalleryModal } from './ImageGalleryModal';
import {
  buildVariablePickerBody,
  buildVariablePickerHead,
  type VariablePickerHandlers,
} from './VariablePickerPanel';

/** 与社交组 block 中每行元素结构一致（core 不依赖 blocks） */
type SocialLinkRow = {
  network: string;
  href: string;
  label?: string;
  iconSrc?: string;
  backgroundColor?: string;
};

/** 宽度滑块：解析右栏当前字符串 */
function classifyLayoutWidth(raw: string): 'auto' | 'px' | '%' | 'custom' {
  const t = (raw ?? '').trim();
  if (!t || t.toLowerCase() === 'auto') return 'auto';
  if (/^\d+(\.\d+)?%$/.test(t)) return '%';
  if (/^\d+(\.\d+)?px$/i.test(t)) return 'px';
  if (/^\d+(\.\d+)?$/.test(t)) return 'px';
  return 'custom';
}

function layoutWidthNumeric(raw: string, mode: 'px' | '%'): number {
  const t = (raw ?? '').trim();
  if (!t) return mode === '%' ? 100 : 280;
  const m = t.match(/^(\d+(\.\d+)?)/);
  const n = m ? parseFloat(m[1]) : mode === '%' ? 100 : 280;
  if (mode === '%') return Math.min(100, Math.max(1, Math.round(n)));
  return Math.min(1200, Math.max(1, Math.round(n)));
}

export interface RightPanelOptions {
  store: Store;
  registry: Registry;
  /** 聚焦路径根节点文案（文档级），默认「邮件」 */
  docRootLabel?: string;
  /** 点击路径中的 Section 层级 */
  onFocusSection: (sectionId: string) => void;
  /** 点击路径中的文档级层级（等同 Esc 从 Section 上浮） */
  onFocusDocument: () => void;
  /**
   * 可选。配置后，schema 中 `type: 'image'` 的字段会显示「上传 / 图床」按钮并调用对应回调。
   */
  imageAssets?: ImageAssetsHandlers;
  /** 与 MailEditor.opts.ui 对齐 */
  ui?: EditorUiOptions;
}

type RightTab = 'props' | 'code';

/**
 * 右栏：选中 Section/Block 时显示对应配置；未选中显示文档级配置（标题/宽度/全局样式）。
 * Block 选中时多一个"代码"Tab，可编辑该 Block 的 MJML 片段（CodeMirror）。
 */
export class RightPanel {
  el: HTMLElement;
  private opts: RightPanelOptions;
  private headEl: HTMLElement;
  private contentEl: HTMLElement;
  private focusCrumb: FocusBreadcrumb;
  private currentTab: RightTab = 'props';
  private codeView: EditorView | null = null;
  private variablePickerOpen = false;
  private variablePickerPinned = false;
  private variablePickerHandlers: VariablePickerHandlers | null = null;

  private _preferSliderControls(): boolean {
    return this.opts.ui?.preferSliderControls === true;
  }

  private _hideMailMeta(): boolean {
    return this.opts.ui?.hideMailMeta === true;
  }

  constructor(opts: RightPanelOptions) {
    this.opts = opts;
    this.el = h('aside', { class: 'sm-panel sm-panel--right' });
    this.focusCrumb = new FocusBreadcrumb({
      store: opts.store,
      registry: opts.registry,
      docRootLabel: opts.docRootLabel ?? '邮件',
      onFocusDocument: () => opts.onFocusDocument(),
      onFocusSection: (id) => opts.onFocusSection(id),
    });
    this.headEl = h('div', { class: 'sm-panel__head' }, [this.focusCrumb.el]);
    this.contentEl = h('div', { class: 'sm-panel__body' });
    this.el.append(this.headEl, this.contentEl);
    this._syncHeadVisibility();
    this._render();
    opts.store.subscribe((detail?: DocChangedDetail) => {
      if (this.variablePickerOpen) return;
      if (detail?.source === 'history') {
        this._renderPreservingFieldFocus();
        return;
      }
      if (detail?.source === 'replace') {
        this._render();
        return;
      }
      // update() 每打一字符都会 notify；整栏 clear 会拆掉输入框导致失焦
      if (this._shouldSkipRenderBecauseFocused()) return;
      this._render();
    });
    opts.store.subscribeSelection(() => {
      if (this.variablePickerOpen) return;
      this.currentTab = 'props';
      this._syncHeadVisibility();
      this._render();
    });
  }

  /** 在右栏展示变量列表（顶替属性面板，不遮挡画布） */
  openVariablePicker(vars: Variable[], handlers: VariablePickerHandlers) {
    this.variablePickerOpen = true;
    this.variablePickerPinned = false;
    this.variablePickerHandlers = handlers;
    this._renderVariablePicker(vars);
  }

  closeVariablePicker() {
    if (!this.variablePickerOpen) return;
    this.variablePickerOpen = false;
    this.variablePickerPinned = false;
    this.variablePickerHandlers = null;
    this.el.classList.remove('sm-panel--variable-picker');
    clear(this.headEl);
    this.headEl.append(this.focusCrumb.el);
    this._syncHeadVisibility();
    this._render();
  }

  isVariablePickerOpen(): boolean {
    return this.variablePickerOpen;
  }

  isVariablePickerPinned(): boolean {
    return this.variablePickerPinned;
  }

  toggleVariablePickerPin(): boolean {
    this.variablePickerPinned = !this.variablePickerPinned;
    return this.variablePickerPinned;
  }

  /** 文档级（无选中）时不展示面包屑，避免与「邮件设置」标题重复 */
  private _syncHeadVisibility() {
    if (this.variablePickerOpen) return;
    const show = !!this.opts.store.selection;
    this.headEl.hidden = !show;
  }

  private _renderVariablePicker(vars: Variable[]) {
    const handlers = this.variablePickerHandlers;
    if (!handlers) return;
    this._destroyCodeView();
    clear(this.headEl);
    clear(this.contentEl);
    this.el.classList.add('sm-panel--variable-picker');
    this.headEl.hidden = false;
    this.headEl.append(
      buildVariablePickerHead({
        pinned: this.variablePickerPinned,
        onClose: () => handlers.onClose(),
        onTogglePin: () => this.toggleVariablePickerPin(),
      }),
    );
    this.contentEl.append(buildVariablePickerBody(vars, handlers));
  }

  /** 焦点在右栏可编辑控件上时不要整栏重渲染（避免输入/CodeMirror 失焦） */
  private _shouldSkipRenderBecauseFocused(): boolean {
    const ae = document.activeElement as HTMLElement | null;
    if (!ae || !this.el.contains(ae)) return false;
    if (ae.closest('.cm-editor')) return true;
    const tag = ae.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return false;
  }

  /** undo/redo 后整栏重绘，但尽量回到同一输入框与光标位置 */
  private _renderPreservingFieldFocus() {
    if (this.variablePickerOpen) return;
    const ae = document.activeElement as HTMLElement | null;
    let token: string | null = null;
    let selStart = 0;
    let selEnd = 0;
    if (ae && this.el.contains(ae)) {
      token = ae.getAttribute('data-sm-focus');
      if (
        token &&
        (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement)
      ) {
        selStart = ae.selectionStart ?? 0;
        selEnd = ae.selectionEnd ?? 0;
      }
    }
    this._render();
    if (!token) return;
    const next = this._findFocusEl(token);
    next?.focus();
    if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
      const len = next.value.length;
      next.setSelectionRange(Math.min(selStart, len), Math.min(selEnd, len));
    }
  }

  private _findFocusEl(token: string): HTMLElement | null {
    for (const el of this.el.querySelectorAll('[data-sm-focus]')) {
      if ((el as HTMLElement).getAttribute('data-sm-focus') === token) return el as HTMLElement;
    }
    return null;
  }

  private _render() {
    if (this.variablePickerOpen) return;
    this._destroyCodeView();
    clear(this.contentEl);

    const sel = this.opts.store.selection;
    const doc = this.opts.store.doc;

    if (!sel) {
      this.contentEl.append(this._renderDocForm(doc));
      return;
    }

    if (sel.kind === 'section') {
      const section = findSection(doc, sel.sectionId);
      if (!section) return;
      this.contentEl.append(this._renderSectionForm(section));
      return;
    }

    // block
    const loc = findBlockLocation(doc, sel.blockId);
    if (!loc) {
      const tabs = h('div', { class: 'sm-tabs' }, [
        this._tabBtn('props', '属性'),
        this._tabBtn('code', '代码'),
      ]);
      this.contentEl.append(tabs);
      this.contentEl.append(
        h('div', { class: 'sm-empty-form' }, ['该组件可能已被删除，请重新选中画布中的块。']),
      );
      return;
    }
    const def = this.opts.registry.get(loc.block.type);

    const tabs = h('div', { class: 'sm-tabs' }, [
      this._tabBtn('props', '属性'),
      this._tabBtn('code', '代码'),
    ]);
    this.contentEl.append(tabs);

    if (this.currentTab === 'props') {
      if (loc.block.lockedMjml) {
        this.contentEl.append(
          h('div', { class: 'sm-empty-form' }, [
            '该组件已被代码模式锁定。',
            h('div', { style: 'margin-top:8px;' }, [
              h(
                'button',
                {
                  class: 'sm-btn',
                  type: 'button',
                  onclick: () => {
                    this.opts.store.update((d) => {
                      const l = findBlockLocation(d, loc.block.id);
                      if (l) delete l.block.lockedMjml;
                    });
                  },
                },
                ['恢复为属性模式'],
              ),
            ]),
          ]),
        );
      } else if (def) {
        this.contentEl.append(this._renderBlockForm(loc.block, def.schema));
      } else {
        this.contentEl.append(
          h('div', { class: 'sm-empty-form' }, [`未注册的组件: ${loc.block.type}`]),
        );
      }
    } else {
      this.contentEl.append(this._renderBlockCodeView(loc.block));
    }
  }

  private _tabBtn(tab: RightTab, label: string) {
    return h(
      'button',
      {
        class: `sm-tabs__item ${this.currentTab === tab ? 'sm-tabs__item--active' : ''}`,
        type: 'button',
        onclick: () => {
          this.currentTab = tab;
          this._render();
        },
      },
      [label],
    );
  }

  /* ------------------------------ 文档级表单 ------------------------------- */

  private _renderDocForm(doc: EmailDoc): HTMLElement {
    const hideMeta = this._hideMailMeta();
    const rows: HTMLElement[] = [];
    if (!hideMeta) {
      rows.push(
        h('div', { class: 'sm-panel__title' }, ['邮件设置']),
        this._textField('主题', doc.meta.subject, (v) =>
          this.opts.store.update((d) => {
            d.meta.subject = v;
          }),
          '',
          'doc:meta.subject',
        ),
        this._textField('Preheader', doc.meta.preheader ?? '', (v) =>
          this.opts.store.update((d) => {
            d.meta.preheader = v;
          }),
          '',
          'doc:meta.preheader',
        ),
      );
    } else {
      rows.push(h('div', { class: 'sm-panel__title' }, ['版式']));
    }
    rows.push(
      this._textField(
        '内容宽度',
        metaWidthInputString(doc.meta.width),
        (v) =>
          this.opts.store.update((d) => {
            d.meta.width = parseMetaWidthFromUserInput(v);
          }),
        '如 600、600px、100%',
        'doc:meta.width',
      ),
      h('div', { class: 'sm-panel__title' }, ['全局样式']),
      this._colorField(
        '页面背景',
        doc.styles.backgroundColor,
        (v) =>
          this.opts.store.update((d) => {
            d.styles.backgroundColor = v;
          }),
        'doc:styles.backgroundColor',
      ),
      this._colorField(
        '内容背景',
        doc.styles.contentBackgroundColor,
        (v) =>
          this.opts.store.update((d) => {
            d.styles.contentBackgroundColor = v;
          }),
        'doc:styles.contentBackgroundColor',
      ),
      this._textField(
        '字体',
        doc.styles.fontFamily,
        (v) =>
          this.opts.store.update((d) => {
            d.styles.fontFamily = v;
          }),
        '',
        'doc:styles.fontFamily',
      ),
      this._docFontSizeField(
        doc.styles.fontSize,
        (v) =>
          this.opts.store.update((d) => {
            d.styles.fontSize = v;
          }),
        'doc:styles.fontSize',
      ),
      this._docFontWeightField(
        doc.styles.fontWeight ?? '400',
        (v) =>
          this.opts.store.update((d) => {
            d.styles.fontWeight = v;
          }),
        'doc:styles.fontWeight',
      ),
      this._textField(
        '行高',
        doc.styles.lineHeight ?? '1.25',
        (v) =>
          this.opts.store.update((d) => {
            d.styles.lineHeight = v;
          }),
        '如 1.25 或 24px',
        'doc:styles.lineHeight',
      ),
      this._colorField(
        '正文颜色',
        doc.styles.color,
        (v) =>
          this.opts.store.update((d) => {
            d.styles.color = v;
          }),
        'doc:styles.color',
      ),
      this._colorField(
        '链接颜色',
        doc.styles.linkColor,
        (v) =>
          this.opts.store.update((d) => {
            d.styles.linkColor = v;
          }),
        'doc:styles.linkColor',
      ),
      this._listIndentDefaultField(doc),
    );
    return h('form', { class: 'sm-form', onsubmit: (e: Event) => e.preventDefault() }, rows);
  }

  /* ------------------------------ Section 表单 ----------------------------- */

  private _renderSectionForm(section: Section): HTMLElement {
    const a = section.attrs;
    const dvUiEnabled = this.opts.ui?.enableDynamicVariantKey === true;
    const dvKey = dvUiEnabled ? getSectionDynamicVariantKey(section) : undefined;
    const dynamicVariantKeyField = dvUiEnabled
      ? (() => {
          const field = this._textField(
            '动态变量名',
            a.dynamicVariantKey ?? '',
            (v) =>
              this.opts.store.update((d) => {
                const s = findSection(d, section.id);
                if (!s) return;
                const trimmed = v.trim();
                s.attrs.dynamicVariantKey = trimmed || undefined;
              }),
            '谨慎填写，需确认业务场景是否支持',
            `section:${section.id}:attrs.dynamicVariantKey`,
          );
          field.append(
            h('div', { class: 'sm-field__help' }, ['本段内容将整体替换成该动态变量名']),
          );
          return field;
        })()
      : null;
    return h('form', { class: 'sm-form', onsubmit: (e: Event) => e.preventDefault() }, [
      h('div', { class: 'sm-panel__title' }, [
        dvKey ? '动态变量 Section' : 'Section 设置',
      ]),
      ...(dynamicVariantKeyField ? [dynamicVariantKeyField] : []),
      ...(isMultiColumnLayout(section.layout)
        ? [
            this._multiColumnLayoutField(
              section.layout,
              (layout) =>
                this.opts.store.update((d) => {
                  const s = findSection(d, section.id);
                  if (s) setSectionLayout(s, layout);
                }),
              `section:${section.id}:layout`,
            ),
          ]
        : []),
      this._colorField(
        '背景色',
        a.backgroundColor ?? '',
        (v) =>
          this.opts.store.update((d) => {
            const s = findSection(d, section.id);
            if (s) s.attrs.backgroundColor = v || undefined;
          }),
        `section:${section.id}:attrs.bg`,
        '留空=透明',
      ),
      this._layoutWidthField(
        '区域宽度',
        sectionWidthInputString(a.width),
        (v) =>
          this.opts.store.update((d) => {
            const s = findSection(d, section.id);
            if (s) s.attrs.width = parseSectionWidthFromUserInput(v);
          }),
        `section:${section.id}:attrs.width`,
        '留空=与邮件同宽；自适应等价于清空宽度',
      ),
      this._spacingField(
        '内边距',
        [a.paddingTop, a.paddingRight, a.paddingBottom, a.paddingLeft],
        (vals) =>
          this.opts.store.update((d) => {
            const s = findSection(d, section.id);
            if (!s) return;
            [s.attrs.paddingTop, s.attrs.paddingRight, s.attrs.paddingBottom, s.attrs.paddingLeft] =
              vals;
          }),
        `section:${section.id}:attrs.pad`,
        [0, 0, 0, 0],
      ),
      section.layout !== '1'
        ? this._numberField(
            '列间距 (px)',
            a.columnGap ?? 0,
            0,
            64,
            (v) => {
              const g = Math.max(0, Math.min(64, Math.round(v)));
              this.opts.store.update((d) => {
                const s = findSection(d, section.id);
                if (s) s.attrs.columnGap = g > 0 ? g : undefined;
              });
            },
            1,
            `section:${section.id}:attrs.columnGap`,
          )
        : null,
      section.layout !== '1'
        ? this._switchField(
            '小屏仍并排显示多列（可能字很窄）',
            !!a.preserveColumnsOnMobile,
            (checked) =>
              this.opts.store.update((d) => {
                const s = findSection(d, section.id);
                if (s) s.attrs.preserveColumnsOnMobile = checked || undefined;
              }),
            '开启后 MJML 会生成 mj-group，移动端预览/导出与默认「小屏堆叠列」行为不同。',
            `section:${section.id}:attrs.preserveMobile`,
          )
        : null,
    ]);
  }

  /* ------------------------------- Block 表单 ----------------------------- */

  private _renderBlockForm(block: Block, schema: BlockSchemaField[]): HTMLElement {
    const form = h('form', { class: 'sm-form', onsubmit: (e: Event) => e.preventDefault() });
    for (const field of schema) {
      form.append(this._field(field, block));
    }
    return form;
  }

  private _updateBlock(blockId: string, key: string, value: unknown) {
    this.opts.store.update((d) => {
      const loc = findBlockLocation(d, blockId);
      if (!loc) return;
      (loc.block.props as any)[key] = value;
    });
  }

  private _field(field: BlockSchemaField, block: Block): HTMLElement {
    const blockId = block.id;
    const fp = `block:${blockId}:${field.key}`;
    const def = this.opts.registry.get(block.type);
    const defaults = def?.defaultProps as Record<string, unknown> | undefined;
    const raw = (block.props as Record<string, unknown>)[field.key];
    const value: unknown =
      raw !== undefined && raw !== null ? raw : defaults?.[field.key];
    const onChange = (v: any) => this._updateBlock(blockId, field.key, v);

    switch (field.type) {
      case 'textarea':
        if (block.type === 'html' && field.key === 'html') {
          return this._textareaField(
            field.label,
            String(value ?? ''),
            onChange,
            field.help,
            fp,
            (v) =>
              htmlContainsMjmlTags(v)
                ? '检测到 MJML 标签（如 <mj-text>）。此处应只写 HTML，否则预览会显示源码。简单链接请用「文本」块。'
                : null,
          );
        }
        return this._textareaField(field.label, String(value ?? ''), onChange, field.help, fp);
      case 'number':
        return this._numberField(
          field.label,
          Number(value ?? 0),
          field.min ?? 0,
          field.max ?? 9999,
          onChange,
          field.step ?? 1,
          fp,
        );
      case 'color': {
        const rawColor = (block.props as Record<string, unknown>)[field.key];
        const stored =
          rawColor !== undefined && rawColor !== null ? String(rawColor).trim() : '';
        return this._colorField(
          field.label,
          stored,
          (v) => onChange(v.trim()),
          fp,
          field.placeholder ?? '',
        );
      }
      case 'select': {
        const isFw = field.key === 'fontWeight' || field.key === 'labelFontWeight';
        const opts = field.options?.length
          ? field.options
          : isFw
            ? FONT_WEIGHT_STEP_OPTIONS
            : [];
        if (isFw && field.inheritGlobal) {
          const stored =
            raw !== undefined && raw !== null ? String(raw).trim() : '';
          return this._fontWeightInheritField(
            field.label,
            stored,
            normalizeFontWeightStep(this.opts.store.doc.styles.fontWeight),
            (v) => onChange(v),
            fp,
            opts,
            field.help,
          );
        }
        const displayVal = isFw
          ? normalizeFontWeightStep(String(value ?? ''))
          : String(value ?? '');
        if (isFw || field.selectVariant === 'segmented') {
          const el = this._segmentedSelectField(field.label, displayVal, opts, onChange, fp);
          if (field.help) el.append(h('div', { class: 'sm-field__help' }, [field.help]));
          return el;
        }
        return this._selectField(field.label, displayVal, opts, onChange, fp);
      }
      case 'switch':
        return this._switchField(field.label, !!value, onChange, field.help, fp);
      case 'image':
        return this._imageField(
          field.label,
          String(value ?? ''),
          onChange,
          field.placeholder ?? 'https://',
          fp,
          { blockId, propKey: field.key },
        );
      case 'url':
      case 'text': {
        if (field.key === 'width' && this._preferSliderControls()) {
          return this._layoutWidthField(
            field.label,
            String(value ?? ''),
            (v) => onChange(v),
            fp,
            field.help,
          );
        }
        if (field.key === 'fontSize' && field.inheritGlobal) {
          const rawFs =
            raw !== undefined && raw !== null ? String(raw).trim() : '';
          return this._fontSizeSliderField(
            field.label,
            rawFs,
            (v) => onChange(v.trim()),
            fp,
            field.help,
            this.opts.store.doc.styles.fontSize,
          );
        }
        const row = this._textField(
          field.label,
          String(value ?? ''),
          onChange,
          field.placeholder ?? '',
          fp,
        );
        if (field.help) row.append(h('div', { class: 'sm-field__help' }, [field.help]));
        return row;
      }
      case 'spacing': {
        /** 与各 block 约定：四边分别存 paddingTop / paddingRight / paddingBottom / paddingLeft */
        const p = block.props as Record<string, unknown>;
        const quad = [
          Number(p.paddingTop ?? 0),
          Number(p.paddingRight ?? 0),
          Number(p.paddingBottom ?? 0),
          Number(p.paddingLeft ?? 0),
        ];
        const def = this.opts.registry.get(block.type);
        const dp = def?.defaultProps as Record<string, unknown> | undefined;
        const resetQuad: [number, number, number, number] = [
          Number(dp?.paddingTop ?? 0),
          Number(dp?.paddingRight ?? 0),
          Number(dp?.paddingBottom ?? 0),
          Number(dp?.paddingLeft ?? 0),
        ];
        return this._spacingField(field.label, quad, (vals) => {
          this.opts.store.update((d) => {
            const loc = findBlockLocation(d, blockId);
            if (!loc) return;
            const pr = loc.block.props as Record<string, number>;
            [pr.paddingTop, pr.paddingRight, pr.paddingBottom, pr.paddingLeft] = vals;
          });
        }, `${fp}:pad`, resetQuad);
      }
      case 'socialLinkList': {
        const rows = Array.isArray(value)
          ? (value as SocialLinkRow[])
          : Array.isArray(defaults?.[field.key])
            ? (defaults[field.key] as SocialLinkRow[])
            : [];
        return this._socialLinkListField(
          field.label,
          rows,
          field.options ?? [],
          blockId,
          field.key,
          field.help,
          fp,
        );
      }
      default:
        return h('div');
    }
  }

  /**
   * 社交组：每行含平台、链接、可选标签/图标 URL/图标背景色。
   * 注意：右栏在输入框聚焦时会跳过整栏 _render()，故更新 elements 必须在 store.update 内
   * 读取当前 props 再合并，禁止依赖闭包里的 items 快照（否则改一行会覆盖其它行已编辑未重绘的数据）。
   */
  private _socialLinkListField(
    label: string,
    items: SocialLinkRow[],
    networkOptions: { label: string; value: string }[],
    blockId: string,
    elementsKey: string,
    help: string | undefined,
    focusPrefix: string,
  ): HTMLElement {
    const firstVal = networkOptions[0]?.value ?? 'weibo';
    const wrap = h('div', { class: 'sm-field' });
    wrap.append(h('label', { class: 'sm-field__label' }, [label]));

    const listEl = h('div', { class: 'sm-social-link-list' });

    const patchElements = (mutate: (rows: SocialLinkRow[]) => SocialLinkRow[]) => {
      this.opts.store.update((d) => {
        const loc = findBlockLocation(d, blockId);
        if (!loc) return;
        const props = loc.block.props as Record<string, unknown>;
        const raw = props[elementsKey];
        const cur: SocialLinkRow[] = Array.isArray(raw)
          ? (raw as SocialLinkRow[]).map((x) => ({ ...x }))
          : [];
        props[elementsKey] = mutate(cur);
      });
    };

    const syncItem = (index: number, patch: Partial<SocialLinkRow>) => {
      patchElements((rows) =>
        rows.map((x, i) => (i === index ? { ...x, ...patch } : x)),
      );
    };

    const removeAt = (index: number) => {
      patchElements((rows) => rows.filter((_, i) => i !== index));
    };

    for (let i = 0; i < items.length; i++) {
      const rowData = items[i];
      const rowWrap = h('div', { class: 'sm-social-link-list__row' });
      const mainRow = h('div', { class: 'sm-social-link-list__row-main' });
      const sel = h('select', {
        class: 'sm-select sm-social-link-list__network',
        ...(focusPrefix ? { 'data-sm-focus': `${focusPrefix}:row:${i}:net` } : {}),
        onchange: (e: Event) =>
          syncItem(i, { network: (e.target as HTMLSelectElement).value }),
      });
      for (const o of networkOptions) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === rowData.network) opt.selected = true;
        sel.append(opt);
      }
      if (!networkOptions.some((o) => o.value === rowData.network) && rowData.network) {
        const opt = document.createElement('option');
        opt.value = rowData.network;
        opt.textContent = rowData.network;
        opt.selected = true;
        sel.insertBefore(opt, sel.firstChild);
      }
      const inp = h('input', {
        class: 'sm-input sm-social-link-list__href',
        type: 'url',
        placeholder: 'https://',
        value: rowData.href,
        ...(focusPrefix ? { 'data-sm-focus': `${focusPrefix}:row:${i}:href` } : {}),
        oninput: (e: Event) => syncItem(i, { href: (e.target as HTMLInputElement).value }),
      });
      const rm = h(
        'button',
        {
          class: 'sm-social-link-list__remove',
          type: 'button',
          title: '删除',
          onclick: () => removeAt(i),
        },
        ['×'],
      );
      mainRow.append(sel, inp, rm);
      rowWrap.append(mainRow);

      const extras = h('div', { class: 'sm-social-link-list__row-extras' });
      const bgResolved = defaultSocialIconBackground(rowData.network);
      const bgStored = rowData.backgroundColor?.trim();
      const bgDisplay =
        bgStored && bgStored.startsWith('#') ? bgStored : bgResolved;
      extras.append(
        h('input', {
          class: 'sm-input sm-social-link-list__label',
          type: 'text',
          placeholder: '标签文字（可选）',
          value: rowData.label ?? '',
          ...(focusPrefix ? { 'data-sm-focus': `${focusPrefix}:row:${i}:label` } : {}),
          oninput: (e: Event) => syncItem(i, { label: (e.target as HTMLInputElement).value }),
        }),
        h('input', {
          class: 'sm-input sm-social-link-list__iconsrc',
          type: 'url',
          placeholder: '图标 URL（可选）',
          value: rowData.iconSrc ?? '',
          ...(focusPrefix ? { 'data-sm-focus': `${focusPrefix}:row:${i}:icon` } : {}),
          oninput: (e: Event) => syncItem(i, { iconSrc: (e.target as HTMLInputElement).value }),
        }),
      );
      const bgPick = h('input', {
        class: 'sm-social-link-list__color sm-social-link-list__color--compact',
        type: 'color',
        value: bgDisplay.length >= 4 ? bgDisplay : bgResolved,
        ...(focusPrefix ? { 'data-sm-focus': `${focusPrefix}:row:${i}:bg` } : {}),
      }) as HTMLInputElement;
      bindColorPickerInput(bgPick, {
        liveCommit: true,
        onCommit: (hex) => syncItem(i, { backgroundColor: hex }),
      });
      extras.append(bgPick);
      rowWrap.append(extras);

      listEl.append(rowWrap);
    }

    const addBtn = h(
      'button',
      {
        class: 'sm-btn sm-social-link-list__add',
        type: 'button',
        onclick: () =>
          patchElements((rows) => [
            ...rows,
            {
              network: firstVal,
              href: 'https://',
              label: '',
              iconSrc: '',
            },
          ]),
      },
      ['+ 添加社交链接'],
    );

    wrap.append(listEl, addBtn);
    if (help) wrap.append(h('div', { class: 'sm-field__help' }, [help]));
    return wrap;
  }

  /* --------------------------------- 控件 --------------------------------- */

  private _textField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder = '',
    focusToken?: string,
  ) {
    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      h('input', {
        class: 'sm-input',
        type: 'text',
        value,
        placeholder,
        ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
        oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
      }),
    ]);
  }

  /** `type: 'image'`：URL 输入 + 可选上传、图床（由 `imageAssets` 注入） */
  private _imageField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    focusToken: string | undefined,
    ids: Pick<ImageFieldContext, 'blockId' | 'propKey'>,
  ): HTMLElement {
    const assets = this.opts.imageAssets;
    const showUploadBtn = !!assets?.uploadImage && assets.showUpload !== false;
    const showGalleryBtn =
      assets?.showGallery === true &&
      (!!assets.imageGallery || !!assets.pickImageFromGallery);
    const hasAssetCallbacks = !!(
      assets?.uploadImage ||
      assets?.pickImageFromGallery ||
      assets?.imageGallery
    );
    const hasAnyPickerBtn = showUploadBtn || showGalleryBtn;

    const row = h('div', { class: 'sm-image-field__row' });
    const urlInp = h('input', {
      class: 'sm-input sm-image-field__url',
      type: 'url',
      value,
      placeholder,
      ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
      oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
    });
    const getCtx = (): ImageFieldContext => ({
      blockId: ids.blockId,
      propKey: ids.propKey,
      currentUrl: urlInp.value,
    });
    row.append(urlInp);

    const applyUrl = (url: string) => {
      const t = url.trim();
      if (!t) return;
      onChange(t);
      urlInp.value = t;
    };

    const runAsync = (p: Promise<string | null | void>, labelErr: string) => {
      p.catch((e) => {
        console.error(`[simple-mail] ${labelErr}`, e);
      });
    };

    if (showUploadBtn) {
      const fileInp = h('input', {
        type: 'file',
        accept: 'image/*',
        class: 'sm-image-field__file',
        onchange: (e: Event) => {
          const el = e.target as HTMLInputElement;
          const f = el.files?.[0];
          el.value = '';
          if (!f) return;
          runAsync(
            assets.uploadImage!(f, getCtx()).then((url) => applyUrl(String(url))),
            'uploadImage',
          );
        },
      });
      row.append(
        h(
          'button',
          {
            class: 'sm-btn sm-btn--secondary sm-image-field__btn',
            type: 'button',
            title: '上传本地图片',
            onclick: () => fileInp.click(),
          },
          ['上传'],
        ),
      );
      row.append(fileInp);
    }

    if (showGalleryBtn) {
      row.append(
        h(
          'button',
          {
            class: 'sm-btn sm-btn--secondary sm-image-field__btn',
            type: 'button',
            title: '从图库选择',
            onclick: () => {
              if (assets.imageGallery) {
                openImageGalleryModal({
                  adapter: assets.imageGallery,
                  onPick: (url) => applyUrl(url),
                });
                return;
              }
              if (assets.pickImageFromGallery) {
                runAsync(
                  assets.pickImageFromGallery(getCtx()).then((url) => {
                    if (url != null && String(url).trim()) applyUrl(String(url));
                  }),
                  'pickImageFromGallery',
                );
              }
            },
          },
          ['图床'],
        ),
      );
    }

    let helpBody: string;
    if (hasAnyPickerBtn) {
      const bits: string[] = ['可手输 URL'];
      if (showUploadBtn) bits.push('或使用「上传」');
      if (showGalleryBtn) bits.push('或使用「图床」');
      helpBody = `${bits.join('；')}。`;
    } else if (hasAssetCallbacks) {
      helpBody =
        '已传入 imageAssets：上传默认显示（提供 uploadImage 且未设 showUpload:false）；图库需 showGallery:true，可使用内置 imageGallery 或自管 pickImageFromGallery。仍可手输 URL。';
    } else {
      helpBody =
        '在 MailEditor 的 imageAssets 中配置 uploadImage、内置 imageGallery 或 pickImageFromGallery 等；未配置时仅支持手输 URL。';
    }

    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      row,
      h('div', { class: 'sm-field__help' }, [helpBody]),
    ]);
  }
  private _textareaField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    help?: string,
    focusToken?: string,
    warn?: (v: string) => string | null,
  ) {
    const warnEl = h('div', { class: 'sm-field__warn', style: 'display:none' });
    const ta = h('textarea', {
      class: 'sm-textarea',
      ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
      oninput: (e: Event) => {
        const v = (e.target as HTMLTextAreaElement).value;
        onChange(v);
        if (warn) {
          const msg = warn(v);
          warnEl.textContent = msg ?? '';
          warnEl.style.display = msg ? '' : 'none';
        }
      },
    });
    ta.value = value;
    if (warn) {
      const msg = warn(value);
      if (msg) {
        warnEl.textContent = msg;
        warnEl.style.display = '';
      }
    }
    return h(
      'div',
      { class: 'sm-field' },
      [
        h('label', { class: 'sm-field__label' }, [label]),
        ta,
        warnEl,
        help ? h('div', { class: 'sm-field__help' }, [help]) : null,
      ],
    );
  }
  private _numberField(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
    step = 1,
    focusToken?: string,
  ) {
    const snap = (n: number) => {
      const c = Math.min(max, Math.max(min, n));
      if (!step || step <= 0) return c;
      const k = Math.round((c - min) / step);
      return Number((min + k * step).toPrecision(12));
    };

    if (!this._preferSliderControls()) {
      const inp = h('input', {
        class: 'sm-input',
        type: 'number',
        value: String(value),
        min,
        max,
        step,
        ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
      }) as HTMLInputElement;

      const commitPlain = () => {
        const t = inp.value.trim();
        const fb = snap(value);
        if (t === '') {
          inp.value = String(fb);
          onChange(fb);
          return;
        }
        const v = Number(t);
        const s = snap(Number.isNaN(v) ? fb : v);
        inp.value = String(s);
        onChange(s);
      };

      /** min>0 时中途输入会被 snap 打断（如想输入 16 会先变成 10），仅失焦/Enter 提交 */
      if (min > 0) {
        inp.addEventListener('blur', commitPlain);
        inp.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') inp.blur();
        });
      } else {
        inp.addEventListener('input', () => {
          const t = inp.value.trim();
          if (t === '') return;
          const v = Number(t);
          if (Number.isNaN(v)) return;
          onChange(snap(v));
        });
        inp.addEventListener('blur', commitPlain);
        inp.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') commitPlain();
        });
      }

      return h('div', { class: 'sm-field' }, [
        h('label', { class: 'sm-field__label' }, [label]),
        inp,
      ]);
    }

    const v0 = snap(value);
    const range = h('input', {
      type: 'range',
      min,
      max,
      step,
      value: String(v0),
    }) as HTMLInputElement;

    const num = h('input', {
      class: 'sm-input',
      type: 'number',
      min,
      max,
      step,
      value: String(v0),
      ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
    }) as HTMLInputElement;

    const syncFromSlider = (n: number) => {
      const s = snap(n);
      range.value = String(s);
      num.value = String(s);
      onChange(s);
    };

    range.addEventListener('input', () => {
      syncFromSlider(Number(range.value));
    });

    num.addEventListener('input', () => {
      const t = num.value.trim();
      if (t === '') return;
      const raw = Number(t);
      if (Number.isNaN(raw)) return;
      range.value = String(snap(raw));
    });

    num.addEventListener('blur', () => {
      const t = num.value.trim();
      const fb = snap(Number(range.value));
      if (t === '') {
        syncFromSlider(fb);
        return;
      }
      const raw = Number(t);
      if (Number.isNaN(raw)) {
        syncFromSlider(fb);
        return;
      }
      syncFromSlider(raw);
    });

    num.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') num.blur();
    });

    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      h('div', { class: 'sm-field__slider-row' }, [range, num]),
    ]);
  }
  private _colorField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    focusPrefix?: string,
    placeholder = '#ffffff',
  ) {
    const pickToken = focusPrefix ? `${focusPrefix}:pick` : undefined;
    const textToken = focusPrefix ? `${focusPrefix}:text` : undefined;
    const pick = h('input', {
      type: 'color',
      ...(pickToken ? { 'data-sm-focus': pickToken } : {}),
    }) as HTMLInputElement;
    const text = h('input', {
      class: 'sm-input',
      type: 'text',
      placeholder,
      ...(textToken ? { 'data-sm-focus': textToken } : {}),
    }) as HTMLInputElement;

    let lastValid = value.trim();

    const applyPickInherit = () => {
      pick.value = '#808080';
      pick.classList.add('sm-color-row__pick--inherit');
      pick.title = placeholder || '未设置';
    };

    const applyStored = (stored: string) => {
      const trimmed = stored.trim();
      text.value = trimmed;
      const hex = normalizeAccentHex(trimmed);
      if (hex) {
        pick.value = hex;
        pick.classList.remove('sm-color-row__pick--inherit');
        pick.title = '';
      } else {
        applyPickInherit();
      }
    };

    applyStored(value);

    const previewPick = (hex: string) => {
      text.value = hex;
      pick.value = hex;
      pick.classList.remove('sm-color-row__pick--inherit');
      pick.title = '';
      lastValid = hex;
    };

    const commitPick = (hex: string) => {
      previewPick(hex);
      onChange(hex);
    };

    bindColorPickerInput(pick, {
      getValue: () => text.value.trim() || pick.value,
      placeholder,
      allowClear: true,
      onPreview: previewPick,
      onCommit: commitPick,
      onClear: () => {
        applyStored('');
        lastValid = '';
        onChange('');
      },
    });

    text.addEventListener('input', () => {
      const raw = text.value;
      const hex = normalizeAccentHex(raw);
      if (hex) {
        pick.value = hex;
        pick.classList.remove('sm-color-row__pick--inherit');
        pick.title = '';
        lastValid = hex;
      } else if (!raw.trim()) {
        applyPickInherit();
        lastValid = '';
      }
      onChange(raw);
    });

    text.addEventListener('blur', () => {
      const raw = text.value.trim();
      if (!raw) {
        applyStored('');
        lastValid = '';
        onChange('');
        return;
      }
      const hex = normalizeAccentHex(raw);
      if (hex) {
        applyStored(hex);
        lastValid = hex;
        if (hex !== raw) onChange(hex);
        return;
      }
      applyStored(lastValid);
      onChange(lastValid);
    });

    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      h('div', { class: 'sm-color-row' }, [pick, text]),
    ]);
  }
  private _selectField(
    label: string,
    value: string,
    options: { label: string; value: string }[],
    onChange: (v: string) => void,
    focusToken?: string,
  ) {
    const sel = h('select', {
      class: 'sm-select',
      ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
      onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value),
    });
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === value) opt.selected = true;
      sel.append(opt);
    }
    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      sel,
    ]);
  }

  /** 邮件设置：列表默认缩进（平铺）；未配置时初始为 24px */
  private _listIndentDefaultField(doc: EmailDoc): HTMLElement {
    const current = String(resolveGlobalListIndentPx(doc.styles));
    const options = LIST_INDENT_PRESETS_PX.map((px) => ({
      label: String(px),
      value: String(px),
    }));
    const help = h('div', { class: 'sm-field__help' }, [
      '未单独设置缩进的列表使用此值。',
    ]);
    const field = this._segmentedSelectField(
      '列表默认缩进',
      current,
      options,
      (v) =>
        this.opts.store.update((d) => {
          const stored = normalizeGlobalListIndentStorage(Number(v));
          if (stored === undefined) delete d.styles.listIndentDefaultPx;
          else d.styles.listIndentDefaultPx = stored;
        }),
      'doc:styles.listIndentDefaultPx',
      true,
    );
    field.append(help);
    return field;
  }

  /** select 平铺：与顶栏 sm-segmented 视觉一致，占满右栏宽度 */
  private _segmentedSelectField(
    label: string,
    value: string,
    options: { label: string; value: string }[],
    onChange: (v: string) => void,
    focusToken?: string,
    wrap = false,
  ) {
    const group = h('div', {
      class: `sm-segmented sm-segmented--fill${wrap ? ' sm-segmented--wrap' : ''}`,
      role: 'group',
      'aria-label': label,
    });
    for (const o of options) {
      const active = o.value === value;
      group.append(
        h(
          'button',
          {
            type: 'button',
            class: `sm-segmented__item${active ? ' sm-segmented__item--active' : ''}`,
            'aria-pressed': active ? 'true' : 'false',
            title: o.label,
            ...(focusToken ? { 'data-sm-focus': `${focusToken}:${o.value}` } : {}),
            onclick: () => onChange(o.value),
          },
          [o.label],
        ),
      );
    }
    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      group,
    ]);
  }
  private _switchField(
    label: string,
    value: boolean,
    onChange: (v: boolean) => void,
    help?: string,
    focusToken?: string,
  ): HTMLElement {
    const row = h('label', {
      class: 'sm-field',
      style: 'flex-direction:row;align-items:center;gap:8px;',
    }, [
      h('input', {
        type: 'checkbox',
        ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
        onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
        ...(value ? { checked: true } : {}),
      } as any),
      h('span', { class: 'sm-field__label' }, [label]),
    ]);
    if (!help) return row;
    return h('div', { class: 'sm-field', style: 'flex-direction:column;align-items:flex-start;gap:6px;' }, [
      row,
      h('div', { class: 'sm-field__help' }, [help]),
    ]);
  }
  private _spacingField(
    label: string,
    [t, r, b, l]: (number | undefined)[],
    onChange: (vals: number[]) => void,
    focusPrefix?: string,
    resetQuad?: [number, number, number, number],
  ) {
    const titles = ['上', '右', '下', '左'];
    const clampPad = (n: number) => Math.max(0, Math.min(200, Math.round(n)));

    /** 右栏聚焦时会跳过整栏重绘，闭包里的 t/r/b/l 会过时；用同一数组累积四边，避免改一边再改另一边时覆盖。 */
    const current: number[] = [
      clampPad(Number(t ?? 0)),
      clampPad(Number(r ?? 0)),
      clampPad(Number(b ?? 0)),
      clampPad(Number(l ?? 0)),
    ];
    const emit = () => onChange([...current]);

    const makePlain = (v: number | undefined, idx: number) => {
      const inp = h('input', {
        class: 'sm-input',
        type: 'number',
        min: 0,
        max: 200,
        value: String(v ?? 0),
        title: titles[idx],
        ...(focusPrefix ? { 'data-sm-focus': `${focusPrefix}:${idx}` } : {}),
      }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        const t = inp.value.trim();
        if (t === '') return;
        const raw = Number(t);
        if (Number.isNaN(raw)) return;
        current[idx] = clampPad(raw);
        emit();
      });
      inp.addEventListener('blur', () => {
        const t = inp.value.trim();
        if (t === '') {
          inp.value = String(current[idx]);
          return;
        }
        const raw = Number(t);
        const c = clampPad(Number.isNaN(raw) ? current[idx] : raw);
        inp.value = String(c);
        current[idx] = c;
        emit();
      });
      inp.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') inp.blur();
      });
      return inp;
    };

    const makeSliderRow = (v: number | undefined, idx: number) => {
      const cur = clampPad(v ?? 0);
      const range = h('input', {
        type: 'range',
        min: 0,
        max: 200,
        step: 1,
        value: String(cur),
        title: titles[idx],
      }) as HTMLInputElement;

      range.addEventListener('input', () => {
        const c = clampPad(Number(range.value));
        current[idx] = c;
        num.value = String(c);
        emit();
      });

      const num = h('input', {
        class: 'sm-input',
        type: 'number',
        min: 0,
        max: 200,
        value: String(cur),
        title: titles[idx],
        ...(focusPrefix ? { 'data-sm-focus': `${focusPrefix}:${idx}` } : {}),
      }) as HTMLInputElement;

      num.addEventListener('input', () => {
        const t = num.value.trim();
        if (t === '') return;
        const rawN = Number(t);
        if (Number.isNaN(rawN)) return;
        const c = clampPad(rawN);
        range.value = String(c);
        current[idx] = c;
        emit();
      });

      num.addEventListener('blur', () => {
        const t = num.value.trim();
        if (t === '') {
          num.value = String(current[idx]);
          range.value = String(current[idx]);
          return;
        }
        const rawN = Number(t);
        const c = clampPad(Number.isNaN(rawN) ? current[idx] : rawN);
        num.value = String(c);
        range.value = String(c);
        current[idx] = c;
        emit();
      });

      num.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') num.blur();
      });

      return h('div', { class: 'sm-spacing-row' }, [
        h('span', { class: 'sm-spacing-row__axis' }, [titles[idx]]),
        range,
        num,
      ]);
    };

    return h('div', { class: 'sm-field' }, [
      h('div', { class: 'sm-spacing-field__label-row' }, [
        h('label', { class: 'sm-field__label' }, [`${label}（上/右/下/左）`]),
        resetQuad
          ? h(
              'button',
              {
                type: 'button',
                class: 'sm-btn sm-btn--ghost sm-spacing-field__reset',
                onclick: () => {
                  const next = resetQuad.map((n) => clampPad(Number(n)));
                  for (let i = 0; i < 4; i++) current[i] = next[i];
                  onChange([...current]);
                },
              },
              ['恢复默认'],
            )
          : null,
      ]),
      this._preferSliderControls()
        ? h(
            'div',
            { class: 'sm-spacing-rows' },
            [0, 1, 2, 3].map((idx) => makeSliderRow([t, r, b, l][idx], idx)),
          )
        : h(
            'div',
            { class: 'sm-spacing-grid' },
            [0, 1, 2, 3].map((idx) => makePlain([t, r, b, l][idx], idx)),
          ),
    ]);
  }

  /** 「继承全局」开关行：开=跟随邮件全局，关=块级固定值 */
  private _globalInheritSwitch(
    inheritOn: boolean,
    globalDisplay: string,
    onToggle: (inherit: boolean) => void,
    focusToken?: string,
  ): { el: HTMLElement; setInherit: (on: boolean, display?: string) => void } {
    const input = h('input', {
      type: 'checkbox',
      class: 'sm-inherit-switch__input',
      role: 'switch',
      ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
      ...(inheritOn ? { checked: true } : {}),
    }) as HTMLInputElement;
    const valueEl = h('span', {
      class: 'sm-inherit-switch__value',
      hidden: !inheritOn,
    }, [globalDisplay]);
    const el = h('div', { class: 'sm-inherit-switch' }, [
      h('label', { class: 'sm-inherit-switch__label' }, [
        input,
        h('span', { class: 'sm-inherit-switch__text' }, ['继承全局']),
      ]),
      valueEl,
    ]);
    input.addEventListener('change', () => onToggle(input.checked));
    const setInherit = (on: boolean, display?: string) => {
      input.checked = on;
      if (display !== undefined) valueEl.textContent = display;
      valueEl.hidden = !on;
    };
    return { el, setInherit };
  }

  private _fontWeightInheritField(
    label: string,
    stored: string,
    globalWeight: string,
    onChange: (v: string) => void,
    focusToken: string,
    options: { label: string; value: string }[],
    help?: string,
  ): HTMLElement {
    let inheriting = !stored;
    const group = h('div', {
      class: 'sm-segmented sm-segmented--fill',
      role: 'group',
      'aria-label': label,
    });

    const syncGroup = () => {
      group.classList.toggle('sm-segmented--disabled', inheriting);
      const display = inheriting ? '' : normalizeFontWeightStep(stored || globalWeight);
      clear(group);
      for (const o of options) {
        const active = !inheriting && o.value === display;
        group.append(
          h(
            'button',
            {
              type: 'button',
              class: `sm-segmented__item${active ? ' sm-segmented__item--active' : ''}`,
              'aria-pressed': active ? 'true' : 'false',
              title: o.label,
              ...(focusToken ? { 'data-sm-focus': `${focusToken}:${o.value}` } : {}),
              onclick: () => {
                inheriting = false;
                stored = o.value;
                inheritSwitch.setInherit(false);
                syncGroup();
                onChange(o.value);
              },
            },
            [o.label],
          ),
        );
      }
    };

    const inheritSwitch = this._globalInheritSwitch(
      inheriting,
      globalWeight,
      (on) => {
        if (on) {
          inheriting = true;
          stored = '';
          inheritSwitch.setInherit(true, globalWeight);
          syncGroup();
          onChange('');
          return;
        }
        inheriting = false;
        stored = globalWeight;
        inheritSwitch.setInherit(false);
        syncGroup();
        onChange(globalWeight);
      },
      `${focusToken}:inherit`,
    );

    syncGroup();

    const wrap = h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      inheritSwitch.el,
      group,
    ]);
    if (help) wrap.append(h('div', { class: 'sm-field__help' }, [help]));
    return wrap;
  }

  private _fontSizeInheritTextField(
    label: string,
    stored: string,
    onChange: (v: string) => void,
    focusToken: string,
    globalFontSize: string,
    help?: string,
  ): HTMLElement {
    const globalPx = this._snapFontSizeToPx(globalFontSize);
    let inheriting = !stored.trim();
    const input = h('input', {
      class: 'sm-input',
      type: 'text',
      ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
    }) as HTMLInputElement;

    const syncInput = () => {
      input.disabled = inheriting;
      input.value = inheriting ? '' : stored;
      input.placeholder = inheriting ? '' : '如 16px';
      input.classList.toggle('sm-input--inherit-disabled', inheriting);
    };

    const inheritSwitch = this._globalInheritSwitch(
      inheriting,
      `${globalPx}px`,
      (on) => {
        if (on) {
          inheriting = true;
          stored = '';
          inheritSwitch.setInherit(true, `${globalPx}px`);
          syncInput();
          onChange('');
          return;
        }
        inheriting = false;
        stored = `${globalPx}px`;
        inheritSwitch.setInherit(false);
        syncInput();
        onChange(stored);
      },
      `${focusToken}:inherit`,
    );

    syncInput();

    input.addEventListener('input', () => {
      if (inheriting) return;
      stored = input.value;
      onChange(stored);
    });

    input.addEventListener('blur', () => {
      if (inheriting) return;
      const t = input.value.trim();
      if (!t) {
        stored = `${globalPx}px`;
        input.value = stored;
        onChange(stored);
      }
    });

    const wrap = h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      inheritSwitch.el,
      input,
    ]);
    if (help) wrap.append(h('div', { class: 'sm-field__help' }, [help]));
    return wrap;
  }

  private _snapFontSizeToPx(value: string): number {
    const t = (value ?? '').trim();
    const m = t.match(/^(\d+(\.\d+)?)/);
    if (m) return Math.min(48, Math.max(10, Math.round(parseFloat(m[1]))));
    return 16;
  }

  private _fontSizeSliderField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    focusToken: string,
    help?: string,
    globalFontSize?: string,
  ) {
    const inheritGlobal = globalFontSize !== undefined;
    if (!this._preferSliderControls()) {
      if (inheritGlobal) {
        return this._fontSizeInheritTextField(
          label,
          value,
          onChange,
          focusToken,
          globalFontSize,
          help,
        );
      }
      return this._textField(label, value ?? '', onChange, '', focusToken);
    }

    const min = 10;
    const max = 48;
    const step = 1;
    const snap = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
    const globalPx = snap(this._snapFontSizeToPx(globalFontSize ?? value ?? '16px'));
    let stored = value.trim();
    let inheriting = inheritGlobal && !stored;

    const sliderRow = h('div', { class: 'sm-field__slider-row' });
    const range = h('input', {
      type: 'range',
      min,
      max,
      step,
    }) as HTMLInputElement;
    const num = h('input', {
      class: 'sm-input',
      type: 'number',
      min,
      max,
      step,
      'data-sm-focus': focusToken,
    }) as HTMLInputElement;
    sliderRow.append(range, num);

    const syncSlider = () => {
      sliderRow.classList.toggle('sm-field__slider-row--inherit', inheriting);
      num.disabled = inheriting;
      if (inheriting) {
        range.value = String(globalPx);
        num.value = '';
      } else {
        const s = snap(this._snapFontSizeToPx(stored || `${globalPx}px`));
        range.value = String(s);
        num.value = String(s);
      }
    };

    let inheritSwitch: ReturnType<RightPanel['_globalInheritSwitch']> | null = null;
    if (inheritGlobal) {
      inheritSwitch = this._globalInheritSwitch(
        inheriting,
        `${globalPx}px`,
        (on) => {
          if (on) {
            inheriting = true;
            stored = '';
            inheritSwitch!.setInherit(true, `${globalPx}px`);
            syncSlider();
            onChange('');
            return;
          }
          inheriting = false;
          stored = `${globalPx}px`;
          inheritSwitch!.setInherit(false);
          syncSlider();
          onChange(stored);
        },
        `${focusToken}:inherit`,
      );
    }

    syncSlider();

    const leaveInherit = () => {
      if (!inheriting) return;
      inheriting = false;
      inheritSwitch?.setInherit(false);
      syncSlider();
    };

    range.addEventListener('input', () => {
      leaveInherit();
      const s = snap(Number(range.value));
      num.value = String(s);
      stored = `${s}px`;
      onChange(stored);
    });

    num.addEventListener('input', () => {
      if (inheriting) return;
      const rawN = Number(num.value);
      if (Number.isNaN(rawN)) return;
      range.value = String(snap(rawN));
    });

    num.addEventListener('blur', () => {
      if (inheriting) return;
      const t = num.value.trim();
      const fb = snap(Number(range.value));
      const s = snap(t === '' || Number.isNaN(Number(t)) ? fb : Number(t));
      stored = `${s}px`;
      num.value = String(s);
      range.value = String(s);
      onChange(stored);
    });

    num.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') num.blur();
    });

    const wrap = h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      ...(inheritSwitch ? [inheritSwitch.el] : []),
      sliderRow,
    ]);
    if (help) wrap.append(h('div', { class: 'sm-field__help' }, [help]));
    return wrap;
  }

  private _docFontSizeField(value: string, onChange: (v: string) => void, focusToken: string) {
    return this._fontSizeSliderField(
      '字号',
      value,
      onChange,
      focusToken,
      '滑块与数字均以 px 写入（如 16px）',
    );
  }

  private _layoutWidthField(
    label: string,
    raw: string,
    onChange: (v: string) => void,
    focusToken: string,
    help?: string,
  ) {
    if (!this._preferSliderControls()) {
      const tf = this._textField(label, raw, onChange, '', focusToken);
      if (help) tf.append(h('div', { class: 'sm-field__help' }, [help]));
      return tf;
    }

    const kind = classifyLayoutWidth(raw);
    if (kind === 'custom') {
      const wrap = h('div', { class: 'sm-field' });
      wrap.append(h('label', { class: 'sm-field__label' }, [label]));
      wrap.append(
        h('div', { class: 'sm-field__help' }, [
          '当前值为自定义写法，请直接编辑；清空后可选「自适应」再用滑块。',
        ]),
      );
      wrap.append(
        h('input', {
          class: 'sm-input',
          type: 'text',
          value: raw,
          placeholder: '如 480px、90%',
          'data-sm-focus': focusToken,
          oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
        }),
      );
      if (help) wrap.append(h('div', { class: 'sm-field__help' }, [help]));
      return wrap;
    }

    const mode: 'auto' | 'px' | '%' = kind;
    const max = mode === '%' ? 100 : 1200;
    const min = 1;
    const displayN = mode === 'auto' ? 280 : layoutWidthNumeric(raw, mode === '%' ? '%' : 'px');

    const clampW = (n: number) => Math.max(min, Math.min(max, Math.round(n)));

    const range = h('input', {
      type: 'range',
      min,
      max,
      step: 1,
      value: String(displayN),
      disabled: mode === 'auto',
    }) as HTMLInputElement;

    const num = h('input', {
      class: 'sm-input',
      type: 'number',
      min,
      max,
      step: 1,
      value: String(displayN),
      disabled: mode === 'auto',
      ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
    }) as HTMLInputElement;

    const emitW = (c: number) => {
      const v = clampW(c);
      range.value = String(v);
      num.value = String(v);
      onChange(mode === '%' ? `${v}%` : `${v}px`);
    };

    range.addEventListener('input', () => {
      if (mode === 'auto') return;
      emitW(Number(range.value));
    });

    num.addEventListener('input', () => {
      if (mode === 'auto') return;
      const t = num.value.trim();
      if (t === '') return;
      const rawN = Number(t);
      if (Number.isNaN(rawN)) return;
      range.value = String(clampW(rawN));
    });

    num.addEventListener('blur', () => {
      if (mode === 'auto') return;
      const t = num.value.trim();
      const fb = clampW(Number(range.value));
      if (t === '') {
        emitW(fb);
        return;
      }
      const rawN = Number(t);
      emitW(Number.isNaN(rawN) ? fb : rawN);
    });

    num.addEventListener('keydown', (e) => {
      if (mode === 'auto') return;
      if ((e as KeyboardEvent).key === 'Enter') num.blur();
    });

    const sliderRow = h(
      'div',
      { class: `sm-width-field__slider-row ${mode === 'auto' ? 'is-disabled' : ''}` },
      [range, num],
    );

    const modesWrap = h('div', { class: 'sm-segmented sm-segmented--wrap sm-width-field__modes' });
    const addModeBtn = (m: 'auto' | 'px' | '%', text: string) => {
      modesWrap.append(
        h(
          'button',
          {
            type: 'button',
            class: `sm-segmented__item ${mode === m ? 'sm-segmented__item--active' : ''}`,
            onclick: () => {
              if (m === 'auto') onChange('');
              else if (m === 'px') onChange(`${layoutWidthNumeric(raw, 'px')}px`);
              else onChange(`${layoutWidthNumeric(raw, '%')}%`);
            },
          },
          [text],
        ),
      );
    };
    addModeBtn('auto', '自适应');
    addModeBtn('px', 'px');
    addModeBtn('%', '%');

    const wrap = h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      modesWrap,
      sliderRow,
    ]);
    if (help) wrap.append(h('div', { class: 'sm-field__help' }, [help]));
    return wrap;
  }

  private _docFontWeightField(value: string, onChange: (v: string) => void, focusToken: string) {
    const cur = normalizeFontWeightStep(value);
    return this._segmentedSelectField('字重', cur, FONT_WEIGHT_STEP_OPTIONS, onChange, focusToken);
  }

  private _multiColumnLayoutField(
    layout: SectionLayout,
    onChange: (layout: SectionLayout) => void,
    focusToken: string,
  ) {
    return this._segmentedSelectField(
      '列布局',
      layout,
      [
        { label: '1:1', value: '1-1' },
        { label: '1:2', value: '1-2' },
        { label: '2:1', value: '2-1' },
        { label: '1:1:1', value: '1-1-1' },
      ],
      (v) => onChange(v as SectionLayout),
      focusToken,
    );
  }

  private _renderBlockCodeView(block: Block): HTMLElement {
    const def = this.opts.registry.get(block.type);
    const initial =
      block.lockedMjml ??
      (def ? def.toMjml(block.props as any, { doc: this.opts.store.doc, engine: 'mjml' }) : '');

    const wrap = h('div', { class: 'sm-code-pane' });

    const header = h('div', { class: 'sm-code-pane__header' }, [
      h('div', { class: 'sm-code-pane__title' }, ['编辑组件 MJML 源码']),
    ]);

    const editorHost = h('div', { class: 'sm-code' });

    const view = new EditorView({
      parent: editorHost,
      state: EditorState.create({
        doc: initial,
        extensions: [basicSetup, cmHtml()],
      }),
    });
    this.codeView = view;

    const actions = h('div', { class: 'sm-code-pane__header' }, [
      h(
        'button',
        {
          class: 'sm-btn',
          type: 'button',
          onclick: () => {
            this.opts.store.update((d) => {
              const l = findBlockLocation(d, block.id);
              if (l) delete l.block.lockedMjml;
            });
          },
        },
        ['恢复默认'],
      ),
      h(
        'button',
        {
          class: 'sm-btn sm-btn--primary',
          type: 'button',
          onclick: () => {
            const text = view.state.doc.toString();
            this.opts.store.update((d) => {
              const l = findBlockLocation(d, block.id);
              if (l) l.block.lockedMjml = text;
            });
          },
        },
        ['保存为锁定 MJML'],
      ),
    ]);

    wrap.append(
      header,
      editorHost,
      h('div', { class: 'sm-field__help' }, [
        '保存后该组件将以这段 MJML 直接输出，属性面板会被禁用，可点"恢复默认"取消锁定。',
      ]),
      actions,
    );
    return wrap;
  }

  private _destroyCodeView() {
    if (this.codeView) {
      this.codeView.destroy();
      this.codeView = null;
    }
  }
}
