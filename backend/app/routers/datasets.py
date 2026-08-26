import json
import os
import re
import shutil
import subprocess
import uuid
from collections import defaultdict
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.parsers.de_table import DetectionError, parse_de_table
from app.parsers.fpkm_matrix import FPKMParseError, parse_fpkm_matrix
from app.storage import (
    dataset_dir,
    load_dataset,
    load_fpkm_matrix,
    save_dataset,
    save_fpkm_matrix,
)

router = APIRouter(prefix="/datasets")


# ── DE table upload & volcano endpoints (unchanged) ──────────────────────────

@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        df = parse_de_table(contents, filename=file.filename or "")
    except DetectionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    dataset_id = str(uuid.uuid4())
    save_dataset(dataset_id, df)
    return {"dataset_id": dataset_id}


@router.get("/{dataset_id}/de-results")
def get_de_results(dataset_id: str):
    df = load_dataset(dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    import json as _json
    return _json.loads(df.to_json(orient="records"))


class RVolcanoParams(BaseModel):
    padj_cutoff: float = 0.05
    lfc_cutoff: float = 1.0
    n_label: int = 5
    custom_genes: Optional[List[str]] = None
    plot_title: str = "Volcano Plot"


R_VOLCANO_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "r_scripts", "render_volcano.R",
)

R_HEATMAP_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "r_scripts", "render_heatmap.R",
)


def _find_rscript() -> list[str]:
    """Return the command prefix to run Rscript in the r-env conda environment."""
    conda = shutil.which("conda")
    if conda:
        return [conda, "run", "--no-capture-output", "-n", "r-env", "Rscript"]
    rscript = shutil.which("Rscript")
    if rscript:
        return [rscript]
    raise FileNotFoundError("Rscript not found; install r-env conda environment")


@router.post("/{dataset_id}/render-r-volcano")
def render_r_volcano(dataset_id: str, params: RVolcanoParams):
    d = dataset_dir(dataset_id)
    csv_path = os.path.join(d, "de_results.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="Dataset not found")

    params_path = os.path.join(d, "r_volcano_params.json")
    out_prefix  = os.path.join(d, "r_volcano")

    with open(params_path, "w") as f:
        json.dump(params.model_dump(), f)

    try:
        cmd = _find_rscript() + [os.path.abspath(R_VOLCANO_SCRIPT), csv_path, params_path, out_prefix]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"R script failed:\n{result.stderr[-2000:]}",
        )

    png_path = out_prefix + ".png"
    if not os.path.exists(png_path):
        raise HTTPException(status_code=500, detail="R script ran but produced no PNG output")

    return FileResponse(png_path, media_type="image/png", filename="volcano.png")


# ── FPKM matrix upload & heatmap endpoints ───────────────────────────────────

