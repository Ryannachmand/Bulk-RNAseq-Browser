import { useEffect, useState } from 'react'
import { getCategories, updateCategories, resetCategoriesDefaults } from '../api/client'
import { ErrorMsg } from './ui'

// Single category row — shows name, gene count, and expand/edit controls.
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

  return (
    <div style={{
      border: '1.5px solid var(--ink)',
      marginBottom: 6,
      background: cat.active ? 'var(--ground)' : 'var(--ground-alt)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
        <input
          type="checkbox"
          checked={!!cat.active}
          aria-label={`${cat.name} active`}
          title={cat.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
          onChange={e => onChange({ ...cat, active: e.target.checked })}
          style={{ cursor: 'pointer', width: 14, height: 14, flex: 'none' }}
        />

        {editingName ? (
          <input
            autoFocus
            className="fld"
            aria-label="Category name"
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') { setEditingName(false); setNameVal(cat.name) }
            }}
            style={{ flex: 1, minWidth: 0 }}
          />
        ) : (
          <button
            type="button"
            className="btn"
            style={{
              flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none',
              fontWeight: 700, fontSize: 11.5, letterSpacing: 0, textTransform: 'none',
              color: 'var(--ink)', padding: 0, cursor: 'text',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title="Click to rename"
            onClick={() => setEditingName(true)}
          >
            {cat.name}
          </button>
        )}

        <span
          className="t-util"
          style={{
            flex: 'none', padding: '2px 6px', whiteSpace: 'nowrap',
            background: cat.active ? 'var(--ink)' : 'transparent',
            color: cat.active ? 'var(--ground)' : 'var(--ink-600)',
            border: cat.active ? 'none' : '1.5px solid var(--rule-mid)',
          }}
        >
          {cat.active ? 'active' : 'inactive'}
        </span>

        <span className="t-num" style={{
          flex: 'none', fontWeight: 600, fontSize: 10.5,
          color: 'var(--ink-600)', whiteSpace: 'nowrap',
        }}>
          {cat.genes.length} genes
        </span>

        <button type="button" className="btn btn-ghost" style={{ flex: 'none' }}
                aria-expanded={expanded} onClick={() => setExpanded(x => !x)}>
          {expanded ? 'Collapse' : 'Edit genes'}
        </button>

        <button type="button" className="btn btn-ghost" style={{ flex: 'none' }}
                title={`Delete ${cat.name}`} aria-label={`Delete ${cat.name}`}
                onClick={onDelete}>
          ×
        </button>
      </div>

      {expanded && (
        <div style={{ borderTop: '1.5px solid var(--rule-mid)', padding: '9px 10px 10px' }}>
          <p className="t-note" style={{ margin: '0 0 6px' }}>
            One gene per line, or comma-separated. Changes apply when you click Save below.
          </p>
          <textarea
            className="fld"
            aria-label={`Genes in ${cat.name}`}
            value={geneText}
            onChange={e => setGeneText(e.target.value)}
            onBlur={commitGenes}
            rows={Math.min(20, Math.max(6, geneText.split('\n').length + 1))}
            style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 10.5, resize: 'vertical' }}
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
    setCategories(prev => [...prev, { name: 'New Category', active: true, genes: [] }])
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
      setCategories(await getCategories())
      setDirty(false)
      setStatus('Reset to defaults.')
      setTimeout(() => setStatus(null), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!categories && !error) return <p className="msg-wait">Loading categories…</p>
  if (error) return <ErrorMsg>{error}</ErrorMsg>

  const nActive = categories.filter(c => c.active).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="t-util">Gene categories</span>
        <span className="t-note t-num">{nActive} active / {categories.length} total</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-outline" onClick={addCategory}>
          Add category
        </button>
        <button type="button" className="btn btn-outline" onClick={resetDefaults} disabled={saving}>
          Reset to defaults
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status && <span className="t-util" style={{ color: 'var(--accent-deep)' }}>{status}</span>}
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
        <p className="t-note" style={{ margin: '6px 0 0', color: 'var(--accent-deep)', fontWeight: 600 }}>
          Unsaved changes — click Save to persist.
        </p>
      )}
    </div>
  )
}
