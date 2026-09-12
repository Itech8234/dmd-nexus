"""Import the authoritative Yobe INEC RA/PU list from a CSV file.

Replaces the demo seed (`seed_demo_data`) with the real electoral geography.
The importer is idempotent and data-versioned: re-running on the same file,
or importing a newer INEC release, does not duplicate polling units and
preserves operational history on matching records.

Typical INEC CSV columns (many official exports use a "state|LGA|ward|PU code|
PU name|..." layout). This command normalises a set of common header names, so
the exact export the deployment gets does not matter much — the mapping table
below is the only thing to adjust if a brand-new header shows up.

Idempotency keys:

* LGA  -> (state_name, lga_name)
* Ward -> (lga, ward_name)
* PU   -> official_code (the INEC code is authoritative and unique)

Run (from the project root):

    python manage.py import_polling_units /path/to/yobe_pu_list.csv
    # or, to check parsing without writing anything:
    python manage.py import_polling_units /path/to/yobe_pu_list.csv --dry-run
"""

import csv
import io
import re
from collections import OrderedDict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from geography.models import LGA, OperationalStatus, PollingUnit, State, Ward

# Map standard-ish INEC header names to our canonical field labels.
HEADER_ALIASES = {
    "state_name": ("state", "state_name"),
    "lga_name": (
        "lga",
        "local government",
        "local government area",
        "lga name",
    ),
    "ward_name": (
        "ward",
        "registration area",
        "ward name",
        "registration area name",
    ),
    "official_code": (
        "pu_code",
        "pucode",
        "polling unit code",
        "pu number",
        "code",
        "ra/pu code",
        "polling unit id",
    ),
    "name": (
        "pu_name",
        "polling unit name",
        "name",
        "polling unit",
    ),
    "latitude": ("latitude", "lat"),
    "longitude": ("longitude", "long", "lng"),
}

# INEC PU codes come in several shapes; normalise them so the same unit from
# two export revisions compares equal. We strip punctuation, uppercase, and
# collapse runs of whitespace/zeros where sensible.
def _normalise_code(value: str) -> str:
    value = (value or "").strip().upper()
    value = re.sub(r"\s+", "", value)
    value = re.sub(r"[^A-Z0-9]", "", value)
    return value


