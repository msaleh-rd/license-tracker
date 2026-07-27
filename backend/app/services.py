from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from .models import AuditLog, LicenseItem
from .schemas import DashboardResponse, HeatmapCell, LicenseCreate, LicenseUpdate, RiskItem, SeriesPoint, SummaryCard
from .settings import settings


MISSING_FIELD_RULES = [
    ("client", "Client"),
    ("vendor", "Vendor"),
    ("product_service", "Product / Service"),
    ("owner", "Owner"),
    ("expiry_date", "Expiry Date"),
]


def normalize_text(value: str) -> str:
    return " ".join(part for part in value.replace("_", " ").replace("/", " ").split()).strip()


def normalize_vendor_name(value: str) -> str:
    return normalize_text(value).title()


def normalize_product_name(value: str) -> str:
    return normalize_text(value).title()


def current_date(today: date | None = None) -> date:
    return today or date.today()


def normalize_thresholds(thresholds: dict[str, Any] | None) -> dict[str, int]:
    thresholds = thresholds or {}
    return {
        "urgent_days_threshold": int(thresholds.get("urgent_days_threshold", settings.default_alert_days_urgent)),
        "review_days_threshold": int(thresholds.get("review_days_threshold", settings.default_alert_days_review)),
        "eol_soon_threshold": int(thresholds.get("eol_soon_threshold", 90)),
        "default_reminder_lead_time": int(thresholds.get("default_reminder_lead_time", settings.default_alert_days_review)),
    }


def normalize_boolean(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "y", "on"}
    return bool(value)


def coerce_rule_value(raw_value: Any, candidate: Any) -> Any:
    if isinstance(candidate, bool):
        return normalize_boolean(raw_value)
    if isinstance(candidate, int) and not isinstance(candidate, bool):
        try:
            return int(float(raw_value))
        except (TypeError, ValueError):
            return raw_value
    if isinstance(candidate, float):
        try:
            return float(raw_value)
        except (TypeError, ValueError):
            return raw_value
    return raw_value


def evaluate_condition(candidate: Any, operator: str, raw_value: Any) -> bool:
    expected = coerce_rule_value(raw_value, candidate)

    if operator == "contains":
        if isinstance(candidate, (list, tuple, set)):
            return str(expected).lower() in {str(item).lower() for item in candidate}
        return str(expected).lower() in str(candidate or "").lower()

    if operator == "in":
        values = expected
        if isinstance(values, str):
            values = [item.strip() for item in values.split(",") if item.strip()]
        if not isinstance(values, (list, tuple, set)):
            values = [values]
        return str(candidate).lower() in {str(item).lower() for item in values}

    try:
        if operator == "<=":
            return candidate <= expected
        if operator == "<":
            return candidate < expected
        if operator == ">=":
            return candidate >= expected
        if operator == ">":
            return candidate > expected
        if operator == "!=":
            return candidate != expected
        return candidate == expected
    except TypeError:
        # Fallback for mixed types (e.g. numeric string vs float)
        left = str(candidate or "").lower()
        right = str(expected or "").lower()
        if operator == "!=":
            return left != right
        return left == right


def conditions_match(item: LicenseItem, conditions: list[dict[str, Any]]) -> bool:
    result: bool | None = None
    for index, condition in enumerate(conditions):
        field_name = str(condition.get("field", "")).strip()
        operator = str(condition.get("operator", "==")).strip().lower()
        logic = str(condition.get("logic", "AND")).strip().upper()

        if not field_name:
            continue

        candidate = getattr(item, field_name, None)
        matched = evaluate_condition(candidate, operator, condition.get("value"))

        if index == 0 or result is None:
            result = matched
        elif logic == "OR":
            result = result or matched
        else:
            result = result and matched

    return bool(result)


