// brand — the SINGLE source of truth for the product's name and tagline.
// Used by the footer, page metadata, the web manifest, and the brand mark, so
// "ぷにぷにQuiz" never drifts into "puni" / "puniquiz" / etc. again. Pure
// constants (no client/runtime deps) so server and client can both import them.

export const PRODUCT_NAME = "ぷにぷにQuiz";
export const PRODUCT_SHORT = "ぷに";
export const PRODUCT_TAGLINE = "みんなで楽しめるライブクイズ";
export const COPYRIGHT_YEAR = 2026;
