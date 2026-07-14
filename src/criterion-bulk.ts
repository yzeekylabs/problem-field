import {
  decisionCriteriaMaxTotal,
  decisionCriterionMaxLength,
  type DecisionCriterion,
} from "./shared/workspace.ts";

export type CriterionDraft = Pick<DecisionCriterion, "id" | "statement">;

export { decisionCriteriaMaxTotal, decisionCriterionMaxLength };

const listMarker = /^\s*(?:(?:[-*]\s+\[[ xX]\])|(?:\[[ xX]\])|[-*•‣▪◦–—]|\d{1,3}[.)])\s+(.*)$/;
const fieldHeading = /^(?:continue|reconsider)\s+if\s*:?$/i;

export function parseCriterionBulk(value: string): string[] {
  const lines = value.split(/\r?\n/);
  const hasListMarkers = lines.some((line) => listMarker.test(line));

  if (!hasListMarkers) {
    return lines
      .map((line) => line.trim())
      .filter((line) => Boolean(line) && !fieldHeading.test(line));
  }

  const statements: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) statements.push(current.trim());
    current = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const marked = rawLine.match(listMarker);
    if (marked) {
      flush();
      current = marked[1].trim();
    } else if (!current && fieldHeading.test(line)) {
      continue;
    } else if (current) {
      current = `${current} ${line}`;
    } else {
      current = line;
    }
  }
  flush();
  return statements;
}

export function formatCriterionBulk(criteria: CriterionDraft[]): string {
  return criteria.map((criterion) => `• ${criterion.statement.replace(/\s+/g, " ").trim()}`).join("\n");
}

export function reconcileCriterionBulk(
  value: string,
  existing: CriterionDraft[],
  createId: () => string = () => `criterion-${crypto.randomUUID()}`,
): CriterionDraft[] {
  const statements = parseCriterionBulk(value);
  const usedIds = new Set<string>();
  const drafts: Array<CriterionDraft | undefined> = statements.map((statement) => {
    const exact = existing.find((criterion) => criterion.statement === statement && !usedIds.has(criterion.id));
    if (!exact) return undefined;
    usedIds.add(exact.id);
    return { id: exact.id, statement };
  });

  return drafts.map((draft, index) => {
    if (draft) return draft;
    const positional = existing[index];
    if (positional && !usedIds.has(positional.id)) {
      usedIds.add(positional.id);
      return { id: positional.id, statement: statements[index] };
    }
    return { id: createId(), statement: statements[index] };
  });
}
