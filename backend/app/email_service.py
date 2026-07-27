"""Email notification service for License Lifecycle Hub.

Notifications are only sent when SMTP is configured (smtp_enabled=True in settings).
All failures are logged and silently swallowed so a broken SMTP config never
breaks the API response.
"""
from __future__ import annotations

import logging
import re
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import TYPE_CHECKING

from .settings import settings

if TYPE_CHECKING:
    from .models import LicenseItem

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_valid_email(value: str) -> bool:
    return bool(_EMAIL_RE.match((value or "").strip()))


def extract_emails(raw: str) -> list[str]:
    """Extract all valid email addresses from a comma/semicolon-separated string."""
    parts = re.split(r"[,;]", raw or "")
    return [p.strip() for p in parts if is_valid_email(p.strip())]


def _send_smtp(to_addresses: list[str], subject: str, body_html: str, body_text: str) -> None:
    """Low-level blocking SMTP send. Call from a thread to avoid blocking the request."""
    if not settings.smtp_enabled:
        return
    if not to_addresses:
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        msg["To"] = ", ".join(to_addresses)

        msg.attach(MIMEText(body_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
            server.ehlo()
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15)

        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)

        server.sendmail(settings.smtp_from_email, to_addresses, msg.as_string())
        server.quit()
        logger.info("Email sent to %s — %s", ", ".join(to_addresses), subject)
    except Exception as exc:
        logger.warning("Email send failed: %s", exc)


def send_async(to_addresses: list[str], subject: str, body_html: str, body_text: str) -> None:
    """Fire-and-forget email in a daemon thread."""
    if not settings.smtp_enabled or not to_addresses:
        return
    thread = threading.Thread(
        target=_send_smtp,
        args=(to_addresses, subject, body_html, body_text),
        daemon=True,
    )
    thread.start()


# ---------------------------------------------------------------------------
# High-level notification builders
# ---------------------------------------------------------------------------

def _collect_recipients(item: LicenseItem) -> list[str]:
    """Gather all valid email addresses from the dedicated email field."""
    candidates: list[str] = []
    if item.email:
        candidates.extend(extract_emails(item.email))
    return list(dict.fromkeys(candidates))  # deduplicate, preserve order


def notify_owner_update(item: LicenseItem, actor: str, changed_fields: list[str]) -> None:
    """Send an update notification when a license record is edited.

    If the email field was newly added (previously empty), send a special subscription email.
    """
    # Determine if this is the first time an email address is being set
    # This requires checking the actor's email change; however, we don't have the old value here.
    # The caller will handle email addition detection and invoke a dedicated function.
    recipients = _collect_recipients(item)
    if not recipients:
        return

    subject = f"[License Hub] Record updated: {item.product_service} ({item.client})"
    fields_list = "".join(f"<li>{f}</li>" for f in changed_fields) or "<li>(multiple fields)</li>"
    body_html = f"""
<html><body>
<p>Hello,</p>
<p>The following license record has been updated by <strong>{actor}</strong>:</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
  <tr><td><strong>Client</strong></td><td>{item.client}</td></tr>
  <tr><td><strong>Vendor</strong></td><td>{item.vendor}</td></tr>
  <tr><td><strong>Product / Service</strong></td><td>{item.product_service}</td></tr>
  <tr><td><strong>Status</strong></td><td>{item.status}</td></tr>
  <tr><td><strong>Expiry Date</strong></td><td>{item.expiry_date}</td></tr>
  <tr><td><strong>Priority</strong></td><td>{item.priority}</td></tr>
</table>
<p><strong>Changed fields:</strong></p>
<ul>{fields_list}</ul>
<p>Please review the record in the License Lifecycle Hub.</p>
</body></html>
"""
    body_text = (
        f"License record updated by {actor}.\n\n"
        f"Client: {item.client}\n"
        f"Vendor: {item.vendor}\n"
        f"Product: {item.product_service}\n"
        f"Status: {item.status}\n"
        f"Expiry: {item.expiry_date}\n"
        f"Priority: {item.priority}\n\n"
        f"Changed fields: {', '.join(changed_fields) or 'multiple'}\n"
    )
    send_async(recipients, subject, body_html, body_text)


def notify_owner_alert(item: LicenseItem) -> None:
    """Send an alert notification triggered by a notify_owner rule action."""
    recipients = _collect_recipients(item)
    if not recipients:
        return

    subject = f"[License Hub] Action required: {item.product_service} ({item.client}) — {item.status}"
    body_html = f"""
<html><body>
<p>Hello,</p>
<p>A monitoring rule has flagged the following license record and requires your attention:</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
  <tr><td><strong>Client</strong></td><td>{item.client}</td></tr>
  <tr><td><strong>Vendor</strong></td><td>{item.vendor}</td></tr>
  <tr><td><strong>Product / Service</strong></td><td>{item.product_service}</td></tr>
  <tr><td><strong>Status</strong></td><td>{item.status}</td></tr>
  <tr><td><strong>Expiry Date</strong></td><td>{item.expiry_date}</td></tr>
  <tr><td><strong>Days to Expiry</strong></td><td>{item.days_to_expiry}</td></tr>
  <tr><td><strong>Priority</strong></td><td>{item.priority}</td></tr>
  <tr><td><strong>Risk Flags</strong></td><td>{', '.join(item.risk_flags or [])}</td></tr>
</table>
<p>Please log in to the License Lifecycle Hub to review and take action.</p>
</body></html>
"""
    body_text = (
        f"ACTION REQUIRED — License record flagged.\n\n"
        f"Client: {item.client}\n"
        f"Vendor: {item.vendor}\n"
        f"Product: {item.product_service}\n"
        f"Status: {item.status}\n"
        f"Expiry: {item.expiry_date}\n"
        f"Days to expiry: {item.days_to_expiry}\n"
        f"Priority: {item.priority}\n"
        f"Risk flags: {', '.join(item.risk_flags or [])}\n"
    )
    send_async(recipients, subject, body_html, body_text)


