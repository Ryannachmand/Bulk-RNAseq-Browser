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
from app.parsers.raw_counts import RawCountsParseError, parse_raw_counts_matrix
from app.parsers.star_folder import StarFolderParseError, parse_star_folder
from app.storage import (
    dataset_dir,
    load_dataset,
    load_fpkm_matrix,
    load_pathway_results,
    load_project,
    load_raw_counts,
    save_dataset,
    save_fpkm_matrix,
    save_gene_lengths,
    save_pathway_results,
    save_project,
    save_raw_counts,
)
from app.routers.datasets import (
    _compute_heatmap_data,
    _compute_pca,
    _compute_vst_pca,
    _compute_z_scores,
    _find_rscript,
    _grouping_from_metadata,
    _infer_conditions,
    _infer_groups,
    _load_categories,
    R_CATEGORY_HEATMAP_SCRIPT,
    R_CATEGORY_VOLCANO_SCRIPT,
    R_COMPUTE_FPKM_SCRIPT,
    R_ENRICHGO_SCRIPT,
    R_HEATMAP_SCRIPT,
    R_LIMMA_SCRIPT,
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

# GENCODE GTFs, used to compute FPKM from raw counts and to map gene IDs to
# symbols. The defaults are this deployment machine's paths; set BULKRNASEQ_GTF_HUMAN
# and BULKRNASEQ_GTF_MOUSE to run anywhere else.
GTF_PATHS = {
    "human": os.environ.get(
        "BULKRNASEQ_GTF_HUMAN",
        "/home/ryannachman/programs/STAR-2.7.11b/refs/downloads/gencode.v46.primary_assembly.annotation.gtf",
    ),
    "mouse": os.environ.get(
        "BULKRNASEQ_GTF_MOUSE",
        "/home/ryannachman/programs/STAR-2.7.11b/refs/downloads/gencode.vM35.primary_assembly.annotation.gtf",
    ),
}

R_DESEQ2_SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "..", "r_scripts", "run_deseq2.R"
)


def _run_compute_fpkm(
    raw_counts_dataset_id: str,
    species: str,
    fpkm_dataset_id: str,
) -> None:
    """Run compute_fpkm.R and write output directly into fpkm_dataset_id's directory.

    Creates the FPKM dataset directory and fpkm_matrix.csv. Raises HTTPException on failure.
    """
    raw_d = dataset_dir(raw_counts_dataset_id)
    counts_path = os.path.join(raw_d, "raw_counts.csv")
    gene_lengths_path = os.path.join(raw_d, "gene_lengths.csv")
    gtf_path = GTF_PATHS[species]

    fpkm_d = dataset_dir(fpkm_dataset_id)
    os.makedirs(fpkm_d, exist_ok=True)
    output_fpkm_path = os.path.join(fpkm_d, "fpkm_matrix.csv")

    params = {
        "counts_csv_path": counts_path,
        "gene_lengths_csv_path": gene_lengths_path if os.path.exists(gene_lengths_path) else None,
        "gtf_path": gtf_path,
        "output_fpkm_path": output_fpkm_path,
    }
    params_path = os.path.join(raw_d, "fpkm_compute_params.json")
    with open(params_path, "w") as f:
        json.dump(params, f, indent=2)

    try:
        cmd = _find_rscript() + [os.path.abspath(R_COMPUTE_FPKM_SCRIPT), params_path]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"FPKM computation failed:\n{result.stderr[-2000:]}",
        )

    if not os.path.exists(output_fpkm_path):
        raise HTTPException(
            status_code=500, detail="FPKM compute script ran but produced no output"
        )


def _capabilities(project: dict) -> dict:
    has_de = project.get("de_dataset_id") is not None
    has_fpkm = project.get("fpkm_dataset_id") is not None
    has_pathway = project.get("pathway_dataset_id") is not None
    has_raw_counts = project.get("raw_counts_dataset_id") is not None
    return {
        "has_de": has_de,
        "has_fpkm": has_fpkm,
        "has_pathway": has_pathway,
        "has_raw_counts": has_raw_counts,
        "de_provenance": project.get("de_provenance"),
        "tabs": {
            "volcano": has_de,
            "heatmap": has_fpkm,
            # PCA needs one expression matrix of either kind: raw counts give
            # a VST, FPKM gives the log2(FPKM+1) fallback.
            "pca": has_fpkm or has_raw_counts,
            "gene_category_plots": has_de or has_fpkm,
            # Unlocks when pathway data exists OR when DE is present and enrichGO can be run
            "pathway_barplot": has_pathway or has_de,
        },
    }


