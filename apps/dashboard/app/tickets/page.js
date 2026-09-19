'use client';

import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../lib/api';

export default function TicketsPage() {
  const [guilds, setGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [panels, setPanels] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [panelForm, setPanelForm] = useState({ name: '', description: '' });
  const [ticketForm, setTicketForm] = useState({ category: 'general', priority: 'normal' });

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [guildResponse, meResponse] = await Promise.all([
          fetch(buildApiUrl('/api/guilds'), { credentials: 'include' }),
          fetch(buildApiUrl('/api/me'), { credentials: 'include' }),
        ]);

        if (guildResponse.status === 401 || guildResponse.status === 403 || meResponse.status === 401 || meResponse.status === 403) {
          window.location.href = '/auth';
          return;
        }

        const guildData = await guildResponse.json();
        const meData = meResponse.ok ? await meResponse.json() : null;
        const nextGuilds = Array.isArray(guildData) ? guildData : [];

        setGuilds(nextGuilds);
        setMe(meData?.user ?? null);

        if (nextGuilds[0]?.id) {
          setSelectedGuildId(nextGuilds[0].id);
        }

        if (meData?.user?.id) {
          setTicketForm((current) => ({ ...current }));
        }
      } catch (error) {
        setGuilds([]);
        setMe(null);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedGuildId) {
      setPanels([]);
      setTickets([]);
      return;
    }

    async function loadGuildData() {
      try {
        const [panelResponse, ticketResponse] = await Promise.all([
          fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/ticket-panels`), { credentials: 'include' }),
          fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/tickets`), { credentials: 'include' }),
        ]);

        const panelData = await panelResponse.json();
        const ticketData = await ticketResponse.json();

        setPanels(Array.isArray(panelData) ? panelData : []);
        setTickets(Array.isArray(ticketData) ? ticketData : []);
      } catch (error) {
        setPanels([]);
        setTickets([]);
      }
    }

    loadGuildData();
  }, [selectedGuildId]);

  const handlePanelSubmit = async (event) => {
    event.preventDefault();
    if (!selectedGuildId) return;

    const response = await fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/ticket-panels`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...panelForm, channelId: 'tickets' }),
    });

    if (response.ok) {
      const created = await response.json();
      setPanels((current) => [created, ...current]);
      setPanelForm({ name: '', description: '' });
    }
  };

  const handleTicketSubmit = async (event) => {
    event.preventDefault();
    if (!selectedGuildId || !me?.id) return;

    const payload = {
      ...ticketForm,
      userId: me.id,
      channelId: `ticket-${Date.now()}`,
    };

    const response = await fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/tickets`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const created = await response.json();
      setTickets((current) => [created, ...current]);
      setTicketForm({ category: 'general', priority: 'normal' });
    }
  };

  const claimTicket = async (ticketId) => {
    if (!me?.id) {
      return;
    }

    const response = await fetch(buildApiUrl(`/api/guilds/${selectedGuildId}/tickets/${ticketId}/claim`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ staffId: me.id }),
    });

    if (response.ok) {
      const updated = await response.json();
      setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? { ...ticket, claim: updated } : ticket)));
    }
  };

  return (
    <main className="page-section">
      <h1>Tickets</h1>
      {loading ? <p>Loading guilds…</p> : null}
      {!loading && guilds.length === 0 ? <p>You need to connect Discord and have a guild to manage tickets.</p> : null}

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
        <div className="card">
          <h3>Create ticket panel</h3>
          <form onSubmit={handlePanelSubmit} className="stack-form">
            <input value={panelForm.name} onChange={(event) => setPanelForm({ ...panelForm, name: event.target.value })} placeholder="Panel name" />
            <textarea value={panelForm.description} onChange={(event) => setPanelForm({ ...panelForm, description: event.target.value })} placeholder="Description" rows={3} />
            <button type="submit" className="primary-btn">Create panel</button>
          </form>
        </div>

        <div className="card">
          <h3>Open ticket</h3>
          <form onSubmit={handleTicketSubmit} className="stack-form">
            <div className="field-block">
              <label>Authenticated user</label>
              <div>{me?.username ? `${me.username} (${me.id})` : 'Not authenticated'}</div>
            </div>
            <input value={ticketForm.category} onChange={(event) => setTicketForm({ ...ticketForm, category: event.target.value })} placeholder="Category" />
            <select value={ticketForm.priority} onChange={(event) => setTicketForm({ ...ticketForm, priority: event.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
            <button type="submit" className="primary-btn" disabled={!me?.id}>Open ticket</button>
          </form>
        </div>
      </div>

      <section className="card-grid spaced-top">
        <div className="card wide-card">
          <h3>Ticket panels</h3>
          {panels.length === 0 ? <p>No panels created yet.</p> : null}
          {panels.map((panel) => (
            <div key={panel.id} className="list-item">
              <div>
                <strong>{panel.name}</strong>
                <div>{panel.channelId}</div>
              </div>
              <span className="status enabled">{panel.active ? 'Active' : 'Inactive'}</span>
            </div>
          ))}
        </div>

        <div className="card wide-card">
          <h3>Tickets</h3>
          {tickets.length === 0 ? <p>No tickets created yet.</p> : null}
          {tickets.map((ticket) => (
            <div key={ticket.id} className="list-item">
              <div>
                <strong>{ticket.category}</strong>
                <div>#{ticket.channelId} · {ticket.status}</div>
              </div>
              <button type="button" className="secondary-btn" onClick={() => claimTicket(ticket.id)}>Claim</button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
