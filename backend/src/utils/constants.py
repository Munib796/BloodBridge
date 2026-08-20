from src.utils.enums import BloodType, UrgencyLevel

# --- Radius matching (km) -----------------------------------------------
# Starting search radius for a request, based on urgency level.
DEFAULT_RADIUS_KM = {
    UrgencyLevel.CRITICAL: 25,
    UrgencyLevel.URGENT: 15,
    UrgencyLevel.ROUTINE: 8,
}

# How much to expand the radius by, each time the widen step fires.
RADIUS_WIDEN_STEP_KM = 10

# Max radius we will ever search out to.
MAX_RADIUS_KM = 100

# How long (minutes) a request can sit with no accepted match before
# the radius auto-widens and the requestor is nudged.
WIDEN_AFTER_MINUTES = {
    UrgencyLevel.CRITICAL: 15,
    UrgencyLevel.URGENT: 30,
    UrgencyLevel.ROUTINE: 60,
}

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
