# backend/app.py
import os
import json
import base64
from typing import List, Dict, Any, Optional
from urllib.parse import quote

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# optional — your project already used langchain_openai ChatOpenAI
# if you don't use it, you can stub or remove the llm part
try:
    from langchain_openai import ChatOpenAI
except Exception:
    ChatOpenAI = None

load_dotenv()

# -------------------- CONFIG --------------------
# Keep the same SAP root as your original code
SAP_ROOT = "https://s4hananewtds.pwcglb.com:44300"
SAP_ODATA_BASEPATH = "/sap/opu/odata/sap/FAC_FINANCIAL_STATEMENT_SRV/FinStmntSet"

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
# NOTE: only set verify=False during local dev if required by your environment
VERIFY_SSL = False

DEFAULT_TIMEOUT = 60

# LLM client (internal GenAI gateway) — optional
LLM_ENABLED = False
if ChatOpenAI is not None and os.getenv("OPENAI_API_KEY"):
    try:
        llm = ChatOpenAI(
            model="bedrock.anthropic.claude-opus-4",
            temperature=0,
            base_url="https://genai-sharedservice-americas.pwcinternal.com",
            api_key=os.getenv("OPENAI_API_KEY"),
        )
        LLM_ENABLED = True
    except Exception:
        LLM_ENABLED = False

# -------------------- FASTAPI --------------------
app = FastAPI(title="SAP Financial Statements API (parametrized)")

# Dev CORS: allow all. In production, restrict to your frontend host.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------- HELPERS --------------------
def _enc(val: Optional[str]) -> str:
    """
    Wrap a string in single-quote percent-encoded form like %27...%27.
    If val is None or empty string, returns %27%27 (an empty single-quoted value).
    """
    if val is None:
        return "%27%27"
    # convert to string and quote it
    s = str(val)
    return f"%27{quote(s)}%27"


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
    variables. Keeps the same fields and $select + $orderby as in your original URL.
    """

    # sensible defaults to match your previous hard-coded URL
    # (but frontend can override by passing query params)
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
    headers = {"X-CSRF-Token": "Fetch"}
    resp = session.get(url, headers=headers, timeout=DEFAULT_TIMEOUT, verify=VERIFY_SSL)
    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail=f"SAP error: {resp.status_code} {resp.text[:400]}")
    try:
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid JSON from SAP: {e}")
    results = data.get("d", {}).get("results", [])
    if not isinstance(results, list):
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
    # these query param names match the SAP identifier keys (P_...).
    P_KTOPL: Optional[str] = Query(None, description="Company code (P_KTOPL / P_BUKRS)"),
    P_VERSN: Optional[str] = Query(None, description="Statement version (P_VERSN)"),
    P_BILABTYP: Optional[str] = Query(None, description="P_BILABTYP"),
    P_XKTOP2: Optional[str] = Query(None, description="P_XKTOP2 (often empty)"),
    P_COMP_YEAR: Optional[str] = Query(None, description="Comparison end year (P_COMP_YEAR)"),
    P_YEAR: Optional[str] = Query(None, description="End year (P_YEAR)"),
    P_BUKRS: Optional[str] = Query(None, description="Company code duplicate field for SAP (P_BUKRS)"),
    P_RLDNR: Optional[str] = Query(None, description="Ledger (P_RLDNR)"),
    P_CURTP: Optional[str] = Query(None, description="Currency filter code (P_CURTP)"),
    P_FROM_YEARPERIOD: Optional[str] = Query(None, description="End period (P_FROM_YEARPERIOD)"),
    P_TO_YEARPERIOD: Optional[str] = Query(None, description="End period (P_TO_YEARPERIOD)"),
    P_FROM_COMPYEARPERIOD: Optional[str] = Query(None, description="Comparison period from (P_FROM_COMPYEARPERIOD)"),
    P_TO_COMPYEARPERIOD: Optional[str] = Query(None, description="Comparison period to (P_TO_COMPYEARPERIOD)"),
    sap_client: str = Query("100", description="sap-client param (default 100)"),
):
    """
    GET /financial-statements
    All P_* parameters map into the FinStmntSet identifier segment. If you omit a parameter
    it will fall back to defaults that match the original hard-coded URL.
    """
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

    records = fetch_financial_statements(odata_url)
    tree = build_tree_with_children(records)
    return {"records": tree}


@app.post("/summarize_tree")
def summarize_tree(body: SummarizeRequest):
    """
    POST /summarize_tree
    Same behavior as before: takes scope and nodes (front-end will send a subset).
    Calls the LLM if configured; otherwise returns a local summary placeholder.
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
        summary_text = getattr(response, "content", None) or (response[0].get("content") if isinstance(response, list) else str(response))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM call failed: {str(e)}")

    return {"summary": summary_text}
