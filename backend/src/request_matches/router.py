from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from src.request_matches import controller, dtos
from src.request_matches.controller import get_current_acceptor
from src.utils.auth import Identity
from src.utils.database import get_db
from src.utils.limiter import limiter

router = APIRouter(prefix="/request-matches", tags=["request_matches"])


@router.post("/{request_id}/accept", response_model=dtos.RequestMatchOut, status_code=201)
@limiter.limit("20/minute")
def accept_request(
    request: Request,
    request_id: str,
    data: dtos.MatchAccept,
    actor: Identity = Depends(get_current_acceptor),
    db: Session = Depends(get_db),
):
    return controller.accept_request(request_id, data, db, actor)


@router.get("/mine", response_model=list[dtos.RequestMatchOut])
def list_my_matches(actor: Identity = Depends(get_current_acceptor), db: Session = Depends(get_db)):
    return controller.list_my_matches(db, actor)


@router.patch("/{match_id}/eta", response_model=dtos.RequestMatchOut)
def update_eta(
    match_id: str,
    data: dtos.MatchUpdateEta,
    actor: Identity = Depends(get_current_acceptor),
    db: Session = Depends(get_db),
):
    return controller.update_eta(match_id, data, db, actor)


@router.patch("/{match_id}/cancel", response_model=dtos.RequestMatchOut)
def cancel_match(
    match_id: str,
    data: dtos.MatchCancel,
    actor: Identity = Depends(get_current_acceptor),
    db: Session = Depends(get_db),
):
    return controller.cancel_match(match_id, data, db, actor)


@router.patch("/{match_id}/complete", response_model=dtos.RequestMatchOut)
def complete_match(
    match_id: str,
    actor: Identity = Depends(get_current_acceptor),
    db: Session = Depends(get_db),
):
    return controller.complete_match(match_id, db, actor)
