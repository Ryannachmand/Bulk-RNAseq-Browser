import io
import pandas as pd


class FPKMParseError(ValueError):
    pass


def parse_fpkm_matrix(content: bytes, filename: str = "") -> pd.DataFrame:
    """Parse a genes × samples FPKM matrix CSV or TSV.

    Returns a DataFrame with:
    - Index named "gene": gene symbols or IDs (first column of the file)
    - Columns: sample names
    - Values: float FPKM values

    Handles R's write.csv convention where the row-names column has an empty
    header cell (\"\",\"sample1\",\"sample2\",...) — this is the shifted-index
    problem that breaks naive reads.
    """
    sep = "\t" if filename.lower().endswith(".tsv") else ","
    try:
        df = pd.read_csv(io.BytesIO(content), sep=sep)
    except pd.errors.EmptyDataError:
        raise FPKMParseError("File is empty.")
    except Exception:
        try:
            sep = "\t" if sep == "," else ","
            df = pd.read_csv(io.BytesIO(content), sep=sep)
        except pd.errors.EmptyDataError:
            raise FPKMParseError("File is empty.")

    if df.empty or df.shape[1] < 2:
        raise FPKMParseError(
            f"File appears empty or has too few columns ({df.shape[1]}). "
            "Expected: one gene-identifier column followed by ≥2 sample columns."
        )

    # Detect the gene-id column: it is non-numeric (contains gene symbols/IDs).
    # This covers both R's unnamed index column ("Unnamed: 0" after pd.read_csv)
    # and explicitly named columns like "gene", "symbol", "gene_id".
    first_col_data = df.iloc[:, 0]
    if not pd.api.types.is_numeric_dtype(first_col_data):
        df = df.rename(columns={df.columns[0]: "gene"}).set_index("gene")
    else:
        raise FPKMParseError(
            "First column appears to contain numeric values; expected gene symbols or IDs. "
            f"Found columns: {list(df.columns)[:8]}"
        )

    # All remaining columns must be numeric sample columns.
    non_numeric = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]
    if non_numeric:
        raise FPKMParseError(
            f"Non-numeric sample columns detected: {non_numeric[:5]}. "
            "All columns after the gene identifier must contain numeric FPKM values."
        )

    if df.shape[1] < 2:
        raise FPKMParseError(
            f"Too few sample columns: {df.shape[1]}. Expected ≥ 2 samples."
        )
    if df.shape[0] < 1:
        raise FPKMParseError("No gene rows found in the file.")

    df.index.name = "gene"
    return df
