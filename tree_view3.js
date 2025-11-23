// =============================
// FULL FRONTEND — App.jsx
// =============================

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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";

import { alpha, useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SearchIcon from "@mui/icons-material/Search";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CloseIcon from "@mui/icons-material/Close";

import { SimpleTreeView, TreeItem } from "@mui/x-tree-view";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer
} from "recharts";

// ----------------------------
// API CONFIG
// ----------------------------

const API_BASE = "http://127.0.0.1:8000"; 
const API_PATH_TREE = "/financial-statements";
const API_PATH_LLM = "/summarize_tree";

// ----------------------------
// Utility Functions
// ----------------------------

const flattenIds = (nodes) => {
  const out = [];
  const walk = (n) => {
    out.push(String(n.id));
    (n.children || []).forEach(walk);
  };
  (nodes || []).forEach(walk);
  return out;
};

const searchTree = (nodes, q) => {
  if (!q) return { data: nodes, expand: [] };
  q = q.toLowerCase();

  const filterNode = (node) => {
    const children = node.children || [];
    const filtered = children.map(filterNode).filter(Boolean);

    const hay =
      [
        node.name,
        node.code,
        node.account,
        node.itemText,
        node.amount
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    if (hay.includes(q) || filtered.length) {
      return { ...node, children: filtered };
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

const collectSubtree = (root) => {
  const out = [];
  const walk = (n) => {
    out.push(n);
    (n.children || []).forEach(walk);
  };
  walk(root);
  return out;
};

const uniqueKeys = (records) => {
  const s = new Set();
  records.forEach(r =>
    Object.keys(r).forEach(k => {
      if (k !== "children") s.add(k);
    })
  );
  return [...s];
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

// Map SAP NodeType → kind
const mapNodeType = (x) => {
  if (x === "R") return "root";
  if (x === "P") return "group";
  return "leaf";
};

const bestName = (r) =>
  r.FinancialStatementItemText ||
  r.OperativeGLAccountName ||
  r.OperativeGLAccount ||
  r.FinancialStatementItem ||
  r.HierarchyNode;

const fmt = (x) => (x == null ? "" : String(x));

const transformFromBackend = (records = []) =>
  records.map((r) => ({
    id: r.HierarchyNode,
    kind: mapNodeType(r.NodeType),
    name: bestName(r),
    code: r.FinancialStatementItem || "",
    account: r.OperativeGLAccount || "",
    itemText: r.FinancialStatementItemText || "",
    amount: fmt(r.ReportingPeriodAmount),
    comparison: fmt(r.ComparisonPeriodAmount),
    diffAbs: fmt(r.AbsoluteDifferenceAmount),
    diffPct: fmt(r.RelativeDifferencePercent),
    currency: r.Currency || "",
    children: transformFromBackend(r.Children || []),
  }));

// ----------------------------
// Tree Item
// ----------------------------

function RenderItem({ node, selectedId, hoveredId, setHoveredId }) {
  const theme = useTheme();
  const kids = node.children || [];

  return (
    <TreeItem
      key={node.id}
      itemId={String(node.id)}
      label={
        <Stack
          direction="row"
          spacing={1}
          onMouseEnter={() => setHoveredId(node.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          <Typography fontWeight={700}>{node.name}</Typography>
          {node.amount && (
            <Typography variant="caption" color="text.secondary">
              {node.amount} {node.currency}
            </Typography>
          )}
          {kids.length > 0 && (
            <Chip size="small" label={kids.length} sx={{ height: 20 }} />
          )}
        </Stack>
      }
      sx={{
        "& .MuiTreeItem-content": {
          borderRadius: 1,
          backgroundColor:
            selectedId === node.id
              ? alpha(theme.palette.primary.main, 0.15)
              : hoveredId === node.id
              ? alpha(theme.palette.primary.main, 0.06)
              : "transparent",
        },
        "& .MuiTreeItem-group": {
          marginLeft: 1.5,
          borderLeft: `1px dashed ${theme.palette.divider}`,
        },
      }}
    >
      {kids.map((c) => (
        <RenderItem
          key={c.id}
          node={c}
          selectedId={selectedId}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
        />
      ))}
    </TreeItem>
  );
}

// ----------------------------
// MAIN APP
// ----------------------------

export default function App() {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));

  const [query, setQuery] = React.useState("");
  const [filters, setFilters] = React.useState({
    statementVersion: "",
    statementType: "",
    endPeriodMonth: "",
    endPeriodYear: "",
    compMonth: "",
    compYear: "",
    currency: "",
  });

  const [dataTree, setDataTree] = React.useState([]);
  const [filtered, setFiltered] = React.useState({ data: [], expand: [] });
  const [expandedIds, setExpandedIds] = React.useState([]);

  const [loadingData, setLoadingData] = React.useState(false);
  const [loadingAction, setLoadingAction] = React.useState(false);

  const [selectedId, setSelectedId] = React.useState(null);
  const [hoveredId, setHoveredId] = React.useState(null);

  const [scope, setScope] = React.useState("subtree");
  const [tab, setTab] = React.useState("result");

  const [summary, setSummary] = React.useState("");
  const [columnCount, setColumnCount] = React.useState(0);
  const [columnList, setColumnList] = React.useState([]);
  const [snack, setSnack] = React.useState("");
  const [error, setError] = React.useState("");

  // ----------------------------
  // FETCH TREE (WITH COMBINED YYYY-MM FILTERS)
  // ----------------------------

  const fetchTree = React.useCallback(async () => {
    setLoadingData(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (filters.statementVersion)
        params.set("statementVersion", filters.statementVersion);

      if (filters.statementType)
        params.set("statementType", filters.statementType);

      if (filters.currency) params.set("currency", filters.currency);

      if (filters.endPeriodYear && filters.endPeriodMonth) {
        const m = String(filters.endPeriodMonth).padStart(2, "0");
        params.set("endPeriod", `${filters.endPeriodYear}-${m}`);
      }

      if (filters.compYear && filters.compMonth) {
        const m = String(filters.compMonth).padStart(2, "0");
        params.set("comparisonEndPeriod", `${filters.compYear}-${m}`);
      }

      const url = `${API_BASE}${API_PATH_TREE}?${params.toString()}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const raw = json.records || json.data || json || [];
      const transformed = transformFromBackend(raw);

      setDataTree(transformed);
      setFiltered({ data: transformed, expand: [] });
      setExpandedIds(flattenIds(transformed));
    } catch (e) {
      setError(String(e.message));
    } finally {
      setLoadingData(false);
    }
  }, [filters]);

  // Fetch initial data (no filters)
  React.useEffect(() => {
    fetchTree();
  }, []);

  // Apply search filtering
  React.useEffect(() => {
    const r = searchTree(dataTree, query);
    setFiltered(r);
    if (query) setExpandedIds(r.expand);
  }, [query, dataTree]);

  // Helper: find selected node
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

  const selectedNode = React.useMemo(
    () => findById(selectedId),
    [selectedId, findById]
  );

  const previewRecords = React.useMemo(() => {
    if (!selectedNode) return [];
    return scope === "subtree"
      ? collectSubtree(selectedNode)
      : [selectedNode];
  }, [selectedNode, scope]);

  const tableColumns = React.useMemo(
    () => uniqueKeys(previewRecords),
    [previewRecords]
  );

  // ----------------------------
  // Summarize Button
  // ----------------------------

  const handleSummarize = async () => {
    if (!selectedNode) {
      setError("Select a node first.");
      return;
    }
    setLoadingAction(true);
    setError("");

    const payload = {
      scope,
      nodes: previewRecords.map(n => ({ ...n, children: undefined })),
      filters: {
        statementVersion: filters.statementVersion,
        statementType: filters.statementType,
        currency: filters.currency,
        endPeriod:
          filters.endPeriodYear && filters.endPeriodMonth
            ? `${filters.endPeriodYear}-${String(filters.endPeriodMonth).padStart(2, "0")}`
            : null,
        comparisonEndPeriod:
          filters.compYear && filters.compMonth
            ? `${filters.compYear}-${String(filters.compMonth).padStart(2, "0")}`
            : null,
      },
    };

    try {
      const res = await fetch(`${API_BASE}${API_PATH_LLM}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setSummary(data.summary || "(No summary)");
    } catch (e) {
      setError(String(e.message));
    } finally {
      setLoadingAction(false);
    }
  };

  // ----------------------------
  // Column Count
  // ----------------------------

  const handleCountColumns = () => {
    if (!selectedNode) {
      setError("Select a node first.");
      return;
    }
    const cols = uniqueKeys(previewRecords);
    setColumnCount(cols.length);
    setColumnList(cols);
    setSnack("Column names copied");
  };

  // ----------------------------
  // Chart Data
  // ----------------------------

  const chartData = React.useMemo(() => {
    return previewRecords
      .map((r) => ({
        id: r.id,
        name: r.name?.slice(0, 15),
        diff: parseFloat(r.diffAbs || 0),
      }))
      .filter((x) => !isNaN(x.diff));
  }, [previewRecords]);

  // ----------------------------
  // UI
  // ----------------------------

  return (
    <Box sx={{ p: 3, bgcolor: "#f7f7f7", minHeight: "100vh" }}>
      <Card sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Financial Statement Tree — SAP Style Filters + AI Actions
        </Typography>

        <Grid container spacing={2}>
          {/* ---------------- FILTER PANEL ---------------- */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, borderRadius: 2 }} elevation={1}>
              <Typography fontWeight={600} sx={{ mb: 1 }}>
                Filters
              </Typography>

              {/* Statement Version */}
              <TextField
                fullWidth
                size="small"
                label="Statement Version"
                value={filters.statementVersion}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, statementVersion: e.target.value }))
                }
                sx={{ mb: 1.5 }}
              />

              {/* Statement Type */}
              <TextField
                fullWidth
                size="small"
                label="Statement Type"
                value={filters.statementType}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, statementType: e.target.value }))
                }
                sx={{ mb: 1.5 }}
              />

              {/* End Period — Month + Year */}
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                End Period:
              </Typography>

              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <FormControl size="small" sx={{ width: 80 }}>
                  <InputLabel>Month</InputLabel>
                  <Select
                    label="Month"
                    value={filters.endPeriodMonth}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        endPeriodMonth: e.target.value,
                      }))
                    }
                  >
                    {[...Array(12)].map((_, i) => (
                      <MenuItem key={i + 1} value={i + 1}>
                        {i + 1}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  size="small"
                  sx={{ width: 90 }}
                  label="Year"
                  value={filters.endPeriodYear}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      endPeriodYear: e.target.value,
                    }))
                  }
                />
              </Stack>

              {/* Comparison Period — Month + Year */}
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Comparison End Period:
              </Typography>

              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <FormControl size="small" sx={{ width: 80 }}>
                  <InputLabel>Month</InputLabel>
                  <Select
                    label="Month"
                    value={filters.compMonth}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, compMonth: e.target.value }))
                    }
                  >
                    {[...Array(12)].map((_, i) => (
                      <MenuItem key={i + 1} value={i + 1}>
                        {i + 1}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  size="small"
                  sx={{ width: 90 }}
                  label="Year"
                  value={filters.compYear}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, compYear: e.target.value }))
                  }
                />
              </Stack>

              {/* Currency */}
              <TextField
                fullWidth
                size="small"
                label="Currency"
                value={filters.currency}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, currency: e.target.value }))
                }
                sx={{ mb: 2 }}
              />

              {/* Buttons */}
              <Button
                fullWidth
                variant="contained"
                onClick={fetchTree}
                disabled={loadingData}
              >
                {loadingData ? "Loading..." : "Apply Filters"}
              </Button>

              <Button
                fullWidth
                color="secondary"
                sx={{ mt: 1 }}
                onClick={() =>
                  setFilters({
                    statementVersion: "",
                    statementType: "",
                    endPeriodMonth: "",
                    endPeriodYear: "",
                    compMonth: "",
                    compYear: "",
                    currency: "",
                  })
                }
              >
                Reset Filters
              </Button>
            </Paper>
          </Grid>

          {/* ---------------- TREE PANEL ---------------- */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2, height: "100%", overflow: "auto" }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1 }} />,
                }}
                sx={{ mb: 1.5 }}
              />

              {loadingData ? (
                <Stack alignItems="center" sx={{ py: 4 }}>
                  <CircularProgress />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Loading…
                  </Typography>
                </Stack>
              ) : (
                <SimpleTreeView
                  expandedItems={expandedIds}
                  onExpandedItemsChange={(_, ids) => setExpandedIds(ids)}
                  selectedItems={selectedId ? [selectedId] : []}
                  onSelectedItemsChange={(_, ids) =>
                    setSelectedId(Array.isArray(ids) ? ids[0] : ids)
                  }
                  sx={{
                    "& .MuiTreeItem-content": { py: 0.25 },
                  }}
                >
                  {(query ? filtered.data : dataTree).map((node) => (
                    <RenderItem
                      key={node.id}
                      node={node}
                      selectedId={selectedId}
                      hoveredId={hoveredId}
                      setHoveredId={setHoveredId}
                    />
                  ))}
                </SimpleTreeView>
              )}
            </Paper>
          </Grid>

          {/* ---------------- RIGHT PANEL ---------------- */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 2 }}>

              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1 }}
              >
                <Typography fontWeight={600}>Actions</Typography>

                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={scope}
                  onChange={(_, v) => v && setScope(v)}
                >
                  <ToggleButton value="node">Current Node</ToggleButton>
                  <ToggleButton value="subtree">Subtree</ToggleButton>
                </ToggleButtonGroup>
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Button
                  variant="contained"
                  disabled={!selectedNode || loadingAction}
                  onClick={handleSummarize}
                >
                  Summarize
                </Button>

                <Button
                  variant="outlined"
                  disabled={!selectedNode}
                  onClick={handleCountColumns}
                >
                  Count Columns
                </Button>
              </Stack>

              {/* Selected Node Payload */}
              <Typography variant="body2">Selected Node Payload:</Typography>

              <Paper sx={{ p: 1.5, mb: 2 }}>
                {selectedNode ? (
                  <pre style={{ fontSize: 12 }}>
                    {JSON.stringify(flattenPayload(selectedNode), null, 2)}
                  </pre>
                ) : (
                  <Typography variant="caption">(none)</Typography>
                )}
              </Paper>

              {error && <Alert severity="error">{error}</Alert>}

              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 2 }}>
                <Tab value="result" label="Result" />
                <Tab value="json" label="JSON" />
                <Tab value="table" label="Preview Table" />
                <Tab value="chart" label="Chart" />
              </Tabs>

              {/* RESULT */}
              {tab === "result" && (
                <Paper sx={{ p: 2, bgcolor: alpha(theme.palette.info.main, 0.05) }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>
                      {summary || "(No summary yet)"}
                    </Typography>

                    {summary && (
                      <IconButton
                        onClick={() => {
                          navigator.clipboard.writeText(summary);
                          setSnack("Copied!");
                        }}
                      >
                        <ContentCopyIcon />
                      </IconButton>
                    )}
                  </Stack>
                </Paper>
              )}

              {/* JSON */}
              {tab === "json" && (
                <Paper sx={{ p: 2 }}>
                  <pre style={{ fontSize: 12 }}>
                    {JSON.stringify(previewRecords, null, 2)}
                  </pre>
                </Paper>
              )}

              {/* TABLE */}
              {tab === "table" && (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {tableColumns.map((col) => (
                          <TableCell key={col} sx={{ fontWeight: 700 }}>
                            {col}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {previewRecords.map((row) => (
                        <TableRow key={row.id}>
                          {tableColumns.map((col) => (
                            <TableCell key={col}>
                              {String(row[col] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* CHART */}
              {tab === "chart" && (
                <Box sx={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <RTooltip />
                      <Bar
                        dataKey="diff"
                        fill="#4caf50"
                        minPointSize={5}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Card>

      <Snackbar
        open={!!snack}
        autoHideDuration={2000}
        onClose={() => setSnack("")}
        message={snack}
        action={
          <IconButton onClick={() => setSnack("")}>
            <CloseIcon />
          </IconButton>
        }
      />
    </Box>
  );
}
