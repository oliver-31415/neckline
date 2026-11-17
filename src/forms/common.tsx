import { POSTURES } from '../lib/catalog';
import { ACTIVITY_ART, ActivityFallback, POSTURE_ART, IconTrash, IconPlus } from '../components/Icons';
import { closeSheet } from '../lib/nav';
import { removeEntry, saveEntry } from '../lib/store';
import { showToast } from '../components/ui';
import type { Entry } from '../lib/types';

const IconPlusBig = () => <span style={{ width: 56, height: 56, display: 'grid', placeItems: 'center' }}><span style={{ width: 28, height: 28 }}><IconPlus /></span></span>;

export function PostureTiles({ options, value, onChange, single }: { options: string[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  return (
    <div class="tiles">
      {options.map((p) => {
        const Art = POSTURE_ART[p] ?? ActivityFallback;
        const on = value.includes(p);
        return (
          <button key={p} class={'tile' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onChange(single ? (on ? [] : [p]) : on ? value.filter((x) => x !== p) : [...value, p])}>
            <Art />
            {POSTURES[p]?.label ?? p}
          </button>
        );
      })}
    </div>
  );
}

export function ActivityTiles({ options, value, onChange, single, onAdd }: { options: string[]; value: string[]; onChange: (v: string[]) => void; single?: boolean; onAdd?: (v: string) => void }) {
  const extra = value.filter((v) => !options.includes(v));
  return (
    <div class="tiles">
      {[...options, ...extra].map((a) => {
        const Art = ACTIVITY_ART[a] ?? ActivityFallback;
        const on = value.includes(a);
        return (
          <button key={a} class={'tile' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onChange(single ? (on ? [] : [a]) : on ? value.filter((x) => x !== a) : [...value, a])}>
            <Art />
            {a}
          </button>
        );
      })}
      {onAdd && (
        <button class="tile" style={{ borderStyle: 'dashed', color: 'var(--accent)' }} onClick={() => {
          const v = prompt('Name this activity')?.trim();
          if (v) { onAdd(v); onChange(single ? [v] : [...value, v]); }
        }}>
          <IconPlusBig />
          Other…
        </button>
      )}
    </div>
  );
}

/** Save + close + friendly toast with undo for brand-new entries. */
export async function commit(e: Entry, isNew: boolean, label = 'Saved') {
  const saved = await saveEntry(e);
  closeSheet();
  navigator.vibrate?.(12);
  showToast(label, isNew ? { label: 'Undo', run: () => removeEntry(saved.id) } : undefined);
}

export function FormFooter({ isNew, id, onSave, saveLabel = 'Save' }: { isNew: boolean; id: string; onSave: () => void; saveLabel?: string }) {
  return (
    <>
      {!isNew && (
        <button class="btn danger" aria-label="Delete entry" onClick={async () => {
          if (confirm('Delete this entry?')) { await removeEntry(id); closeSheet(); showToast('Deleted'); }
        }}>
          <IconTrash />
        </button>
      )}
      <button class="btn primary wide" onClick={onSave}>{saveLabel}</button>
    </>
  );
}
