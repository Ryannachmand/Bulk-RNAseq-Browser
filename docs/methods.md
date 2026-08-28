# Analysis methods and assumptions

Every statement here was verified against the code in `backend/r_scripts/` and
`backend/app/` rather than against general practice. Where the app's behaviour is
a limitation or an open question, it is labelled as one instead of being
smoothed over.

File references point at the code that implements each decision.

---

## 1. What the app accepts

The app operates on **processed, gene-level inputs**. It does not run alignment,
does not accept FASTQ or BAM, and never invokes STAR — it only reads STAR's
gene-count output format.

| Input | Requirements | Parser |
|---|---|---|
| Gene-level count matrix | CSV/TSV, first column gene IDs, ≥2 sample columns, non-negative numeric. An optional `Length` column is extracted for FPKM and excluded from the counts. | `parsers/raw_counts.py` |
| STAR gene counts | A flat folder of `*.ReadsPerGene.out.tab`. **Column 4 (reverse-stranded) is always used** — a fixed convention, not detected per file. Files are joined on `gene_id`; identical row order is not assumed. Sample name is the filename stem. | `parsers/star_folder.py` |
| FPKM matrix | CSV/TSV, gene identifiers in the first column, ≥2 numeric sample columns. Handles R's `write.csv` unnamed row-name column. | `parsers/fpkm_matrix.py` |
| DE results table | CSV/TSV. Requires `log2FoldChange` and `padj` (case-insensitive) plus one gene column from `gene, symbol, gene_name, gene_symbol, name, genename, hgnc_symbol`. `baseMean`, `lfcSE`, `stat`, `pvalue` and any `FPKM_*` columns are carried through when present. | `parsers/de_table.py` |
| Pathway enrichment table | CSV/TSV in the schema the pathway panel reads. | `parsers/pathway_table.py` |

Species (human or mouse) is required whenever counts or FPKM are present: it
resolves both the GENCODE GTF used for FPKM and gene symbols, and the
`org.*.eg.db` annotation package used for enrichment.

## 2. FPKM computation

`backend/r_scripts/compute_fpkm.R`

**Gene length has two sources, and the app prefers the file's own.** Surveying
real projects showed two legitimate but disagreeing conventions, so both are
implemented:

1. If the uploaded count matrix carried a `Length` column (the featureCounts
   convention), those values are used directly.
2. Otherwise, length is computed from the GENCODE GTF as the **union exon
   length** per `gene_id` — exon intervals are sorted and merged so overlapping
   exons are not double-counted, then summed.

This matters when comparing FPKM across projects: two projects processed with
different upstream tools can carry different lengths for the same gene, and the
app reproduces whichever convention the input carries rather than silently
imposing one.

**Formula.** `FPKM = count / (gene_length_kb × library_size_millions)`, where
library size is the column sum of the count matrix.

**Identifier handling.** Gene symbols come from the GTF's `gene` records. Lookup
tries four keys in order — exact ID, version-stripped query, version-stripped
GTF key, both stripped — so `ENSG00000141510.11` and `ENSG00000141510` resolve
to the same gene. Unmapped IDs keep their Ensembl ID as the symbol.

**Duplicates.** After symbol mapping, duplicate symbols are collapsed by keeping
the row with the **highest mean FPKM**. This applies to the FPKM matrix only.

**Missing lengths** produce `NA` FPKM for that gene rather than a zero or a
dropped row.

## 3. Differential expression

### Method routing is automatic

`App.jsx` and the project router select the method from the data, not from a
user choice: **raw counts present → DESeq2 on the counts; FPKM only → limma on
log2(FPKM+1)**. There is no method dropdown, because the correct choice is
determined by what the data is, and offering it as a preference invites a
statistics error.

When counts are available, **FPKM is a visualization layer only** — it drives the
heatmap's z-scores and expression labels, and never feeds DE.

### DESeq2 path

`backend/r_scripts/run_deseq2.R`

- Counts are coerced with `storage.mode(counts_mat) <- "integer"`.
- Design is `~ condition`, or `~ batch + condition` when batch metadata is
  present. **Batch is therefore a covariate in the DE model**, not only a
  visualization-layer correction.
- The model is fit **once over all condition levels**, and the pairwise result is
  extracted with `results(dds, contrast = c("condition", comparison, reference))`
  rather than by subsetting samples and re-fitting. This keeps dispersion
  estimation pooled across the whole experiment and makes every pairwise contrast
  from one project mutually consistent.
- **No low-count pre-filtering is applied by this app.** DESeq2's own independent
  filtering still runs inside `results()` at its default setting, which is what
  sets `padj` to `NA` for low-count genes. Any claim that the app filters
  ~63,000 genes down to a smaller tested set describes other scripts, not this
  one.
- Multiple-testing correction is DESeq2's default, **Benjamini–Hochberg**; it is
  not overridden.
- Symbols are mapped from the GTF with the same four-key fallback as FPKM.
  **Duplicate symbols are not collapsed here** — the DE table carries one row per
  `gene_id`, so the same symbol can appear more than once.

### limma path (FPKM-only projects)

`backend/r_scripts/run_limma.R`

- Expression is `log2(FPKM + 1)`.
- Design is `~ 0 + condition`, plus `+ batch` when **two or more distinct**
  batches exist.
- The contrast vector is built directly from design column names rather than
  through `makeContrasts`, which avoids parsing failures on condition labels
  containing special characters.
- `lmFit` → `contrasts.fit` → `eBayes` → `topTable(number = Inf)`; the adjustment
  is `topTable`'s default, **Benjamini–Hochberg**.
