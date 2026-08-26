import json
import os
import shutil

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/categories")

_SEED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "seed_data")
_DEFAULT_PATH = os.path.join(_SEED_DIR, "categories_default.json")

# Live copy lives alongside per-dataset dirs in STORAGE_ROOT.
# Bootstrapped from the seed on first access.
from app.storage import STORAGE_ROOT
_LIVE_PATH = os.path.join(STORAGE_ROOT, "categories.json")


def _bootstrap() -> None:
    """Copy seed defaults to STORAGE_ROOT on first use."""
    os.makedirs(STORAGE_ROOT, exist_ok=True)
    if not os.path.exists(_LIVE_PATH):
        shutil.copy2(_DEFAULT_PATH, _LIVE_PATH)


def _load(path: str) -> list:
    with open(path) as f:
        return json.load(f)


def _save(categories: list) -> None:
    os.makedirs(STORAGE_ROOT, exist_ok=True)
    with open(_LIVE_PATH, "w") as f:
        json.dump(categories, f, indent=2)


@router.get("")
def get_categories():
    _bootstrap()
    return _load(_LIVE_PATH)


@router.put("")
def update_categories(categories: list):
    for cat in categories:
        if not isinstance(cat, dict):
            raise HTTPException(status_code=422, detail="Each category must be an object")
        if "name" not in cat or "genes" not in cat:
            raise HTTPException(status_code=422, detail="Each category must have 'name' and 'genes'")
        if not isinstance(cat["genes"], list):
            raise HTTPException(status_code=422, detail="'genes' must be a list")
    _save(categories)
    return {"saved": True, "n_categories": len(categories)}


@router.post("/reset-defaults")
def reset_defaults():
    try:
        defaults = _load(_DEFAULT_PATH)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="categories_default.json not found on server")
    _save(defaults)
    return {"reset": True, "n_categories": len(defaults)}
