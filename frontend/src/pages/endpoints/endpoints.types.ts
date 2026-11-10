import type { ApiEndpoint, AuthProvider, EndpointInput, EndpointUpdateInput, Workflow } from '../../api/types';

/** Code samples the "Call it" card offers. */
export type SnippetKind = 'curl' | 'fetch';

/** Applies a partial change to an endpoint draft. */
export type EndpointPatch = (patch: Partial<EndpointInput>) => void;

export interface EndpointDraftRules {
  /** The editor needs a workflow; the "New endpoint" modal can create one. */
  workflowRequired: boolean;
}

export interface EndpointFieldsProps {
  value: EndpointInput;
  onChange: EndpointPatch;
  workflows: Workflow[] | undefined;
  /** Sign-in providers, for JWT auth (undefined while loading). */
  providers: AuthProvider[] | undefined;
  /** Offer "Create a new workflow for me" (empty workflowId) — only when creating. */
  allowNewWorkflow?: boolean;
  autoFocus?: boolean;
}

/** Props of the components that show one endpoint (status badges, cards, editor, rows). */
export interface EndpointViewProps {
  endpoint: ApiEndpoint;
}

export interface EndpointRowProps extends EndpointViewProps {
  onOpen: () => void;
}

export interface AuthorizerFieldsProps {
  value: EndpointInput;
  onChange: EndpointPatch;
  workflows: Workflow[] | undefined;
}

export interface ProviderSelectProps {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  providers: AuthProvider[] | undefined;
}

export interface TestTokenShortcutProps {
  provider: AuthProvider;
  onToken: (token: string) => void;
}

export interface TryItConsoleProps extends EndpointViewProps {
  /** The editor has unsaved changes; calls still go to the saved version. */
  stale?: boolean;
}

export interface NewEndpointModalProps {
  open: boolean;
  onClose: () => void;
}

export interface UpdateEndpointOptions {
  /** No success toast (the caller shows its own). */
  silent?: boolean;
}

export interface UpdateEndpointVariables {
  id: string;
  input: EndpointUpdateInput;
}
