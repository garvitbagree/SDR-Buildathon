from fastapi import APIRouter

from app.integrations.gmail import check_once, gmail_address

router = APIRouter(prefix="/inbox", tags=["inbox"])


@router.get("/config")
def config():
    address = gmail_address()
    return {"configured": bool(address), "address": address}


@router.post("/check")
def check_now(debug: bool = False):
    return check_once(debug=debug)