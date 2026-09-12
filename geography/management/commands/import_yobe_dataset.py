"""
Import Yobe State's LGAs, wards and polling units from the official
``yobe-polling-units.csv`` dataset shipped in the project root.

Expected columns (no header row — one row per polling unit):

    s/n, state, lg, ward, state_code, lg_code, ward_code, pu_code, code, location[, ward_des]

e.g.::

    1,yobe,fika,daya/chana,35,04,01,006,35/04/01/006,"kukar gadu, pri. sch. i",daya/chana (ward: 01) - yobe

The command is idempotent: re-running it updates existing records in place
instead of duplicating them (matching is case-insensitive on geographic
names and exact on polling-unit codes), so it is safe to run after every
new dataset release.

Usage::

    python manage.py import_polling_units
    python manage.py import_polling_units --file path/to/yobe-polling-units.csv
    python manage.py import_polling_units --dry-run
"""

import csv
import re
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from geography.models import LGA, PollingUnit, State, Ward


def smart_title(value: str) -> str:
    """Collapse repeated whitespace and title-case (the dataset is lower-cased)."""
    return re.sub(r"\s+", " ", value.strip()).title()


class Command(BaseCommand):
    help = "Import states/LGAs/wards/polling units from yobe-polling-units.csv (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            default="yobe-polling-units.csv",
            help="Path to the CSV dataset (default: yobe-polling-units.csv in the project root).",
        )
        parser.add_argument(
            "--source-note",
            default="INEC PU dataset (yobe-polling-units.csv)",
            help="Value stored on imported polling units as their provenance note.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse the file and report what would change without writing to the database.",
        )

    def handle(self, *args, **options):
        file_arg = Path(options["file"])
        path = file_arg if file_arg.is_absolute() else (settings.BASE_DIR / file_arg)
        if not path.exists():
            raise CommandError(f"CSV file not found: {path}")

        dry_run = options["dry_run"]
        source_note = options["source_note"]
        counts = {"states": 0, "lgas": 0, "wards": 0, "pus": 0, "pus_updated": 0, "skipped": 0}

        # Parse everything first so a malformed file can never leave a
        # half-imported dataset behind.
        parsed = []
        with path.open(newline="", encoding="utf-8-sig") as fh:
            reader = csv.reader(fh)
            for line_no, row in enumerate(reader, start=1):
                cells = [c.strip() for c in row]
                if not any(cells):
                    continue
                # Tolerate a header row if a future export adds one.
                if len(cells) >= 3 and cells[1].lower() == "state" and cells[2].lower() in ("lg", "lga"):
                    continue
                if len(cells) < 10:
                    self.stdout.write(
                        self.style.WARNING(f"Line {line_no}: expected >= 10 columns, got {len(cells)} — skipped.")
                    )
                    counts["skipped"] += 1
                    continue
                parsed.append(
                    {
                        "state_name": smart_title(cells[1]) or "Yobe",
                        "lga_name": smart_title(cells[2]),
                        "ward_name": smart_title(cells[3]),
                        "state_code": cells[4],
                        "lga_code": cells[5],
                        "ward_code": cells[6],
                        "official_code": cells[8],
                        "pu_name": smart_title(cells[9]),
                        "ward_des": cells[10].strip() if len(cells) > 10 else "",
                    }
                )

        if not parsed:
            raise CommandError("No polling-unit rows found in the CSV file.")
        self.stdout.write(f"Parsed {len(parsed)} polling-unit rows from {path.name}.")

        with transaction.atomic():
            cache_states, cache_lgas, cache_wards = {}, {}, {}
            seen_states, seen_lgas, seen_wards = set(), set(), set()

            for item in parsed:
                # --- State ---
                state = cache_states.get(item["state_name"])
                if state is None:
                    state = State.objects.filter(name__iexact=item["state_name"]).first()
                    if state is None:
                        if item["state_name"] not in seen_states:
                            seen_states.add(item["state_name"])
                            counts["states"] += 1
                        if not dry_run:
                            state = State.objects.create(name=item["state_name"], code=item["state_code"])
                            cache_states[item["state_name"]] = state
                    else:
                        cache_states[item["state_name"]] = state
                        if state.code != item["state_code"] and item["state_code"]:
                            state.code = item["state_code"]
                            if not dry_run:
                                state.save(update_fields=["code"])
                if state is None:
                    continue  # dry-run: nothing to attach parents to yet

                # --- LGA ---
                lga_key = (state.id, item["lga_name"])
                lga = cache_lgas.get(lga_key)
                if lga is None:
                    lga = LGA.objects.filter(state=state, name__iexact=item["lga_name"]).first()
                    if lga is None:
                        if lga_key not in seen_lgas:
                            seen_lgas.add(lga_key)
                            counts["lgas"] += 1
                        if not dry_run:
                            lga = LGA.objects.create(state=state, name=item["lga_name"], code=item["lga_code"])
                            cache_lgas[lga_key] = lga
                    else:
                        cache_lgas[lga_key] = lga
                        if item["lga_code"] and not lga.code:
                            lga.code = item["lga_code"]
                            if not dry_run:
                                lga.save(update_fields=["code"])

                # --- Ward ---
                ward_key = (lga.id if lga else item["lga_name"], item["ward_name"])
                ward = cache_wards.get(ward_key)
                if ward is None:
                    ward = Ward.objects.filter(lga=lga, name__iexact=item["ward_name"]).first() if lga else None
                    if ward is None:
                        if ward_key not in seen_wards:
                            seen_wards.add(ward_key)
                            counts["wards"] += 1
                        if not dry_run:
                            ward = Ward.objects.create(lga=lga, name=item["ward_name"], code=item["ward_code"])
                            cache_wards[ward_key] = ward
                    else:
                        cache_wards[ward_key] = ward
                        if item["ward_code"] and not ward.code:
                            ward.code = item["ward_code"]
                            if not dry_run:
                                ward.save(update_fields=["code"])

                # --- Polling unit ---
                pu = PollingUnit.objects.filter(official_code=item["official_code"]).first()
                if pu is None:
                    if not dry_run:
                        PollingUnit.objects.create(
                            ward=ward,
                            official_code=item["official_code"],
                            name=item["pu_name"] or item["official_code"],
                            location_description=item["ward_des"],
                            source_note=source_note,
                        )
                    counts["pus"] += 1
                else:
                    changed = []
                    new_ward_id = ward.id if ward else None
                    if new_ward_id and pu.ward_id != new_ward_id:
                        changed.append("ward")
                    if item["pu_name"] and pu.name != item["pu_name"]:
                        changed.append("name")
                    if changed and not dry_run:
                        if "ward" in changed:
                            pu.ward = ward
                        if "name" in changed:
                            pu.name = item["pu_name"]
                        pu.data_version += 1
                        pu.save(update_fields=["name", "ward", "data_version", "updated_at"])
                    if changed:
                        counts["pus_updated"] += 1

        verb = "[dry-run] would create " if dry_run else "created "
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb}{counts['states']} state(s), {counts['lgas']} LGA(s), "
                f"{counts['wards']} ward(s), {counts['pus']} polling unit(s); "
                f"updated {counts['pus_updated']} existing PU(s); skipped {counts['skipped']} row(s)."
            )
        )
