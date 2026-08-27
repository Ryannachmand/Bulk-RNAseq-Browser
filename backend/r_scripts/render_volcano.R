suppressPackageStartupMessages({
  library(tidyverse)
  library(ggrepel)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) {
  stop("Usage: render_volcano.R <de_results.csv> <params.json> <output_prefix>")
}

csv_path    <- args[1]
params_path <- args[2]
out_prefix  <- args[3]

params <- fromJSON(params_path)
PADJ_CUTOFF  <- params$padj_cutoff
LFC_CUTOFF   <- params$lfc_cutoff
N_LABEL      <- params$n_label
CUSTOM_GENES <- params$custom_genes  # character vector or NULL
PLOT_TITLE   <- params$plot_title

df <- read_csv(csv_path, show_col_types = FALSE)

# Column may be named "gene" or "symbol" — normalise
if ("gene" %in% names(df) && !"symbol" %in% names(df)) {
  df <- df %>% rename(symbol = gene)
}

plot_df <- df %>%
  filter(!is.na(padj)) %>%
  mutate(
    neg_log10_padj = -log10(padj),
    significance = case_when(
      padj < PADJ_CUTOFF & log2FoldChange >  LFC_CUTOFF ~ "Up",
      padj < PADJ_CUTOFF & log2FoldChange < -LFC_CUTOFF ~ "Down",
      TRUE ~ "NS"
    )
  )

genes_to_label_up <- plot_df %>%
  filter(significance == "Up") %>%
  arrange(padj) %>%
  head(N_LABEL) %>%
  pull(symbol)

genes_to_label_down <- plot_df %>%
  filter(significance == "Down") %>%
  arrange(padj) %>%
  head(N_LABEL) %>%
  pull(symbol)

genes_to_label <- c(genes_to_label_up, genes_to_label_down)

if (!is.null(CUSTOM_GENES) && length(CUSTOM_GENES) > 0) {
  custom_found   <- CUSTOM_GENES[CUSTOM_GENES %in% plot_df$symbol]
  genes_to_label <- unique(c(genes_to_label, custom_found))
  missing_genes  <- setdiff(CUSTOM_GENES, plot_df$symbol)
  if (length(missing_genes) > 0) {
    message(sprintf("Custom genes not found in data: %s", paste(missing_genes, collapse = ", ")))
  }
}

plot_df$label <- ifelse(plot_df$symbol %in% genes_to_label, plot_df$symbol, "")

colors <- c("Up" = "firebrick4", "Down" = "steelblue2", "NS" = "grey70")

volcano <- ggplot(plot_df, aes(x = log2FoldChange, y = neg_log10_padj, color = significance)) +
  geom_point(size = 1, alpha = 0.7) +
  geom_text_repel(
    aes(label = label),
    size          = 3.45,
    max.overlaps  = Inf,
    segment.size  = 0.2,
    segment.color = "grey50",
    color         = "black"
  ) +
  geom_vline(xintercept = c(-LFC_CUTOFF, LFC_CUTOFF),
             linetype = "dashed", color = "grey40", linewidth = 0.3) +
  geom_hline(yintercept = -log10(PADJ_CUTOFF),
             linetype = "dashed", color = "grey40", linewidth = 0.3) +
  scale_color_manual(values = colors) +
  xlab("log2 Fold Change") +
  ylab("-log10(adjusted p-value)") +
  ggtitle(PLOT_TITLE) +
  theme_bw() +
  theme(
    plot.title        = element_text(hjust = 0, size = 12),
    axis.title        = element_text(size = 10),
    axis.text.x       = element_text(size = 12),
    axis.text.y       = element_text(size = 12),
    panel.grid.major  = element_blank(),
    panel.grid.minor  = element_blank(),
    panel.border      = element_rect(color = "black", linewidth = 0.5),
    legend.position   = "none"
  )

pdf_path <- paste0(out_prefix, ".pdf")
png_path <- paste0(out_prefix, ".png")

ggsave(pdf_path, volcano, width = 8, height = 6)
ggsave(png_path, volcano, width = 8, height = 5.25, dpi = 300)

cat(sprintf("PNG:%s\n", png_path))
cat(sprintf("PDF:%s\n", pdf_path))
