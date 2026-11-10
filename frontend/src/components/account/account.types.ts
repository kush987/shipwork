export interface MenuPosition {
  left: number;
  bottom: number;
}

export interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}
