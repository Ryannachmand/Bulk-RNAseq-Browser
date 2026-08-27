import json
import os
import subprocess
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
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
    load_project,
    save_dataset,
    save_fpkm_matrix,
    save_pathway_results,
    save_project,
)
from app.routers.datasets import (
    _compute_heatmap_data,
    _compute_pca,
    _compute_z_scores,
    _find_rscript,
    _grouping_from_metadata,
    _infer_conditions,
    _infer_groups,
    _load_categories,
    R_CATEGORY_HEATMAP_SCRIPT,
    R_CATEGORY_VOLCANO_SCRIPT,
    R_HEATMAP_SCRIPT,
    R_PCA_SCRIPT,
    R_PATHWAY_BARPLOT_SCRIPT,
    R_VOLCANO_SCRIPT,
    RCategoryHeatmapParams,
    RCategoryVolcanoParams,
    RHeatmapParams,
    RPcaParams,
    RPathwayBarplotParams,
    RVolcanoParams,
)

router = APIRouter(prefix="/projects")


def _capabilities(project: dict) -> dict:
    has_de = project.get("de_dataset_id") is not None
    has_fpkm = project.get("fpkm_dataset_id") is not None
    has_pathway = project.get("pathway_dataset_id") is not None
    return {
        "has_de": has_de,
        "has_fpkm": has_fpkm,
        "has_pathway": has_pathway,
        "tabs": {
            "volcano": has_de,
            "heatmap": has_fpkm,
            "pca": has_fpkm,
            "gene_category_plots": has_de or has_fpkm,
            "pathway_barplot": has_pathway,
        },
    }


@router.post("")
async def create_project(
    name: str = Form(...),
    fpkm_file: Optional[UploadFile] = File(None),
    de_file: Optional[UploadFile] = File(None),
    pathway_file: Optional[UploadFile] = File(None),
):
    if not any([fpkm_file, de_file, pathway_file]):
        raise HTTPException(status_code=422, detail="At least one file is required")

    project_id = str(uuid.uuid4())
    fpkm_dataset_id = None
    de_dataset_id = None
    pathway_dataset_id = None

    if fpkm_file:
        contents = await fpkm_file.read()
        try:
            df = parse_fpkm_matrix(contents, filename=fpkm_file.filename or "")
        except FPKMParseError as e:
            raise HTTPException(status_code=422, detail=f"FPKM file: {e}")
        fpkm_dataset_id = str(uuid.uuid4())
        save_fpkm_matrix(fpkm_dataset_id, df)

    if de_file:
        contents = await de_file.read()
        try:
            df = parse_de_table(contents, filename=de_file.filename or "")
        except DetectionError as e:
            raise HTTPException(status_code=422, detail=f"DE file: {e}")
        de_dataset_id = str(uuid.uuid4())
        save_dataset(de_dataset_id, df)

    if pathway_file:
        contents = await pathway_file.read()
        try:
            df, meta = parse_pathway_table(contents, filename=pathway_file.filename or "")
        except PathwayParseError as e:
            raise HTTPException(status_code=422, detail=f"Pathway file: {e}")
        pathway_dataset_id = str(uuid.uuid4())
        save_pathway_results(pathway_dataset_id, df, meta)

    project = {
        "project_id": project_id,
        "name": name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "de_dataset_id": de_dataset_id,
        "fpkm_dataset_id": fpkm_dataset_id,
        "pathway_dataset_id": pathway_dataset_id,
        "metadata": {},
    }
    save_project(project_id, project)

    return {
        "project_id": project_id,
        "name": name,
        "capabilities": _capabilities(project),
    }


@router.get("/{project_id}")
def get_project(project_id: str):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {**project, "capabilities": _capabilities(project)}


