import config from '@/config/dashboard';
import type { SubmissionKind } from '@/types/dashboard';

/**
 * The client's own submission kinds (config.submissionKinds). Everything that
 * names or counts submissions — the Form Submissions page, the overview's
 * attention items, month counts and latest submissions — reads them from here,
 * so nothing assumes a client takes job applications.
 */
export const submissionKinds: SubmissionKind[] = config.submissionKinds ?? [];

/** Whether the site saves its form submissions to an inbox at all. */
export const hasInbox = submissionKinds.length > 0;

const byKind = new Map(submissionKinds.map((k) => [k.kind, k]));

/** "contact message" / "contact messages" for a stored kind; "submission(s)" for one not configured. */
export function kindLabel(kind: string, count = 1): string {
  const k = byKind.get(kind);
  if (!k) return count === 1 ? 'submission' : 'submissions';
  return count === 1 ? k.singular : k.plural;
}

/** Sentence case, for a badge or column heading. */
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const kindTone = (kind: string): 'primary' | 'accent' => byKind.get(kind)?.tone ?? 'primary';