def _clean_float(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    # Some INEC exports comma-format coordinates ("12,343" -> 12.343).
    text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _resolve_header(header: str):
    """Return our canonical field label for a header, or None."""
    canonical = OrderedDict()
    for canonical_field, aliases in HEADER_ALIASES.items():
        if not isinstance(aliases, tuple):
            aliases = (aliases,)
        for alias in aliases:
            canonical[alias.strip().lower()] = canonical_field
    key = header.strip().lower()
    if key in canonical:
        return canonical[key]
    for alias, field in canonical.items():
        if key.endswith(alias) or alias in key:
            return field
    return None


class Command(BaseCommand):
    help = "Import the authoritative Yobe INEC RA/PU list from a CSV file."

    def add_arguments(self, parser):
        parser.add_argument(
            "csv_path",
            type=str,
            help="Path to the INEC PU-list CSV file.",
        )
        parser.add_argument(
            "--state",
            default="Yobe",
            help='State name (default "Yobe").',
        )
        parser.add_argument(
            "--state-code",
            default="YB",
            help="State code (default YB).",
        )
        parser.add_argument(
            "--encoding",
            default="utf-8-sig",
            help="CSV encoding (utf-8-sig handles a BOM, latin-1 for legacy exports).",
        )
        parser.add_argument(
            "--delimiter",
            default=None,
            help="CSV delimiter (auto-detected by default).",
        )
        parser.add_argument(
            "--data-version",
            type=int,
            default=2,
            help="Bump when importing a new authoritative revision (default 2).",
        )
        parser.add_argument(
            "--source",
            default="INEC RA/PU list (import)",
            help="Human-readable source_note for imported rows.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and validate without writing anything to the database.",
        )

    def handle(self, *args, **options):
        try:
            fileobj = io.open(options["csv_path"], "r", encoding=options["encoding"])
        except OSError as exc:
            raise CommandError(f"Could not open CSV: {exc}")
        with fileobj:
            delimiter = options["delimiter"]
            if not delimiter:
                header_sample = fileobj.read(4096)
                fileobj.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(header_sample, delimiters=",;\t|")
                    delimiter = dialect.delimiter
                except csv.Error:
                    delimiter = ","
            reader = csv.DictReader(fileobj, delimiter=delimiter)

            # Build a map: canonical field -> actual reader column.
            field_map = OrderedDict()
            unknown_headers = []
            if not reader.fieldnames:
                raise CommandError("CSV has no header row.")
            for header in reader.fieldnames:
                resolved = _resolve_header(header)
                if resolved:
                    field_map.setdefault(resolved, header)
                elif header.strip():
                    unknown_headers.append(header)
            missing = [f for f in ("state_name", "lga_name", "ward_name", "official_code", "name") if f not in field_map]
            if missing:
                raise CommandError(
                    "CSV is missing required columns: " + ", ".join(missing) +
                    ". Headers found: " + ", ".join(reader.fieldnames)
                )
            if unknown_headers:
                self.stdout.write(
                    self.style.WARNING(
                        "Ignoring unrecognised columns: " + ", ".join(unknown_headers)
                    )
                )

            summary = {"states": 0, "lgas": 0, "wards": 0, "created": 0, "updated": 0, "skipped": 0}
            state = None
            state_code = options["state_code"]
            state_name = options["state"]
            data_version = options["data_version"]
            source = options["source"]
            dry = options["dry_run"]

            with transaction.atomic():
                if not dry:
                    state, _ = State.objects.get_or_create(name=state_name, defaults={"code": state_code})

                for row_number, row in enumerate(reader, start=2):
                    def val(field):
                        raw = row.get(field_map[field], "") or ""
                        return str(raw).strip()

                    official_code = _normalise_code(val("official_code"))
                    if not official_code:
                        summary["skipped"] += 1
                        continue
                    name = val("name")
                    lga_name = val("lga_name")
                    ward_name = val("ward_name")
                    lat = _clean_float(val("latitude")) if "latitude" in field_map else None
                    lng = _clean_float(val("longitude")) if "longitude" in field_map else None
                    if not name or not lga_name or not ward_name:
                        summary["skipped"] += 1
                        continue

                    if dry:
                        summary["created"] += 1
                        continue

                    lga_obj, _ = LGA.objects.get_or_create(
                        state=state, name=lga_name, defaults={"code": _normalise_code(lga_name)[:20]}
                    )
                    summary["lgas"] += int(not _)
                    ward_obj, _ = Ward.objects.get_or_create(
                        lga=lga_obj, name=ward_name, defaults={"code": _normalise_code(ward_name)[:20]}
                    )
                    summary["wards"] += int(not _)

                    defaults = {
                        "name": name,
                        "location_description": "",
                        "latitude": lat,
                        "longitude": lng,
                        "data_version": data_version,
                        "source_note": source,
                    }
                    existing_qs = PollingUnit.objects.filter(ward=ward_obj, official_code=official_code)
                    existing = existing_qs.first()
                    if existing:
                        # Only refresh stable identity fields; never touch
                        # operational_status (that reflects live field state).
                        existing_qs.update(
                            name=name,
                            location_description=defaults["location_description"],
                            latitude=lat,
                            longitude=lng,
                            data_version=data_version,
                            source_note=source,
                        )
                        summary["updated"] += 1
                    else:
                        PollingUnit.objects.create(
                            ward=ward_obj,
                            official_code=official_code,
                            operational_status=OperationalStatus.AWAITING_ASSIGNMENT,
                            **defaults,
                        )
                        summary["created"] += 1

        if state and not dry:
            summary["states"] = (
                PollingUnit.objects.filter(ward__lga__state=state)
                .values("ward__lga__state")
                .distinct()
                .count()
            )

        label = "Dry run — would import" if dry else "Import complete"
        self.stdout.write(
            self.style.SUCCESS(
                f"{label}: {summary['states']} state(s), {summary['lgas']} LGA(s), "
                f"{summary['wards']} ward(s), {summary['created']} polling unit(s) created, "
                f"{summary['updated']} updated, {summary['skipped']} skipped."
            )
        )
