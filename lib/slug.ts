import { Node } from "./types";

const NON_ALPHANUMERIC = /[^a-zA-Z0-9]+/g;

const slugValue = (value: string | null | undefined) => {
  if (!value) return "";
  return value.trim().toLowerCase();
};

export const slugify = (value: string | null | undefined): string => {
  const normalized = slugValue(value)
    .replace(NON_ALPHANUMERIC, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "untitled";
};

export const buildNodeSlugMap = (nodes: Node[]): Record<string, string> => {
  const counts = new Map<string, number>();
  return nodes.reduce<Record<string, string>>((acc, node) => {
    const base = slugify(node.header);
    const nextCount = (counts.get(base) ?? 0) + 1;
    counts.set(base, nextCount);
    acc[node.id] = nextCount === 1 ? base : `${base}-${nextCount}`;
    return acc;
  }, {});
};
