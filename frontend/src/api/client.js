const BASE = 'http://localhost:8000'

export async function checkHealth() {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) throw new Error('unreachable')
  return res.json()
}

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
