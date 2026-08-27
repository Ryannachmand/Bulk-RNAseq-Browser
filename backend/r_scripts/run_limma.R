suppressPackageStartupMessages({
  library(limma)
  library(readr)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: run_limma.R <params.json>")

params           <- fromJSON(args[1])
fpkm_csv_path    <- params$fpkm_csv_path
metadata_list    <- params$metadata
reference_level  <- params$reference_level
comparison_level <- params$comparison_level
output_csv_path  <- params$output_csv_path

# ── Load FPKM matrix ───────────────────────────────────────────────────────────
message(sprintf("Loading FPKM matrix: %s", fpkm_csv_path))
fpkm_raw  <- read_csv(fpkm_csv_path, show_col_types = FALSE)
gene_syms <- fpkm_raw[[1]]
fpkm_mat  <- as.matrix(fpkm_raw[, -1])
rownames(fpkm_mat) <- gene_syms
storage.mode(fpkm_mat) <- "double"

# log2(FPKM + 1) — standard pre-processing for limma on FPKM
expr_mat <- log2(fpkm_mat + 1)

# ── Build sample annotation from project metadata ─────────────────────────────
samples <- colnames(expr_mat)
missing <- setdiff(samples, names(metadata_list))
if (length(missing) > 0) {
  stop(sprintf("Samples in FPKM matrix have no metadata entry: %s",
               paste(missing, collapse = ", ")))
}

conditions <- sapply(samples, function(s) metadata_list[[s]]$condition)
batches    <- sapply(samples, function(s) {
  b <- metadata_list[[s]]$batch
  if (is.null(b) || b == "") NA_character_ else b
})

present_levels <- unique(conditions)
for (lvl in c(reference_level, comparison_level)) {
  if (!lvl %in% present_levels) {
    stop(sprintf("Condition level '%s' not found. Present levels: %s",
                 lvl, paste(sort(present_levels), collapse = ", ")))
  }
}

# ── Design matrix — same multi-level convention as DESeq2 bridge ──────────────
# All condition levels enter the model; the pairwise contrast is extracted below.
cond_factor <- factor(conditions)
has_batch   <- !all(is.na(batches)) && length(unique(batches[!is.na(batches)])) > 1

if (has_batch) {
  batch_factor <- factor(batches)
  design <- model.matrix(~ 0 + cond_factor + batch_factor)
  message("Design: ~ 0 + condition + batch")
} else {
  design <- model.matrix(~ 0 + cond_factor)
  message("Design: ~ 0 + condition")
}

# Strip R-generated prefix from column names so they match condition labels
colnames(design) <- sub("^cond_factor", "", colnames(design))
colnames(design) <- sub("^batch_factor", "batch_", colnames(design))

message(sprintf("limma: %s vs %s (reference) | %d samples | %d condition levels",
  comparison_level, reference_level,
  ncol(expr_mat), nlevels(cond_factor)
))

# ── Contrast vector built directly from design column names ───────────────────
# Avoids makeContrasts parsing issues with special characters in condition names.
cont_vec <- rep(0, ncol(design))
names(cont_vec) <- colnames(design)
comp_idx <- which(colnames(design) == comparison_level)
ref_idx  <- which(colnames(design) == reference_level)
if (length(comp_idx) == 0) stop(sprintf("Comparison level '%s' not in design columns: %s",
  comparison_level, paste(colnames(design), collapse = ", ")))
if (length(ref_idx)  == 0) stop(sprintf("Reference level '%s' not in design columns: %s",
  reference_level, paste(colnames(design), collapse = ", ")))
cont_vec[comp_idx] <-  1
cont_vec[ref_idx]  <- -1
cont_mat <- matrix(cont_vec, ncol = 1,
                   dimnames = list(colnames(design), "contrast"))

# ── Fit limma model ───────────────────────────────────────────────────────────
fit  <- lmFit(expr_mat, design)
fit2 <- contrasts.fit(fit, cont_mat)
fit2 <- eBayes(fit2)

tt <- topTable(fit2, coef = 1, number = Inf, sort.by = "none")

# ── Map output to the DE schema used by the app ───────────────────────────────
# Column mapping per design-spec:
#   logFC   → log2FoldChange
#   t       → stat
#   P.Value → pvalue
#   adj.P.Val → padj
#   AveExpr → baseMean  (conceptual stand-in: AveExpr is mean log2 expression,
#                         NOT equivalent to DESeq2's normalized-count mean)
#   lfcSE   → backed out as |logFC / t| (exact when t = logFC / SE)
result <- data.frame(
  gene           = rownames(tt),
  symbol         = rownames(tt),  # FPKM matrix rows are already gene symbols
  baseMean       = tt$AveExpr,
  log2FoldChange = tt$logFC,
  lfcSE          = ifelse(abs(tt$t) > 1e-10, abs(tt$logFC / tt$t), NA_real_),
  stat           = tt$t,
  pvalue         = tt$P.Value,
  padj           = tt$adj.P.Val,
  stringsAsFactors = FALSE
)

write_csv(result, output_csv_path)
message(sprintf("Done. %d genes written to %s", nrow(result), output_csv_path))
