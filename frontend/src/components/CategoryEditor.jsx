import { useEffect, useState } from 'react'
import { getCategories, updateCategories, resetCategoriesDefaults } from '../api/client'

// Single category row — shows name, gene count, and expand/edit controls
function CategoryRow({ cat, onChange, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(cat.name)
  const [geneText, setGeneText] = useState(cat.genes.join('\n'))

  // Sync if parent resets
  useEffect(() => {
    setNameVal(cat.name)
    setGeneText(cat.genes.join('\n'))
  }, [cat])

  function commitName() {
    setEditingName(false)
    if (nameVal.trim() && nameVal !== cat.name) {
      onChange({ ...cat, name: nameVal.trim() })
    }
  }

  function commitGenes() {
    const genes = geneText
      .split(/[\n,]+/)
      .map(g => g.trim().toUpperCase())
      .filter(g => g.length > 0)
    onChange({ ...cat, genes })
  }

  const rowBg = cat.active ? '#fff' : '#f5f5f5'
  const badge = cat.active
    ? { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }
    : { background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8, background: rowBg }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        {/* Active toggle */}
        <input
          type="checkbox"
          checked={!!cat.active}
          title={cat.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
          onChange={e => onChange({ ...cat, active: e.target.checked })}
          style={{ cursor: 'pointer', width: 16, height: 16 }}
        />

        {/* Name (clickable to edit) */}
        {editingName ? (
          <input
            autoFocus
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setEditingName(false); setNameVal(cat.name) } }}
            style={{ flex: 1, padding: '2px 6px', fontSize: '0.9em', border: '1px solid #2563eb', borderRadius: 3 }}
          />
        ) : (
          <span
            style={{ flex: 1, fontWeight: 500, cursor: 'text' }}
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {cat.name}
          </span>
        )}

        {/* Active badge */}
        <span style={{ ...badge, borderRadius: 4, padding: '1px 7px', fontSize: '0.78em', whiteSpace: 'nowrap' }}>
          {cat.active ? 'active' : 'inactive'}
        </span>

        {/* Gene count */}
        <span style={{ color: '#6b7280', fontSize: '0.85em', whiteSpace: 'nowrap' }}>
          {cat.genes.length} genes
        </span>

        {/* Expand / collapse */}
        <button
          onClick={() => setExpanded(x => !x)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '0.85em', padding: '2px 6px' }}
        >
          {expanded ? 'collapse ▲' : 'edit genes ▼'}
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          title="Delete category"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1.1em', lineHeight: 1, padding: '0 4px' }}
        >
          ×
        </button>
      </div>

      {/* Expanded gene editor */}
      {expanded && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 12px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.82em', color: '#6b7280' }}>
            One gene per line, or comma-separated. Changes apply when you click Save below.
          </p>
          <textarea
            value={geneText}
            onChange={e => setGeneText(e.target.value)}
            onBlur={commitGenes}
            rows={Math.min(20, Math.max(6, geneText.split('\n').length + 1))}
            style={{
              width: '100%', boxSizing: 'border-box',
              fontFamily: 'monospace', fontSize: '0.82em',
              border: '1px solid #d1d5db', borderRadius: 4,
              padding: '6px 8px', resize: 'vertical',
            }}
          />
        </div>
      )}
    </div>
  )
}

export default function CategoryEditor() {
  const [categories, setCategories] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    getCategories()
      .then(cats => setCategories(cats))
      .catch(e => setError(e.message))
  }, [])

  function updateCat(i, updated) {
    setCategories(prev => prev.map((c, idx) => idx === i ? updated : c))
    setDirty(true)
  }

  function deleteCat(i) {
    setCategories(prev => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  function addCategory() {
    setCategories(prev => [
      ...prev,
      { name: 'New Category', active: true, genes: [] },
    ])
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await updateCategories(categories)
      setDirty(false)
      setStatus('Saved.')
      setTimeout(() => setStatus(null), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function resetDefaults() {
    if (!confirm('Reset all categories to the original defaults? This will discard any edits.')) return
    setSaving(true)
    setError(null)
    try {
      await resetCategoriesDefaults()
      const cats = await getCategories()
      setCategories(cats)
      setDirty(false)
      setStatus('Reset to defaults.')
      setTimeout(() => setStatus(null), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!categories && !error) return <p style={{ color: '#555' }}>Loading categories…</p>
  if (error) return <p style={{ color: '#dc2626' }}><strong>Error:</strong> {error}</p>

  const nActive = categories.filter(c => c.active).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: '0.95em' }}>
          Gene Categories
        </span>
        <span style={{ color: '#6b7280', fontSize: '0.85em' }}>
          {nActive} active / {categories.length} total
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={addCategory}
          style={{ padding: '4px 12px', fontSize: '0.85em', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, cursor: 'pointer' }}
        >
          + Add category
        </button>
        <button
          onClick={resetDefaults}
          disabled={saving}
          style={{ padding: '4px 12px', fontSize: '0.85em', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, cursor: 'pointer' }}
        >
          Reset to defaults
        </button>
        <button
          onClick={save}
          disabled={saving || !dirty}
          style={{
            padding: '4px 14px', fontSize: '0.85em', borderRadius: 4, cursor: dirty ? 'pointer' : 'default',
            background: dirty ? '#2563eb' : '#e5e7eb',
            color: dirty ? '#fff' : '#9ca3af',
            border: 'none', fontWeight: 600,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status && <span style={{ color: '#16a34a', fontSize: '0.85em' }}>{status}</span>}
      </div>

      {categories.map((cat, i) => (
        <CategoryRow
          key={i}
          cat={cat}
          onChange={updated => updateCat(i, updated)}
          onDelete={() => deleteCat(i)}
        />
      ))}

      {dirty && (
        <p style={{ color: '#d97706', fontSize: '0.82em', margin: '4px 0 0' }}>
          Unsaved changes — click Save to persist.
        </p>
      )}
    </div>
  )
}
