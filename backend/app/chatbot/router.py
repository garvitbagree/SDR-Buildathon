from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.chatbot import orchestrator
from app.db import get_db
from app.schemas.chatbot import ChatIn, ChatOut

router = APIRouter(tags=["chatbot"])


@router.post("/chat", response_model=ChatOut)
def chat(body: ChatIn, db: Session = Depends(get_db)):
    return orchestrator.handle(db, body)