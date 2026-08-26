#!/usr/bin/env Rscript
# render_pathway_barplot.R
# Reproduces the diverging pathway barplot from Yang/Pathways.R (lines 268-348)
# and Ahsan/pathway_ATOH8_Control.R (lines 149-193).
#
# Usage: Rscript render_pathway_barplot.R <pathway_csv> <params_json> <out_prefix>
# Output: <out_prefix>.png (300 dpi)  and  <out_prefix>.pdf

suppressPackageStartupMessages({
  library(ggplot2)
  library(dplyr)
  library(scales)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) {
  stop("Usage: render_pathway_barplot.R <pathway_csv> <params_json> <out_prefix>")
}
csv_path    <- args[1]
params_path <- args[2]
out_prefix  <- args[3]

params              <- fromJSON(params_path)
top_n               <- as.integer(params$top_n)
direction_available <- isTRUE(params$direction_available)
plot_title          <- if (!is.null(params$plot_title) && nchar(params$plot_title) > 0)
                         params$plot_title else "Pathway Enrichment"

df <- read.csv(csv_path, stringsAsFactors = FALSE)

# ── Ensure computed columns exist ────────────────────────────────────────────

if (!"neg_log10_padj" %in% colnames(df)) {
  df$neg_log10_padj <- -log10(pmax(df$p.adjust, 1e-300))
}

if (!"Description_short" %in% colnames(df)) {
  df$Description_short <- ifelse(
    nchar(df$Description) > 50,
    paste0(substr(df$Description, 1, 47), "..."),
    df$Description
  )
}

df$Count <- as.integer(df$Count)

# ── Select top N pathways and build plot data ────────────────────────────────

if (direction_available && "direction" %in% colnames(df)) {
  up   <- df[df$direction == "Upregulated",   ]
  down <- df[df$direction == "Downregulated",  ]

  # top_n per direction (Yang uses top 12 per direction; we use ceiling(top_n/2))
  n_per_dir <- ceiling(top_n / 2)
  up   <- head(up[order(-up$neg_log10_padj), ],   n_per_dir)
  down <- head(down[order(-down$neg_log10_padj), ], n_per_dir)

  if (nrow(up) == 0 && nrow(down) == 0) {
    stop("No pathway rows remain after filtering to top N per direction.")
  }

  up$neg_log10_padj_plot   <-  up$neg_log10_padj
  down$neg_log10_padj_plot <- -down$neg_log10_padj

  plot_data <- rbind(up, down)
  plot_data <- plot_data[order(plot_data$neg_log10_padj_plot), ]
  plot_data$Description_short <- factor(
    plot_data$Description_short,
    levels = unique(plot_data$Description_short)
  )
  plot_data$label <- sprintf("n=%d", plot_data$Count)

  max_val <- max(abs(plot_data$neg_log10_padj_plot), na.rm = TRUE) * 1.15

  # Label hjust: outside bar end
  plot_data$label_x <- ifelse(
    plot_data$direction == "Upregulated",
    plot_data$neg_log10_padj_plot + max_val * 0.03,
    plot_data$neg_log10_padj_plot - max_val * 0.03
  )
  plot_data$label_hjust <- ifelse(plot_data$direction == "Upregulated", 0, 1)

  # Colors matching Yang Pathways.R lines 667-668
  fill_colors <- c("Upregulated" = "#E41A1C", "Downregulated" = "#FB9A99")

  p <- ggplot(plot_data,
              aes(x = neg_log10_padj_plot,
                  y = Description_short,
                  fill = direction)) +
    geom_bar(stat = "identity", width = 0.9) +
    geom_text(
      aes(label = label, x = label_x, hjust = label_hjust),
      size = 3, color = "black"
    ) +
    geom_vline(xintercept = 0, color = "black", linewidth = 0.5) +
    scale_fill_manual(values = fill_colors) +
    scale_x_continuous(
      limits = c(-max_val, max_val),
      labels = function(x) abs(x),
      breaks = pretty_breaks(n = 6)
    ) +
    labs(
      title = plot_title,
      x     = "-log10(adjusted p-value)",
      y     = NULL,
      fill  = "Direction"
    ) +
    theme_bw() +
    theme(
      plot.title            = element_text(hjust = 0.5, size = 16, face = "bold"),
      axis.text.y           = element_text(size = 14),
      axis.text.x           = element_text(size = 13.5),
      axis.title.x          = element_text(size = 14),
      legend.position       = "bottom",
      legend.title          = element_text(size = 13.5),
      legend.text           = element_text(size = 13.5),
      panel.grid.major.y    = element_blank(),
      panel.grid.minor      = element_blank()
    )

} else {
  # Single-direction: bars sorted by significance, most significant at top
  plot_data <- head(df[order(-df$neg_log10_padj), ], top_n)
  if (nrow(plot_data) == 0) stop("No pathway rows in data.")

  plot_data <- plot_data[order(plot_data$neg_log10_padj), ]
  plot_data$Description_short <- factor(
    plot_data$Description_short,
    levels = unique(plot_data$Description_short)
  )
  plot_data$label <- sprintf("n=%d", plot_data$Count)
  max_val <- max(plot_data$neg_log10_padj, na.rm = TRUE) * 1.15

  p <- ggplot(plot_data,
              aes(x = neg_log10_padj, y = Description_short)) +
    geom_bar(stat = "identity", width = 0.9, fill = "#E41A1C") +
    geom_text(
      aes(label = label, x = neg_log10_padj + max_val * 0.03),
      hjust = 0, size = 3, color = "black"
    ) +
    scale_x_continuous(
      limits = c(0, max_val),
      breaks = pretty_breaks(n = 6)
    ) +
    labs(
      title = plot_title,
      x     = "-log10(adjusted p-value)",
      y     = NULL
    ) +
    theme_bw() +
    theme(
      plot.title         = element_text(hjust = 0.5, size = 16, face = "bold"),
      axis.text.y        = element_text(size = 14),
      axis.text.x        = element_text(size = 13.5),
      axis.title.x       = element_text(size = 14),
      panel.grid.major.y = element_blank(),
      panel.grid.minor   = element_blank()
    )
}

# ── Save outputs ─────────────────────────────────────────────────────────────

# Fixed dimensions matching Yang Pathways.R lines 691-692 (9 × 7.2 in)
ggsave(paste0(out_prefix, ".pdf"), p, width = 9, height = 7.2)
ggsave(paste0(out_prefix, ".png"), p, width = 9, height = 7.2, dpi = 300)

cat(sprintf("Pathway barplot written to %s.png / .pdf\n", out_prefix))
