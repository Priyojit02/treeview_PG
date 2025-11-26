# backend/app.py
import os
import json
import base64
import logging
from typing import List, Dict, Any, Optional
from urllib.parse import quote

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# optional LLM client
try:
    from langchain_openai import ChatOpenAI
except Exception:
    ChatOpenAI = None

load_dotenv()

# ---------- basic logging ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sap-finstat-api")

# -------------------- CONFIG --------------------
SAP_ROOT = os.getenv("SAP_ROOT", "https://s4hananewtds.pwcglb.com:44300")
SAP_ODATA_BASEPATH = os.getenv("SAP_ODATA_BASEPATH", "/sap/opu/odata/sap/FAC_FINANCIAL_STATEMENT_SRV/FinStmntSet")

SAP_USERNAME = os.getenv("SAP_USERNAME")
SAP_PASSWORD = os.getenv("SAP_PASSWORD")
if not SAP_USERNAME or not SAP_PASSWORD:
    raise RuntimeError("Missing SAP_USERNAME or SAP_PASSWORD env vars")

# Basic auth header
_auth_bytes = f"{SAP_USERNAME}:{SAP_PASSWORD}".encode("utf-8")
_auth_b64 = base64.b64encode(_auth_bytes).decode("utf-8")

# Reusable requests session
session = requests.Session()
session.headers.update({
    "Authorization": f"Basic {_auth_b64}",
    "Accept": "application/json",
    "Content-Type": "application/json",
})

# VERIFY_SSL: set to "True" in production environment
VERIFY_SSL = os.getenv("VERIFY_SSL", "False").lower() in ("1", "true", "yes")
DEFAULT_TIMEOUT = int(os.getenv("DEFAULT_TIMEOUT", "60"))

# LLM client (optional)
LLM_ENABLED = False
if ChatOpenAI is not None and os.getenv("OPENAI_API_KEY"):
    try:
        llm = ChatOpenAI(
            model=os.getenv("LLM_MODEL", "bedrock.anthropic.claude-opus-4"),
            temperature=0,
            base_url=os.getenv("LLM_BASE_URL", "https://genai-sharedservice-americas.pwcinternal.com"),
            api_key=os.getenv("OPENAI_API_KEY"),
        )
        LLM_ENABLED = True
    except Exception as e:
        logger.warning("LLM not configured: %s", e)
        LLM_ENABLED = False

# -------------------- FASTAPI --------------------
app = FastAPI(title="SAP Financial Statements API (parametrized)")

# Dev: allow all origins. Restrict to your frontend origin in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: change to ['https://your.frontend.domain'] in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------- HELPERS --------------------
def _enc(val: Optional[str]) -> str:
    """
    Wrap a string in single-quote percent-encoded form like %27...%27.
    If val is None or empty string, returns %27%27 (empty single-quoted).
    """
    if val is None or val == "":
        return "%27%27"
    s = str(val)
    return f"%27{quote(s)}%27"


def sap_yearperiod(year: Optional[str], month: Optional[str]) -> Optional[str]:
    """
    Convert friendly (year, month) into SAP YYYYPPP value:
      - year: "2025"
      - month: "1" -> PPP = 001 (3-digit)
      returns e.g. "2025001"
    If either value missing or invalid -> return None
    """
    if not year or not month:
        return None
    try:
        y = str(year)
        m = int(month)
        if m < 1 or m > 12:
            return None
        return f"{y}{str(m).zfill(3)}"
    except Exception:
        return None


