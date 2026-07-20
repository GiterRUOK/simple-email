import type { Registry } from '../registry/registry';
import type { Store } from '../store/store';
import { findBlockLocation, findSection } from '../store/store';
import { clear, h } from '../utils/dom';
import type { SectionLayout } from '../types';
import type { SimpleMailT } from '../i18n';

export interface FocusBreadcrumbOptions {
  store: Store;
  registry: Registry;
  /** 文档级根节点文案（如「邮件」/「版式」） */
  docRootLabel: string;
  t: SimpleMailT;
  onFocusDocument: () => void;
  onFocusSection: (sectionId: string) => void;
}

interface CrumbItem {
  label: string;
  current: boolean;
  onClick?: () => void;
}

/**
 * 右栏聚焦路径：邮件 > 一列 > 文本。
 * 点击父级等同 Esc 上浮（块 → Section → 文档级面板）。
 */
export class FocusBreadcrumb {
  el: HTMLElement;
  private opts: FocusBreadcrumbOptions;

  constructor(opts: FocusBreadcrumbOptions) {
    this.opts = opts;
    this.el = h('nav', {
      class: 'sm-focus-crumb',
      'aria-label': opts.t('rightPanel.breadcrumb.selected'),
    });
    opts.store.subscribeSelection(() => this.sync());
    opts.store.subscribe(() => this.sync());
    this.sync();
  }

  setVisible(on: boolean) {
    this.el.hidden = !on;
  }

  sync() {
    clear(this.el);
    const items = this._buildItems();
    if (!items.length) {
      this.el.hidden = true;
      return;
    }
    this.el.hidden = false;

    items.forEach((item, i) => {
      if (i > 0) {
        this.el.append(h('span', { class: 'sm-focus-crumb__sep', 'aria-hidden': 'true' }, ['›']));
      }
      if (item.current || !item.onClick) {
        this.el.append(
          h(
            'span',
            {
              class: `sm-focus-crumb__item sm-focus-crumb__item--current`,
              title: item.label,
            },
            [item.label],
          ),
        );
      } else {
        this.el.append(
          h(
            'button',
            {
              type: 'button',
              class: 'sm-focus-crumb__item',
              title: this.opts.t('rightPanel.breadcrumb.selectTitle', { label: item.label }),
              onclick: () => item.onClick!(),
            },
            [item.label],
          ),
        );
      }
    });
  }

  private _buildItems(): CrumbItem[] {
    const { store, registry, docRootLabel, onFocusDocument, onFocusSection } = this.opts;
    const sel = store.selection;
    const doc = store.doc;

    if (!sel) {
      return [{ label: docRootLabel, current: true }];
    }

    if (sel.kind === 'section') {
      const sec = findSection(doc, sel.sectionId);
      if (!sec) return [{ label: docRootLabel, current: true }];
      return [
        { label: docRootLabel, current: false, onClick: onFocusDocument },
        { label: this._layoutLabel(sec.layout), current: true },
      ];
    }

    const sec = findSection(doc, sel.sectionId);
    const loc = findBlockLocation(doc, sel.blockId);
    if (!sec || !loc) {
      return [{ label: docRootLabel, current: true }];
    }

    const blockName = registry.get(loc.block.type)?.name ?? loc.block.type;
    return [
      {
        label: this._layoutLabel(sec.layout),
        current: false,
        onClick: () => onFocusSection(sel.sectionId),
      },
      { label: blockName, current: true },
    ];
  }

  private _layoutLabel(layout: SectionLayout): string {
    if (layout === '1') return this.opts.t('rightPanel.layout.oneColumn');
    if (layout === '1-1') return this.opts.t('rightPanel.layout.columns');
    return layout;
  }
}