@router.post("")
async def create_project(
    name: str = Form(...),
    fpkm_file: Optional[UploadFile] = File(None),
    de_file: Optional[UploadFile] = File(None),
    pathway_file: Optional[UploadFile] = File(None),
    raw_counts_file: Optional[UploadFile] = File(None),
    star_folder_path: Optional[str] = Form(None),
    species: Optional[str] = Form(None),
):
    has_raw = raw_counts_file is not None or bool(
        star_folder_path and star_folder_path.strip()
    )
    if not any([fpkm_file, de_file, pathway_file]) and not has_raw:
        raise HTTPException(status_code=422, detail="At least one file is required")

    if has_raw and (not species or species not in GTF_PATHS):
        raise HTTPException(
            status_code=422,
            detail="species must be 'human' or 'mouse' when providing raw counts",
        )

    project_id = str(uuid.uuid4())
    fpkm_dataset_id = None
    de_dataset_id = None
    pathway_dataset_id = None
    raw_counts_dataset_id = None

    if fpkm_file:
        contents = await fpkm_file.read()
        try:
            df = parse_fpkm_matrix(contents, filename=fpkm_file.filename or "")
        except FPKMParseError as e:
            raise HTTPException(status_code=422, detail=f"FPKM file: {e}")
        fpkm_dataset_id = str(uuid.uuid4())
        save_fpkm_matrix(fpkm_dataset_id, df)

    de_provenance = None
    if de_file:
        contents = await de_file.read()
        try:
            df = parse_de_table(contents, filename=de_file.filename or "")
        except DetectionError as e:
            raise HTTPException(status_code=422, detail=f"DE file: {e}")
        de_dataset_id = str(uuid.uuid4())
        save_dataset(de_dataset_id, df)
        de_provenance = "uploaded"

    if pathway_file:
        contents = await pathway_file.read()
        try:
            df, meta = parse_pathway_table(contents, filename=pathway_file.filename or "")
        except PathwayParseError as e:
            raise HTTPException(status_code=422, detail=f"Pathway file: {e}")
        pathway_dataset_id = str(uuid.uuid4())
        save_pathway_results(pathway_dataset_id, df, meta)

    counts_df = None
    gene_lengths = None
    if raw_counts_file:
        contents = await raw_counts_file.read()
        try:
            counts_df, gene_lengths = parse_raw_counts_matrix(
                contents, filename=raw_counts_file.filename or ""
            )
        except RawCountsParseError as e:
            raise HTTPException(status_code=422, detail=f"Raw counts file: {e}")
        raw_counts_dataset_id = str(uuid.uuid4())
        save_raw_counts(raw_counts_dataset_id, counts_df)
        if gene_lengths is not None:
            save_gene_lengths(raw_counts_dataset_id, gene_lengths)
    elif star_folder_path and star_folder_path.strip():
        try:
            counts_df = parse_star_folder(star_folder_path.strip())
        except StarFolderParseError as e:
            raise HTTPException(status_code=422, detail=f"STAR folder: {e}")
        raw_counts_dataset_id = str(uuid.uuid4())
        save_raw_counts(raw_counts_dataset_id, counts_df)

    # Validate sample alignment when user uploads both FPKM and raw counts
    if fpkm_dataset_id and raw_counts_dataset_id and counts_df is not None:
        uploaded_fpkm = load_fpkm_matrix(fpkm_dataset_id)
        if uploaded_fpkm is not None:
            fpkm_samples = set(uploaded_fpkm.columns)
            counts_samples = set(counts_df.columns)
            missing_in_counts = fpkm_samples - counts_samples
            missing_in_fpkm = counts_samples - fpkm_samples
            if missing_in_counts or missing_in_fpkm:
                msg_parts = []
                if missing_in_counts:
                    msg_parts.append(
                        f"FPKM samples not in raw counts: {sorted(missing_in_counts)}"
                    )
                if missing_in_fpkm:
                    msg_parts.append(
                        f"raw counts samples not in FPKM: {sorted(missing_in_fpkm)}"
                    )
                raise HTTPException(
                    status_code=422,
                    detail="Sample name mismatch between uploaded FPKM and raw counts. "
                    + "; ".join(msg_parts),
                )

    # Auto-compute FPKM from raw counts when no FPKM was uploaded
    fpkm_source = None
    if fpkm_dataset_id:
        fpkm_source = "uploaded"
    elif raw_counts_dataset_id and species:
        computed_fpkm_id = str(uuid.uuid4())
        _run_compute_fpkm(raw_counts_dataset_id, species, computed_fpkm_id)
        fpkm_dataset_id = computed_fpkm_id
        fpkm_source = "computed"

    project = {
        "project_id": project_id,
        "name": name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "de_dataset_id": de_dataset_id,
        "de_provenance": de_provenance,
        "fpkm_dataset_id": fpkm_dataset_id,
        "fpkm_source": fpkm_source,
        "pathway_dataset_id": pathway_dataset_id,
        "raw_counts_dataset_id": raw_counts_dataset_id,
        "raw_counts_species": species if has_raw else None,
        # species is stored for all project types (incl. FPKM-only) so
        # pathway analysis (enrichGO) can be run without raw counts.
        "species": species if species else None,
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
    raw_counts_id = project.get("raw_counts_dataset_id")

    if fpkm_id:
        df = load_fpkm_matrix(fpkm_id)
        if df is None:
            raise HTTPException(status_code=404, detail="FPKM matrix not found")
    elif raw_counts_id:
        df = load_raw_counts(raw_counts_id)
        if df is None:
            raise HTTPException(status_code=404, detail="Raw counts matrix not found")
    else:
        raise HTTPException(
            status_code=422, detail="Project has no FPKM or raw counts dataset"
        )

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


@router.get("/{project_id}/condition-levels")
def get_condition_levels(project_id: str):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    metadata = project.get("metadata") or {}
    conditions = sorted(
        {v.get("condition", "") for v in metadata.values() if v.get("condition")}
    )
    return {"condition_levels": conditions}


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


def _vst_metadata(project: dict, raw_counts_id: str) -> tuple[dict, bool]:
    """Metadata to run the VST PCA with, plus whether it had to be inferred.

    VST depends only on the raw counts: vst(blind = TRUE) is fitted under
    design ~ 1, so condition and batch never enter the transform. They label
    the points and supply the batch-correction design, nothing else. An
    unsaved metadata table therefore must not push PCA onto the FPKM
    fallback — conditions are inferred from the sample names exactly as the
    FPKM path and the samples endpoint already do, and the caller is told
    they were inferred.
    """
    saved = project.get("metadata") or {}
    if saved:
        return saved, False

    df = load_raw_counts(raw_counts_id)
    if df is None:
        return {}, True
    inferred = _infer_conditions(list(df.columns))
    return {s: {"condition": c, "batch": ""} for s, c in inferred.items()}, True


@router.get("/{project_id}/pca")
def get_project_pca(project_id: str, n_genes: int = Query(default=500, ge=1, le=5000)):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    meta = project.get("metadata") or None
    raw_counts_id = project.get("raw_counts_dataset_id")
    fpkm_id = project.get("fpkm_dataset_id")

    # Raw counts is checked first and on its own: a true VST is available for
    # any project that has counts, whether or not metadata has been saved and
    # whether or not a DE contrast has ever been run. FPKM is computed
    # automatically for these projects, so testing it first would let the
    # fallback win every time.
    if raw_counts_id:
        vst_meta, meta_inferred = _vst_metadata(project, raw_counts_id)
        try:
            result = _compute_vst_pca(raw_counts_id, vst_meta, n_genes, meta_inferred)
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))
        if result is None:
            raise HTTPException(status_code=404, detail="Raw counts not found")
        return result

    # Fallback: log2(FPKM+1) PCA — only for projects with no raw counts at all.
    if not fpkm_id:
        raise HTTPException(status_code=422, detail="Project has no FPKM or raw counts dataset")
    result = _compute_pca(fpkm_id, n_genes, override_metadata=meta)
    if result is None:
        raise HTTPException(status_code=404, detail="FPKM matrix not found")
    return result


