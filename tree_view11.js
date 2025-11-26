const parseSAPNumber = (s) => {
  if (s === null || s === undefined || s === "") return 0;
  const str = String(s).trim();

  // parentheses format => negative
  if (/^\(.*\)$/.test(str)) {
    const cleaned = str.replace(/[(),]/g, "");
    return -Number(cleaned);
  }

  // general cleanup (remove commas, currency)
  const cleaned = str.replace(/[^0-9.-]/g, "");
  return Number(cleaned) || 0;
};
const transformFromBackend = (records = []) => {
  const walk = (r) => {
    const amountNum = parseSAPNumber(r.ReportingPeriodAmount);
    const comparisonNum = parseSAPNumber(r.ComparisonPeriodAmount);
    const diffNum = amountNum - comparisonNum;

    return {
      id: r.HierarchyNode,
      kind: mapNodeType(r.NodeType),
      name: bestName(r),

      code: r.FinancialStatementItem,
      itemText: r.FinancialStatementItemText,
      account: r.OperativeGLAccount,
      accountName: r.OperativeGLAccountName,

      amount: r.ReportingPeriodAmount,
      amountNum,
      comparison: r.ComparisonPeriodAmount,
      comparisonNum,

      diffAbs: r.AbsoluteDifferenceAmount,
      diffPct: r.RelativeDifferencePercent,
      diffNum,

      currency: r.Currency,
      level: r.FinStatementHierarchyLevelVal,

      children: (r.Children || []).map(walk),
    };
  };

  return records.map(walk);
};

{/* CHART */}
{tab === "chart" && (
  <Paper variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
    {previewRecords.length === 0 ? (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        No data to plot. Select a node to preview its subtree.
      </Typography>
    ) : (
      <Box sx={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart
            data={previewRecords.map((r) => ({
              name: r.name,
              diff: Number(r.amount || 0) - Number(r.comparison || 0),
            }))}
            layout="vertical"
            margin={{ top: 10, right: 20, left: 40, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" />

            {/* Always start from zero */}
            <XAxis
              type="number"
              domain={[0, 'dataMax']}   // <-- THIS MAKES NEGATIVE START FROM 0
            />
            <YAxis type="category" dataKey="name" width={160} />

            {/* Zero line */}
            <ReferenceLine x={0} stroke="#444" />

            <ReTooltip formatter={(v) => v.toLocaleString()} />

            <Bar dataKey="diff" barSize={14}>
              {previewRecords.map((r, i) => {
                const diff = Number(r.amount || 0) - Number(r.comparison || 0);
                return (
                  <Cell
                    key={i}
                    fill={diff >= 0 ? "#4caf50" : "#f44336"} // green / red
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    )}
  </Paper>
)}
