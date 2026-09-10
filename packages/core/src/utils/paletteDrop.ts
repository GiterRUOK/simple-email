import type { Registry } from '../registry/registry';
import type { BlockDefinition, PaletteDropResult } from '../types';

/**
 * palette 拖入语义的判定。
 *
 * 画布是四层模型（Section → Column → Block），左栏也分两组：
 *  - `sections`：布局卡片，落在 Section 之间；
 *  - `blocks`：组件卡片，落在 Column 内。
 *
 * 自带布局的组件（如一次生成双列 Section 的卡组）实际会新建 Section，
 * 若仍归到 `blocks`，拖拽时会显示「可放进列内」的占位，松手却落到该 Section 之后，
 * 与预期不符。这里统一判定，让它与布局卡片同组，拖拽表现与布局一致。
 */

/** 拖入结果是否自带 Section 布局（多列布局 / 多列分发） */
export function paletteDropHasSectionLayout(drop: PaletteDropResult): boolean {
  if (drop.sectionLayout && drop.sectionLayout !== '1') return true;
  return (drop.columnBlocks?.length ?? 0) > 1;
}

/** 解析 palette 拖入结果：未声明 `expandPaletteDrop` 时按单块处理 */
export function resolvePaletteDropResult(
  def: BlockDefinition,
  registry: Registry,
): PaletteDropResult {
  if (def.expandPaletteDrop) {
    const out = def.expandPaletteDrop((t) => registry.createBlock(t));
    return Array.isArray(out) ? { blocks: out } : out;
  }
  return { blocks: [registry.createBlock(def.type)] };
}

/** 该 palette 卡片是否按「布局」处理：只能落在 Section 之间，不能落进 Column */
export function paletteDropIsSectionLevel(
  def: BlockDefinition,
  registry: Registry,
  opts?: { enableDynamicVariantKey?: boolean },
): boolean {
  if (def.paletteDropLevel) return def.paletteDropLevel === 'section';
  if (!def.expandPaletteDrop) return false;
  const drop = resolvePaletteDropResult(def, registry);
  if (paletteDropHasSectionLayout(drop)) return true;
  /** 开启动态变量节时，带 dynamicVariantKey 的组合块同样会新建独立 Section */
  return opts?.enableDynamicVariantKey === true && !!drop.sectionAttrs?.dynamicVariantKey;
}
