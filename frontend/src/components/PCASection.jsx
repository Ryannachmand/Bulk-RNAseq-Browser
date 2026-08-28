import { useEffect, useState } from 'react'
import { getProjectPca } from '../api/client'
import PanelFrame from './PanelFrame'
import PCAPlot from './PCAPlot'
import RPCAPanel from './RPCAPanel'
import { ErrorMsg, SegToggle } from './ui'

const VIEW = [
  { value: 'interactive', label: 'Interactive' },
  { value: 'r', label: 'R-exact' },
]

export default function PCASection({
  projectId, projectName, samplesError,
  expandedPanel, onToggleExpand,
}) {
  const [view, setView] = useState('interactive')
  const [nGenes, setNGenes] = useState(500)
  const [pcPair, setPcPair] = useState('PC1_PC2')
  const [useCorrected, setUseCorrected] = useState(false)

  const [pcaData, setPcaData] = useState(null)
  const [pcaLoading, setPcaLoading] = useState(false)
  const [pcaError, setPcaError] = useState(null)

  async function fetchPca(n = nGenes) {
    setPcaLoading(true)
    setPcaError(null)
    try {
      setPcaData(await getProjectPca(projectId, { nGenes: n }))
    } catch (e) {
      setPcaError(e.message)
    } finally {
      setPcaLoading(false)
    }
  }

  useEffect(() => { fetchPca() }, [projectId])  // eslint-disable-line react-hooks/exhaustive-deps

  const hasCorrected = !!pcaData?.corrected
  const isVst = pcaData?.pca_method === 'VST'
  const showCorrected = useCorrected && hasCorrected

  const pcX = 'PC1'
  const pcY = pcPair === 'PC1_PC2' ? 'PC2' : 'PC3'

  const block = showCorrected ? pcaData.corrected : pcaData?.raw
  const varExplained = (() => {
    const v = block?.var_explained || []
    return { PC1: v[0], PC2: v[1], PC3: v[2] }
  })()

  const methodNote = !pcaData ? '' : showCorrected
    ? 'limma::removeBatchEffect applied to the transformed matrix for visualisation only. ' +
      'The DE model is not refitted from these coordinates — it keeps batch as a covariate in its own design.'
    : isVst
      ? 'Coordinates from DESeq2 vst(blind = TRUE) on the raw counts, so the transformation is blind ' +
        `to the design and does not bias the plot toward the contrast. Top ${pcaData.n_genes_used} most-variable genes.`
      : 'No raw counts for this project, so a VST could not be computed — PCA runs on log2(FPKM + 1) ' +
        `instead. Top ${pcaData.n_genes_used} most-variable genes.`

  const headerRight = (
    <SegToggle ariaLabel="PCA view" options={VIEW} value={view} onChange={setView} />
  )

  return (
    <PanelFrame
      id="pca"
      title="PCA"
      kicker={isVst ? 'VST · blind' : 'log2 FPKM'}
      headerRight={headerRight}
      expandedPanel={expandedPanel}
      onToggleExpand={onToggleExpand}
      bodyStyle={{ padding: 0 }}
    >
      {/* shared sub-bar — governs both views */}
      <div style={{
        background: 'var(--ground-alt)',
        borderBottom: '1.5px solid var(--rule-mid)',
        padding: '10px 14px 11px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <label className="t-util t-util-field" htmlFor="pca-pair">PC pair</label>
        <select id="pca-pair" className="fld" value={pcPair}
                onChange={e => setPcPair(e.target.value)}>
          <option value="PC1_PC2">PC1 vs PC2</option>
          <option value="PC1_PC3">PC1 vs PC3</option>
        </select>
        <label className="t-util t-util-field" htmlFor="pca-n">Top N genes</label>
        <input id="pca-n" type="number" className="fld" style={{ width: 72 }}
               min={100} max={5000} step={100} value={nGenes}
               onChange={e => setNGenes(Number(e.target.value))} />
        <button type="button" className="btn btn-outline"
                onClick={() => fetchPca(nGenes)} disabled={pcaLoading}>
          {pcaLoading ? 'Computing…' : 'Recompute'}
        </button>
      </div>

      <div style={{ padding: '11px 14px 13px' }}>
        <ErrorMsg label="Sample error">{samplesError}</ErrorMsg>
        <ErrorMsg label="PCA error">{pcaError}</ErrorMsg>
        {pcaLoading && !pcaData && <p className="msg-wait">Computing PCA…</p>}

        {pcaData && (
          <>
            <SegToggle
              ariaLabel="PCA transformation"
              style={{ marginBottom: 10 }}
              value={showCorrected ? 'corrected' : 'raw'}
              onChange={v => setUseCorrected(v === 'corrected')}
              options={[
                { value: 'raw', label: isVst ? 'Raw VST' : 'Raw log2 FPKM' },
                {
                  value: 'corrected',
                  label: 'Batch-corrected',
                  disabled: !hasCorrected,
                  title: hasCorrected ? undefined : 'Needs two or more distinct batch labels',
                },
              ]}
            />

            {view === 'interactive' && (
              <PCAPlot
                block={block}
                rawBlock={pcaData.raw}
                pcX={pcX}
                pcY={pcY}
                varExplained={varExplained}
              />
            )}

            {view === 'r' && (
              <RPCAPanel
                projectId={projectId}
                pcX={pcX}
                pcY={pcY}
                useCorrected={showCorrected}
                nGenes={nGenes}
                defaultTitle={projectName}
              />
            )}

            <p className="t-note" style={{ margin: '9px 0 0' }}>{methodNote}</p>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
