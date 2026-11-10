/** Limits for what a workspace can rename a built-in step to. */
export const EDIT_LIMITS = { label: 60, description: 300 } as const;

/** An icon name the builder knows (kebab-case, as in the palette's icon set). */
export const ICON_NAME = /^[a-z][a-z0-9-]{0,39}$/;

/** Pinned versions never change, so their logic is cached (bounded). */
export const EDIT_CACHE_LIMIT = 500;
