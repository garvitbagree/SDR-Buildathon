import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.models import tables  # noqa: E402,F401  (registers the tables)
from app.routers import activity, campaigns, control, prompts, reps  # noqa: E402
from app.seed import seed  # noqa: E402
from app.seed_extra import seed_extra  # noqa: E402
from app.services.campaign_service import ServiceError  # noqa: E402


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
        seed_extra(db)
    yield


app = FastAPI(title="Autonomous SDR API", lifespan=lifespan)

origins = [o.strip() for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ServiceError)
async def service_error_handler(_: Request, exc: ServiceError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


app.include_router(campaigns.router)
app.include_router(control.router)
app.include_router(prompts.router)
app.include_router(reps.router)
app.include_router(activity.router)


@app.get("/health")
def health():
    return {"status": "ok"}