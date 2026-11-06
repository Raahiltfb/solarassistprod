from fastapi import FastAPI, APIRouter, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
try:
    from motor.motor_asyncio import AsyncIOMotorClient
except ImportError:
    AsyncIOMotorClient = None
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (optional / non-blocking for standalone sync worker)
mongo_url = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url) if (mongo_url and AsyncIOMotorClient) else None
db = client[os.environ.get('DB_NAME', 'solarassist')] if client else None

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Solar Assist Multi-OEM Sync Service Running"}

# Health check routes
def get_liveness_payload():
    return {
        "status": "alive",
        "service": "solarassist-multi-oem-worker",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

def get_readiness_payload():
    env = os.getenv("ENV") or os.getenv("NODE_ENV") or "development"
    supabase_configured = bool(os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")) and bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
    solis_configured = bool(os.getenv("SOLIS_KEY_ID") and os.getenv("SOLIS_KEY_SECRET"))
    solaros_configured = bool(os.getenv("SOLAROS_EMAIL") and os.getenv("SOLAROS_PASSWORD"))
    
    if not supabase_configured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase credentials not configured")
        
    return {
        "status": "ready",
        "service": "solarassist-multi-oem-worker",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": env,
        "providers_configured": {
            "solis": solis_configured,
            "feston": solaros_configured
        },
        "database": {
            "supabase": True
        }
    }

@api_router.get("/health/live")
@app.get("/health/live")
async def liveness_check():
    """Liveness probe: confirms worker process and event loop are responsive. Never queries external OEM APIs."""
    return get_liveness_payload()

@api_router.get("/health/ready")
@app.get("/health/ready")
async def readiness_check():
    """Readiness probe: confirms database configuration. Does NOT restart container on temporary external OEM drops."""
    return get_readiness_payload()

@api_router.get("/health")
@app.get("/health")
async def health_check():
    """Aggregate health and diagnostics endpoint."""
    return get_readiness_payload()

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    if not db:
        raise HTTPException(status_code=503, detail="MongoDB not configured")
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    if not db:
        return []
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

from fastapi import Header, HTTPException, status
from typing import Optional

class SyncRequest(BaseModel):
    trigger_source: str = "manual"
    oem_filter: Optional[str] = None

@api_router.post("/sync", status_code=202)
async def trigger_manual_sync(
    background_tasks: BackgroundTasks,
    payload: SyncRequest = None,
    authorization: str = Header(None)
):
    """Trigger a sync cycle for all active OEM integrations in the background."""
    cron_secret = os.getenv("CRON_SECRET")
    if cron_secret:
        expected = f"Bearer {cron_secret}"
        if not authorization or authorization != expected:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized: Invalid CRON_SECRET token."
            )
            
    trigger_source = payload.trigger_source if payload else "manual"
    oem_filter = payload.oem_filter if payload else None
    from sync_service import poll_and_sync_all
    background_tasks.add_task(poll_and_sync_all, trigger_source=trigger_source, oem_filter=oem_filter)
    return {
        "status": "accepted",
        "message": f"Synchronization task queued (Filter: {oem_filter or 'all'})",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

import asyncio
from sync_service import start_polling_loop

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(start_polling_loop())
    logger.info("Common sync polling background task registered on server startup.")

@app.on_event("shutdown")
async def shutdown_handler():
    logger.info("Graceful shutdown initiated. Waiting for active sync jobs to complete...")
    try:
        from sync_service import sync_lock
        # Wait up to 25 seconds for in-flight sync cycle to finish cleanly
        for _ in range(25):
            if not sync_lock.locked():
                break
            await asyncio.sleep(1)
        if sync_lock.locked():
            logger.warning("Active sync cycle still running after shutdown timeout; releasing lock cleanly or letting lease expire.")
        else:
            logger.info("Sync lock released cleanly before process termination.")
    except Exception as e:
        logger.error(f"Error during graceful shutdown lock wait: {e}")
        
    if client:
        try:
            client.close()
        except Exception:
            pass