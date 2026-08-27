import { useRef, useState } from 'react'
import { createProject } from '../api/client'

function FileSlot({ label, accept, file, onFile, disabled }) {
  const inputRef = useRef(null)

  return (
    <div
      style={{
        border: `2px dashed ${disabled ? '#e5e7eb' : file ? '#16a34a' : '#d1d5db'}`,
        borderRadius: 6,
        padding: '0.75rem 1rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#f9fafb' : file ? '#f0fdf4' : '#fff',
        transition: 'border-color 0.15s',
      }}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={e => onFile(e.target.files[0] || null)}
      />
      <div style={{ fontSize: '0.85em', fontWeight: 600, color: disabled ? '#9ca3af' : '#374151' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.8em', color: disabled ? '#d1d5db' : file ? '#15803d' : '#6b7280', marginTop: 2 }}>
        {disabled ? 'Coming soon' : file ? `✓ ${file.name}` : 'Click to choose file (.csv)'}
      </div>
    </div>
  )
}

function PathSlot({ label, value, onChange }) {
  return (
    <div style={{
      border: `2px dashed ${value.trim() ? '#16a34a' : '#d1d5db'}`,
      borderRadius: 6,
      padding: '0.75rem 1rem',
      background: value.trim() ? '#f0fdf4' : '#fff',
    }}>
      <div style={{ fontSize: '0.85em', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="/path/to/star/output/folder"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid #d1d5db',
          borderRadius: 4,
          padding: '0.3rem 0.5rem',
          fontSize: '0.83em',
          fontFamily: 'monospace',
          color: '#374151',
        }}
      />
      <div style={{ fontSize: '0.75em', color: '#9ca3af', marginTop: 3 }}>
        Server-side path to folder containing *.ReadsPerGene.out.tab files
      </div>
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

  const statusColor = connected === null ? '#6b7280' : connected ? '#16a34a' : '#dc2626'
  const statusText = connected === null ? 'Checking backend…' : connected ? 'Backend connected' : 'Backend unreachable'

  const selectStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.35rem 0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: '0.9em',
    fontFamily: 'inherit',
    background: '#fff',
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
        maxWidth: 560,
        background: '#fff',
        borderRadius: 10,
        boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
        padding: '2rem',
      }}>
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem', color: '#111827' }}>
          Bulk RNA-seq Browser
        </h1>
        <p style={{ margin: '0 0 1.75rem', fontSize: '0.85em', color: statusColor }}>{statusText}</p>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.875em', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Project name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Shashank DESeq2 Analysis"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 5,
              fontSize: '0.95em',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.875em', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            Upload data files{' '}
            <span style={{ fontWeight: 400, color: '#6b7280' }}>— at least one required</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <FileSlot
              label="FPKM matrix"
              accept=".csv"
              file={fpkmFile}
              onFile={setFpkmFile}
              disabled={false}
            />
            <FileSlot
              label="DE results table"
              accept=".csv"
              file={deFile}
              onFile={setDeFile}
              disabled={false}
            />
            <FileSlot
              label="Pathway results"
              accept=".csv"
              file={pathwayFile}
              onFile={setPathwayFile}
              disabled={false}
            />
            <FileSlot
              label="Raw counts matrix"
              accept=".csv,.tsv"
              file={rawCountsFile}
              onFile={setRawCountsFile}
              disabled={false}
            />
            <PathSlot
              label="STAR output folder"
              value={starFolderPath}
              onChange={setStarFolderPath}
            />

            {/* Species selector — required for raw counts; required for FPKM (enables pathway analysis) */}
            <div style={{
              padding: '0.65rem 1rem',
              border: `1px solid ${needsSpecies && !species ? '#fca5a5' : '#e5e7eb'}`,
              borderRadius: 6,
              background: needsSpecies ? '#fafafa' : '#f9fafb',
            }}>
              <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 600, color: needsSpecies ? '#374151' : '#9ca3af', marginBottom: 4 }}>
                Species{needsSpecies ? ' *' : ''}
              </label>
              <select
                value={species}
                onChange={e => setSpecies(e.target.value)}
                disabled={!needsSpecies}
                style={{ ...selectStyle, color: needsSpecies ? '#374151' : '#9ca3af' }}
              >
                <option value="">— required for FPKM / raw counts —</option>
                <option value="human">Human (GRCh38)</option>
                <option value="mouse">Mouse (GRCm39)</option>
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.6rem 0.75rem',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 5,
            color: '#dc2626',
            fontSize: '0.85em',
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={!canSubmit}
          style={{
            width: '100%',
            padding: '0.6rem',
            background: canSubmit ? '#2563eb' : '#9ca3af',
            color: '#fff',
            border: 'none',
            borderRadius: 5,
            fontSize: '1em',
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'default',
          }}
        >
          {creating ? 'Creating project…' : 'Create project'}
        </button>

        {!hasFile && name.trim() && (
          <p style={{ textAlign: 'center', margin: '0.5rem 0 0', fontSize: '0.8em', color: '#6b7280' }}>
            Select at least one data file above.
          </p>
        )}
        {needsSpecies && !species && (
          <p style={{ textAlign: 'center', margin: '0.5rem 0 0', fontSize: '0.8em', color: '#dc2626' }}>
            Select a species for FPKM / raw counts data.
          </p>
        )}
      </div>
    </div>
  )
}
