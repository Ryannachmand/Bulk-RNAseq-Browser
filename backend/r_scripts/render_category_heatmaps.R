suppressPackageStartupMessages({
  library(pheatmap)
  library(RColorBrewer)
  library(grid)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) {
  stop("Usage: render_category_heatmaps.R <params.json>")
}

params_path <- args[1]
params <- fromJSON(params_path, simplifyDataFrame = FALSE)

fpkm_path    <- params$fpkm_path
meta_path    <- params$metadata_path   # may be NULL
categories   <- params$categories      # list of {name, genes}
N_TOP        <- as.integer(params$n_top_genes)
out_prefix   <- params$out_prefix

# ── Load FPKM matrix ─────────────────────────────────────────────────────────
message("Loading FPKM matrix: ", fpkm_path)
fpkm <- read.csv(fpkm_path, row.names = 1, check.names = FALSE)
sample_names <- colnames(fpkm)
message(sprintf("  %d genes x %d samples", nrow(fpkm), ncol(fpkm)))

# ── Column grouping ───────────────────────────────────────────────────────────
# Prefer saved metadata; fall back to _N suffix stripping.
build_annotation <- function(sample_names, meta_path) {
  if (!is.null(meta_path) && file.exists(meta_path)) {
    meta <- fromJSON(meta_path, simplifyDataFrame = FALSE)
    conditions <- sapply(sample_names, function(s) {
      if (!is.null(meta[[s]]) && !is.null(meta[[s]]$condition) && nchar(meta[[s]]$condition) > 0)
        meta[[s]]$condition
      else
        sub("_\\d+$", "", s)
    })
  } else {
    conditions <- sub("_\\d+$", "", sample_names)
  }

  ordered_groups <- unique(conditions)
  n_groups <- length(ordered_groups)
  n_samples <- length(sample_names)

  grouping_ok <- (n_groups < n_samples) && (n_groups >= 2) &&
                 any(table(conditions) > 1)

  if (!grouping_ok) return(list(ann_df = NULL, ann_colors = NULL, gaps_col = NULL))

  ann_df <- data.frame(
    Condition = factor(conditions, levels = ordered_groups),
    row.names = sample_names
  )

  if (n_groups <= 8) {
    pal <- brewer.pal(max(3L, n_groups), "Set2")[seq_len(n_groups)]
  } else {
    pal <- colorRampPalette(brewer.pal(8, "Set2"))(n_groups)
  }
  names(pal) <- ordered_groups
  ann_colors <- list(Condition = pal)

  group_sizes <- as.integer(table(factor(conditions, levels = ordered_groups)))
  gaps_col <- cumsum(group_sizes[-length(group_sizes)])

  list(ann_df = ann_df, ann_colors = ann_colors, gaps_col = gaps_col)
}

ann <- build_annotation(sample_names, meta_path)

# ── Z-score helper (matches Python's _compute_z_scores) ──────────────────────
zscore_mat <- function(mat) {
  zmat <- t(scale(t(mat)))
  zmat[is.nan(zmat)] <- 0
  zmat[zmat >  3]    <-  3
  zmat[zmat < -3]    <- -3
  zmat
}

palette <- colorRampPalette(rev(brewer.pal(11, "RdBu")))(100)

# ── Build one pheatmap per category ──────────────────────────────────────────
build_panel <- function(cat_name, gene_list) {
  present <- gene_list[gene_list %in% rownames(fpkm)]
  if (length(present) == 0) {
    message(sprintf("  [%s] 0 genes found in matrix — skipping", cat_name))
    return(NULL)
  }

  # top N by variance
  sub <- fpkm[present, , drop = FALSE]
  vars <- apply(sub, 1, var)
  n_sel <- min(N_TOP, length(present))
  selected <- names(sort(vars, decreasing = TRUE))[seq_len(n_sel)]

  mat <- as.matrix(fpkm[selected, , drop = FALSE])
  storage.mode(mat) <- "numeric"

  zmat <- zscore_mat(mat)
  label_mat <- matrix(
    sprintf("%.1f", mat),
    nrow = nrow(mat), ncol = ncol(mat),
    dimnames = dimnames(mat)
  )

  h_in <- max(6, nrow(mat) * 0.45 + 3)
  w_in <- max(10, ncol(mat) * 0.6 + 4)

  message(sprintf("  [%s] %d genes selected", cat_name, nrow(mat)))

  h <- pheatmap(
    zmat,
    color             = palette,
    display_numbers   = label_mat,
    fontsize_number   = 9,
    cluster_rows      = TRUE,
    cluster_cols      = FALSE,
    show_rownames     = TRUE,
    show_colnames     = TRUE,
    annotation_col    = ann$ann_df,
    annotation_colors = ann$ann_colors,
    gaps_col          = ann$gaps_col,
    fontsize_row      = 11,
    fontsize          = 11,
    main              = sprintf("%s  [colour = z-score ±3 | numbers = raw FPKM]", cat_name),
    border_color      = "grey90",
    scale             = "none",
    silent            = TRUE
  )
  h
}

message("\n--- Building category panels ---")
hmaps <- list()
for (cat in categories) {
  h <- build_panel(cat$name, cat$genes)
  if (!is.null(h)) hmaps[[cat$name]] <- h
}

n_cats <- length(hmaps)
if (n_cats == 0) stop("No categories produced any output — check that gene names match the FPKM matrix row names")

message(sprintf("\n--- Assembling %d-panel combined figure ---", n_cats))

# ── Individual panel outputs ──────────────────────────────────────────────────
for (cat_name in names(hmaps)) {
  safe <- gsub("[^A-Za-z0-9]+", "_", cat_name)
  h <- hmaps[[cat_name]]

  # Estimate dimensions for individual files
  n_genes <- nrow(h$gtable$grobs[[1]]$children[[1]]$grobs[[1]]$children[[1]]$vp$layout$heights) %/% 1
  h_in <- max(6, 16)
  w_in <- 18

  for (ext in c("png", "pdf")) {
    out_path <- paste0(out_prefix, "_", safe, ".", ext)
    if (ext == "png") {
      png(out_path, width = w_in, height = h_in, units = "in", res = 300)
    } else {
      pdf(out_path, width = w_in, height = h_in)
    }
    grid.newpage()
    grid.draw(h$gtable)
    dev.off()
    message(sprintf("  Saved: %s", basename(out_path)))
  }
}

# ── Combined multi-panel PDF + PNG ────────────────────────────────────────────
ncols <- 2
nrows <- ceiling(n_cats / ncols)
panel_w <- 18
panel_h <- 16
total_w  <- ncols * panel_w
total_h  <- nrows * panel_h

for (ext in c("pdf", "png")) {
  out_path <- paste0(out_prefix, "_combined.", ext)
  if (ext == "png") {
    png(out_path, width = total_w, height = total_h, units = "in", res = 300)
  } else {
    pdf(out_path, width = total_w, height = total_h)
  }

  grid.newpage()
  pushViewport(viewport(
    layout = grid.layout(
      nrow    = nrows,
      ncol    = ncols,
      widths  = unit(rep(1 / ncols, ncols), "npc"),
      heights = unit(rep(1 / nrows, nrows), "npc")
    )
  ))

  cat_names <- names(hmaps)
  for (i in seq_along(cat_names)) {
    row_pos <- ceiling(i / ncols)
    col_pos <- ((i - 1) %% ncols) + 1
    pushViewport(viewport(layout.pos.row = row_pos, layout.pos.col = col_pos))
    grid.draw(hmaps[[cat_names[i]]]$gtable)
    popViewport()
  }

  dev.off()
  message(sprintf("Combined %s saved: %s", ext, basename(out_path)))
}

message("\n=== render_category_heatmaps.R complete ===")
