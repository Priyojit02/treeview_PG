// --- robust number parser: removes commas, currency symbols, parentheses
const parseNumber = (v) => {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();

  // handle parentheses negative like (25,000)
  const paren = s.match(/^\s*\((.*)\)\s*$/);
  if (paren) s = "-" + paren[1];

  // remove currency symbols, non-numeric except dot and minus
  // keep minus and dot and digits
  const cleaned = s.replace(/[^0-9.-]+/g, "");

  // If cleaned is empty, return 0
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;

  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const fmtNumber = (n) => {
  try {
    return new Intl.NumberFormat().format(n);
  } catch {
    return String(n);
  }
};

const transformFromBackend = (records = []) => {
  const walk = (r) => {
    const amountStr = fmtAmount(r.ReportingPeriodAmount);
    const compStr = fmtAmount(r.ComparisonPeriodAmount);
    const amountNum = parseNumber(amountStr);
    const comparisonNum = parseNumber(compStr);

    return {
      id: r.HierarchyNode,
      kind: mapNodeType(r.NodeType),
      name: bestName(r),
      code: r.FinancialStatementItem,
      itemText: r.FinancialStatementItemText,
      account: r.OperativeGLAccount,
      accountName: r.OperativeGLAccountName,
      amount: amountStr,
      amountNum,
      comparison: compStr,
      comparisonNum,
      diffAbs: fmtAmount(r.AbsoluteDifferenceAmount),
      diffPct: fmtAmount(r.RelativeDifferencePercent),
      currency: r.Currency,
      level: r.FinStatementHierarchyLevelVal,
      children: (r.Children || []).map(walk),
    };
  };
  return records.map(walk);
};
{node.amount != null && node.amount !== "" && (
  <Typography variant="caption" color="text.secondary">
    {fmtNumber(node.amountNum)}{node.currency ? ` ${node.currency}` : ""}
  </Typography>
)}
{tab === "chart" && (
  <Paper sx={{ mt: 2, height: 260 }}>
    <ResponsiveContainer>
      <BarChart
        data={preview.map((r) => ({
          name: r.name,
          diff: (r.amountNum || 0) - (r.comparisonNum || 0),
          amountNum: r.amountNum || 0,
          comparisonNum: r.comparisonNum || 0,
          id: r.id,
        }))}
        layout="vertical"
        margin={{ top: 6, right: 12, left: 12, bottom: 6 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtNumber(v)} />
        <YAxis type="category" dataKey="name" width={140} />
        <ReTooltip formatter={(v) => fmtNumber(v)} />
        {/* zero reference line so negatives extend left */}
        <ReferenceLine x={0} stroke="#666" strokeWidth={1} />
        <Bar dataKey="diff" barSize={14}>
          {preview.map((row, i) => {
            const d = (row.amountNum || 0) - (row.comparisonNum || 0);
            return <Cell key={i} fill={d >= 0 ? "#4caf50" : "#f44336"} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </Paper>
)}
