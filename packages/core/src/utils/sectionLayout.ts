import type { SectionLayout } from '../types';

const LAYOUT_LABELS: Record<SectionLayout, string> = {
  '1': '一列',
  '1-1': '两列',
  '1-2': '1:2',
  '2-1': '2:1',
  '1-1-1': '三列',
};

export function layoutHumanLabel(layout: SectionLayout): string {
  return LAYOUT_LABELS[layout] ?? layout;
}
