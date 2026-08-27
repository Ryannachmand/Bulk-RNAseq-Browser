import { useEffect, useState } from 'react'
import { getProjectSamples, saveProjectMetadata } from '../api/client'
import SampleMetaPanel from './SampleMetaPanel'

export default function MetadataScreen({ project, onContinue }) {
  const [samplesData, setSamplesData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getProjectSamples(project.project_id)
      .then(setSamplesData)
      .catch(e => setLoadError(e.message))
  }, [project.project_id])

  function handleSaved() {
    setSaved(true)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      background: '#f8fafc',
      padding: '2rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 700,
        background: '#fff',
        borderRadius: 10,
        boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
        padding: '2rem',
      }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', color: '#111827' }}>
          Sample metadata
        </h2>
        <p style={{ margin: '0 0 1.5rem', fontSize: '0.875em', color: '#6b7280' }}>
          Project: <strong>{project.name}</strong> — confirm or edit condition groupings, then continue to the dashboard.
        </p>

        {loadError && (
          <p style={{ color: '#dc2626', fontSize: '0.9em' }}>
            <strong>Error loading samples:</strong> {loadError}
          </p>
        )}

        {!samplesData && !loadError && (
          <p style={{ color: '#6b7280' }}>Loading samples…</p>
        )}

        {samplesData && (
          <SampleMetaPanel
            samplesData={samplesData}
            onSave={(edits) => saveProjectMetadata(project.project_id, edits)}
            onSaved={handleSaved}
          />
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={onContinue}
            style={{
              padding: '0.55rem 1.5rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 5,
              fontSize: '0.95em',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Continue to dashboard →
          </button>
          {!saved && (
            <span style={{ fontSize: '0.82em', color: '#6b7280', alignSelf: 'center' }}>
              You can also edit metadata from the PCA tab on the dashboard.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
