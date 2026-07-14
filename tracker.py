import argparse
import csv
import datetime as dt
import email.message
import json
import re
import smtplib
import sys
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_ALERT_WINDOWS = {
    "critical": 45,
    "high": 30,
    "medium": 14,
    "low": 7,
}

DEFAULT_COLUMN_ALIASES = {
    "name": [
        "name",
        "license",
        "license_name",
        "tracked_item",
        "tracked_items",
        "item",
        "product_service",
        "product",
        "service_name",
        "asset_hostname_scope",
        "license_ref_serial_cert_cn",
        "subscription",
        "service",
        "software",
        "application",
        "tool",
    ],
    "criticality": [
        "criticality",
        "priority",
        "severity",
        "importance",
        "tier",
        "business_criticality",
    ],
    "expiration_date": [
        "expiration_date",
        "expiry_date",
        "eol_date",
        "end_of_life_date",
        "end_of_support_date",
        "valid_to",
        "expiration",
        "expiry",
        "expires_on",
        "end_date",
        "renewal_date",
        "renewal",
        "valid_until",
        "due_date",
    ],
    "owner": ["owner", "primary_owner", "renewal_owner", "team", "department", "assignee"],
    "vendor": ["vendor", "provider", "supplier"],
}

PRIORITY_NORMALIZATION = {
    "critical": "critical",
    "p1": "critical",
    "urgent": "critical",
    "high": "high",
    "p2": "high",
    "medium": "medium",
    "med": "medium",
    "p3": "medium",
    "normal": "medium",
    "low": "low",
    "p4": "low",
}

DATE_PATTERNS = [
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d-%m-%Y",
    "%m-%d-%Y",
    "%Y/%m/%d",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d %Y",
    "%B %d %Y",
]

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

DATE_NUMFMT_IDS = {
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    45,
    46,
    47,
}


@dataclass
class LicenseRecord:
    name: str
    criticality: str
    expiration_date: dt.date
    days_to_expiry: int
    alert_window_days: int
    alert_due: bool
    owner: str = ""
    vendor: str = ""


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower()).strip("_")


def excel_serial_to_date(serial_value: float) -> dt.date:
    # Excel serial dates use 1899-12-30 as the canonical epoch in modern readers.
    epoch = dt.datetime(1899, 12, 30)
    return (epoch + dt.timedelta(days=float(serial_value))).date()


def is_date_number_format(format_code: str) -> bool:
    if not format_code:
        return False

    fmt = format_code.lower()
    # Remove escaped sections and literals before checking date tokens.
    fmt = re.sub(r"\".*?\"", "", fmt)
    fmt = re.sub(r"\[.*?\]", "", fmt)
    return any(token in fmt for token in ["yy", "mm", "dd", "h", "ss"])


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []

    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings = []
    for si in root.findall("main:si", NS):
        text_parts = []
        for node in si.findall(".//main:t", NS):
            text_parts.append(node.text or "")
        strings.append("".join(text_parts))
    return strings


def load_styles(zf: zipfile.ZipFile) -> dict[int, bool]:
    style_index_to_is_date: dict[int, bool] = {}
    if "xl/styles.xml" not in zf.namelist():
        return style_index_to_is_date

    root = ET.fromstring(zf.read("xl/styles.xml"))

    custom_numfmts: dict[int, str] = {}
    for numfmt in root.findall("main:numFmts/main:numFmt", NS):
        numfmt_id = int(numfmt.attrib.get("numFmtId", "0"))
        custom_numfmts[numfmt_id] = numfmt.attrib.get("formatCode", "")

    xfs = root.findall("main:cellXfs/main:xf", NS)
    for idx, xf in enumerate(xfs):
        numfmt_id = int(xf.attrib.get("numFmtId", "0"))
        style_index_to_is_date[idx] = numfmt_id in DATE_NUMFMT_IDS or is_date_number_format(
            custom_numfmts.get(numfmt_id, "")
        )

    return style_index_to_is_date


