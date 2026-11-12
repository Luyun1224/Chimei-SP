/**
 * 「尋找中」SP：排程時 SP 名單可能尚未確定。
 * 以「教案×還缺人數」記錄於排程，例如「氣切×1、心導管×2」（試算表上可直接閱讀）。
 */
export interface Seeking {
  topic: string;
  need: number;
}

export function parseSeeking(text: string | undefined): Seeking[] {
  return String(text || '')
    .split('、')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = /^(.*)×(\d+)$/.exec(x);
      return m ? { topic: m[1].trim(), need: Number(m[2]) } : { topic: x, need: 1 };
    })
    .filter((x) => x.topic && x.need > 0);
}

export function formatSeeking(list: Seeking[]): string {
  return list.filter((x) => x.topic && x.need > 0).map((x) => `${x.topic}×${x.need}`).join('、');
}

export const seekingTotal = (text: string | undefined) => parseSeeking(text).reduce((n, x) => n + x.need, 0);
