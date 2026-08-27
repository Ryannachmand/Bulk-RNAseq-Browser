import json
import os
import re
import shutil
import subprocess
import uuid
from collections import defaultdict
from typing import List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.parsers.de_table import DetectionError, parse_de_table
from app.parsers.fpkm_matrix import FPKMParseError, parse_fpkm_matrix
from app.parsers.pathway_table import PathwayParseError, parse_pathway_table
from app.storage import (
    dataset_dir,
    load_dataset,
    load_fpkm_matrix,
    load_pathway_results,
    save_dataset,
    save_fpkm_matrix,
    save_pathway_results,
)

router = APIRouter(prefix="/datasets")

from app.storage import STORAGE_ROOT as _STORAGE_ROOT
_CATEGORIES_PATH = os.path.join(_STORAGE_ROOT, "categories.json")

R_CATEGORY_HEATMAP_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "r_scripts", "render_category_heatmaps.R",
)

R_CATEGORY_VOLCANO_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "r_scripts", "render_category_volcanos.R",
)


# ── R script paths ────────────────────────────────────────────────────────────

R_VOLCANO_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "r_scripts", "render_volcano.R",
)

R_HEATMAP_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "r_scripts", "render_heatmap.R",
)

R_PCA_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "r_scripts", "render_pca.R",
)

R_PATHWAY_BARPLOT_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "r_scripts", "render_pathway_barplot.R",
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


# ── Shared helpers ────────────────────────────────────────────────────────────

def _infer_conditions(sample_names: list[str]) -> dict[str, str]:
    """Return per-sample condition guess by stripping trailing _N replicate suffix."""
    return {name: re.sub(r"_\d+$", "", name) for name in sample_names}


def _infer_groups(sample_names: list[str]) -> dict:
    """Infer condition groups from sample names using the replicate-suffix convention."""
    cond_map = _infer_conditions(sample_names)
    groups: dict[str, list[int]] = defaultdict(list)
    for i, name in enumerate(sample_names):
        groups[cond_map[name]].append(i)

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


def _grouping_from_metadata(sample_names: list[str], metadata: dict) -> dict:
    """Build heatmap grouping structure from saved sample metadata."""
    groups: dict[str, list[int]] = defaultdict(list)
    for i, name in enumerate(sample_names):
        condition = metadata.get(name, {}).get("condition", name)
        groups[condition].append(i)

    groups = dict(groups)
    n_samples = len(sample_names)
    n_groups = len(groups)

    if n_groups < 2 or n_groups >= n_samples:
        return {"detected": False, "groups": {}, "sample_to_group": {}, "group_order": []}

    # Preserve condition order as first encountered in sample list
    seen: dict[str, None] = {}
    for s in sample_names:
        c = metadata.get(s, {}).get("condition", s)
        seen[c] = None
    group_order = list(seen.keys())

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


def _metadata_path(dataset_id: str) -> str:
    return os.path.join(dataset_dir(dataset_id), "metadata.json")


def _load_metadata(dataset_id: str) -> dict | None:
    path = _metadata_path(dataset_id)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


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


def _remove_batch_effect(X: np.ndarray, samples: list[str], sample_meta: dict) -> np.ndarray:
    """Python reimplementation of limma::removeBatchEffect linear-model approach.

    Regresses out batch contribution while preserving condition variance.
    X: (n_samples, n_genes)
    Returns batch-corrected X, same shape.
    """
    batches = [sample_meta[s].get("batch", "") for s in samples]
    conditions = [sample_meta[s].get("condition", s) for s in samples]

    unique_batches = sorted(b for b in set(batches) if b)
    if len(unique_batches) < 2:
        return X

    n = len(samples)

    # Condition dummies (one per condition — rank issues handled by lstsq)
    unique_conds = list(dict.fromkeys(conditions))
    cond_dummies = np.zeros((n, len(unique_conds)))
    for i, c in enumerate(conditions):
        cond_dummies[i, unique_conds.index(c)] = 1

    # Batch dummies (drop first level as reference)
    batch_ref_dropped = unique_batches[1:]
    batch_dummies = np.zeros((n, len(batch_ref_dropped)))
    for i, b in enumerate(batches):
        if b in batch_ref_dropped:
            batch_dummies[i, batch_ref_dropped.index(b)] = 1

    design = np.hstack([cond_dummies, batch_dummies])

    try:
        beta, _, _, _ = np.linalg.lstsq(design, X, rcond=None)
    except np.linalg.LinAlgError:
        return X

    n_cond = len(unique_conds)
    batch_contrib = batch_dummies @ beta[n_cond:, :]
    return X - batch_contrib


