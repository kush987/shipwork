import type { EffectItemProps, EffectListProps } from './shared.types';

/** "What will happen" list shown in confirmation dialogs. */
export function EffectList({ children }: EffectListProps) {
  return <div className="cancel-effects">{children}</div>;
}

export function EffectItem({ icon: Icon, children }: EffectItemProps) {
  return (
    <div className="cancel-effect">
      <Icon size={14} />
      {children}
    </div>
  );
}
