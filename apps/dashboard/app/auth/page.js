'use client';

import { buildApiUrl } from '../../lib/api';

export default function AuthPage() {
  const handleLogin = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/oauth/discord/url'));
      const payload = await response.json();
      if (payload.authUrl) {
        window.location.href = payload.authUrl;
      }
    } catch (error) {
      console.error('Unable to start Discord OAuth flow.', error);
    }
  };

  return (
    <main className="page-section">
      <div className="auth-box">
        <p className="eyebrow">Authentication</p>
        <h1>Login with Discord</h1>
        <p>Securely access the dashboard using Discord OAuth2. Each administrative request validates the current session, guild, and permissions server-side.</p>
        <button className="primary-btn" onClick={handleLogin}>Continue with Discord</button>
      </div>
    </main>
  );
}
