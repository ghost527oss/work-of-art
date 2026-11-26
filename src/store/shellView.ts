// @node: F3.2
// Pure screen navigation for the Studio: Screen 3 (studio), Screen 4 (skeleton), and
// Screen 5 (domain, with one of four areas). The view is plain data so a later sub-phase
// can save it as it is. A move that is not allowed returns the SAME object.
// Imports nothing from React, the engine, or the stores.

export type AreaId = 'frontend' | 'backend' | 'security' | 'api_data';

export const AREAS: ReadonlyArray<{ id: AreaId; label: string }> = [
  { id: 'frontend', label: 'Frontend' },
  { id: 'backend', label: 'Backend' },
  { id: 'security', label: 'Security' },
  { id: 'api_data', label: 'APIs & Data' },
];

export type ShellView = { screen: 'studio' } | { screen: 'skeleton' } | { screen: 'domain'; area: AreaId };

export const INITIAL_VIEW: ShellView = { screen: 'studio' };

export function isAreaId(value: unknown): value is AreaId {
  return AREAS.some((a) => a.id === value);
}

export function areaLabel(area: AreaId): string {
  return AREAS.find((a) => a.id === area)?.label ?? area;
}

/** Allowed from the Studio screen only. */
export function openSkeleton(view: ShellView): ShellView {
  return view.screen === 'studio' ? { screen: 'skeleton' } : view;
}

/** Allowed from Skeleton Crew or from another domain screen. */
export function openDomain(view: ShellView, area: AreaId): ShellView {
  if (view.screen === 'studio' || !isAreaId(area)) return view;
  if (view.screen === 'domain' && view.area === area) return view;
  return { screen: 'domain', area };
}

/** Allowed from a domain screen only. */
export function backToSkeleton(view: ShellView): ShellView {
  return view.screen === 'domain' ? { screen: 'skeleton' } : view;
}

/** Allowed from Skeleton Crew and from a domain screen. */
export function backToStudio(view: ShellView): ShellView {
  return view.screen === 'studio' ? view : INITIAL_VIEW;
}

/** Keeps the view while the Studio is shown, and returns the initial view otherwise. */
export function viewWhenStudio(view: ShellView, isStudio: boolean): ShellView {
  if (isStudio) return view;
  return view.screen === 'studio' ? view : INITIAL_VIEW;
}

/** The toolbar is shown on the Studio screen only. */
export function toolbarVisible(view: ShellView): boolean {
  return view.screen === 'studio';
}