def apply_custom_rules(
    item: LicenseItem,
    status: str,
    priority: str,
    risk_flags: list[str],
    anomaly_score: float,
    custom_rules: list[dict[str, Any]],
) -> tuple[str, str, list[str], float]:
    next_status = status
    next_priority = priority
    next_flags = list(risk_flags)
    next_anomaly = anomaly_score

    for rule in custom_rules:
        if not rule.get("enabled", True):
            continue

        scope = str(rule.get("scope", "global")).strip().lower()
        category = str(rule.get("category", "")).strip().lower()
        if scope == "category" and category and category != (item.category or "").strip().lower():
            continue

        conditions = rule.get("conditions", [])
        if not isinstance(conditions, list) or not conditions:
            continue
        if not conditions_match(item, conditions):
            continue

        actions = rule.get("actions", [])
        if not isinstance(actions, list):
            continue

        for action in actions:
            action_type = str(action.get("type", "")).strip().lower()
            value = action.get("value")

            if action_type == "status" and isinstance(value, str) and value.strip():
                next_status = value.strip()
            elif action_type == "priority" and isinstance(value, str) and value.strip():
                next_priority = value.strip()
            elif action_type == "risk_flag" and isinstance(value, str) and value.strip():
                next_flags.append(value.strip())
            elif action_type == "anomaly_boost":
                try:
                    next_anomaly += float(value)
                except (TypeError, ValueError):
                    pass
            elif action_type == "notify_owner":
                next_flags.append("notify-owner")

    return next_status, next_priority, next_flags, next_anomaly


def calculate_utilization(quantity_purchased: int, quantity_in_use: int) -> float:
    if quantity_purchased <= 0:
        return 0.0
    return round((quantity_in_use / quantity_purchased) * 100, 2)


def classify_status(
    days_to_expiry: int,
    utilization_percent: float,
    urgent_days_threshold: int,
    review_days_threshold: int,
) -> tuple[str, str, list[str], float]:
    status = "Active"
    priority = "Low"
    risk_flags: list[str] = []
    anomaly_score = 0.0

    if days_to_expiry < 0:
        status = "Expired"
        priority = "Critical"
        anomaly_score += 50
    elif days_to_expiry <= urgent_days_threshold:
        status = "Urgent"
        priority = "High"
        anomaly_score += 25
    elif days_to_expiry <= review_days_threshold:
        status = "Review"
        priority = "Medium"
        anomaly_score += 10

    if utilization_percent > 100:
        risk_flags.append("over-utilization")
        anomaly_score += min(35, utilization_percent - 100)
        priority = "Critical"
    elif 0 < utilization_percent < 20:
        risk_flags.append("under-utilization")
        anomaly_score += 8

    return status, priority, risk_flags, anomaly_score


def calculate_missing_fields(item: LicenseCreate | LicenseUpdate | LicenseItem) -> list[str]:
    missing: list[str] = []
    for field_name, label in MISSING_FIELD_RULES:
        value = getattr(item, field_name, None)
        if value in (None, ""):
            missing.append(label)
    return missing


def forecast_renewal_cost(item: LicenseItem) -> float:
    base_cost = item.annual_cost or (item.unit_cost * max(item.quantity_purchased, 1))
    if item.auto_renew:
        return round(base_cost * 1.03, 2)
    if item.status in {"Expired", "Urgent"}:
        return round(base_cost, 2)
    return round(base_cost * 0.97, 2)