def _compute_pca(dataset_id: str, n_genes: int = 500, override_metadata: dict | None = None) -> dict | None:
    """Shared PCA computation used by both JSON and R-render endpoints."""
    from sklearn.decomposition import PCA

    df = load_fpkm_matrix(dataset_id)
    if df is None:
        return None

    samples = list(df.columns)

    if override_metadata is not None:
        saved_meta = override_metadata if override_metadata else None
        meta_inferred = not bool(saved_meta)
    else:
        saved_meta = _load_metadata(dataset_id)
        meta_inferred = saved_meta is None

    if saved_meta:
        sample_meta = {
            s: {
                "condition": saved_meta.get(s, {}).get("condition", s),
                "batch": saved_meta.get(s, {}).get("batch", ""),
            }
            for s in samples
        }
    else:
        inferred = _infer_conditions(samples)
        sample_meta = {s: {"condition": inferred[s], "batch": ""} for s in samples}
        meta_inferred = True

    # log2(FPKM+1) transform, select top N most variable genes
    mat = np.log2(df.values.astype(float) + 1)  # genes x samples
    gene_vars = mat.var(axis=1, ddof=1)
    top_idx = np.argsort(gene_vars)[::-1][: min(n_genes, len(df))]
    mat_top = mat[top_idx, :]  # n_genes_used x samples

    # PCA on samples (rows)
    X = mat_top.T  # samples x genes
    n_components = min(3, X.shape[0], X.shape[1])
    pca = PCA(n_components=n_components)
    coords = pca.fit_transform(X)
    var_pct = (pca.explained_variance_ratio_ * 100).round(1).tolist()
    while len(var_pct) < 3:
        var_pct.append(0.0)

    n_s = len(samples)

    def _col(arr, col_idx):
        if arr.shape[1] > col_idx:
            return arr[:, col_idx].tolist()
        return [0.0] * n_s

    raw = {
        "samples": samples,
        "PC1": _col(coords, 0),
        "PC2": _col(coords, 1),
        "PC3": _col(coords, 2),
        "var_explained": var_pct,
        "sample_meta": sample_meta,
        "meta_inferred": meta_inferred,
    }

    # Batch correction when 2+ distinct non-empty batch values exist
    batches = [sample_meta[s].get("batch", "") for s in samples]
    distinct_batches = sorted(b for b in set(batches) if b)
    corrected = None
    if len(distinct_batches) >= 2:
        X_corr = _remove_batch_effect(X, samples, sample_meta)
        pca2 = PCA(n_components=n_components)
        coords2 = pca2.fit_transform(X_corr)
        var_pct2 = (pca2.explained_variance_ratio_ * 100).round(1).tolist()
        while len(var_pct2) < 3:
            var_pct2.append(0.0)
        corrected = {
            "PC1": _col(coords2, 0),
            "PC2": _col(coords2, 1),
            "PC3": _col(coords2, 2),
            "var_explained": var_pct2,
        }

    return {
        "raw": raw,
        "corrected": corrected,
        "n_genes_used": int(len(top_idx)),
    }


# ── DE table upload & volcano endpoints ──────────────────────────────────────

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


