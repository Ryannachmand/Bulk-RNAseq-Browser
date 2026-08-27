suppressPackageStartupMessages({
  library(DESeq2)
  library(limma)
  library(readr)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: compute_vst_pca.R <params.json>")

params           <- fromJSON(args[1])
counts_csv_path  <- params$counts_csv_path
metadata         <- params$metadata        # named list: sample -> {condition, batch}
n_genes          <- as.integer(params$n_genes)
output_json_path <- params$output_json_path
meta_inferred    <- isTRUE(params$meta_inferred)

# ── Load raw counts ───────────────────────────────────────────────────────────
message("Loading raw counts matrix...")
counts_raw <- read_csv(counts_csv_path, show_col_types = FALSE)
gene_ids   <- counts_raw[[1]]
counts_mat <- as.matrix(counts_raw[, -1])
rownames(counts_mat) <- gene_ids
storage.mode(counts_mat) <- "integer"

samples <- colnames(counts_mat)
message(sprintf("  %d genes × %d samples", nrow(counts_mat), length(samples)))

# ── Build condition / batch vectors ───────────────────────────────────────────
conditions <- vapply(samples, function(s) {
  m <- metadata[[s]]
  if (!is.null(m) && !is.null(m$condition) && nchar(m$condition) > 0) m$condition else s
}, character(1L))

batches <- vapply(samples, function(s) {
  m <- metadata[[s]]
  b <- m$batch
  if (is.null(b) || is.na(b) || b == "") NA_character_ else b
}, character(1L))

col_data <- data.frame(
  condition = factor(conditions),
  row.names = samples,
  stringsAsFactors = FALSE
)

# ── VST ───────────────────────────────────────────────────────────────────────
message("Running DESeq2 VST (blind = TRUE)...")
dds <- DESeqDataSetFromMatrix(
  countData = counts_mat,
  colData   = col_data,
  design    = ~ 1
)
dds <- dds[rowSums(counts(dds)) > 0, ]
vst_mat <- assay(vst(dds, blind = TRUE))   # genes × samples
message(sprintf("  VST matrix: %d genes × %d samples", nrow(vst_mat), ncol(vst_mat)))

# Select top N most variable genes (by row variance of VST values)
gene_vars <- apply(vst_mat, 1L, var)
n_use     <- min(n_genes, nrow(vst_mat))
top_idx   <- order(gene_vars, decreasing = TRUE)[seq_len(n_use)]
vst_top   <- vst_mat[top_idx, , drop = FALSE]
n_genes_used <- nrow(vst_top)
message(sprintf("  Using top %d genes for PCA", n_genes_used))

# ── PCA helper ────────────────────────────────────────────────────────────────
pad3 <- function(v) c(as.numeric(v), rep(0, max(0L, 3L - length(v))))

run_pca <- function(mat) {
  X  <- t(mat)   # samples × genes
  nc <- min(3L, nrow(X), ncol(X))
  pca <- prcomp(X, center = TRUE, scale. = FALSE)
  impt <- summary(pca)$importance
  vpct <- as.numeric(impt[2L, seq_len(nc)]) * 100
  coords <- pca$x[, seq_len(nc), drop = FALSE]
  n_s <- nrow(X)
  list(
    PC1 = as.numeric(coords[, 1L]),
    PC2 = if (nc >= 2L) as.numeric(coords[, 2L]) else rep(0, n_s),
    PC3 = if (nc >= 3L) as.numeric(coords[, 3L]) else rep(0, n_s),
    var_explained = pad3(round(vpct, 1L))
  )
}

# ── Raw PCA (no batch correction) ────────────────────────────────────────────
raw_pca <- run_pca(vst_top)

# Build sample_meta as a named list of lists (matching _compute_pca() format)
sample_meta_list <- lapply(samples, function(s) {
  list(
    condition = conditions[[s]],
    batch     = if (is.na(batches[[s]])) "" else batches[[s]]
  )
})
names(sample_meta_list) <- samples

raw_result <- list(
  samples       = samples,
  PC1           = raw_pca$PC1,
  PC2           = raw_pca$PC2,
  PC3           = raw_pca$PC3,
  var_explained = raw_pca$var_explained,
  sample_meta   = sample_meta_list,
  meta_inferred = meta_inferred
)

# ── Batch-corrected PCA (limma::removeBatchEffect) ───────────────────────────
corrected_result <- NULL
valid_batches    <- batches[!is.na(batches) & batches != ""]
unique_batches   <- unique(valid_batches)

if (length(unique_batches) >= 2L) {
  message("Applying limma::removeBatchEffect...")
  batch_vec <- ifelse(is.na(batches) | batches == "", "__none__", batches)
  batch_fac <- factor(batch_vec)
  design_cond <- model.matrix(~ condition, data = col_data)
  vst_corr <- removeBatchEffect(vst_top, batch = batch_fac, design = design_cond)
  corr_pca <- run_pca(vst_corr)
  corrected_result <- list(
    PC1 = corr_pca$PC1,
    PC2 = corr_pca$PC2,
    PC3 = corr_pca$PC3,
    var_explained = corr_pca$var_explained
  )
  message("  Batch correction applied.")
}

# ── Write output JSON ─────────────────────────────────────────────────────────
# auto_unbox = TRUE converts length-1 R vectors to JSON scalars (for strings,
# logicals, integers) while longer vectors remain JSON arrays. This matches the
# structure expected by render_pca.R (fromJSON) and the Python _compute_pca()
# return value.
result <- list(
  raw          = raw_result,
  corrected    = corrected_result,
  n_genes_used = n_genes_used,
  pca_method   = "VST"
)

write_json(result, output_json_path, auto_unbox = TRUE, null = "null")
message(sprintf("VST PCA written to %s", output_json_path))
