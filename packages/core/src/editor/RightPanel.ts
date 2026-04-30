import { EditorView, basicSetup } from 'codemirror';
import { html as cmHtml } from '@codemirror/lang-html';
import { EditorState } from '@codemirror/state';
import type { Registry } from '../registry/registry';
import { findBlockLocation, findSection } from '../store/store';
import type { Store } from '../store/store';
import type {
  Block,
  BlockSchemaField,
  EmailDoc,
  Section,
} from '../types';
import { clear, h } from '../utils/dom';

export interface RightPanelOptions {
  store: Store;
  registry: Registry;
}

type RightTab = 'props' | 'code';

/**
 * 右栏：选中 Section/Block 时显示对应配置；未选中显示文档级配置（标题/宽度/全局样式）。
 * Block 选中时多一个"代码"Tab，可编辑该 Block 的 MJML 片段（CodeMirror）。
 */
export class RightPanel {
  el: HTMLElement;
  private opts: RightPanelOptions;
  private currentTab: RightTab = 'props';
  private codeView: EditorView | null = null;

  constructor(opts: RightPanelOptions) {
    this.opts = opts;
    this.el = h('aside', { class: 'sm-panel sm-panel--right' });
    this._render();
    opts.store.subscribe(() => this._render());
    opts.store.subscribeSelection(() => {
      this.currentTab = 'props';
      this._render();
    });
  }