def _compute_heatmap_data(
    dataset_id: str,
    n_genes: int = 40,
    gene_list: list[str] | None = None,
    cluster_rows: bool = False,
    override_metadata: dict | None = None,
) -> dict:
    """Core heatmap computation; raises ValueError/FileNotFoundError instead of HTTPException."""
    df = load_fpkm_matrix(dataset_id)
    if df is None:
        raise FileNotFoundError("FPKM matrix not found")

    samples = list(df.columns)

    if gene_list:
        selected_genes = [g for g in gene_list if g in df.index]
        if not selected_genes:
            raise ValueError(
                f"None of the requested genes were found in the FPKM matrix. "
                f"Tried: {gene_list[:10]}"
            )
    else:
        variances = df.var(axis=1, ddof=1)
        selected_genes = variances.nlargest(min(n_genes, len(df))).index.tolist()

    mat = df.loc[selected_genes].values.astype(float)

    if cluster_rows and len(selected_genes) > 1:
        try:
            from scipy.cluster.hierarchy import dendrogram, linkage
            lmat = linkage(mat, method="complete", metric="euclidean")
            dendro = dendrogram(lmat, no_plot=True)
            order = dendro["leaves"]
            selected_genes = [selected_genes[i] for i in order]
            mat = mat[order, :]
        except ImportError:
            raise ValueError("scipy is required for row clustering")

    zmat = _compute_z_scores(mat)

    if override_metadata is not None:
        meta = override_metadata if override_metadata else None
    else:
        meta = _load_metadata(dataset_id)

    if meta:
        grouping = _grouping_from_metadata(samples, meta)
    else:
        grouping = _infer_groups(samples)

    return {
        "genes": selected_genes,
        "samples": samples,
        "z_scores": zmat.tolist(),
        "fpkm_labels": [[f"{v:.1f}" for v in row] for row in mat.tolist()],
        "grouping": grouping,
    }


@router.get("/{dataset_id}/heatmap-data")
def get_heatmap_data(
    dataset_id: str,
    n_genes: int = Query(default=40, ge=1, le=500),
    gene_list: Optional[str] = Query(default=None, description="Comma-separated gene names"),
    cluster_rows: bool = Query(default=False),
):
    parsed_genes = [g.strip() for g in gene_list.split(",") if g.strip()] if gene_list else None
    try:
        return _compute_heatmap_data(dataset_id, n_genes, parsed_genes, cluster_rows)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="FPKM matrix not found for this ID")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


class RHeatmapParams(BaseModel):
    genes: List[str]
    cluster_rows: bool = False
    plot_title: Optional[str] = None
    metadata: Optional[dict] = None


@router.post("/{dataset_id}/render-r-heatmap")
def render_r_heatmap(dataset_id: str, params: RHeatmapParams):
    d = dataset_dir(dataset_id)
    fpkm_path = os.path.join(d, "fpkm_matrix.csv")
    if not os.path.exists(fpkm_path):
        raise HTTPException(status_code=404, detail="FPKM matrix not found")

    params_path = os.path.join(d, "r_heatmap_params.json")
    out_prefix = os.path.join(d, "r_heatmap")

    params_data = params.model_dump()
    if params_data.get("metadata") is None:
        saved_meta = _load_metadata(dataset_id)
        if saved_meta:
            params_data["metadata"] = saved_meta

    with open(params_path, "w") as f:
        json.dump(params_data, f)

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


# ── Sample metadata endpoints ─────────────────────────────────────────────────

