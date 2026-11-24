// @node: F2.7
// Re-exports AI_LIMITS so components can import without touching import.meta.env
// (which causes issues in non-browser test environments).
export { AI_LIMITS } from './aiLimits';
