import io
import pandas as pd


class RawCountsParseError(Exception):
    pass


def parse_raw_counts_matrix(contents: bytes, filename: str = "") -> pd.DataFrame:
    """Parse a gene × sample raw counts matrix (CSV or TSV).

    First column must be Ensembl gene IDs. A 'Length' column is silently ignored.
    Returns a DataFrame with gene_id as index and samples as columns.
    """
    sep = "\t" if (filename.endswith(".tsv") or b"\t" in contents[:2000]) else ","
    try:
        df = pd.read_csv(io.BytesIO(contents), sep=sep, index_col=0)
    except Exception as e:
        raise RawCountsParseError(f"Could not parse file: {e}")

    if df.empty:
        raise RawCountsParseError("File is empty or has no data rows")

    # Drop Length column if present (used for FPKM; not needed for DE)
    if "Length" in df.columns:
        df = df.drop(columns=["Length"])

    if df.shape[1] < 2:
        raise RawCountsParseError(
            f"Matrix has only {df.shape[1]} sample column(s); at least 2 required"
        )

    try:
        df = df.apply(pd.to_numeric, errors="raise")
    except Exception:
        raise RawCountsParseError("Non-numeric values found in counts matrix")

    if (df < 0).any().any():
        raise RawCountsParseError("Negative values found in counts matrix")

    return df
