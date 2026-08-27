import json
import os
import subprocess
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.parsers.de_table import DetectionError, parse_de_table
from app.parsers.fpkm_matrix import FPKMParseError, parse_fpkm_matrix
from app.parsers.pathway_table import PathwayParseError, parse_pathway_table
from app.storage import (
    dataset_dir,
    load_fpkm_matrix,
    load_project,
    save_dataset,
    save_fpkm_matrix,
    save_pathway_results,
    save_project,
)
from app.routers.datasets import (
    _compute_heatmap_data,
    _compute_pca,
    _find_rscript,
    _infer_conditions,
    R_HEATMAP_SCRIPT,
    R_PCA_SCRIPT,
    RHeatmapParams,
    RPcaParams,
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
