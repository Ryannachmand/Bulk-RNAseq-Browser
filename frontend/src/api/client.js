const BASE = `http://${window.location.hostname}:8000`

export async function checkHealth() {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) throw new Error('unreachable')
  return res.json()
}

// ── DE table / volcano ────────────────────────────────────────────────────────

export async function uploadDataset(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/datasets/upload`, { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Upload failed')
  return data
}

export async function getDeResults(datasetId) {
  const res = await fetch(`${BASE}/datasets/${datasetId}/de-results`)
  if (!res.ok) throw new Error('Failed to load results')
  return res.json()
}

export async function renderRVolcano(datasetId, params) {
  const res = await fetch(`${BASE}/datasets/${datasetId}/render-r-volcano`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'R render failed')
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

// ── FPKM matrix / heatmap ─────────────────────────────────────────────────────

export async function uploadFpkmMatrix(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/datasets/upload-fpkm`, { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Upload failed')
  return data  // { heatmap_id, n_genes, n_samples, samples }
}

export async function getHeatmapData(heatmapId, { nGenes = 40, geneList = null, clusterRows = false } = {}) {
  const params = new URLSearchParams({ n_genes: nGenes, cluster_rows: clusterRows })
  if (geneList && geneList.length > 0) {
    params.append('gene_list', geneList.join(','))
  }
  const res = await fetch(`${BASE}/datasets/${heatmapId}/heatmap-data?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to load heatmap data')
  }
  return res.json()
  // Returns: { genes, samples, z_scores, fpkm_labels, grouping }
}

export async function renderRHeatmap(heatmapId, { genes, clusterRows }) {
  const res = await fetch(`${BASE}/datasets/${heatmapId}/render-r-heatmap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ genes, cluster_rows: clusterRows }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'R heatmap render failed')
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

// ── Sample metadata ───────────────────────────────────────────────────────────

export async function getSamples(datasetId) {
  const res = await fetch(`${BASE}/datasets/${datasetId}/samples`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to load samples')
  }
  return res.json()  // { samples, metadata }
}

export async function saveMetadata(datasetId, metadata) {
  const res = await fetch(`${BASE}/datasets/${datasetId}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to save metadata')
  }
  return res.json()
}

// ── PCA ───────────────────────────────────────────────────────────────────────

export async function getPcaData(datasetId, { nGenes = 500 } = {}) {
  const params = new URLSearchParams({ n_genes: nGenes })
  const res = await fetch(`${BASE}/datasets/${datasetId}/pca?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to compute PCA')
  }
  return res.json()  // { raw, corrected, n_genes_used }
}

// ── Gene categories ───────────────────────────────────────────────────────────

export async function getCategories() {
  const res = await fetch(`${BASE}/categories`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to load categories')
  }
  return res.json()
}

export async function updateCategories(categories) {
  const res = await fetch(`${BASE}/categories`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(categories),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to save categories')
  }
  return res.json()
}

export async function resetCategoriesDefaults() {
  const res = await fetch(`${BASE}/categories/reset-defaults`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to reset categories')
  }
  return res.json()
}

// ── FPKM dataset listing ──────────────────────────────────────────────────────

export async function listFpkmDatasets() {
  const res = await fetch(`${BASE}/datasets/fpkm-list`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to list datasets')
  }
  return res.json()  // { datasets: [{id}] }
}

// ── Categorized heatmap ───────────────────────────────────────────────────────

export async function getCategorizedHeatmap(datasetId, nTopGenes = 40) {
  const params = new URLSearchParams({ n_top_genes: nTopGenes })
  const res = await fetch(`${BASE}/datasets/${datasetId}/categorized-heatmap?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to compute categorized heatmap')
  }
  return res.json()
}

// ── DE dataset listing ────────────────────────────────────────────────────────

export async function listDeDatasets() {
  const res = await fetch(`${BASE}/datasets/de-list`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to list DE datasets')
  }
  return res.json()  // { datasets: [{id}] }
}

// ── Categorized volcano ───────────────────────────────────────────────────────

export async function getCategorizedVolcano(datasetId) {
  const res = await fetch(`${BASE}/datasets/${datasetId}/categorized-volcano`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to compute categorized volcano')
  }
  return res.json()
}

export async function renderRCategoryVolcanos(datasetId, { padjCutoff = 0.05, lfcCutoff = 1.0, nLabel = 15 } = {}) {
  const res = await fetch(`${BASE}/datasets/${datasetId}/render-r-category-volcanos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ padj_cutoff: padjCutoff, lfc_cutoff: lfcCutoff, n_label: nLabel }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'R category volcano render failed')
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function renderRCategoryHeatmaps(datasetId, nTopGenes = 40) {
  const res = await fetch(`${BASE}/datasets/${datasetId}/render-r-category-heatmaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n_top_genes: nTopGenes }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'R category heatmap render failed')
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

// ── Pathway barplot ───────────────────────────────────────────────────────────

export async function uploadPathway(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/datasets/upload-pathway`, { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Upload failed')
  return data  // { dataset_id, n_pathways, direction_available }
}

export async function getPathwayResults(datasetId, topN = 20) {
  const params = new URLSearchParams({ top_n: topN })
  const res = await fetch(`${BASE}/datasets/${datasetId}/pathway-results?${params}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to load pathway results')
  }
  return res.json()  // { rows, direction_available }
}

export async function listPathwayDatasets() {
  const res = await fetch(`${BASE}/datasets/pathway-list`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'Failed to list pathway datasets')
  }
  return res.json()  // { datasets: [{id, direction_available}] }
}

export async function renderRPathwayBarplot(datasetId, { topN = 20, plotTitle = 'Pathway Enrichment' } = {}) {
  const res = await fetch(`${BASE}/datasets/${datasetId}/render-r-pathway-barplot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ top_n: topN, plot_title: plotTitle }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'R pathway render failed')
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function renderRPca(datasetId, { pcX = 'PC1', pcY = 'PC2', useCorrected = false, nGenes = 500, plotTitle = null }) {
  const res = await fetch(`${BASE}/datasets/${datasetId}/render-r-pca`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pc_x: pcX, pc_y: pcY, use_corrected: useCorrected, n_genes: nGenes, plot_title: plotTitle || null }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || 'R PCA render failed')
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
