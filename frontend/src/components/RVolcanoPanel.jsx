import { useState } from 'react'
import { renderProjectRVolcano } from '../api/client'
import { ChipWell, ErrorMsg, MissingStrip, ROutput, SegToggle } from './ui'

/**
 * R-exact volcano: a 196px control column beside the output area.
 * The label list is owned by VolcanoSection so the interactive plot labels
 * exactly what the R render prints.
 */

export default function RVolcanoPanel({
  projectId, padjCutoff, lfcCutoff,
  plotTitle, onPlotTitle,
  labelMode, onLabelMode,
  nLabel, onNLabel,
  customGenes, onCustomGenes,
  missingGenes,
}) {
  const [loading, setLoading] = useState(false)
  const [imgUrl, setImgUrl] = useState(null)
  const [error, setError] = useState(null)

  const missingSet = new Set(missingGenes)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setImgUrl(null)
    try {
      const url = await renderProjectRVolcano(projectId, {
        padj_cutoff: padjCutoff,
        lfc_cutoff: lfcCutoff,
        // TOP N and MY LIST are exclusive in the UI; the R script unions them,
        // so the unused half is sent as its no-op value.
        n_label: labelMode === 'list' ? 0 : nLabel,
        custom_genes: labelMode === 'list' && customGenes.length > 0 ? customGenes : null,
        plot_title: plotTitle,
      })
      setImgUrl(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      {/* control column */}
      <div style={{ width: 196, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="t-util t-util-field" htmlFor="rv-title"
                 style={{ display: 'block', marginBottom: 5 }}>
            Plot title
          </label>
          <input id="rv-title" type="text" className="fld" style={{ width: '100%' }}
                 value={plotTitle} onChange={e => onPlotTitle(e.target.value)} />
        </div>

        <div>
          <span className="t-util t-util-field" id="rv-labels-label"
                style={{ display: 'block', marginBottom: 5 }}>
            Gene labels (ggrepel)
          </span>
          <SegToggle
            ariaLabel="Gene label source"
            value={labelMode}
            onChange={onLabelMode}
            options={[{ value: 'topn', label: 'Top N' }, { value: 'list', label: 'My list' }]}
          />
        </div>

        {labelMode === 'topn' ? (
          <div>
            <label className="t-util t-util-field" htmlFor="rv-n"
                   style={{ display: 'block', marginBottom: 5 }}>
              N per direction
            </label>
            <input id="rv-n" type="number" className="fld" style={{ width: 72 }}
                   min={0} max={50} step={1} value={nLabel}
                   onChange={e => onNLabel(Number(e.target.value))} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <ChipWell
              tall
              inputId="rv-symbols"
              ariaLabel="Genes to label"
              symbols={customGenes}
              missing={missingSet}
              onRemove={s => onCustomGenes(customGenes.filter(g => g !== s))}
              onCommit={added => onCustomGenes([...new Set([...customGenes, ...added])])}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => document.getElementById('rv-symbols')?.focus()}
              >
                Add
              </button>
              <span className="t-note" style={{ marginLeft: 'auto' }}>
                {customGenes.length} labelled
              </span>
            </div>
            <MissingStrip missing={missingGenes} noun="not in DE table" />
          </div>
        )}

        <p className="t-note" style={{ margin: 0 }}>
          Rendered by <code className="t-mono">render_volcano.R</code> — ggplot2 + ggrepel,
          Ola-lab style, 300 dpi. Uses the dashboard padj and |log2FC| cutoffs.
        </p>

        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Generating…' : 'Generate R plot'}
        </button>
      </div>

      {/* output area */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <ErrorMsg label="R error">{error}</ErrorMsg>
        <ROutput imgUrl={imgUrl} filename="volcano.png" alt="R volcano plot" minHeight={230} />
      </div>
    </div>
  )
}
