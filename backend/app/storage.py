import json
import os
import pandas as pd

STORAGE_ROOT = os.environ.get(
    "STORAGE_ROOT",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"),
)

PROJECT_STORAGE_ROOT = os.path.join(STORAGE_ROOT, "projects")


def _dataset_dir(dataset_id: str) -> str:
    return os.path.join(STORAGE_ROOT, dataset_id)


def dataset_dir(dataset_id: str) -> str:
    return _dataset_dir(dataset_id)


def save_dataset(dataset_id: str, df: pd.DataFrame) -> None:
    path = _dataset_dir(dataset_id)
    os.makedirs(path, exist_ok=True)
    df.to_csv(os.path.join(path, "de_results.csv"), index=False)


def load_dataset(dataset_id: str) -> pd.DataFrame | None:
    path = os.path.join(_dataset_dir(dataset_id), "de_results.csv")
    if not os.path.exists(path):
        return None
    return pd.read_csv(path)


def save_fpkm_matrix(dataset_id: str, df: pd.DataFrame) -> None:
    path = _dataset_dir(dataset_id)
    os.makedirs(path, exist_ok=True)
    df.to_csv(os.path.join(path, "fpkm_matrix.csv"))


def load_fpkm_matrix(dataset_id: str) -> pd.DataFrame | None:
    path = os.path.join(_dataset_dir(dataset_id), "fpkm_matrix.csv")
    if not os.path.exists(path):
        return None
    return pd.read_csv(path, index_col=0)


def save_pathway_results(dataset_id: str, df: pd.DataFrame, meta: dict) -> None:
    path = _dataset_dir(dataset_id)
    os.makedirs(path, exist_ok=True)
    df.to_csv(os.path.join(path, "pathway_results.csv"), index=False)
    with open(os.path.join(path, "pathway_meta.json"), "w") as f:
        json.dump(meta, f)


def save_gene_lengths(dataset_id: str, lengths: pd.Series) -> None:
    path = _dataset_dir(dataset_id)
    os.makedirs(path, exist_ok=True)
    lengths.to_frame("length").to_csv(os.path.join(path, "gene_lengths.csv"))


def load_gene_lengths(dataset_id: str) -> pd.Series | None:
    path = os.path.join(_dataset_dir(dataset_id), "gene_lengths.csv")
    if not os.path.exists(path):
        return None
    return pd.read_csv(path, index_col=0).squeeze("columns")


def save_raw_counts(dataset_id: str, df: pd.DataFrame) -> None:
    path = _dataset_dir(dataset_id)
    os.makedirs(path, exist_ok=True)
    df.to_csv(os.path.join(path, "raw_counts.csv"))


def load_raw_counts(dataset_id: str) -> pd.DataFrame | None:
    path = os.path.join(_dataset_dir(dataset_id), "raw_counts.csv")
    if not os.path.exists(path):
        return None
    return pd.read_csv(path, index_col=0)


def project_dir(project_id: str) -> str:
    return os.path.join(PROJECT_STORAGE_ROOT, project_id)


def save_project(project_id: str, data: dict) -> None:
    path = project_dir(project_id)
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, "project.json"), "w") as f:
        json.dump(data, f, indent=2)


def load_project(project_id: str) -> dict | None:
    path = os.path.join(project_dir(project_id), "project.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def load_pathway_results(dataset_id: str) -> tuple[pd.DataFrame | None, dict | None]:
    d = _dataset_dir(dataset_id)
    csv_path = os.path.join(d, "pathway_results.csv")
    meta_path = os.path.join(d, "pathway_meta.json")
    if not os.path.exists(csv_path):
        return None, None
    df = pd.read_csv(csv_path)
    meta: dict = {}
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)
    return df, meta
