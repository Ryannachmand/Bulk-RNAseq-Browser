suppressPackageStartupMessages({
  library(clusterProfiler)
  library(AnnotationDbi)
  library(readr)
  library(jsonlite)
  library(dplyr)
})

# Verify species-specific annotation packages explicitly before loading
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: run_enrichgo.R <params.json>")

params          <- fromJSON(args[1])
de_csv_path     <- params$de_csv_path
species         <- params$species        # "human" or "mouse"
padj_cutoff     <- params$padj_cutoff    # e.g. 0.05
lfc_cutoff      <- params$lfc_cutoff     # e.g. 1.0
output_csv_path <- params$output_csv_path

# ── Select annotation package ─────────────────────────────────────────────────
if (species == "human") {
  if (!requireNamespace("org.Hs.eg.db", quietly = TRUE))
    stop("Missing R package: org.Hs.eg.db — install from Bioconductor before running pathway analysis")
  library(org.Hs.eg.db)
  org_db <- org.Hs.eg.db
} else if (species == "mouse") {
  if (!requireNamespace("org.Mm.eg.db", quietly = TRUE))
    stop("Missing R package: org.Mm.eg.db — install from Bioconductor before running pathway analysis")
  library(org.Mm.eg.db)
  org_db <- org.Mm.eg.db
} else {
  stop(sprintf("Unknown species '%s'; expected 'human' or 'mouse'", species))
}

if (!requireNamespace("clusterProfiler", quietly = TRUE))
  stop("Missing R package: clusterProfiler — install from Bioconductor before running pathway analysis")

# ── Load DE results ───────────────────────────────────────────────────────────
message(sprintf("Loading DE results: %s", de_csv_path))
de <- read_csv(de_csv_path, show_col_types = FALSE)

# Detect gene-symbol column (prefer 'symbol' over 'gene')
sym_col <- if ("symbol" %in% names(de)) "symbol" else if ("gene" %in% names(de)) "gene" else
  stop("DE table has neither 'symbol' nor 'gene' column")

message(sprintf("Using '%s' column for gene identifiers (%d total genes)", sym_col, nrow(de)))

# ── Filter significant genes ──────────────────────────────────────────────────
sig <- de[!is.na(de$padj) & !is.na(de$log2FoldChange) &
          de$padj < padj_cutoff & abs(de$log2FoldChange) > lfc_cutoff, ]

n_up   <- sum(sig$log2FoldChange > 0, na.rm = TRUE)
n_down <- sum(sig$log2FoldChange < 0, na.rm = TRUE)
message(sprintf("Significant genes: %d up, %d down (padj < %.3f, |LFC| > %.2f)",
                n_up, n_down, padj_cutoff, lfc_cutoff))

# ── Map symbols to ENTREZID ───────────────────────────────────────────────────
map_to_entrez <- function(symbols, db) {
  syms_clean <- unique(symbols[!is.na(symbols) & nchar(symbols) > 0])
  if (length(syms_clean) == 0) return(character(0))
  ids <- mapIds(db, keys = syms_clean, keytype = "SYMBOL",
                column = "ENTREZID", multiVals = "first")
  as.character(ids[!is.na(ids)])
}

up_entrez      <- map_to_entrez(sig[[sym_col]][sig$log2FoldChange > 0],   org_db)
down_entrez    <- map_to_entrez(sig[[sym_col]][sig$log2FoldChange < 0],   org_db)
universe_entrez <- map_to_entrez(de[[sym_col]], org_db)

message(sprintf("ENTREZID mapping: %d up, %d down, %d universe",
                length(up_entrez), length(down_entrez), length(universe_entrez)))

# ── Run enrichGO (Biological Process) ────────────────────────────────────────
run_enrich <- function(gene_ids, direction_label) {
  if (length(gene_ids) == 0) {
    message(sprintf("No %s genes after ENTREZID mapping — skipping", direction_label))
    return(NULL)
  }
  message(sprintf("enrichGO (%s): %d genes", direction_label, length(gene_ids)))
  res <- tryCatch(
    enrichGO(
      gene          = gene_ids,
      OrgDb         = org_db,
      keyType       = "ENTREZID",
      ont           = "BP",
      pAdjustMethod = "BH",
      universe      = universe_entrez,
      readable      = TRUE   # converts ENTREZID back to gene symbols in geneID column
    ),
    error = function(e) {
      message(sprintf("enrichGO error for %s genes: %s", direction_label, conditionMessage(e)))
      NULL
    }
  )
  if (is.null(res)) return(NULL)
  df <- as.data.frame(res)
  if (nrow(df) == 0) {
    message(sprintf("No enriched BP terms for %s genes", direction_label))
    return(NULL)
  }
  df$direction <- direction_label
  df
}

up_res   <- run_enrich(up_entrez,   "up")
down_res <- run_enrich(down_entrez, "down")

all_res <- bind_rows(up_res, down_res)

# ── Format and write output ───────────────────────────────────────────────────
# Schema must match what PathwayBarplotSection.jsx expects.
if (nrow(all_res) == 0) {
  empty <- data.frame(
    Description = character(), Description_short = character(),
    Count = integer(), p.adjust = double(),
    neg_log10_padj = double(), neg_log10_padj_signed = double(),
    direction = character(), geneID = character(),
    stringsAsFactors = FALSE
  )
  write_csv(empty, output_csv_path)
  message("No enriched pathways found; empty results written")
  quit(status = 0)
}

all_res$Description_short     <- substr(all_res$Description, 1, 50)
all_res$neg_log10_padj        <- -log10(all_res$p.adjust)
all_res$neg_log10_padj_signed <- ifelse(
  all_res$direction == "up",
   all_res$neg_log10_padj,
  -all_res$neg_log10_padj
)

out <- all_res[, c("Description", "Description_short", "Count",
                   "p.adjust", "neg_log10_padj", "neg_log10_padj_signed",
                   "direction", "geneID")]
out <- out[order(-out$neg_log10_padj), ]

write_csv(out, output_csv_path)
message(sprintf("Done. %d pathways written (%d up, %d down)",
  nrow(out), sum(out$direction == "up"), sum(out$direction == "down")
))
