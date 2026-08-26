import io

import numpy as np
import pandas as pd


class PathwayParseError(ValueError):
    pass


# Minimum required columns to identify a pathway results table
_REQUIRED_LOWER = {"id", "description", "p.adjust", "count", "geneid"}


def parse_pathway_table(content: bytes, filename: str = "") -> tuple[pd.DataFrame, dict]:
    """Parse a clusterProfiler enrichGO / enrichKEGG results CSV.

    Returns (df, meta) where meta["direction_available"] is True when the
    'direction' column is present and non-null.

    Computed columns added on ingest (if not already present):
      neg_log10_padj          = -log10(p.adjust)
      Description_short       = Description truncated to ≤50 chars
      neg_log10_padj_signed   = +neg_log10_padj for Upregulated,
                                -neg_log10_padj for Downregulated
    """
    sep = "\t" if filename.lower().endswith(".tsv") else ","
    try:
        df = pd.read_csv(io.BytesIO(content), sep=sep)
    except Exception:
        sep = "\t" if sep == "," else ","
        df = pd.read_csv(io.BytesIO(content), sep=sep)

    # R writes rownames as an unnamed first column
    if str(df.columns[0]).startswith("Unnamed:") or str(df.columns[0]) == "":
        df = df.drop(columns=df.columns[0])

    lower_cols = {c.lower(): c for c in df.columns}

    # Reject DE results tables
    if "log2foldchange" in lower_cols:
        raise PathwayParseError(
            "This looks like a DE results table (has log2FoldChange). "
            "Pathway tables should have columns: ID, Description, p.adjust, Count, geneID."
        )

    # Reject FPKM matrices (no p.adjust, no geneID)
    missing = _REQUIRED_LOWER - set(lower_cols.keys())
    if missing:
        raise PathwayParseError(
            f"Missing required pathway columns: {', '.join(sorted(missing))}. "
            f"Expected: ID, Description, p.adjust, Count, geneID. "
            f"File has: {', '.join(df.columns.tolist())}"
        )

    # Canonicalise column names
    rename = {}
    canonical = {
        "id": "ID",
        "description": "Description",
        "generatio": "GeneRatio",
        "bgratio": "BgRatio",
        "pvalue": "pvalue",
        "p.adjust": "p.adjust",
        "qvalue": "qvalue",
        "geneid": "geneID",
        "count": "Count",
        "direction": "direction",
        "neg_log10_padj": "neg_log10_padj",
        "description_short": "Description_short",
    }
    for lower, orig in lower_cols.items():
        if lower in canonical and orig != canonical[lower]:
            rename[orig] = canonical[lower]
    if rename:
        df = df.rename(columns=rename)

    df["p.adjust"] = pd.to_numeric(df["p.adjust"], errors="coerce")
    df["Count"] = pd.to_numeric(df["Count"], errors="coerce")

    # Compute neg_log10_padj if absent
    if "neg_log10_padj" not in df.columns:
        df["neg_log10_padj"] = -np.log10(df["p.adjust"].clip(lower=1e-300))

    # Compute Description_short if absent
    if "Description_short" not in df.columns:
        def _shorten(d: str) -> str:
            s = str(d)
            return (s[:47] + "...") if len(s) > 50 else s
        df["Description_short"] = df["Description"].apply(_shorten)

    # Determine if direction data is available
    direction_available = (
        "direction" in df.columns
        and df["direction"].notna().any()
        and df["direction"].astype(str).str.strip().ne("").any()
    )

    # Compute signed value for diverging barplot
    if direction_available:
        df["neg_log10_padj_signed"] = np.where(
            df["direction"].str.lower().str.startswith("up"),
            df["neg_log10_padj"],
            -df["neg_log10_padj"],
        )
    else:
        df["neg_log10_padj_signed"] = df["neg_log10_padj"]

    # Drop R-generated 'label' column — we regenerate it at render time
    if "label" in df.columns:
        df = df.drop(columns=["label"])

    meta = {"direction_available": bool(direction_available)}
    return df, meta
