/**
 * The web team's monthly note (docs/OVERVIEW-STANDARD.md §6.3) is two
 * plain-language parts: what was done (`summary`) and what's coming up
 * (`recommendations`). Lines starting with "- " become a list; anything else
 * is a paragraph.
 */
export interface NoteBlock {
  list: boolean;
  lines: string[];
}

export interface NotePart {
  title: string;
  blocks: NoteBlock[];
}

const BULLET = /^[-•*]\s+/;

export function noteBlocks(text: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const item = BULLET.test(line);
    const last = out[out.length - 1];
    if (item && last?.list) last.lines.push(line.replace(BULLET, ''));
    else out.push({ list: item, lines: [line.replace(BULLET, '')] });
  }
  return out;
}

export function noteParts(note: { summary?: string; recommendations?: string } | null | undefined): NotePart[] {
  if (!note) return [];
  return [
    { title: 'Done this month', blocks: noteBlocks(note.summary ?? '') },
    { title: 'Coming up', blocks: noteBlocks(note.recommendations ?? '') },
  ].filter((p) => p.blocks.length);
}
