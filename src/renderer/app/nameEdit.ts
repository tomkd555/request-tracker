/** The store saves the trimmed name, so a trailing space alone is no edit. */
export const isNameEdited = (typed: string, saved: string): boolean => typed.trim() !== saved;
