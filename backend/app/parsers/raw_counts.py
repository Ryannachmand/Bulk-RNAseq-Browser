import io
import pandas as pd


class RawCountsParseError(Exception):
    pass


def parse_raw_counts_matrix(
    contents: bytes, filename: str = ""
) -> tuple[pd.DataFrame, pd.Series | None]:
    """Parse a gene × sample raw counts matrix (CSV or TSV).

    First column must be Ensembl gene IDs. If a 'Length' column is present it
    is extracted and returned as a Series (index=gene_ids, name='length') for
    FPKM computation; it is not included in the counts DataFrame.

    Returns (counts_df, gene_lengths_or_None).
    """
    sep = "\t" if (filename.endswith(".tsv") or b"\t" in contents[:2000]) else ","
    try:
        df = pd.read_csv(io.BytesIO(contents), sep=sep, index_col=0)
    except Exception as e:
        raise RawCountsParseError(f"Could not parse file: {e}")

    if df.empty:
        raise RawCountsParseError("File is empty or has no data rows")

    gene_lengths: pd.Series | None = None
    if "Length" in df.columns:
        try:
            gene_lengths = pd.to_numeric(df["Length"], errors="raise").rename("length")
        except Exception:
            gene_lengths = None
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

    return df, gene_lengths
