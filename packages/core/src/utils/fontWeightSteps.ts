/** 全局与各组件字重：固定五档，便于右栏平铺或步进滑块 */
export const FONT_WEIGHT_STEP_VALUES = ['300', '400', '500', '600', '700'] as const;
export type FontWeightStep = (typeof FONT_WEIGHT_STEP_VALUES)[number];

export const FONT_WEIGHT_STEP_OPTIONS: { label: string; value: string }[] = FONT_WEIGHT_STEP_VALUES.map(
  (v) => ({ label: v, value: v }),
);

/** 将任意历史写法映射到最近一档（normal→400，bold→700 等） */
export function normalizeFontWeightStep(raw: string | undefined | null): FontWeightStep {
  const s = String(raw ?? '400').trim().toLowerCase();
  if (s === '' || s === 'normal' || s === 'regular') return '400';
  if (s === 'bold' || s === 'bolder') return '700';
  if (s === 'lighter') return '300';
  const match = /^(\d+)(\.\d+)?$/.exec(s);
  if (match) {
    const n = parseInt(match[1], 10);
    const steps = [300, 400, 500, 600, 700];
    let best: FontWeightStep = '400';
    let bestD = Infinity;
    for (const st of steps) {
      const d = Math.abs(n - st);
      if (d < bestD) {
        bestD = d;
        best = String(st) as FontWeightStep;
      }
    }
    return best;
  }
  return '400';
}
