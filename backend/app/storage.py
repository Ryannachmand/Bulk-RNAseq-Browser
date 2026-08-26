import os
import pandas as pd

STORAGE_ROOT = os.environ.get(
    "STORAGE_ROOT",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"),
)


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
