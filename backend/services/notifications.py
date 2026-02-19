import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

ROOM_DURATION = {
    (8, 1.0): 45,
    (8, 0.5): 25,
    (20, 1.0): 90,
    (20, 0.5): 50,
}


def _e164(phone: str) -> str:
    """Ensure phone is in E.164 format: +<digits> with no spaces."""
    phone = phone.strip()
    if not phone.startswith("+"):
        phone = "+" + phone
    return phone


def _build_message(user_name: str, room_slot, join_url: str, minutes_before: int = 20) -> str:
    duration = ROOM_DURATION.get((room_slot.rakats, room_slot.juz_per_night), 60)
    juz_label = f"Juz {room_slot.juz_number}"
    if room_slot.juz_half == 1:
        juz_label += " (first half)"
    elif room_slot.juz_half == 2:
        juz_label += " (second half)"

    return (
        f"Tarteel — Taraweeh Reminder\n\n"
        f"Assalamu Alaikum {user_name or 'dear worshipper'},\n\n"
        f"Your Taraweeh room opens in {minutes_before} minutes.\n\n"
        f"Night {room_slot.ramadan_night} of Ramadan\n"
        f"{juz_label} · {room_slot.rakats} Rakats\n"
        f"Duration: ~{duration} minutes\n\n"
        f"Join your room: {join_url}\n\n"
        f"May Allah accept your prayers."
    )


async def send_whatsapp_reminder(user, room_slot, minutes_before: int = 20) -> bool:
    if not settings.TWILIO_ACCOUNT_SID:
        logger.warning("Twilio not configured — skipping WhatsApp")
        return False
    try:
        from twilio.rest import Client
        join_url = f"{settings.FRONTEND_URL}/room/{room_slot.id}"
        msg = _build_message(user.name, room_slot, join_url, minutes_before)
        to_number = f"whatsapp:{_e164(user.phone)}"
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        # Run synchronous Twilio SDK call in a thread to avoid blocking the event loop
        await asyncio.to_thread(
            client.messages.create,
            from_=settings.TWILIO_WHATSAPP_FROM,
            body=msg,
            to=to_number,
        )
        return True
    except Exception as e:
        logger.error(f"WhatsApp failed for user {user.id}: {e}")
        return False


def _build_html_email(user_name: str, room_slot, join_url: str, minutes_before: int) -> str:
    """Build a clean HTML email body."""
    duration = ROOM_DURATION.get((room_slot.rakats, room_slot.juz_per_night), 60)
    juz_label = f"Juz {room_slot.juz_number}"
    if room_slot.juz_half == 1:
        juz_label += " (first half)"
    elif room_slot.juz_half == 2:
        juz_label += " (second half)"
    plain = _build_message(user_name, room_slot, join_url, minutes_before)
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a1628;font-family:Georgia,serif;color:#e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1628;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
        style="background:#0c1a30;border:1px solid #c9a84c33;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#0c1a30,#1a2f50);padding:32px;text-align:center;border-bottom:1px solid #c9a84c33;">
          <div style="font-size:28px;color:#c9a84c;">&#x062A;&#x064E;&#x0631;&#x062A;&#x064A;&#x0644;</div>
          <div style="font-size:12px;color:#c9a84c99;letter-spacing:3px;text-transform:uppercase;">Tarteel</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="color:#9ca3af;font-size:14px;margin:0 0 16px;">
            Assalamu Alaikum <strong style="color:#e5e5e5;">{user_name or "dear worshipper"}</strong>,
          </p>
          <div style="background:#0a1628;border:1px solid #c9a84c33;border-radius:12px;padding:24px;margin:20px 0;text-align:center;">
            <div style="font-size:36px;margin-bottom:8px;">🕌</div>
            <div style="color:#c9a84c;font-size:20px;font-weight:bold;">Room opens in {minutes_before} minutes</div>
            <div style="color:#9ca3af;font-size:13px;margin-top:4px;">Night {room_slot.ramadan_night} of Ramadan</div>
          </div>
          <table width="100%" style="border-collapse:collapse;margin:20px 0;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#9ca3af;font-size:13px;width:40%;">Quran portion</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#e5e5e5;font-size:14px;">{juz_label}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#9ca3af;font-size:13px;">Rakats</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#e5e5e5;font-size:14px;">{room_slot.rakats}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#9ca3af;font-size:13px;">Duration</td>
              <td style="padding:10px 0;color:#e5e5e5;font-size:14px;">~{duration} minutes</td>
            </tr>
          </table>
          <div style="text-align:center;margin:28px 0;">
            <a href="{join_url}"
              style="display:inline-block;background:#c9a84c;color:#0a1628;font-weight:bold;font-size:15px;padding:14px 36px;border-radius:50px;text-decoration:none;">
              Join Your Room →
            </a>
          </div>
          <p style="color:#6b7280;font-size:12px;text-align:center;margin:0;">
            May Allah accept your prayers · تَقَبَّل اللَّهُ
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""
    return plain, html


