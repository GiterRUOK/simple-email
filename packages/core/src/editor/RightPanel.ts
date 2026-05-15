import { EditorView, basicSetup } from 'codemirror';
import { html as cmHtml } from '@codemirror/lang-html';
import { EditorState } from '@codemirror/state';
import type { Registry } from '../registry/registry';
import { findBlockLocation, findSection, type Store, type DocChangedDetail } from '../store/store';
import type {
  Block,
  BlockSchemaField,
  EmailDoc,
  Section,
} from '../types';
import { defaultSocialIconBackground } from '../socialDefaults';
import { clear, h } from '../utils/dom';
import { metaWidthInputString, parseMetaWidthFromUserInput, parseSectionWidthFromUserInput, sectionWidthInputString } from '../utils/contentWidth';
import type { ImageAssetsHandlers, ImageFieldContext } from './imageAssets';
import { openImageGalleryModal } from './ImageGalleryModal';

/** 与社交组 block 中每行元素结构一致（core 不依赖 blocks） */
type SocialLinkRow = {
  network: string;
  href: string;
  label?: string;
  iconSrc?: string;
  backgroundColor?: string;
};

export interface RightPanelOptions {
  store: Store;
  registry: Registry;
  /**
   * 可选。配置后，schema 中 `type: 'image'` 的字段会显示「上传 / 图床」按钮并调用对应回调。
   */
  imageAssets?: ImageAssetsHandlers;
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
    opts.store.subscribe((detail?: DocChangedDetail) => {
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
      this.currentTab = 'props';
      this._render();
    });
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
    if (!loc) {
      const tabs = h('div', { class: 'sm-tabs' }, [
        this._tabBtn('props', '属性'),
        this._tabBtn('code', '代码'),
      ]);
      this.el.append(tabs);
      this.el.append(
        h('div', { class: 'sm-empty-form' }, ['该组件可能已被删除，请重新选中画布中的块。']),
      );
      return;
    }
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
      this._textField(
        '字号',
        doc.styles.fontSize,
        (v) =>
          this.opts.store.update((d) => {
            d.styles.fontSize = v;
          }),
        '',
        'doc:styles.fontSize',
      ),
      this._selectField(
        '字重',
        doc.styles.fontWeight ?? 'normal',
        [
          { label: '常规', value: 'normal' },
          { label: '中等 500', value: '500' },
          { label: '半粗 600', value: '600' },
          { label: '加粗 700', value: 'bold' },
        ],
        (v) =>
          this.opts.store.update((d) => {
            d.styles.fontWeight = v;
          }),
        'doc:styles.fontWeight',
      ),
      this._textField(
        '行高',
        doc.styles.lineHeight ?? '1.5',
        (v) =>
          this.opts.store.update((d) => {
            d.styles.lineHeight = v;
          }),
        '如 1.5 或 24px',
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
    ]);
  }

  /* ------------------------------ Section 表单 ----------------------------- */

  private _renderSectionForm(section: Section): HTMLElement {
    const a = section.attrs;
    return h('form', { class: 'sm-form', onsubmit: (e: Event) => e.preventDefault() }, [
      h('div', { class: 'sm-panel__title' }, ['Section 设置']),
      this._colorField(
        '背景色',
        a.backgroundColor ?? '',
        (v) =>
          this.opts.store.update((d) => {
            const s = findSection(d, section.id);
            if (s) s.attrs.backgroundColor = v || undefined;
          }),
        `section:${section.id}:attrs.bg`,
      ),
      this._textField(
        '区域宽度',
        sectionWidthInputString(a.width),
        (v) =>
          this.opts.store.update((d) => {
            const s = findSection(d, section.id);
            if (s) s.attrs.width = parseSectionWidthFromUserInput(v);
          }),
        '留空=与邮件同宽；如 480px、90%',
        `section:${section.id}:attrs.width`,
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
    const value = (block.props as any)[field.key];
    const onChange = (v: any) => this._updateBlock(blockId, field.key, v);

    switch (field.type) {
      case 'textarea':
        return this._textareaField(field.label, value ?? '', onChange, field.help, fp);
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
      case 'color':
        return this._colorField(field.label, value ?? '', onChange, fp);
      case 'select':
        return this._selectField(field.label, value ?? '', field.options ?? [], onChange, fp);
      case 'switch':
        return this._switchField(field.label, !!value, onChange, field.help, fp);
      case 'image':
        return this._imageField(
          field.label,
          value ?? '',
          onChange,
          field.placeholder ?? 'https://',
          fp,
          { blockId, propKey: field.key },
        );
      case 'url':
      case 'text': {
        const row = this._textField(field.label, value ?? '', onChange, field.placeholder ?? '', fp);
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
        return this._spacingField(field.label, quad, (vals) => {
          this.opts.store.update((d) => {
            const loc = findBlockLocation(d, blockId);
            if (!loc) return;
            const pr = loc.block.props as Record<string, number>;
            [pr.paddingTop, pr.paddingRight, pr.paddingBottom, pr.paddingLeft] = vals;
          });
        }, `${fp}:pad`);
      }
      case 'socialLinkList':
        return this._socialLinkListField(
          field.label,
          Array.isArray(value) ? (value as SocialLinkRow[]) : [],
          field.options ?? [],
          blockId,
          field.key,
          field.help,
          fp,
        );
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
        h('input', {
          class: 'sm-social-link-list__color sm-social-link-list__color--compact',
          type: 'color',
          title: '图标背景色',
          value: bgDisplay.length >= 4 ? bgDisplay : bgResolved,
          ...(focusPrefix ? { 'data-sm-focus': `${focusPrefix}:row:${i}:bg` } : {}),
          oninput: (e: Event) =>
            syncItem(i, { backgroundColor: (e.target as HTMLInputElement).value }),
        }),
      );
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
  ) {
    const ta = h('textarea', {
      class: 'sm-textarea',
      ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
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
    focusToken?: string,
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
        ...(focusToken ? { 'data-sm-focus': focusToken } : {}),
        oninput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (!Number.isNaN(v)) onChange(v);
        },
      }),
    ]);
  }
  private _colorField(
    label: string,
    value: string,
    onChange: (v: string) => void,
    focusPrefix?: string,
  ) {
    const pickToken = focusPrefix ? `${focusPrefix}:pick` : undefined;
    const textToken = focusPrefix ? `${focusPrefix}:text` : undefined;
    return h('div', { class: 'sm-field' }, [
      h('label', { class: 'sm-field__label' }, [label]),
      h('div', { class: 'sm-color-row' }, [
        h('input', {
          type: 'color',
          value: value || '#ffffff',
          ...(pickToken ? { 'data-sm-focus': pickToken } : {}),
          oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
        }),
        h('input', {
          class: 'sm-input',
          type: 'text',
          value,
          placeholder: '#ffffff',
          ...(textToken ? { 'data-sm-focus': textToken } : {}),
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
  ) {
    const make = (v: number | undefined, idx: number) =>
      h('input', {
        class: 'sm-input',
        type: 'number',
        min: 0,
        max: 200,
        value: String(v ?? 0),
        title: ['上', '右', '下', '左'][idx],
        ...(focusPrefix ? { 'data-sm-focus': `${focusPrefix}:${idx}` } : {}),
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
