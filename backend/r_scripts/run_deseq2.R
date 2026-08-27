suppressPackageStartupMessages({
  library(DESeq2)
  library(readr)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: run_deseq2.R <params.json>")

params           <- fromJSON(args[1])
counts_csv_path  <- params$counts_csv_path
metadata_list    <- params$metadata        # named list: sample -> {condition, batch}
reference_level  <- params$reference_level
comparison_level <- params$comparison_level
gtf_path         <- params$gtf_path
output_csv_path  <- params$output_csv_path

# ── Load counts matrix ────────────────────────────────────────────────────────
message(sprintf("Loading counts matrix: %s", counts_csv_path))
counts_raw <- read_csv(counts_csv_path, show_col_types = FALSE)
gene_ids   <- counts_raw[[1]]
counts_mat <- as.matrix(counts_raw[, -1])
rownames(counts_mat) <- gene_ids
storage.mode(counts_mat) <- "integer"

# ── Build colData from saved project metadata ─────────────────────────────────
samples <- colnames(counts_mat)
missing <- setdiff(samples, names(metadata_list))
if (length(missing) > 0) {
  stop(sprintf(
    "Samples in counts matrix have no metadata entry: %s",
    paste(missing, collapse = ", ")
  ))
}

conditions <- sapply(samples, function(s) metadata_list[[s]]$condition)
batches    <- sapply(samples, function(s) {
  b <- metadata_list[[s]]$batch
  if (is.null(b) || b == "") NA_character_ else b
})

present_levels <- unique(conditions)
for (lvl in c(reference_level, comparison_level)) {
  if (!lvl %in% present_levels) {
    stop(sprintf(
      "Condition level '%s' not found in metadata. Present levels: %s",
      lvl, paste(sort(present_levels), collapse = ", ")
    ))
  }
}

# Factor with all levels present — DESeq2 fits the full multi-level design
# and pairwise results are extracted via contrast= (Anjani lab convention).
col_data <- data.frame(
  condition = factor(conditions),
  batch     = batches,
  row.names = samples,
  stringsAsFactors = FALSE
)

has_batch <- !all(is.na(col_data$batch))
if (has_batch) {
  col_data$batch <- factor(col_data$batch)
  design_formula <- ~ batch + condition
  message("Design: ~ batch + condition")
} else {
  design_formula <- ~ condition
  message("Design: ~ condition")
}

message(sprintf(
  "DESeq2: %s vs %s (reference) | %d samples | %d condition levels",
  comparison_level, reference_level,
  nrow(col_data), nlevels(col_data$condition)
))

# ── Run DESeq2 ────────────────────────────────────────────────────────────────
dds <- DESeqDataSetFromMatrix(
  countData = counts_mat,
  colData   = col_data,
  design    = design_formula
)
dds <- DESeq(dds)
res <- results(dds, contrast = c("condition", comparison_level, reference_level))

res_df       <- as.data.frame(res)
res_df$gene  <- rownames(res_df)
res_df       <- res_df[, c("gene", "baseMean", "log2FoldChange", "lfcSE", "stat", "pvalue", "padj")]

# ── GTF-based gene symbol mapping ─────────────────────────────────────────────
# Hardcoded GTF paths for this specific machine — not a config file.
message(sprintf("Parsing GTF for gene symbols: %s", basename(gtf_path)))

# Pre-filter with awk — avoids loading the full GTF (~3 GB) into R memory
gtf_cmd  <- paste("awk -F'\\t' '!/^#/ && $3==\"gene\"'", shQuote(gtf_path))
pipe_con <- pipe(gtf_cmd, open = "r")
gene_lines <- readLines(pipe_con)
close(pipe_con)

if (length(gene_lines) == 0) {
  warning("No gene records found in GTF; symbol column will equal gene_id")
  res_df$symbol <- res_df$gene
} else {
  split_lines    <- strsplit(gene_lines, "\t", fixed = TRUE)
  attr_fields    <- vapply(split_lines,
                           function(x) if (length(x) >= 9L) x[[9L]] else "",
                           character(1L))
  gtf_gene_ids   <- sub('.*gene_id "([^"]+)".*',   "\\1", attr_fields, perl = TRUE)
  gtf_gene_names <- sub('.*gene_name "([^"]+)".*', "\\1", attr_fields, perl = TRUE)

  # Build two lookups: exact versioned ID and version-stripped base ID
  map_full <- setNames(gtf_gene_names, gtf_gene_ids)
  map_base <- setNames(gtf_gene_names, sub("\\.\\d+$", "", gtf_gene_ids, perl = TRUE))

  res_df$symbol <- vapply(res_df$gene, function(g) {
    # 1. Exact match against GTF gene_id (handles versioned IDs in both)
    s <- map_full[[g]]; if (!is.null(s)) return(s)
    # 2. Strip version from query gene, try exact GTF match
    g_base <- sub("\\.\\d+$", "", g, perl = TRUE)
    s <- map_full[[g_base]]; if (!is.null(s)) return(s)
    # 3. Try version-stripped GTF lookup with full query
    s <- map_base[[g]]; if (!is.null(s)) return(s)
    # 4. Try version-stripped on both sides
    s <- map_base[[g_base]]; if (!is.null(s)) return(s)
    g  # fallback: return gene_id unchanged
  }, character(1L))

  n_mapped <- sum(res_df$symbol != res_df$gene)
  message(sprintf("Symbol mapping: %d / %d genes mapped to a symbol", n_mapped, nrow(res_df)))
}

res_df <- res_df[, c("gene", "symbol", "baseMean", "log2FoldChange", "lfcSE", "stat", "pvalue", "padj")]
write_csv(res_df, output_csv_path)
message(sprintf("Done. %d genes written to %s", nrow(res_df), output_csv_path))