def get_sheet_entries(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    wb_root = ET.fromstring(zf.read("xl/workbook.xml"))
    rels_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))

    rel_map = {
        rel.attrib.get("Id"): rel.attrib.get("Target")
        for rel in rels_root.findall("pkgrel:Relationship", NS)
    }

    sheets = wb_root.findall("main:sheets/main:sheet", NS)
    if not sheets:
        raise ValueError("Workbook does not contain any sheets.")

    entries: list[tuple[str, str]] = []
    for sheet in sheets:
        rel_id = sheet.attrib.get(f"{{{NS['rel']}}}id")
        target = rel_map.get(rel_id, "")
        if not target:
            continue

        target = target.lstrip("/")
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        entries.append((sheet.attrib.get("name", ""), target))

    if not entries:
        raise ValueError("Could not resolve any worksheet XML paths.")

    return entries


def get_sheet_xml_path(zf: zipfile.ZipFile, sheet_name: str | None) -> tuple[str, str]:
    sheet_entries = get_sheet_entries(zf)

    if sheet_name:
        for entry_name, path in sheet_entries:
            if entry_name.strip().lower() == sheet_name.strip().lower():
                return entry_name, path
        if sheet_name:
            available = ", ".join(name for name, _ in sheet_entries)
            raise ValueError(f"Sheet '{sheet_name}' was not found. Available sheets: {available}")

    return sheet_entries[0]


def score_header_columns(headers: list[str], aliases: dict[str, list[str]]) -> int:
    if not headers:
        return -1

    mapped = map_columns(headers, aliases)
    score = len(headers)
    if "name" in mapped:
        score += 10
    if "expiration_date" in mapped:
        score += 10
    if "criticality" in mapped:
        score += 5

    return score


def parse_sheet_rows(
    sheet_root: ET.Element,
    shared_strings: list[str],
    styles: dict[int, bool],
) -> tuple[list[dict[str, Any]], list[str]]:
    rows_data: list[dict[int, Any]] = []
    for row in sheet_root.findall("main:sheetData/main:row", NS):
        row_map: dict[int, Any] = {}
        for cell in row.findall("main:c", NS):
            cell_ref = cell.attrib.get("r", "")
            if not cell_ref:
                continue
            col_idx = column_to_index(cell_ref)
            row_map[col_idx] = parse_cell_value(cell, shared_strings, styles)
        rows_data.append(row_map)

    if not rows_data:
        return [], []

    # Auto-detect header row in case the sheet starts with a dashboard/title banner.
    header_row_index = 0
    best_score = -1
    scan_limit = min(len(rows_data), 20)
    for i in range(scan_limit):
        candidate = rows_data[i]
        non_empty_cells = [str(v).strip() for v in candidate.values() if str(v).strip()]
        string_cells = [v for v in non_empty_cells if not re.fullmatch(r"\d+(\.\d+)?", v)]
        # Prefer rows that look like a tabular header: multiple text labels.
        score = len(string_cells) * 2 + len(non_empty_cells)
        if len(non_empty_cells) >= 2 and score > best_score:
            best_score = score
            header_row_index = i

    header_row = rows_data[header_row_index]
    if not header_row:
        return [], []

    headers = {idx: str(val).strip() for idx, val in header_row.items() if str(val).strip()}
    normalized_rows: list[dict[str, Any]] = []

    for row_map in rows_data[header_row_index + 1 :]:
        if not row_map:
            continue
        row_dict: dict[str, Any] = {}
        non_empty = False
        for idx, value in row_map.items():
            header = headers.get(idx)
            if not header:
                continue
            row_dict[header] = value
            if str(value).strip():
                non_empty = True
        if non_empty:
            normalized_rows.append(row_dict)

    return normalized_rows, list(headers.values())


def column_to_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha()).upper()
    result = 0
    for char in letters:
        result = result * 26 + (ord(char) - 64)
    return result - 1


