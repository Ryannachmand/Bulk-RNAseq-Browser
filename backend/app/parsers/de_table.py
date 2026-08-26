import io
import pandas as pd


class DetectionError(ValueError):
    pass


# Aliases that map to the canonical "gene" column
SYMBOL_ALIASES = {"gene", "symbol", "gene_name", "gene_symbol", "name", "genename", "hgnc_symbol"}


def parse_de_table(content: bytes, filename: str = "") -> pd.DataFrame:
    sep = "\t" if filename.lower().endswith(".tsv") else ","
    try:
        df = pd.read_csv(io.BytesIO(content), sep=sep)
    except Exception:
        sep = "\t" if sep == "," else ","
        df = pd.read_csv(io.BytesIO(content), sep=sep)

    # R writes rownames as an unnamed first column; treat it as gene if present
    first_col = str(df.columns[0])
    if first_col.startswith("Unnamed:") or first_col == "":
        df = df.rename(columns={df.columns[0]: "gene"})

    lower_cols = {c.lower(): c for c in df.columns}

    # Require the two DE-table essentials
    missing = {"log2foldchange", "padj"} - set(lower_cols.keys())
    if missing:
        raise DetectionError(
            f"Missing required columns: {', '.join(sorted(missing))}. "
            f"File has: {', '.join(df.columns.tolist())}"
        )

    # Require at least one recognisable gene/symbol column
    sym_key = next((k for k in SYMBOL_ALIASES if k in lower_cols), None)
    if sym_key is None:
        raise DetectionError(
            f"No gene/symbol column found. Expected one of: {', '.join(sorted(SYMBOL_ALIASES))}. "
            f"File has: {', '.join(df.columns.tolist())}"
        )

    # Normalise to canonical column names
    rename = {}
    sym_orig = lower_cols[sym_key]
    if sym_orig != "gene":
        rename[sym_orig] = "gene"
    lfc_orig = lower_cols["log2foldchange"]
    if lfc_orig != "log2FoldChange":
        rename[lfc_orig] = "log2FoldChange"
    if rename:
        df = df.rename(columns=rename)

    # Output: gene, log2FoldChange, padj, FPKM_* columns, optional extras
    keep = ["gene", "log2FoldChange", "padj"]
    keep += [c for c in df.columns if c.upper().startswith("FPKM_")]
    for opt in ["baseMean", "lfcSE", "stat", "pvalue"]:
        if opt in df.columns:
            keep.append(opt)

    return df[[c for c in keep if c in df.columns]].copy()
