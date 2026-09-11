import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import httpx
from decouple import config

# Rendered by ../../../emails (a React Email component) via `npm run build`
# in that package — committed here as a build artifact so the backend has no
# runtime Node dependency. Re-run that build after editing the email design.
_TEMPLATES_DIR = Path(__file__).parent / "email_templates"


class EmailError(Exception):
    """Raised when a transactional email fails to send."""


class SmtpEmailClient:
    def send(self, to: str, subject: str, html_body: str, text_body: str) -> None:
        host = config("SMTP_HOST")
        port = config("SMTP_PORT", default=587, cast=int)
        user = config("SMTP_USER", default="")
        password = config("SMTP_PASSWORD", default="")
        sender = config("EMAIL_FROM", default=user or "no-reply@localhost")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = to
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        try:
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.starttls()
                if user:
                    server.login(user, password)
                server.sendmail(sender, [to], msg.as_string())
        except Exception as e:
            raise EmailError(f"Failed to send email via SMTP: {e}") from e


class ResendEmailClient:
    def send(self, to: str, subject: str, html_body: str, text_body: str) -> None:
        api_key = config("RESEND_API_KEY")
        sender = config("EMAIL_FROM", default="no-reply@resend.dev")
        try:
            resp = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"from": sender, "to": [to], "subject": subject, "html": html_body, "text": text_body},
                timeout=10,
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise EmailError(f"Failed to send email via Resend: {e}") from e


def _render_template(name: str, **placeholders: str) -> str:
    text = (_TEMPLATES_DIR / name).read_text()
    for key, value in placeholders.items():
        text = text.replace(f"{{{{{key}}}}}", value)
    return text


def _reset_email_bodies(reset_url: str, logo_url: str) -> tuple[str, str]:
    html_body = _render_template("reset-password.html", reset_url=reset_url, logo_url=logo_url)
    text_body = _render_template("reset-password.txt", reset_url=reset_url, logo_url=logo_url)
    return html_body, text_body


class EmailClient:
    """Wraps a provider-specific client (SMTP/Resend/...) with the app's own messages."""

    def __init__(self, provider):
        self._provider = provider

    def send_password_reset_email(self, to: str, reset_url: str, logo_url: str) -> None:
        html_body, text_body = _reset_email_bodies(reset_url, logo_url)
        self._provider.send(to, "Reset your DashTro password", html_body, text_body)
