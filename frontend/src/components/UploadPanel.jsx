// DEAD FILE — nothing imports this. It predates the project model; uploads now
// happen through EntranceScreen. Kept rather than deleted so the old
// dataset-scoped upload flow is still readable.
export default function UploadPanel({ onUpload, disabled, label = 'Upload DE results table (CSV or TSV):' }) {
  function handleChange(e) {
    const file = e.target.files[0]
    if (file) onUpload(file)
    e.target.value = ''
  }

  return (
    <div style={{ margin: '1rem 0' }}>
      <label>
        <strong>{label}</strong>
        <br />
        <input
          type="file"
          accept=".csv,.tsv"
          disabled={disabled}
          onChange={handleChange}
          style={{ marginTop: '0.5rem' }}
        />
      </label>
    </div>
  )
}
