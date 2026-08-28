import { groupColorMap } from './ui'

/**
 * The permanent 238px left rail. A new presentation of controls that already
 * existed in EntranceScreen / MetadataScreen / SampleMetaPanel — every handler
 * and every piece of state is passed in from App, nothing is reimplemented here.
 */

// Mirrors backend/app/routers/projects.py GTF_PATHS — the annotation actually
// used for FPKM computation and DESeq2. Display only.
const GENOME = {
  human: { assembly: 'GRCh38', annotation: 'GENCODE v46' },
  mouse: { assembly: 'GRCm39', annotation: 'GENCODE vM35' },
}

const SECTION = { padding: '14px 16px 16px', borderBottom: '2px solid var(--ink)' }
const ROW_GAP = { display: 'flex', flexDirection: 'column', gap: 7 }

function SectionHead({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
      <span className="t-util">{children}</span>
      {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
    </div>
  )
}

function SourceRow({ present, active, name, detail }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', opacity: present ? 1 : 0.55 }}>
      <span
        aria-hidden="true"
        style={{
          width: 9, height: 9, flex: 'none', marginTop: 3,
          background: present ? (active ? 'var(--accent)' : 'var(--ink)') : 'transparent',
          border: present ? 'none' : '1.5px solid var(--ink)',
        }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 11.5, color: 'var(--ink)' }}>
          {name}
        </span>
        <span style={{
          display: 'block', fontWeight: 400, fontSize: 10.5, color: 'var(--ink-600)',
          lineHeight: 1.35, wordBreak: 'break-word',
        }}>
          {detail}
        </span>
      </span>
    </div>
  )
}

