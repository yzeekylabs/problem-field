type DisplayCopyLike = {
  title: string;
  summary: string;
};

type CardCopyLike = {
  title: string;
  body: string;
  display?: DisplayCopyLike;
};

type ProjectCopyLike = {
  name: string;
  question: string;
  display?: DisplayCopyLike;
};

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function compactAtWord(value: string, maxLength: number) {
  const clean = normalize(value);
  if (clean.length <= maxLength) return clean;
  const candidate = clean.slice(0, Math.max(1, maxLength - 1));
  const wordBoundary = candidate.lastIndexOf(" ");
  const shortened = wordBoundary > Math.floor(maxLength * 0.55)
    ? candidate.slice(0, wordBoundary)
    : candidate;
  return `${shortened.trimEnd()}…`;
}

function leadingParagraph(value: string) {
  return value.split(/\n\s*\n/)[0] ?? value;
}

export function getCardDisplayCopy(card: CardCopyLike): DisplayCopyLike {
  if (card.display) return card.display;
  return {
    title: compactAtWord(card.title, 60),
    summary: compactAtWord(leadingParagraph(card.body) || "No detail yet.", 120),
  };
}

export function getProjectDisplayCopy(project: ProjectCopyLike): DisplayCopyLike {
  if (project.display) return project.display;
  return {
    title: compactAtWord(project.name, 60),
    summary: compactAtWord(project.question, 120),
  };
}

export function getCompactLabel(value: string, maxLength = 48) {
  return compactAtWord(value, maxLength);
}
