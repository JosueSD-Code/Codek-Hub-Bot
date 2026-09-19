'use client';

import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../lib/api';

const defaultForm = {
  welcomeEnabled: false,
  welcomeChannelId: '',
  welcomeTitle: '',
  welcomeDescription: '',
  vouchEnabled: false,
  vouchChannelId: '',
  vouchCooldown: 60,
  logEnabled: false,
  logChannelId: '',
  automodEnabled: false,
  automodBannedWords: '',
  automodMaxMentions: 5,
  antispamEnabled: false,
  antispamMaxMessages: 5,
  antispamTimeframe: 10,
  antiraidEnabled: false,
  antiraidThreshold: 8,
  antiraidInterval: 60,
};

export default function ModulesPage() {
  const [guilds, setGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [moduleState, setModuleState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoresponders, setAutoresponders] = useState([]);
  const [autoResponderForm, setAutoResponderForm] = useState({ trigger: '', response: '', enabled: true });
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    async function loadGuilds() {
      try {
        const response = await fetch(buildApiUrl('/api/guilds'), { credentials: 'include' });
        if (response.status === 401 || response.status === 403) {
          window.location.href = '/auth';
          return;
        }

        const data = await response.json();
        const nextGuilds = Array.isArray(data) ? data : [];
        setGuilds(nextGuilds);
        if (nextGuilds[0]?.id) {
          setSelectedGuildId(nextGuilds[0].id);
        }
      } catch (error) {
        setGuilds([]);
      } finally {
        setLoading(false);
      }
    }

    loadGuilds();
  }, []);

  useEffect(() => {
    if (!selectedGuildId) {
      setModuleState(null);
      setForm(defaultForm);
      setAutoresponders([]);
      return;
    }

    async function loadModuleState() {
      try {
        const [moduleResponse, autoresponderResponse] = await Promise.all([
          fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/modules`), { credentials: 'include' }),
          fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/autoresponders`), { credentials: 'include' }),
        ]);

        const data = await moduleResponse.json();
        const autoresponderData = await autoresponderResponse.json();
        setModuleState(data);
        setAutoresponders(Array.isArray(autoresponderData) ? autoresponderData : []);
        setForm({
          ...defaultForm,
          welcomeEnabled: Boolean(data?.welcomeConfig?.enabled ?? data?.config?.welcomeEnabled),
          welcomeChannelId: data?.welcomeConfig?.channelId ?? '',
          welcomeTitle: data?.welcomeConfig?.title ?? '',
          welcomeDescription: data?.welcomeConfig?.description ?? '',
          vouchEnabled: Boolean(data?.vouchConfig?.enabled ?? data?.config?.vouchEnabled),
          vouchChannelId: data?.vouchConfig?.channelId ?? '',
          vouchCooldown: Number(data?.vouchConfig?.cooldown ?? 60),
          logEnabled: Boolean(data?.logConfig?.enabled),
          logChannelId: data?.logConfig?.channelId ?? '',
          automodEnabled: Boolean(data?.automodConfig?.enabled),
          automodBannedWords: Array.isArray(data?.automodConfig?.bannedWords) ? data.automodConfig.bannedWords.join(', ') : '',
          automodMaxMentions: Number(data?.automodConfig?.maxMentions ?? 5),
          antispamEnabled: Boolean(data?.antispamConfig?.enabled),
          antispamMaxMessages: Number(data?.antispamConfig?.maxMessages ?? 5),
          antispamTimeframe: Number(data?.antispamConfig?.timeframe ?? 10),
          antiraidEnabled: Boolean(data?.antiraidConfig?.enabled),
          antiraidThreshold: Number(data?.antiraidConfig?.threshold ?? 8),
          antiraidInterval: Number(data?.antiraidConfig?.interval ?? 60),
        });
      } catch (error) {
        setModuleState(null);
        setForm(defaultForm);
        setAutoresponders([]);
      }
    }

    loadModuleState();
  }, [selectedGuildId]);

  const saveModule = async (route, payload) => {
    if (!selectedGuildId) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/modules/${route}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Unable to save settings');
      }

      const updated = await response.json();
      setModuleState((current) => ({
        ...current,
        ...(route === 'welcome' ? { welcomeConfig: updated } : {}),
        ...(route === 'vouch' ? { vouchConfig: updated } : {}),
        ...(route === 'logs' ? { logConfig: updated } : {}),
        ...(route === 'automod' ? { automodConfig: updated } : {}),
        ...(route === 'antispam' ? { antispamConfig: updated } : {}),
        ...(route === 'antiraid' ? { antiraidConfig: updated } : {}),
      }));
    } finally {
      setSaving(false);
    }
  };

  const handleWelcomeSave = async (event) => {
    event.preventDefault();
    await saveModule('welcome', {
      enabled: form.welcomeEnabled,
      channelId: form.welcomeChannelId,
      title: form.welcomeTitle,
      description: form.welcomeDescription,
    });
  };

  const handleVouchSave = async (event) => {
    event.preventDefault();
    await saveModule('vouch', {
      enabled: form.vouchEnabled,
      channelId: form.vouchChannelId,
      cooldown: form.vouchCooldown,
      allowedRoleIds: [],
    });
  };

  const handleLogsSave = async (event) => {
    event.preventDefault();
    await saveModule('logs', {
      enabled: form.logEnabled,
      channelId: form.logChannelId,
    });
  };

  const handleAutoModSave = async (event) => {
    event.preventDefault();
    await saveModule('automod', {
      enabled: form.automodEnabled,
      bannedWords: form.automodBannedWords.split(',').map((entry) => entry.trim()).filter(Boolean),
      maxMentions: form.automodMaxMentions,
    });
  };

  const handleAntiSpamSave = async (event) => {
    event.preventDefault();
    await saveModule('antispam', {
      enabled: form.antispamEnabled,
      maxMessages: form.antispamMaxMessages,
      timeframe: form.antispamTimeframe,
    });
  };

  const handleAntiRaidSave = async (event) => {
    event.preventDefault();
    await saveModule('antiraid', {
      enabled: form.antiraidEnabled,
      threshold: form.antiraidThreshold,
      interval: form.antiraidInterval,
    });
  };

  const handleAutoResponderSave = async (event) => {
    event.preventDefault();
    if (!selectedGuildId || !autoResponderForm.trigger || !autoResponderForm.response) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/autoresponders`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trigger: autoResponderForm.trigger,
          response: autoResponderForm.response,
          enabled: autoResponderForm.enabled,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to save the auto-responder');
      }

      const created = await response.json();
      setAutoresponders((current) => [created, ...current.filter((entry) => entry.id !== created.id)]);
      setAutoResponderForm({ trigger: '', response: '', enabled: true });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoResponderDelete = async (id) => {
    if (!selectedGuildId || !id) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/autoresponders/${id}`), {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok || response.status === 204) {
        setAutoresponders((current) => current.filter((item) => item.id !== id));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-section">
      <h1>Modules</h1>
      {loading ? <p>Loading guild modules…</p> : null}
      {!loading && guilds.length === 0 ? <p>Connect Discord to see guild configuration.</p> : null}

      {guilds.length > 0 ? (
        <div className="field-block">
          <label htmlFor="guild-select">Selected guild</label>
          <select id="guild-select" value={selectedGuildId} onChange={(event) => setSelectedGuildId(event.target.value)}>
            {guilds.map((guild) => (
              <option key={guild.id} value={guild.id}>{guild.name || guild.id}</option>
            ))}
          </select>
        </div>
      ) : null}

      {selectedGuildId ? (
        <div className="card-grid">
          <div className="card">
            <h3>Welcome</h3>
            <form onSubmit={handleWelcomeSave} className="stack-form">
              <label><input type="checkbox" checked={form.welcomeEnabled} onChange={(event) => setForm({ ...form, welcomeEnabled: event.target.checked })} /> Enabled</label>
              <input value={form.welcomeChannelId} onChange={(event) => setForm({ ...form, welcomeChannelId: event.target.value })} placeholder="Welcome channel ID" />
              <input value={form.welcomeTitle} onChange={(event) => setForm({ ...form, welcomeTitle: event.target.value })} placeholder="Welcome title" />
              <textarea value={form.welcomeDescription} onChange={(event) => setForm({ ...form, welcomeDescription: event.target.value })} placeholder="Welcome description" rows={3} />
              <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save welcome'}</button>
            </form>
          </div>

          <div className="card">
            <h3>Vouch</h3>
            <form onSubmit={handleVouchSave} className="stack-form">
              <label><input type="checkbox" checked={form.vouchEnabled} onChange={(event) => setForm({ ...form, vouchEnabled: event.target.checked })} /> Enabled</label>
              <input value={form.vouchChannelId} onChange={(event) => setForm({ ...form, vouchChannelId: event.target.value })} placeholder="Vouch channel ID" />
              <input type="number" value={form.vouchCooldown} onChange={(event) => setForm({ ...form, vouchCooldown: Number(event.target.value) })} placeholder="Cooldown in seconds" />
              <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save vouch'}</button>
            </form>
          </div>

          <div className="card">
            <h3>Logs</h3>
            <form onSubmit={handleLogsSave} className="stack-form">
              <label><input type="checkbox" checked={form.logEnabled} onChange={(event) => setForm({ ...form, logEnabled: event.target.checked })} /> Enabled</label>
              <input value={form.logChannelId} onChange={(event) => setForm({ ...form, logChannelId: event.target.value })} placeholder="Log channel ID" />
              <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save logs'}</button>
            </form>
          </div>

          <div className="card">
            <h3>AutoMod</h3>
            <form onSubmit={handleAutoModSave} className="stack-form">
              <label><input type="checkbox" checked={form.automodEnabled} onChange={(event) => setForm({ ...form, automodEnabled: event.target.checked })} /> Enabled</label>
              <input value={form.automodBannedWords} onChange={(event) => setForm({ ...form, automodBannedWords: event.target.value })} placeholder="Blocked words" />
              <input type="number" value={form.automodMaxMentions} onChange={(event) => setForm({ ...form, automodMaxMentions: Number(event.target.value) })} placeholder="Max mentions" />
              <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save AutoMod'}</button>
            </form>
          </div>

          <div className="card">
            <h3>AntiSpam</h3>
            <form onSubmit={handleAntiSpamSave} className="stack-form">
              <label><input type="checkbox" checked={form.antispamEnabled} onChange={(event) => setForm({ ...form, antispamEnabled: event.target.checked })} /> Enabled</label>
              <input type="number" value={form.antispamMaxMessages} onChange={(event) => setForm({ ...form, antispamMaxMessages: Number(event.target.value) })} placeholder="Max messages" />
              <input type="number" value={form.antispamTimeframe} onChange={(event) => setForm({ ...form, antispamTimeframe: Number(event.target.value) })} placeholder="Timeframe" />
              <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save AntiSpam'}</button>
            </form>
          </div>

          <div className="card">
            <h3>AntiRaid</h3>
            <form onSubmit={handleAntiRaidSave} className="stack-form">
              <label><input type="checkbox" checked={form.antiraidEnabled} onChange={(event) => setForm({ ...form, antiraidEnabled: event.target.checked })} /> Enabled</label>
              <input type="number" value={form.antiraidThreshold} onChange={(event) => setForm({ ...form, antiraidThreshold: Number(event.target.value) })} placeholder="Join threshold" />
              <input type="number" value={form.antiraidInterval} onChange={(event) => setForm({ ...form, antiraidInterval: Number(event.target.value) })} placeholder="Interval (seconds)" />
              <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save AntiRaid'}</button>
            </form>
          </div>
        </div>
      ) : null}

      {selectedGuildId ? (
        <div className="card">
          <h3>Autoresponders</h3>
          <form onSubmit={handleAutoResponderSave} className="stack-form">
            <input value={autoResponderForm.trigger} onChange={(event) => setAutoResponderForm({ ...autoResponderForm, trigger: event.target.value })} placeholder="Trigger phrase" />
            <textarea value={autoResponderForm.response} onChange={(event) => setAutoResponderForm({ ...autoResponderForm, response: event.target.value })} placeholder="Response" rows={3} />
            <label><input type="checkbox" checked={autoResponderForm.enabled} onChange={(event) => setAutoResponderForm({ ...autoResponderForm, enabled: event.target.checked })} /> Enabled</label>
            <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Create autoresponder'}</button>
          </form>

          {autoresponders.length ? (
            <div className="stacked-list">
              {autoresponders.map((entry) => (
                <div key={entry.id} className="list-item">
                  <div>
                    <strong>{entry.trigger}</strong>
                    <div>{entry.response}</div>
                  </div>
                  <button type="button" className="secondary-btn" onClick={() => handleAutoResponderDelete(entry.id)}>Delete</button>
                </div>
              ))}
            </div>
          ) : (
            <p>No autoresponders configured yet.</p>
          )}
        </div>
      ) : null}
    </main>
  );
}
