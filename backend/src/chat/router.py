import json
import logging
import time
from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy.orm import Session

from src.chat import controller, dtos
from src.utils.auth import Identity, get_current_identity, resolve_identity
from src.utils.database import get_db, session_scope
from src.utils.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# Per-socket flood guard: a WebSocket bypasses the HTTP rate limiter, and every
# message is a DB insert.
WS_MAX_MESSAGES = 20
WS_WINDOW_SECONDS = 10.0


@router.get("/{match_id}/messages", response_model=list[dtos.ChatMessageOut])
def get_messages(
    match_id: str,
    identity: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    return controller.list_messages(match_id, identity, db)


@router.post("/{match_id}/messages", response_model=dtos.ChatMessageOut, status_code=201)
@limiter.limit("60/minute")
def send_message(
    request: Request,
    match_id: str,
    data: dtos.ChatMessageIn,
    identity: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    return controller.send_message(match_id, identity, data, db)


class ConnectionManager:
    """Minimal in-memory broadcaster: one list of open sockets per match's
    chat thread. Fine at this scale — no external pub/sub needed.

    Note this is per-process: with multiple uvicorn workers, a message only
    reaches sockets on the same worker. REST history stays authoritative.
    """

    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, match_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.setdefault(match_id, []).append(websocket)

    def disconnect(self, match_id: str, websocket: WebSocket) -> None:
        sockets = self.active.get(match_id)
        if not sockets:
            return
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets:
            del self.active[match_id]

    async def broadcast(self, match_id: str, payload: dict) -> None:
        # Iterate a copy and drop sockets that fail: a single dead peer used to
        # raise here and stop delivery to everyone else in the thread.
        dead: list[WebSocket] = []
        for websocket in list(self.active.get(match_id, [])):
            try:
                await websocket.send_json(payload)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            self.disconnect(match_id, websocket)


manager = ConnectionManager()


@router.websocket("/ws/{match_id}")
async def chat_websocket(websocket: WebSocket, match_id: str, token: str):
    """Browsers can't set custom headers on a WebSocket handshake, so the
    access token is passed as a query param instead: /chat/ws/{match_id}?token=...

    Each message opens its own short-lived DB session. Holding one open for the
    life of the socket would exhaust the connection pool after a handful of
    idle chats and stall the entire API.
    """
    # Authenticate before accepting, then release the connection immediately.
    try:
        with session_scope() as db:
            identity = resolve_identity(token, db)
            thread = controller.get_thread_for_match(match_id, db)
            controller.assert_participant(thread, identity, db)
    except HTTPException:
        await websocket.close(code=4401)
        return
    except Exception:
        logger.exception("Unexpected error authenticating chat socket for match %s", match_id)
        await websocket.close(code=1011)
        return

    await manager.connect(match_id, websocket)
    recent: deque[float] = deque()

    try:
        while True:
            raw = await websocket.receive_text()

            now = time.monotonic()
            while recent and now - recent[0] > WS_WINDOW_SECONDS:
                recent.popleft()
            if len(recent) >= WS_MAX_MESSAGES:
                await websocket.send_json({"error": "Slow down — too many messages"})
                continue
            recent.append(now)

            try:
                incoming = json.loads(raw)
                payload_in = dtos.ChatMessageIn(content=(incoming or {}).get("content", ""))
            except (json.JSONDecodeError, ValidationError, AttributeError, TypeError):
                # A malformed frame shouldn't tear down the conversation.
                await websocket.send_json({"error": "Expected {\"content\": \"...\"}"})
                continue

            try:
                # Re-resolving the token each message means an expired or
                # revoked session stops working mid-socket, instead of living
                # on until the client disconnects.
                with session_scope() as db:
                    identity = resolve_identity(token, db)
                    message = controller.send_message(match_id, identity, payload_in, db)
                    out = dtos.ChatMessageOut.model_validate(message).model_dump(mode="json")
            except HTTPException as exc:
                await websocket.send_json({"error": exc.detail})
                if exc.status_code == 401:
                    await websocket.close(code=4401)
                    return
                continue

            await manager.broadcast(match_id, out)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Chat socket for match %s failed", match_id)
    finally:
        # Must run on every exit path, not just a clean disconnect — otherwise
        # dead sockets accumulate and broadcasts keep trying to write to them.
        manager.disconnect(match_id, websocket)
