import Sortable from 'sortablejs';
import type { SimpleMailT } from '../i18n';
import type { Registry } from '../registry/registry';
import type { BlockDefinition, PaletteGroupKey, SectionLayout } from '../types';
import { clear, h } from '../utils/dom';
import { paletteDropIsSectionLevel } from '../utils/paletteDrop';

export interface LeftPanelOptions {
  registry: Registry;
  t: SimpleMailT;
  /** 合并后的组件分组标题 */
  blockGroupTitle?: string;
  /** custom 类块默认 tooltip 后缀（无 paletteTooltip 时） */
  customPaletteTooltipSuffix?: string;
  /** 不显示在左栏的 block type（仍可在 Registry 中 createBlock） */
  hiddenPaletteBlockTypes?: string[];
  /** 左栏分组顺序，未列出的组按默认顺序跟在后面 */
  paletteGroupOrder?: PaletteGroupKey[];
  /** 组件组卡片顺序（block type），可跨 content / custom 混排 */
  paletteBlockOrder?: string[];
  /** 组合布局组卡片顺序（block type） */
  paletteSectionBlockOrder?: string[];
  /** 与画布一致：开启后带 `sectionAttrs.dynamicVariantKey` 的组合块会创建独立 Section */
  enableDynamicVariantKey?: boolean;
}

interface LayoutCard {
  layout: SectionLayout;
  nameKey: string;
  icon: string;
  titleKey?: string;
}

const LAYOUT_CARDS: LayoutCard[] = [
  { layout: '1', nameKey: 'leftPanel.oneColumn', icon: layoutSvg([1]) },
  /** 默认 1:1；1:2 / 2:1 / 1:1:1 在选中 Section 后于右栏「列布局」切换 */
  {
    layout: '1-1',
    nameKey: 'leftPanel.multiColumn',
    icon: layoutSvg([1, 1]),
    titleKey: 'leftPanel.multiColumnTitle',
  },
];

/**
 * 左栏分两类：
 *  - 布局（layout）：决定 Section 结构，拖入到画布顶层（group: 'sections'）
 *  - 组件：内置与 custom 合并为一组，作为 Block 拖入 Column（group: 'blocks'）
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
    // 先合并两个类别，拆分后的组件组仍可跨 content / custom 按 type 混排
    const paletteBlocks = [
      ...filterPalette(this.opts.registry.byCategory('content')),
      ...filterPalette(this.opts.registry.byCategory('custom')),
    ];

    /** 自带布局的组件与布局卡片同组，拖拽时只能落在 Section 之间（见 paletteDropIsSectionLevel） */
    const sectionLevel: BlockDefinition[] = [];
    const blockLevel: BlockDefinition[] = [];
    const dropOpts = { enableDynamicVariantKey: this.opts.enableDynamicVariantKey };
    for (const def of paletteBlocks) {
      if (paletteDropIsSectionLevel(def, this.opts.registry, dropOpts)) sectionLevel.push(def);
      else blockLevel.push(def);
    }

    // 分组先收集再排序，未列出的组保持默认相对顺序
    const groups: { key: PaletteGroupKey; el: HTMLElement }[] = [
      { key: 'layout', el: this._renderLayoutGroup() },
    ];
    if (sectionLevel.length) {
      groups.push({
        key: 'sectionBlocks',
        el: this._renderBlockCardsGroup(
          this.opts.t('leftPanel.sectionBlocks'),
          stableOrderBy(sectionLevel, this.opts.paletteSectionBlockOrder, (d) => d.type),
          'sections',
        ),
      });
    }
    if (blockLevel.length) {
      groups.push({
        key: 'components',
        el: this._renderBlockCardsGroup(
          this.opts.blockGroupTitle ?? this.opts.t('leftPanel.components'),
          stableOrderBy(blockLevel, this.opts.paletteBlockOrder, (d) => d.type),
          'blocks',
        ),
      });
    }

    const wrap = h('div', { class: 'sm-blocks' });
    for (const group of stableOrderBy(groups, this.opts.paletteGroupOrder, (g) => g.key)) {
      wrap.append(group.el);
    }
    this.el.append(wrap);
  }

  private _renderLayoutGroup(): HTMLElement {
    const grid = h('div', { class: 'sm-blocks__grid' });
    for (const c of LAYOUT_CARDS) {
      const name = this.opts.t(c.nameKey);
      grid.append(
        h(
          'div',
          {
            class: 'sm-block-card',
            'data-source-group': 'sections',
            'data-layout': c.layout,
            title: c.titleKey ? this.opts.t(c.titleKey) : name,
          },
          [
            h('span', { class: 'sm-block-card__icon', html: c.icon }),
            h('span', { class: 'sm-block-card__name' }, [name]),
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
      h('div', { class: 'sm-panel__title' }, [this.opts.t('leftPanel.layout')]),
      grid,
    ]);
  }

  private _blockCardTitle(def: BlockDefinition): string {
    if (def.paletteTooltip?.trim()) return def.paletteTooltip.trim();
    if (def.category === 'custom') {
      const suffix =
        this.opts.customPaletteTooltipSuffix ?? this.opts.t('leftPanel.customTooltipSuffix');
      return `${def.name} — ${suffix}`;
    }
    return def.name;
  }

  /**
   * 组件卡片网格。`sourceGroup` 决定画布哪一层接收：
   *  - `blocks`：列内（Column）；
   *  - `sections`：Section 之间（自带布局的组件，表现与布局卡片一致）。
   */
  private _renderBlockCardsGroup(
    title: string,
    defs: BlockDefinition[],
    sourceGroup: 'blocks' | 'sections',
  ): HTMLElement {
    const grid = h('div', { class: 'sm-blocks__grid' });
    for (const def of defs) {
      const isCustom = def.category === 'custom';
      const children: HTMLElement[] = [];
      if (isCustom) {
        children.push(h('span', { class: 'sm-block-card__dot', 'aria-hidden': 'true' }));
      }
      children.push(
        h('span', { class: 'sm-block-card__icon', html: def.icon }),
        h('span', { class: 'sm-block-card__name' }, [def.name]),
      );
      grid.append(
        h(
          'div',
          {
            class:
              sourceGroup === 'sections' ? 'sm-block-card sm-block-card--section' : 'sm-block-card',
            'data-source-group': sourceGroup,
            'data-block-type': def.type,
            title: this._blockCardTitle(def),
          },
          children,
        ),
      );
    }
    Sortable.create(grid, {
      group: { name: sourceGroup, pull: 'clone', put: false },
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

/** 按 type / key 列表稳定排序：未列出的保持原相对顺序并排在末尾。 */
function stableOrderBy<T>(
  items: T[],
  order: string[] | undefined,
  keyOf: (item: T) => string,
): T[] {
  if (!order?.length) return items;
  const rank = new Map<string, number>();
  order.forEach((key, index) => rank.set(key, index));
  return items
    .map((item, index) => ({
      item,
      index,
      rank: rank.get(keyOf(item)) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map(({ item }) => item);
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
