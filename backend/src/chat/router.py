from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from src.chat import controller, dtos
from src.utils.database import SessionLocal, get_db
from src.utils.helpers import decode_token

router = APIRouter(prefix="/chat", tags=["chat"])

oauth2_scheme_any = OAuth2PasswordBearer(tokenUrl="donors/login", auto_error=False)


def get_current_identity(token: str = Depends(oauth2_scheme_any)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    return {"role": payload.get("role"), "id": payload.get("id")}


@router.get("/{match_id}/messages", response_model=list[dtos.ChatMessageOut])
def get_messages(match_id: str, identity: dict = Depends(get_current_identity), db: Session = Depends(get_db)):
    return controller.list_messages(match_id, identity["role"], identity["id"], db)


@router.post("/{match_id}/messages", response_model=dtos.ChatMessageOut, status_code=201)
def send_message(
    match_id: str,
    data: dtos.ChatMessageIn,
    identity: dict = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    return controller.send_message(match_id, identity["role"], identity["id"], data, db)


class ConnectionManager:
    """Minimal in-memory broadcaster: one list of open sockets per match's
    chat thread. Fine at this scale — no external pub/sub needed."""

    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, match_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.setdefault(match_id, []).append(websocket)

    def disconnect(self, match_id: str, websocket: WebSocket) -> None:
        if match_id in self.active and websocket in self.active[match_id]:
            self.active[match_id].remove(websocket)

    async def broadcast(self, match_id: str, payload: dict) -> None:
        for ws in self.active.get(match_id, []):
            await ws.send_json(payload)


manager = ConnectionManager()


@router.websocket("/ws/{match_id}")
async def chat_websocket(websocket: WebSocket, match_id: str, token: str):
    """Browsers can't set custom headers on a WebSocket handshake, so the
    access token is passed as a query param instead: /chat/ws/{match_id}?token=..."""
    db = SessionLocal()
    try:
        payload = decode_token(token)
        role, entity_id = payload.get("role"), payload.get("id")
        thread = controller.get_thread_for_match(match_id, db)
        controller.assert_participant(thread, role, entity_id, db)
    except HTTPException:
        await websocket.close(code=4401)
        db.close()
        return

    await manager.connect(match_id, websocket)
    try:
        while True:
            incoming = await websocket.receive_json()
            message = controller.send_message(
                match_id, role, entity_id, dtos.ChatMessageIn(content=incoming.get("content", "")), db
            )
            out = dtos.ChatMessageOut.model_validate(message).model_dump(mode="json")
            await manager.broadcast(match_id, out)
    except WebSocketDisconnect:
        manager.disconnect(match_id, websocket)
    finally:
        db.close()
