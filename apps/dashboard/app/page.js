'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../lib/api';

export default function HomePage() {
  const [summary, setSummary] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      try {
        const meResponse = await fetch(buildApiUrl('/api/me'), { credentials: 'include' });
        if (meResponse.status === 401 || meResponse.status === 403) {
          window.location.href = '/auth';
          return;
        }

        const me = meResponse.ok ? await meResponse.json() : { user: null };
        const overviewResponse = await fetch(buildApiUrl('/api/overview'), { credentials: 'include' });
        if (overviewResponse.status === 401 || overviewResponse.status === 403) {
          window.location.href = '/auth';
          return;
        }

        const overview = await overviewResponse.json();
        setSummary(overview);
        setUser(me.user ?? null);
      } catch (error) {
        setSummary({ guildCount: 0, ticketCount: 0, guilds: [], moduleSummary: [], lastUpdated: null });
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadSummary();
  }, []);

  const openDiscordAuth = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/oauth/discord/url'));
      const payload = await response.json();
      if (payload.authUrl) {
        window.location.href = payload.authUrl;
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">Codek Hub</div>
        <nav>
          <Link href="/">Overview</Link>
          <Link href="/tickets">Tickets</Link>
          <Link href="/servers">Servers</Link>
          <Link href="/modules">Modules</Link>
          <Link href="/logs">Logs</Link>
          <Link href="/variables">Variables</Link>
          <Link href="/auth">Login</Link>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Overview</h1>
          </div>
          <button className="primary-btn" onClick={openDiscordAuth}>{user ? `${user.username} connected` : 'Connect Discord'}</button>
        </header>

        <div className="stats-grid">
          <div className="stat-card cyan">
            <span>Guilds</span>
            <strong>{loading ? '...' : summary?.guildCount ?? 0}</strong>
          </div>
          <div className="stat-card violet">
            <span>Tickets</span>
            <strong>{loading ? '...' : summary?.ticketCount ?? 0}</strong>
          </div>
          <div className="stat-card green">
            <span>Configured modules</span>
            <strong>{loading ? '...' : summary?.moduleSummary?.length ?? 0}</strong>
          </div>
          <div className="stat-card amber">
            <span>Last sync</span>
            <strong>{summary?.lastUpdated ? 'Live' : 'Idle'}</strong>
          </div>
        </div>

        <div className="content-grid">
          <div className="panel">
            <h2>Guild state</h2>
            {summary?.guilds?.length ? (
              <ul className="module-list">
                {summary.guilds.map((guild) => (
                  <li key={guild.id}>
                    <span>{guild.name || guild.id}</span>
                    <span className="status enabled">Synced</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No guilds are available yet. Connect Discord to load real guild data.</p>
            )}
          </div>

          <div className="panel">
            <h2>Module summary</h2>
            {summary?.moduleSummary?.length ? (
              <ul className="audit-list">
                {summary.moduleSummary.map((entry) => (
                  <li key={`${entry.guildId}-${entry.guildName}`}>
                    <span>{entry.guildName}</span>
                    <span>{entry.ticketsEnabled ? 'Tickets' : 'No tickets'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No module configuration found in the database yet.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