@router.get("/{project_id}/samples")
def get_project_samples(project_id: str):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    fpkm_id = project.get("fpkm_dataset_id")
    if not fpkm_id:
        raise HTTPException(status_code=422, detail="Project has no FPKM dataset")

    df = load_fpkm_matrix(fpkm_id)
    if df is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")

    samples = list(df.columns)
    saved_meta = project.get("metadata") or {}

    if saved_meta and any(s in saved_meta for s in samples):
        metadata = {
            s: {
                "condition": saved_meta.get(s, {}).get("condition", s),
                "batch": saved_meta.get(s, {}).get("batch", ""),
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


class ProjectMetadataBody(BaseModel):
    metadata: dict


@router.put("/{project_id}/metadata")
def save_project_metadata(project_id: str, body: ProjectMetadataBody):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    project["metadata"] = body.metadata
    save_project(project_id, project)
    return {"saved": True}


@router.get("/{project_id}/heatmap-data")
def get_project_heatmap_data(
    project_id: str,
    n_genes: int = Query(default=40, ge=1, le=500),
    gene_list: Optional[str] = Query(default=None),
    cluster_rows: bool = Query(default=False),
):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    fpkm_id = project.get("fpkm_dataset_id")
    if not fpkm_id:
        raise HTTPException(status_code=422, detail="Project has no FPKM dataset")

    parsed_genes = [g.strip() for g in gene_list.split(",") if g.strip()] if gene_list else None
    meta = project.get("metadata") or None

    try:
        return _compute_heatmap_data(fpkm_id, n_genes, parsed_genes, cluster_rows, override_metadata=meta)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/{project_id}/render-r-heatmap")
def render_project_r_heatmap(project_id: str, params: RHeatmapParams):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    fpkm_id = project.get("fpkm_dataset_id")
    if not fpkm_id:
        raise HTTPException(status_code=422, detail="Project has no FPKM dataset")

    d = dataset_dir(fpkm_id)
    fpkm_path = os.path.join(d, "fpkm_matrix.csv")
    if not os.path.exists(fpkm_path):
        raise HTTPException(status_code=404, detail="FPKM matrix file not found")

    params_data = params.model_dump()
    meta = project.get("metadata") or None
    if meta:
        params_data["metadata"] = meta
    if not params_data.get("plot_title"):
        params_data["plot_title"] = project.get("name", "")

    params_path = os.path.join(d, "r_heatmap_params.json")
    out_prefix = os.path.join(d, "r_heatmap")

    with open(params_path, "w") as f:
        json.dump(params_data, f)

    try:
        cmd = _find_rscript() + [os.path.abspath(R_HEATMAP_SCRIPT), fpkm_path, params_path, out_prefix]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"R script failed:\n{result.stderr[-2000:]}")

    png_path = out_prefix + ".png"
    if not os.path.exists(png_path):
        raise HTTPException(status_code=500, detail="R script ran but produced no PNG output")

    return FileResponse(png_path, media_type="image/png", filename="heatmap.png")


@router.get("/{project_id}/pca")
def get_project_pca(project_id: str, n_genes: int = Query(default=500, ge=1, le=5000)):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    fpkm_id = project.get("fpkm_dataset_id")
    if not fpkm_id:
        raise HTTPException(status_code=422, detail="Project has no FPKM dataset")

    meta = project.get("metadata") or None
    result = _compute_pca(fpkm_id, n_genes, override_metadata=meta)
    if result is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")
    return result


@router.post("/{project_id}/render-r-pca")
def render_project_r_pca(project_id: str, params: RPcaParams):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    fpkm_id = project.get("fpkm_dataset_id")
    if not fpkm_id:
        raise HTTPException(status_code=422, detail="Project has no FPKM dataset")

    d = dataset_dir(fpkm_id)
    if not os.path.exists(d):
        raise HTTPException(status_code=404, detail="Dataset directory not found")

    meta = project.get("metadata") or None
    pca_data = _compute_pca(fpkm_id, params.n_genes, override_metadata=meta)
    if pca_data is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")

    plot_title = params.plot_title or project.get("name", "")

    coords_path = os.path.join(d, "r_pca_coords.json")
    with open(coords_path, "w") as f:
        json.dump(
            {
                **pca_data,
                "pc_x": params.pc_x,
                "pc_y": params.pc_y,
                "use_corrected": params.use_corrected,
                "plot_title": plot_title,
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
        raise HTTPException(status_code=500, detail=f"R script failed:\n{result.stderr[-2000:]}")

    png_path = out_prefix + ".png"
    if not os.path.exists(png_path):
        raise HTTPException(status_code=500, detail="R script ran but produced no PNG output")

    return FileResponse(png_path, media_type="image/png", filename="pca.png")


# ── Volcano endpoints ─────────────────────────────────────────────────────────

@router.get("/{project_id}/volcano-data")
def get_project_volcano_data(project_id: str):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    de_id = project.get("de_dataset_id")
    if not de_id:
        raise HTTPException(status_code=422, detail="Project has no DE dataset")
    df = load_dataset(de_id)
    if df is None:
        raise HTTPException(status_code=404, detail="DE dataset not found")
    records = df.to_dict("records")
    return [{k: (None if pd.isna(v) else v) for k, v in r.items()} for r in records]


@router.post("/{project_id}/render-r-volcano")
def render_project_r_volcano(project_id: str, params: RVolcanoParams):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    de_id = project.get("de_dataset_id")
    if not de_id:
        raise HTTPException(status_code=422, detail="Project has no DE dataset")
    d = dataset_dir(de_id)
    csv_path = os.path.join(d, "de_results.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="DE dataset file not found")

    params_data = params.model_dump()
    if not params_data.get("plot_title") or params_data["plot_title"] == "Volcano Plot":
        params_data["plot_title"] = project.get("name", "Volcano Plot")

    params_path = os.path.join(d, "r_volcano_params.json")
    out_prefix = os.path.join(d, "r_volcano")
    with open(params_path, "w") as f:
        json.dump(params_data, f)

    try:
        cmd = _find_rscript() + [os.path.abspath(R_VOLCANO_SCRIPT), csv_path, params_path, out_prefix]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"R script failed:\n{result.stderr[-2000:]}")

    png_path = out_prefix + ".png"
    if not os.path.exists(png_path):
        raise HTTPException(status_code=500, detail="R script ran but produced no PNG output")

    return FileResponse(png_path, media_type="image/png", filename="volcano.png")


# ── Gene Category Plots endpoints ─────────────────────────────────────────────

@router.get("/{project_id}/category-heatmap")
def get_project_category_heatmap(
    project_id: str,
    n_top_genes: int = Query(default=40, ge=1, le=200),
):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    fpkm_id = project.get("fpkm_dataset_id")
    if not fpkm_id:
        raise HTTPException(status_code=422, detail="Project has no FPKM dataset")

    df = load_fpkm_matrix(fpkm_id)
    if df is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")

    samples = list(df.columns)
    categories = _load_categories()
    active_cats = [c for c in categories if c.get("active", True)]

    meta = project.get("metadata") or None
    if meta:
        grouping = _grouping_from_metadata(samples, meta)
    else:
        grouping = _infer_groups(samples)

    result_categories = []
    for cat in active_cats:
        cat_genes = [g for g in cat["genes"] if g in df.index]
        if not cat_genes:
            result_categories.append({"name": cat["name"], "genes": [], "z_scores": [], "fpkm_labels": []})
            continue
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

    return {"samples": samples, "grouping": grouping, "categories": result_categories}


@router.post("/{project_id}/render-r-category-heatmaps")
def render_project_r_category_heatmaps(project_id: str, params: RCategoryHeatmapParams):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    fpkm_id = project.get("fpkm_dataset_id")
    if not fpkm_id:
        raise HTTPException(status_code=422, detail="Project has no FPKM dataset")

    d = dataset_dir(fpkm_id)
    fpkm_path = os.path.join(d, "fpkm_matrix.csv")
    if not os.path.exists(fpkm_path):
        raise HTTPException(status_code=404, detail="FPKM matrix file not found")

    categories = _load_categories()
    active_cats = [c for c in categories if c.get("active", True)]
    if not active_cats:
        raise HTTPException(status_code=422, detail="No active categories defined")

    meta = project.get("metadata") or None
    meta_path = None
    if meta:
        meta_path = os.path.join(d, "project_metadata.json")
        with open(meta_path, "w") as f:
            json.dump(meta, f)
    else:
        fallback = os.path.join(d, "metadata.json")
        if os.path.exists(fallback):
            meta_path = fallback

    params_path = os.path.join(d, "r_cat_heatmap_params.json")
    out_prefix = os.path.join(d, "r_cat_heatmap")

    with open(params_path, "w") as f:
        json.dump(
            {
                "fpkm_path": fpkm_path,
                "metadata_path": meta_path,
                "categories": [{"name": c["name"], "genes": c["genes"]} for c in active_cats],
                "n_top_genes": params.n_top_genes,
                "out_prefix": out_prefix,
            },
            f,
            indent=2,
        )

    try:
        cmd = _find_rscript() + [os.path.abspath(R_CATEGORY_HEATMAP_SCRIPT), params_path]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"R script failed:\n{result.stderr[-3000:]}")

    png_path = out_prefix + "_combined.png"
    if not os.path.exists(png_path):
        raise HTTPException(status_code=500, detail="R script ran but produced no combined PNG output")

    return FileResponse(png_path, media_type="image/png", filename="category_heatmaps.png")


@router.get("/{project_id}/category-volcano")
def get_project_category_volcano(project_id: str):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    de_id = project.get("de_dataset_id")
    if not de_id:
        raise HTTPException(status_code=422, detail="Project has no DE dataset")

    df = load_dataset(de_id)
    if df is None:
        raise HTTPException(status_code=404, detail="DE dataset not found")

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
        {"name": c["name"], "genes": [g for g in c["genes"] if g in gene_set]}
        for c in active_cats
    ]

    import json as _json
    return {"all_genes": all_genes, "categories": cat_results}


@router.post("/{project_id}/render-r-category-volcanos")
def render_project_r_category_volcanos(project_id: str, params: RCategoryVolcanoParams):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    de_id = project.get("de_dataset_id")
    if not de_id:
        raise HTTPException(status_code=422, detail="Project has no DE dataset")

    d = dataset_dir(de_id)
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
        cmd = _find_rscript() + [os.path.abspath(R_CATEGORY_VOLCANO_SCRIPT), params_path]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"R script failed:\n{result.stderr[-3000:]}")

    png_path = out_prefix + "_combined.png"
    if not os.path.exists(png_path):
        raise HTTPException(status_code=500, detail="R script ran but produced no combined PNG output")

    return FileResponse(png_path, media_type="image/png", filename="category_volcanos.png")


