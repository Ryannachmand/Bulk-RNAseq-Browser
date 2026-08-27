import os
import pandas as pd


class StarFolderParseError(Exception):
    pass


def parse_star_folder(folder_path: str) -> pd.DataFrame:
    """Parse a flat STAR output folder containing *.ReadsPerGene.out.tab files.

    Folder layout: one <sample>.ReadsPerGene.out.tab per sample (flat, no subdirs).
    Always uses column 4 (reverse-stranded) — fixed convention for this app.
    Joins on gene_id explicitly; identical row order across files is not assumed.
    Sample name = filename stem before '.ReadsPerGene.out.tab'.
    """
    if not os.path.isdir(folder_path):
        raise StarFolderParseError(f"Not a directory: {folder_path}")

    tab_files = sorted(
        f for f in os.listdir(folder_path)
        if f.endswith(".ReadsPerGene.out.tab")
    )
    if not tab_files:
        raise StarFolderParseError(
            f"No .ReadsPerGene.out.tab files found in {folder_path}"
        )

    sample_series = []
    for fname in tab_files:
        sample = fname[: -len(".ReadsPerGene.out.tab")]
        fpath = os.path.join(folder_path, fname)
        try:
            df = pd.read_csv(
                fpath,
                sep="\t",
                header=None,
                names=["gene_id", "unstranded", "forward", "reverse"],
                skiprows=4,  # skip N_unmapped, N_multimapping, N_noFeature, N_ambiguous
            )
        except Exception as e:
            raise StarFolderParseError(f"Could not read {fname}: {e}")
        series = df.set_index("gene_id")["reverse"].rename(sample)
        sample_series.append(series)

    # Explicit join on gene_id — row order across files is not assumed
    counts = pd.concat(sample_series, axis=1)
    counts = counts.fillna(0).astype(int)
    return counts
