"""Friends API — user search, friend requests, friend management."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from database import get_db
from models import User
from models.friendship import Friendship
from api.deps import get_current_user

router = APIRouter(tags=["friends"])


# ── User search ───────────────────────────────────────────────────────────────

@router.get("/users/search")
async def search_users(
    q: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search users by name or email (excludes self)."""
    if not q or len(q) < 2:
        return []
    pattern = f"%{q}%"
    result = await db.execute(
        select(User)
        .where(
            User.id != current_user.id,
            or_(
                User.email.ilike(pattern),
                User.name.ilike(pattern),
            ),
        )
        .limit(20)
    )
    users = result.scalars().all()
    return [{"id": str(u.id), "name": u.name, "email": u.email} for u in users]


# ── Friends list ──────────────────────────────────────────────────────────────

@router.get("/friends")
async def get_friends(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return accepted friends and pending requests (incoming + outgoing)."""
    result = await db.execute(
        select(Friendship).where(
            or_(
                Friendship.requester_id == current_user.id,
                Friendship.addressee_id == current_user.id,
            )
        )
    )
    friendships = result.scalars().all()

    friends = []
    pending_incoming = []
    pending_outgoing = []

    for f in friendships:
        is_requester = f.requester_id == current_user.id
        other_id = f.addressee_id if is_requester else f.requester_id
        other = await db.get(User, other_id)
        if not other:
            continue
        entry = {
            "id": str(other.id),
            "name": other.name,
            "email": other.email,
            "status": f.status,
            "created_at": f.created_at.isoformat(),
        }
        if f.status == "accepted":
            friends.append(entry)
        elif f.status == "pending":
            if is_requester:
                pending_outgoing.append(entry)
            else:
                pending_incoming.append(entry)

    return {
        "friends": friends,
        "pending_incoming": pending_incoming,
        "pending_outgoing": pending_outgoing,
    }


# ── Send friend request ───────────────────────────────────────────────────────

@router.post("/friends/{user_id}")
async def send_friend_request(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")

    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check for existing friendship in either direction
    existing = await db.execute(
        select(Friendship).where(
            or_(
                (Friendship.requester_id == current_user.id) & (Friendship.addressee_id == user_id),
                (Friendship.requester_id == user_id) & (Friendship.addressee_id == current_user.id),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Friendship already exists or pending")

    friendship = Friendship(requester_id=current_user.id, addressee_id=user_id, status="pending")
    db.add(friendship)
    await db.commit()
    return {"status": "pending"}


# ── Accept friend request ─────────────────────────────────────────────────────

@router.patch("/friends/{user_id}/accept")
async def accept_friend_request(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Friendship).where(
            Friendship.requester_id == user_id,
            Friendship.addressee_id == current_user.id,
            Friendship.status == "pending",
        )
    )
    friendship = result.scalar_one_or_none()
    if not friendship:
        raise HTTPException(status_code=404, detail="No pending request from this user")

    friendship.status = "accepted"
    await db.commit()
    return {"status": "accepted"}


# ── Remove friend / reject request ───────────────────────────────────────────

@router.delete("/friends/{user_id}")
async def remove_friend(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Friendship).where(
            or_(
                (Friendship.requester_id == current_user.id) & (Friendship.addressee_id == user_id),
                (Friendship.requester_id == user_id) & (Friendship.addressee_id == current_user.id),
            )
        )
    )
    friendship = result.scalar_one_or_none()
    if not friendship:
        raise HTTPException(status_code=404, detail="No friendship found")

    await db.delete(friendship)
    await db.commit()
    return {"status": "removed"}
