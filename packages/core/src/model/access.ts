// Zugangsstufen (PLAN.md 5.4):
//   local – Person direkt an der lokalen Desktop-App (volle Rechte)
//   edit  – Bearbeiten-Passwort bzw. Desktop-Zugangsschlüssel mit Bearbeiten-Stufe
//   read  – Lese-Passwort: ansehen, Packliste abhaken, „fehlt/defekt“ setzen
//   direction – Regie-Passwort: Regie (Ablauf, Texte, …) bearbeiten, alles andere nur lesen
export type Access = 'local' | 'edit' | 'read' | 'direction';

export type Permission =
  | 'editProject'
  | 'checkItems'
  | 'resetChecks'
  | 'restoreVersion'
  | 'manageProjects'
  | 'viewSecrets'
  | 'editShow'
  /** sich als Helfer zu Auftritten an-/abmelden (auch Lesen und Regie, z. B. über den QR-Code) */
  | 'helperSignup';

const READ_PERMISSIONS: ReadonlySet<Permission> = new Set(['checkItems', 'helperSignup']);
const DIRECTION_PERMISSIONS: ReadonlySet<Permission> = new Set(['editShow', 'helperSignup']);

export function can(access: Access, permission: Permission): boolean {
  if (access === 'local' || access === 'edit') return true;
  if (access === 'direction') return DIRECTION_PERMISSIONS.has(permission);
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
    case 'direction':
      return 'Regie';
  }
}
