/**
 * Normalizes topics from a query string or request body into a list of
 * unique, non-empty, trimmed strings. Accepts a single string, an array,
 * or nothing.
 */
export function normalizeTopics(rawTopics: unknown): string[] {
    const list: unknown[] = Array.isArray(rawTopics)
        ? rawTopics
        : (rawTopics === undefined || rawTopics === null ? [] : [rawTopics])

    return [...new Set(list
        .filter((topic): topic is string => typeof topic === 'string')
        .map(topic => topic.trim())
        .filter(topic => topic.length > 0))]
}
