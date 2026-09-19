'use client';

import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../lib/api';

export default function ServersPage() {
  const [guilds, setGuilds] = useState([]);
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
        setGuilds(Array.isArray(data) ? data : []);
      } catch (error) {
        setGuilds([]);
      } finally {
        setLoading(false);
      }
    }

    loadGuilds();
  }, []);

  return (
    <main className="page-section">
      <h1>Servers</h1>
      {loading ? <p>Loading guilds…</p> : null}
      {!loading && guilds.length === 0 ? <p>No guilds available. Sign in with Discord to populate this list.</p> : null}
      <div className="card-grid">
        {guilds.map((server) => (
          <div key={server.id} className="card">
            <h3>{server.name || server.id}</h3>
            <p>Guild metadata and module access are loaded from the real Discord OAuth session or database.</p>
          </div>
        ))}
      </div>
    </main>
  );
}
