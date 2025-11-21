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
