export default function UploadPanel({ onUpload, disabled }) {
  function handleChange(e) {
    const file = e.target.files[0]
    if (file) onUpload(file)
    e.target.value = ''
  }

  return (
    <div style={{ margin: '1rem 0' }}>
      <label>
        <strong>Upload DE results table (CSV or TSV):</strong>
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