def enrich_item(item: LicenseItem, today: date | None = None, thresholds: dict[str, Any] | None = None) -> LicenseItem:
    today = current_date(today)
    normalized = normalize_thresholds(thresholds)
    item.normalized_vendor = normalize_vendor_name(item.vendor or "")
    item.normalized_product = normalize_product_name(item.product_service or "")
    # Coerce any None quantities to 0 (can arrive from workbook rows that lack these columns)
    item.quantity_purchased = int(item.quantity_purchased or 0)
    item.quantity_in_use = int(item.quantity_in_use or 0)
    item.quantity_available = int(item.quantity_available or 0)
    item.unit_cost = float(item.unit_cost or 0.0)
    item.annual_cost = float(item.annual_cost or 0.0)
    item.quantity_available = max(item.quantity_available, item.quantity_purchased - item.quantity_in_use)
    item.utilization_percent = calculate_utilization(item.quantity_purchased, item.quantity_in_use)
    item.days_to_expiry = (item.expiry_date - today).days
    # If EOL is unknown, treat as supported and avoid false past-EOL flags.
    # Use 0 as fallback to satisfy the NOT NULL database constraint.
    item.days_to_eol = (item.eol_date - today).days if item.eol_date else 0

    status, priority, risk_flags, anomaly_score = classify_status(
        item.days_to_expiry,
        item.utilization_percent,
        normalized["urgent_days_threshold"],
        normalized["review_days_threshold"],
    )
    missing_expiry_info = "missing expiry info" in (item.notes or "").lower()
    if missing_expiry_info:
        item.days_to_expiry = 0
        status = "Missing Expiry Info"
        priority = "High"
        risk_flags.append("missing-expiry-info")
        anomaly_score += 20

    if item.days_to_eol is not None and item.days_to_eol < 0:
        risk_flags.append("past-eol")
        anomaly_score += 15
    elif item.days_to_eol is not None and item.days_to_eol <= normalized["eol_soon_threshold"]:
        risk_flags.append("eol-soon")
        anomaly_score += 8

    missing_fields = calculate_missing_fields(item)
    if missing_fields:
        risk_flags.append("missing-critical-fields")
        anomaly_score += len(missing_fields) * 4
        if status == "Active":
            status = "Review"
            priority = "Medium"

    custom_rules = thresholds.get("custom_rules", []) if isinstance(thresholds, dict) else []
    if isinstance(custom_rules, list) and custom_rules:
        status, priority, risk_flags, anomaly_score = apply_custom_rules(
            item,
            status,
            priority,
            risk_flags,
            anomaly_score,
            custom_rules,
        )

    old_flags = set(item.risk_flags or [])
    item.status = status
    item.priority = priority
    item.risk_flags = sorted(set(risk_flags))
    item.missing_fields = missing_fields
    item.predictive_cost = forecast_renewal_cost(item)
    item.anomaly_score = round(anomaly_score, 2)

    # Send email alert for any newly raised risk flags
    new_flags = sorted(set(item.risk_flags) - old_flags)
    if new_flags:
        from .email_service import notify_risk_flags_raised
        notify_risk_flags_raised(item, new_flags)

    return item


def apply_payload_to_item(
    item: LicenseItem,
    payload: LicenseCreate | LicenseUpdate,
    thresholds: dict[str, Any] | None = None,
) -> LicenseItem:
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, field_name, value)
    return enrich_item(item, thresholds=thresholds)


def item_to_risk_payload(item: LicenseItem) -> RiskItem:
    return RiskItem(
        id=item.id,
        client=item.client,
        product_service=item.product_service,
        vendor=item.vendor,
        status=item.status,
        days_to_expiry=item.days_to_expiry,
        utilization_percent=item.utilization_percent,
        anomaly_score=item.anomaly_score,
        priority=item.priority,
        risk_flags=list(item.risk_flags or []),
    )


def log_audit(
    db: Session,
    item_id: int,
    actor: str,
    action: str,
    field_name: str,
    before_value: Any,
    after_value: Any,
) -> None:
    db.add(
        AuditLog(
            item_id=item_id,
            actor=actor,
            action=action,
            field_name=field_name,
            before_value="" if before_value is None else str(before_value),
            after_value="" if after_value is None else str(after_value),
        )
    )


def utilization_bucket(utilization_percent: float) -> str:
    if utilization_percent > 100:
        return ">100%"
    if utilization_percent >= 90:
        return "90-100%"
    if utilization_percent >= 75:
        return "75-89%"
    if utilization_percent >= 50:
        return "50-74%"
    if utilization_percent >= 20:
        return "20-49%"
    return "0-19%"


