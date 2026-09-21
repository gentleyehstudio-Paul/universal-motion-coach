import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .alignment import DEFAULT_SAKOE_CHIBA_RATIO, align_motion_sequences
from .models import AlignmentMap, CamelModel, MotionSequence

app = FastAPI(title="Universal Motion Coach API")

# ALLOWED_ORIGINS: comma-separated list, e.g.
# "https://my-app.vercel.app,http://localhost:3000". Defaults to the two
# ports used during local dev (see README's "Running Locally"). Set this
# on the deployed backend (Railway/Render/etc.) to the frontend's actual
# production URL once it's known.
_default_origins = "http://localhost:3000,http://localhost:3005"
allowed_origins = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class AlignRequest(CamelModel):
    before: MotionSequence
    after: MotionSequence
    sakoe_chiba_ratio: float = DEFAULT_SAKOE_CHIBA_RATIO


@app.post("/align")
def align(request: AlignRequest) -> AlignmentMap:
    return align_motion_sequences(request.before, request.after, request.sakoe_chiba_ratio)
