suppressPackageStartupMessages({
  library(pheatmap)
  library(RColorBrewer)
  library(grid)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) {
  stop("Usage: render_heatmap.R <fpkm_matrix.csv> <params.json> <output_prefix>")
}

fpkm_path   <- args[1]
params_path <- args[2]
out_prefix  <- args[3]

params       <- fromJSON(params_path)
GENES        <- params$genes
CLUSTER_ROWS <- isTRUE(params$cluster_rows)
PLOT_TITLE   <- if (!is.null(params$plot_title) && nchar(trimws(params$plot_title)) > 0) trimws(params$plot_title) else ""

# Metadata: named list of {condition, batch} per sample, or NULL
META <- params$metadata

# Read FPKM matrix (genes × samples); first column is gene row-names
fpkm <- read.csv(fpkm_path, row.names = 1, check.names = FALSE)

# Subset to the requested genes, in order
missing <- setdiff(GENES, rownames(fpkm))
if (length(missing) > 0) {
  message(sprintf("Genes not found in FPKM matrix (skipping): %s",
                  paste(missing, collapse = ", ")))
}
GENES <- GENES[GENES %in% rownames(fpkm)]
if (length(GENES) == 0) {
  stop("None of the requested genes were found in the FPKM matrix.")
}

mat <- as.matrix(fpkm[GENES, , drop = FALSE])
storage.mode(mat) <- "numeric"

# ── Z-SCORE COMPUTATION (exact R formula from BulkSIX3SB.md) ─────────────────
# t(scale(t(mat))): scale() operates column-wise, so we transpose, scale
# (each column = each gene gets z-scored), then transpose back.
zmat <- t(scale(t(mat)))
zmat[is.nan(zmat)] <- 0   # zero-variance genes (sd=0) → z=0
zmat[zmat >  3]    <-  3  # clip to ±3 for colour-scale stability
zmat[zmat < -3]    <- -3

# ── FPKM LABEL MATRIX ────────────────────────────────────────────────────────
label_mat <- matrix(
  sprintf("%.1f", mat),
  nrow = nrow(mat), ncol = ncol(mat),
  dimnames = dimnames(mat)
)

# ── COLUMN GROUPING ────────────────────────────────────────────────────────────
sample_names <- colnames(mat)

if (!is.null(META) && length(META) > 0) {
  # Use project metadata for grouping
  group_names <- sapply(sample_names, function(s) {
    entry <- META[[s]]
    if (!is.null(entry)) {
      cond <- entry$condition
      if (!is.null(cond) && nchar(trimws(cond)) > 0) trimws(cond) else s
    } else {
      s
    }
  })
  n_groups  <- length(unique(group_names))
  n_samples <- length(sample_names)
  grouping_detected <- n_groups >= 2 && n_groups < n_samples
} else {
  # Fall back to name inference (strip trailing _N replicate suffix)
  group_names  <- sub("_\\d+$", "", sample_names)
  n_groups     <- length(unique(group_names))
  n_samples    <- length(sample_names)
  grouping_detected <- (n_groups < n_samples) &&
                       (n_groups >= 2) &&
                       any(table(group_names) > 1)
}

ann_df     <- NULL
ann_colors <- NULL
gaps_col   <- NULL

if (grouping_detected) {
  # Preserve condition order as encountered across sample list
  ordered_groups <- unique(group_names)

  ann_df <- data.frame(
    Condition = factor(group_names, levels = ordered_groups),
    row.names = sample_names
  )

  n_cond <- length(ordered_groups)
  if (n_cond <= 8) {
    cond_palette <- brewer.pal(max(3L, n_cond), "Set2")[seq_len(n_cond)]
  } else {
    cond_palette <- colorRampPalette(brewer.pal(8, "Set2"))(n_cond)
  }
  names(cond_palette) <- ordered_groups
  ann_colors <- list(Condition = cond_palette)

  # Gap positions: after the last sample in each group except the final one
  group_sizes <- as.integer(table(factor(group_names, levels = ordered_groups)))
  gaps_col    <- cumsum(group_sizes[-length(group_sizes)])
}

# ── PALETTE: reversed RdBu (red = high z-score, blue = low z-score) ──────────
palette <- colorRampPalette(rev(brewer.pal(11, "RdBu")))(100)

# ── DYNAMIC FIGURE DIMENSIONS ────────────────────────────────────────────────
plot_width  <- max(8,  min(22, ncol(zmat) * 0.7 + 4))
plot_height <- max(5,  min(24, nrow(zmat) * 0.4 + 3))

# ── RENDER PNG + PDF ─────────────────────────────────────────────────────────
png_path <- paste0(out_prefix, ".png")
pdf_path <- paste0(out_prefix, ".pdf")

for (out_path in c(png_path, pdf_path)) {
  if (endsWith(out_path, ".png")) {
    png(out_path, width = plot_width, height = plot_height, units = "in", res = 300)
  } else {
    pdf(out_path, width = plot_width, height = plot_height)
  }

  h <- pheatmap(
    zmat,
    main              = PLOT_TITLE,
    color             = palette,
    display_numbers   = label_mat,
    fontsize_number   = 11,
    cluster_rows      = CLUSTER_ROWS,
    cluster_cols      = FALSE,
    annotation_col    = ann_df,
    annotation_colors = ann_colors,
    gaps_col          = gaps_col,
    fontsize_row      = 14,
    fontsize          = 14,
    border_color      = "grey90",
    scale             = "none",   # pre-computed zmat; suppress pheatmap re-scaling
    silent            = TRUE
  )

  grid.newpage()
  grid.draw(h$gtable)
  dev.off()
}

cat(sprintf("PNG:%s\n", png_path))
cat(sprintf("PDF:%s\n", pdf_path))
