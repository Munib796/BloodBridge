import enum


class BloodType(str, enum.Enum):
    O_POS = "O+"
    O_NEG = "O-"
    A_POS = "A+"
    A_NEG = "A-"
    B_POS = "B+"
    B_NEG = "B-"
    AB_POS = "AB+"
    AB_NEG = "AB-"


class UrgencyLevel(str, enum.Enum):
    CRITICAL = "critical"
    URGENT = "urgent"
    ROUTINE = "routine"


class RequestStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_VERIFICATION = "pending_verification"
    ACTIVE = "active"
    PARTIALLY_MATCHED = "partially_matched"
    FULLY_MATCHED = "fully_matched"
    FULFILLED = "fulfilled"
    CLOSED = "closed"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class MatchStatus(str, enum.Enum):
    ACCEPTED = "accepted"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class ApprovalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class SenderType(str, enum.Enum):
    DONOR = "donor"
    REQUESTOR = "requestor"
    ORGANIZATION = "organization"


class NotificationType(str, enum.Enum):
    NEW_NEARBY_REQUEST = "new_nearby_request"
    FIRST_DONOR_ACCEPTED = "first_donor_accepted"
    REQUEST_COMPLETED = "request_completed"
    REQUESTOR_CANCELLED = "requestor_cancelled"
    DONOR_CANCELLED = "donor_cancelled"
    REQUEST_EXPIRED = "request_expired"
    NEW_CHAT_MESSAGE = "new_chat_message"
    PARTIAL_ACCEPT = "partial_accept"
    RADIUS_WIDENED = "radius_widened"
    DONOR_EAT_PASSED = "donor_eat_passed"
