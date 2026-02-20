import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import socketio
from pathlib import Path

from config import get_settings
from database import engine, Base
from redis_client import get_redis, close_redis
from api.auth import router as auth_router
from api.users import router as users_router
from api.rooms import router as rooms_router
from api.admin import router as admin_router
from api.friends import router as friends_router
from api.private_rooms import router as private_rooms_router
from services.scheduler import start_scheduler
from ws.events import sio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — fail fast on missing secrets
    if not settings.JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY is not set. Set it in your .env file.")
    if not settings.ADMIN_API_KEY:
        raise RuntimeError("ADMIN_API_KEY is not set. Set it in your .env file.")
    logger.info("Starting Tarteel backend...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await get_redis()
    start_scheduler()
    logger.info("Tarteel backend ready")
    yield
    # Shutdown
    await close_redis()
    from services.scheduler import scheduler
    scheduler.shutdown(wait=False)
    logger.info("Tarteel backend shut down")


app = FastAPI(
    title="Tarteel API",
    description="Virtual Taraweeh platform for Ramadan",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routes
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(rooms_router)
app.include_router(admin_router)
app.include_router(friends_router)
app.include_router(private_rooms_router)

# Serve HLS files statically
hls_dir = Path(settings.HLS_OUTPUT_DIR)
hls_dir.mkdir(parents=True, exist_ok=True)
app.mount("/hls", StaticFiles(directory=str(hls_dir)), name="hls")

# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Health check
@app.get("/health")
async def health():
    return {"status": "ok", "service": "tarteel"}


# Export the ASGI app (uvicorn should point to this)
application = socket_app