def notify_status_change(item: LicenseItem, old_status: str) -> None:
    """Send a notification when status changes to Expired or Urgent."""
    if item.status not in {"Expired", "Urgent"}:
        return
    if old_status == item.status:
        return
    recipients = _collect_recipients(item)
    if not recipients:
        return

    subject = f"[License Hub] Status changed to {item.status}: {item.product_service} ({item.client})"
    body_html = f"""
<html><body>
<p>Hello,</p>
<p>The status of a license record has changed to <strong>{item.status}</strong>:</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
  <tr><td><strong>Client</strong></td><td>{item.client}</td></tr>
  <tr><td><strong>Vendor</strong></td><td>{item.vendor}</td></tr>
  <tr><td><strong>Product / Service</strong></td><td>{item.product_service}</td></tr>
  <tr><td><strong>Previous Status</strong></td><td>{old_status}</td></tr>
  <tr><td><strong>New Status</strong></td><td>{item.status}</td></tr>
  <tr><td><strong>Expiry Date</strong></td><td>{item.expiry_date}</td></tr>
  <tr><td><strong>Days to Expiry</strong></td><td>{item.days_to_expiry}</td></tr>
</table>
<p>Please log in to the License Lifecycle Hub to take action.</p>
</body></html>
"""
    body_text = (
        f"Status changed to {item.status}.\n\n"
        f"Client: {item.client}\n"
        f"Vendor: {item.vendor}\n"
        f"Product: {item.product_service}\n"
        f"Previous status: {old_status}\n"
        f"New status: {item.status}\n"
        f"Expiry: {item.expiry_date}\n"
        f"Days to expiry: {item.days_to_expiry}\n"
    )
    send_async(recipients, subject, body_html, body_text)


def notify_risk_flags_raised(item: LicenseItem, new_flags: list[str]) -> None:
    """Send an alert when new risk flags are raised on a license record."""
    if not new_flags:
        return
    recipients = _collect_recipients(item)
    if not recipients:
        return

    flags_display = ", ".join(new_flags)
    flags_list = "".join(f"<li>{f}</li>" for f in new_flags)
    subject = f"[License Hub] Risk alert: {item.product_service} ({item.client}) — {flags_display}"
    body_html = f"""
<html><body>
<p>Hello,</p>
<p>New risk flag(s) have been raised on the following license record:</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
  <tr><td><strong>Client</strong></td><td>{item.client}</td></tr>
  <tr><td><strong>Vendor</strong></td><td>{item.vendor}</td></tr>
  <tr><td><strong>Product / Service</strong></td><td>{item.product_service}</td></tr>
  <tr><td><strong>Status</strong></td><td>{item.status}</td></tr>
  <tr><td><strong>Priority</strong></td><td>{item.priority}</td></tr>
  <tr><td><strong>Expiry Date</strong></td><td>{item.expiry_date}</td></tr>
  <tr><td><strong>Days to Expiry</strong></td><td>{item.days_to_expiry}</td></tr>
  <tr><td><strong>All Risk Flags</strong></td><td>{', '.join(item.risk_flags or [])}</td></tr>
</table>
<p><strong>New risk flags raised:</strong></p>
<ul>{flags_list}</ul>
<p>Please log in to the License Lifecycle Hub to review and take action.</p>
</body></html>
"""
    body_text = (
        f"RISK ALERT — New risk flags raised.\n\n"
        f"Client: {item.client}\n"
        f"Vendor: {item.vendor}\n"
        f"Product: {item.product_service}\n"
        f"Status: {item.status}\n"
        f"Priority: {item.priority}\n"
        f"Expiry: {item.expiry_date}\n"
        f"Days to expiry: {item.days_to_expiry}\n"
        f"New risk flags: {flags_display}\n"
        f"All risk flags: {', '.join(item.risk_flags or [])}\n"
    )
    send_async(recipients, subject, body_html, body_text)


def notify_new_email_subscription(item: LicenseItem, added_by: str) -> None:
    """Send a welcome email when a new notification email address is added.

    Parameters:
        item: The license item being updated.
        added_by: Email of the user who added the address (for reference).
    """
    # Extract email addresses from the item's email field
    recipients = extract_emails(item.email)
    if not recipients:
        return
    subject = f"[License Hub] Subscription: {item.product_service} ({item.client})"
    body_html = f"""
    <html><body>
    <p>Hello,</p>
    <p>This email address has been added to receive notifications for the following license record:</p>
    <table cellpadding=\"6\" cellspacing=\"0\" border=\"1\" style=\"border-collapse:collapse\">
      <tr><td><strong>Client</strong></td><td>{item.client}</td></tr>
      <tr><td><strong>Vendor</strong></td><td>{item.vendor}</td></tr>
      <tr><td><strong>Product / Service</strong></td><td>{item.product_service}</td></tr>
      <tr><td><strong>Status</strong></td><td>{item.status}</td></tr>
      <tr><td><strong>Expiry Date</strong></td><td>{item.expiry_date}</td></tr>
    </table>
    <p>You will now receive updates regarding this record.</p>
    </body></html>
    """
    body_text = (
        f"Subscription confirmation – you will receive updates for:\n"
        f"Client: {item.client}\n"
        f"Vendor: {item.vendor}\n"
        f"Product: {item.product_service}\n"
        f"Status: {item.status}\n"
        f"Expiry: {item.expiry_date}\n"
    )
    send_async(recipients, subject, body_html, body_text)
