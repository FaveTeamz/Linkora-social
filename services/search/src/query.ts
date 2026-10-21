export interface ParsedSearchQuery {
  terms: string[];
  hashtags: string[];
  mentions: string[];
}

const MAX_QUERY_LENGTH = 200;
const SQL_META_CHARACTERS = /[^\p{L}\p{N}_\s#@]/gu;

/** Parse a user search string into safe plain terms, hashtags, and mentions. */
export function parseQuery(input: string): ParsedSearchQuery {
  const query = input.slice(0, MAX_QUERY_LENGTH).replace(SQL_META_CHARACTERS, " ");
  const hashtags = [...query.matchAll(/(?:^|\s)#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]!);
  const mentions = [...query.matchAll(/(?:^|\s)@([\p{L}\p{N}_]+)/gu)].map((match) => match[1]!);
  const terms = query
    .replace(/(?:^|\s)[#@][\p{L}\p{N}_]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);

  return { terms, hashtags, mentions };
}
