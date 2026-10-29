// Scores one extraction against a hand-written answer key. Amounts decide a match: a line is found when the
// model returned the same amount (to the cent), preferring a line of the same kind. Used by scripts/eval.ts.

export type ExpectedLine = { description: string; amountKes: number; kind?: string };
export type Expected = { file: string; entries: ExpectedLine[]; writtenTotalKes?: number | null; note?: string };
export type GotLine = { description: string; amountKes: number; kind: string };

export function score(expected: ExpectedLine[], got: GotLine[]) {
  const left = [...got];
  let matched = 0;
  let kindRight = 0;
  const missed: ExpectedLine[] = [];
  for (const want of expected) {
    const same = (g: GotLine) => Math.abs(g.amountKes - want.amountKes) < 0.005;
    const i = left.findIndex((g) => same(g) && (!want.kind || g.kind === want.kind));
    const j = i >= 0 ? i : left.findIndex(same);
    if (j < 0) {
      missed.push(want);
      continue;
    }
    matched++;
    if (!want.kind || left[j].kind === want.kind) kindRight++;
    left.splice(j, 1);
  }
  return {
    expected: expected.length,
    got: got.length,
    matched,
    recall: expected.length === 0 ? 1 : matched / expected.length,
    kindAccuracy: matched === 0 ? 1 : kindRight / matched,
    missed,
    extra: left, // lines the model returned that aren't on the page (or have a wrong amount)
    allAmountsRight: matched === expected.length && left.length === 0,
  };
}
