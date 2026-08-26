suppressPackageStartupMessages({
  library(tidyverse)
  library(ggrepel)
  library(patchwork)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) {
  stop("Usage: render_category_volcanos.R <params.json>")
}

params_path <- args[1]
params <- fromJSON(params_path, simplifyDataFrame = FALSE)

de_path      <- params$de_path
categories   <- params$categories     # list of {name, genes}
PADJ_CUTOFF  <- params$padj_cutoff
LFC_CUTOFF   <- params$lfc_cutoff
N_LABEL      <- as.integer(params$n_label)
out_prefix   <- params$out_prefix

message("Loading DE results: ", de_path)
df <- read_csv(de_path, show_col_types = FALSE)

# Normalise gene-symbol column
if ("gene" %in% names(df) && !"symbol" %in% names(df)) {
  df <- df %>% rename(symbol = gene)
}
if (!"symbol" %in% names(df)) stop("DE table has no 'gene' or 'symbol' column")

df <- df %>%
  filter(!is.na(padj), !is.na(log2FoldChange), !is.na(symbol)) %>%
  mutate(
    neg_log10_padj = pmin(-log10(padj), 300),
    significance   = case_when(
      padj < PADJ_CUTOFF & log2FoldChange >  LFC_CUTOFF ~ "Up",
      padj < PADJ_CUTOFF & log2FoldChange < -LFC_CUTOFF ~ "Down",
      TRUE ~ "NS"
    )
  )

message(sprintf("  %d genes after filtering", nrow(df)))

# ── Colour scheme (matches existing volcano style) ────────────────────────────
colors_all <- c("Up" = "firebrick4", "Down" = "steelblue2", "NS" = "grey70")

build_panel <- function(cat_name, cat_genes) {
  # Split DF into background and category
  cat_df  <- df %>% filter(symbol %in% cat_genes)
  bg_df   <- df %>% filter(!symbol %in% cat_genes)

  if (nrow(cat_df) == 0) {
    message(sprintf("  [%s] 0 category genes in DE table — skipping", cat_name))
    return(NULL)
  }

  # Pick top N_LABEL genes to label: most significant UP + DOWN within category
  label_up <- cat_df %>% filter(significance == "Up") %>%
    arrange(padj) %>% head(ceiling(N_LABEL / 2)) %>% pull(symbol)
  label_dn <- cat_df %>% filter(significance == "Down") %>%
    arrange(padj) %>% head(ceiling(N_LABEL / 2)) %>% pull(symbol)
  to_label <- c(label_up, label_dn)

  cat_df <- cat_df %>%
    mutate(label = ifelse(symbol %in% to_label, symbol, ""))

  # Category gene marker size: a bit larger than background
  message(sprintf("  [%s] %d category genes (%d up, %d down, %d NS), %d labelled",
    cat_name, nrow(cat_df),
    sum(cat_df$significance == "Up"),
    sum(cat_df$significance == "Down"),
    sum(cat_df$significance == "NS"),
    length(to_label)
  ))

  ggplot() +
    # Background: all non-category genes (grey, small, low opacity)
    geom_point(data = bg_df,
               aes(x = log2FoldChange, y = neg_log10_padj),
               color = "grey85", size = 0.7, alpha = 0.4) +
    # Category genes: coloured by significance
    geom_point(data = cat_df,
               aes(x = log2FoldChange, y = neg_log10_padj, color = significance),
               size = 2, alpha = 0.85) +
    # Gene labels (repelled)
    geom_text_repel(
      data          = cat_df %>% filter(label != ""),
      aes(x = log2FoldChange, y = neg_log10_padj, label = label),
      size          = 3.5,
      max.overlaps  = Inf,
      segment.size  = 0.25,
      segment.color = "grey50",
      color         = "black",
      fontface      = "italic"
    ) +
    geom_vline(xintercept = c(-LFC_CUTOFF, LFC_CUTOFF),
               linetype = "dashed", color = "grey40", linewidth = 0.3) +
    geom_hline(yintercept = -log10(PADJ_CUTOFF),
               linetype = "dashed", color = "grey40", linewidth = 0.3) +
    scale_color_manual(values = colors_all) +
    labs(
      title = cat_name,
      x     = "log2 Fold Change",
      y     = "-log10(padj)"
    ) +
    theme_bw() +
    theme(
      plot.title       = element_text(size = 12, face = "bold"),
      axis.title       = element_text(size = 10),
      axis.text        = element_text(size = 9),
      panel.grid.major = element_blank(),
      panel.grid.minor = element_blank(),
      panel.border     = element_rect(color = "black", linewidth = 0.5),
      legend.position  = "none"
    )
}

message("\n--- Building category volcano panels ---")
panels <- list()
for (cat in categories) {
  p <- build_panel(cat$name, cat$genes)
  if (!is.null(p)) panels[[cat$name]] <- p
}

n_panels <- length(panels)
if (n_panels == 0) stop("No category panels produced — check that gene symbols match the DE table")

# ── Individual panel files ────────────────────────────────────────────────────
for (cat_name in names(panels)) {
  safe <- gsub("[^A-Za-z0-9]+", "_", cat_name)
  for (ext in c("png", "pdf")) {
    out_path <- paste0(out_prefix, "_", safe, ".", ext)
    ggsave(out_path, panels[[cat_name]], width = 6, height = 5,
           dpi = if (ext == "png") 200 else 72)
    message(sprintf("  Saved: %s", basename(out_path)))
  }
}

# ── Combined patchwork ────────────────────────────────────────────────────────
message(sprintf("\n--- Assembling %d-panel patchwork ---", n_panels))
ncols   <- 2
nrows   <- ceiling(n_panels / ncols)
pw_w    <- ncols * 6
pw_h    <- nrows * 5

combined <- wrap_plots(panels, ncol = ncols)

for (ext in c("png", "pdf")) {
  out_path <- paste0(out_prefix, "_combined.", ext)
  ggsave(out_path, combined, width = pw_w, height = pw_h,
         dpi = if (ext == "png") 200 else 72)
  message(sprintf("Combined %s saved: %s", ext, basename(out_path)))
}

message("\n=== render_category_volcanos.R complete ===")
