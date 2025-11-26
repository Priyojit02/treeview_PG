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
import { SimpleTreeView, TreeItem } from "@mui/x-tree-view";

// small helper to build querystring
const qsFrom = (obj) => new URLSearchParams(Object.entries(obj).filter(([k,v])=>v!=="" && v!=null)).toString();

// API config (adjust if needed)
const API_BASE = "http://127.0.0.1:8000";
const API_PATH_TREE = "/financial-statements"; // backend route returns { records, odata_url }
const API_PATH_LLM = "/summarize_tree";

// utils from your existing code (trimmed)
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

function RenderItem({ node, hoveredId, setHoveredId, selectedId }) {
  const theme = useTheme();
  const kids = node.children || [];
  const isHovered = hoveredId === node.id;
  const isSelected = selectedId === node.id;

  const iconFor = (kind) => {
    if (kind === "root") return <BusinessIcon fontSize="small" />;
    if (kind === "group") return <PeopleIcon fontSize="small" />;
    return <PersonIcon fontSize="small" />;
  };

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

export default function App() {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));

  // UI state
  const [query, setQuery] = React.useState("");
  const [expandedIds, setExpandedIds] = React.useState([]);
  const [dataTree, setDataTree] = React.useState([]);
  const [hoveredId, setHoveredId] = React.useState(null);
  const [selectedId, setSelectedId] = React.useState(null);
  const [loadingData, setLoadingData] = React.useState(true);
  const [loadingAction, setLoadingAction] = React.useState(false);
  const [tab, setTab] = React.useState("result");
  const [snack, setSnack] = React.useState("");
  const [error, setError] = React.useState("");

  // filters (frontend -> backend friendly fields)
  const [filters, setFilters] = React.useState({
    P_KTOPL: "", // company code
    P_RLDNR: "", // ledger
    P_VERSN: "", // statement version
    P_BILABTYP: "1", // fixed as requested
    P_XKTOP2: "", // empty
    endYear: "",
    endMonth: "",
    compYear: "",
    compMonth: "",
    P_CURTP: "", // user-entered currency code (free text)
  });

  // store backend odata url for copy/open
  const [odataUrl, setOdataUrl] = React.useState("");

  const resultsRef = React.useRef(null);

  // helper to build query and call backend
  const fetchTree = React.useCallback(async () => {
    setLoadingData(true);
    setError("");
    try {
      // build query params - pass friendly endYear/endMonth and compYear/compMonth
      const params = {
        P_KTOPL: filters.P_KTOPL || undefined,
        P_RLDNR: filters.P_RLDNR || undefined,
        P_VERSN: filters.P_VERSN || undefined,
        P_BILABTYP: filters.P_BILABTYP || undefined,
        P_XKTOP2: filters.P_XKTOP2 || undefined,
        endYear: filters.endYear || undefined,
        endMonth: filters.endMonth || undefined,
        compYear: filters.compYear || undefined,
        compMonth: filters.compMonth || undefined,
        P_CURTP: filters.P_CURTP || undefined,
        sap_client: "100",
      };

      const qs = qsFrom(params);
      const url = `${API_BASE}${API_PATH_TREE}${qs ? `?${qs}` : ""}`;

      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const json = await res.json();

      const raw = json.records || json.data || json || [];
      const transformed = transformFromBackend(raw);
      setDataTree(transformed);
      setExpandedIds(transformed.map((n) => String(n.id)));

      // save backend odata_url for copying / opening (backend includes it)
      if (json.odata_url) setOdataUrl(json.odata_url);
      else setOdataUrl("");
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoadingData(false);
    }
  }, [filters]);

  React.useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  React.useEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const expandAll = () => setExpandedIds(flattenIds(dataTree));
  const collapseAll = () => setExpandedIds([]);
  const reset = () => {
    setQuery("");
    setDataTree([]);
    setSelectedId(null);
    setOdataUrl("");
    setFilters({ P_KTOPL: "", P_RLDNR: "", P_VERSN: "", P_BILABTYP: "1", P_XKTOP2: "", endYear: "", endMonth: "", compYear: "", compMonth: "", P_CURTP: "" });
    fetchTree();
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

  // minimal flattenIds util used above
  function flattenIds(nodes) {
    const all = [];
    const walk = (n) => {
      if (!n) return;
      all.push(String(n.id));
      (n.children || []).forEach(walk);
    };
    (nodes || []).forEach(walk);
    return all;
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", p: { xs: 1.5, sm: 2, md: 4 }, bgcolor: "#f7f7fb" }}>
      <Card sx={{ width: "100%", maxWidth: { xs: 540, sm: 1100, md: 1320 }, borderRadius: 4, boxShadow: 6 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant={isSmall ? "h6" : "h5"} gutterBottom>Financial Statement Tree — SAP View + Actions</Typography>
          <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>Left: SAP hierarchy. Right: filters/actions. Select a node to enable actions.</Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6} lg={5}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} alignItems={{ xs: "stretch", sm: "center" }} sx={{ mb: 1.5 }}>
                <TextField size="small" placeholder={loadingData ? "Loading from backend…" : "Search (item/account/name)…"} value={query} onChange={(e)=>setQuery(e.target.value)} InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, opacity: 0.7 }} /> }} sx={{ flex: 1 }} disabled={loadingData} />
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" startIcon={<UnfoldMoreIcon />} onClick={expandAll} disabled={loadingData}>Expand all</Button>
                  <Button variant="outlined" startIcon={<UnfoldLessIcon />} onClick={collapseAll} disabled={loadingData}>Collapse all</Button>
                  <Button variant="contained" onClick={reset} disabled={loadingData}>Reset</Button>
                </Stack>
              </Stack>

              <Divider sx={{ mb: 2 }} />

              <Box sx={{ maxHeight: { xs: 360, sm: 520, md: 620 }, overflowY: "auto", px: 0.5, bgcolor: alpha(theme.palette.primary.light, 0.02), borderRadius: 2 }}>
                {loadingData ? (
                  <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
                    <CircularProgress />
                    <Typography variant="body2" sx={{ mt: 1.5, color: "text.secondary" }}>Fetching from backend…</Typography>
                  </Stack>
                ) : (
                  <SimpleTreeView slots={{ collapseIcon: ExpandMoreIcon, expandIcon: ChevronRightIcon }} expandedItems={expandedIds} onExpandedItemsChange={(_, ids)=>setExpandedIds(ids.map(String))} selectionMode="single" selectedItems={selectedId ? [String(selectedId)] : []} onSelectedItemsChange={(_, ids)=>{ const id = Array.isArray(ids) ? ids[0] : ids; setSelectedId(id ?? null); }} sx={{ "& .MuiTreeItem-content": { py: 0.25 } }}>
                    {transformFromBackend(dataTree).map((node)=> (
                      <RenderItem key={node.id} node={node} hoveredId={hoveredId} setHoveredId={setHoveredId} selectedId={selectedId} />
                    ))}
                  </SimpleTreeView>
                )}
              </Box>
            </Grid>

            {/* RIGHT: Filters, Actions & Results */}
            <Grid item xs={12} md={6} lg={7}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: "100%" }}>
                {/* Filters row */}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <TextField size="small" label="Company code (P_KTOPL)" value={filters.P_KTOPL} onChange={(e)=>setFilters(s=>({...s,P_KTOPL:e.target.value}))} sx={{ minWidth: 140 }} />

                  <TextField size="small" label="Ledger (P_RLDNR)" value={filters.P_RLDNR} onChange={(e)=>setFilters(s=>({...s,P_RLDNR:e.target.value}))} sx={{ minWidth: 140 }} />

                  <TextField size="small" label="Statement version (P_VERSN)" value={filters.P_VERSN} onChange={(e)=>setFilters(s=>({...s,P_VERSN:e.target.value}))} sx={{ minWidth: 160 }} />

                  <TextField size="small" label="End month (1-12)" value={filters.endMonth} onChange={(e)=>setFilters(s=>({...s,endMonth:e.target.value}))} sx={{ minWidth: 110 }} />

                  <TextField size="small" label="End year (YYYY)" value={filters.endYear} onChange={(e)=>setFilters(s=>({...s,endYear:e.target.value}))} sx={{ minWidth: 100 }} />

                  <TextField size="small" label="Comparison month" value={filters.compMonth} onChange={(e)=>setFilters(s=>({...s,compMonth:e.target.value}))} sx={{ minWidth: 110 }} />

                  <TextField size="small" label="Comparison year" value={filters.compYear} onChange={(e)=>setFilters(s=>({...s,compYear:e.target.value}))} sx={{ minWidth: 100 }} />

                  {/* free-text currency input per your request (no dropdown) */}
                  <TextField size="small" label="Currency code (P_CURTP)" value={filters.P_CURTP} onChange={(e)=>setFilters(s=>({...s,P_CURTP:e.target.value}))} sx={{ minWidth: 120 }} />

                  <Button variant="outlined" onClick={fetchTree} sx={{ ml: "auto" }}>Apply filters</Button>

                  {/* copy & open OData URL */}
                  {odataUrl && (
                    <>
                      <Button variant="text" size="small" onClick={()=>{navigator.clipboard.writeText(odataUrl); setSnack('OData URL copied');}} sx={{ ml: 1 }}>Copy OData URL</Button>
                      <Button variant="text" size="small" onClick={()=>window.open(odataUrl,'_blank')}>Open OData URL</Button>
                    </>
                  )}
                </Stack>

                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1">Actions</Typography>
                  <ToggleButtonGroup value={tab} exclusive onChange={(_, v)=> v && setTab(v)} size="small" color="primary">
                    <ToggleButton value="result">Result</ToggleButton>
                    <ToggleButton value="json">JSON</ToggleButton>
                    <ToggleButton value="table">Preview Table</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>

                <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>{selectedNode ? "Selected row payload:" : "Click a row on the left to enable actions."}</Typography>

                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "background.default", mb: 2 }}>
                  {selectedNode ? (
                    <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(selectedNode, null, 2)}</pre>
                  ) : (
                    <Typography variant="body2" sx={{ opacity: 0.7 }}>(no selection)</Typography>
                  )}
                </Paper>

                {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

                {/* Tabs content */}
                {tab === "result" && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.info.light, 0.05) }}>
                    <Typography variant="body2">Use the controls above to fetch data. When the backend returns an OData URL it becomes available for copying/opening.</Typography>
                  </Paper>
                )}

                {tab === "json" && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "background.default" }}>
                    <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(dataTree, null, 2)}</pre>
                  </Paper>
                )}

                {tab === "table" && (
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table sx={{ tableLayout: 'auto' }} size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Currency</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dataTree.map((row)=> (
                          <TableRow key={row.id}>
                            <TableCell>{row.name}</TableCell>
                            <TableCell>{row.amount}</TableCell>
                            <TableCell>{row.currency}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Snackbar open={!!snack} autoHideDuration={2000} onClose={()=>setSnack("")} message={snack} action={<IconButton size="small" color="inherit" onClick={()=>setSnack("")}> <CloseIcon fontSize="small" /> </IconButton>} />
    </Box>
  );
}
