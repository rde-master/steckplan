// Passwortprüfung: Passwörter werden beim Start mit scrypt gehasht und nur als Hash im Speicher gehalten.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Access } from '@steckplan/core';

const KEY_LENGTH = 32;

interface Hashed {
  salt: Buffer;
  hash: Buffer;
}

function hash(password: string, salt: Buffer = randomBytes(16)): Hashed {
  return { salt, hash: scryptSync(password.normalize('NFC'), salt, KEY_LENGTH) };
}

function matches(password: string, stored: Hashed): boolean {
  const candidate = scryptSync(password.normalize('NFC'), stored.salt, KEY_LENGTH);
  return timingSafeEqual(candidate, stored.hash);
}

/** Gespeicherter Passwort-Hash (z. B. in den Desktop-Einstellungen) – nie das Passwort selbst. */
export interface StoredPassword {
  salt: string;
  hash: string;
}

export function hashForStorage(password: string): StoredPassword {
  const h = hash(password);
  return { salt: h.salt.toString('hex'), hash: h.hash.toString('hex') };
}

/**
 * Prüft Bearbeiten-, Lese- und (optional) Regie-Passwort; alle werden immer geprüft (gleichbleibende Laufzeit).
 * Ohne Regie-Passwort gibt es keinen Regie-Zugang.
 */
export class PasswordChecker {
  private readonly edit: Hashed;
  private readonly read: Hashed;
  private readonly direction: Hashed | null;

  constructor(
    passwords:
      | { edit: string; read: string; direction?: string | undefined }
      | { stored: { edit: StoredPassword; read: StoredPassword; direction?: StoredPassword | undefined } },
  ) {
    if ('stored' in passwords) {
      const from = (s: StoredPassword): Hashed => ({ salt: Buffer.from(s.salt, 'hex'), hash: Buffer.from(s.hash, 'hex') });
      this.edit = from(passwords.stored.edit);
      this.read = from(passwords.stored.read);
      this.direction = passwords.stored.direction ? from(passwords.stored.direction) : null;
    } else {
      this.edit = hash(passwords.edit);
      this.read = hash(passwords.read);
      this.direction = passwords.direction ? hash(passwords.direction) : null;
    }
  }

  /** Gibt es einen Regie-Zugang? */
  get hasDirection(): boolean {
    return this.direction !== null;
  }

  /** true, wenn das Passwort eines der beiden ist (z. B. um gleiche Passwörter zu verhindern). */
  matchesAny(password: string): boolean {
    return this.check(password) !== null;
  }

  check(password: string): Exclude<Access, 'local'> | null {
    const isEdit = matches(password, this.edit);
    const isRead = matches(password, this.read);
    const isDirection = this.direction ? matches(password, this.direction) : false;
    if (isEdit) return 'edit';
    if (isDirection) return 'direction';
    if (isRead) return 'read';
    return null;
  }
}

/**
 * Fingerabdruck der Passwörter (scrypt mit fester Salt pro Installation).
 * Ändern sich die Passwörter, ändert sich der Fingerabdruck → alle Sitzungen werden beendet.
 */
export function passwordFingerprint(passwords: { edit: string; read: string; direction?: string | undefined }, installSalt: string): string {
  // ohne Regie-Passwort derselbe Fingerabdruck wie bisher (bestehende Sitzungen bleiben gültig)
  const text = passwords.direction ? `${passwords.edit}\u0000${passwords.read}\u0000${passwords.direction}` : `${passwords.edit}\u0000${passwords.read}`;
  return scryptSync(text.normalize('NFC'), installSalt, KEY_LENGTH).toString('hex');
}
