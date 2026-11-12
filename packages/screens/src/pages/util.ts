export const camelKey = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
