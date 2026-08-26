from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import datasets
from app.routers import categories

app = FastAPI(title="Bulk RNA-seq Browser")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets.router)
app.include_router(categories.router)


@app.get("/health")
def health():
    return {"status": "ok"}