def build_odata_url(
    *,
    P_KTOPL: Optional[str] = None,
    P_VERSN: Optional[str] = None,
    P_BILABTYP: Optional[str] = None,
    P_XKTOP2: Optional[str] = None,
    P_COMP_YEAR: Optional[str] = None,
    P_YEAR: Optional[str] = None,
    P_BUKRS: Optional[str] = None,
    P_RLDNR: Optional[str] = None,
    P_CURTP: Optional[str] = None,
    P_FROM_YEARPERIOD: Optional[str] = None,
    P_TO_YEARPERIOD: Optional[str] = None,
    P_FROM_COMPYEARPERIOD: Optional[str] = None,
    P_TO_COMPYEARPERIOD: Optional[str] = None,
    sap_client: str = "100",
) -> str:
    """
    Build the OData URL with the FinStmntSet identifier segment filled using the provided
    variables. Defaults attempt to match your original hard-coded URL where values omitted.
    """
    # sensible defaults (match previous code)
    P_KTOPL = P_KTOPL or "0808"
    P_VERSN = P_VERSN or "2000_DRAFT"
    P_BILABTYP = P_BILABTYP or "1"
    P_XKTOP2 = P_XKTOP2 or ""
    P_COMP_YEAR = P_COMP_YEAR or ""
    P_YEAR = P_YEAR or ""
    P_BUKRS = P_BUKRS or P_KTOPL
    P_RLDNR = P_RLDNR or "0L"
    P_CURTP = P_CURTP or "10"
    P_FROM_YEARPERIOD = P_FROM_YEARPERIOD or ""
    P_TO_YEARPERIOD = P_TO_YEARPERIOD or P_FROM_YEARPERIOD
    P_FROM_COMPYEARPERIOD = P_FROM_COMPYEARPERIOD or ""
    P_TO_COMPYEARPERIOD = P_TO_COMPYEARPERIOD or P_FROM_COMPYEARPERIOD

    parts = {
        "P_KTOPL": P_KTOPL,
        "P_VERSN": P_VERSN,
        "P_BILABTYP": P_BILABTYP,
        "P_XKTOP2": P_XKTOP2,
        "P_COMP_YEAR": P_COMP_YEAR,
        "P_YEAR": P_YEAR,
        "P_BUKRS": P_BUKRS,
        "P_RLDNR": P_RLDNR,
        "P_CURTP": P_CURTP,
        "P_FROM_YEARPERIOD": P_FROM_YEARPERIOD,
        "P_TO_YEARPERIOD": P_TO_YEARPERIOD,
        "P_FROM_COMPYEARPERIOD": P_FROM_COMPYEARPERIOD,
        "P_TO_COMPYEARPERIOD": P_TO_COMPYEARPERIOD,
        "P_ZERO": "",
    }

    ident_pairs = ",".join(f"{k}={_enc(v)}" for k, v in parts.items())
    ident_segment = f"({ident_pairs})/Result"

    select_clause = (
        "$select=FinancialStatementVariant,FinancialStatementItem,FinancialStatementItemText,"
        "Currency,Ledger,HierarchyNode,OperativeGLAccount,OperativeGLAccountName,FinStatementHierarchyLevelVal,"
        "ParentNode,ChildNode,NodeType,ReportingPeriodAmount,ComparisonPeriodAmount,RelativeDifferencePercent,"
        "AbsoluteDifferenceAmount,CorporateGroupAccount,CorporateGroupAccountName,PlanningCategory,FunctionalArea"
    )

    extra = "&$top=1000000&$orderby=HierarchyNode,FinStatementHierarchyLevelVal,FinancialStatementItem,OperativeGLAccount asc"

    url = f"{SAP_ROOT}{SAP_ODATA_BASEPATH}{ident_segment}?sap-client={sap_client}&{select_clause}{extra}"
    return url


def fetch_financial_statements(url: str) -> List[Dict[str, Any]]:
    """
    GET the provided OData URL (with X-CSRF-Token: Fetch) and return the d.results array.
    """
    logger.info("Fetching SAP OData URL: %s", url)
    headers = {"X-CSRF-Token": "Fetch"}
    resp = session.get(url, headers=headers, timeout=DEFAULT_TIMEOUT, verify=VERIFY_SSL)
    if resp.status_code != 200:
        logger.error("SAP responded %s: %s", resp.status_code, resp.text[:400])
        raise HTTPException(status_code=500, detail=f"SAP error: {resp.status_code} {resp.text[:400]}")
    try:
        data = resp.json()
    except Exception as e:
        logger.exception("Invalid JSON from SAP")
        raise HTTPException(status_code=500, detail=f"Invalid JSON from SAP: {e}")
    results = data.get("d", {}).get("results", [])
    if not isinstance(results, list):
        logger.error("Unexpected SAP response structure: %s", data)
        raise HTTPException(status_code=500, detail="Unexpected SAP response structure (missing d.results list)")
    return results


