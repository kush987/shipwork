import { AlertTriangle, ExternalLink, MousePointerClick, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DATA_PATHS_LIST_ID } from '../components/config-form/config-form.constants';
import { ConfigFields } from '../components/config-form/ConfigFields';
import { useRuntimeLists } from '../components/config-form/useRuntimeLists';
import { Button, Field } from '../components/ui';
import { nodeIcon } from '../lib/icons';
import { CATEGORY_LABEL } from '../lib/icons.constants';
import { DATA_PATHS, FETCH_NODE_TYPE, PLACEHOLDER_FIELD_KINDS } from './builder.constants';
import { DataHints } from './DataHints';
import { StepLogicEditor } from './StepLogicEditor';
import { canHaveLogic } from './builder.helpers';
import type { InspectorProps } from './builder.types';
import { FetchTester } from './FetchTester';
import { NoSettingsNote } from './InspectorNotes';

export function Inspector({
  node,
  events,
  readOnly,
  onChange,
  onDelete,
  dataPaths = [],
  hintPaths = [],
  triggerKind = 'event',
  onClose,
}: InspectorProps) {
  // Data nodes pick a collection or data source; the lists load only when the selected node needs them.
  const lists = useRuntimeLists(node?.data.def?.configSchema);

  if (!node) {
    return (
      <aside className="inspector">
        <div className="inspector-empty">
          <MousePointerClick size={22} />
          <div className="empty-title">Nothing selected</div>
          <p className="empty-desc">Select a node to configure it. Connect outputs on the right to inputs on the left.</p>
          <div className="kbd-hints">
            <div>
              <kbd>Del</kbd> remove selection
            </div>
            <div>
              <kbd>Scroll</kbd> zoom · <kbd>Drag</kbd> pan
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const def = node.data.def;
  const Icon = nodeIcon(def?.icon, def?.category);
  const cfg = node.data.config ?? {};
  const setCfg = (key: string, value: unknown) => {
    const config = { ...cfg, [key]: value };
    // A trigger still named after its old event would mislead ("Shipment created" that starts on Refund):
    // follow the event, unless the user gave it a name of their own.
    if (def?.isTrigger && key === 'event') {
      const labelOf = (v: unknown) => events.find((e) => e.value === v)?.label;
      const autoNamed = !node.data.name || node.data.name === def.label || node.data.name === labelOf(cfg.event);
      const next = labelOf(value);
      if (autoNamed && next) return onChange(node.id, { config, name: next });
    }
    onChange(node.id, { config });
  };

  return (
    <aside className="inspector">
      <div className={`inspector-head cat-${def?.category ?? 'flow'}`}>
        <div className="fnode-icon">
          <Icon size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="inspector-kind">
            {def ? CATEGORY_LABEL[def.category] : 'Unknown'} · <span className="mono">{node.data.nodeType}</span>
          </div>
          <div className="inspector-title">{def?.label ?? node.data.nodeType}</div>
        </div>
        {onClose && (
          <button type="button" className="icon-btn panel-close" onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        )}
      </div>
      {def?.description && <p className="inspector-desc">{def.description}</p>}
      {def?.custom && (
        <div className="inspector-custom">
          <span>
            {node.data.typeVersion ? `Pinned to v${node.data.typeVersion}` : `Runs the latest version (v${def.custom.version})`}
            {node.data.typeVersion && node.data.typeVersion < def.custom.version ? ` · v${def.custom.version} available on republish` : ''}
          </span>
          <Link to={`/custom-nodes/${def.custom.id}`} className="link-inline" target="_blank" rel="noreferrer">
            Edit logic <ExternalLink size={12} />
          </Link>
        </div>
      )}

      {(node.data.errors?.length ?? 0) > 0 && (
        <div className="inspector-errors">
          {node.data.errors!.map((e, i) => (
            <div key={i}>
              <AlertTriangle size={13} /> {e}
            </div>
          ))}
        </div>
      )}

      <div className="inspector-body">
        <fieldset disabled={readOnly} className="form-stack">
          <Field label="Name">
            <input
              className="input"
              value={node.data.name}
              placeholder={def?.label}
              onChange={(e) => onChange(node.id, { name: e.target.value })}
            />
          </Field>

          {def && (
            <ConfigFields
              fields={def.configSchema}
              values={cfg}
              onChange={setCfg}
              events={events}
              lists={lists}
              readOnly={readOnly}
              keyPrefix={node.id}
            />
          )}
          {node.data.nodeType === FETCH_NODE_TYPE && (
            <FetchTester config={cfg} readOnly={readOnly} onExtractChange={(extract) => setCfg('extract', extract)} />
          )}
          {def && !def.isTrigger && def.configSchema.some((f) => PLACEHOLDER_FIELD_KINDS.includes(f.kind)) && (
            <DataHints
              stepPaths={hintPaths}
              triggerKind={triggerKind}
              nodeType={node.data.nodeType}
              readOnly={readOnly}
              onUseBody={(body) => setCfg('body', body)}
            />
          )}
          {def?.edit?.logic && (
            <p className="field-help workspace-logic-note">
              Every “{def.label}” step in this workspace also runs workspace logic (v{def.edit.version}) around its own ·{' '}
              <Link to={`/custom-nodes/builtin/${encodeURIComponent(def.type)}`} className="link-inline" target="_blank" rel="noreferrer">
                see it
              </Link>
            </p>
          )}
          {def && canHaveLogic(def) && (
            <StepLogicEditor def={def} logic={node.data.logic} readOnly={readOnly} onChange={(logic) => onChange(node.id, { logic })} />
          )}
          <datalist id={DATA_PATHS_LIST_ID}>
            {[...dataPaths, ...DATA_PATHS].map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {def && def.configSchema.length === 0 && <NoSettingsNote triggerKind={def.triggerKind} />}

          {def && def.outputs.length > 1 && (
            <div className="field">
              <span className="field-label">Outputs</span>
              <div className="output-list">
                {def.outputs.map((o) => (
                  <span key={o.id} className={`output-chip out-${o.id}`}>
                    {o.label || o.id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </fieldset>
      </div>

      {!readOnly && (
        <div className="inspector-footer">
          <span className="mono small muted">{node.id}</span>
          <Button variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(node.id)}>
            Delete node
          </Button>
        </div>
      )}
    </aside>
  );
}
