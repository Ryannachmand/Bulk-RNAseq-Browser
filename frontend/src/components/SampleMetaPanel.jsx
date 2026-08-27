import { useState, useEffect } from 'react'

export default function SampleMetaPanel({ samplesData, onSave, onSaved, onEditsChange }) {
  const { samples, metadata } = samplesData
  const anyInferred = Object.values(metadata).some(m => m.inferred)

  const [edits, setEdits] = useState(() =>
    Object.fromEntries(
      samples.map(s => [s, { condition: metadata[s].condition, batch: metadata[s].batch }])
    )
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveOk, setSaveOk] = useState(false)

  // Notify parent of current edits (for condition-level pickers, etc.)
  useEffect(() => {
    if (onEditsChange) onEditsChange(edits)
  }, [edits])

  function handleChange(sample, field, value) {
    setEdits(prev => ({ ...prev, [sample]: { ...prev[sample], [field]: value } }))
    setSaveOk(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      await onSave(edits)
      setSaveOk(true)
      onSaved()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const cellStyle = {
    padding: '0.3rem 0.5rem',
    borderBottom: '1px solid #e5e7eb',
    fontSize: '0.88em',
  }

  const inputStyle = {
    width: '100%',
    border: '1px solid #d1d5db',
    borderRadius: 3,
    padding: '0.2rem 0.4rem',
    fontSize: '0.88em',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.95em' }}>Sample metadata</strong>
        {anyInferred && (
          <span style={{ fontSize: '0.8em', color: '#6b7280', fontStyle: 'italic' }}>
            Conditions are inferred from sample names — edit and save to confirm.
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 600, width: '40%' }}>Sample</th>
              <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 600, width: '35%' }}>Condition</th>
              <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 600, width: '25%' }}>Batch</th>
            </tr>
          </thead>
          <tbody>
            {samples.map(s => (
              <tr key={s}>
                <td style={{ ...cellStyle, fontFamily: 'monospace', color: '#374151' }}>{s}</td>
                <td style={cellStyle}>
                  <input
                    type="text"
                    value={edits[s].condition}
                    onChange={e => handleChange(s, 'condition', e.target.value)}
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    type="text"
                    value={edits[s].batch}
                    onChange={e => handleChange(s, 'batch', e.target.value)}
                    placeholder="(none)"
                    style={inputStyle}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.6rem' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '0.35rem 0.9rem',
            background: saving ? '#9ca3af' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: saving ? 'default' : 'pointer',
            fontSize: '0.9em',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saveOk && <span style={{ color: '#16a34a', fontSize: '0.85em' }}>Saved.</span>}
        {saveError && <span style={{ color: '#dc2626', fontSize: '0.85em' }}>{saveError}</span>}
      </div>
    </div>
  )
}