def parse_cell_value(
    cell: ET.Element,
    shared_strings: list[str],
    style_index_to_is_date: dict[int, bool],
) -> Any:
    cell_type = cell.attrib.get("t")
    style_idx = int(cell.attrib.get("s", "0"))
    value_node = cell.find("main:v", NS)

    if cell_type == "inlineStr":
        text_node = cell.find("main:is/main:t", NS)
        return (text_node.text or "").strip() if text_node is not None else ""

    if value_node is None:
        return ""

    raw = value_node.text or ""
    if cell_type == "s":
        if raw.isdigit() and int(raw) < len(shared_strings):
            return shared_strings[int(raw)]
        return raw

    if cell_type == "b":
        return "TRUE" if raw == "1" else "FALSE"

    if style_index_to_is_date.get(style_idx, False):
        try:
            return excel_serial_to_date(float(raw))
        except ValueError:
            return raw

    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        return raw


def load_xlsx_rows(
    file_path: Path,
    sheet_name: str | None,
    aliases: dict[str, list[str]],
) -> tuple[list[dict[str, Any]], str]:
    with zipfile.ZipFile(file_path, "r") as zf:
        shared_strings = load_shared_strings(zf)
        styles = load_styles(zf)
        if sheet_name:
            selected_sheet_name, sheet_xml = get_sheet_xml_path(zf, sheet_name)
            sheet_root = ET.fromstring(zf.read(sheet_xml))
            rows, _ = parse_sheet_rows(sheet_root, shared_strings, styles)
            return rows, selected_sheet_name

        # When sheet is not specified, pick the sheet whose headers best match configured aliases.
        best_rows: list[dict[str, Any]] = []
        best_sheet_name = ""
        best_score = -1

        for current_sheet_name, current_sheet_xml in get_sheet_entries(zf):
            sheet_root = ET.fromstring(zf.read(current_sheet_xml))
            rows, headers = parse_sheet_rows(sheet_root, shared_strings, styles)
            score = score_header_columns(headers, aliases)
            if rows:
                score += min(len(rows), 50)
            if score > best_score:
                best_score = score
                best_rows = rows
                best_sheet_name = current_sheet_name

        return best_rows, best_sheet_name


def parse_date(value: Any) -> dt.date | None:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    if isinstance(value, (int, float)):
        try:
            return excel_serial_to_date(float(value))
        except ValueError:
            return None

    text = str(value).strip()
    if not text:
        return None

    for pattern in DATE_PATTERNS:
        try:
            return dt.datetime.strptime(text, pattern).date()
        except ValueError:
            continue

    if re.fullmatch(r"\d+(\.\d+)?", text):
        try:
            return excel_serial_to_date(float(text))
        except ValueError:
            return None

    return None


def normalize_criticality(value: Any) -> str:
    key = normalize_key(str(value))
    if key in PRIORITY_NORMALIZATION:
        return PRIORITY_NORMALIZATION[key]
    return "medium"


def load_config(config_path: Path | None) -> tuple[dict[str, int], dict[str, list[str]]]:
    if not config_path:
        return DEFAULT_ALERT_WINDOWS.copy(), {k: v[:] for k, v in DEFAULT_COLUMN_ALIASES.items()}

    with config_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    alert_windows = DEFAULT_ALERT_WINDOWS.copy()
    alert_windows.update(data.get("alert_windows", {}))

    column_aliases = {k: v[:] for k, v in DEFAULT_COLUMN_ALIASES.items()}
    for field, aliases in data.get("column_aliases", {}).items():
        if isinstance(aliases, list) and aliases:
            column_aliases[field] = aliases

    return alert_windows, column_aliases


def map_columns(source_columns: list[str], aliases: dict[str, list[str]]) -> dict[str, str]:
    normalized_source = {normalize_key(col): col for col in source_columns}
    mapped: dict[str, str] = {}

    for field, field_aliases in aliases.items():
        for alias in field_aliases:
            normalized_alias = normalize_key(alias)
            if normalized_alias in normalized_source:
                mapped[field] = normalized_source[normalized_alias]
                break

    return mapped


