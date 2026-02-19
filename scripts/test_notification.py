#!/usr/bin/env python3
"""
Send a test Taraweeh reminder email to a specific user.

Uses Gmail SMTP (no SendGrid account needed).

Usage:
    python scripts/test_notification.py --email sendmemailsplease@gmail.com

You will be prompted for your Gmail App Password.
(Create one at: https://myaccount.google.com/apppasswords)

To run without prompts:
    GMAIL_APP_PASSWORD=xxxx python scripts/test_notification.py --email ...
"""
import argparse
import asyncio
import os
import smtplib
import sys
import getpass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from datetime import timezone

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from database import AsyncSessionLocal
from models import User, UserIshaSchedule, RoomSlot
from sqlalchemy import select
from config import get_settings

settings = get_settings()

ROOM_DURATION = {
    (8, 1.0): 45,
    (8, 0.5): 25,
    (20, 1.0): 90,
    (20, 0.5): 50,
}


def _build_html(user_name: str, slot, join_url: str, minutes_before: int = 20) -> tuple[str, str]:
    """Returns (plain_text, html) tuple."""
    duration = ROOM_DURATION.get((slot.rakats, slot.juz_per_night), 60)
    juz_label = f"Juz {slot.juz_number}"
    if slot.juz_half == 1:
        juz_label += " (first half)"
    elif slot.juz_half == 2:
        juz_label += " (second half)"

    plain = (
        f"Assalamu Alaikum {user_name or 'dear worshipper'},\n\n"
        f"Your Taraweeh room opens in {minutes_before} minutes.\n\n"
        f"Night {slot.ramadan_night} of Ramadan\n"
        f"{juz_label} · {slot.rakats} Rakats\n"
        f"Duration: ~{duration} minutes\n\n"
        f"Join your room: {join_url}\n\n"
        f"May Allah accept your prayers.\n\n"
        f"— Tarteel"
    )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a1628;font-family:Georgia,serif;color:#e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1628;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0c1a30;border:1px solid #c9a84c33;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0c1a30,#1a2f50);padding:32px;text-align:center;border-bottom:1px solid #c9a84c33;">
          <div style="font-size:28px;color:#c9a84c;letter-spacing:0.1em;margin-bottom:4px;">&#x062A;&#x064E;&#x0631;&#x062A;&#x064A;&#x0644;</div>
          <div style="font-size:13px;color:#c9a84c99;letter-spacing:3px;text-transform:uppercase;">Tarteel</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="color:#9ca3af;font-size:14px;margin:0 0 16px;">Assalamu Alaikum <strong style="color:#e5e5e5;">{user_name or "dear worshipper"}</strong>,</p>

          <div style="background:#0a1628;border:1px solid #c9a84c33;border-radius:12px;padding:24px;margin:20px 0;text-align:center;">
            <div style="font-size:36px;margin-bottom:8px;">🕌</div>
            <div style="color:#c9a84c;font-size:22px;font-weight:bold;margin-bottom:4px;">Room opens in {minutes_before} minutes</div>
            <div style="color:#9ca3af;font-size:13px;">Night {slot.ramadan_night} of Ramadan</div>
          </div>

          <table width="100%" style="border-collapse:collapse;margin:20px 0;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#9ca3af;font-size:13px;width:40%;">Quran portion</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#e5e5e5;font-size:14px;">{juz_label}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#9ca3af;font-size:13px;">Rakats</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e3a5f;color:#e5e5e5;font-size:14px;">{slot.rakats}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#9ca3af;font-size:13px;">Duration</td>
              <td style="padding:10px 0;color:#e5e5e5;font-size:14px;">~{duration} minutes</td>
            </tr>
          </table>

          <div style="text-align:center;margin:28px 0;">
            <a href="{join_url}" style="display:inline-block;background:#c9a84c;color:#0a1628;font-weight:bold;font-size:15px;padding:14px 36px;border-radius:50px;text-decoration:none;letter-spacing:0.5px;">
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
</body>
</html>"""

    return plain, html


async def find_user_and_slot(email: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            return None, None

        # Find a room slot for this user
        result = await db.execute(
            select(RoomSlot)
            .join(UserIshaSchedule, (UserIshaSchedule.isha_bucket_utc == RoomSlot.isha_bucket_utc) &
                                    (UserIshaSchedule.ramadan_night == RoomSlot.ramadan_night))
            .where(
                UserIshaSchedule.user_id == user.id,
                RoomSlot.rakats == user.rakats,
                RoomSlot.juz_per_night == user.juz_per_night,
            )
            .order_by(RoomSlot.isha_bucket_utc)
            .limit(1)
        )
        slot = result.scalar_one_or_none()
        return user, slot


def send_via_gmail(from_addr: str, app_password: str, to_addr: str, subject: str, plain: str, html: str) -> bool:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Tarteel <{from_addr}>"
    msg["To"]      = to_addr

    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.ehlo()
            server.starttls()
            server.login(from_addr, app_password)
            server.sendmail(from_addr, to_addr, msg.as_string())
        return True
    except Exception as e:
        print(f"SMTP error: {e}")
        return False


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", default="sendmemailsplease@gmail.com")
    parser.add_argument("--from-email", default="sendmemailsplease@gmail.com",
                        help="Gmail address to send FROM (must have app password)")
    parser.add_argument("--minutes-before", type=int, default=20)
    args = parser.parse_args()

    print(f"Looking up user: {args.email}")
    user, slot = await find_user_and_slot(args.email)

    if not user:
        print(f"ERROR: No user found with email {args.email}")
        return

    if not slot:
        print(f"ERROR: No room slot found for {args.email}")
        return

    print(f"  User  : {user.name or user.email}")
    print(f"  Slot  : Night {slot.ramadan_night}, {slot.rakats} Rakats, Juz {slot.juz_number}" +
          (f" half {slot.juz_half}" if slot.juz_half else ""))
    print(f"  Isha  : {slot.isha_bucket_utc}")
    print()

    join_url  = f"{settings.FRONTEND_URL}/room/{slot.id}"
    plain, html = _build_html(user.name, slot, join_url, args.minutes_before)
    subject   = f"Taraweeh Night {slot.ramadan_night} — Room Ready in {args.minutes_before} Minutes"

    # Get app password
    app_password = os.environ.get("GMAIL_APP_PASSWORD") or getpass.getpass(
        f"Gmail App Password for {args.from_email} "
        "(create at myaccount.google.com/apppasswords): "
    )

    print(f"Sending to {args.email} via Gmail SMTP...")
    ok = send_via_gmail(args.from_email, app_password, args.email, subject, plain, html)

    if ok:
        print("✓ Email sent successfully — check your inbox!")
    else:
        print("✗ Failed to send. Check the app password and that 2FA is enabled on your Google account.")
        print()
        print("---- Email preview (plain text) ----")
        print(plain)


if __name__ == "__main__":
    asyncio.run(main())
