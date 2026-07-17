from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class ContributionDayResponse(BaseModel):
    date: date
    count: int


class ContributionRangeResponse(BaseModel):
    start_date: date
    end_date: date


class ContributionActivityResponse(BaseModel):
    total: int
    range: ContributionRangeResponse
    days: list[ContributionDayResponse]