def build_records(
    rows: list[dict[str, Any]],
    today: dt.date,
    alert_windows: dict[str, int],
    aliases: dict[str, list[str]],
) -> tuple[list[LicenseRecord], list[str]]:
    if not rows:
        return [], ["No data rows found in sheet."]

    source_columns = list(rows[0].keys())
    col_map = map_columns(source_columns, aliases)
    warnings: list[str] = []

    if "name" not in col_map:
        warnings.append("Could not map a name column automatically.")
    if "expiration_date" not in col_map:
        warnings.append("Could not map an expiration date column automatically.")

    if "name" not in col_map or "expiration_date" not in col_map:
        warnings.append(f"Detected columns: {', '.join(source_columns)}")
        return [], warnings

    records: list[LicenseRecord] = []
    for row in rows:
        name = str(row.get(col_map["name"], "")).strip()
        if not name:
            continue

        criticality_raw = row.get(col_map.get("criticality", ""), "medium")
        criticality = normalize_criticality(criticality_raw)

        expiration_value = row.get(col_map["expiration_date"], "")
        expiration_date = parse_date(expiration_value)
        if not expiration_date:
            warnings.append(f"Skipping '{name}': unable to parse expiration date '{expiration_value}'.")
            continue

        days_to_expiry = (expiration_date - today).days
        alert_window = int(alert_windows.get(criticality, alert_windows.get("medium", 14)))
        alert_due = days_to_expiry <= alert_window

        owner = str(row.get(col_map.get("owner", ""), "")).strip()
        vendor = str(row.get(col_map.get("vendor", ""), "")).strip()

        records.append(
            LicenseRecord(
                name=name,
                criticality=criticality,
                expiration_date=expiration_date,
                days_to_expiry=days_to_expiry,
                alert_window_days=alert_window,
                alert_due=alert_due,
                owner=owner,
                vendor=vendor,
            )
        )

    return records, warnings


def filter_records(
    records: list[LicenseRecord],
    criticalities: set[str] | None,
    only_alerts: bool,
    within_days: int | None,
) -> list[LicenseRecord]:
    filtered = []
    for record in records:
        if criticalities and record.criticality not in criticalities:
            continue
        if only_alerts and not record.alert_due:
            continue
        if within_days is not None and record.days_to_expiry > within_days:
            continue
        filtered.append(record)

    return sorted(filtered, key=lambda r: (r.days_to_expiry, r.criticality, r.name.lower()))


def format_status(days: int) -> str:
    if days < 0:
        return f"OVERDUE by {abs(days)} day(s)"
    if days == 0:
        return "Expires today"
    return f"Expires in {days} day(s)"


def print_records(records: list[LicenseRecord]) -> None:
    if not records:
        print("No records matched the selected filters.")
        return

    headers = ["Name", "Criticality", "Expiration", "Status", "Owner", "Vendor", "Alert"]
    rows = []
    for rec in records:
        rows.append(
            [
                rec.name,
                rec.criticality,
                rec.expiration_date.isoformat(),
                format_status(rec.days_to_expiry),
                rec.owner,
                rec.vendor,
                "YES" if rec.alert_due else "NO",
            ]
        )

    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val)))

    def render(row_items: list[str]) -> str:
        return " | ".join(str(item).ljust(col_widths[idx]) for idx, item in enumerate(row_items))

    print(render(headers))
    print("-+-".join("-" * width for width in col_widths))
    for row in rows:
        print(render(row))


def write_alert_csv(path: Path, records: list[LicenseRecord]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "name",
                "criticality",
                "expiration_date",
                "days_to_expiry",
                "alert_window_days",
                "owner",
                "vendor",
            ]
        )
        for rec in records:
            writer.writerow(
                [
                    rec.name,
                    rec.criticality,
                    rec.expiration_date.isoformat(),
                    rec.days_to_expiry,
                    rec.alert_window_days,
                    rec.owner,
                    rec.vendor,
                ]
            )


def build_email_body(records: list[LicenseRecord], today: dt.date) -> str:
    lines = [
        f"License Alert Report - {today.isoformat()}",
        "",
        f"Total alerting records: {len(records)}",
        "",
    ]

    for rec in records:
        lines.append(
            f"- {rec.name} | {rec.criticality.upper()} | {rec.expiration_date.isoformat()} | {format_status(rec.days_to_expiry)}"
        )

    return "\n".join(lines)


