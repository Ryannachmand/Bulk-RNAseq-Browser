import uuid
from fastapi import APIRouter, File, HTTPException, UploadFile
from app.parsers.de_table import DetectionError, parse_de_table
from app.storage import load_dataset, save_dataset

router = APIRouter(prefix="/datasets")


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
    return df.to_dict(orient="records")
