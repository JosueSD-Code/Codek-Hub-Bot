'use client';

import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../lib/api';

export default function LogsPage() {
  const [guilds, setGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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
      setLogs([]);
      return;
    }

    async function loadLogs() {
      try {
        const response = await fetch(`${buildApiUrl('/api/logs')}?guildId=${selectedGuildId}`, { credentials: 'include' });
        const data = await response.json();
        setLogs(Array.isArray(data.entries) ? data.entries : []);
      } catch (error) {
        setLogs([]);
      }
    }

    loadLogs();
  }, [selectedGuildId]);

  return (
    <main className="page-section">
      <h1>Logs</h1>
      {loading ? <p>Loading guild logs…</p> : null}
      {!loading && guilds.length === 0 ? <p>Connect Discord to access guild logs.</p> : null}

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

      <div className="card-grid">
        {logs.length === 0 ? (
          <div className="card">
            <h3>No audit entries</h3>
            <p>No logs have been recorded for this guild yet.</p>
          </div>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="card">
              <h3>{entry.module}</h3>
              <p><strong>Action:</strong> {entry.action}</p>
              <p><strong>User:</strong> {entry.userId}</p>
              <p><strong>Created:</strong> {new Date(entry.createdAt).toLocaleString()}</p>
              {entry.newValue ? <p><strong>New value:</strong> {entry.newValue}</p> : null}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
