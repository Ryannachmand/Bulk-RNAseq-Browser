import { useState, useEffect } from 'react'
import { getProjectSamples, getProjectPca, saveProjectMetadata } from '../api/client'
import SampleMetaPanel from './SampleMetaPanel'
import PCAPlot from './PCAPlot'
import RPCAPanel from './RPCAPanel'

const TAB_INTERACTIVE = 'interactive'
const TAB_R = 'r'

export default function PCASection({ projectId, projectName }) {
  const [tab, setTab] = useState(TAB_INTERACTIVE)
  const [nGenes, setNGenes] = useState(500)

  const [samplesData, setSamplesData] = useState(null)
  const [samplesError, setSamplesError] = useState(null)

  const [pcaData, setPcaData] = useState(null)
  const [pcaLoading, setPcaLoading] = useState(false)
  const [pcaError, setPcaError] = useState(null)

  async function fetchSamples() {
    setSamplesError(null)
    try {
      const data = await getProjectSamples(projectId)
      setSamplesData(data)
    } catch (e) {
      setSamplesError(e.message)
    }
  }

  async function fetchPca() {
    setPcaLoading(true)
    setPcaError(null)
    try {
      const data = await getProjectPca(projectId, { nGenes })
      setPcaData(data)
    } catch (e) {
      setPcaError(e.message)
    } finally {
      setPcaLoading(false)
    }
  }

  useEffect(() => {
    fetchSamples()
    fetchPca()
  }, [projectId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleMetadataSaved() {
    await fetchSamples()
    await fetchPca()
  }

  const tabStyle = (active) => ({
    padding: '0.35rem 1rem',
    border: '1px solid #ccc',
    borderBottom: active ? '1px solid #fff' : '1px solid #ccc',
    background: active ? '#fff' : '#f5f5f5',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    fontSize: '0.9em',
    marginBottom: -1,
    position: 'relative',
  })

  return (
    <div>
      {samplesError && (
        <p style={{ color: '#dc2626', fontSize: '0.9em' }}>
          <strong>Error loading samples:</strong> {samplesError}
        </p>
      )}

      {samplesData && (
        <SampleMetaPanel
          samplesData={samplesData}
          onSave={(edits) => saveProjectMetadata(projectId, edits)}
          onSaved={handleMetadataSaved}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9em' }}>
          Top N genes (by variance):
          <input
            type="number"
            value={nGenes}
            min={100}
            max={5000}
            step={100}
            onChange={e => setNGenes(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <button
          onClick={fetchPca}
          disabled={pcaLoading}
          style={{
            padding: '0.3rem 0.75rem',
            background: pcaLoading ? '#9ca3af' : '#374151',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: pcaLoading ? 'default' : 'pointer',
            fontSize: '0.88em',
          }}
        >
          {pcaLoading ? 'Computing…' : 'Recompute'}
        </button>
      </div>

      {pcaError && (
        <p style={{ color: '#dc2626', fontSize: '0.9em' }}>
          <strong>PCA error:</strong> {pcaError}
        </p>
      )}

      {pcaData && (
        <>
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ccc' }}>
            <button style={tabStyle(tab === TAB_INTERACTIVE)} onClick={() => setTab(TAB_INTERACTIVE)}>
              Interactive (Plotly)
            </button>
            <button style={tabStyle(tab === TAB_R)} onClick={() => setTab(TAB_R)}>
              R-exact (ggplot2)
            </button>
          </div>

          <div style={{ border: '1px solid #ccc', borderTop: 'none', padding: '1rem', background: '#fff' }}>
            {tab === TAB_INTERACTIVE && (
              pcaLoading
                ? <p style={{ color: '#555' }}>Computing PCA…</p>
                : <PCAPlot pcaData={pcaData} />
            )}

            {tab === TAB_R && (
              <RPCAPanel
                projectId={projectId}
                hasCorrected={!!pcaData.corrected}
                nGenes={nGenes}
                defaultTitle={projectName}
              />
            )}
          </div>
        </>
      )}

      {!pcaData && pcaLoading && (
        <p style={{ color: '#555' }}>Computing PCA…</p>
      )}
    </div>
  )
}
