from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .alignment import DEFAULT_SAKOE_CHIBA_RATIO, align_motion_sequences
from .models import AlignmentMap, CamelModel, MotionSequence

app = FastAPI(title="Universal Motion Coach API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3005"],
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
