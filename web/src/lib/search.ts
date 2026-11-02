/**
 * Strips the characters PostgREST reads as syntax from a free-text search term.
 *
 * A term goes into an `.or("name.ilike.%term%,...")` string, where a comma
 * ends the filter and a parenthesis opens a group — so an unfiltered comma
 * turns one search into a different query altogether. `%` and `_` are ilike
 * wildcards and would quietly widen the match.
 */
export function sanitizeSearch(input: string): string {
  return input.replace(/[,().%_*]/g, "");
}
