import uuid
import re
from pydantic import BaseModel, EmailStr, field_validator

ALLOWED_RECITERS = {
    "Alafasy_128kbps",
    "Abdurrahmaan_As-Sudais_192kbps",
    "Abdul_Basit_Murattal_192kbps",
    "Maher_AlMuaiqly_128kbps",
    "Yasser_Ad-Dussary_128kbps",
    "Abu_Bakr_Ash-Shaatree_128kbps",
}

E164_RE = re.compile(r"^\+?[1-9]\d{7,14}$")


class UserRegisterStep1(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserRegisterStep2(BaseModel):
    city: str
    country: str
    calc_method: int = 3


class UserRegisterStep3(BaseModel):
    rakats: int = 8
    juz_per_night: float = 1.0
    preferred_reciter: str = "Alafasy_128kbps"

    @field_validator("rakats")
    @classmethod
    def validate_rakats(cls, v: int) -> int:
        if v not in (8, 20):
            raise ValueError("rakats must be 8 or 20")
        return v

    @field_validator("juz_per_night")
    @classmethod
    def validate_juz(cls, v: float) -> float:
        if v not in (0.5, 1.0):
            raise ValueError("juz_per_night must be 0.5 or 1.0")
        return v

    @field_validator("preferred_reciter")
    @classmethod
    def validate_reciter(cls, v: str) -> str:
        if v not in ALLOWED_RECITERS:
            raise ValueError(f"Invalid reciter. Choose from: {', '.join(sorted(ALLOWED_RECITERS))}")
        return v


class UserRegisterStep4(BaseModel):
    phone: str | None = None
    notify_whatsapp: bool = True
    notify_email: bool = True
    notify_minutes_before: int = 20

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        # Strip whitespace and common separators
        cleaned = v.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        # Always normalise to E.164 with leading +
        if not cleaned.startswith("+"):
            cleaned = "+" + cleaned
        bare = cleaned[1:]  # digits only after the +
        if not bare.isdigit() or not (7 <= len(bare) <= 15):
            raise ValueError("Phone must be in E.164 format, e.g. +447700900123")
        return cleaned


class UserRegisterFull(UserRegisterStep1, UserRegisterStep2, UserRegisterStep3, UserRegisterStep4):
    pass


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    name: str | None = None
    city: str | None = None
    country: str | None = None
    calc_method: int | None = None
    rakats: int | None = None
    juz_per_night: float | None = None
    preferred_reciter: str | None = None
    phone: str | None = None
    notify_whatsapp: bool | None = None
    notify_email: bool | None = None
    notify_minutes_before: int | None = None

    @field_validator("preferred_reciter")
    @classmethod
    def validate_reciter(cls, v: str | None) -> str | None:
        if v is not None and v not in ALLOWED_RECITERS:
            raise ValueError(f"Invalid reciter. Choose from: {', '.join(sorted(ALLOWED_RECITERS))}")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        # Strip whitespace and common separators
        cleaned = v.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        # Always normalise to E.164 with leading +
        if not cleaned.startswith("+"):
            cleaned = "+" + cleaned
        bare = cleaned[1:]  # digits only after the +
        if not bare.isdigit() or not (7 <= len(bare) <= 15):
            raise ValueError("Phone must be in E.164 format, e.g. +447700900123")
        return cleaned


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None
    city: str | None
    country: str | None
    timezone: str | None
    calc_method: int
    rakats: int
    juz_per_night: float
    preferred_reciter: str
    phone: str | None
    notify_whatsapp: bool
    notify_email: bool
    notify_minutes_before: int
    is_active: bool
    current_streak: int = 0
    longest_streak: int = 0
    last_attended_night: int | None = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
