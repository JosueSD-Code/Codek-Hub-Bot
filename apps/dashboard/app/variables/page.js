'use client';

import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../lib/api';

export default function VariablesPage() {
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVariables() {
      try {
        const response = await fetch(buildApiUrl('/api/variables'));
        const data = await response.json();
        setVariables(Array.isArray(data) ? data : []);
      } catch (error) {
        setVariables([]);
      } finally {
        setLoading(false);
      }
    }

    loadVariables();
  }, []);

  return (
    <main className="page-section">
      <h1>Variables</h1>
      {loading ? <p>Loading variable catalog…</p> : null}
      {!loading && variables.length === 0 ? <p>No variables are registered yet.</p> : null}
      <div className="card-grid">
        {variables.map((variable) => (
          <div key={variable.key} className="card">
            <strong>{`{${variable.key}}`}</strong>
            <p>{variable.description}</p>
            <small>{variable.example}</small>
          </div>
        ))}
      </div>
    </main>
  );
}