@router.get("/{dataset_id}/samples")
def get_samples(dataset_id: str):
    df = load_fpkm_matrix(dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")

    samples = list(df.columns)
    saved = _load_metadata(dataset_id)

    if saved:
        metadata = {
            s: {
                "condition": saved.get(s, {}).get("condition", ""),
                "batch": saved.get(s, {}).get("batch", ""),
                "inferred": False,
            }
            for s in samples
        }
    else:
        inferred = _infer_conditions(samples)
        metadata = {
            s: {"condition": inferred[s], "batch": "", "inferred": True}
            for s in samples
        }

    return {"samples": samples, "metadata": metadata}


class SampleMetadataBody(BaseModel):
    metadata: dict


@router.post("/{dataset_id}/metadata")
def save_sample_metadata(dataset_id: str, body: SampleMetadataBody):
    d = dataset_dir(dataset_id)
    if not os.path.exists(d):
        raise HTTPException(status_code=404, detail="Dataset not found")
    with open(_metadata_path(dataset_id), "w") as f:
        json.dump(body.metadata, f, indent=2)
    return {"saved": True}


# ── PCA endpoints ─────────────────────────────────────────────────────────────

@router.get("/{dataset_id}/pca")
def get_pca(dataset_id: str, n_genes: int = Query(default=500, ge=1, le=5000)):
    result = _compute_pca(dataset_id, n_genes)
    if result is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")
    return result


class RPcaParams(BaseModel):
    pc_x: str = "PC1"
    pc_y: str = "PC2"
    use_corrected: bool = False
    n_genes: int = 500
    plot_title: Optional[str] = None


@router.post("/{dataset_id}/render-r-pca")
def render_r_pca(dataset_id: str, params: RPcaParams):
    d = dataset_dir(dataset_id)
    if not os.path.exists(d):
        raise HTTPException(status_code=404, detail="Dataset not found")

    pca_data = _compute_pca(dataset_id, params.n_genes)
    if pca_data is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")

    # Write pre-computed coords to JSON for R to consume
    coords_path = os.path.join(d, "r_pca_coords.json")
    with open(coords_path, "w") as f:
        json.dump(
            {
                **pca_data,
                "pc_x": params.pc_x,
                "pc_y": params.pc_y,
                "use_corrected": params.use_corrected,
                "plot_title": params.plot_title,
            },
            f,
        )

    out_prefix = os.path.join(d, "r_pca")

    try:
        cmd = _find_rscript() + [os.path.abspath(R_PCA_SCRIPT), coords_path, out_prefix]
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

    return FileResponse(png_path, media_type="image/png", filename="pca.png")


# ── FPKM dataset listing ──────────────────────────────────────────────────────

@router.get("/fpkm-list")
def list_fpkm_datasets():
    """Return all dataset IDs that have an fpkm_matrix.csv."""
    entries = []
    if not os.path.isdir(_STORAGE_ROOT):
        return {"datasets": []}
    for name in sorted(os.listdir(_STORAGE_ROOT)):
        path = os.path.join(_STORAGE_ROOT, name, "fpkm_matrix.csv")
        if os.path.exists(path):
            entries.append({"id": name})
    return {"datasets": entries}


# ── Categorized heatmap endpoints ─────────────────────────────────────────────

def _load_categories() -> list:
    if not os.path.exists(_CATEGORIES_PATH):
        return []
    with open(_CATEGORIES_PATH) as f:
        return json.load(f)


@router.get("/{dataset_id}/categorized-heatmap")
def get_categorized_heatmap(
    dataset_id: str,
    n_top_genes: int = Query(default=40, ge=1, le=200),
):
    df = load_fpkm_matrix(dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")

    samples = list(df.columns)
    categories = _load_categories()
    active_cats = [c for c in categories if c.get("active", True)]

    saved_meta = _load_metadata(dataset_id)
    if saved_meta:
        grouping = _grouping_from_metadata(samples, saved_meta)
    else:
        grouping = _infer_groups(samples)

    result_categories = []
    for cat in active_cats:
        cat_genes = [g for g in cat["genes"] if g in df.index]
        if not cat_genes:
            result_categories.append({
                "name": cat["name"],
                "genes": [],
                "z_scores": [],
                "fpkm_labels": [],
            })
            continue

        # Select top N by variance
        sub = df.loc[cat_genes]
        variances = sub.var(axis=1, ddof=1)
        n_select = min(n_top_genes, len(cat_genes))
        selected = variances.nlargest(n_select).index.tolist()

        mat = sub.loc[selected].values.astype(float)
        zmat = _compute_z_scores(mat)

        result_categories.append({
            "name": cat["name"],
            "genes": selected,
            "z_scores": zmat.tolist(),
            "fpkm_labels": [[f"{v:.1f}" for v in row] for row in mat.tolist()],
        })

    return {
        "samples": samples,
        "grouping": grouping,
        "categories": result_categories,
    }


class RCategoryHeatmapParams(BaseModel):
    n_top_genes: int = 40


@router.post("/{dataset_id}/render-r-category-heatmaps")
def render_r_category_heatmaps(dataset_id: str, params: RCategoryHeatmapParams):
    d = dataset_dir(dataset_id)
    fpkm_path = os.path.join(d, "fpkm_matrix.csv")
    if not os.path.exists(fpkm_path):
        raise HTTPException(status_code=404, detail="FPKM matrix not found")

    categories = _load_categories()
    active_cats = [c for c in categories if c.get("active", True)]
    if not active_cats:
        raise HTTPException(status_code=422, detail="No active categories defined")

    meta_path = _metadata_path(dataset_id)

    params_path = os.path.join(d, "r_cat_heatmap_params.json")
    out_prefix = os.path.join(d, "r_cat_heatmap")

    with open(params_path, "w") as f:
        json.dump(
            {
                "fpkm_path": fpkm_path,
                "metadata_path": meta_path if os.path.exists(meta_path) else None,
                "categories": [{"name": c["name"], "genes": c["genes"]} for c in active_cats],
                "n_top_genes": params.n_top_genes,
                "out_prefix": out_prefix,
            },
            f,
            indent=2,
        )

    try:
        cmd = _find_rscript() + [
            os.path.abspath(R_CATEGORY_HEATMAP_SCRIPT),
            params_path,
        ]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"R script failed:\n{result.stderr[-3000:]}",
        )

    png_path = out_prefix + "_combined.png"
    if not os.path.exists(png_path):
        raise HTTPException(
            status_code=500, detail="R script ran but produced no combined PNG output"
        )

    return FileResponse(png_path, media_type="image/png", filename="category_heatmaps.png")


# ── DE dataset listing ────────────────────────────────────────────────────────

@router.get("/de-list")
def list_de_datasets():
    """Return all dataset IDs that have a de_results.csv."""
    entries = []
    if not os.path.isdir(_STORAGE_ROOT):
        return {"datasets": []}
    for name in sorted(os.listdir(_STORAGE_ROOT)):
        path = os.path.join(_STORAGE_ROOT, name, "de_results.csv")
        if os.path.exists(path):
            entries.append({"id": name})
    return {"datasets": entries}


# ── Categorized volcano endpoints ─────────────────────────────────────────────

@router.get("/{dataset_id}/categorized-volcano")
def get_categorized_volcano(dataset_id: str):
    """Return full DE gene list + per-active-category gene membership."""
    df = load_dataset(dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="DE dataset not found")

    # Normalise gene symbol column
    if "gene" in df.columns and "symbol" not in df.columns:
        df = df.rename(columns={"gene": "symbol"})
    if "symbol" not in df.columns:
        raise HTTPException(status_code=422, detail="DE table has no 'gene' or 'symbol' column")

    cols = ["symbol", "log2FoldChange", "padj"]
    optional = [c for c in ["baseMean", "lfcSE", "stat", "pvalue"] if c in df.columns]
    all_genes = (
        df[cols + optional]
        .dropna(subset=["symbol", "log2FoldChange", "padj"])
        .to_dict("records")
    )

    gene_set = {r["symbol"] for r in all_genes}

    categories = _load_categories()
    active_cats = [c for c in categories if c.get("active", True)]
    cat_results = [
        {
            "name": c["name"],
            "genes": [g for g in c["genes"] if g in gene_set],
        }
        for c in active_cats
    ]

    return {"all_genes": all_genes, "categories": cat_results}


class RCategoryVolcanoParams(BaseModel):
    padj_cutoff: float = 0.05
    lfc_cutoff: float = 1.0
    n_label: int = 15


@router.post("/{dataset_id}/render-r-category-volcanos")
def render_r_category_volcanos(dataset_id: str, params: RCategoryVolcanoParams):
    d = dataset_dir(dataset_id)
    de_path = os.path.join(d, "de_results.csv")
    if not os.path.exists(de_path):
        raise HTTPException(status_code=404, detail="DE dataset not found")

    categories = _load_categories()
    active_cats = [c for c in categories if c.get("active", True)]
    if not active_cats:
        raise HTTPException(status_code=422, detail="No active categories defined")

    params_path = os.path.join(d, "r_cat_volcano_params.json")
    out_prefix = os.path.join(d, "r_cat_volcano")

    with open(params_path, "w") as f:
        json.dump(
            {
                "de_path": de_path,
                "categories": [{"name": c["name"], "genes": c["genes"]} for c in active_cats],
                "padj_cutoff": params.padj_cutoff,
                "lfc_cutoff": params.lfc_cutoff,
                "n_label": params.n_label,
                "out_prefix": out_prefix,
            },
            f,
            indent=2,
        )

    try:
        cmd = _find_rscript() + [
            os.path.abspath(R_CATEGORY_VOLCANO_SCRIPT),
            params_path,
        ]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"R script failed:\n{result.stderr[-3000:]}",
        )

    png_path = out_prefix + "_combined.png"
    if not os.path.exists(png_path):
        raise HTTPException(
            status_code=500, detail="R script ran but produced no combined PNG output"
        )

    return FileResponse(png_path, media_type="image/png", filename="category_volcanos.png")


