import { useEffect, useState } from 'react'
import { checkHealth, getProject } from './api/client'
import EntranceScreen from './components/EntranceScreen'
import MetadataScreen from './components/MetadataScreen'
import HeatmapSection from './components/HeatmapSection'
import PCASection from './components/PCASection'
import VolcanoSection from './components/VolcanoSection'
import GeneCategoryPlotsSection from './components/GeneCategoryPlotsSection'
import PathwayBarplotSection from './components/PathwayBarplotSection'

const SCREEN = { ENTRANCE: 'entrance', METADATA: 'metadata', DASHBOARD: 'dashboard' }

function firstAvailableTab(caps) {
  if (caps.tabs.heatmap) return 'heatmap'
  if (caps.tabs.pca) return 'pca'
  if (caps.tabs.volcano) return 'volcano'
  if (caps.tabs.gene_category_plots) return 'category'
  if (caps.tabs.pathway_barplot) return 'pathway'
  return 'heatmap'
}

export default function App() {
  const [connected, setConnected] = useState(null)
  const [screen, setScreen] = useState(SCREEN.ENTRANCE)
  const [project, setProject] = useState(null)
  const [activeTab, setActiveTab] = useState(null)

  useEffect(() => {
    checkHealth()
      .then(() => setConnected(true))
      .catch(() => setConnected(false))

    // Restore from URL on load/refresh
    const match = window.location.pathname.match(/^\/project\/([^/]+)\/dashboard$/)
    if (match) {
      getProject(match[1])
        .then(proj => {
          setProject(proj)
          setActiveTab(firstAvailableTab(proj.capabilities))
          setScreen(SCREEN.DASHBOARD)
        })
        .catch(() => {
          window.history.replaceState({}, '', '/')
        })
    }
  }, [])

  function handleProjectCreated(proj) {
    setProject(proj)
    if (proj.capabilities.has_fpkm || proj.capabilities.has_raw_counts) {
      setScreen(SCREEN.METADATA)
    } else {
      window.history.pushState({}, '', `/project/${proj.project_id}/dashboard`)
      setActiveTab(firstAvailableTab(proj.capabilities))
      setScreen(SCREEN.DASHBOARD)
    }
  }

  async function handleMetadataDone() {
    window.history.pushState({}, '', `/project/${project.project_id}/dashboard`)
    try {
      // Re-fetch to pick up any de_dataset_id written by DESeq2 during metadata screen
      const freshProj = await getProject(project.project_id)
      setProject(freshProj)
      setActiveTab(firstAvailableTab(freshProj.capabilities))
    } catch {
      setActiveTab(firstAvailableTab(project.capabilities))
    }
    setScreen(SCREEN.DASHBOARD)
  }

  if (screen === SCREEN.ENTRANCE) {
    return <EntranceScreen connected={connected} onProjectCreated={handleProjectCreated} />
  }

  if (screen === SCREEN.METADATA) {
    return <MetadataScreen project={project} onContinue={handleMetadataDone} />
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────
  const caps = project.capabilities

  const tabBtnStyle = (key) => ({
    padding: '0.5rem 1.25rem',
    border: '2px solid ' + (activeTab === key ? '#2563eb' : '#d1d5db'),
    background: activeTab === key ? '#2563eb' : '#fff',
    color: activeTab === key ? '#fff' : '#374151',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: activeTab === key ? 600 : 400,
    fontSize: '0.9em',
  })

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{project.name}</h1>
        <span style={{ fontSize: '0.8em', color: '#6b7280' }}>Bulk RNA-seq Browser</span>
      </div>
      <p style={{ margin: '0 0 1.25rem', color: connected ? '#16a34a' : '#dc2626', fontSize: '0.85em' }}>
        {connected === null ? 'Checking backend…' : connected ? 'Backend connected' : 'Backend unreachable'}
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {caps.tabs.heatmap && (
          <button style={tabBtnStyle('heatmap')} onClick={() => setActiveTab('heatmap')}>Heatmap</button>
        )}
        {caps.tabs.pca && (
          <button style={tabBtnStyle('pca')} onClick={() => setActiveTab('pca')}>PCA</button>
        )}
        {caps.tabs.volcano && (
          <button style={tabBtnStyle('volcano')} onClick={() => setActiveTab('volcano')}>Volcano</button>
        )}
        {caps.tabs.gene_category_plots && (
          <button style={tabBtnStyle('category')} onClick={() => setActiveTab('category')}>Gene Category Plots</button>
        )}
        {caps.tabs.pathway_barplot && (
          <button style={tabBtnStyle('pathway')} onClick={() => setActiveTab('pathway')}>Pathway Barplot</button>
        )}
      </div>

      {/* Tab content — conditional rendering intentionally remounts on tab switch
          so each tab fetches fresh data (required for cross-tab metadata sync) */}
      {activeTab === 'heatmap' && caps.tabs.heatmap && (
        <HeatmapSection projectId={project.project_id} projectName={project.name} />
      )}
      {activeTab === 'pca' && caps.tabs.pca && (
        <PCASection projectId={project.project_id} projectName={project.name} />
      )}
      {activeTab === 'volcano' && caps.tabs.volcano && (
        <VolcanoSection
          projectId={project.project_id}
          projectName={project.name}
          deProvenance={caps.de_provenance}
        />
      )}
      {activeTab === 'category' && caps.tabs.gene_category_plots && (
        <GeneCategoryPlotsSection
          projectId={project.project_id}
          hasFpkm={caps.has_fpkm}
          hasDe={caps.has_de}
        />
      )}
      {activeTab === 'pathway' && caps.tabs.pathway_barplot && (
        <PathwayBarplotSection
          projectId={project.project_id}
          projectName={project.name}
          hasPathway={caps.has_pathway}
          hasDe={caps.has_de}
          deProvenance={caps.de_provenance}
        />
      )}
    </div>
  )
}