def dashboard_payload(
    items: list[LicenseItem],
    today: date | None = None,
    thresholds: dict[str, Any] | None = None,
    base_currency: str = "USD",
) -> DashboardResponse:
    _ = today
    normalized = normalize_thresholds(thresholds)
    if not items:
        return DashboardResponse(
            summary=[
                SummaryCard(label="Total licenses", value="0", tone="neutral"),
                SummaryCard(label="Expired", value="0", tone="danger"),
                SummaryCard(label="Urgent", value="0", tone="warning"),
                SummaryCard(label="Missing expiry info", value="0", tone="warning"),
                SummaryCard(label="Active", value="0", tone="success"),
                SummaryCard(label="Annual cost", value=f"{base_currency} 0", tone="neutral"),
            ],
            expiry_timeline=[],
            category_distribution=[],
            utilization_heatmap=[],
            risk_items=[],
            alerts=[],
            predictive_insights={"forecasted_renewal_cost": 0, "anomaly_count": 0, "missing_fields": 0, "at_risk_spend": 0},
        )

    total_cost = sum(item.annual_cost for item in items)
    expired = [item for item in items if item.status == "Expired"]
    urgent = [item for item in items if item.status == "Urgent"]
    missing_expiry = [item for item in items if item.status == "Missing Expiry Info"]
    active = [item for item in items if item.status == "Active"]
    review = [item for item in items if item.status == "Review"]

    by_month: dict[str, float] = defaultdict(float)
    for item in items:
        by_month[item.expiry_date.strftime("%Y-%m")] += 1

    categories = Counter(item.category or "Uncategorized" for item in items)
    heatmap_buckets: dict[tuple[str, str], int] = defaultdict(int)
    for item in items:
        category = item.category or "Uncategorized"
        bucket = utilization_bucket(item.utilization_percent)
        heatmap_buckets[(category, bucket)] += 1

    sorted_risk_items = sorted(items, key=lambda item: (-item.anomaly_score, item.days_to_expiry if item.days_to_expiry is not None else 999999, item.product_service.lower()))[:10]
    alerts = [
        item
        for item in sorted_risk_items
        if item.status in {"Expired", "Urgent", "Review", "Missing Expiry Info"}
        or "over-utilization" in (item.risk_flags or [])
    ]
    forecast = round(
        sum(item.predictive_cost for item in items if item.days_to_expiry is not None and item.days_to_expiry <= normalized["review_days_threshold"]),
        2,
    )
    anomaly_count = sum(1 for item in items if item.anomaly_score >= 15 or item.risk_flags)
    missing_fields_count = sum(len(item.missing_fields or []) for item in items)

    return DashboardResponse(
        summary=[
            SummaryCard(label="Total licenses", value=str(len(items)), tone="neutral"),
            SummaryCard(label="Expired", value=str(len(expired)), tone="danger"),
            SummaryCard(label="Urgent", value=str(len(urgent)), tone="warning"),
            SummaryCard(label="Missing expiry info", value=str(len(missing_expiry)), tone="warning"),
            SummaryCard(label="Active", value=str(len(active)), tone="success"),
            SummaryCard(label="Review", value=str(len(review)), tone="info"),
            SummaryCard(label="Annual cost", value=f"{base_currency} {total_cost:,.0f}", tone="neutral"),
        ],
        expiry_timeline=[SeriesPoint(label=label, value=value) for label, value in sorted(by_month.items())],
        category_distribution=[SeriesPoint(label=label, value=count) for label, count in categories.most_common()],
        utilization_heatmap=[
            HeatmapCell(category=category, bucket=bucket, count=count)
            for (category, bucket), count in sorted(heatmap_buckets.items(), key=lambda entry: (entry[0][0], entry[0][1]))
        ],
        risk_items=[item_to_risk_payload(item) for item in sorted_risk_items],
        alerts=[item_to_risk_payload(item) for item in alerts],
        predictive_insights={
            "forecasted_renewal_cost": forecast,
            "anomaly_count": anomaly_count,
            "missing_fields": missing_fields_count,
            "at_risk_spend": round(sum(item.annual_cost for item in items if item.status in {"Expired", "Urgent"}), 2),
        },
    )


def filter_items(items: list[LicenseItem], query: str | None, status: str | None, category: str | None) -> list[LicenseItem]:
    filtered = items
    if query:
        query_lower = query.lower()
        filtered = [
            item
            for item in filtered
            if query_lower in " ".join(
                [item.client, item.vendor, item.product_service, item.owner, item.renewal_owner, item.license_reference]
            ).lower()
        ]
    if status:
        filtered = [item for item in filtered if item.status.lower() == status.lower()]
    if category:
        filtered = [item for item in filtered if item.category.lower() == category.lower()]
    return sorted(filtered, key=lambda item: (item.days_to_expiry if item.days_to_expiry is not None else 999999, -item.anomaly_score, item.product_service.lower()))