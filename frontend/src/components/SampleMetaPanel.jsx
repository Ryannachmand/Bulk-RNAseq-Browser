import { useEffect, useState } from 'react'
import { ErrorMsg } from './ui'

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
  }, [edits])  // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div>
      {anyInferred && (
        <p className="t-body" style={{ margin: '0 0 10px' }}>
          Conditions are inferred from the sample names — edit and save to confirm them.
        </p>
      )}

      <table className="dtable">
        <thead>
          <tr>
            <th style={{ width: '40%' }}>Sample</th>
            <th style={{ width: '35%' }}>Condition</th>
            <th style={{ width: '25%' }}>Batch</th>
          </tr>
        </thead>
        <tbody>
          {samples.map(s => (
            <tr key={s}>
              <td style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>{s}</td>
              <td>
                <input
                  type="text" className="fld" style={{ width: '100%' }}
                  aria-label={`Condition for ${s}`}
                  value={edits[s].condition}
                  onChange={e => handleChange(s, 'condition', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="text" className="fld" style={{ width: '100%' }}
                  aria-label={`Batch for ${s}`}
                  value={edits[s].batch}
                  placeholder="(none)"
                  onChange={e => handleChange(s, 'batch', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save metadata'}
        </button>
        {saveOk && <span className="t-util" style={{ color: 'var(--accent-deep)' }}>Saved</span>}
      </div>
      {saveError && <div style={{ marginTop: 9 }}><ErrorMsg>{saveError}</ErrorMsg></div>}
    </div>
  )
}
