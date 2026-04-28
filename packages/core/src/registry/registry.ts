import type { Block, BlockDefinition } from '../types';

/**
 * 组件注册表。所有内置/自定义组件都通过 `defineBlock` 注册进来；
 * 渲染、属性面板、左栏拖拽源、组件级代码模式四方都从这里读取。
 */
export class Registry {
  private map = new Map<string, BlockDefinition<any>>();

  register<P extends object>(def: BlockDefinition<P>) {
    if (this.map.has(def.type)) {
      console.warn(`[simple-mail] block type 重复注册: ${def.type}，后注册的会覆盖前者`);
    }
    this.map.set(def.type, def as BlockDefinition<any>);
    return this;
  }

  get(type: string): BlockDefinition | undefined {
    return this.map.get(type);
  }

  /** 必须能找到，否则抛出。渲染/属性面板都用它，未注册即 bug。 */
  require(type: string): BlockDefinition {
    const def = this.map.get(type);
    if (!def) throw new Error(`[simple-mail] 未注册的 block type: ${type}`);
    return def;
  }

  list(): BlockDefinition[] {
    return [...this.map.values()];
  }

  byCategory(category: BlockDefinition['category']): BlockDefinition[] {
    return this.list().filter((d) => d.category === category);
  }

  /** 用注册表里的默认 props 创建一个新 block 实例。 */
  createBlock(type: string): Block {
    const def = this.require(type);
    return {
      id: cryptoRandomId(),
      type,
      props: structuredClone(def.defaultProps),
    };
  }
}

function cryptoRandomId() {
  const ts = Date.now().toString(36).slice(-4);
  const rand = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `blk_${ts}${rand}`;
}

/** 工厂函数，便于外部以函数式风格定义组件。 */
export function defineBlock<P extends object>(def: BlockDefinition<P>): BlockDefinition<P> {
  return def;
}
