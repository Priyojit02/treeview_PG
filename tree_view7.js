// src/App.jsx
import * as React from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Divider,
  Stack,
  Button,
  TextField,
  Chip,
  useMediaQuery,
  Grid,
  Paper,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Snackbar,
  IconButton,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import SearchIcon from "@mui/icons-material/Search";
import BusinessIcon from "@mui/icons-material/Business";
import PeopleIcon from "@mui/icons-material/People";
import PersonIcon from "@mui/icons-material/Person";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { SimpleTreeView, TreeItem } from "@mui/x-tree-view";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Cell,
  CartesianGrid,
} from "recharts";

// =================== API CONFIG ===================
const API_BASE = "http://127.0.0.1:8000";
const API_PATH_TREE = "/financial-statements"; // GET (filters accepted as query params)
const API_PATH_LLM = "/summarize_tree"; // POST

// =================== UTILS (unchanged) ===================
const flattenIds = (nodes) => {
  const all = [];
  const walk = (n) => {
    if (!n) return;
    all.push(String(n.id));
    (n.children || []).forEach(walk);
  };
  (nodes || []).forEach(walk);
  return all;
};

const searchTree = (nodes, query) => {
  if (!query) return { data: nodes, expand: [] };
  const q = query.toLowerCase();

  const filterNode = (node) => {
    const kids = node.children || [];
    const filteredKids = kids.map(filterNode).filter(Boolean);

    const hay = [
      node.name,
      node.code,
      node.account,
      node.itemText,
      node.amount,
      node.currency,
    ]
      .filter(Boolean)
      .map(String)
      .join(" ")
      .toLowerCase();

    const matchesSelf = hay.includes(q);

    if (matchesSelf || filteredKids.length) {
      return { ...node, children: filteredKids };
    }
    return null;
  };

  const filtered = (nodes || []).map(filterNode).filter(Boolean);

  const expandIds = [];
  const collectParents = (node) => {
    if (node.children?.length) {
      expandIds.push(String(node.id));
      node.children.forEach(collectParents);
    }
  };
  filtered.forEach(collectParents);
  return { data: filtered, expand: expandIds };
};

const iconFor = (kind) => {
  if (kind === "root") return <BusinessIcon fontSize="small" />;
  if (kind === "group") return <PeopleIcon fontSize="small" />;
  return <PersonIcon fontSize="small" />;
};

const chipColorFor = (kind, theme) => {
  switch (kind) {
    case "root":
      return {
        bg: alpha(theme.palette.primary.main, 0.08),
        fg: theme.palette.primary.main,
      };
    case "group":
      return {
        bg: alpha(theme.palette.success.main, 0.1),
        fg: theme.palette.success.main,
      };
    default:
      return {
        bg: alpha(theme.palette.info.main, 0.1),
        fg: theme.palette.info.main,
      };
  }
};

const collectSubtree = (root) => {
  const out = [];
  const walk = (n) => {
    out.push(n);
    (n.children || []).forEach(walk);
  };
  if (root) walk(root);
  return out;
};

const uniqueKeys = (records) => {
  const set = new Set();
  records.forEach((r) =>
    Object.keys(r).forEach((k) => k !== "children" && set.add(k))
  );
  return Array.from(set);
};

const localSummary = (scopeRecords) => {
  if (!scopeRecords.length) return "(no data)";
  const kinds = scopeRecords.reduce((acc, r) => {
    acc[r.kind] = (acc[r.kind] || 0) + 1;
    return acc;
  }, {});
  const names = scopeRecords
    .slice(0, 6)
    .map((r) => r.name)
    .join(", ");
  const keys = uniqueKeys(scopeRecords).length;

  return (
    `Items: ${scopeRecords.length}. ` +
    `Types: ${Object.entries(kinds)
      .map(([t, c]) => `${t}:${c}`)
      .join(" | ")}. ` +
    `Columns (unique keys): ${keys}. ` +
    `Examples: ${names}${scopeRecords.length > 6 ? "…" : ""}`
  );
};

const flattenPayload = (n) => ({
  id: n.id,
  kind: n.kind,
  name: n.name,
  code: n.code,
  account: n.account,
  amount: n.amount,
  currency: n.currency,
});

const mapNodeType = (NodeType) => {
  if (NodeType === "R") return "root";
  if (NodeType === "P") return "group";
  return "leaf";
};

