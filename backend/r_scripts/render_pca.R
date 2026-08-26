suppressPackageStartupMessages({
  library(ggplot2)
  library(ggrepel)
  library(RColorBrewer)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: render_pca.R <coords.json> <output_prefix>")
}

coords_path <- args[1]
out_prefix  <- args[2]

data <- fromJSON(coords_path)

pc_x          <- data$pc_x           # "PC1", "PC2", or "PC3"
pc_y          <- data$pc_y
use_corrected <- isTRUE(data$use_corrected)

# Select raw or batch-corrected coordinates
has_corrected <- !is.null(data$corrected)

if (use_corrected && has_corrected) {
  pc_coords  <- data$corrected
  plot_title <- paste0("PCA (Batch Corrected) - ", pc_x, " vs ", pc_y)
} else {
  pc_coords  <- data$raw
  plot_title <- paste0("PCA - ", pc_x, " vs ", pc_y)
}

samples    <- data$raw$samples
sample_meta <- data$raw$sample_meta
conditions <- sapply(samples, function(s) sample_meta[[s]]$condition)

pc_idx <- c("PC1" = 1L, "PC2" = 2L, "PC3" = 3L)
var_exp <- pc_coords$var_explained

x_vals <- pc_coords[[pc_x]]
y_vals <- pc_coords[[pc_y]]

pca_df <- data.frame(
  x         = x_vals,
  y         = y_vals,
  condition = conditions,
  label     = samples,
  stringsAsFactors = FALSE
)

unique_conds <- unique(conditions)
n_cond       <- length(unique_conds)

if (n_cond <= 8) {
  cond_colors <- setNames(
    brewer.pal(max(3L, n_cond), "Set2")[seq_len(n_cond)],
    unique_conds
  )
} else {
  cond_colors <- setNames(
    colorRampPalette(brewer.pal(8, "Set2"))(n_cond),
    unique_conds
  )
}

x_label <- sprintf("%s: %.1f%% variance", pc_x, var_exp[pc_idx[pc_x]])
y_label <- sprintf("%s: %.1f%% variance", pc_y, var_exp[pc_idx[pc_y]])

# Yang NewPCA2.R style: geom_point(size=3, alpha=0.8), geom_text_repel(size=2.95)
p <- ggplot(pca_df, aes(x = x, y = y, color = condition, label = label)) +
  geom_point(size = 3, alpha = 0.8) +
  geom_text_repel(size = 2.95, max.overlaps = 50, segment.size = 0.2) +
  xlab(x_label) +
  ylab(y_label) +
  ggtitle(plot_title) +
  labs(caption = "PCA computed from FPKM (log2-transformed), not VST") +
  theme_bw() +
  theme(
    plot.title   = element_text(hjust = 0.5, size = 14, face = "bold"),
    plot.caption = element_text(size = 9, color = "grey50", hjust = 0),
    legend.position    = "right",
    panel.grid.minor   = element_blank()
  ) +
  scale_color_manual(values = cond_colors, name = "Condition") +
  guides(color = guide_legend(ncol = 1))

png_path <- paste0(out_prefix, ".png")
pdf_path <- paste0(out_prefix, ".pdf")

# 9×6 in at 300 dpi — matching NewPCA2.R output dimensions
ggsave(png_path, p, width = 9, height = 6, dpi = 300)
ggsave(pdf_path, p, width = 9, height = 6)

cat(sprintf("PNG:%s\n", png_path))
cat(sprintf("PDF:%s\n", pdf_path))
