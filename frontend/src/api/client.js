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