def _send_via_gmail_smtp(from_addr: str, app_password: str, to_addr: str,
                          subject: str, plain: str, _html: str = "") -> None:
    msg = MIMEText(plain, "plain")
    msg["Subject"] = subject
    msg["From"]    = f"Tarteel <{from_addr}>"
    msg["To"]      = to_addr
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.ehlo()
        server.starttls()
        server.login(from_addr, app_password)
        server.sendmail(from_addr, to_addr, msg.as_string())


async def send_email_reminder(user, room_slot, minutes_before: int = 20) -> bool:
    join_url = f"{settings.FRONTEND_URL}/room/{room_slot.id}"
    subject  = f"Taraweeh Night {room_slot.ramadan_night} — Room Ready in {minutes_before} Minutes"

    # ── Option 1: SendGrid ────────────────────────────────────────────────
    if settings.SENDGRID_API_KEY:
        try:
            import sendgrid
            from sendgrid.helpers.mail import Mail
            plain = _build_message(user.name, room_slot, join_url, minutes_before)
            sg   = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
            mail = Mail(from_email=settings.SENDGRID_FROM_EMAIL, to_emails=user.email,
                        subject=subject, plain_text_content=plain)
            await asyncio.to_thread(sg.send, mail)
            return True
        except Exception as e:
            logger.error(f"SendGrid failed for user {user.id}: {e}")
            return False

    # ── Option 2: Gmail SMTP ──────────────────────────────────────────────
    if settings.GMAIL_USER and settings.GMAIL_APP_PASSWORD:
        try:
            plain = _build_message(user.name, room_slot, join_url, minutes_before)
            await asyncio.to_thread(
                _send_via_gmail_smtp,
                settings.GMAIL_USER, settings.GMAIL_APP_PASSWORD,
                user.email, subject, plain, plain,
            )
            return True
        except Exception as e:
            logger.error(f"Gmail SMTP failed for user {user.id}: {e}")
            return False

    # ── Option 3: Brevo SMTP ─────────────────────────────────────────────
    if settings.BREVO_SMTP_USER and settings.BREVO_SMTP_KEY:
        try:
            plain = _build_message(user.name, room_slot, join_url, minutes_before)
            def _send():
                msg = MIMEText(plain, "plain")
                msg["Subject"] = subject
                msg["From"]    = f"Tarteel <{settings.BREVO_SMTP_USER}>"
                msg["To"]      = user.email
                with smtplib.SMTP("smtp-relay.brevo.com", 587, timeout=15) as s:
                    s.ehlo(); s.starttls()
                    s.login(settings.BREVO_SMTP_USER, settings.BREVO_SMTP_KEY)
                    s.sendmail(settings.BREVO_SMTP_USER, [user.email], msg.as_string())
            await asyncio.to_thread(_send)
            return True
        except Exception as e:
            logger.error(f"Brevo SMTP failed for user {user.id}: {e}")
            return False

    logger.warning("No email provider configured (set SENDGRID_API_KEY, GMAIL_USER, or BREVO_SMTP_USER)")
    return False
