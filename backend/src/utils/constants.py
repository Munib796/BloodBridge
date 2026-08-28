from src.utils.enums import BloodType, RequestStatus, UrgencyLevel

# --- Radius matching (km) -----------------------------------------------
# Starting search radius for a request, based on urgency level.
DEFAULT_RADIUS_KM = {
    UrgencyLevel.CRITICAL: 25,
    UrgencyLevel.URGENT: 15,
    UrgencyLevel.ROUTINE: 8,
}

# How much to expand the radius by, each time the widen step fires.
RADIUS_WIDEN_STEP_KM = 10

# Smallest / largest radius we will ever search out to.
MIN_RADIUS_KM = 1
MAX_RADIUS_KM = 100

# How long (minutes) a request can sit with no accepted match before
# the radius auto-widens and the requestor is nudged. Consumed by
# blood_requests.controller.auto_widen_stale_requests().
WIDEN_AFTER_MINUTES = {
    UrgencyLevel.CRITICAL: 15,
    UrgencyLevel.URGENT: 30,
    UrgencyLevel.ROUTINE: 60,
}

# --- Request lifecycle ---------------------------------------------------
# Statuses in which a request is still open to donors: it shows up in the
# nearby feed, and is the only state from which units can be reserved.
OPEN_STATUSES = (RequestStatus.ACTIVE, RequestStatus.PARTIALLY_MATCHED)

# Statuses from which nothing more can happen — no cancelling, widening,
# reactivating or closing.
TERMINAL_STATUSES = (
    RequestStatus.FULFILLED,
    RequestStatus.CLOSED,
    RequestStatus.CANCELLED,
    RequestStatus.REJECTED,
)

# A request may only be pulled back into matching from one of these.
# Notably absent: REJECTED (a hospital said no — reopening would bypass
# verification) and CANCELLED/CLOSED (deliberate terminal decisions).
REACTIVATABLE_STATUSES = (
    RequestStatus.ACTIVE,
    RequestStatus.PARTIALLY_MATCHED,
    RequestStatus.FULLY_MATCHED,
    RequestStatus.EXPIRED,
)

# --- Blood type compatibility --------------------------------------------
# Maps a recipient's blood type -> the donor blood types that can safely
# give to them. Used to decide which donors get notified for a request.
COMPATIBLE_DONORS_FOR_RECIPIENT = {
    BloodType.O_NEG: [BloodType.O_NEG],
    BloodType.O_POS: [BloodType.O_NEG, BloodType.O_POS],
    BloodType.A_NEG: [BloodType.O_NEG, BloodType.A_NEG],
    BloodType.A_POS: [BloodType.O_NEG, BloodType.O_POS, BloodType.A_NEG, BloodType.A_POS],
    BloodType.B_NEG: [BloodType.O_NEG, BloodType.B_NEG],
    BloodType.B_POS: [BloodType.O_NEG, BloodType.O_POS, BloodType.B_NEG, BloodType.B_POS],
    BloodType.AB_NEG: [BloodType.O_NEG, BloodType.A_NEG, BloodType.B_NEG, BloodType.AB_NEG],
    BloodType.AB_POS: list(BloodType),  # universal recipient
}

# --- Input validation limits ---------------------------------------------
MIN_PASSWORD_LENGTH = 8
# Upper bound is a DoS guard, not a security rule — argon2 has no inherent
# length limit, but hashing a multi-megabyte "password" is expensive.
MAX_PASSWORD_LENGTH = 128

MIN_UNITS = 1
MAX_UNITS = 20

MAX_NAME_LENGTH = 120
MIN_PHONE_LENGTH = 7
MAX_PHONE_LENGTH = 20
MAX_ADDRESS_LENGTH = 300
MAX_CHAT_MESSAGE_LENGTH = 2000

# --- Uploads -------------------------------------------------------------
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_IMAGE_CONTENT_TYPES = frozenset(
    {"image/jpeg", "image/pjpeg", "image/png", "image/webp"}
)
