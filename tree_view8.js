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

// ------------- API CONFIG -------------
const API_BASE = "http://127.0.0.1:8000";
const API_PATH_TREE = "/financial-statements";
const API_PATH_LLM = "/summarize_tree";

// ------------- Utils (kept small) -------------
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
    `Types: ${Object.entries(kinds).map(([t, c]) => `${t}:${c}`).join(" | ")}. ` +
    `Columns: ${keys}. ` +
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

// ------------- Tree item renderer -------------
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
            boxShadow: `inset 0 0 0 2px ${alpha(theme.palette.primary.main, 0.35)}`,
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

// ------------- MAIN APP -------------
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
  const [scope, setScope] = React.useState("subtree");

  const [summary, setSummary] = React.useState("");
  const [columnCount, setColumnCount] = React.useState(0);
  const [columnList, setColumnList] = React.useState([]);

  const [snack, setSnack] = React.useState("");
  const [error, setError] = React.useState("");

  // params: visible fields are compact; hidden/defaults applied before calling backend
  const [params, setParams] = React.useState({
    CompanyCode: "0808", // visible, drives P_KTOPL and P_BUKRS
    P_VERSN: "2000_DRAFT",
    // P_BILABTYP and P_XKTOP2 are hidden and forced below
    // P_RLDNR hidden (ledger default)
    endYear: "",
    endMonth: "",
    compYear: "",
    compMonth: "",
    P_CURTP: "10",
    // optional manual SAP style overrides (YYYYPPP)
    P_FROM_YEARPERIOD: "",
    P_TO_YEARPERIOD: "",
    P_FROM_COMPYEARPERIOD: "",
    P_TO_COMPYEARPERIOD: "",
  });

  const [odataUrl, setOdataUrl] = React.useState("");

  const resultsRef = React.useRef(null);

  // Compose friendly periods for display/preview (not required to send because we send both friendly & P_ fields)
  const normalizeMonth = (m) => {
    if (!m && m !== 0) return "";
    const mm = String(m).replace(/^0+/, "") || m; // allow "01" or "1"
    const iv = parseInt(mm, 10);
    if (Number.isNaN(iv)) return "";
    if (iv < 1 || iv > 12) return "";
    return String(iv).padStart(2, "0");
  };

  // Build query and call backend
  const fetchTree = React.useCallback(async () => {
    setLoadingData(true);
    setError("");
    setOdataUrl("");
    try {
      const qp = new URLSearchParams();

      // Hidden/default mappings:
      // P_BILABTYP = "1", P_XKTOP2 = "" (hidden)
      // P_RLDNR (ledger) default to "0L" (hidden)
      // P_KTOPL and P_BUKRS come from CompanyCode
      const company = (params.CompanyCode || "").trim();
      if (company) {
        qp.set("P_KTOPL", company);
        qp.set("P_BUKRS", company);
      }

      // explicit visible params
      if (params.P_VERSN) qp.set("P_VERSN", params.P_VERSN);
      if (params.P_CURTP) qp.set("P_CURTP", params.P_CURTP);

      // optional manual SAP-style fields (if user wants to override)
      if (params.P_FROM_YEARPERIOD) qp.set("P_FROM_YEARPERIOD", params.P_FROM_YEARPERIOD);
      if (params.P_TO_YEARPERIOD) qp.set("P_TO_YEARPERIOD", params.P_TO_YEARPERIOD);
      if (params.P_FROM_COMPYEARPERIOD) qp.set("P_FROM_COMPYEARPERIOD", params.P_FROM_COMPYEARPERIOD);
      if (params.P_TO_COMPYEARPERIOD) qp.set("P_TO_COMPYEARPERIOD", params.P_TO_COMPYEARPERIOD);

      // friendly fields (backend will compute SAP period if present)
      if (params.endYear) qp.set("endYear", params.endYear);
      if (params.endMonth) qp.set("endMonth", normalizeMonth(params.endMonth));
      if (params.compYear) qp.set("compYear", params.compYear);
      if (params.compMonth) qp.set("compMonth", normalizeMonth(params.compMonth));

      // forced hidden values (explicitly send so backend receives them)
      qp.set("P_BILABTYP", "1");
      qp.set("P_XKTOP2", ""); // empty
      qp.set("P_RLDNR", "0L"); // default ledger

      // call backend
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
      else setOdataUrl(url); // if backend didn't return odata_url, show the requested URL for debugging
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
      CompanyCode: "0808",
      P_VERSN: "2000_DRAFT",
      endYear: "",
      endMonth: "",
      compYear: "",
      compMonth: "",
      P_CURTP: "10",
      P_FROM_YEARPERIOD: "",
      P_TO_YEARPERIOD: "",
      P_FROM_COMPYEARPERIOD: "",
      P_TO_COMPYEARPERIOD: "",
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

  // chart data
  const chartData = React.useMemo(() => {
    return previewRecords.map((r) => {
      const amount = Number((r.amount || "").replace(/[^0-9.-]+/g, "")) || 0;
      const comp = Number((r.comparison || "").replace(/[^0-9.-]+/g, "")) || 0;
      const diff = amount - comp;
      return { name: r.name || r.id, diff, id: r.id };
    });
  }, [previewRecords]);

  // LLM call
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
          P_VERSN: params.P_VERSN || null,
          endYear: params.endYear || null,
          endMonth: params.endMonth ? normalizeMonth(params.endMonth) : null,
          compYear: params.compYear || null,
          compMonth: params.compMonth ? normalizeMonth(params.compMonth) : null,
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

  const copyOdataUrl = async () => {
    if (!odataUrl) return;
    await navigator.clipboard.writeText(odataUrl);
    setSnack("OData URL copied");
  };
  const openOdataUrl = () => {
    if (!odataUrl) return;
    window.open(odataUrl, "_blank");
  };

  // small param input helper (compact)
  const ParamInput = ({ name, label, xs = 4 }) => (
    <TextField
      size="small"
      label={label || name}
      value={params[name] ?? ""}
      onChange={(e) => setParams((s) => ({ ...s, [name]: e.target.value }))}
      InputProps={{ sx: { fontSize: 13 } }}
      sx={{ minWidth: 120, flex: `1 1 ${100 / xs}%` }}
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
            Compact OData parameter editor. Fill inputs below and click <b>Apply filters</b>. Hidden defaults: P_BILABTYP=1, P_XKTOP2 empty, ledger="0L".
          </Typography>

          <Grid container spacing={2}>
            {/* LEFT: tree */}
            <Grid item xs={12} md={6} lg={5}>
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
                <TextField
                  size="small"
                  placeholder={loadingData ? "Loading…" : "Search (item/account/name) …"}
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

              <Box sx={{ minHeight: 360, overflowY: "auto", px: 0.5, bgcolor: alpha(theme.palette.primary.light, 0.02), borderRadius: 2 }}>
                {loadingData ? (
                  <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
                    <CircularProgress />
                    <Typography variant="body2" sx={{ mt: 1.5, color: "text.secondary" }}>
                      Fetching from backend…
                    </Typography>
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

            {/* RIGHT: compact params + actions */}
            <Grid item xs={12} md={6} lg={7}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                {/* Row-group 1 (Company + Version + CURTP) */}
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                  <TextField
                    size="small"
                    label="CompanyCode (P_KTOPL / P_BUKRS)"
                    value={params.CompanyCode}
                    onChange={(e) => setParams((s) => ({ ...s, CompanyCode: e.target.value }))}
                    sx={{ minWidth: 140, flex: "1 1 160px" }}
                  />
                  <TextField
                    size="small"
                    label="Statement version (P_VERSN)"
                    value={params.P_VERSN}
                    onChange={(e) => setParams((s) => ({ ...s, P_VERSN: e.target.value }))}
                    sx={{ minWidth: 140, flex: "1 1 160px" }}
                  />
                  <TextField
                    size="small"
                    label="Currency code (P_CURTP)"
                    value={params.P_CURTP}
                    onChange={(e) => setParams((s) => ({ ...s, P_CURTP: e.target.value }))}
                    sx={{ minWidth: 100, flex: "1 1 120px" }}
                    placeholder="e.g. 10"
                  />
                </Box>

                {/* Row-group 2 (friendly end/comparison) */}
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                  <TextField
                    size="small"
                    label="endYear (YYYY)"
                    value={params.endYear}
                    onChange={(e) => setParams((s) => ({ ...s, endYear: e.target.value }))}
                    sx={{ minWidth: 110, flex: "1 1 110px" }}
                    placeholder="2025"
                  />
                  <TextField
                    size="small"
                    label="endMonth (1-12)"
                    value={params.endMonth}
                    onChange={(e) => setParams((s) => ({ ...s, endMonth: e.target.value }))}
                    sx={{ minWidth: 110, flex: "1 1 110px" }}
                    placeholder="1"
                  />
                  <TextField
                    size="small"
                    label="compYear"
                    value={params.compYear}
                    onChange={(e) => setParams((s) => ({ ...s, compYear: e.target.value }))}
                    sx={{ minWidth: 110, flex: "1 1 110px" }}
                    placeholder="2024"
                  />
                  <TextField
                    size="small"
                    label="compMonth (1-12)"
                    value={params.compMonth}
                    onChange={(e) => setParams((s) => ({ ...s, compMonth: e.target.value }))}
                    sx={{ minWidth: 110, flex: "1 1 110px" }}
                    placeholder="1"
                  />
                </Box>

                {/* Row-group 3 (manual SAP period overrides) */}
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                  <TextField
                    size="small"
                    label="P_FROM_YEARPERIOD (YYYYPPP)"
                    value={params.P_FROM_YEARPERIOD}
                    onChange={(e) => setParams((s) => ({ ...s, P_FROM_YEARPERIOD: e.target.value }))}
                    sx={{ minWidth: 140, flex: "1 1 160px" }}
                    placeholder="2025001"
                  />
                  <TextField
                    size="small"
                    label="P_TO_YEARPERIOD (YYYYPPP)"
                    value={params.P_TO_YEARPERIOD}
                    onChange={(e) => setParams((s) => ({ ...s, P_TO_YEARPERIOD: e.target.value }))}
                    sx={{ minWidth: 140, flex: "1 1 160px" }}
                    placeholder="2025010"
                  />
                  <TextField
                    size="small"
                    label="P_FROM_COMPYEARPERIOD"
                    value={params.P_FROM_COMPYEARPERIOD}
                    onChange={(e) => setParams((s) => ({ ...s, P_FROM_COMPYEARPERIOD: e.target.value }))}
                    sx={{ minWidth: 140, flex: "1 1 160px" }}
                    placeholder="2024001"
                  />
                  <TextField
                    size="small"
                    label="P_TO_COMPYEARPERIOD"
                    value={params.P_TO_COMPYEARPERIOD}
                    onChange={(e) => setParams((s) => ({ ...s, P_TO_COMPYEARPERIOD: e.target.value }))}
                    sx={{ minWidth: 140, flex: "1 1 160px" }}
                    placeholder="2024010"
                  />
                </Box>

                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Button variant="contained" onClick={fetchTree} sx={{ minWidth: 140 }}>
                    Apply filters
                  </Button>

                  <Button
                    variant="outlined"
                    onClick={() => {
                      // reset the hidden defaults only if needed
                      setParams((p) => ({ ...p, P_BILABTYP: "1", P_XKTOP2: "" }));
                      setSnack("Hidden defaults applied (P_BILABTYP=1, P_XKTOP2 cleared)");
                    }}
                  >
                    Reset hidden defaults
                  </Button>

                  <Box sx={{ flex: 1 }} />

                  {odataUrl && (
                    <>
                      <TextField size="small" value={odataUrl} sx={{ flex: 1 }} InputProps={{ readOnly: true }} />
                      <Tooltip title="Copy OData URL">
                        <IconButton onClick={copyOdataUrl}>
                          <ContentCopyIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Open OData URL">
                        <IconButton onClick={openOdataUrl}>
                          <OpenInNewIcon />
                        </IconButton>
                      </Tooltip>
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
                        {loadingAction ? (
                          <>
                            <CircularProgress size={18} sx={{ mr: 1 }} />
                            Summarizing…
                          </>
                        ) : (
                          "Summarize"
                        )}
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
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                      (no selection)
                    </Typography>
                  )}
                </Paper>

                {error && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    {error}
                  </Alert>
                )}

                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
                  <Tab value="result" label="Result" />
                  <Tab value="json" label="JSON" />
                  <Tab value="table" label="Preview Table" />
                  <Tab value="chart" label="Balance diff chart" />
                </Tabs>

                {tab === "result" && (
                  <Stack spacing={1.25}>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.info.light, 0.05) }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                          {summary || "(No summary yet)"}
                        </Typography>
                        {summary && (
                          <IconButton
                            size="small"
                            onClick={() => {
                              navigator.clipboard.writeText(summary);
                              setSnack("Summary copied");
                            }}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="body2">
                          Column count: <b>{columnCount}</b>
                        </Typography>
                        {!!columnList.length && (
                          <Button
                            size="small"
                            onClick={() => {
                              navigator.clipboard.writeText(columnList.join(","));
                              setSnack("Column names copied");
                            }}
                          >
                            Copy column names
                          </Button>
                        )}
                      </Stack>
                      {!!columnList.length && (
                        <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
                          {columnList.join(" · ")}
                        </Typography>
                      )}
                    </Paper>
                  </Stack>
                )}

                {tab === "json" && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "background.default" }}>
                    <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(previewRecords.map((r) => ({ ...r, children: undefined })), null, 2)}</pre>
                  </Paper>
                )}

                {tab === "table" && (
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>{tableColumns.map((col) => <TableCell key={col} sx={{ fontWeight: 700 }}>{col}</TableCell>)}</TableRow>
                      </TableHead>
                      <TableBody>
                        {previewRecords.map((row) => (
                          <TableRow key={row.id}>{tableColumns.map((col) => <TableCell key={col}>{String(row[col] ?? "")}</TableCell>)}</TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {tab === "chart" && (
                  <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                    {chartData.length === 0 ? (
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        No data to plot. Select a node to preview its subtree.
                      </Typography>
                    ) : (
                      <Box sx={{ width: "100%", height: 260 }}>
                        <ResponsiveContainer>
                          <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 20, left: 40, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={150} />
                            <ReTooltip formatter={(v) => new Intl.NumberFormat().format(v)} />
                            <Bar dataKey="diff" barSize={14}>
                              {chartData.map((entry) => <Cell key={entry.id} fill={entry.diff >= 0 ? "#4caf50" : "#f44336"} />)}
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

      <Snackbar open={!!snack} autoHideDuration={2000} onClose={() => setSnack("")} message={snack} action={<IconButton size="small" color="inherit" onClick={() => setSnack("")}><CloseIcon fontSize="small" /></IconButton>} />
    </Box>
  );
}