def send_email_alert(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    from_email: str,
    to_emails: list[str],
    subject: str,
    body: str,
) -> None:
    msg = email.message.EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = ", ".join(to_emails)
    msg.set_content(body)

    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.starttls()
        if smtp_user:
            server.login(smtp_user, smtp_password)
        server.send_message(msg)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Track license subscriptions, filter by criticality, and send alerts before expiration."
    )
    parser.add_argument("--file", default="license_subscription_tracker.xlsx", help="Path to the source .xlsx file.")
    parser.add_argument("--sheet", default=None, help="Worksheet name. Defaults to the first sheet.")
    parser.add_argument("--config", default=None, help="Optional JSON config path.")
    parser.add_argument(
        "--criticality",
        default=None,
        help="Comma-separated criticality filter, e.g. critical,high.",
    )
    parser.add_argument(
        "--within-days",
        type=int,
        default=None,
        help="Only include records expiring within this many days. Overdue records are included.",
    )
    parser.add_argument(
        "--only-alerts",
        action="store_true",
        help="Only show records that are already inside their alert window.",
    )
    parser.add_argument(
        "--today",
        default=None,
        help="Override today's date in YYYY-MM-DD format (useful for testing).",
    )
    parser.add_argument(
        "--export-alerts",
        default=None,
        help="Optional CSV path to export current alert records.",
    )
    parser.add_argument("--smtp-host", default="", help="SMTP host for email alerts.")
    parser.add_argument("--smtp-port", type=int, default=587, help="SMTP port.")
    parser.add_argument("--smtp-user", default="", help="SMTP username.")
    parser.add_argument("--smtp-password", default="", help="SMTP password.")
    parser.add_argument("--from-email", default="", help="Sender email address.")
    parser.add_argument(
        "--to-email",
        default="",
        help="Comma-separated recipient emails for alert notifications.",
    )
    parser.add_argument(
        "--send-email",
        action="store_true",
        help="Send email for records currently in alert window.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    source_file = Path(args.file)
    if not source_file.exists():
        print(f"Source file not found: {source_file}", file=sys.stderr)
        return 1

    config_path = Path(args.config) if args.config else None
    if config_path and not config_path.exists():
        print(f"Config file not found: {config_path}", file=sys.stderr)
        return 1

    if args.today:
        try:
            today = dt.datetime.strptime(args.today, "%Y-%m-%d").date()
        except ValueError:
            print("Invalid --today value. Expected format is YYYY-MM-DD.", file=sys.stderr)
            return 1
    else:
        today = dt.date.today()

    alert_windows, aliases = load_config(config_path)

    try:
        rows, selected_sheet_name = load_xlsx_rows(source_file, args.sheet, aliases)
    except Exception as exc:
        print(f"Failed to load workbook: {exc}", file=sys.stderr)
        return 1

    print(f"Using sheet: {selected_sheet_name}")

    records, warnings = build_records(rows, today, alert_windows, aliases)
    for warning in warnings:
        print(f"[warning] {warning}", file=sys.stderr)

    criticalities = None
    if args.criticality:
        criticalities = {normalize_criticality(value) for value in args.criticality.split(",") if value.strip()}

    filtered = filter_records(records, criticalities, args.only_alerts, args.within_days)
    print_records(filtered)

    alerting = [rec for rec in filtered if rec.alert_due]

    if args.export_alerts:
        export_path = Path(args.export_alerts)
        write_alert_csv(export_path, alerting)
        print(f"Exported {len(alerting)} alerting record(s) to: {export_path}")

    if args.send_email:
        recipients = [item.strip() for item in args.to_email.split(",") if item.strip()]
        required = [args.smtp_host, args.from_email, *recipients]
        if not all(required):
            print(
                "Missing email settings. Required: --smtp-host, --from-email, and --to-email recipients.",
                file=sys.stderr,
            )
            return 1

        body = build_email_body(alerting, today)
        subject = f"License Alerts ({len(alerting)}) - {today.isoformat()}"
        try:
            send_email_alert(
                smtp_host=args.smtp_host,
                smtp_port=args.smtp_port,
                smtp_user=args.smtp_user,
                smtp_password=args.smtp_password,
                from_email=args.from_email,
                to_emails=recipients,
                subject=subject,
                body=body,
            )
            print(f"Email alert sent to: {', '.join(recipients)}")
        except Exception as exc:
            print(f"Failed to send email: {exc}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