- Output is mapped into the shared DE schema, with two honest approximations
  documented in the script itself:
  - `baseMean` holds limma's `AveExpr` — mean log2 expression, **not** DESeq2's
    mean of normalized counts. The column name is shared; the quantity is not.
  - `lfcSE` is backed out as `|logFC / t|`.

**Statistical limitations of this route, stated plainly.** limma-on-FPKM is a
fallback for projects where counts were never provided, not an equivalent of the
DESeq2 path:

- It fits a normal linear model to log-transformed FPKM. It does not model counts
  with the negative-binomial mean–variance relationship DESeq2 uses, so
  low-expression genes are treated less conservatively than a count-based test
  would treat them.
- It does not use `voom` precision weights, which require counts.
- FPKM normalizes for length and library size within a sample, but does not
  address composition bias across samples the way DESeq2's median-of-ratios size
  factors do.
- `log2(FPKM + 1)` applies a fixed offset; it is a convention, not a variance-
  stabilizing transform fitted to the data.

Results from this route carry the `limma (FPKM-only)` provenance label wherever
the DE table is shown.

## 4. PCA

`backend/r_scripts/compute_vst_pca.R`

- Variance-stabilizing transform via `vst(dds, blind = TRUE)` on a `~ 1` design,
  so the transform is not informed by the experimental design.
- Genes with `rowSums(counts) == 0` are dropped. This is the only gene filter
  anywhere in the app, and it affects the PCA/VST layer only — never DE.
- The top *N* most variable genes by VST row variance are used (default 500,
  adjustable in the panel).
- `prcomp(center = TRUE, scale. = FALSE)`, retaining up to three components.
- A batch-corrected variant is produced with
  `limma::removeBatchEffect(vst_top, batch = batch_factor, design = model.matrix(~ condition))`,
  only when **two or more distinct** batches exist. This is a **visualization
  layer** — the corrected matrix is never used for DE testing. Batch affects DE
  through the design formula (§3), and affects the PCA display through this
  separate correction.

## 5. GO enrichment

`backend/r_scripts/run_enrichgo.R`

- The significant set is `padj < cutoff AND |log2FC| > cutoff`, with `NA` values
  in either column excluded.
- **Up- and down-regulated genes are enriched separately**, in two independent
  `enrichGO` calls, and each result is tagged with a `direction`. They are not
  pooled into one combined significant set. This is what lets the pathway panel
  render as a diverging up/down barplot.
- Symbols are mapped to ENTREZ IDs with `mapIds(..., multiVals = "first")`.
  Where one symbol maps to several ENTREZ IDs the first is taken; unmapped
  symbols are dropped.
- **The gene universe is the tested set, not the genome**: every gene in the DE
  table that maps to an ENTREZ ID is passed as `universe=`. Enrichment is
  therefore relative to what was measured in this experiment.
- Ontology is `BP` (biological process) only.
- Multiple-testing correction is `pAdjustMethod = "BH"`, applied **independently
  of the DE correction** — GO term p-values are adjusted across terms within each
  direction.
- `clusterProfiler`'s default `pvalueCutoff` (0.05) and `qvalueCutoff` (0.2) are
  not overridden.
- `readable = TRUE`, so the `geneID` column comes back as symbols — which is what
  makes a pathway's member list directly joinable to the DE table and the
  heatmap for cross-panel linking.

## 6. Missing, zero and invalid values

- Genes with no resolvable length get `NA` FPKM (§2).
- DESeq2 sets `padj` to `NA` for genes removed by independent filtering; those
  genes are excluded from significance counts and from the enrichment input.
- The API converts every pandas `NaN` to JSON `null` before serialization
  (`routers/projects.py`, `routers/datasets.py`).
- The frontend skips non-finite `log2FoldChange` or `padj` when counting
  up/down genes, labelling the volcano, and plotting — so an `Inf` or a `null`
  never becomes a plotted point or a counted gene.

## 7. Sample identity across files

- **FPKM vs. counts:** when both are uploaded, sample-name sets must match
  exactly. Any asymmetry returns HTTP 422 naming the specific samples missing
  from each side. There is no fuzzy matching and no silent intersection.
- **Matrix vs. metadata:** the R scripts stop with an explicit error if any
  matrix column has no metadata entry. Extra metadata entries for samples not in
  the matrix are ignored.
- **Condition inference:** conditions are pre-guessed by stripping a trailing
  `_N` replicate suffix from sample names. This is a starting suggestion, always
  user-editable, and flagged as inferred in the API response.

## 8. Known limitations and open questions

- **A single non-empty batch level breaks the DESeq2 run.** `run_deseq2.R`
  branches to `~ batch + condition` whenever *any* sample has a non-empty batch
  string, including the case where every sample shares one batch label. R then
  fails with `contrasts can be applied only to factors with 2 or more levels`.
  The limma path already guards against this by requiring two or more distinct
  batches; the DESeq2 path does not. *Verified by constructing the single-level
  design matrix directly.*
- **Non-integer counts are silently truncated.** `storage.mode(...) <- "integer"`
  truncates toward zero, so estimated counts from RSEM or salmon lose their
  fractional part instead of being rounded or rejected.
- **Duplicate gene symbols behave differently in the two paths** — collapsed by
  highest mean FPKM in the FPKM matrix, left as duplicate rows in the DESeq2
  output.
- **Minimum two samples.** Both matrix parsers reject a single sample column, and
  grouped rendering requires at least two conditions with more than one sample
  each. Projects without replication are not supported.
- **Cross-project numerical validation is incomplete.** One project has been
  checked end to end; agreement across the full range of upstream conventions has
  not been established.
