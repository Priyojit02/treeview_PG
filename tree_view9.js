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

// =================== API CONFIG ===================
const API_BASE = "http://127.0.0.1:8000";
const API_PATH_TREE = "/financial-statements";
const API_PATH_LLM = "/summarize_tree";

// =================== UTILS ===================
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

    const text = [
      node.name,
      node.code,
      node.account,
      node.itemText,
      node.amount,
      node.currency,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const match = text.includes(q);

    if (match || filteredKids.length) {
      return { ...node, children: filteredKids };
    }
    return null;
  };

  const filtered = nodes.map(filterNode).filter(Boolean);

  const expand = [];
  const collect = (n) => {
    if (n.children?.length) {
      expand.push(String(n.id));
      n.children.forEach(collect);
    }
  };
  filtered.forEach(collect);
  return { data: filtered, expand };
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
  const w = (n) => {
    out.push(n);
    (n.children || []).forEach(w);
  };
  if (root) w(root);
  return out;
};

const uniqueKeys = (records) => {
  const s = new Set();
  records.forEach((r) =>
    Object.keys(r).forEach((k) => k !== "children" && s.add(k))
  );
  return Array.from(s);
};

const localSummary = (records) => {
  if (!records.length) return "(no data)";
  const kinds = records.reduce((a, r) => {
    a[r.kind] = (a[r.kind] || 0) + 1;
    return a;
  }, {});
  const names = records
    .slice(0, 6)
    .map((r) => r.name)
    .join(", ");
  return (
    `Items: ${records.length}. Types: ` +
    Object.entries(kinds)
      .map(([k, c]) => `${k}:${c}`)
      .join(" | ") +
    `. Examples: ${names}...`
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

const mapNodeType = (t) => {
  if (t === "R") return "root";
  if (t === "P") return "group";
  return "leaf";
};

const bestName = (r) =>
  r.FinancialStatementItemText ||
  r.OperativeGLAccountName ||
  r.OperativeGLAccount ||
  r.FinancialStatementItem ||
  r.HierarchyNode;

const fmtAmount = (x) => (x == null ? "" : String(x));

const transformFromBackend = (records = []) => {
  const walk = (r) => ({
    id: r.HierarchyNode,
    kind: mapNodeType(r.NodeType),
    name: bestName(r),
    code: r.FinancialStatementItem,
    itemText: r.FinancialStatementItemText,
    account: r.OperativeGLAccount,
    accountName: r.OperativeGLAccountName,
    amount: fmtAmount(r.ReportingPeriodAmount),
    comparison: fmtAmount(r.ComparisonPeriodAmount),
    diffAbs: fmtAmount(r.AbsoluteDifferenceAmount),
    diffPct: fmtAmount(r.RelativeDifferencePercent),
    currency: r.Currency,
    level: r.FinStatementHierarchyLevelVal,
    children: (r.Children || []).map(walk),
  });
  return records.map(walk);
};

// =================== Tree Item ===================
function RenderItem({ node, hoveredId, setHoveredId, selectedId }) {
  const theme = useTheme();
  const kids = node.children || [];
  const colors = chipColorFor(node.kind, theme);

  return (
    <TreeItem
      itemId={String(node.id)}
      label={
        <Stack
          onMouseEnter={() => setHoveredId(node.id)}
          onMouseLeave={() => setHoveredId(null)}
          direction="row"
          spacing={1}
          alignItems="center"
        >
          {iconFor(node.kind)}
          <Stack direction="row" spacing={1}>
            <Typography fontWeight={600} variant="body2">
              {node.name}
            </Typography>
            {node.amount && (
              <Typography variant="caption" color="text.secondary">
                {node.amount} {node.currency}
              </Typography>
            )}
          </Stack>
          {kids.length > 0 && (
            <Chip
              label={kids.length}
              size="small"
              sx={{
                height: 18,
                bgcolor: colors.bg,
                color: colors.fg,
              }}
            />
          )}
        </Stack>
      }
      sx={{
        "& .MuiTreeItem-content": {
          borderRadius: 1,
          bgcolor:
            hoveredId === node.id
              ? alpha(theme.palette.primary.main, 0.06)
              : undefined,
        },
        "& .MuiTreeItem-group": {
          borderLeft: `1px dashed ${theme.palette.divider}`,
          ml: 1.5,
        },
      }}
    >
      {kids.map((c) => (
        <RenderItem
          key={c.id}
          node={c}
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
  const [expandedIds, setExpanded] = React.useState([]);
  const [dataTree, setDataTree] = React.useState([]);
  const [filtered, setFiltered] = React.useState({ data: [], expand: [] });
  const [selectedId, setSelectedId] = React.useState(null);

  const [loadingData, setLoadingData] = React.useState(false);
  const [loadingAction, setLoadingAction] = React.useState(false);

  const [tab, setTab] = React.useState("result");
  const [scope, setScope] = React.useState("subtree");

  const [summary, setSummary] = React.useState("");
  const [columnCount, setColumnCount] = React.useState(0);
  const [columnList, setColumnList] = React.useState([]);

  const [snack, setSnack] = React.useState("");
  const [error, setError] = React.useState("");

  // all params
  const [params, setParams] = React.useState({
    P_KTOPL: "0808",
    P_BUKRS: "0808",
    P_VERSN: "2000_DRAFT",
    P_BILABTYP: "1",
    P_XKTOP2: "",
    P_RLDNR: "0L", // editable
    P_CURTP: "10",
    P_COMP_YEAR: "",
    P_YEAR: "",
    P_FROM_YEARPERIOD: "",
    P_TO_YEARPERIOD: "",
    P_FROM_COMPYEARPERIOD: "",
    P_TO_COMPYEARPERIOD: "",
    endYear: "",
    endMonth: "",
    compYear: "",
    compMonth: "",
  });

  const [odataUrl, setOdataUrl] = React.useState("");

  // sync P_KTOPL => P_BUKRS
  const setCompany = (v) => {
    setParams((p) => ({
      ...p,
      P_KTOPL: v,
      P_BUKRS: v,
    }));
  };

  const normalizeMonth = (m) => {
    if (!m) return "";
    const n = parseInt(m);
    if (n < 1 || n > 12) return "";
    return String(n).padStart(2, "0");
  };

  // Fetch tree
  const fetchTree = async () => {
    setLoadingData(true);
    setError("");

    try {
      const qp = new URLSearchParams();
      const s = { ...params };

      // keep company sync
      s.P_BUKRS = s.P_KTOPL;

      // normalize months
      if (s.endMonth) s.endMonth = normalizeMonth(s.endMonth);
      if (s.compMonth) s.compMonth = normalizeMonth(s.compMonth);

      // hidden fixed fields
      s.P_BILABTYP = "1";
      s.P_XKTOP2 = "";

      Object.entries(s).forEach(([k, v]) => {
        if (v !== "") qp.set(k, v);
      });

      const url = `${API_BASE}${API_PATH_TREE}?${qp.toString()}`;
      setOdataUrl(url);

      const res = await fetch(url);
      if (!res.ok) throw new Error("Backend error");

      const json = await res.json();
      const raw = json.records || [];
      const tree = transformFromBackend(raw);

      setDataTree(tree);
      setFiltered({ data: tree, expand: [] });
      setExpanded(flattenIds(tree));
    } catch (e) {
      setError(String(e));
    }

    setLoadingData(false);
  };

  React.useEffect(() => {
    fetchTree();
  }, []);

  React.useEffect(() => {
    const r = searchTree(dataTree, query);
    setFiltered(r);
    if (query) setExpanded(r.expand);
  }, [query, dataTree]);

  const selectedNode = React.useMemo(() => {
    const dfs = (nodes) => {
      for (const n of nodes) {
        if (String(n.id) === String(selectedId)) return n;
        const r = dfs(n.children || []);
        if (r) return r;
      }
      return null;
    };
    return dfs(dataTree);
  }, [selectedId, dataTree]);

  const preview = React.useMemo(() => {
    if (!selectedNode) return [];
    return scope === "subtree" ? collectSubtree(selectedNode) : [selectedNode];
  }, [scope, selectedNode]);

  const handleSummarize = async () => {
    if (!selectedNode) return setError("Select a node first");
    setLoadingAction(true);
    setError("");

    try {
      const payload = {
        scope,
        nodes: preview,
      };

      const res = await fetch(`${API_BASE}${API_PATH_LLM}`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        setSummary(localSummary(preview));
        throw new Error("LLM failed");
      }

      const json = await res.json();
      setSummary(json.summary);
    } catch (e) {
      setError(String(e));
    }

    setLoadingAction(false);
  };

  const handleCount = () => {
    const keys = uniqueKeys(preview);
    setColumnCount(keys.length);
    setColumnList(keys);
  };

  // FULL LAYOUT START
  return (
    <Box sx={{ p: 3, bgcolor: "#f5f5f7", minHeight: "100vh" }}>
      <Card sx={{ maxWidth: 1600, mx: "auto", p: 2, borderRadius: 4 }}>
        <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
          SAP Financial Statement Viewer
        </Typography>

        {/* -------- PARAMETERS UI -------- */}
        <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            OData Parameters
          </Typography>

          {/* ---- Row 1 ---- */}
          <Grid container spacing={2} sx={{ mb: 1 }}>
            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="P_KTOPL (Company Code)"
                value={params.P_KTOPL}
                onChange={(e) => setCompany(e.target.value)}
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="P_VERSN"
                value={params.P_VERSN}
                onChange={(e) =>
                  setParams((p) => ({ ...p, P_VERSN: e.target.value }))
                }
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="P_RLDNR (Ledger)"
                value={params.P_RLDNR}
                onChange={(e) =>
                  setParams((p) => ({ ...p, P_RLDNR: e.target.value }))
                }
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="P_CURTP (Currency)"
                value={params.P_CURTP}
                onChange={(e) =>
                  setParams((p) => ({ ...p, P_CURTP: e.target.value }))
                }
              />
            </Grid>
          </Grid>

          {/* ---- Row 2 ---- */}
          <Grid container spacing={2} sx={{ mb: 1 }}>
            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="endYear (YYYY)"
                value={params.endYear}
                onChange={(e) =>
                  setParams((p) => ({ ...p, endYear: e.target.value }))
                }
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="endMonth (1-12)"
                value={params.endMonth}
                onChange={(e) =>
                  setParams((p) => ({ ...p, endMonth: e.target.value }))
                }
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="compYear"
                value={params.compYear}
                onChange={(e) =>
                  setParams((p) => ({ ...p, compYear: e.target.value }))
                }
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="compMonth"
                value={params.compMonth}
                onChange={(e) =>
                  setParams((p) => ({ ...p, compMonth: e.target.value }))
                }
              />
            </Grid>
          </Grid>

          {/* ---- Row 3 ---- */}
          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="P_FROM_YEARPERIOD"
                value={params.P_FROM_YEARPERIOD}
                onChange={(e) =>
                  setParams((p) => ({ ...p, P_FROM_YEARPERIOD: e.target.value }))
                }
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="P_TO_YEARPERIOD"
                value={params.P_TO_YEARPERIOD}
                onChange={(e) =>
                  setParams((p) => ({ ...p, P_TO_YEARPERIOD: e.target.value }))
                }
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="P_FROM_COMPYEARPERIOD"
                value={params.P_FROM_COMPYEARPERIOD}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    P_FROM_COMPYEARPERIOD: e.target.value,
                  }))
                }
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="P_TO_COMPYEARPERIOD"
                value={params.P_TO_COMPYEARPERIOD}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    P_TO_COMPYEARPERIOD: e.target.value,
                  }))
                }
              />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button variant="contained" onClick={fetchTree}>
              Apply Filters
            </Button>

            {odataUrl && (
              <>
                <TextField
                  size="small"
                  value={odataUrl}
                  sx={{ flex: 1 }}
                  InputProps={{ readOnly: true }}
                />
                <Tooltip title="Copy URL">
                  <IconButton
                    onClick={() => {
                      navigator.clipboard.writeText(odataUrl);
                      setSnack("Copied");
                    }}
                  >
                    <ContentCopyIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Open URL">
                  <IconButton onClick={() => window.open(odataUrl, "_blank")}>
                    <OpenInNewIcon />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Stack>
        </Paper>

        {/* -------- TREE VIEW BELOW -------- */}
        <Paper sx={{ p: 2, borderRadius: 3 }}>
          <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
            <TextField
              size="small"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <SearchIcon sx={{ mr: 1, opacity: 0.7 }} />
                ),
              }}
              sx={{ flex: 1 }}
            />

            <Button onClick={() => setExpanded(flattenIds(dataTree))}>
              Expand
            </Button>
            <Button onClick={() => setExpanded([])}>Collapse</Button>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ maxHeight: 450, overflowY: "auto" }}>
            <SimpleTreeView
              expandedItems={expandedIds}
              onExpandedItemsChange={(_, ids) => setExpanded(ids)}
              selectedItems={selectedId ? [String(selectedId)] : []}
              onSelectedItemsChange={(_, ids) =>
                setSelectedId(ids[0] || null)
              }
              slots={{ collapseIcon: ExpandMoreIcon, expandIcon: ChevronRightIcon }}
            >
              {(query ? filtered.data : dataTree).map((n) => (
                <RenderItem
                  key={n.id}
                  node={n}
                  hoveredId={null}
                  setHoveredId={() => {}}
                  selectedId={selectedId}
                />
              ))}
            </SimpleTreeView>
          </Box>
        </Paper>

        {/* -------- ACTIONS -------- */}
        <Paper sx={{ p: 2, mt: 2, borderRadius: 3 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="subtitle1">Actions</Typography>
            <ToggleButtonGroup
              value={scope}
              exclusive
              onChange={(_, v) => v && setScope(v)}
            >
              <ToggleButton value="node">Node</ToggleButton>
              <ToggleButton value="subtree">Subtree</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <Button
              variant="contained"
              disabled={!selectedNode || loadingAction}
              onClick={handleSummarize}
            >
              Summarize
            </Button>

            <Button variant="outlined" onClick={handleCount}>
              Count Columns
            </Button>
          </Stack>

          {selectedNode && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: "background.default",
                mt: 2,
              }}
            >
              <pre style={{ margin: 0, fontSize: 12 }}>
                {JSON.stringify(flattenPayload(selectedNode), null, 2)}
              </pre>
            </Paper>
          )}
        </Paper>

        {/* -------- TABS -------- */}
        <Paper sx={{ mt: 2, p: 2, borderRadius: 3 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab value="result" label="Result" />
            <Tab value="json" label="JSON" />
            <Tab value="table" label="Table" />
            <Tab value="chart" label="Chart" />
          </Tabs>

          {/* RESULT */}
          {tab === "result" && (
            <Paper sx={{ mt: 2, p: 2, borderRadius: 2 }}>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {summary || "(No summary)"}
              </Typography>
            </Paper>
          )}

          {/* JSON */}
          {tab === "json" && (
            <Paper sx={{ mt: 2, p: 2, borderRadius: 2 }}>
              <pre style={{ margin: 0, fontSize: 12 }}>
                {JSON.stringify(
                  preview.map((r) => ({ ...r, children: undefined })),
                  null,
                  2
                )}
              </pre>
            </Paper>
          )}

          {/* TABLE */}
          {tab === "table" && (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {uniqueKeys(preview).map((k) => (
                      <TableCell key={k}>{k}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.map((row) => (
                    <TableRow key={row.id}>
                      {uniqueKeys(preview).map((k) => (
                        <TableCell key={k}>{String(row[k] || "")}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* CHART */}
          {tab === "chart" && (
            <Paper sx={{ mt: 2, height: 260 }}>
              <ResponsiveContainer>
                <BarChart
                  data={preview.map((r) => ({
                    name: r.name,
                    diff:
                      Number(r.amount || 0) -
                      Number(r.comparison || 0),
                  }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={120} />
                  <ReTooltip />
                  <Bar dataKey="diff">
                    {preview.map((row, i) => (
                      <Cell
                        key={i}
                        fill={
                          (Number(row.amount || 0) -
                            Number(row.comparison || 0)) >= 0
                            ? "#4caf50"
                            : "#f44336"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          )}
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Snackbar
          open={!!snack}
          autoHideDuration={2000}
          onClose={() => setSnack("")}
          message={snack}
          action={
            <IconButton size="small" onClick={() => setSnack("")}>
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        />
      </Card>
    </Box>
  );
}
