import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MAX_SETTINGS } from './customNodes.constants';
import { duplicateSetting, newSetting, settingProblems } from './customNodes.helpers';
import type { SettingsSectionProps } from './customNodes.types';
import { Section } from './Section';
import { SettingCard } from './SettingCard';

export function SettingsSection({ settings, onChange, events, lockedKeys, classic }: SettingsSectionProps) {
  // One setting is expanded at a time; the rest show a one-line summary.
  const [open, setOpen] = useState<number | null>(null);
  const problems = useMemo(() => settingProblems(settings, classic), [settings, classic]);
  const keys = settings.map((f) => f.key);

  const replace = (i: number, next: typeof settings[number]) => onChange(settings.map((f, j) => (j === i ? next : f)));
  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= settings.length) return;
    const next = [...settings];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    if (open === i) setOpen(j);
    else if (open === j) setOpen(i);
  };
  const duplicate = (i: number) => {
    onChange([...settings.slice(0, i + 1), duplicateSetting(settings[i], keys), ...settings.slice(i + 1)]);
    setOpen(i + 1);
  };
  const remove = (i: number) => {
    onChange(settings.filter((_, j) => j !== i));
    if (open === i) setOpen(null);
    else if (open !== null && open > i) setOpen(open - 1);
  };
  const add = () => {
    onChange([...settings, newSetting()]);
    setOpen(settings.length);
  };

  return (
    <Section
      step={2}
      title="Settings"
      description={
        <>
          Fields people fill in when they add this node to a workflow. Your code reads them as <span className="mono">config.&lt;key&gt;</span>.
        </>
      }
    >
      {settings.length === 0 && <p className="muted small cn-empty">No settings — the node works without configuration.</p>}
      <div className="cn-settings">
        {settings.map((f, i) => (
          <SettingCard
            key={i}
            setting={f}
            index={i}
            count={settings.length}
            open={open === i}
            problems={problems[i]}
            events={events}
            keyLocked={lockedKeys.includes(f.key)}
            onToggle={() => setOpen(open === i ? null : i)}
            onChange={(next) => replace(i, next)}
            onMove={(delta) => move(i, delta)}
            onDuplicate={() => duplicate(i)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>
      {settings.length < MAX_SETTINGS ? (
        <button type="button" className="link-inline" onClick={add}>
          <Plus size={13} /> Add setting
        </button>
      ) : (
        <p className="muted small">A node can have at most {MAX_SETTINGS} settings.</p>
      )}
    </Section>
  );
}