const bestName = (rec) =>
  rec.FinancialStatementItemText ||
  rec.OperativeGLAccountName ||
  rec.OperativeGLAccount ||
  rec.FinancialStatementItem ||
  rec.HierarchyNode;

const fmtAmount = (x) => (x == null ? "" : String(x));

const transformFromBackend = (records = []) => {
  const walk = (r) => ({
    id: r.HierarchyNode,
    kind: mapNodeType(r.NodeType),
    name: bestName(r),
    code: r.FinancialStatementItem || undefined,
    itemText: r.FinancialStatementItemText || undefined,
    account: r.OperativeGLAccount || undefined,
    accountName: r.OperativeGLAccountName || undefined,
    amount: fmtAmount(r.ReportingPeriodAmount),
    comparison: fmtAmount(r.ComparisonPeriodAmount),
    diffAbs: fmtAmount(r.AbsoluteDifferenceAmount),
    diffPct: fmtAmount(r.RelativeDifferencePercent),
    currency: r.Currency || undefined,
    level: r.FinStatementHierarchyLevelVal || undefined,
    children: (r.Children || []).map(walk),
  });

  return (records || []).map(walk);
};

// =================== Tree Item Renderer ===================
function RenderItem({ node, hoveredId, setHoveredId, selectedId }) {
  const theme = useTheme();
  const kids = node.children || [];
  const colors = chipColorFor(node.kind, theme);
  const isHovered = hoveredId === node.id;
  const isSelected = selectedId === node.id;

  return (
    <TreeItem
      key={node.id}
      itemId={String(node.id)}
      label={
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          onMouseEnter={() => setHoveredId(node.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          {iconFor(node.kind)}
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography variant="body2" fontWeight={700}>
              {node.name}
            </Typography>
            {node.amount && (
              <Typography variant="caption" color="text.secondary">
                {node.amount} {node.currency || ""}
              </Typography>
            )}
          </Stack>
          {kids.length > 0 && (
            <Chip
              label={`${kids.length}`}
              size="small"
              sx={{
                height: 20,
                borderRadius: 1,
                bgcolor: colors.bg,
                color: colors.fg,
                "& .MuiChip-label": { px: 0.75, py: 0 },
              }}
            />
          )}
        </Stack>
      }
      sx={{
        "& .MuiTreeItem-content": {
          borderRadius: 1,
          pr: 0.5,
          transition: "background-color 120ms ease, box-shadow 120ms ease",
          ...(isHovered && {
            backgroundColor: alpha(theme.palette.primary.main, 0.06),
          }),
          ...(isSelected && {
            boxShadow: `inset 0 0 0 2px ${alpha(
              theme.palette.primary.main,
              0.35
            )}`,
          }),
        },
        "& .MuiTreeItem-content:hover": {
          backgroundColor: "action.hover",
        },
        "& .MuiTreeItem-group": {
          marginLeft: 1.25,
          paddingLeft: 1.0,
          borderLeft: `1px dashed ${theme.palette.divider}`,
        },
      }}
    >
      {kids.map((child) => (
        <RenderItem
          key={child.id}
          node={child}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
          selectedId={selectedId}
        />
      ))}
    </TreeItem>
  );
}

// =================== MAIN APP ===================
export default function App() {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));

  const [query, setQuery] = React.useState("");
  const [expandedIds, setExpandedIds] = React.useState([]);
  const [dataTree, setDataTree] = React.useState([]);
  const [filtered, setFiltered] = React.useState({ data: [], expand: [] });

  const [hoveredId, setHoveredId] = React.useState(null);
  const [selectedId, setSelectedId] = React.useState(null);

  const [loadingData, setLoadingData] = React.useState(true);
  const [loadingAction, setLoadingAction] = React.useState(false);

  const [tab, setTab] = React.useState("result");
  const [scope, setScope] = React.useState("subtree"); // 'node' | 'subtree'

  const [summary, setSummary] = React.useState("");
  const [columnCount, setColumnCount] = React.useState(0);
  const [columnList, setColumnList] = React.useState([]);

  const [snack, setSnack] = React.useState("");
  const [error, setError] = React.useState("");

  // --- Filters state: fully expose the OData params as inputs
  const [params, setParams] = React.useState({
    // identifier segment P_* fields
    P_KTOPL: "0808",
    P_VERSN: "2000_DRAFT",
    P_BILABTYP: "1", // fixed default
    P_XKTOP2: "",
    P_COMP_YEAR: "",
    P_YEAR: "",
    P_BUKRS: "0808",
    P_RLDNR: "0L",
    P_CURTP: "10",
    P_FROM_YEARPERIOD: "", // SAP YYYYPPP e.g. 2025001
    P_TO_YEARPERIOD: "",
    P_FROM_COMPYEARPERIOD: "",
    P_TO_COMPYEARPERIOD: "",
    // friendly inputs for user convenience:
    endYear: "",
    endMonth: "",
    compYear: "",
    compMonth: "",
    // extra simple filter fields (alias)
    CompanyCode: "",
    Ledger: "",
    FinancialStatementVariant: "",
  });

  const [odataUrl, setOdataUrl] = React.useState("");

  const resultsRef = React.useRef(null);

  const combinedEndPeriod = React.useMemo(() => {
    if (!params.endYear || !params.endMonth) return "";
    const m = String(params.endMonth).padStart(2, "0");
    return `${params.endYear}-${m}`;
  }, [params.endYear, params.endMonth]);

  const combinedCompPeriod = React.useMemo(() => {
    if (!params.compYear || !params.compMonth) return "";
    const m = String(params.compMonth).padStart(2, "0");
    return `${params.compYear}-${m}`;
  }, [params.compYear, params.compMonth]);

  // Fetch tree: send all P_* as query params (backend uses them)
  const fetchTree = React.useCallback(async () => {
    setLoadingData(true);
    setError("");
    setOdataUrl("");
    try {
      const qp = new URLSearchParams();

      // forward friendly + P_* fields; backend will use whichever provided
      Object.entries(params).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) {
          qp.set(k, String(v));
        }
      });

      const url = `${API_BASE}${API_PATH_TREE}${qp.toString() ? `?${qp.toString()}` : ""}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const json = await res.json();
      const raw = json.records || json.data || json || [];
      const transformed = transformFromBackend(raw);
      setDataTree(transformed);
      setFiltered({ data: transformed, expand: [] });
      setExpandedIds(flattenIds(transformed));

      if (json.odata_url) setOdataUrl(json.odata_url);
      else setOdataUrl("");
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoadingData(false);
    }
  }, [params]);

  React.useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  React.useEffect(() => {
    const res = searchTree(dataTree, query);
    setFiltered(res);
    if (query) setExpandedIds(res.expand);
  }, [query, dataTree]);

  const expandAll = () => setExpandedIds(flattenIds(dataTree));
  const collapseAll = () => setExpandedIds([]);
  const reset = () => {
    setQuery("");
    setFiltered({ data: dataTree, expand: [] });
    setSummary("");
    setColumnCount(0);
    setColumnList([]);
    setError("");
    setSnack("");
    setSelectedId(null);
    setTab("result");
    setExpandedIds(flattenIds(dataTree));
    setParams((p) => ({
      ...p,
      P_KTOPL: "0808",
      P_VERSN: "2000_DRAFT",
      P_BILABTYP: "1",
      P_XKTOP2: "",
      P_COMP_YEAR: "",
      P_YEAR: "",
      P_BUKRS: "0808",
      P_RLDNR: "0L",
      P_CURTP: "10",
      P_FROM_YEARPERIOD: "",
      P_TO_YEARPERIOD: "",
      P_FROM_COMPYEARPERIOD: "",
      P_TO_COMPYEARPERIOD: "",
      endYear: "",
      endMonth: "",
      compYear: "",
      compMonth: "",
      CompanyCode: "",
      Ledger: "",
      FinancialStatementVariant: "",
    }));
    setOdataUrl("");
  };

  const findById = React.useCallback(
    (id) => {
      if (!id) return null;
      const dfs = (nodes) => {
        for (const n of nodes) {
          if (String(n.id) === String(id)) return n;
          if (n.children) {
            const r = dfs(n.children);
            if (r) return r;
          }
        }
        return null;
      };
      return dfs(dataTree);
    },
    [dataTree]
  );

  const selectedNode = React.useMemo(() => findById(selectedId), [selectedId, findById]);

  const previewRecords = React.useMemo(() => {
    if (!selectedNode) return [];
    return scope === "subtree" ? collectSubtree(selectedNode) : [selectedNode];
  }, [selectedNode, scope]);

  const tableColumns = React.useMemo(() => uniqueKeys(previewRecords), [previewRecords]);

  // compute chart data from previewRecords
  const chartData = React.useMemo(() => {
    return previewRecords.map((r) => {
      const amount = Number((r.amount || "").replace(/[^0-9.-]+/g, "")) || 0;
      const comp = Number((r.comparison || "").replace(/[^0-9.-]+/g, "")) || 0;
      const diff = amount - comp; // signed difference
      return { name: r.name || r.id, diff, id: r.id };
    });
  }, [previewRecords]);

  const handleSummarize = async () => {
    if (!selectedNode) return setError("Click a row on the left to select it first.");
    setLoadingAction(true);
    setError("");
    setTab("result");

    try {
      const payload = {
        scope,
        nodes: previewRecords,
        filters: {
          CompanyCode: params.CompanyCode || null,
          Ledger: params.Ledger || null,
          FinancialStatementVariant: params.FinancialStatementVariant || null,
          endYear: params.endYear || null,
          endMonth: params.endMonth || null,
          compYear: params.compYear || null,
          compMonth: params.compMonth || null,
        },
      };

      const res = await fetch(`${API_BASE}${API_PATH_LLM}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const local = localSummary(previewRecords);
        setSummary(local + " (LLM call failed)");
        throw new Error(`LLM API failed: ${res.status}`);
      }

      const data = await res.json();
      setSummary(data.summary || "(No summary returned)");
      setSnack("Summary generated");
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCountColumns = async () => {
    if (!selectedNode) return setError("Click a row on the left to select it first.");
    setLoadingAction(true);
    setError("");
    setTab("result");

    try {
      const keys = uniqueKeys(previewRecords);
      setColumnCount(keys.length);
      setColumnList(keys);
      setSnack("Column count calculated");
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    } finally {
      setLoadingAction(false);
    }
  };

  // copy / open OData URL helpers
  const copyOdataUrl = async () => {
    if (!odataUrl) return;
    await navigator.clipboard.writeText(odataUrl);
    setSnack("OData URL copied");
  };
  const openOdataUrl = () => {
    if (!odataUrl) return;
    window.open(odataUrl, "_blank");
  };

  // helper to render many compact inputs (two-column grid on wide screens)
  const ParamInput = ({ name, label, ...rest }) => (
    <TextField
      size="small"
      label={label || name}
      value={params[name] ?? ""}
      onChange={(e) => setParams((s) => ({ ...s, [name]: e.target.value }))}
      InputProps={{ sx: { fontSize: 13 } }}
      sx={{ minWidth: 120, flex: "1 1 140px" }}
      {...rest}
    />
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        p: { xs: 1.5, sm: 2, md: 4 },
        bgcolor: "#f7f7fb",
      }}
    >
      <Card sx={{ width: "100%", maxWidth: { xs: 900, sm: 1200, md: 1400 }, borderRadius: 4, boxShadow: 6 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant={isSmall ? "h6" : "h5"} gutterBottom>
            Financial Statement Tree — SAP View + AI Actions
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
            Enter OData parameters below (all P_* fields are exposed). Click <b>Apply filters</b> to call the backend.
          </Typography>

          <Grid container spacing={2}>
            {/* LEFT: Tree */}
            <Grid item xs={12} md={6} lg={5}>
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
                <TextField
                  size="small"
                  placeholder={loadingData ? "Loading from backend…" : "Search (item/account/name)…"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, opacity: 0.7 }} /> }}
                  sx={{ flex: 1 }}
                  disabled={loadingData}
                />
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" startIcon={<UnfoldMoreIcon />} onClick={expandAll} disabled={loadingData}>
                    Expand
                  </Button>
                  <Button variant="outlined" startIcon={<UnfoldLessIcon />} onClick={collapseAll} disabled={loadingData}>
                    Collapse
                  </Button>
                  <Button variant="contained" onClick={reset} disabled={loadingData}>
                    Reset
                  </Button>
                </Stack>
              </Stack>

              <Divider sx={{ mb: 2 }} />

              <Box sx={{ minHeight: 360, /* allow the tree to grow; no internal big scroll */ overflowY: "auto", px: 0.5, bgcolor: alpha(theme.palette.primary.light, 0.02), borderRadius: 2 }}>
                {loadingData ? (
                  <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
                    <CircularProgress />
                    <Typography variant="body2" sx={{ mt: 1.5, color: "text.secondary" }}>Fetching from backend…</Typography>
                  </Stack>
                ) : (
                  <SimpleTreeView
                    slots={{ collapseIcon: ExpandMoreIcon, expandIcon: ChevronRightIcon }}
                    expandedItems={expandedIds}
                    onExpandedItemsChange={(_, ids) => setExpandedIds(ids.map(String))}
                    selectionMode="single"
                    selectedItems={selectedId ? [String(selectedId)] : []}
                    onSelectedItemsChange={(_, ids) => {
                      const id = Array.isArray(ids) ? ids[0] : ids;
                      setSelectedId(id ?? null);
                    }}
                    sx={{ "& .MuiTreeItem-content": { py: 0.25 } }}
                  >
                    {(query ? filtered.data : dataTree).map((node) => (
                      <RenderItem key={node.id} node={node} hoveredId={hoveredId} setHoveredId={setHoveredId} selectedId={selectedId} />
                    ))}
                  </SimpleTreeView>
                )}
              </Box>
            </Grid>

            {/* RIGHT: Advanced Params + Actions */}
            <Grid item xs={12} md={6} lg={7}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                {/* Advanced OData params laid out in responsive Grid */}
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Advanced OData parameters (P_* fields)</Typography>

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3,1fr)" }, gap: 10, mb: 1 }}>
                  <ParamInput name="P_KTOPL" label="P_KTOPL (Company code)" />
                  <ParamInput name="P_VERSN" label="P_VERSN (Statement version)" />
                  <ParamInput name="P_BILABTYP" label="P_BILABTYP" />
                  <ParamInput name="P_XKTOP2" label="P_XKTOP2" />
                  <ParamInput name="P_COMP_YEAR" label="P_COMP_YEAR" />
                  <ParamInput name="P_YEAR" label="P_YEAR (end year)" />
                  <ParamInput name="P_BUKRS" label="P_BUKRS" />
                  <ParamInput name="P_RLDNR" label="P_RLDNR (Ledger)" />
                  <ParamInput name="P_CURTP" label="P_CURTP (Currency code)" />
                  <ParamInput name="P_FROM_YEARPERIOD" label="P_FROM_YEARPERIOD (YYYYPPP)" />
                  <ParamInput name="P_TO_YEARPERIOD" label="P_TO_YEARPERIOD (YYYYPPP)" />
                  <ParamInput name="P_FROM_COMPYEARPERIOD" label="P_FROM_COMPYEARPERIOD" />
                  <ParamInput name="P_TO_COMPYEARPERIOD" label="P_TO_COMPYEARPERIOD" />
                </Box>

                <Divider sx={{ mb: 1 }} />

                <Typography variant="subtitle2" sx={{ mb: 1 }}>Convenience (friendly) fields</Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1 }}>
                  <TextField size="small" label="endYear (YYYY)" value={params.endYear} onChange={(e) => setParams(s => ({...s, endYear: e.target.value}))} sx={{ minWidth: 110 }} />
                  <TextField size="small" label="endMonth (1-12)" value={params.endMonth} onChange={(e) => setParams(s => ({...s, endMonth: e.target.value}))} sx={{ minWidth: 110 }} />
                  <TextField size="small" label="compYear" value={params.compYear} onChange={(e) => setParams(s => ({...s, compYear: e.target.value}))} sx={{ minWidth: 110 }} />
                  <TextField size="small" label="compMonth" value={params.compMonth} onChange={(e) => setParams(s => ({...s, compMonth: e.target.value}))} sx={{ minWidth: 110 }} />
                  <TextField size="small" label="CompanyCode (filter)" value={params.CompanyCode} onChange={(e) => setParams(s => ({...s, CompanyCode: e.target.value}))} sx={{ minWidth: 120 }} />
                  <TextField size="small" label="Ledger (filter)" value={params.Ledger} onChange={(e) => setParams(s => ({...s, Ledger: e.target.value}))} sx={{ minWidth: 110 }} />
                  <TextField size="small" label="FinancialStatementVariant" value={params.FinancialStatementVariant} onChange={(e) => setParams(s => ({...s, FinancialStatementVariant: e.target.value}))} sx={{ minWidth: 140 }} />
                </Box>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Button variant="contained" onClick={fetchTree} sx={{ minWidth: 140 }}>Apply filters</Button>
                  <Button variant="outlined" onClick={() => { setParams(p => ({...p, P_BILABTYP: "1", P_XKTOP2: "" })); setSnack("Bill typ reset to 1; XKTOP2 cleared"); }}>Reset P_BILABTYP/XKTOP2</Button>

                  <Box sx={{ flex: 1 }} />

                  {odataUrl && (
                    <>
                      <TextField size="small" value={odataUrl} sx={{ flex: 1 }} InputProps={{ readOnly: true }} />
                      <Tooltip title="Copy OData URL"><IconButton onClick={copyOdataUrl}><ContentCopyIcon /></IconButton></Tooltip>
                      <Tooltip title="Open OData URL"><IconButton onClick={openOdataUrl}><OpenInNewIcon /></IconButton></Tooltip>
                    </>
                  )}
                </Stack>

                <Divider sx={{ mb: 1 }} />

                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1">Actions</Typography>
                  <ToggleButtonGroup value={scope} exclusive onChange={(_, v) => v && setScope(v)} size="small" color="primary">
                    <ToggleButton value="node">Current node</ToggleButton>
                    <ToggleButton value="subtree">Subtree</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                  <Tooltip title="Call backend LLM to summarize selected scope">
                    <span>
                      <Button variant="contained" onClick={handleSummarize} disabled={!selectedNode || loadingAction}>
                        {loadingAction ? (<><CircularProgress size={18} sx={{ mr: 1 }} />Summarizing…</>) : ("Summarize")}
                      </Button>
                    </span>
                  </Tooltip>

                  <Tooltip title="Count distinct keys across selected scope (acts like columns)">
                    <span>
                      <Button variant="outlined" onClick={handleCountColumns} disabled={!selectedNode || loadingAction}>
                        Count Columns
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>

                <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
                  {selectedNode ? "Selected row payload:" : "Click a row on the left to enable actions."}
                </Typography>

                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "background.default", mb: 2 }}>
                  {selectedNode ? (
                    <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(flattenPayload(selectedNode), null, 2)}</pre>
                  ) : (
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>(no selection)</Typography>
                  )}
                </Paper>

                {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
                  <Tab value="result" label="Result" />
                  <Tab value="json" label="JSON" />
                  <Tab value="table" label="Preview Table" />
                  <Tab value="chart" label="Balance diff chart" />
                </Tabs>

                {/* RESULT TAB */}
                {tab === "result" && (
                  <Stack spacing={1.25}>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.info.light, 0.05) }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{summary || "(No summary yet)"}</Typography>
                        {summary && (
                          <IconButton size="small" onClick={() => { navigator.clipboard.writeText(summary); setSnack("Summary copied"); }}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="body2">Column count: <b>{columnCount}</b></Typography>
                        {!!columnList.length && (
                          <Button size="small" onClick={() => { navigator.clipboard.writeText(columnList.join(",")); setSnack("Column names copied"); }}>
                            Copy column names
                          </Button>
                        )}
                      </Stack>
                      {!!columnList.length && (
                        <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>{columnList.join(" · ")}</Typography>
                      )}
                    </Paper>
                  </Stack>
                )}

                {/* JSON TAB */}
                {tab === "json" && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "background.default" }}>
                    <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(previewRecords.map((r) => ({ ...r, children: undefined })), null, 2)}</pre>
                  </Paper>
                )}

                {/* TABLE TAB */}
                {tab === "table" && (
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          {tableColumns.map((col) => (
                            <TableCell key={col} sx={{ fontWeight: 700 }}>{col}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {previewRecords.map((row) => (
                          <TableRow key={row.id}>
                            {tableColumns.map((col) => (
                              <TableCell key={col}>{String(row[col] ?? "")}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {/* CHART TAB */}
                {tab === "chart" && (
                  <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                    {chartData.length === 0 ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>No data to plot. Select a node to preview its subtree.</Typography>
                    ) : (
                      <Box sx={{ width: '100%', height: 260 }}>
                        <ResponsiveContainer>
                          <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 20, left: 40, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={150} />
                            <ReTooltip formatter={(v) => new Intl.NumberFormat().format(v)} />
                            <Bar dataKey="diff" barSize={14}>
                              {chartData.map((entry) => (
                                <Cell key={entry.id} fill={entry.diff >= 0 ? '#4caf50' : '#f44336'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    )}
                  </Paper>
                )}
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Snackbar open={!!snack} autoHideDuration={2000} onClose={() => setSnack("")} message={snack} action={<IconButton size="small" color="inherit" onClick={() => setSnack("")}> <CloseIcon fontSize="small" /> </IconButton>} />
    </Box>
  );
}
