"""Assign realistic GPS coordinates to polling units that lack them.

Yobe State electoral geography — each polling unit is placed near the
centroid of its parent LGA with controlled Gaussian scatter so the
map displays meaningful spatial distribution without overlapping dots.

Idempotent: only touches rows where latitude/longitude are NULL.

Run:
    python manage.py assign_coordinates --dry-run
    python manage.py assign_coordinates
"""

import math
import random

from django.core.management.base import BaseCommand
from django.db import transaction

from geography.models import PollingUnit, LGA

# Approximate LGA centroids for Yobe State, Nigeria.
# Source: geocoded LGA headquarters / population centres.
LGA_CENTROIDS: dict[str, tuple[float, float]] = {
    "Bade":        (12.8500, 10.9500),
    "Bursari":     (12.7500, 11.5000),
    "Damaturu":    (11.7500, 11.9500),
    "Fika":        (11.2500, 11.3000),
    "Fune":        (11.7500, 11.3500),
    "Geidam":      (12.8500, 11.9500),
    "Gujba":       (11.2500, 11.9500),
    "Gulani":      (11.0500, 11.6500),
    "Jakusko":     (12.3500, 10.7500),
    "Karasawa":    (11.5500, 11.8500),
    "Machina":     (13.0500, 10.0500),
    "Nangere":     (11.8500, 11.0500),
    "Nguru":       (12.8500, 10.4500),
    "Potiskum":    (11.7000, 11.0500),
    "Tarmuwa":     (12.1500, 11.8500),
    "Yunusari":    (13.0500, 11.7500),
    "Yusufari":    (13.0500, 11.1500),
}

# Ward-level offsets — small per-ward displacements so PUs from the same
# ward cluster together but not on the same point.  Keyed by (lga, ward).
# If a ward is not in this table, a deterministic hash is used instead.
WARD_OFFSETS: dict[tuple[str, str], tuple[float, float]] = {}


def _ward_offset(lga_name: str, ward_name: str) -> tuple[float, float]:
    """Return a deterministic small offset for a ward."""
    key = (lga_name, ward_name)
    if key in WARD_OFFSETS:
        return WARD_OFFSETS[key]
    # Hash-based pseudo-random offset within ±0.04 deg (~4.4 km).
    # Use a local Random instance to avoid polluting global random state.
    rng = random.Random(hash(key))
    dlat = rng.uniform(-0.04, 0.04)
    dlng = rng.uniform(-0.04, 0.04)
    return (dlat, dlng)


# Module-level counter ensures each _scatter call gets a unique seed
# even when called with the same lat/lng (same ward PUs).
_scatter_counter = 0


def _scatter(lat: float, lng: float, radius: float = 0.02) -> tuple[float, float]:
    """Return a random point within `radius` degrees of (lat, lng).

    Uses a local Random instance seeded uniquely per call so that
    repeated invocations for PUs in the same ward produce distinct points.
    """
    global _scatter_counter
    rng = random.Random(hash((lat, lng, _scatter_counter)))
    _scatter_counter += 1
    r = math.sqrt(rng.random()) * radius
    theta = rng.uniform(0, 2 * math.pi)
    return (
        round(lat + r * math.sin(theta), 6),
        round(lng + r * math.cos(theta), 6),
    )


class Command(BaseCommand):
    help = "Assign GPS coordinates to polling units that lack them."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report how many rows would be updated without writing.",
        )
        parser.add_argument(
            "--radius",
            type=float,
            default=0.03,
            help="Max scatter radius in degrees (default 0.03 ≈ 3.3 km).",
        )

    def handle(self, *args, **options):
        dry: bool = options["dry_run"]
        radius: float = options["radius"]

        missing_qs = PollingUnit.objects.filter(
            latitude__isnull=True, longitude__isnull=True
        ).select_related("ward__lga")

        total_missing = missing_qs.count()
        if total_missing == 0:
            self.stdout.write(self.style.SUCCESS("All polling units already have coordinates."))
            return

        self.stdout.write(
            f"{'Would assign' if dry else 'Assigning'} coordinates to {total_missing} polling unit(s)…"
        )

        updates: list[PollingUnit] = []
        skipped = 0

        for pu in missing_qs.iterator():
            lga_obj: LGA = pu.ward.lga
            centroid = LGA_CENTROIDS.get(lga_obj.name)
            if centroid is None:
                skipped += 1
                self.stdout.write(
                    self.style.WARNING(f"  No centroid for LGA '{lga_obj.name}' — skipping {pu.official_code}")
                )
                continue

            base_lat, base_lng = centroid
            wlat, wlng = _ward_offset(lga_obj.name, pu.ward.name)
            lat, lng = _scatter(base_lat + wlat, base_lng + wlng, radius=radius)
            pu.latitude = lat
            pu.longitude = lng
            updates.append(pu)

        if dry:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Would update {len(updates)} polling unit(s), skip {skipped}."
                )
            )
            return

        with transaction.atomic():
            PollingUnit.objects.bulk_update(updates, ["latitude", "longitude"], batch_size=500)

        self.stdout.write(
            self.style.SUCCESS(
                f"Updated {len(updates)} polling unit(s), skipped {skipped}."
            )
        )

        # Sanity-check remaining
        remaining = PollingUnit.objects.filter(latitude__isnull=True, longitude__isnull=True).count()
        if remaining:
            self.stdout.write(self.style.WARNING(f"{remaining} polling unit(s) still without coordinates."))
