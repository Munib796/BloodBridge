"""Timer for the request sweeps that previously only ran via the admin
endpoints (`POST /blood-requests/admin/expire-overdue` and `/admin/auto-widen`,
both of which stay available for on-demand testing).

BackgroundScheduler rather than AsyncIOScheduler: the sweeps are the same
blocking SQLAlchemy/psycopg2 code the endpoints run, so they belong on their own
thread instead of the event loop — the same reason the endpoints are sync `def`.

Started from the app's lifespan (see main.py), so merely importing the app —
tests, `alembic`, offline schema dumps — never starts a timer. Set
ENABLE_SCHEDULER=false to keep it off even when the app really does run.
"""

import logging
from typing import Callable

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from src.blood_requests.controller import auto_widen_stale_requests, expire_overdue_requests
from src.utils.database import session_scope
from src.utils.settings import settings

logger = logging.getLogger(__name__)

# Module-level so a second start_scheduler() call (reload, double lifespan) is a
# no-op rather than a second set of jobs racing the first.
_scheduler: BackgroundScheduler | None = None

# job id -> (human name, sweep). Both sweeps return the number of requests they
# touched, which is what gets logged.
_SWEEPS: dict[str, tuple[str, Callable[[Session], int]]] = {
    "expire_overdue_requests": ("expire-overdue", expire_overdue_requests),
    "auto_widen_stale_requests": ("auto-widen", auto_widen_stale_requests),
}


def _run_sweep(job_id: str) -> None:
    """Run one sweep in its own short-lived session.

    The scheduler thread has no request to borrow a session from, and holding
    one open between runs would pin a pooled connection for the life of the
    process — so each run opens and closes its own, exactly as the chat socket
    does.
    """
    name, sweep = _SWEEPS[job_id]
    try:
        with session_scope() as db:
            affected = sweep(db)
    except Exception:
        # Never let a failed sweep kill the job; APScheduler would otherwise
        # keep the schedule but the traceback would go unlogged.
        logger.exception("Sweep %s failed", name)
        return
    logger.info("Sweep %s ran: %d request(s) affected", name, affected)


def start_scheduler() -> BackgroundScheduler | None:
    """Start the sweep timer, or return None if it is disabled."""
    global _scheduler

    if not settings.ENABLE_SCHEDULER:
        logger.info(
            "Sweep scheduler disabled (ENABLE_SCHEDULER=false); "
            "expire-overdue and auto-widen only run via the admin endpoints"
        )
        return None
    if _scheduler is not None:
        return _scheduler

    # Guard against a 0 or negative interval in .env, which APScheduler would
    # take as "run continuously".
    interval = max(settings.SWEEP_INTERVAL_MINUTES, 1)

    scheduler = BackgroundScheduler(timezone="UTC")
    for job_id, (name, _sweep) in _SWEEPS.items():
        scheduler.add_job(
            _run_sweep,
            trigger="interval",
            minutes=interval,
            args=[job_id],
            id=job_id,
            name=f"sweep:{name}",
            # A slow sweep must not stack up behind itself, and after a pause
            # (suspended host, redeploy) we want one catch-up run, not a
            # backlog of every interval that was missed.
            max_instances=1,
            coalesce=True,
            misfire_grace_time=60,
        )
    scheduler.start()

    _scheduler = scheduler
    logger.info(
        "Sweep scheduler started: expire-overdue and auto-widen every %d minute(s)", interval
    )
    return scheduler


def shutdown_scheduler() -> None:
    global _scheduler

    if _scheduler is None:
        return
    # wait=False: a sweep in flight owns its own session and will finish or be
    # rolled back by the closing connection; blocking shutdown on it would just
    # delay the process exit.
    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("Sweep scheduler stopped")
