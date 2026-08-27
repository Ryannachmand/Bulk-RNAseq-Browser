suppressPackageStartupMessages({
  library(readr)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: compute_fpkm.R <params.json>")

params              <- fromJSON(args[1])
counts_csv_path     <- params$counts_csv_path
gene_lengths_csv    <- params$gene_lengths_csv_path   # may be NULL/NA
gtf_path            <- params$gtf_path
output_fpkm_path    <- params$output_fpkm_path

# ── Load raw counts ───────────────────────────────────────────────────────────
message("Loading raw counts matrix...")
counts_raw <- read_csv(counts_csv_path, show_col_types = FALSE)
gene_ids   <- counts_raw[[1]]
counts_mat <- as.matrix(counts_raw[, -1])
rownames(counts_mat) <- gene_ids

n_genes   <- nrow(counts_mat)
n_samples <- ncol(counts_mat)
message(sprintf("  %d genes × %d samples", n_genes, n_samples))

# ── Get gene lengths (bp) ─────────────────────────────────────────────────────
use_length_col <- !is.null(gene_lengths_csv) && !is.na(gene_lengths_csv) &&
                  nchar(gene_lengths_csv) > 0 && file.exists(gene_lengths_csv)

if (use_length_col) {
  # Length column was present in the uploaded raw counts matrix
  message("Using Length column from raw counts matrix for gene lengths...")
  len_df <- read_csv(gene_lengths_csv, show_col_types = FALSE)
  # CSV format: (unnamed index = gene_ids), length
  gene_lengths_map <- setNames(as.numeric(len_df[[2]]), as.character(len_df[[1]]))
  gene_lengths_bp  <- as.numeric(gene_lengths_map[as.character(gene_ids)])
  n_found <- sum(!is.na(gene_lengths_bp))
  message(sprintf("  %d / %d genes have Length values", n_found, n_genes))

  # Still need symbol mapping — parse GTF gene records only (fast)
  message(sprintf("Parsing GTF gene records for symbol mapping: %s", basename(gtf_path)))
  gtf_cmd  <- paste("awk -F'\\t' '!/^#/ && $3==\"gene\"'", shQuote(gtf_path))
  pipe_con <- pipe(gtf_cmd, open = "r")
  gene_lines <- readLines(pipe_con)
  close(pipe_con)
  split_gene  <- strsplit(gene_lines, "\t", fixed = TRUE)
  gene_attrs  <- vapply(split_gene, function(x) if (length(x) >= 9L) x[[9L]] else "", character(1L))
  sym_ids     <- sub('.*gene_id "([^"]+)".*', "\\1", gene_attrs, perl = TRUE)
  sym_names   <- sub('.*gene_name "([^"]+)".*', "\\1", gene_attrs, perl = TRUE)
  sym_map_full <- setNames(sym_names, sym_ids)
  sym_map_base <- setNames(sym_names, sub("\\.\\d+$", "", sym_ids, perl = TRUE))

} else {
  # Single awk pass: capture gene records (for symbol mapping) AND exon records
  # (for length computation) to avoid reading the 3 GB GTF twice.
  message(sprintf("Parsing GTF (gene + exon records): %s", basename(gtf_path)))
  gtf_cmd  <- paste("awk -F'\\t' '!/^#/ && ($3==\"gene\" || $3==\"exon\")'", shQuote(gtf_path))
  pipe_con <- pipe(gtf_cmd, open = "r")
  all_lines <- readLines(pipe_con)
  close(pipe_con)
  message(sprintf("  %d records (gene + exon combined)", length(all_lines)))

  split_all <- strsplit(all_lines, "\t", fixed = TRUE)
  feat_type <- vapply(split_all, function(x) if (length(x) >= 3L) x[[3L]] else "", character(1L))
  attrs_all <- vapply(split_all, function(x) if (length(x) >= 9L) x[[9L]] else "", character(1L))

  # ── Symbol mapping from gene records ─────────────────────────────────────
  is_gene     <- feat_type == "gene"
  gene_attrs  <- attrs_all[is_gene]
  sym_ids     <- sub('.*gene_id "([^"]+)".*', "\\1", gene_attrs, perl = TRUE)
  sym_names   <- sub('.*gene_name "([^"]+)".*', "\\1", gene_attrs, perl = TRUE)
  sym_map_full <- setNames(sym_names, sym_ids)
  sym_map_base <- setNames(sym_names, sub("\\.\\d+$", "", sym_ids, perl = TRUE))

  # ── Gene lengths from exon records ────────────────────────────────────────
  is_exon  <- feat_type == "exon"
  ex_lines <- split_all[is_exon]
  message(sprintf("  Parsing %d exon records for gene lengths...", sum(is_exon)))

  starts        <- as.integer(vapply(ex_lines, function(x) x[4L], character(1L)))
  ends          <- as.integer(vapply(ex_lines, function(x) x[5L], character(1L)))
  exon_gene_ids <- sub('.*gene_id "([^"]+)".*', "\\1", attrs_all[is_exon], perl = TRUE)

  # Sort by gene_id then start for interval merging
  ord      <- order(exon_gene_ids, starts)
  g_sorted <- exon_gene_ids[ord]
  s_sorted <- starts[ord]
  e_sorted <- ends[ord]

  # Gene boundary indices
  is_new_gene  <- c(TRUE, g_sorted[-1L] != g_sorted[-length(g_sorted)])
  unique_genes <- g_sorted[is_new_gene]
  gene_starts  <- which(is_new_gene)
  gene_ends    <- c(gene_starts[-1L] - 1L, length(g_sorted))

  n_unique <- length(unique_genes)
  message(sprintf("  Computing union exon lengths for %d genes...", n_unique))

  gene_len_vec <- integer(n_unique)
  for (k in seq_len(n_unique)) {
    si <- s_sorted[gene_starts[k]:gene_ends[k]]
    ei <- e_sorted[gene_starts[k]:gene_ends[k]]
    cur_s <- si[1L]; cur_e <- ei[1L]; tot <- 0L
    for (j in seq_along(si)) {
      if (si[j] <= cur_e) {
        if (ei[j] > cur_e) cur_e <- ei[j]
      } else {
        tot   <- tot + cur_e - cur_s + 1L
        cur_s <- si[j]; cur_e <- ei[j]
      }
    }
    gene_len_vec[k] <- tot + cur_e - cur_s + 1L
  }

  gene_lengths_map      <- setNames(gene_len_vec, unique_genes)
  gene_lengths_map_base <- gene_lengths_map
  names(gene_lengths_map_base) <- sub("\\.\\d+$", "", names(gene_lengths_map), perl = TRUE)

  gene_lengths_bp <- vapply(as.character(gene_ids), function(g) {
    v <- gene_lengths_map[g];       if (!is.na(v)) return(as.numeric(v))
    g2 <- sub("\\.\\d+$", "", g, perl = TRUE)
    v <- gene_lengths_map[g2];      if (!is.na(v)) return(as.numeric(v))
    v <- gene_lengths_map_base[g];  if (!is.na(v)) return(as.numeric(v))
    v <- gene_lengths_map_base[g2]; if (!is.na(v)) return(as.numeric(v))
    NA_real_
  }, numeric(1L))

  n_mapped <- sum(!is.na(gene_lengths_bp))
  message(sprintf("  Gene length mapping: %d / %d genes mapped", n_mapped, n_genes))
}

# ── Map Ensembl IDs to gene symbols ───────────────────────────────────────────
message("Mapping gene IDs to symbols...")
symbols <- vapply(as.character(gene_ids), function(g) {
  s <- sym_map_full[[g]];       if (!is.null(s) && !is.na(s)) return(s)
  g2 <- sub("\\.\\d+$", "", g, perl = TRUE)
  s <- sym_map_full[[g2]];      if (!is.null(s) && !is.na(s)) return(s)
  s <- sym_map_base[[g]];       if (!is.null(s) && !is.na(s)) return(s)
  s <- sym_map_base[[g2]];      if (!is.null(s) && !is.na(s)) return(s)
  g   # fallback: keep Ensembl ID
}, character(1L))
n_sym <- sum(symbols != as.character(gene_ids))
message(sprintf("  %d / %d genes mapped to a symbol", n_sym, n_genes))

# ── Compute FPKM ─────────────────────────────────────────────────────────────
# FPKM_i_j = counts_i_j / (gene_length_kb_i × total_mapped_millions_j)
message("Computing FPKM...")
gene_lengths_kb <- gene_lengths_bp / 1000
total_reads_mil <- colSums(counts_mat) / 1e6
denom           <- outer(gene_lengths_kb, total_reads_mil)
fpkm_mat        <- counts_mat / denom
rownames(fpkm_mat) <- symbols   # use gene symbols as row IDs

# Collapse duplicate symbols: keep row with highest mean FPKM
dup_syms <- symbols[duplicated(symbols)]
if (length(dup_syms) > 0) {
  message(sprintf("  Collapsing %d duplicate symbols...", length(unique(dup_syms))))
  row_means   <- rowMeans(fpkm_mat, na.rm = TRUE)
  keep_idx    <- tapply(seq_len(nrow(fpkm_mat)), symbols,
                        function(idx) idx[which.max(row_means[idx])])
  fpkm_mat    <- fpkm_mat[unlist(keep_idx), , drop = FALSE]
}

fpkm_df <- as.data.frame(fpkm_mat, stringsAsFactors = FALSE)

write.csv(fpkm_df, output_fpkm_path, row.names = TRUE)
message(sprintf(
  "FPKM matrix written: %d genes × %d samples → %s",
  nrow(fpkm_df), ncol(fpkm_df), output_fpkm_path
))