def build_tree_with_children(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build Children arrays using ParentNode reference.
    """
    for r in records:
        if "Children" not in r:
            r["Children"] = []
    by_id = {str(r.get("HierarchyNode")): r for r in records if r.get("HierarchyNode") is not None}
    roots: List[Dict[str, Any]] = []
    for r in records:
        parent = r.get("ParentNode")
        if parent and str(parent) in by_id:
            by_id[str(parent)]["Children"].append(r)
        else:
            roots.append(r)
    return roots


# -------------------- Pydantic models --------------------
class SummarizeRequest(BaseModel):
    scope: str
    nodes: list


# -------------------- ROUTES --------------------
@app.get("/financial-statements")
def financial_statements(
    # Accept both friendly fields (endYear/endMonth) and raw P_* values.
    P_KTOPL: Optional[str] = Query(None, description="Company code (P_KTOPL / P_BUKRS)"),
    P_VERSN: Optional[str] = Query(None, description="Statement version (P_VERSN)"),
    P_BILABTYP: Optional[str] = Query(None, description="P_BILABTYP"),
    P_XKTOP2: Optional[str] = Query(None, description="P_XKTOP2 (often empty)"),
    P_COMP_YEAR: Optional[str] = Query(None, description="Comparison end year (P_COMP_YEAR)"),
    P_YEAR: Optional[str] = Query(None, description="End year (P_YEAR)"),
    P_BUKRS: Optional[str] = Query(None, description="Company code duplicate field for SAP (P_BUKRS)"),
    P_RLDNR: Optional[str] = Query(None, description="Ledger (P_RLDNR)"),
    P_CURTP: Optional[str] = Query(None, description="Currency filter code (P_CURTP)"),
    # Allow frontend to send the SAP formatted period directly:
    P_FROM_YEARPERIOD: Optional[str] = Query(None, description="End period (P_FROM_YEARPERIOD)"),
    P_TO_YEARPERIOD: Optional[str] = Query(None, description="End period (P_TO_YEARPERIOD)"),
    P_FROM_COMPYEARPERIOD: Optional[str] = Query(None, description="Comparison period from (P_FROM_COMPYEARPERIOD)"),
    P_TO_COMPYEARPERIOD: Optional[str] = Query(None, description="Comparison period to (P_TO_COMPYEARPERIOD)"),
    # Friendly params: accept year/month and convert
    endYear: Optional[str] = Query(None, description="Friendly endYear (YYYY)"),
    endMonth: Optional[str] = Query(None, description="Friendly endMonth (1-12)"),
    compYear: Optional[str] = Query(None, description="Friendly compYear (YYYY)"),
    compMonth: Optional[str] = Query(None, description="Friendly compMonth (1-12)"),
    sap_client: str = Query("100", description="sap-client param (default 100)"),
):
    """
    GET /financial-statements
    Use either raw P_* query params or friendly params (endYear/endMonth, compYear/compMonth).
    Friendly params will be converted to the SAP YYYYPPP format and used to populate the P_* fields.
    """
    # If friendly year/month provided, convert them to SAP period format and override P_FROM... values.
    if endYear or endMonth:
        computed = sap_yearperiod(endYear, endMonth)
        if computed is None:
            raise HTTPException(status_code=400, detail="Invalid endYear/endMonth combination (endMonth must be 1-12).")
        # set both FROM and TO to the same period by default
        P_FROM_YEARPERIOD = computed
        P_TO_YEARPERIOD = computed
        P_YEAR = endYear or P_YEAR

    if compYear or compMonth:
        computed_comp = sap_yearperiod(compYear, compMonth)
        if computed_comp is None:
            raise HTTPException(status_code=400, detail="Invalid compYear/compMonth combination (compMonth must be 1-12).")
        P_FROM_COMPYEARPERIOD = computed_comp
        P_TO_COMPYEARPERIOD = computed_comp
        P_COMP_YEAR = compYear or P_COMP_YEAR

    # Build URL
    try:
        odata_url = build_odata_url(
            P_KTOPL=P_KTOPL,
            P_VERSN=P_VERSN,
            P_BILABTYP=P_BILABTYP,
            P_XKTOP2=P_XKTOP2,
            P_COMP_YEAR=P_COMP_YEAR,
            P_YEAR=P_YEAR,
            P_BUKRS=P_BUKRS,
            P_RLDNR=P_RLDNR,
            P_CURTP=P_CURTP,
            P_FROM_YEARPERIOD=P_FROM_YEARPERIOD,
            P_TO_YEARPERIOD=P_TO_YEARPERIOD,
            P_FROM_COMPYEARPERIOD=P_FROM_COMPYEARPERIOD,
            P_TO_COMPYEARPERIOD=P_TO_COMPYEARPERIOD,
            sap_client=sap_client,
        )
    except Exception as e:
        logger.exception("Failed to build OData URL")
        raise HTTPException(status_code=500, detail=f"Failed to build OData URL: {e}")

    # Fetch and build tree
    records = fetch_financial_statements(odata_url)
    tree = build_tree_with_children(records)
    return {"records": tree}


@app.post("/summarize_tree")
def summarize_tree(body: SummarizeRequest):
    """
    POST /summarize_tree
    Takes scope and nodes (frontend should send subset); calls LLM if configured.
    """
    nodes_preview = body.nodes[:50]
    prompt = (
        "You are an assistant summarizing SAP Financial Statement hierarchies.\n"
        "User has selected the following scope and nodes from a tree view.\n\n"
        f"Scope: {body.scope}\n\n"
        "Nodes JSON:\n"
        f"{json.dumps(nodes_preview, indent=2)}\n\n"
        "Summarize the key financial insights (major items, directions, and any obvious patterns). Use short, clear bullet points."
    )

    if not LLM_ENABLED:
        # fallback quick summary (safe default) if LLM not configured
        local_summary = "LLM not configured. Preview of nodes:\n"
        local_summary += "\n".join([f"- {n.get('FinancialStatementItem','<item>')} ({n.get('HierarchyNode')})" for n in nodes_preview[:10]])
        return {"summary": local_summary}

    try:
        response = llm.invoke([{"role": "user", "content": prompt}])
        # adapt to various possible response shapes
        summary_text = getattr(response, "content", None) or (response[0].get("content") if isinstance(response, list) and response else str(response))
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(status_code=500, detail=f"LLM call failed: {str(e)}")

    return {"summary": summary_text}
