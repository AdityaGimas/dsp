from fastapi import APIRouter, HTTPException, Query
from services.macro_data import get_macro_data

router = APIRouter()


@router.get("/")
def macro_data(
    refresh: bool = Query(False, description="Jika true, abaikan cache dan ambil data terbaru"),
):
    """
    Mengembalikan data makro ekonomi (IHSG, USD/IDR, BI Rate, dll).
    Contoh:
      /api/macro/                 -> dari cache (cepat)
      /api/macro/?refresh=true    -> paksa ambil data terbaru (tembus cache)
    """
    try:
        data = get_macro_data(_refresh=refresh)
        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