  private _render() {
    this._destroyCodeView();
    clear(this.el);

    const sel = this.opts.store.selection;
    const doc = this.opts.store.doc;

    if (!sel) {
      this.el.append(this._renderDocForm(doc));
      return;
    }

    if (sel.kind === 'section') {
      const section = findSection(doc, sel.sectionId);
      if (!section) return;
      this.el.append(this._renderSectionForm(section));
      return;
    }

    // block
    const loc = findBlockLocation(doc, sel.blockId);
    if (!loc) return;
    const def = this.opts.registry.get(loc.block.type);

    const tabs = h('div', { class: 'sm-tabs' }, [
      this._tabBtn('props', '属性'),
      this._tabBtn('code', '代码'),
    ]);
    this.el.append(tabs);

    if (this.currentTab === 'props') {
      if (loc.block.lockedMjml) {
        this.el.append(
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
        this.el.append(this._renderBlockForm(loc.block, def.schema));
      } else {
        this.el.append(
          h('div', { class: 'sm-empty-form' }, [`未注册的组件: ${loc.block.type}`]),
        );
      }
    } else {
      this.el.append(this._renderBlockCodeView(loc.block));
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
    return h('form', { class: 'sm-form', onsubmit: (e: Event) => e.preventDefault() }, [
      h('div', { class: 'sm-panel__title' }, ['邮件设置']),
      this._textField('主题', doc.meta.subject, (v) =>
        this.opts.store.update((d) => {
          d.meta.subject = v;
        }),
      ),
      this._textField('Preheader', doc.meta.preheader ?? '', (v) =>
        this.opts.store.update((d) => {
          d.meta.preheader = v;
        }),
      ),
      this._numberField('内容宽度 (px)', doc.meta.width, 320, 800, (v) =>
        this.opts.store.update((d) => {
          d.meta.width = v;
        }),
      ),
      h('div', { class: 'sm-panel__title' }, ['全局样式']),
      this._colorField('页面背景', doc.styles.backgroundColor, (v) =>
        this.opts.store.update((d) => {
          d.styles.backgroundColor = v;
        }),
      ),
      this._colorField('内容背景', doc.styles.contentBackgroundColor, (v) =>
        this.opts.store.update((d) => {
          d.styles.contentBackgroundColor = v;
        }),
      ),
      this._textField('字体', doc.styles.fontFamily, (v) =>
        this.opts.store.update((d) => {
          d.styles.fontFamily = v;
        }),
      ),
      this._textField('字号', doc.styles.fontSize, (v) =>
        this.opts.store.update((d) => {
          d.styles.fontSize = v;
        }),
      ),
      this._colorField('正文颜色', doc.styles.color, (v) =>
        this.opts.store.update((d) => {
          d.styles.color = v;
        }),
      ),
      this._colorField('链接颜色', doc.styles.linkColor, (v) =>
        this.opts.store.update((d) => {
          d.styles.linkColor = v;
        }),
      ),
    ]);
  }

  /* ------------------------------ Section 表单 ----------------------------- */

  private _renderSectionForm(section: Section): HTMLElement {
    const a = section.attrs;
    return h('form', { class: 'sm-form', onsubmit: (e: Event) => e.preventDefault() }, [
      h('div', { class: 'sm-panel__title' }, ['Section 设置']),
      this._colorField('背景色', a.backgroundColor ?? '', (v) =>
        this.opts.store.update((d) => {
          const s = findSection(d, section.id);
          if (s) s.attrs.backgroundColor = v || undefined;
        }),
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
      ),
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
          )
        : null,
    ]);
  }

  /* ------------------------------- Block 表单 ----------------------------- */

  private _renderBlockForm(block: Block, schema: BlockSchemaField[]): HTMLElement {
    const form = h('form', { class: 'sm-form', onsubmit: (e: Event) => e.preventDefault() });
    for (const field of schema) {
      const v = (block.props as any)[field.key];
      form.append(this._field(field, v, (nv) => this._updateBlock(block.id, field.key, nv)));
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

  private _field(
    field: BlockSchemaField,
    value: any,
    onChange: (v: any) => void,
  ): HTMLElement {
    switch (field.type) {
      case 'textarea':
        return this._textareaField(field.label, value ?? '', onChange, field.help);
      case 'number':
        return this._numberField(
          field.label,
          Number(value ?? 0),
          field.min ?? 0,
          field.max ?? 9999,
          onChange,
          field.step ?? 1,
        );
      case 'color':
        return this._colorField(field.label, value ?? '', onChange);
      case 'select':
        return this._selectField(field.label, value ?? '', field.options ?? [], onChange);
      case 'switch':
        return this._switchField(field.label, !!value, onChange);
      case 'image':
      case 'url':
      case 'text':
        return this._textField(field.label, value ?? '', onChange, field.placeholder);
      case 'spacing':
        return this._spacingField(
          field.label,
          (value ?? [0, 0, 0, 0]) as (number | undefined)[],
          (vals) => onChange(vals),
        );
      default:
        return h('div');
    }
  }

  /* --------------------------------- 控件 --------------------------------- */

  private _textField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder = '',
  ) {
    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      h('input', {
        class: 'sm-input',
        type: 'text',
        value,
        placeholder,
        oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
      }),
    ]);
  }
  private _textareaField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    help?: string,
  ) {
    const ta = h('textarea', {
      class: 'sm-textarea',
      oninput: (e: Event) => onChange((e.target as HTMLTextAreaElement).value),
    });
    ta.value = value;
    return h(
      'div',
      { class: 'sm-field' },
      [
        h('label', { class: 'sm-field__label' }, [label]),
        ta,
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
  ) {
    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      h('input', {
        class: 'sm-input',
        type: 'number',
        value: String(value),
        min,
        max,
        step,
        oninput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (!Number.isNaN(v)) onChange(v);
        },
      }),
    ]);
  }
  private _colorField(label: string, value: string, onChange: (v: string) => void) {
    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      h('div', { class: 'sm-color-row' }, [
        h('input', {
          type: 'color',
          value: value || '#ffffff',
          oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
        }),
        h('input', {
          class: 'sm-input',
          type: 'text',
          value,
          placeholder: '#ffffff',
          oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
        }),
      ]),
    ]);
  }
  private _selectField(
    label: string,
    value: string,
    options: { label: string; value: string }[],
    onChange: (v: string) => void,
  ) {
    const sel = h('select', {
      class: 'sm-select',
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
  private _switchField(
    label: string,
    value: boolean,
    onChange: (v: boolean) => void,
    help?: string,
  ): HTMLElement {
    const row = h('label', {
      class: 'sm-field',
      style: 'flex-direction:row;align-items:center;gap:8px;',
    }, [
      h('input', {
        type: 'checkbox',
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
  ) {
    const make = (v: number | undefined, idx: number) =>
      h('input', {
        class: 'sm-input',
        type: 'number',
        min: 0,
        max: 200,
        value: String(v ?? 0),
        title: ['上', '右', '下', '左'][idx],
        oninput: (e: Event) => {
          const next = [t ?? 0, r ?? 0, b ?? 0, l ?? 0];
          next[idx] = Number((e.target as HTMLInputElement).value) || 0;
          onChange(next);
        },
      });
    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [`${label}（上/右/下/左）`]),
      h('div', { class: 'sm-spacing-grid' }, [
        make(t, 0),
        make(r, 1),
        make(b, 2),
        make(l, 3),
      ]),
    ]);
  }

  /* ----------------------------- Block 代码视图 ---------------------------- */

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
