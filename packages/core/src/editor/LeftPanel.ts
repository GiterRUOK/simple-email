import Sortable from 'sortablejs';
import type { Registry } from '../registry/registry';
import type { BlockDefinition, SectionLayout } from '../types';
import { clear, h } from '../utils/dom';

export interface LeftPanelOptions {
  registry: Registry;
  /** 左栏分组标题；未传 category 时使用内置默认文案 */
  categoryLabels?: Partial<Record<BlockDefinition['category'], string>>;
  /** 不显示在左栏的 block type（仍可在 Registry 中 createBlock） */
  hiddenPaletteBlockTypes?: string[];
}

const DEFAULT_CATEGORY_LABELS: Record<BlockDefinition['category'], string> = {
  content: '内容',
  custom: '自定义',
};

interface LayoutCard {
  layout: SectionLayout;
  name: string;
  icon: string;
}

const LAYOUT_CARDS: LayoutCard[] = [
  { layout: '1', name: '一列', icon: layoutSvg([1]) },
  /** 默认 1:1；1:2 / 2:1 在选中 Section 后于右栏「列比例」切换 */
  { layout: '1-1', name: '两列', icon: layoutSvg([1, 1]) },
  { layout: '1-1-1', name: '三列', icon: layoutSvg([1, 1, 1]) },
];

/**
 * 左栏分两类：
 *  - 布局（layout）：决定 Section 结构，拖入到画布顶层（group: 'sections'）
 *  - 内容/自定义：作为 Block，拖入到 Column 中（group: 'blocks'）
 *
 * 通过 SortableJS 的 group + clone + sort:false 实现。
 * 这两个组分开，画布顶层只接 'sections'，列内只接 'blocks'，
 * 严格两层拖拽，禁止跨级别——这是解决 GrapesJS 嵌套混乱的核心。
 */
export class LeftPanel {
  el: HTMLElement;
  private opts: LeftPanelOptions;

  constructor(opts: LeftPanelOptions) {
    this.opts = opts;
    this.el = h('aside', { class: 'sm-panel sm-panel--left' });
    this._render();
  }

  refresh() {
    this._render();
  }

  private _render() {
    clear(this.el);
    const hiddenPalette = new Set(this.opts.hiddenPaletteBlockTypes ?? []);
    const filterPalette = (defs: BlockDefinition[]) =>
      defs.filter((d) => !hiddenPalette.has(d.type));
    const content = filterPalette(this.opts.registry.byCategory('content'));
    const custom = filterPalette(this.opts.registry.byCategory('custom'));

    const wrap = h('div', { class: 'sm-blocks' });

    wrap.append(this._renderLayoutGroup());
    const labels = { ...DEFAULT_CATEGORY_LABELS, ...this.opts.categoryLabels };
    if (content.length) wrap.append(this._renderBlockGroup(labels.content, content));
    if (custom.length) wrap.append(this._renderBlockGroup(labels.custom, custom));

    this.el.append(wrap);
  }

  private _renderLayoutGroup(): HTMLElement {
    const grid = h('div', { class: 'sm-blocks__grid' });
    for (const c of LAYOUT_CARDS) {
      grid.append(
        h(
          'div',
          {
            class: 'sm-block-card',
            'data-source-group': 'sections',
            'data-layout': c.layout,
            title: c.name,
          },
          [
            h('span', { class: 'sm-block-card__icon', html: c.icon }),
            h('span', { class: 'sm-block-card__name' }, [c.name]),
          ],
        ),
      );
    }
    Sortable.create(grid, {
      group: { name: 'sections', pull: 'clone', put: false },
      sort: false,
      animation: 120,
      ghostClass: 'sm-ghost',
      chosenClass: 'sm-chosen',
      dragClass: 'sm-drag',
    });
    return h('section', { class: 'sm-blocks__group' }, [
      h('div', { class: 'sm-panel__title' }, ['布局']),
      grid,
    ]);
  }

  private _renderBlockGroup(title: string, defs: BlockDefinition[]): HTMLElement {
    const grid = h('div', { class: 'sm-blocks__grid' });
    for (const def of defs) {
      grid.append(
        h(
          'div',
          {
            class: 'sm-block-card',
            'data-source-group': 'blocks',
            'data-block-type': def.type,
            title: def.name,
          },
          [
            h('span', { class: 'sm-block-card__icon', html: def.icon }),
            h('span', { class: 'sm-block-card__name' }, [def.name]),
          ],
        ),
      );
    }
    Sortable.create(grid, {
      group: { name: 'blocks', pull: 'clone', put: false },
      sort: false,
      animation: 120,
      ghostClass: 'sm-ghost',
      chosenClass: 'sm-chosen',
      dragClass: 'sm-drag',
    });
    return h('section', { class: 'sm-blocks__group' }, [
      h('div', { class: 'sm-panel__title' }, [title]),
      grid,
    ]);
  }
}

function layoutSvg(parts: number[]): string {
  const total = parts.reduce((s, x) => s + x, 0);
  const w = 24;
  const gap = 1;
  const innerW = w - gap * (parts.length - 1);
  let x = 0;
  const rects = parts
    .map((p) => {
      const rw = (p / total) * innerW;
      const rect = `<rect x="${x}" y="6" width="${rw.toFixed(
        2,
      )}" height="12" fill="currentColor" opacity="0.8" rx="1"/>`;
      x += rw + gap;
      return rect;
    })
    .join('');
  return `<svg width="24" height="24" viewBox="0 0 24 24">${rects}</svg>`;
}
