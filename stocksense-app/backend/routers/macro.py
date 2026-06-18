from fastapi import APIRouter, HTTPException
from services.macro_data import get_macro_data

router = APIRouter()

@router.get("/")
def macro_data():
    """
    Mengembalikan data makro ekonomi (IHSG, USD/IDR, BI Rate, dll).
    Contoh: /api/macro/
    """
    try:
        data = get_macro_data()
        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
