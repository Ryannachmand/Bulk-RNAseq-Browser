import { useRef, useState } from 'react'
import { createProject } from '../api/client'
import { ErrorMsg } from './ui'

/**
 * Create-project screen. Same inputs, same accept filters, same handlers and
 * the same createProject payload as before — only the treatment changed.
 */

function FileSlot({ label, accept, file, onFile, hint }) {
  const inputRef = useRef(null)
  return (
    <div style={{
      border: `1.5px solid ${file ? 'var(--accent)' : 'var(--ink)'}`,
      background: file ? 'var(--accent-tint)' : 'var(--surface-input)',
      padding: '9px 11px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => onFile(e.target.files[0] || null)}
      />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 11.5 }}>{label}</span>
        <span style={{
          display: 'block', fontWeight: 500, fontSize: 10.5, lineHeight: 1.35,
          color: file ? 'var(--accent-darkest)' : 'var(--ink-600)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {file ? file.name : hint}
        </span>
      </span>
      <button type="button" className="btn btn-outline" style={{ flex: 'none' }}
              onClick={() => inputRef.current?.click()}>
        {file ? 'Replace' : 'Choose'}
      </button>
      {file && (
        <button type="button" className="btn btn-ghost" style={{ flex: 'none' }}
                onClick={() => onFile(null)}>
          Clear
        </button>
      )}
    </div>
  )
}

export default function EntranceScreen({ connected, onProjectCreated }) {
  const [name, setName] = useState('')
  const [fpkmFile, setFpkmFile] = useState(null)
  const [deFile, setDeFile] = useState(null)
  const [pathwayFile, setPathwayFile] = useState(null)
  const [rawCountsFile, setRawCountsFile] = useState(null)
  const [starFolderPath, setStarFolderPath] = useState('')
  const [species, setSpecies] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const hasRawCounts = !!(rawCountsFile || starFolderPath.trim())
  const hasFile = !!(fpkmFile || deFile || pathwayFile || hasRawCounts)
  // Species is required for raw counts (needed for GTF/FPKM computation) and
  // for FPKM uploads (needed later for pathway enrichment analysis).
  const needsSpecies = hasRawCounts || !!fpkmFile
  const speciesOk = !needsSpecies || species !== ''
  const canSubmit = connected && name.trim().length > 0 && hasFile && speciesOk && !creating

  async function handleCreate() {
    if (!canSubmit) return
    setCreating(true)
    setError(null)
    try {
      const proj = await createProject(name.trim(), {
        fpkm: fpkmFile,
        de: deFile,
        pathway: pathwayFile,
        rawCounts: rawCountsFile,
        starFolder: starFolderPath.trim() || null,
        species: needsSpecies ? species : null,
      })
      onProjectCreated(proj)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const statusText = connected === null
    ? 'Checking backend…'
    : connected ? 'Backend connected' : 'Backend unreachable'

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      background: 'var(--ground)', padding: '48px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 620, border: '2px solid var(--ink)', background: 'var(--ground)' }}>
        {/* header */}
        <div style={{ padding: '16px 18px 14px', borderBottom: '2px solid var(--ink)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 14, height: 14, background: 'var(--accent)', flex: 'none' }} />
            <span className="t-display">Bulk RNA-seq</span>
            <span className="t-kicker" style={{ marginLeft: 'auto' }}>New project</span>
          </div>
          <div className="t-util" style={{
            marginTop: 8, fontWeight: 500, fontSize: 10,
            color: connected === false ? 'var(--accent-deep)' : 'var(--ink-600)',
          }}>
            {statusText}
          </div>
        </div>

        {/* project name */}
        <div style={{ padding: '14px 18px 16px', borderBottom: '2px solid var(--ink)' }}>
          <label className="t-util t-util-field" htmlFor="np-name"
                 style={{ display: 'block', marginBottom: 6 }}>
            Project name
          </label>
          <input
            id="np-name" type="text" className="fld fld-rail"
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Shashank DESeq2 Analysis"
          />
        </div>

        {/* data sources */}
        <div style={{ padding: '14px 18px 16px', borderBottom: '2px solid var(--ink)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <span className="t-util">Data sources</span>
            <span className="t-note" style={{ marginLeft: 'auto' }}>at least one required</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <FileSlot label="FPKM matrix" accept=".csv" file={fpkmFile} onFile={setFpkmFile}
                      hint="CSV — genes as rows, samples as columns" />
            <FileSlot label="DE results table" accept=".csv" file={deFile} onFile={setDeFile}
                      hint="CSV — symbol, log2FoldChange, padj" />
            <FileSlot label="Pathway results" accept=".csv" file={pathwayFile} onFile={setPathwayFile}
                      hint="CSV — enrichment table" />
            <FileSlot label="Raw counts matrix" accept=".csv,.tsv" file={rawCountsFile} onFile={setRawCountsFile}
                      hint="CSV or TSV — STAR / featureCounts output" />

            <div style={{
              border: `1.5px solid ${starFolderPath.trim() ? 'var(--accent)' : 'var(--ink)'}`,
              background: starFolderPath.trim() ? 'var(--accent-tint)' : 'var(--surface-input)',
              padding: '9px 11px',
            }}>
              <label className="t-util t-util-field" htmlFor="np-star"
                     style={{ display: 'block', marginBottom: 5 }}>
                STAR output folder
              </label>
              <input
                id="np-star" type="text" className="fld"
                style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 10.5 }}
                value={starFolderPath}
                onChange={e => setStarFolderPath(e.target.value)}
                placeholder="/path/to/star/output/folder"
              />
              <p className="t-note" style={{ margin: '5px 0 0' }}>
                Server-side path to a folder of <code className="t-mono">*.ReadsPerGene.out.tab</code> files.
              </p>
            </div>
          </div>
        </div>

        {/* species */}
        <div style={{ padding: '14px 18px 16px', borderBottom: '2px solid var(--ink)' }}>
          <label className="t-util t-util-field" htmlFor="np-species"
                 style={{ display: 'block', marginBottom: 6 }}>
            Species{needsSpecies ? ' — required' : ''}
          </label>
          <select
            id="np-species" className="fld fld-rail"
            value={species} onChange={e => setSpecies(e.target.value)}
            disabled={!needsSpecies}
            style={needsSpecies && !species ? { borderColor: 'var(--accent)' } : undefined}
          >
            <option value="">— required for FPKM / raw counts —</option>
            <option value="human">Human (GRCh38 · GENCODE v46)</option>
            <option value="mouse">Mouse (GRCm39 · GENCODE vM35)</option>
          </select>
          <p className="t-note" style={{ margin: '6px 0 0' }}>
            Resolves the GTF used to compute FPKM from raw counts, and the OrgDb used by
            pathway enrichment.
          </p>
        </div>

        {/* submit */}
        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <ErrorMsg>{error}</ErrorMsg>
          <button type="button" className="btn btn-primary" style={{ width: '100%' }}
                  onClick={handleCreate} disabled={!canSubmit}>
            {creating ? 'Creating project…' : 'Create project'}
          </button>
          {!hasFile && name.trim() && (
            <p className="t-note" style={{ margin: 0 }}>Select at least one data source above.</p>
          )}
          {needsSpecies && !species && (
            <p className="t-note" style={{ margin: 0, color: 'var(--accent-deep)', fontWeight: 600 }}>
              Select a species for FPKM / raw counts data.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
