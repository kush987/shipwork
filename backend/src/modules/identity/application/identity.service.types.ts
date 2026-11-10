export interface SignupInput {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AddMemberInput {
  email: string;
  /** Built-in (owner, editor, viewer) or a custom role id. */
  role: string;
  name?: string;
}

export interface WorkspaceOwnerInput {
  email: string;
  name: string;
  password: string;
  tenantId: string;
  tenantName: string;
}
