// Nachrichten an die Technik: Helfer schreiben (keine Antwort), ändern und löschen ihre eigenen;
// Bearbeiten liest alle im Helfer-Bereich (Zähler am Tab, solange ungelesen), kann sie ändern und löschen.
import { Pencil, Send, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type * as Y from 'yjs';
import { formatDateTime } from '../../lib/format';
import { HELPER_MESSAGE_MAX, markHelperMessagesRead, personName, type HelperMessage, type Person } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Banner, Button } from '../ui';

const t = texts.helpers;

const textareaClass = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800';

/** Kleiner Zähler (z. B. am Tab „Helfer“) */
export function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs leading-5 font-semibold text-white" title={label} aria-label={label} data-testid="unread-badge">
      {count}
    </span>
  );
}

/** Auf der Seite eines Helfers: schreiben (nur für sich selbst) und die eigenen Nachrichten */
export function PersonMessages({ projectId, person, messages, canWrite, canEdit }: { projectId: string; person: Person; messages: HelperMessage[]; canWrite: boolean; canEdit: boolean }) {
  const own = messages.filter((m) => m.personId === person.id);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.sendMessage(projectId, person.id, draft);
      setDraft('');
      setNotice(t.sent);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (!canWrite && own.length === 0) return null;
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={t.messagesTitle} data-testid="helper-messages">
      <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{canWrite ? t.messagesTitle : t.personMessages}</h3>
      {canWrite && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">{t.messagesHint}</p>
          <textarea aria-label={t.messagesTitle} rows={3} maxLength={HELPER_MESSAGE_MAX} className={textareaClass} placeholder={t.messagePlaceholder} value={draft} onChange={(e) => (setDraft(e.target.value), setNotice(''))} />
          <div className="flex items-center gap-2">
            <Button variant="primary" disabled={busy || !draft.trim()} onClick={() => void send()}>
              <Send {...ICON} /> {t.send}
            </Button>
            <span role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
              {notice}
            </span>
          </div>
          {error && <Banner tone="error">{error}</Banner>}
        </div>
      )}
      {own.length > 0 && (
        <div className="space-y-2">
          {canWrite && <h4 className="text-xs font-semibold text-slate-500">{t.ownMessages}</h4>}
          <ul className="space-y-2">
            {own.map((m) => (
              <MessageItem key={m.id} projectId={projectId} message={m} canEdit={canEdit} showStatus />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Posteingang für Bearbeiten: alle Nachrichten; was beim Öffnen ungelesen war, wird gelesen und bleibt markiert */
export function MessagesInbox({ projectId, doc, origin, userName, messages, people, onOpen }: { projectId: string; doc: Y.Doc; origin: object; userName: string; messages: HelperMessage[]; people: Person[]; onOpen: (personId: string) => void }) {
  const [openedAt] = useState(() => new Date().toISOString());
  const unread = messages.filter((m) => !m.readAt).map((m) => m.id);
  const unreadKey = unread.join(',');
  useEffect(() => {
    if (unreadKey) markHelperMessagesRead(doc, unreadKey.split(','), userName, origin);
  }, [unreadKey, doc, userName, origin]);
  const byId = new Map(people.map((p) => [p.id, p]));
  return (
    <section className="space-y-2" aria-label={t.inboxTitle} data-testid="messages-inbox">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.inboxTitle}</h2>
      {messages.length === 0 ? (
        <p className="text-sm text-slate-500">{t.noMessages}</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const person = byId.get(m.personId);
            const fresh = !m.readAt || m.readAt >= openedAt;
            return (
              <MessageItem
                key={m.id}
                projectId={projectId}
                message={m}
                canEdit
                fresh={fresh}
                author={
                  person ? (
                    <button type="button" className="cursor-pointer font-semibold text-sky-700 hover:underline dark:text-sky-400" title={t.openPerson(personName(person))} onClick={() => onOpen(person.id)}>
                      {personName(person)}
                    </button>
                  ) : (
                    <span className="font-semibold">?</span>
                  )
                }
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MessageItem({ projectId, message, canEdit, showStatus = false, fresh = false, author }: { projectId: string; message: HelperMessage; canEdit: boolean; showStatus?: boolean; fresh?: boolean; author?: ReactNode }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={`space-y-1.5 rounded-md border p-3 text-sm ${fresh ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950' : 'border-slate-200 dark:border-slate-700'}`} data-testid="helper-message">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {author}
        {fresh && <span className="rounded-full bg-red-600 px-1.5 font-semibold text-white">{t.isNew}</span>}
        <span>{formatDateTime(message.createdAt)}</span>
        {message.updatedAt && <span>({t.edited})</span>}
        {showStatus && <span className={message.readAt ? 'text-emerald-700 dark:text-emerald-400' : ''}>{message.readAt ? `✓ ${t.read}` : t.notRead}</span>}
        <span className="flex-1" />
        {canEdit && editing === null && (
          <>
            <Button variant="ghost" className="min-h-7 px-1.5" aria-label={t.edit} title={t.edit} disabled={busy} onClick={() => setEditing(message.text)}>
              <Pencil {...ICON} />
            </Button>
            <Button
              variant="ghost"
              className="min-h-7 px-1.5"
              aria-label={t.remove}
              title={t.remove}
              disabled={busy}
              onClick={() => {
                if (window.confirm(t.removeConfirm)) void run(() => api.deleteMessage(projectId, message.id));
              }}
            >
              <Trash2 {...ICON} />
            </Button>
          </>
        )}
      </div>
      {editing === null ? (
        <p className="whitespace-pre-wrap">{message.text}</p>
      ) : (
        <div className="space-y-2">
          <textarea aria-label={t.message} rows={3} maxLength={HELPER_MESSAGE_MAX} className={textareaClass} value={editing} onChange={(e) => setEditing(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy || !editing.trim()} onClick={() => void run(() => api.updateMessage(projectId, message.id, editing)).then((ok) => ok && setEditing(null))}>
              {t.save}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}
      {error && <Banner tone="error">{error}</Banner>}
    </li>
  );
}
