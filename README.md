# Bulk RNA-seq Browser

## Running locally

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Starts at http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at http://localhost:5173

Both halves must be running at the same time. The frontend expects the backend at `http://localhost:8000`.

## Testing with real data

Any `DE_full_*.csv` from the scouted projects works. The expected schema is:

```
gene, FPKM_<condA>, FPKM_<condB>, baseMean, log2FoldChange, lfcSE, stat, pvalue, padj
```

A clean example: `/media/david/Mayo/ryan/bulkRNAseq/Dylan/analysis/output/de_results/DE_full_SIX3_vs_Control.csv`
