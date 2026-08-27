import { useEffect, useState, useMemo } from 'react'
import { getProjectSamples, saveProjectMetadata, runDeseq2, runLimma } from '../api/client'
import SampleMetaPanel from './SampleMetaPanel'

export default function MetadataScreen({ project, onContinue }) {
  const [samplesData, setSamplesData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [currentEdits, setCurrentEdits] = useState(null)

  const [refLevel, setRefLevel] = useState('')
  const [cmpLevel, setCmpLevel] = useState('')
  const [deseqRunning, setDeseqRunning] = useState(false)
  const [deseqError, setDeseqError] = useState(null)
  const [deseqDone, setDeseqDone] = useState(false)

  const [limmaRunning, setLimmaRunning] = useState(false)
  const [limmaError, setLimmaError] = useState(null)
  const [limmaDone, setLimmaDone] = useState(false)

  const hasRawCounts = project.capabilities?.has_raw_counts
  // limma section shown only when FPKM is available but raw counts are not
  const hasFpkmOnly = project.capabilities?.has_fpkm && !hasRawCounts

  useEffect(() => {
    getProjectSamples(project.project_id)
      .then(setSamplesData)
      .catch(e => setLoadError(e.message))
  }, [project.project_id])

  const conditionLevels = useMemo(() => {
    if (!currentEdits) return []
    const lvls = [
      ...new Set(
        Object.values(currentEdits)
          .map(e => e.condition)
          .filter(Boolean)
      ),
    ]
    return lvls.sort()
  }, [currentEdits])

  // Reset pickers when condition levels change
  useEffect(() => {
    if (refLevel && !conditionLevels.includes(refLevel)) setRefLevel('')
    if (cmpLevel && !conditionLevels.includes(cmpLevel)) setCmpLevel('')
  }, [conditionLevels])

  async function handleRunDeseq2() {
    if (!refLevel || !cmpLevel || refLevel === cmpLevel || !currentEdits) return
    setDeseqRunning(true)
    setDeseqError(null)
    setDeseqDone(false)
    try {
      await saveProjectMetadata(project.project_id, currentEdits)
      await runDeseq2(project.project_id, refLevel, cmpLevel)
      setDeseqDone(true)
    } catch (e) {
      setDeseqError(e.message)
    } finally {
      setDeseqRunning(false)
    }
  }

  async function handleRunLimma() {
    if (!refLevel || !cmpLevel || refLevel === cmpLevel || !currentEdits) return
    setLimmaRunning(true)
    setLimmaError(null)
    setLimmaDone(false)
    try {
      await saveProjectMetadata(project.project_id, currentEdits)
      await runLimma(project.project_id, refLevel, cmpLevel)
      setLimmaDone(true)
    } catch (e) {
      setLimmaError(e.message)
    } finally {
      setLimmaRunning(false)
    }
  }

  const canRunDeseq2 =
    !!refLevel && !!cmpLevel && refLevel !== cmpLevel && !deseqRunning && !!currentEdits

  const canRunLimma =
    !!refLevel && !!cmpLevel && refLevel !== cmpLevel && !limmaRunning && !!currentEdits

  const selectStyle = {
    padding: '0.3rem 0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: '0.875em',
    fontFamily: 'inherit',
    background: '#fff',
    minWidth: 140,
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
            onSaved={() => setSaved(true)}
            onEditsChange={setCurrentEdits}
          />
        )}

        {/* DESeq2 contrast section — only when project has raw counts */}
        {hasRawCounts && samplesData && (
          <div style={{
            marginTop: '1.5rem',
            borderTop: '1px solid #e5e7eb',
            paddingTop: '1.5rem',
          }}>
            <div style={{ fontSize: '0.9em', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
              DESeq2 contrast
            </div>

            {conditionLevels.length < 2 ? (
              <p style={{ fontSize: '0.85em', color: '#6b7280' }}>
                Enter at least 2 distinct condition labels above to configure the contrast.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.8em', fontWeight: 500, color: '#374151' }}>Reference level</span>
                  <select value={refLevel} onChange={e => setRefLevel(e.target.value)} style={selectStyle}>
                    <option value="">— choose —</option>
                    {conditionLevels.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.8em', fontWeight: 500, color: '#374151' }}>Comparison level</span>
                  <select value={cmpLevel} onChange={e => setCmpLevel(e.target.value)} style={selectStyle}>
                    <option value="">— choose —</option>
                    {conditionLevels
                      .filter(l => l !== refLevel)
                      .map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                  </select>
                </label>
                <button
                  onClick={handleRunDeseq2}
                  disabled={!canRunDeseq2}
                  style={{
                    padding: '0.45rem 1.1rem',
                    background: canRunDeseq2 ? '#16a34a' : '#9ca3af',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 5,
                    fontSize: '0.9em',
                    fontWeight: 600,
                    cursor: canRunDeseq2 ? 'pointer' : 'default',
                    alignSelf: 'flex-end',
                  }}
                >
                  {deseqRunning ? 'Running DESeq2…' : 'Run DESeq2'}
                </button>
              </div>
            )}

            {deseqRunning && (
              <p style={{ fontSize: '0.82em', color: '#6b7280', marginTop: '0.6rem' }}>
                DESeq2 is running — this may take several minutes. Do not close this page.
              </p>
            )}
            {deseqDone && (
              <p style={{ fontSize: '0.85em', color: '#16a34a', marginTop: '0.5rem' }}>
                ✓ DESeq2 complete. Volcano and Gene Category Plots will be available on the dashboard.
              </p>
            )}
            {deseqError && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.6rem 0.75rem',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: 5,
                color: '#dc2626',
                fontSize: '0.8em',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                maxHeight: 220,
                overflowY: 'auto',
              }}>
                <strong style={{ fontFamily: 'system-ui, sans-serif' }}>DESeq2 error:</strong>
                {'\n'}{deseqError}
              </div>
            )}
          </div>
        )}

        {/* limma DE section — only when FPKM is available and raw counts are NOT */}
        {hasFpkmOnly && samplesData && (
          <div style={{
            marginTop: '1.5rem',
            borderTop: '1px solid #e5e7eb',
            paddingTop: '1.5rem',
          }}>
            <div style={{ fontSize: '0.9em', fontWeight: 600, color: '#111827', marginBottom: '0.25rem' }}>
              DE Analysis (limma on log2 FPKM)
            </div>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.82em', color: '#6b7280' }}>
              No raw counts — limma will be used on log2(FPKM+1). This project will always use limma;
              DESeq2 is not offered without raw counts.
            </p>

            {conditionLevels.length < 2 ? (
              <p style={{ fontSize: '0.85em', color: '#6b7280' }}>
                Enter at least 2 distinct condition labels above to configure the contrast.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.8em', fontWeight: 500, color: '#374151' }}>Reference level</span>
                  <select value={refLevel} onChange={e => setRefLevel(e.target.value)} style={selectStyle}>
                    <option value="">— choose —</option>
                    {conditionLevels.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.8em', fontWeight: 500, color: '#374151' }}>Comparison level</span>
                  <select value={cmpLevel} onChange={e => setCmpLevel(e.target.value)} style={selectStyle}>
                    <option value="">— choose —</option>
                    {conditionLevels
                      .filter(l => l !== refLevel)
                      .map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                  </select>
                </label>
                <button
                  onClick={handleRunLimma}
                  disabled={!canRunLimma}
                  style={{
                    padding: '0.45rem 1.1rem',
                    background: canRunLimma ? '#16a34a' : '#9ca3af',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 5,
                    fontSize: '0.9em',
                    fontWeight: 600,
                    cursor: canRunLimma ? 'pointer' : 'default',
                    alignSelf: 'flex-end',
                  }}
                >
                  {limmaRunning ? 'Running limma…' : 'Run DE Analysis'}
                </button>
              </div>
            )}

            {limmaRunning && (
              <p style={{ fontSize: '0.82em', color: '#6b7280', marginTop: '0.6rem' }}>
                Running limma DE analysis — this may take a moment. Do not close this page.
              </p>
            )}
            {limmaDone && (
              <p style={{ fontSize: '0.85em', color: '#16a34a', marginTop: '0.5rem' }}>
                ✓ DE analysis complete (limma). Volcano and Gene Category Plots are now available.
              </p>
            )}
            {limmaError && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.6rem 0.75rem',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: 5,
                color: '#dc2626',
                fontSize: '0.8em',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                maxHeight: 220,
                overflowY: 'auto',
              }}>
                <strong style={{ fontFamily: 'system-ui, sans-serif' }}>limma error:</strong>
                {'\n'}{limmaError}
              </div>
            )}
          </div>
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