@router.post("/upload-fpkm")
async def upload_fpkm(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        df = parse_fpkm_matrix(contents, filename=file.filename or "")
    except FPKMParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    heatmap_id = str(uuid.uuid4())
    save_fpkm_matrix(heatmap_id, df)
    return {
        "heatmap_id": heatmap_id,
        "n_genes": df.shape[0],
        "n_samples": df.shape[1],
        "samples": list(df.columns),
    }


def _infer_groups(sample_names: list[str]) -> dict:
    """Infer condition groups by stripping trailing _N replicate suffix.

    Returns a dict with `detected` bool. When detected, also includes
    `groups` (group→sample-index list), `sample_to_group`, and `group_order`.
    """
    groups: dict[str, list[int]] = defaultdict(list)
    for i, name in enumerate(sample_names):
        stripped = re.sub(r"_\d+$", "", name)
        groups[stripped].append(i)

    groups = dict(groups)
    n_samples = len(sample_names)
    n_groups = len(groups)

    grouping_detected = (
        n_groups < n_samples
        and n_groups >= 2
        and any(len(idxs) > 1 for idxs in groups.values())
    )

    if not grouping_detected:
        return {"detected": False, "groups": {}, "sample_to_group": {}, "group_order": []}

    group_order = list(groups.keys())
    sample_to_group = {
        sample_names[i]: grp
        for grp, idxs in groups.items()
        for i in idxs
    }
    return {
        "detected": True,
        "groups": {g: idxs for g, idxs in groups.items()},
        "sample_to_group": sample_to_group,
        "group_order": group_order,
    }


def _compute_z_scores(mat: np.ndarray) -> np.ndarray:
    """Row-wise z-score matching R's t(scale(t(mat))).

    Uses n-1 denominator (matching R's sd()). Zero-variance rows become 0.
    Clipped to [-3, 3].
    """
    row_means = mat.mean(axis=1, keepdims=True)
    row_stds = mat.std(axis=1, ddof=1, keepdims=True)
    safe_stds = np.where(row_stds == 0, 1.0, row_stds)
    zmat = (mat - row_means) / safe_stds
    zmat[row_stds.squeeze(axis=1) == 0, :] = 0.0
    return np.clip(zmat, -3.0, 3.0)


@router.get("/{dataset_id}/heatmap-data")
def get_heatmap_data(
    dataset_id: str,
    n_genes: int = Query(default=40, ge=1, le=500),
    gene_list: Optional[str] = Query(default=None, description="Comma-separated gene names"),
    cluster_rows: bool = Query(default=False),
):
    df = load_fpkm_matrix(dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found for this ID")

    samples = list(df.columns)

    # Gene selection
    if gene_list:
        requested = [g.strip() for g in gene_list.split(",") if g.strip()]
        selected_genes = [g for g in requested if g in df.index]
        if not selected_genes:
            raise HTTPException(
                status_code=422,
                detail=f"None of the requested genes were found in the FPKM matrix. "
                       f"Tried: {requested[:10]}",
            )
    else:
        variances = df.var(axis=1, ddof=1)
        selected_genes = variances.nlargest(min(n_genes, len(df))).index.tolist()

    mat = df.loc[selected_genes].values.astype(float)

    # Optional hierarchical clustering of rows
    if cluster_rows and len(selected_genes) > 1:
        try:
            from scipy.cluster.hierarchy import dendrogram, linkage
            lmat = linkage(mat, method="complete", metric="euclidean")
            dendro = dendrogram(lmat, no_plot=True)
            order = dendro["leaves"]
            selected_genes = [selected_genes[i] for i in order]
            mat = mat[order, :]
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="scipy is required for row clustering; install it in the backend environment.",
            )

    zmat = _compute_z_scores(mat)
    grouping = _infer_groups(samples)

    return {
        "genes": selected_genes,
        "samples": samples,
        "z_scores": zmat.tolist(),
        "fpkm_labels": [[f"{v:.1f}" for v in row] for row in mat.tolist()],
        "grouping": grouping,
    }


class RHeatmapParams(BaseModel):
    genes: List[str]
    cluster_rows: bool = False


@router.post("/{dataset_id}/render-r-heatmap")
def render_r_heatmap(dataset_id: str, params: RHeatmapParams):
    d = dataset_dir(dataset_id)
    fpkm_path = os.path.join(d, "fpkm_matrix.csv")
    if not os.path.exists(fpkm_path):
        raise HTTPException(status_code=404, detail="FPKM matrix not found")

    params_path = os.path.join(d, "r_heatmap_params.json")
    out_prefix = os.path.join(d, "r_heatmap")

    with open(params_path, "w") as f:
        json.dump(params.model_dump(), f)

    try:
        cmd = _find_rscript() + [
            os.path.abspath(R_HEATMAP_SCRIPT),
            fpkm_path,
            params_path,
            out_prefix,
        ]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"R script failed:\n{result.stderr[-2000:]}",
        )

    png_path = out_prefix + ".png"
    if not os.path.exists(png_path):
        raise HTTPException(
            status_code=500, detail="R script ran but produced no PNG output"
        )

    return FileResponse(png_path, media_type="image/png", filename="heatmap.png")