@router.post("/{project_id}/render-r-pca")
def render_project_r_pca(project_id: str, params: RPcaParams):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    meta = project.get("metadata") or None
    raw_counts_id = project.get("raw_counts_dataset_id")
    fpkm_id = project.get("fpkm_dataset_id")

    plot_title = params.plot_title or project.get("name", "")

    # Same priority as GET /pca: raw counts first, FPKM only as the fallback,
    # so the R render never disagrees with the interactive plot about which
    # transform produced the coordinates.
    if raw_counts_id:
        vst_meta, meta_inferred = _vst_metadata(project, raw_counts_id)
        try:
            pca_data = _compute_vst_pca(raw_counts_id, vst_meta, params.n_genes, meta_inferred)
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))
        if pca_data is None:
            raise HTTPException(status_code=404, detail="Raw counts not found")
        d = dataset_dir(raw_counts_id)
    elif fpkm_id:
        pca_data = _compute_pca(fpkm_id, params.n_genes, override_metadata=meta)
        if pca_data is None:
            raise HTTPException(status_code=404, detail="FPKM matrix not found")
        d = dataset_dir(fpkm_id)
    else:
        raise HTTPException(status_code=422, detail="Project has no FPKM or raw counts dataset")

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
    # Per-condition means, present when the DE run wrote them. Forwarded so the
    # mini-volcano hover can report FPKM per condition like the main volcano.
    optional += [c for c in df.columns if c.startswith("FPKM_") and c not in optional]
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


