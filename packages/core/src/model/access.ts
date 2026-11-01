// Zugangsstufen (PLAN.md 5.4):
//   local – Person direkt an der lokalen Desktop-App (volle Rechte)
//   edit  – Bearbeiten-Passwort bzw. Desktop-Zugangsschlüssel mit Bearbeiten-Stufe
//   read  – Lese-Passwort: ansehen, Packliste abhaken, „fehlt/defekt“ setzen
export type Access = 'local' | 'edit' | 'read';

export type Permission =
  | 'editProject'
  | 'checkItems'
  | 'resetChecks'
  | 'restoreVersion'
  | 'manageProjects'
  | 'viewSecrets';

const READ_PERMISSIONS: ReadonlySet<Permission> = new Set(['checkItems']);

export function can(access: Access, permission: Permission): boolean {
  if (access === 'local' || access === 'edit') return true;
  return READ_PERMISSIONS.has(permission);
}

export function accessLabel(access: Access): string {
  switch (access) {
    case 'local':
      return 'Desktop';
    case 'edit':
      return 'Bearbeiten';
    case 'read':
      return 'Nur lesen + abhaken';
  }
}
