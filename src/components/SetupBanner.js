import React, { useState } from 'react';

const REQUIRED = [
  { key: 'REACT_APP_SUPABASE_URL',      value: process.env.REACT_APP_SUPABASE_URL },
  { key: 'REACT_APP_SUPABASE_ANON_KEY', value: process.env.REACT_APP_SUPABASE_ANON_KEY },
];
const missing = REQUIRED.filter(v => !v.value);

export default function SetupBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || missing.length === 0) return null;
  return (
    <div style={{
      background: 'var(--warn-bg)',
      borderBottom: '.5px solid rgba(122,87,0,.2)',
      padding: '8px 2rem',
      fontSize: '12px',
      color: 'var(--warn)',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      flexWrap: 'wrap',
    }}>
      <strong>Setup required:</strong>
      <span>Missing env vars:</span>
      {missing.map(v => (
        <code key={v.key} style={{
          background: '#faeeda', border: '.5px solid rgba(122,87,0,.2)',
          padding: '1px 6px', borderRadius: 4,
          fontFamily: 'monospace', fontSize: '11px',
        }}>{v.key}</code>
      ))}
      <span style={{ color: '#a07030' }}>→ Netlify → Environment variables → Redeploy</span>
      <button onClick={() => setDismissed(true)} style={{
        marginLeft: 'auto', background: 'none', border: 'none',
        cursor: 'pointer', color: 'var(--warn)', fontSize: '14px', lineHeight: 1,
      }}>✕</button>
    </div>
  );
}
