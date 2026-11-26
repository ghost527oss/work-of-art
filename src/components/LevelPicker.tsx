// @node: F9.9
// The three reading-level buttons with aria-pressed.
import type { Level } from '../skillbook/playbookSchema';

export const LEVELS: Array<{ id: Level; label: string }> = [
  { id: 'simple', label: 'Simple' },
  { id: 'practical', label: 'Practical' },
  { id: 'deeper', label: 'Deeper' },
];

export function LevelPicker({ level, onLevel }: { level: Level; onLevel(level: Level): void }) {
  return (
    <div className="level-picker" role="group" aria-label="Reading level">
      {LEVELS.map((l) => (
        <button key={l.id} type="button" aria-pressed={level === l.id} onClick={() => onLevel(l.id)}>{l.label}</button>
      ))}
    </div>
  );
}
