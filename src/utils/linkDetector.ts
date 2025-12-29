const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

export function extractFirstLink(text: string): string | null {
  const matches = text.match(URL_REGEX);
  return matches ? matches[0] : null;
}

export function hasLink(text: string): boolean {
  return URL_REGEX.test(text);
}