# ── Pathway barplot endpoints ─────────────────────────────────────────────────

@router.post("/upload-pathway")
async def upload_pathway(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        df, meta = parse_pathway_table(contents, filename=file.filename or "")
    except PathwayParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    dataset_id = str(uuid.uuid4())
    save_pathway_results(dataset_id, df, meta)
    return {
        "dataset_id": dataset_id,
        "n_pathways": len(df),
        "direction_available": meta.get("direction_available", False),
    }


@router.get("/{dataset_id}/pathway-results")
def get_pathway_results(dataset_id: str, top_n: int = Query(default=20, ge=1, le=200)):
    df, meta = load_pathway_results(dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Pathway results not found")

    direction_available = meta.get("direction_available", False)

    if direction_available and "direction" in df.columns:
        up = df[df["direction"].str.lower().str.startswith("up")].nlargest(top_n, "neg_log10_padj")
        down = df[df["direction"].str.lower().str.startswith("down")].nlargest(top_n, "neg_log10_padj")
        subset = pd.concat([up, down], ignore_index=True)
    else:
        subset = df.nlargest(top_n, "neg_log10_padj")

    import json as _json
    return {
        "rows": _json.loads(subset.to_json(orient="records")),
        "direction_available": direction_available,
    }


@router.get("/pathway-list")
def list_pathway_datasets():
    entries = []
    if not os.path.isdir(_STORAGE_ROOT):
        return {"datasets": []}
    for name in sorted(os.listdir(_STORAGE_ROOT)):
        path = os.path.join(_STORAGE_ROOT, name, "pathway_results.csv")
        if os.path.exists(path):
            meta_path = os.path.join(_STORAGE_ROOT, name, "pathway_meta.json")
            meta: dict = {}
            if os.path.exists(meta_path):
                with open(meta_path) as f:
                    meta = json.load(f)
            entries.append({"id": name, "direction_available": meta.get("direction_available", False)})
    return {"datasets": entries}


class RPathwayBarplotParams(BaseModel):
    top_n: int = 20
    plot_title: str = "Pathway Enrichment"


@router.post("/{dataset_id}/render-r-pathway-barplot")
def render_r_pathway_barplot(dataset_id: str, params: RPathwayBarplotParams):
    d = dataset_dir(dataset_id)
    csv_path = os.path.join(d, "pathway_results.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="Pathway results not found")

    _, meta = load_pathway_results(dataset_id)
    direction_available = (meta or {}).get("direction_available", False)

    params_path = os.path.join(d, "r_pathway_params.json")
    out_prefix = os.path.join(d, "r_pathway_barplot")

    with open(params_path, "w") as f:
        json.dump(
            {
                "top_n": params.top_n,
                "direction_available": direction_available,
                "plot_title": params.plot_title,
            },
            f,
        )

    try:
        cmd = _find_rscript() + [
            os.path.abspath(R_PATHWAY_BARPLOT_SCRIPT),
            csv_path,
            params_path,
            out_prefix,
        ]
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

    return FileResponse(png_path, media_type="image/png", filename="pathway_barplot.png")