# ── DESeq2 endpoints ──────────────────────────────────────────────────────────

class RunDeseq2Body(BaseModel):
    reference_level: str
    comparison_level: str


@router.post("/{project_id}/run-deseq2")
def run_project_deseq2(project_id: str, body: RunDeseq2Body):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    raw_counts_id = project.get("raw_counts_dataset_id")
    if not raw_counts_id:
        raise HTTPException(status_code=422, detail="Project has no raw counts dataset")

    species = project.get("raw_counts_species")
    gtf_path = GTF_PATHS.get(species)
    if not gtf_path:
        raise HTTPException(status_code=422, detail=f"Unknown species: {species!r}")

    metadata = project.get("metadata") or {}
    if not metadata:
        raise HTTPException(
            status_code=422,
            detail=(
                "Sample metadata not saved. Save metadata on Screen 2 before running DESeq2."
            ),
        )

    d = dataset_dir(raw_counts_id)
    counts_csv_path = os.path.join(d, "raw_counts.csv")
    if not os.path.exists(counts_csv_path):
        raise HTTPException(status_code=404, detail="Raw counts matrix file not found")

    output_csv_path = os.path.join(d, "deseq2_results.csv")
    params = {
        "counts_csv_path": counts_csv_path,
        "metadata": metadata,
        "reference_level": body.reference_level,
        "comparison_level": body.comparison_level,
        "gtf_path": gtf_path,
        "output_csv_path": output_csv_path,
    }
    params_path = os.path.join(d, "deseq2_params.json")
    with open(params_path, "w") as f:
        json.dump(params, f, indent=2)

    try:
        cmd = _find_rscript() + [os.path.abspath(R_DESEQ2_SCRIPT), params_path]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"DESeq2 failed:\n{result.stderr[-4000:]}",
        )

    if not os.path.exists(output_csv_path):
        raise HTTPException(
            status_code=500,
            detail="DESeq2 script ran but produced no output file",
        )

    try:
        de_df = pd.read_csv(output_csv_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read DESeq2 output: {e}")

    de_id = str(uuid.uuid4())
    save_dataset(de_id, de_df)

    project["de_dataset_id"] = de_id
    project["de_provenance"] = "DESeq2 (raw counts)"
    save_project(project_id, project)

    return {"de_dataset_id": de_id, "capabilities": _capabilities(project)}


# ── limma DE endpoint (FPKM-only projects) ────────────────────────────────────

class RunLimmaBody(BaseModel):
    reference_level: str
    comparison_level: str


@router.post("/{project_id}/run-limma")
def run_project_limma(project_id: str, body: RunLimmaBody):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # limma is only offered when raw counts are NOT available — raw-counts
    # projects must use DESeq2, and the UI never shows this option for them.
    if project.get("raw_counts_dataset_id"):
        raise HTTPException(
            status_code=422,
            detail="This project has raw counts — use DESeq2 instead of limma.",
        )

    fpkm_id = project.get("fpkm_dataset_id")
    if not fpkm_id:
        raise HTTPException(
            status_code=422,
            detail="Project has no FPKM dataset — cannot run limma.",
        )

    metadata = project.get("metadata") or {}
    if not metadata:
        raise HTTPException(
            status_code=422,
            detail=(
                "Sample metadata not saved. Save metadata on Screen 2 before running DE analysis."
            ),
        )

    d = dataset_dir(fpkm_id)
    fpkm_csv_path = os.path.join(d, "fpkm_matrix.csv")
    if not os.path.exists(fpkm_csv_path):
        raise HTTPException(status_code=404, detail="FPKM matrix file not found")

    output_csv_path = os.path.join(d, "limma_results.csv")
    params = {
        "fpkm_csv_path": fpkm_csv_path,
        "metadata": metadata,
        "reference_level": body.reference_level,
        "comparison_level": body.comparison_level,
        "output_csv_path": output_csv_path,
    }
    params_path = os.path.join(d, "limma_params.json")
    with open(params_path, "w") as f:
        json.dump(params, f, indent=2)

    try:
        cmd = _find_rscript() + [os.path.abspath(R_LIMMA_SCRIPT), params_path]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"limma failed:\n{result.stderr[-4000:]}",
        )

    if not os.path.exists(output_csv_path):
        raise HTTPException(
            status_code=500,
            detail="limma script ran but produced no output file",
        )

    try:
        de_df = pd.read_csv(output_csv_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read limma output: {e}")

    de_id = str(uuid.uuid4())
    save_dataset(de_id, de_df)

    project["de_dataset_id"] = de_id
    project["de_provenance"] = "limma (FPKM-only)"
    save_project(project_id, project)

    return {"de_dataset_id": de_id, "capabilities": _capabilities(project)}


# ── Universal pathway analysis endpoint ───────────────────────────────────────

class RunPathwayAnalysisBody(BaseModel):
    padj_cutoff: float = 0.05
    lfc_cutoff: float = 1.0


@router.post("/{project_id}/run-pathway-analysis")
def run_project_pathway_analysis(project_id: str, body: RunPathwayAnalysisBody):
    project = load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    de_id = project.get("de_dataset_id")
    if not de_id:
        raise HTTPException(
            status_code=422,
            detail="Project has no DE dataset — run DESeq2 or limma DE analysis first.",
        )

    species = project.get("species") or project.get("raw_counts_species")
    if not species:
        raise HTTPException(
            status_code=422,
            detail=(
                "Species not set for this project. Recreate the project and select "
                "a species (Human / Mouse) to enable pathway enrichment analysis."
            ),
        )

    d = dataset_dir(de_id)
    de_csv_path = os.path.join(d, "de_results.csv")
    if not os.path.exists(de_csv_path):
        raise HTTPException(status_code=404, detail="DE results file not found")

    pw_id = str(uuid.uuid4())
    pw_d = dataset_dir(pw_id)
    os.makedirs(pw_d, exist_ok=True)
    output_csv_path = os.path.join(pw_d, "pathway_results.csv")

    params = {
        "de_csv_path": de_csv_path,
        "species": species,
        "padj_cutoff": body.padj_cutoff,
        "lfc_cutoff": body.lfc_cutoff,
        "output_csv_path": output_csv_path,
    }
    params_path = os.path.join(pw_d, "enrichgo_params.json")
    with open(params_path, "w") as f:
        json.dump(params, f, indent=2)

    try:
        cmd = _find_rscript() + [os.path.abspath(R_ENRICHGO_SCRIPT), params_path]
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Pathway analysis failed:\n{result.stderr[-4000:]}",
        )

    if not os.path.exists(output_csv_path):
        raise HTTPException(
            status_code=500,
            detail="Pathway analysis script ran but produced no output file",
        )

    try:
        pw_df = pd.read_csv(output_csv_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read pathway output: {e}")

    meta = {"direction_available": True}
    save_pathway_results(pw_id, pw_df, meta)

    project["pathway_dataset_id"] = pw_id
    save_project(project_id, project)

    return {
        "pathway_dataset_id": pw_id,
        "n_pathways": len(pw_df),
        "capabilities": _capabilities(project),
    }
