export interface TourStep { key: string; route: string; target: string }

/** Guided demo on the real UI: twin -> run -> replay -> fix -> compare. */
export const TOUR: TourStep[] = [
  { key: 'twin', route: '/', target: '[data-tour="twin"]' },
  { key: 'run', route: '/attack', target: '[data-tour="run"]' },
  { key: 'replay', route: '/attack', target: '[data-tour="replay"]' },
  { key: 'fix', route: '/remediation', target: '[data-tour="fix"]' },
  { key: 'compare', route: '/remediation', target: '[data-tour="compare"]' },
]
