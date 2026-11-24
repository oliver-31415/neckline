import { useEffect, useState } from 'preact/hooks';
import { settings, updateSettings } from '../lib/store';
import { Block } from '../components/ui';
import { MenuRow } from '../components/Menu';
import { ActionRow, ToggleRow } from '../components/rows';
import { TextRow } from '../forms/LogCards';
import { PROVIDERS, currentConfig, listModels, type ProviderId } from '../ai/agent';
import { testAssistant } from './Assistant';

/** Settings → Assistant: which AI service, its key and model. Keys stay on this phone. */
export function AiSettings() {
  const a = settings.value.ai;
  const p = PROVIDERS[a.provider];
  const set = (patch: Partial<typeof a>) => updateSettings({ ai: { ...settings.value.ai, ...patch } });
  const setFor = (k: 'keys' | 'models' | 'endpoints', v: string) => set({ [k]: { ...settings.value.ai[k], [a.provider]: v } });
  const model = a.models[a.provider] || p.defaultModel;
  const [loaded, setLoaded] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [custom, setCustom] = useState('');

  // Fill the model menu from the service once there's a key (no tokens used).
  const cfg = currentConfig() ?? (a.keys[a.provider] ? { provider: a.provider, endpoint: a.endpoints[a.provider] || p.endpoint, model: model || 'x', apiKey: a.keys[a.provider] } : null);
  useEffect(() => {
    setLoaded([]);
    if (!cfg?.apiKey || !cfg.endpoint) return;
    const t = setTimeout(() => listModels(cfg).then(setLoaded).catch(() => {}), 500);
    return () => clearTimeout(t);
  }, [a.provider, cfg?.apiKey, cfg?.endpoint]);

  const extra = loaded.filter((m) => !p.models.includes(m));
  const items = [
    ...p.models.map((m) => ({ v: m, label: m, section: p.models.length ? 'Suggested' : undefined })),
    ...extra.map((m) => ({ v: m, label: m, section: p.models.length ? 'More' : undefined })),
    { v: 'type', label: 'Type a model name…', action: true },
  ];

  return (
    <Block title="Assistant" flush>
      <MenuRow
        label="Service" display={p.label} value={[a.provider]}
        items={(Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({ v: id, label: PROVIDERS[id].label }))}
        onChange={([provider]) => set({ provider: provider as ProviderId })}
      />
      {a.provider === 'other' && <TextRow label="Address" type="url" placeholder="https://…/v1" value={a.endpoints.other ?? ''} onInput={(v) => setFor('endpoints', v.trim())} />}
      <TextRow label="API key" type="password" placeholder={p.keyPlaceholder} value={a.keys[a.provider] ?? ''} onInput={(v) => setFor('keys', v.trim())} />
      {typing
        ? <TextRow label="Model" placeholder="model name" value={custom} autoFocus onInput={setCustom} onDone={() => { if (custom.trim()) setFor('models', custom.trim()); setTyping(false); setCustom(''); }} />
        : <MenuRow label="Model" placeholder="Choose" display={model || undefined} value={model ? [model] : []} items={items} onChange={([m]) => setFor('models', m)} onAction={() => setTyping(true)} />}
      <ToggleRow label="Share my notes" checked={a.notes} onChange={(notes) => set({ notes })} />
      <ActionRow label="Test connection" disabled={!currentConfig()} onClick={testAssistant} />
    </Block>
  );
}