export default function ProjectRail({
  project,
  connected,
  samplesData,
  onOpenSampleMeta,
  onNewProject,
  conditionLevels,
  refLevel,
  cmpLevel,
  onRefLevel,
  onCmpLevel,
  deMethod,
  deRunning,
  deError,
  lastRunLabel,
  onRunDe,
}) {
  const caps = project.capabilities
  const species = project.species || project.raw_counts_species || null
  const genome = species ? GENOME[species] : null

  const metadata = samplesData?.metadata || {}
  const sampleNames = samplesData?.samples || []
  const groupOf = s => (metadata[s]?.condition || '—')
  const groups = []
  for (const s of sampleNames) {
    const g = groupOf(s)
    if (!groups.includes(g)) groups.push(g)
  }
  const colorFor = groupColorMap(groups, cmpLevel || null)
  const counts = groups.map(g => sampleNames.filter(s => groupOf(s) === g).length)
  const hasBatch = Object.values(metadata).some(m => (m?.batch || '').trim().length > 0)

  const designFormula = hasBatch ? '~ batch + condition' : '~ condition'
  const rCall = deMethod === 'limma'
    ? 'lmFit(log2(FPKM+1), model.matrix(' + designFormula + '))'
    : 'results(dds, contrast=c("condition","' + (cmpLevel || 'cmp') + '","' + (refLevel || 'ref') + '"))'

  const canRun =
    !!deMethod && !!refLevel && !!cmpLevel && refLevel !== cmpLevel && !deRunning

  const runLabel = deMethod === 'limma' ? 'Run DE analysis' : 'Re-run DESeq2'

  return (
    <aside
      style={{
        width: 238, flex: 'none',
        background: 'var(--surface-rail)',
        borderRight: '2px solid var(--ink)',
        overflowY: 'auto',
        height: '100vh',
      }}
      aria-label="Project rail"
    >
      {/* 1 — brand */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '2px solid var(--ink)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden="true" style={{ width: 14, height: 14, background: 'var(--accent)', flex: 'none' }} />
          <span className="t-display">Bulk RNA-seq</span>
        </div>
        <div className="t-util" style={{ marginTop: 7, fontWeight: 500, fontSize: 10 }}>
          Browser · Lab build
        </div>
        <div
          className="t-util"
          style={{
            marginTop: 7, fontWeight: 500, fontSize: 10,
            color: connected === false ? 'var(--accent-deep)' : 'var(--ink-600)',
          }}
        >
          {connected === null ? 'Checking backend…' : connected ? 'Backend connected' : 'Backend unreachable'}
        </div>
      </div>

      {/* 2 — project */}
      <div style={SECTION}>
        <SectionHead>Project</SectionHead>
        {/* The API exposes no project-listing endpoint, so this is the active
            project rather than a picker. See the final report. */}
        <div
          className="fld fld-rail"
          style={{ fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.3 }}
        >
          {project.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
          <span style={{
            background: 'var(--ink)', color: 'var(--ground)',
            fontWeight: 600, fontSize: 9.5, letterSpacing: '.14em',
            textTransform: 'uppercase', padding: '3px 6px',
          }}>
            {species || 'species not set'}
          </span>
        </div>
        <div style={{ marginTop: 7, fontWeight: 500, fontSize: 10, color: 'var(--ink-600)', lineHeight: 1.4 }}>
          {genome ? `${genome.assembly} · ${genome.annotation}` : 'No genome annotation — species was not set at project creation.'}
        </div>
      </div>

      {/* 3 — data sources */}
      <div style={SECTION}>
        <SectionHead
          action={
            <button type="button" className="btn btn-ghost" onClick={onNewProject}
                    title="The API has no add-source-to-project endpoint — this opens the create-project screen.">
              Add
            </button>
          }
        >
          Data sources
        </SectionHead>
        <div style={ROW_GAP}>
          <SourceRow
            present={caps.has_raw_counts}
            active={caps.has_raw_counts}
            name="Raw counts"
            detail={caps.has_raw_counts
              ? `matrix · ${project.raw_counts_species || 'species not set'}`
              : 'not provided'}
          />
          <SourceRow
            present={caps.has_fpkm}
            active={caps.has_fpkm}
            name="FPKM matrix"
            detail={caps.has_fpkm
              ? (project.fpkm_source === 'computed' ? 'computed from raw counts + GTF' : 'uploaded')
              : 'not provided'}
          />
          <SourceRow
            present={caps.has_de}
            active={caps.has_de}
            name="DE results"
            detail={caps.has_de ? (caps.de_provenance || 'uploaded') : 'not provided'}
          />
          <SourceRow
            present={caps.has_pathway}
            active={caps.has_pathway}
            name="Pathway results"
            detail={caps.has_pathway ? 'enrichGO · BP' : 'not provided'}
          />
        </div>
      </div>

      {/* 4 — samples */}
      <div style={SECTION}>
        <SectionHead>{`Samples · ${sampleNames.length}`}</SectionHead>
        {sampleNames.length === 0 ? (
          <p className="t-note" style={{ margin: 0 }}>
            No expression matrix — sample groups are unavailable for this project.
          </p>
        ) : (
          <div style={ROW_GAP}>
            {groups.map((g, i) => (
              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden="true" style={{ width: 10, height: 10, flex: 'none', background: colorFor[g] }} />
                <span style={{ fontWeight: 500, fontSize: 11.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g}
                </span>
                <span className="t-num" style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 11, color: 'var(--ink-600)' }}>
                  n={counts[i]}
                </span>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="btn btn-outline"
          style={{ width: '100%', marginTop: 12 }}
          disabled={sampleNames.length === 0}
          onClick={onOpenSampleMeta}
        >
          Edit sample metadata
        </button>
      </div>

      {/* 5 — contrast */}
      <div style={{ padding: '14px 16px 20px' }}>
        <SectionHead>Contrast</SectionHead>
        {!deMethod ? (
          <p className="t-note" style={{ margin: 0 }}>
            No raw counts and no FPKM matrix — this project cannot run a DE model.
          </p>
        ) : conditionLevels.length < 2 ? (
          <p className="t-note" style={{ margin: 0 }}>
            Fewer than two distinct condition labels. Open <strong>Edit sample metadata</strong> and
            label at least two groups to configure a contrast.
          </p>
        ) : (
          <>
            <label className="t-util t-util-field" htmlFor="rail-ref" style={{ display: 'block', marginBottom: 5 }}>
              Reference level
            </label>
            <select
              id="rail-ref"
              className="fld fld-rail"
              value={refLevel}
              onChange={e => onRefLevel(e.target.value)}
              style={{ marginBottom: 9 }}
            >
              <option value="">— choose —</option>
              {conditionLevels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>

            <label className="t-util t-util-field" htmlFor="rail-cmp" style={{ display: 'block', marginBottom: 5 }}>
              Comparison level
            </label>
            <select
              id="rail-cmp"
              className="fld fld-rail"
              value={cmpLevel}
              onChange={e => onCmpLevel(e.target.value)}
            >
              <option value="">— choose —</option>
              {conditionLevels.filter(l => l !== refLevel).map(l => <option key={l} value={l}>{l}</option>)}
            </select>

            <p style={{ margin: '10px 0 0', fontWeight: 400, fontSize: 10.5, color: 'var(--ink-600)', lineHeight: 1.4 }}>
              {deMethod === 'limma'
                ? 'No raw counts — limma on log2(FPKM+1). DESeq2 is not offered without raw counts.'
                : 'DESeq2 fits the full multi-level design; the pairwise result is extracted with contrast=.'}
              <br />
              <code className="t-mono">{rCall}</code>
            </p>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 11 }}
              disabled={!canRun}
              onClick={onRunDe}
            >
              {deRunning
                ? (deMethod === 'limma' ? 'Running limma…' : 'Running DESeq2…')
                : runLabel}
            </button>

            {deRunning && (
              <p className="t-note" style={{ margin: '8px 0 0' }}>
                {deMethod === 'limma'
                  ? 'Running limma DE analysis — this may take a moment. Do not close this page.'
                  : 'DESeq2 is running — this may take several minutes. Do not close this page.'}
              </p>
            )}

            <p style={{ margin: '8px 0 0', fontWeight: 400, fontSize: 10, color: 'var(--ink-600)', lineHeight: 1.4 }}>
              {lastRunLabel}
            </p>

            {deError && (
              <div className="msg-error" role="alert" style={{ marginTop: 9, fontSize: 10.5 }}>
                {deError}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
