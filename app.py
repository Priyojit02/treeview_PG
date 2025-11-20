import os
import json
import base64
from typing import List, Dict, Any

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_openai import ChatOpenAI

# ===================== CONFIG =====================

# Hard-coded OData URL exactly as required
SAP_ODATA_URL = (
    "https://s4hananewtds.pwcglb.com:44300"
    "/sap/opu/odata/sap/FAC_FINANCIAL_STATEMENT_SRV/"
    "FinStmntSet(P_KTOPL=%270808%27,"
    "P_VERSN=%272000_DRAFT%27,"
    "P_BILABTYP=%271%27,"
    "P_XKTOP2=%27%27,"
    "P_COMP_YEAR=%272024%27,"
    "P_YEAR=%272525%27,"
    "P_BUKRS=%270808%27,"
    "P_RLDNR=%270L%27,"
    "P_CURTP=%2710%27,"
    "P_FROM_YEARPERIOD=%272025001%27,"
    "P_TO_YEARPERIOD=%272025010%27,"
    "P_FROM_COMPYEARPERIOD=%272024001%27,"
    "P_TO_COMPYEARPERIOD=%272024010%27,"
    "P_ZERO=%27%27)/Result"
    "?sap-client=100&"
    "$select=FinancialStatementVariant,FinancialStatementItem,"
    "FinancialStatementItemText,Currency,Ledger,HierarchyNode,"
    "OperativeGLAccount,OperativeGLAccountName,FinStatementHierarchyLevelVal,"
    "ParentNode,ChildNode,NodeType,ReportingPeriodAmount,"
    "ComparisonPeriodAmount,RelativeDifferencePercent,"
    "AbsoluteDifferenceAmount,CorporateGroupAccount,"
    "CorporateGroupAccountName,PlanningCategory,FunctionalArea"
    "&$top=1000000&"
    "$orderby=HierarchyNode,FinStatementHierarchyLevelVal,"
    "FinancialStatementItem,OperativeGLAccount asc&"
    "$filter=(CompanyCode%20eq%20%270808%27%20and%20Ledger%20eq%20%270L%27"
    "%20and%20FinancialStatementVariant%20eq%20%272000_DRAFT%27)"
)

SAP_USERNAME = os.getenv("SAP_USERNAME")
SAP_PASSWORD = os.getenv("SAP_PASSWORD")

if not SAP_USERNAME or not SAP_PASSWORD:
    raise RuntimeError("Missing SAP_USERNAME or SAP_PASSWORD env vars")

# Basic auth header
_auth_bytes = f"{SAP_USERNAME}:{SAP_PASSWORD}".encode("utf-8")
_auth_b64 = base64.b64encode(_auth_bytes).decode("utf-8")

# Reusable session
session = requests.Session()
session.headers.update(
    {
        "Authorization": f"Basic {_auth_b64}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
)

DEFAULT_TIMEOUT = 60

# LLM client (internal GenAI gateway)
llm = ChatOpenAI(
    model="bedrock.anthropic.claude-opus-4",
    temperature=0,
    base_url="https://genai-sharedservice-americas.pwcinternal.com",
    api_key=os.getenv("OPENAI_API_KEY"),
)

# ===================== FASTAPI APP =====================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # later restrict to your frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===================== HELPERS =====================

def fetch_financial_statements() -> List[Dict[str, Any]]:
    """
    Do a GET to SAP OData with X-CSRF-Token: Fetch.
    Returns flat list of SAP records (d.results).
    """
    headers = {
        "X-CSRF-Token": "Fetch",
    }

    resp = session.get(SAP_ODATA_URL, headers=headers, timeout=DEFAULT_TIMEOUT)

    if resp.status_code != 200:
        raise HTTPException(
            status_code=500,
            detail=f"SAP error: {resp.status_code} {resp.text[:300]}",
        )

    try:
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid SAP JSON: {e}")

    # Standard SAP OData structure: { "d": { "results": [...] } }
    results = data.get("d", {}).get("results", [])
    if not isinstance(results, list):
        raise HTTPException(
            status_code=500, detail="Unexpected SAP response structure"
        )

    return results


def build_tree_with_children(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Use HierarchyNode / ParentNode to build a tree and attach Children[].

    Keeps SAP field names, and adds:
      - "Children": [ ... ]
    so the frontend transformFromBackend() can use r.Children.
    """
    # Ensure Children exists on all nodes
    for r in records:
        if "Children" not in r:
            r["Children"] = []

    # Map HierarchyNode -> record
    by_id: Dict[str, Dict[str, Any]] = {r["HierarchyNode"]: r for r in records}

    roots: List[Dict[str, Any]] = []

    for r in records:
        parent_id = r.get("ParentNode")
        if parent_id and parent_id in by_id:
            by_id[parent_id]["Children"].append(r)
        else:
            roots.append(r)

    return roots

# ===================== Pydantic models =====================

class SummarizeRequest(BaseModel):
    scope: str
    nodes: list  # generic list of node dicts from frontend

# ===================== ROUTES =====================

@app.get("/financial-statements")
def financial_statements():
    """
    GET /financial-statements
    - Calls SAP OData with CSRF fetch
    - Builds a hierarchy using ParentNode/HierarchyNode
    - Returns { "records": [ ... ] } where each record may have Children[]
    """
    records = fetch_financial_statements()
    tree = build_tree_with_children(records)
    return {"records": tree}


@app.post("/summarize_tree")
def summarize_tree(body: SummarizeRequest):
    """
    POST /summarize_tree
    - Frontend sends: { "scope": "node" | "subtree", "nodes": [ ... ] }
    - Call LLM (Claude Opus via internal gateway)
    - Return { "summary": "..." }
    """
    nodes_preview = body.nodes[:50]

    prompt = (
        "You are an assistant summarizing SAP Financial Statement hierarchies.\n"
        "User has selected the following scope and nodes from a tree view.\n\n"
        f"Scope: {body.scope}\n\n"
        "Nodes JSON:\n"
        f"{json.dumps(nodes_preview, indent=2)}\n\n"
        "Summarize the key financial insights (major items, directions, and any "
        "obvious patterns). Use short, clear bullet points."
    )

    try:
        response = llm.invoke(
            [
                {"role": "user", "content": prompt},
            ]
        )
        summary_text = response.content
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"LLM call failed: {str(e)}",
        )

    return {"summary": summary_text}