# ── Pathway Barplot endpoints ─────────────────────────────────────────────────

@router.get("/{project_id}/pathway-data")
def get_project_pathway_data(
    project_id: str,
    top_n: int = Query(default=20, ge=1, le=200),
):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    pw_id = project.get("pathway_dataset_id")
    if not pw_id:
        raise HTTPException(status_code=422, detail="Project has no pathway dataset")

    df, meta = load_pathway_results(pw_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Pathway results not found")

    direction_available = (meta or {}).get("direction_available", False)

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


@router.post("/{project_id}/render-r-pathway-barplot")
def render_project_r_pathway_barplot(project_id: str, params: RPathwayBarplotParams):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    pw_id = project.get("pathway_dataset_id")
    if not pw_id:
        raise HTTPException(status_code=422, detail="Project has no pathway dataset")

    d = dataset_dir(pw_id)
    csv_path = os.path.join(d, "pathway_results.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="Pathway results not found")

    _, meta = load_pathway_results(pw_id)
    direction_available = (meta or {}).get("direction_available", False)

    plot_title = params.plot_title
    if not plot_title or plot_title == "Pathway Enrichment":
        plot_title = project.get("name", "Pathway Enrichment")

    params_path = os.path.join(d, "r_pathway_params.json")
    out_prefix = os.path.join(d, "r_pathway_barplot")

    with open(params_path, "w") as f:
        json.dump(
            {
                "top_n": params.top_n,
                "direction_available": direction_available,
                "plot_title": plot_title,
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
        raise HTTPException(status_code=500, detail=f"R script failed:\n{result.stderr[-2000:]}")

    png_path = out_prefix + ".png"
    if not os.path.exists(png_path):
        raise HTTPException(status_code=500, detail="R script ran but produced no PNG output")

    return FileResponse(png_path, media_type="image/png", filename="pathway_barplot.png")
