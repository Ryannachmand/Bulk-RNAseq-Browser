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
