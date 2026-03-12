from fastapi import APIRouter, Depends, Query
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession
from app.database import get_session
from app.models.item import ItemRecord as Item
from app.models.learner import Learner
from app.models.interaction_log import InteractionLog

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/scores")
async def get_scores_histogram(
    lab: str = Query(..., description="Lab identifier, e.g. lab-04"),
    session: AsyncSession = Depends(get_session)
):
    lab_item = (await session.exec(
        select(Item).where(Item.title.contains(lab.replace("-", " ").title()))
    )).first()
    if not lab_item:
        return []

    tasks = (await session.exec(
        select(Item).where(Item.parent_id == lab_item.id)
    )).all()
    task_ids = [task.id for task in tasks]

    scores = (await session.exec(
        select(InteractionLog.score).where(InteractionLog.item_id.in_(task_ids))
    )).all()

    buckets = {"0-25": 0, "26-50": 0, "51-75": 0, "76-100": 0}
    for score in scores:
        if score is not None:
            if score <= 25:
                buckets["0-25"] += 1
            elif score <= 50:
                buckets["26-50"] += 1
            elif score <= 75:
                buckets["51-75"] += 1
            else:
                buckets["76-100"] += 1

    return [{"bucket": k, "count": v} for k, v in buckets.items()]


@router.get("/pass-rates")
async def get_pass_rates(
    lab: str = Query(..., description="Lab identifier, e.g. lab-04"),
    session: AsyncSession = Depends(get_session)
):
    lab_item = (await session.exec(
        select(Item).where(Item.title.contains(lab.replace("-", " ").title()))
    )).first()
    if not lab_item:
        return []

    tasks = (await session.exec(
        select(Item).where(Item.parent_id == lab_item.id).order_by(Item.title)
    )).all()

    result = []
    for task in tasks:
        stats = (await session.exec(
            select(
                func.avg(InteractionLog.score).label("avg_score"),
                func.count(InteractionLog.id).label("attempts")
            ).where(InteractionLog.item_id == task.id)
        )).first()
        
        if stats:
            avg_score = round(stats.avg_score or 0, 1)
            attempts = stats.attempts or 0
        else:
            avg_score = 0
            attempts = 0

        result.append({
            "task": task.title,
            "avg_score": avg_score,
            "attempts": attempts
        })
    
    return result


@router.get("/timeline")
async def get_timeline(
    lab: str = Query(..., description="Lab identifier, e.g. lab-04"),
    session: AsyncSession = Depends(get_session)
):
    lab_item = (await session.exec(
        select(Item).where(Item.title.contains(lab.replace("-", " ").title()))
    )).first()
    if not lab_item:
        return []

    tasks = (await session.exec(
        select(Item).where(Item.parent_id == lab_item.id)
    )).all()
    task_ids = [task.id for task in tasks]

    results = (await session.exec(
        select(
            func.date(InteractionLog.created_at).label("date"),
            func.count().label("submissions")
        )
        .where(InteractionLog.item_id.in_(task_ids))
        .group_by("date")
        .order_by("date")
    )).all()

    return [{"date": str(r.date), "submissions": r.submissions} for r in results]


@router.get("/groups")
async def get_groups(
    lab: str = Query(..., description="Lab identifier, e.g. lab-04"),
    session: AsyncSession = Depends(get_session)
):
    lab_item = (await session.exec(
        select(Item).where(Item.title.contains(lab.replace("-", " ").title()))
    )).first()
    if not lab_item:
        return []

    tasks = (await session.exec(
        select(Item).where(Item.parent_id == lab_item.id)
    )).all()
    task_ids = [task.id for task in tasks]

    results = (await session.exec(
        select(
            Learner.student_group.label("group"),
            func.avg(InteractionLog.score).label("avg_score"),
            func.count(func.distinct(Learner.id)).label("students")
        )
        .join(InteractionLog, InteractionLog.learner_id == Learner.id)
        .where(InteractionLog.item_id.in_(task_ids))
        .group_by(Learner.student_group)
        .order_by(Learner.student_group)
    )).all()

    return [
        {
            "group": r.group or "unknown",
            "avg_score": round(r.avg_score or 0, 1),
            "students": r.students or 0
        }
        for r in results
    ]