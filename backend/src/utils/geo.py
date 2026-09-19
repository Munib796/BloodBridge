from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_Distance, ST_MakePoint, ST_SetSRID
from sqlalchemy import Column


def make_point(latitude: float, longitude: float):
    """Build a PostGIS geography Point from lat/lng, ready to assign to a
    Geography(geometry_type='POINT') column."""
    return ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)


def within_radius(location_column: Column, latitude: float, longitude: float, radius_km: float):
    """SQLAlchemy filter expression: rows whose `location_column` is within
    `radius_km` kilometres of (latitude, longitude). Use in a .filter(...)."""
    point = make_point(latitude, longitude)
    return ST_DWithin(location_column, point, radius_km * 1000)  # metres


def distance_km(location_column: Column, latitude: float, longitude: float):
    """SQLAlchemy expression returning distance in km, for ordering by
    nearest-first (donor.location.distance ASC)."""
    point = make_point(latitude, longitude)
    return ST_Distance(location_column, point) / 1000.0


def GeographyPoint(nullable: bool = True):
    """Factory for a PostGIS geography Point column type. geoalchemy2's
    Geography type carries its own `nullable` flag used for DDL generation,
    which overrides SQLAlchemy Column(nullable=...) if left at the default —
    so every model must build its own instance with the right value."""
    return Geography(geometry_type="POINT", srid=4326, nullable=nullable, spatial_index=True)
